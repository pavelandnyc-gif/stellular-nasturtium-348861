import { nowIn } from "./time";

// Saludo de bienvenida al abrir la app, al estilo del J.A.R.V.I.S. de Iron Man:
// elegante, servicial y con un toque de humor seco. Se arma con datos reales
// (sin IA: es instantáneo y no cuesta nada).

export interface GreetingInput {
  name: string;
  tz: string;
  todayTasks: { title: string; due_time: string | null }[];
  overdueCount: number;
  pendingHabits: string[];
  doneHabits: number;
  now?: Date;
  random?: () => number;
}

const pick = <T,>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length) % xs.length];

export function buildGreeting(g: GreetingInput): string {
  const r = g.random ?? Math.random;
  const local = nowIn(g.tz, g.now);
  const h = local.hour;
  const weekend = local.weekday >= 6;
  const n = g.name;

  let opening: string;
  if (h < 5) opening = pick([`Trabajando hasta tarde, ${n}. Aquí sigo.`, `Buenas noches, ${n}. Es tarde, pero aquí estoy.`], r);
  else if (h < 12)
    opening = pick(
      [
        `Buenos días, ${n}. Todos los sistemas en orden.`,
        `Buenos días, ${n}. Bienvenido de nuevo.`,
        weekend ? `Buenos días, ${n}. Feliz fin de semana.` : `Buenos días, ${n}. Listo para el día cuando tú lo estés.`,
      ],
      r,
    );
  else if (h < 19)
    opening = pick([`Buenas tardes, ${n}. Bienvenido de nuevo.`, `Buenas tardes, ${n}. Todo bajo control por aquí.`], r);
  else opening = pick([`Buenas noches, ${n}. Bienvenido de nuevo.`, `Buenas noches, ${n}. Revisemos cómo va el día.`], r);

  const parts = [opening];
  const t = g.todayTasks;
  if (t.length === 1) {
    parts.push(`Tienes un pendiente hoy: ${t[0].title}${t[0].due_time ? `, a las ${speakTime(t[0].due_time)}` : ""}.`);
  } else if (t.length > 1) {
    const first = t.find((x) => x.due_time) ?? t[0];
    parts.push(
      `Tienes ${t.length} pendientes hoy. ${first.due_time ? `El primero, ${first.title}, a las ${speakTime(first.due_time)}.` : `Empezando por ${first.title}.`}`,
    );
  } else {
    parts.push(pick(["Tu agenda de hoy está despejada.", "No hay pendientes para hoy. Un lujo poco común."], r));
  }
  if (g.overdueCount) {
    parts.push(
      g.overdueCount === 1
        ? "Hay un asunto atrasado; cuando gustes lo reprogramamos."
        : `Hay ${g.overdueCount} asuntos atrasados; cuando gustes los ponemos al día.`,
    );
  }
  if (g.pendingHabits.length) {
    parts.push(
      g.pendingHabits.length === 1
        ? `Y queda pendiente ${g.pendingHabits[0].toLowerCase()}.`
        : `Hábitos por hacer: ${listJoin(g.pendingHabits.map((x) => x.toLowerCase()))}.`,
    );
  } else if (g.doneHabits) {
    parts.push("Hábitos de hoy cumplidos. Impecable.");
  }
  parts.push(pick(["¿Qué necesitas?", "¿En qué te ayudo?", "A tus órdenes.", "¿Por dónde empezamos?"], r));
  return parts.join(" ");
}

function speakTime(time: string) {
  // "10:00 a. m." se lee mejor como "10 de la mañana"
  const [hh, mm] = time.split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const part = hh < 12 ? "de la mañana" : hh < 19 ? "de la tarde" : "de la noche";
  if (hh === 12 && mm === 0) return "12 del mediodía";
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${part}` : `${h12} ${part}`;
}

function listJoin(xs: string[]) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`;
}

