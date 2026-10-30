import "server-only";
import { DateTime } from "luxon";
import { query, queryOne } from "./db";
import { DEFAULT_TZ } from "./env";
import { sendToUser } from "./push";
import {
  normalizeRecurrence,
  formatTime,
  habitRecurrence,
  nextOccurrenceDate,
  nextTaskFire,
  toInstant,
  todayIn,
  addDays,
} from "./time";

// ─────────────────────────────────────────────────────────────────────────────
//  Programador de avisos
//
//  1. Cada vez que cambia una tarea, un hábito o el resumen diario, "sync*"
//     calcula qué aviso debería existir y ajusta la cola (tabla notifications):
//     crea el nuevo, actualiza el pendiente o cancela los que ya no aplican.
//  2. Cada minuto, el programador del servidor llama a dispatchDue(), que toma
//     los avisos vencidos, los envía por Web Push y agenda la siguiente
//     repetición. Nada de esto depende del navegador ni de que la app esté abierta.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 4;
const RETRY_MINUTES = [1, 5, 15];
const STALE_AFTER_MS = 6 * 3600_000; // un aviso con más de 6 h de retraso ya no se envía
const LOCK_TIMEOUT_MIN = 5;

interface Desired {
  key: string;
  occurrence: string;
  fire_at: Date;
  title: string;
  body: string;
  url: string;
}

async function tzFor(userId: string) {
  const p = await queryOne<{ timezone: string }>("select timezone from jarvis.profiles where user_id = $1", [userId]);
  return p?.timezone ?? DEFAULT_TZ;
}

/** Ajusta la cola para que los avisos pendientes de `refId` sean exactamente `desired`. */
async function reconcile(userId: string, kind: "task" | "habit" | "summary", refId: string | null, desired: Desired[]) {
  const keys = desired.map((d) => d.key);
  // Cancela los pendientes que ya no corresponden (p. ej. cambiaste la hora).
  await query(
    `update jarvis.notifications set status = 'canceled', updated_at = now()
     where user_id = $1 and kind = $2 and ref_id is not distinct from $3::uuid and status = 'pending'
       and not (dedupe_key = any(select jsonb_array_elements_text($4::jsonb)))`,
    [userId, kind, refId, JSON.stringify(keys)],
  );
  for (const d of desired) {
    // dedupe_key único: si ese aviso de esa repetición ya se envió, no se repite.
    await query(
      `insert into jarvis.notifications (user_id, kind, ref_id, occurrence, dedupe_key, fire_at, title, body, url)
       values ($1, $2, $3::uuid, $4, $5, $6::timestamptz, $7, $8, $9)
       on conflict (dedupe_key) do update set
         fire_at = excluded.fire_at, title = excluded.title, body = excluded.body, url = excluded.url,
         status = 'pending', attempts = case when jarvis.notifications.status = 'canceled' then 0 else jarvis.notifications.attempts end,
         next_attempt_at = null, last_error = null, updated_at = now()
       where jarvis.notifications.status in ('pending', 'canceled')`,
      [userId, kind, refId, d.occurrence, d.key, d.fire_at.toISOString(), d.title, d.body, d.url],
    );
  }
}

/** ¿Ese aviso (esa repetición) ya se procesó? Entonces toca la siguiente. */
async function alreadyHandled(key: string) {
  return !!(await queryOne(
    "select 1 from jarvis.notifications where dedupe_key = $1 and status not in ('pending', 'canceled')",
    [key],
  ));
}

export async function cancelRefNotifications(refId: string) {
  await query(
    "update jarvis.notifications set status = 'canceled', updated_at = now() where ref_id = $1 and status = 'pending'",
    [refId],
  );
}

interface TaskForSync {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  recurrence: unknown;
  remind: boolean;
  snoozed_until: Date | null;
}

