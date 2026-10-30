import "server-only";
import { DateTime } from "luxon";
import { query, queryOne } from "../db";
import { syncHabitNotifications, cancelRefNotifications } from "../scheduler";
import { addDays, formatRecurrence, formatTime, habitRecurrence, occursOn, todayIn } from "../time";

export interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  days: number[];
  habit_time: string | null;
  target_minutes: number | null;
  remind: boolean;
  active: boolean;
  suggestion_key: string | null;
  created_at: Date;
}

export interface HabitView extends HabitRow {
  schedule: string;
  dueToday: boolean;
  doneToday: boolean;
  streak: number;
  last7: { date: string; scheduled: boolean; done: boolean }[];
}

export const HABIT_SUGGESTIONS = [
  { key: "exercise", name: "Hacer ejercicio", emoji: "🏃", days: [1, 3, 5], habit_time: "08:00", target_minutes: 30 },
  { key: "reading", name: "Leer", emoji: "📖", days: [], habit_time: "21:30", target_minutes: 20 },
] as const;

export interface HabitInput {
  name: string;
  emoji?: string | null;
  days?: number[];
  habit_time?: string | null;
  target_minutes?: number | null;
  remind?: boolean;
  suggestion_key?: string | null;
}

function cleanDays(days: number[] | undefined) {
  const d = [...new Set((days ?? []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7))].sort();
  return d.length === 7 ? [] : d;
}

export async function createHabit(userId: string, input: HabitInput) {
  const row = (await queryOne<HabitRow>(
    `insert into jarvis.habits (user_id, name, emoji, days, habit_time, target_minutes, remind, suggestion_key)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) returning *`,
    [
      userId,
      input.name.trim(),
      input.emoji ?? null,
      JSON.stringify(cleanDays(input.days)),
      input.habit_time ?? null,
      input.target_minutes ?? null,
      input.remind ?? true,
      input.suggestion_key ?? null,
    ],
  ))!;
  await syncHabitNotifications(row.id);
  return row;
}

export async function getHabit(userId: string, id: string) {
  return queryOne<HabitRow>("select * from jarvis.habits where user_id = $1 and id = $2", [userId, id]);
}

export async function updateHabit(userId: string, id: string, patch: Partial<HabitInput> & { active?: boolean }) {
  const h = await getHabit(userId, id);
  if (!h) return null;
  const n = { ...h, ...patch, days: patch.days ? cleanDays(patch.days) : h.days };
  const row = await queryOne<HabitRow>(
    `update jarvis.habits set name = $3, emoji = $4, days = $5::jsonb, habit_time = $6, target_minutes = $7,
       remind = $8, active = $9, updated_at = now() where user_id = $1 and id = $2 returning *`,
    [userId, id, n.name.trim(), n.emoji, JSON.stringify(n.days), n.habit_time, n.target_minutes, n.remind, n.active],
  );
  await syncHabitNotifications(id);
  return row;
}

export async function deleteHabit(userId: string, id: string) {
  const rows = await query("delete from jarvis.habits where user_id = $1 and id = $2 returning id", [userId, id]);
  if (rows.length) await cancelRefNotifications(id);
  return rows.length > 0;
}

/** Marca (o desmarca) el hábito en una fecha. No toca las repeticiones futuras. */
export async function setHabitLog(userId: string, habitId: string, date: string, done: boolean) {
  const h = await getHabit(userId, habitId);
  if (!h) return null;
  if (done) {
    await query(
      `insert into jarvis.habit_logs (user_id, habit_id, log_date) values ($1, $2, $3::date)
       on conflict (habit_id, log_date) do nothing`,
      [userId, habitId, date],
    );
  } else {
    await query("delete from jarvis.habit_logs where user_id = $1 and habit_id = $2 and log_date = $3::date", [
      userId,
      habitId,
      date,
    ]);
  }
  await syncHabitNotifications(habitId);
  return h;
}

export function describeHabit(h: Pick<HabitRow, "days" | "habit_time" | "target_minutes">) {
  const parts = [formatRecurrence(habitRecurrence(h.days))];
  if (h.habit_time) parts.push(`a las ${formatTime(h.habit_time)}`);
  if (h.target_minutes) parts.push(`· ${h.target_minutes} min`);
  return parts.join(" ");
}

export async function listHabits(userId: string, tz: string, opts: { includeInactive?: boolean } = {}): Promise<HabitView[]> {
  const habits = await query<HabitRow>(
    `select * from jarvis.habits where user_id = $1 ${opts.includeInactive ? "" : "and active"} order by habit_time nulls last, created_at`,
    [userId],
  );
  if (!habits.length) return [];
  const today = todayIn(tz);
  const from = addDays(today, -60);
  const logs = await query<{ habit_id: string; log_date: string }>(
    "select habit_id, log_date from jarvis.habit_logs where user_id = $1 and log_date >= $2::date",
    [userId, from],
  );
  const done = new Set(logs.map((l) => `${l.habit_id}:${l.log_date}`));
  return habits.map((h) => {
    const rec = habitRecurrence(h.days);
    const isDone = (d: string) => done.has(`${h.id}:${d}`);
    // Los días anteriores a crear el hábito no cuentan como "no cumplidos".
    const since = DateTime.fromJSDate(new Date(h.created_at)).setZone(tz).toISODate()!;
    const scheduled = (d: string) => d >= since && occursOn(rec, d);
    // Racha: días programados seguidos cumplidos (hoy cuenta solo si ya está hecho).
    let streak = 0;
    let d = isDone(today) || !occursOn(rec, today) ? today : addDays(today, -1);
    for (let i = 0; i < 60 && d >= since; i++, d = addDays(d, -1)) {
      if (!occursOn(rec, d)) continue;
      if (isDone(d)) streak++;
      else break;
    }
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { date: day, scheduled: scheduled(day), done: isDone(day) };
    });
    return {
      ...h,
      schedule: describeHabit(h),
      dueToday: occursOn(rec, today),
      doneToday: isDone(today),
      streak,
      last7,
    };
  });
}
