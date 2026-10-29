import "server-only";
import { DateTime } from "luxon";
import { query, queryOne, transaction } from "../db";
import { syncTaskNotifications, cancelRefNotifications } from "../scheduler";
import {
  advanceRecurring,
  formatRecurrence,
  formatWhen,
  nextOccurrenceDate,
  nextTaskFire,
  normalizeRecurrence,
  nowIn,
  todayIn,
  type Recurrence,
} from "../time";

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: number | null;
  status: "pending" | "done";
  recurrence: Recurrence;
  remind: boolean;
  snoozed_until: Date | null;
  idea_id: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskView extends TaskRow {
  when: string;
  repeat: string;
  overdue: boolean;
}

export const PRIORITY_LABEL: Record<number, string> = { 1: "alta", 2: "media", 3: "baja" };

export function viewTask(t: TaskRow, tz: string, now = new Date()): TaskView {
  const rec = normalizeRecurrence(t.recurrence);
  const local = nowIn(tz, now);
  const today = local.toISODate()!;
  const hhmm = local.toFormat("HH:mm");
  const overdue =
    t.status === "pending" &&
    !!t.due_date &&
    (t.due_date < today || (t.due_date === today && !!t.due_time && t.due_time < hhmm));
  return { ...t, recurrence: rec, when: formatWhen(t.due_date, t.due_time, tz, now), repeat: formatRecurrence(rec), overdue };
}

export interface TaskInput {
  title: string;
  notes?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  priority?: number | null;
  recurrence?: Recurrence;
  remind?: boolean;
  idea_id?: string | null;
}

export async function createTask(userId: string, input: TaskInput, tz: string) {
  const rec = normalizeRecurrence(input.recurrence);
  let dueDate = input.due_date ?? null;
  // Una tarea repetitiva empieza en su próxima repetición (hoy, si aún no pasó la hora).
  if (rec) {
    const from = dueDate ?? todayIn(tz);
    dueDate = nextOccurrenceDate(rec, from)!;
    if (!input.due_date && input.due_time) {
      dueDate = nextTaskFire({ due_date: dueDate, due_time: input.due_time, recurrence: rec }, tz)?.date ?? dueDate;
    }
  }
  const row = (await queryOne<TaskRow>(
    `insert into jarvis.tasks (user_id, title, notes, due_date, due_time, priority, recurrence, remind, idea_id)
     values ($1, $2, $3, $4::date, $5, $6, $7::jsonb, $8, $9) returning *`,
    [
      userId,
      input.title.trim(),
      input.notes?.trim() || null,
      dueDate,
      input.due_time ?? null,
      input.priority ?? null,
      rec ? JSON.stringify(rec) : null,
      input.remind ?? true,
      input.idea_id ?? null,
    ],
  ))!;
  await syncTaskNotifications(row.id);
  return row;
}

export async function getTask(userId: string, id: string) {
  return queryOne<TaskRow>("select * from jarvis.tasks where user_id = $1 and id = $2", [userId, id]);
}

export type TaskScope = "today" | "overdue" | "upcoming" | "nodate" | "pending" | "completed";

const ORDER = "order by due_date nulls last, due_time nulls last, coalesce(priority, 9), created_at";

export async function listTasks(userId: string, scope: TaskScope, tz: string, opts: { q?: string | null; limit?: number } = {}) {
  const today = todayIn(tz);
  const params: unknown[] = [userId];
  let where = "user_id = $1 and status = 'pending'";
  if (scope === "today") {
    params.push(today);
    where += ` and due_date = $2::date`;
  } else if (scope === "overdue") {
    params.push(today);
    where += ` and due_date < $2::date`;
  } else if (scope === "upcoming") {
    params.push(today);
    where += ` and due_date > $2::date`;
  } else if (scope === "nodate") {
    where += " and due_date is null";
  } else if (scope === "completed") {
    where = "user_id = $1 and status = 'done'";
  }
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    where += ` and title ilike $${params.length}`;
  }
  params.push(Math.min(opts.limit ?? 200, 500));
  const order = scope === "completed" ? "order by completed_at desc" : ORDER;
  return query<TaskRow>(`select * from jarvis.tasks where ${where} ${order} limit $${params.length}`, params);
}

