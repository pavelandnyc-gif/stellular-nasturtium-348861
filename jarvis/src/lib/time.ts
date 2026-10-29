import { DateTime } from "luxon";

// Todo lo relacionado con fechas, horas, repeticiones y zonas horarias.
// Regla de oro: las fechas y horas se guardan como "reloj local" (lo que tú
// dices: "30 de octubre a las 10:00") y solo se convierten a un instante exacto
// usando la zona horaria del perfil en el momento de programar el aviso.
// Así un recordatorio diario de las 8:00 sigue siendo a las 8:00 después del
// cambio de horario de verano.

export type Recurrence = { type: "daily" } | { type: "weekly"; days: number[] } | null;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(d: string) {
  return DATE_RE.test(d) && DateTime.fromISO(d).isValid;
}

export function isValidZone(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

export function nowIn(tz: string, now: Date = new Date()) {
  return DateTime.fromJSDate(now).setZone(tz);
}

export function todayIn(tz: string, now: Date = new Date()) {
  return nowIn(tz, now).toISODate()!;
}

export function addDays(date: string, n: number) {
  return DateTime.fromISO(date).plus({ days: n }).toISODate()!;
}

/** 1 = lunes … 7 = domingo (ISO). */
export function weekday(date: string) {
  return DateTime.fromISO(date).weekday;
}

/** Instante exacto de una fecha+hora local en una zona. Si la hora no existe
 *  (p. ej. 2:30 a. m. el día que se adelanta el reloj), se mueve hacia adelante. */
export function toInstant(date: string, time: string, tz: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: tz }).toJSDate();
}

export function normalizeRecurrence(r: unknown): Recurrence {
  if (!r || typeof r !== "object") return null;
  const o = r as { type?: string; days?: unknown };
  if (o.type === "daily") return { type: "daily" };
  if (o.type === "weekly" && Array.isArray(o.days)) {
    const days = [...new Set(o.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    if (days.length === 7) return { type: "daily" };
    if (days.length) return { type: "weekly", days };
  }
  return null;
}

export function occursOn(rec: Recurrence, date: string) {
  if (!rec) return false;
  if (rec.type === "daily") return true;
  return rec.days.includes(weekday(date));
}

/** Primera fecha >= `from` (o > si `strict`) en la que ocurre la repetición. */
export function nextOccurrenceDate(rec: Recurrence, from: string, strict = false): string | null {
  if (!rec) return null;
  let d = strict ? addDays(from, 1) : from;
  for (let i = 0; i < 8; i++) {
    if (occursOn(rec, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}

/** Hábitos: `days` vacío = todos los días. */
export function habitRecurrence(days: number[]): Recurrence {
  return days.length ? normalizeRecurrence({ type: "weekly", days }) : { type: "daily" };
}

/**
 * Próximo instante (> now) en el que debe sonar el aviso de una tarea.
 * Una tarea única suena en su fecha y hora; una repetitiva, en la siguiente
 * repetición desde su fecha actual que aún no haya pasado.
 */
export function nextTaskFire(
  t: { due_date: string | null; due_time: string | null; recurrence: unknown },
  tz: string,
  now: Date = new Date(),
): { date: string; at: Date } | null {
  if (!t.due_date || !t.due_time) return null;
  const rec = normalizeRecurrence(t.recurrence);
  if (!rec) {
    const at = toInstant(t.due_date, t.due_time, tz);
    // pequeño margen: si se creó "para ahora mismo", se envía en el siguiente minuto
    return at.getTime() > now.getTime() - 60_000 ? { date: t.due_date, at } : null;
  }
  const today = todayIn(tz, now);
  let d: string | null = nextOccurrenceDate(rec, t.due_date >= today ? t.due_date : today);
  for (let i = 0; d && i < 10; i++) {
    const at = toInstant(d, t.due_time, tz);
    if (at.getTime() > now.getTime() - 60_000) return { date: d, at };
    d = nextOccurrenceDate(rec, d, true);
  }
  return null;
}

/**
 * Al completar una repetición: devuelve la fecha de la siguiente. Nunca se
 * pierde la serie; si la tarea estaba atrasada varios días, salta a la próxima
 * repetición desde hoy.
 */
export function advanceRecurring(rec: Recurrence, currentDue: string, tz: string, now: Date = new Date()) {
  const next = nextOccurrenceDate(rec, currentDue, true);
  const today = todayIn(tz, now);
  if (next && next >= today) return next;
  return nextOccurrenceDate(rec, today) ?? today;
}

// ── Formato en español ──────────────────────────────────────────────────────

const DAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "hoy", "mañana", "ayer" o "jueves 30 de octubre" (con año si no es el actual). */
export function formatDate(date: string, tz: string, now: Date = new Date()) {
  const today = todayIn(tz, now);
  if (date === today) return "hoy";
  if (date === addDays(today, 1)) return "mañana";
  if (date === addDays(today, -1)) return "ayer";
  const d = DateTime.fromISO(date).setLocale("es");
  const sameYear = d.year === DateTime.fromISO(today).year;
  return d.toFormat(sameYear ? "cccc d 'de' LLLL" : "cccc d 'de' LLLL 'de' yyyy");
}

/** Fecha completa y sin ambigüedad: "jueves 30 de octubre de 2026, 10:00 a. m." */
export function formatFull(date: string, time: string | null) {
  const d = DateTime.fromISO(date).setLocale("es").toFormat("cccc d 'de' LLLL 'de' yyyy");
  return time ? `${d}, ${formatTime(time)}` : d;
}

export function formatWhen(date: string | null, time: string | null, tz: string, now: Date = new Date()) {
  if (!date) return time ? formatTime(time) : "sin fecha";
  const d = formatDate(date, tz, now);
  return time ? `${d}, ${formatTime(time)}` : d;
}

export function formatRecurrence(rec: Recurrence) {
  if (!rec) return "";
  if (rec.type === "daily") return "todos los días";
  const days = rec.days;
  if (days.join() === "1,2,3,4,5") return "de lunes a viernes";
  if (days.join() === "6,7") return "los fines de semana";
  const names = days.map((d) => (d === 6 || d === 7 ? DAY_NAMES[d] + "s" : DAY_NAMES[d]));
  if (names.length === 1) return `cada ${DAY_NAMES[days[0]]}`;
  return `los ${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export function formatInstant(at: Date | string, tz: string, now: Date = new Date()) {
  const dt = DateTime.fromJSDate(new Date(at)).setZone(tz);
  return formatWhen(dt.toISODate(), dt.toFormat("HH:mm"), tz, now);
}

export function greeting(tz: string, now: Date = new Date()) {
  const h = nowIn(tz, now).hour;
  if (h < 5) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Caracas",
  "America/Santo_Domingo",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "Europe/Madrid",
  "UTC",
];
