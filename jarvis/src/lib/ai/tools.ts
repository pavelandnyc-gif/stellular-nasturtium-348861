import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createIdea, deleteIdea, getIdea, linkIdeaToTask, listIdeas, updateIdea } from "../repo/ideas";
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  PRIORITY_LABEL,
  snoozeTask,
  updateTask,
  viewTask,
  type TaskRow,
  type TaskScope,
} from "../repo/tasks";
import { createHabit, describeHabit, listHabits, setHabitLog } from "../repo/habits";
import { formatFull, formatInstant, formatWhen, isValidDate, normalizeRecurrence, TIME_RE, todayIn } from "../time";

// ─────────────────────────────────────────────────────────────────────────────
//  Herramientas que Jarvis (la IA) puede usar. Cada entrada pasa por una
//  validación estricta (zod) en el servidor antes de tocar la base de datos, y
//  todas las consultas filtran por el usuario autenticado: la IA nunca puede
//  ver ni modificar datos de otra persona.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolContext {
  userId: string;
  tz: string;
}

/** Lo que la interfaz muestra como "hecho". Solo se genera después de guardar. */
export interface ActionCard {
  type:
    | "idea_saved"
    | "idea_updated"
    | "idea_deleted"
    | "task_created"
    | "task_updated"
    | "task_completed"
    | "task_deleted"
    | "task_snoozed"
    | "habit_created"
    | "habit_logged";
  title: string;
  detail: string;
  href?: string;
}

const dateField = z
  .string()
  .refine(isValidDate, "Fecha inválida, usa AAAA-MM-DD")
  .nullish();
const timeField = z.string().regex(TIME_RE, "Hora inválida, usa HH:MM en formato 24 h").nullish();
const priorityField = z.enum(["alta", "media", "baja"]).nullish();
const daysField = z.array(z.number().int().min(1).max(7)).max(7);
const repeatField = z.object({ type: z.enum(["none", "daily", "weekly"]), days: daysField });
const uuid = z.string().uuid("Identificador inválido");

const PRIORITY_NUM = { alta: 1, media: 2, baja: 3 } as const;

// Campo opcional: simplemente no va en "required" (la IA lo omite si no aplica).
// No usamos el modo "strict" porque limita la cantidad de campos opcionales; la
// validación real la hace zod en el servidor antes de guardar nada.
const OPTIONAL = "__optional";
const nullable = (type: string, extra: { description?: string; enum?: string[] } = {}) => ({ type, ...extra, [OPTIONAL]: true });

function toolDef(name: string, description: string, properties: Record<string, Record<string, unknown>>): Anthropic.Beta.BetaTool {
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(properties)) {
    const { [OPTIONAL]: optional, ...schema } = v;
    props[k] = schema;
    if (!optional) required.push(k);
  }
  return {
    name,
    description,
    input_schema: { type: "object", properties: props, required, additionalProperties: false },
  } as Anthropic.Beta.BetaTool;
}

const repeatSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["none", "daily", "weekly"] },
    days: { type: "array", items: { type: "integer" }, description: "Para weekly: días ISO, 1 = lunes … 7 = domingo. Vacío si no aplica." },
  },
  required: ["type", "days"],
  additionalProperties: false,
};

