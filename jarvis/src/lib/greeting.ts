import { nowIn } from "./time";
import type { Weather } from "./weather";

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

  // Frases originales con el estilo de un asistente de película: elegante, ingenioso y "en línea".
  let opening: string;
  if (h < 5)
    opening = pick(
      [
        `${n}, pasan de las doce. Admiro la dedicación; mi recomendación oficial sigue siendo dormir.`,
        `Turno de madrugada, ${n}. Sistemas en línea y yo, como siempre, despierto.`,
      ],
      r,
    );
  else if (h < 12)
    opening = pick(
      [
        `Buenos días, ${n}. Sistemas en línea, agenda cargada y listo para despegar.`,
        `Buenos días, ${n}. Diagnóstico completo: todo funciona. Incluido tú, espero.`,
        `Bienvenido de vuelta, ${n}. Ya calenté los motores; el café corre por tu cuenta.`,
        weekend
          ? `Buenos días, ${n}. Es fin de semana: el único pendiente obligatorio es disfrutarlo.`
          : `Buenos días, ${n}. Un nuevo día, todos los sistemas a tu disposición.`,
      ],
      r,
    );
  else if (h < 19)
    opening = pick(
      [
        `Buenas tardes, ${n}. Todo bajo control por aquí, como de costumbre.`,
        `Bienvenido de vuelta, ${n}. Sistemas al cien por ciento.`,
        `Hola de nuevo, ${n}. Te estaba esperando; bueno, siempre te estoy esperando.`,
      ],
      r,
    );
  else
    opening = pick(
      [
        `Buenas noches, ${n}. Hora de cerrar el día con estilo.`,
        `Bienvenido de vuelta, ${n}. Las luces bajan, pero yo sigo en línea.`,
        `Buenas noches, ${n}. Revisemos la misión de hoy antes de descansar.`,
      ],
      r,
    );

  // Saludo corto (como en las películas): el detalle va en el informe, si lo pides.
  const nothing = !g.todayTasks.length && !g.overdueCount && !g.pendingHabits.length;
  return `${opening} ${nothing ? pick(["Agenda despejada. ¿En qué te ayudo?", "Nada urgente en el radar. Tú dime."], r) : pick(["¿Te doy el informe del día?", "¿Quieres el informe del día?"], r)}`;
}

export interface BriefingInput extends GreetingInput {
  weather: Weather | null;
}

/** Informe del día: hora, clima, pendientes y hábitos, en tono Jarvis y fácil de escuchar. */
export function buildBriefing(g: BriefingInput): string {
  const r = g.random ?? Math.random;
  const local = nowIn(g.tz, g.now);
  const parts: string[] = [`Son las ${speakTime(local.toFormat("HH:mm"))}.`];
  const w = g.weather;
  if (w) {
    let line = `Afuera, ${w.temp} grados y ${w.desc}; máxima de ${w.high}.`;
    if (w.rainFromHour !== null) {
      line += ` Lluvia probable desde las ${speakTime(`${String(w.rainFromHour).padStart(2, "0")}:00`)}: te sugiero paraguas.`;
    } else if (w.rainChance < 20 && /despejado|parcialmente/.test(w.desc)) {
      line += " Buen día para salir.";
    }
    parts.push(line);
  }
  const t = g.todayTasks;
  if (t.length === 1) {
    parts.push(`Un solo pendiente en el radar: ${t[0].title}${t[0].due_time ? `, a las ${speakTime(t[0].due_time)}` : ""}.`);
  } else if (t.length > 1) {
    const first = t.find((x) => x.due_time) ?? t[0];
    parts.push(
      `Tengo ${t.length} pendientes en el radar. ${first.due_time ? `El primero, ${first.title}, a las ${speakTime(first.due_time)}.` : `Empezando por ${first.title}.`}`,
    );
  } else {
    parts.push(pick(["Agenda despejada. Un lujo que pocos se permiten.", "Cielo despejado: cero pendientes para hoy."], r));
  }
  if (g.overdueCount) {
    parts.push(
      g.overdueCount === 1
        ? "Hay un asunto atrasado esperándote con paciencia; cuando quieras lo reprogramamos."
        : `Hay ${g.overdueCount} asuntos atrasados esperándote con paciencia; cuando quieras los ponemos al día.`,
    );
  }
  if (g.pendingHabits.length) {
    parts.push(
      g.pendingHabits.length === 1
        ? `Y no lo olvido: ${g.pendingHabits[0].toLowerCase()} te espera.`
        : `Y no lo olvido: ${listJoin(g.pendingHabits.map((x) => x.toLowerCase()))} te esperan.`,
    );
  } else if (g.doneHabits) {
    parts.push("Hábitos del día completos. Impecable, como siempre.");
  }
  parts.push(pick(["Eso es todo. ¿Algo más?", "Fin del informe. Tú dime.", "Es todo por ahora. ¿Qué sigue?"], r));
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


/** Aleatorio "fijo" por hora: el saludo no cambia al refrescar la pantalla (el audio preparado coincide). */
export function hourlyRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Saludo breve al volver a la app en el mismo día (pocas frases fijas: su audio se reutiliza). */
export function buildReturnGreeting(name: string, random: () => number = Math.random): string {
  return pick([`De vuelta, ${name}.`, `Aquí sigo, ${name}. Tú dime.`, `Bienvenido de vuelta, ${name}. ¿Qué necesitas?`], random);
}