export async function desiredForTask(t: TaskForSync, tz: string, now = new Date()): Promise<Desired[]> {
  if (t.status !== "pending" || !t.remind) return [];
  const out: Desired[] = [];
  const url = `/tareas/${t.id}?aviso=1`;
  let fire = nextTaskFire(t, tz, now);
  for (let i = 0; fire && i < 10 && (await alreadyHandled(`task:${t.id}:${fire.date}T${t.due_time}`)); i++) {
    fire = normalizeRecurrence(t.recurrence) ? nextTaskFire(t, tz, new Date(fire.at.getTime() + 61_000)) : null;
  }
  if (fire) {
    const occurrence = `${fire.date}T${t.due_time}`;
    out.push({
      key: `task:${t.id}:${occurrence}`,
      occurrence,
      fire_at: fire.at,
      title: t.title,
      body: `${formatTime(t.due_time!)}${t.notes ? " · " + t.notes.slice(0, 80) : ""} — toca para completar o posponer`,
      url,
    });
  }
  if (t.snoozed_until && new Date(t.snoozed_until).getTime() > now.getTime() - 60_000) {
    const iso = new Date(t.snoozed_until).toISOString();
    if (!(await alreadyHandled(`task:${t.id}:snooze:${iso}`))) out.push({ key: `task:${t.id}:snooze:${iso}`, occurrence: `snooze:${iso}`, fire_at: new Date(t.snoozed_until), title: t.title, body: "Recordatorio pospuesto — toca para abrir", url });
  }
  return out;
}

export async function syncTaskNotifications(taskId: string, now = new Date()) {
  const t = await queryOne<TaskForSync>("select * from jarvis.tasks where id = $1", [taskId]);
  if (!t) return cancelRefNotifications(taskId);
  const tz = await tzFor(t.user_id);
  await reconcile(t.user_id, "task", t.id, await desiredForTask(t, tz, now));
}

interface HabitForSync {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  days: number[];
  habit_time: string | null;
  target_minutes: number | null;
  remind: boolean;
  active: boolean;
}

export async function desiredForHabit(h: HabitForSync, tz: string, now = new Date()): Promise<Desired[]> {
  if (!h.active || !h.remind || !h.habit_time) return [];
  const rec = habitRecurrence(h.days);
  const logs = await query<{ log_date: string }>(
    "select log_date from jarvis.habit_logs where habit_id = $1 and log_date >= $2::date",
    [h.id, addDays(todayIn(tz, now), -1)],
  );
  const done = new Set(logs.map((l) => l.log_date));
  let d = nextOccurrenceDate(rec, todayIn(tz, now));
  for (let i = 0; d && i < 10; i++) {
    const at = toInstant(d, h.habit_time, tz);
    // Si ya lo hiciste hoy, el aviso de hoy no hace falta: pasa al siguiente.
    const occurrence = `${d}T${h.habit_time}`;
    if (at.getTime() > now.getTime() - 60_000 && !done.has(d) && !(await alreadyHandled(`habit:${h.id}:${occurrence}`))) {
      const extra = h.target_minutes ? `${h.target_minutes} minutos. ` : "";
      return [
        {
          key: `habit:${h.id}:${occurrence}`,
          occurrence,
          fire_at: at,
          title: `${h.emoji ? h.emoji + " " : ""}${h.name}`,
          body: `${extra}Un paso pequeño cuenta. Toca para marcarlo.`,
          url: `/habitos?h=${h.id}`,
        },
      ];
    }
    d = nextOccurrenceDate(rec, d, true);
  }
  return [];
}

export async function syncHabitNotifications(habitId: string, now = new Date()) {
  const h = await queryOne<HabitForSync>("select * from jarvis.habits where id = $1", [habitId]);
  if (!h) return cancelRefNotifications(habitId);
  const tz = await tzFor(h.user_id);
  await reconcile(h.user_id, "habit", h.id, await desiredForHabit(h, tz, now));
}

export async function syncSummary(userId: string, now = new Date()) {
  const p = await queryOne<{ timezone: string; summary_enabled: boolean; summary_time: string }>(
    "select timezone, summary_enabled, summary_time from jarvis.profiles where user_id = $1",
    [userId],
  );
  if (!p || !p.summary_enabled) return reconcile(userId, "summary", null, []);
  let d = todayIn(p.timezone, now);
  let at = toInstant(d, p.summary_time, p.timezone);
  if (at.getTime() <= now.getTime() - 60_000 || (await alreadyHandled(`summary:${userId}:${d}`))) {
    d = addDays(d, 1);
    at = toInstant(d, p.summary_time, p.timezone);
  }
  await reconcile(userId, "summary", null, [
    {
      key: `summary:${userId}:${d}`,
      occurrence: d,
      fire_at: at,
      title: "Tu resumen del día",
      body: "Toca para ver tu día.", // el texto real se arma al enviarlo, con tus datos de ese momento
      url: "/hoy",
    },
  ]);
}

// ── Resumen diario con datos reales ─────────────────────────────────────────