export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = [
  toolDef("save_idea", "Guarda una idea o nota sin fecha (algo para recordar, no una acción con fecha).", {
    content: { type: "string", description: "Texto de la idea, tal como la dijo la persona (limpio)." },
  }),
  toolDef("search_ideas", "Busca ideas guardadas por texto y/o por antigüedad.", {
    query: nullable("string", { description: "Palabras a buscar, o null para todas." }),
    since_days: nullable("integer", { description: "Solo ideas de los últimos N días (p. ej. 7 para 'esta semana'), o null." }),
  }),
  toolDef("update_idea", "Edita o elimina una idea existente. Usa search_ideas antes para obtener su id.", {
    idea_id: { type: "string" },
    content: nullable("string", { description: "Nuevo texto, o null para no cambiarlo." }),
    delete: { type: "boolean", description: "true solo si la persona pidió borrarla explícitamente." },
  }),
  toolDef(
    "create_task",
    "Crea una tarea o recordatorio. Un recordatorio es una tarea con hora: sonará un aviso a esa hora. Para repetir (diario/semanal) usa repeat.",
    {
      title: { type: "string", description: "Acción breve en infinitivo, p. ej. 'Llamar a mamá'." },
      date: nullable("string", { description: "AAAA-MM-DD en la zona horaria de la persona, o null si no tiene fecha." }),
      time: nullable("string", { description: "HH:MM en 24 h, o null si no tiene hora." }),
      priority: nullable("string", { enum: ["alta", "media", "baja"] }),
      repeat: repeatSchema,
      notes: nullable("string"),
    },
  ),
  toolDef("list_tasks", "Consulta tareas. scope: today, overdue, upcoming, nodate, pending (todas las pendientes) o completed.", {
    scope: { type: "string", enum: ["today", "overdue", "upcoming", "nodate", "pending", "completed"] },
    query: nullable("string", { description: "Filtrar por texto del título, o null." }),
  }),
  toolDef(
    "update_task",
    "Modifica una tarea existente: reschedule (cambiar fecha/hora), complete, snooze (posponer minutos), edit (título/prioridad) o delete. Obtén el id con list_tasks o del historial reciente.",
    {
      task_id: { type: "string" },
      action: { type: "string", enum: ["reschedule", "complete", "snooze", "edit", "delete"] },
      date: nullable("string", { description: "Para reschedule: nueva fecha AAAA-MM-DD (null = sin cambio)." }),
      time: nullable("string", { description: "Para reschedule: nueva hora HH:MM (null = sin cambio)." }),
      snooze_minutes: nullable("integer", { description: "Para snooze: minutos a posponer." }),
      title: nullable("string"),
      priority: nullable("string", { enum: ["alta", "media", "baja"] }),
    },
  ),
  toolDef(
    "create_habit",
    "Crea un hábito (algo que la persona quiere practicar con regularidad, como ejercicio o lectura), con registro de cumplimiento.",
    {
      name: { type: "string", description: "Nombre corto, p. ej. 'Leer'." },
      emoji: nullable("string"),
      days: { type: "array", items: { type: "integer" }, description: "Días ISO (1 = lunes … 7 = domingo). Vacío = todos los días." },
      time: nullable("string", { description: "Hora del aviso HH:MM, o null si no quiere aviso." }),
      target_minutes: nullable("integer", { description: "Duración objetivo en minutos, o null." }),
    },
  ),
  toolDef("list_habits", "Lista los hábitos con su estado de hoy (si toca hoy y si ya se hizo) y la racha.", {}),
  toolDef("log_habit", "Marca un hábito como cumplido (o desmarca) en una fecha. Por defecto hoy.", {
    habit_id: { type: "string" },
    date: nullable("string", { description: "AAAA-MM-DD, o null para hoy." }),
    done: { type: "boolean" },
  }),
  toolDef("convert_idea_to_task", "Convierte una idea guardada en una tarea.", {
    idea_id: { type: "string" },
    title: nullable("string", { description: "Título de la tarea; null para usar el texto de la idea." }),
    date: nullable("string"),
    time: nullable("string"),
    priority: nullable("string", { enum: ["alta", "media", "baja"] }),
  }),
];

const schemas = {
  save_idea: z.object({ content: z.string().trim().min(1).max(4000) }),
  search_ideas: z.object({ query: z.string().max(200).nullish(), since_days: z.number().int().min(1).max(3650).nullish() }),
  update_idea: z.object({ idea_id: uuid, content: z.string().trim().min(1).max(4000).nullish(), delete: z.boolean() }),
  create_task: z.object({
    title: z.string().trim().min(1).max(500),
    date: dateField,
    time: timeField,
    priority: priorityField,
    repeat: repeatField,
    notes: z.string().max(2000).nullish(),
  }),
  list_tasks: z.object({
    scope: z.enum(["today", "overdue", "upcoming", "nodate", "pending", "completed"]),
    query: z.string().max(200).nullish(),
  }),
  update_task: z.object({
    task_id: uuid,
    action: z.enum(["reschedule", "complete", "snooze", "edit", "delete"]),
    date: dateField,
    time: timeField,
    snooze_minutes: z.number().int().min(1).max(60 * 24 * 14).nullish(),
    title: z.string().trim().min(1).max(500).nullish(),
    priority: priorityField,
  }),
  create_habit: z.object({
    name: z.string().trim().min(1).max(200),
    emoji: z.string().max(16).nullish(),
    days: daysField,
    time: timeField,
    target_minutes: z.number().int().min(1).max(1440).nullish(),
  }),
  list_habits: z.object({}),
  log_habit: z.object({ habit_id: uuid, date: dateField, done: z.boolean() }),
  convert_idea_to_task: z.object({
    idea_id: uuid,
    title: z.string().trim().min(1).max(500).nullish(),
    date: dateField,
    time: timeField,
    priority: priorityField,
  }),
};

type ToolName = keyof typeof schemas;