export async function updateTask(
  userId: string,
  id: string,
  patch: Partial<Pick<TaskRow, "title" | "notes" | "due_date" | "due_time" | "priority" | "remind">> & {
    recurrence?: Recurrence;
  },
) {
  const t = await getTask(userId, id);
  if (!t) return null;
  const next = { ...t, ...patch };
  const rec = "recurrence" in patch ? normalizeRecurrence(patch.recurrence) : normalizeRecurrence(t.recurrence);
  const changedSchedule =
    next.due_date !== t.due_date || next.due_time !== t.due_time || JSON.stringify(rec) !== JSON.stringify(normalizeRecurrence(t.recurrence));
  const row = await queryOne<TaskRow>(
    `update jarvis.tasks set title = $3, notes = $4, due_date = $5::date, due_time = $6, priority = $7,
       recurrence = $8::jsonb, remind = $9, snoozed_until = case when $10 then null else snoozed_until end, updated_at = now()
     where user_id = $1 and id = $2 returning *`,
    [
      userId,
      id,
      next.title.trim(),
      next.notes?.trim() || null,
      next.due_date,
      next.due_time,
      next.priority,
      rec ? JSON.stringify(rec) : null,
      next.remind,
      changedSchedule,
    ],
  );
  await syncTaskNotifications(id);
  return row;
}

/** Completa la tarea. Si es repetitiva, registra esta repetición y avanza a la siguiente. */
export async function completeTask(userId: string, id: string, tz: string) {
  const result = await transaction(async (tx) => {
    const [t] = await tx.query<TaskRow>("select * from jarvis.tasks where user_id = $1 and id = $2 for update", [userId, id]);
    if (!t) return null;
    if (t.status === "done") return { task: t, nextDate: null as string | null, alreadyDone: true };
    await tx.query(
      "insert into jarvis.task_completions (user_id, task_id, title, occurrence_date) values ($1, $2, $3, $4::date)",
      [userId, id, t.title, t.due_date],
    );
    const rec = normalizeRecurrence(t.recurrence);
    if (rec) {
      const nextDate = advanceRecurring(rec, t.due_date ?? todayIn(tz), tz);
      const [row] = await tx.query<TaskRow>(
        `update jarvis.tasks set due_date = $3::date, snoozed_until = null, updated_at = now()
         where user_id = $1 and id = $2 returning *`,
        [userId, id, nextDate],
      );
      return { task: row, nextDate, alreadyDone: false };
    }
    const [row] = await tx.query<TaskRow>(
      `update jarvis.tasks set status = 'done', completed_at = now(), snoozed_until = null, updated_at = now()
       where user_id = $1 and id = $2 returning *`,
      [userId, id],
    );
    return { task: row, nextDate: null, alreadyDone: false };
  });
  if (result) await syncTaskNotifications(id);
  return result;
}

export async function reopenTask(userId: string, id: string) {
  const row = await queryOne<TaskRow>(
    `update jarvis.tasks set status = 'pending', completed_at = null, updated_at = now()
     where user_id = $1 and id = $2 returning *`,
    [userId, id],
  );
  if (row) await syncTaskNotifications(id);
  return row;
}

/**
 * Posponer: una tarea única se mueve a la nueva hora; en una repetitiva solo
 * se pospone el aviso de hoy (la serie no cambia).
 */
export async function snoozeTask(userId: string, id: string, minutes: number, tz: string) {
  const t = await getTask(userId, id);
  if (!t || t.status !== "pending") return null;
  const until = DateTime.now().setZone(tz).plus({ minutes }).startOf("minute");
  if (normalizeRecurrence(t.recurrence)) {
    const row = await queryOne<TaskRow>(
      "update jarvis.tasks set snoozed_until = $3::timestamptz, updated_at = now() where user_id = $1 and id = $2 returning *",
      [userId, id, until.toISO()],
    );
    await syncTaskNotifications(id);
    return { task: row!, until: until.toJSDate() };
  }
  const row = await updateTask(userId, id, { due_date: until.toISODate(), due_time: until.toFormat("HH:mm") });
  return { task: row!, until: until.toJSDate() };
}

export async function deleteTask(userId: string, id: string) {
  const rows = await query("delete from jarvis.tasks where user_id = $1 and id = $2 returning id", [userId, id]);
  if (rows.length) await cancelRefNotifications(id);
  return rows.length > 0;
}

export interface CompletionRow {
  id: string;
  task_id: string;
  title: string;
  occurrence_date: string | null;
  completed_at: Date;
}

export async function completionHistory(userId: string, limit = 100) {
  return query<CompletionRow>(
    "select id, task_id, title, occurrence_date, completed_at from jarvis.task_completions where user_id = $1 order by completed_at desc limit $2",
    [userId, limit],
  );
}