export async function buildDailySummary(userId: string, tz: string, now = new Date()) {
  const today = todayIn(tz, now);
  const tasks = await query<{ title: string; due_date: string; due_time: string | null }>(
    `select title, due_date, due_time from jarvis.tasks
     where user_id = $1 and status = 'pending' and due_date <= $2::date
     order by due_date, due_time nulls last, coalesce(priority, 9)`,
    [userId, today],
  );
  const overdue = tasks.filter((t) => t.due_date < today).length;
  const todays = tasks.filter((t) => t.due_date === today);
  const habits = await query<{ name: string; days: number[] }>(
    "select name, days from jarvis.habits where user_id = $1 and active",
    [userId],
  );
  const wd = DateTime.fromISO(today).weekday;
  const habitsToday = habits.filter((h) => !h.days.length || h.days.includes(wd));

  const parts: string[] = [];
  if (todays.length) {
    const first = todays[0];
    parts.push(
      `${todays.length} ${todays.length === 1 ? "tarea" : "tareas"} hoy. Primero: ${first.title}${first.due_time ? ` (${formatTime(first.due_time)})` : ""}.`,
    );
  } else parts.push("Sin tareas con fecha para hoy.");
  if (overdue) parts.push(`${overdue} ${overdue === 1 ? "pendiente atrasado" : "pendientes atrasados"}.`);
  if (habitsToday.length) parts.push(`Hábitos: ${habitsToday.map((h) => h.name).join(", ")}.`);
  return parts.join(" ");
}

// ── Envío ───────────────────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  user_id: string;
  kind: "task" | "habit" | "summary" | "test";
  ref_id: string | null;
  occurrence: string | null;
  fire_at: Date;
  title: string;
  body: string;
  url: string;
  attempts: number;
  receipt_token: string;
}