function taskSummary(t: TaskRow, ctx: ToolContext) {
  const v = viewTask(t, ctx.tz);
  return {
    id: t.id,
    titulo: t.title,
    estado: t.status === "done" ? "completada" : v.overdue ? "vencida" : "pendiente",
    cuando: v.when,
    fecha_exacta: t.due_date ? formatFull(t.due_date, t.due_time) : null,
    repite: v.repeat || null,
    prioridad: t.priority ? PRIORITY_LABEL[t.priority] : null,
    aviso: t.remind && !!t.due_time,
  };
}

function ideaSummary(i: { id: string; content: string; created_at: Date; task_id: string | null }, ctx: ToolContext) {
  return { id: i.id, texto: i.content, guardada: formatInstant(i.created_at, ctx.tz), convertida_en_tarea: !!i.task_id };
}

export interface ToolOutcome {
  result: unknown;
  isError: boolean;
  action?: ActionCard;
}

function err(message: string): ToolOutcome {
  return { result: { ok: false, error: message }, isError: true };
}

function recurrenceFrom(repeat: { type: "none" | "daily" | "weekly"; days: number[] }) {
  if (repeat.type === "none") return null;
  return normalizeRecurrence(repeat);
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const schema = schemas[name as ToolName];
  if (!schema) return err(`Herramienta desconocida: ${name}`);
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return err(`Datos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data as any;
  const { userId, tz } = ctx;

  switch (name as ToolName) {
    case "save_idea": {
      const idea = await createIdea(userId, input.content);
      return {
        result: { ok: true, guardado: true, idea: ideaSummary(idea, ctx) },
        isError: false,
        action: { type: "idea_saved", title: "Idea guardada", detail: idea.content, href: `/ideas?id=${idea.id}` },
      };
    }
    case "search_ideas": {
      const ideas = await listIdeas(userId, { q: input.query, sinceDays: input.since_days, limit: 30 });
      return { result: { ok: true, total: ideas.length, ideas: ideas.map((i) => ideaSummary(i, ctx)) }, isError: false };
    }
    case "update_idea": {
      const idea = await getIdea(userId, input.idea_id);
      if (!idea) return err("No encontré esa idea.");
      if (input.delete) {
        await deleteIdea(userId, idea.id);
        return { result: { ok: true, eliminada: true }, isError: false, action: { type: "idea_deleted", title: "Idea eliminada", detail: idea.content } };
      }
      if (!input.content) return err("No indicaste el nuevo texto.");
      const up = (await updateIdea(userId, idea.id, input.content))!;
      return {
        result: { ok: true, idea: ideaSummary(up, ctx) },
        isError: false,
        action: { type: "idea_updated", title: "Idea actualizada", detail: up.content, href: `/ideas?id=${up.id}` },
      };
    }
    case "create_task": {
      const rec = recurrenceFrom(input.repeat);
      if (input.repeat.type === "weekly" && !rec) return err("Para repetir semanalmente indica los días (1 = lunes … 7 = domingo).");
      if (input.date && input.date < todayIn(tz) && !rec) return err("Esa fecha ya pasó. Pregunta a la persona qué fecha quiere.");
      const t = await createTask(
        userId,
        {
          title: input.title,
          notes: input.notes,
          due_date: input.date,
          due_time: input.time,
          priority: input.priority ? PRIORITY_NUM[input.priority as keyof typeof PRIORITY_NUM] : null,
          recurrence: rec,
        },
        tz,
      );
      const s = taskSummary(t, ctx);
      const detail = [t.title, s.fecha_exacta ?? "sin fecha", s.repite ? `se repite ${s.repite}` : null].filter(Boolean).join(" · ");
      return {
        result: { ok: true, guardado: true, tarea: s, aviso_programado: s.aviso },
        isError: false,
        action: { type: "task_created", title: t.due_time ? "Recordatorio creado" : "Tarea creada", detail, href: `/tareas/${t.id}` },
      };
    }
    case "list_tasks": {
      const rows = await listTasks(userId, input.scope as TaskScope, tz, { q: input.query, limit: 40 });
      return {
        result: { ok: true, hoy: formatFull(todayIn(tz), null), total: rows.length, tareas: rows.map((t) => taskSummary(t, ctx)) },
        isError: false,
      };
    }
    case "update_task": {
      const t = await getTask(userId, input.task_id);
      if (!t) return err("No encontré esa tarea.");
      const href = `/tareas/${t.id}`;
      switch (input.action) {
        case "complete": {
          const r = await completeTask(userId, t.id, tz);
          const next = r?.nextDate ? formatFull(r.nextDate, t.due_time) : null;
          return {
            result: { ok: true, completada: true, siguiente_repeticion: next },
            isError: false,
            action: {
              type: "task_completed",
              title: "Tarea completada",
              detail: next ? `${t.title} · próxima: ${next}` : t.title,
              href,
            },
          };
        }
        case "delete": {
          await deleteTask(userId, t.id);
          return { result: { ok: true, eliminada: true }, isError: false, action: { type: "task_deleted", title: "Tarea eliminada", detail: t.title } };
        }
        case "snooze": {
          if (!input.snooze_minutes) return err("Indica cuántos minutos posponer.");
          const r = await snoozeTask(userId, t.id, input.snooze_minutes, tz);
          if (!r) return err("Solo se pueden posponer tareas pendientes.");
          const when = formatInstant(r.until, tz);
          return {
            result: { ok: true, pospuesta_hasta: when, tarea: taskSummary(r.task, ctx) },
            isError: false,
            action: { type: "task_snoozed", title: "Aviso pospuesto", detail: `${t.title} · ${when}`, href },
          };
        }
        case "reschedule": {
          if (!input.date && !input.time) return err("Falta la nueva fecha u hora.");
          const date = input.date ?? t.due_date ?? todayIn(tz);
          if (date < todayIn(tz)) return err("Esa fecha ya pasó.");
          const up = (await updateTask(userId, t.id, { due_date: date, due_time: input.time ?? t.due_time }))!;
          const s = taskSummary(up, ctx);
          return {
            result: { ok: true, guardado: true, tarea: s },
            isError: false,
            action: { type: "task_updated", title: "Tarea reprogramada", detail: `${up.title} · ${s.fecha_exacta}`, href },
          };
        }
        case "edit": {
          const up = (await updateTask(userId, t.id, {
            title: input.title ?? t.title,
            priority: input.priority ? PRIORITY_NUM[input.priority as keyof typeof PRIORITY_NUM] : t.priority,
          }))!;
          return {
            result: { ok: true, guardado: true, tarea: taskSummary(up, ctx) },
            isError: false,
            action: { type: "task_updated", title: "Tarea actualizada", detail: up.title, href },
          };
        }
      }
      return err("Acción no válida.");
    }
    case "create_habit": {
      const h = await createHabit(userId, {
        name: input.name,
        emoji: input.emoji,
        days: input.days,
        habit_time: input.time,
        target_minutes: input.target_minutes,
        remind: !!input.time,
      });
      const schedule = describeHabit(h);
      return {
        result: { ok: true, guardado: true, habito: { id: h.id, nombre: h.name, frecuencia: schedule, aviso: !!h.habit_time } },
        isError: false,
        action: { type: "habit_created", title: "Hábito creado", detail: `${h.name} · ${schedule}`, href: `/habitos?h=${h.id}` },
      };
    }
    case "list_habits": {
      const hs = await listHabits(userId, tz);
      return {
        result: {
          ok: true,
          habitos: hs.map((h) => ({
            id: h.id,
            nombre: h.name,
            frecuencia: h.schedule,
            toca_hoy: h.dueToday,
            hecho_hoy: h.doneToday,
            racha: h.streak,
          })),
        },
        isError: false,
      };
    }
    case "log_habit": {
      const date = input.date ?? todayIn(tz);
      const h = await setHabitLog(userId, input.habit_id, date, input.done);
      if (!h) return err("No encontré ese hábito.");
      return {
        result: { ok: true, guardado: true, fecha: formatWhen(date, null, tz), hecho: input.done },
        isError: false,
        action: {
          type: "habit_logged",
          title: input.done ? "Hábito cumplido" : "Registro quitado",
          detail: `${h.name} · ${formatWhen(date, null, tz)}`,
          href: `/habitos?h=${h.id}`,
        },
      };
    }
    case "convert_idea_to_task": {
      const idea = await getIdea(userId, input.idea_id);
      if (!idea) return err("No encontré esa idea.");
      const t = await createTask(
        userId,
        {
          title: input.title ?? idea.content.slice(0, 500),
          due_date: input.date,
          due_time: input.time,
          priority: input.priority ? PRIORITY_NUM[input.priority as keyof typeof PRIORITY_NUM] : null,
          idea_id: idea.id,
        },
        tz,
      );
      await linkIdeaToTask(userId, idea.id, t.id);
      const s = taskSummary(t, ctx);
      return {
        result: { ok: true, guardado: true, tarea: s },
        isError: false,
        action: { type: "task_created", title: "Idea convertida en tarea", detail: `${t.title} · ${s.fecha_exacta ?? "sin fecha"}`, href: `/tareas/${t.id}` },
      };
    }
  }
  return err("Herramienta no implementada.");
}