export interface DispatchReport {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

async function finish(id: string, status: string, error: string | null = null) {
  await query(
    `update jarvis.notifications set status = $2, last_error = $3, locked_at = null,
       sent_at = case when $2 = 'sent' then now() else sent_at end, updated_at = now() where id = $1`,
    [id, status, error],
  );
}

/** ¿Sigue siendo válido este aviso? (por si la tarea cambió justo antes de enviarlo) */
async function stillRelevant(n: NotificationRow): Promise<boolean> {
  if (n.kind === "task" && n.ref_id) {
    const t = await queryOne<{ status: string; remind: boolean }>("select status, remind from jarvis.tasks where id = $1", [n.ref_id]);
    return !!t && t.status === "pending" && t.remind;
  }
  if (n.kind === "habit" && n.ref_id) {
    const h = await queryOne<{ active: boolean; remind: boolean }>("select active, remind from jarvis.habits where id = $1", [n.ref_id]);
    if (!h || !h.active || !h.remind) return false;
    const date = n.occurrence?.slice(0, 10);
    const log = await queryOne("select 1 from jarvis.habit_logs where habit_id = $1 and log_date = $2::date", [n.ref_id, date]);
    return !log; // ya lo hiciste: no hace falta avisar
  }
  return true;
}

export async function sendNotification(n: NotificationRow, now = new Date()): Promise<"sent" | "failed" | "retry" | "skipped"> {
  if (n.kind !== "test" && now.getTime() - new Date(n.fire_at).getTime() > STALE_AFTER_MS) {
    await finish(n.id, "expired", "Llegó tarde (el programador no corrió a tiempo).");
    return "skipped";
  }
  if (!(await stillRelevant(n))) {
    await finish(n.id, "skipped");
    return "skipped";
  }
  let body = n.body;
  if (n.kind === "summary") body = await buildDailySummary(n.user_id, await tzFor(n.user_id), now);
  const res = await sendToUser(n.user_id, { id: n.id, token: n.receipt_token, title: n.title, body, url: n.url, tag: n.id });
  if (res.delivered > 0) {
    await query("update jarvis.notifications set body = $2 where id = $1", [n.id, body]);
    await finish(n.id, "sent", res.error);
    return "sent";
  }
  if (res.transient && n.attempts < MAX_ATTEMPTS) {
    const wait = RETRY_MINUTES[Math.min(n.attempts - 1, RETRY_MINUTES.length - 1)];
    await query(
      `update jarvis.notifications set status = 'pending', locked_at = null, last_error = $2,
         next_attempt_at = now() + ($3::int * interval '1 minute'), updated_at = now() where id = $1`,
      [n.id, res.error, wait],
    );
    return "retry";
  }
  await finish(n.id, "failed", res.error);
  return "failed";
}

/** Lo llama el programador cada minuto. Seguro de ejecutar en paralelo. */
export async function dispatchDue(now = new Date()): Promise<DispatchReport> {
  // Avisos que quedaron "enviándose" por un fallo del servidor: se reintentan.
  await query(
    `update jarvis.notifications set status = 'pending', locked_at = null, updated_at = now()
     where status = 'sending' and locked_at < $1::timestamptz - ($2::int * interval '1 minute')`,
    [now.toISOString(), LOCK_TIMEOUT_MIN],
  );
  // Reclamo atómico: FOR UPDATE SKIP LOCKED evita que dos ejecuciones tomen el mismo aviso.
  const claimed = await query<NotificationRow>(
    `update jarvis.notifications n set status = 'sending', locked_at = now(), attempts = attempts + 1, updated_at = now()
     where n.id in (
       select id from jarvis.notifications
       where status = 'pending' and coalesce(next_attempt_at, fire_at) <= $1::timestamptz
       order by fire_at limit 50 for update skip locked
     ) returning n.*`,
    [now.toISOString()],
  );
  const report: DispatchReport = { claimed: claimed.length, sent: 0, failed: 0, retried: 0, skipped: 0 };
  for (const n of claimed) {
    let r: Awaited<ReturnType<typeof sendNotification>>;
    try {
      r = await sendNotification(n, now);
    } catch (e) {
      await finish(n.id, n.attempts < MAX_ATTEMPTS ? "pending" : "failed", (e as Error).message);
      r = "retry";
    }
    if (r === "sent") report.sent++;
    else if (r === "failed") report.failed++;
    else if (r === "retry") report.retried++;
    else report.skipped++;
    // Agenda la siguiente repetición.
    if (r !== "retry") {
      if (n.kind === "task" && n.ref_id) await syncTaskNotifications(n.ref_id, now);
      if (n.kind === "habit" && n.ref_id) await syncHabitNotifications(n.ref_id, now);
      if (n.kind === "summary") await syncSummary(n.user_id, now);
    }
  }
  await ensureSchedules(now);
  return report;
}

/**
 * Red de seguridad: si algún aviso recurrente se quedó sin agendar (por
 * ejemplo tras un error), lo vuelve a programar.
 */
export async function ensureSchedules(now = new Date()) {
  const tasks = await query<{ id: string }>(
    `select t.id from jarvis.tasks t
     where t.status = 'pending' and t.remind and t.due_time is not null and t.due_date is not null
       and (t.recurrence is not null or t.due_date >= ($1::timestamptz)::date - 1)
       and not exists (select 1 from jarvis.notifications n where n.ref_id = t.id and n.status in ('pending', 'sending'))
     limit 100`,
    [now.toISOString()],
  );
  for (const t of tasks) await syncTaskNotifications(t.id, now);
  const habits = await query<{ id: string }>(
    `select h.id from jarvis.habits h where h.active and h.remind and h.habit_time is not null
       and not exists (select 1 from jarvis.notifications n where n.ref_id = h.id and n.status in ('pending', 'sending'))
     limit 100`,
  );
  for (const h of habits) await syncHabitNotifications(h.id, now);
  const users = await query<{ user_id: string }>(
    `select p.user_id from jarvis.profiles p where p.summary_enabled
       and not exists (select 1 from jarvis.notifications n where n.user_id = p.user_id and n.kind = 'summary' and n.status in ('pending', 'sending'))`,
  );
  for (const u of users) await syncSummary(u.user_id, now);
}

/** Notificación de prueba: se crea y se envía de inmediato. */
export async function sendTestNotification(userId: string) {
  const n = (await queryOne<NotificationRow>(
    `insert into jarvis.notifications (user_id, kind, dedupe_key, fire_at, title, body, url, status, attempts, locked_at)
     values ($1, 'test', 'test:' || gen_random_uuid(), now(), 'Jarvis', 'Notificación de prueba. Si la ves, los avisos funcionan. ✅', '/ajustes', 'sending', 1, now())
     returning *`,
    [userId],
  ))!;
  const result = await sendNotification(n);
  return { id: n.id, result };
}


/** Próximos avisos programados (para la pantalla de inicio). */
export async function upcomingAlerts(userId: string, limit = 5) {
  return query<{ id: string; kind: string; title: string; fire_at: Date; url: string }>(
    `select id, kind, title, fire_at, url from jarvis.notifications
     where user_id = $1 and status = 'pending' order by fire_at limit $2`,
    [userId, limit],
  );
}
