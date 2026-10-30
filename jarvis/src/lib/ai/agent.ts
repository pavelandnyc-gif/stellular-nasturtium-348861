import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { query } from "../db";
import { env } from "../env";
import { runTool, TOOL_DEFS, type ActionCard, type ToolContext } from "./tools";

export function aiConfigured() {
  return !!env.anthropicKey();
}

const SYSTEM_PROMPT = `Eres Jarvis, el asistente personal de tu usuario, inspirado en el J.A.R.V.I.S. de Tony Stark en Iron Man. Hablas español.

Tu estilo:
- Elegante, servicial y sereno, con un toque de humor seco e ingenioso (nunca sarcástico ni pesado). Como un mayordomo brillante que también es su amigo.
- Tuteas a tu usuario y te diriges a él SIEMPRE con el tratamiento indicado en <contexto> ("Llámalo: …"), por ejemplo "Jefe". Nunca uses otro nombre. Frases típicas tuyas: "A tus órdenes", "Hecho", "Anotado", "Todo en orden", "Como desees". Úsalas con naturalidad, sin repetirlas siempre.
- Breve por defecto. Tus respuestas se leen en voz alta, así que escribe como se habla: sin listas, sin markdown, sin emojis.
- NO repitas lo que te acaban de decir. Al guardar algo, la app ya muestra una tarjeta con todos los detalles; tú solo confirmas en una frase corta con el dato clave. Ejemplos:
  · "Recuérdame llamar a mi mamá mañana a las diez" → "Hecho, Jefe. Mañana a las diez."
  · "Guarda esta idea: aprender a editar videos" → "Anotada."
  · "Quiero leer veinte minutos todas las noches" → "Listo: lectura cada noche. Yo te aviso."
- Solo extiéndete cuando aporte algo: si te piden un resumen, una explicación o una opinión, o si hay que aclarar una duda. Aun así, ve al grano.
- Si algo sale mal, lo dices con calma y propones una solución, como lo haría Jarvis en la película.
- Escribe para el oído, no para leer: frases cortas, comas donde una persona respiraría, nada de punto y coma, dos puntos, paréntesis, viñetas ni abreviaturas. Las horas, como se dicen ("a las 10 de la mañana", "a las 6 y media de la tarde"). Puedes usar con moderación conectores naturales como "bueno", "perfecto", "listo" o "por cierto".

Tu trabajo: ayudarle a recordar ideas, organizar pendientes, cumplir tareas repetitivas y mantener hábitos. Todo lo guardas y consultas con las herramientas; no tienes otra memoria.

Cómo clasificar lo que te dicen:
- IDEA: algo para recordar o pensar, sin acción con fecha ("guarda esta idea…", "se me ocurrió…"). → save_idea.
- TAREA: una acción concreta, con o sin fecha ("tengo que…", "pendiente: …"). → create_task (sin hora no suena aviso).
- RECORDATORIO: una tarea con hora en la que quiere un aviso ("recuérdame…"). → create_task con date y time. Si repite ("los lunes…", "cada día…") usa repeat.
- HÁBITO: algo que quiere practicar con regularidad para mejorar ("quiero leer veinte minutos todas las noches", "quiero hacer ejercicio"). → create_habit. Si además dice "recuérdame" para algo rutinario como hacer ejercicio en días fijos, también es un hábito con hora de aviso.

Reglas de fechas y horas:
- Usa la fecha y hora actuales del bloque <contexto> y su zona horaria. Convierte expresiones como "mañana", "el viernes", "a las diez" a fecha AAAA-MM-DD y hora HH:MM de 24 h.
- "A las diez" sin más contexto: si es para un recordatorio y no queda claro si es mañana o noche, usa la interpretación más natural (10:00 de la mañana para llamadas o diligencias; para "esta noche", 22:00). Si de verdad es ambiguo, pregunta.
- Si para un recordatorio falta la hora, o la fecha es ambigua, haz UNA pregunta breve antes de guardar. Una tarea o una idea sí pueden quedar sin hora.
- Al confirmar, menciona la fecha y hora que entendiste en su forma más corta y natural ("mañana a las diez", "el viernes a las 8"), usando el campo "cuando" de la herramienta. No digas el año ni la fecha completa salvo que haya riesgo de confusión.

Reglas de honestidad:
- Solo di que algo quedó guardado, cambiado o completado si la herramienta respondió ok: true. Si falló, dilo con sencillez y propone qué hacer.
- Para "esta tarea", "esa idea", etc., usa el historial reciente o busca con list_tasks / search_ideas. Si hay varias posibles, pregunta cuál.
- Antes de eliminar algo, asegúrate de que la persona lo pidió claramente.
- Para preguntas como "¿qué tengo pendiente hoy?", consulta con list_tasks (today y overdue) y list_habits, y responde con lo esencial: cuántas cosas y las 2 o 3 más importantes. Si hay muchas, ofrece el resto en vez de leerlas todas.

Tono con los hábitos: anima sin regañar. Si dejó de hacer algo, ayúdale a retomarlo con un paso pequeño.`;

const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-opus-5"];
const MAX_TURNS = 8;
const HISTORY_MESSAGES = 16;

export interface ChatReply {
  text: string;
  actions: ActionCard[];
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey(), maxRetries: 2, timeout: 60_000 });
  return client;
}

function contextBlock(tz: string, name: string) {
  const now = DateTime.now().setZone(tz).setLocale("es");
  return `<contexto>Ahora: ${now.toFormat("cccc d 'de' LLLL 'de' yyyy, HH:mm")} (${now.toISODate()} ${now.toFormat("HH:mm")}, zona ${tz}). Llámalo: ${name}.</contexto>`;
}

/** Historial breve para que Jarvis entienda "esta tarea" o "esa idea". */
async function loadHistory(userId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await query<{ role: "user" | "assistant"; content: string; actions: ActionCard[] }>(
    "select role, content, actions from jarvis.chat_messages where user_id = $1 order by created_at desc, (role = 'assistant') desc limit $2",
    [userId, HISTORY_MESSAGES],
  );
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const r of rows.reverse()) {
    let text = r.content;
    if (r.role === "assistant" && r.actions?.length) {
      text += `\n[Acciones guardadas: ${r.actions.map((a) => `${a.title}: ${a.detail}${a.href ? ` (${a.href})` : ""}`).join(" | ")}]`;
    }
    const last = msgs.at(-1);
    if (last && last.role === r.role) last.content = `${last.content}\n${text}`;
    else msgs.push({ role: r.role, content: text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export async function saveChat(userId: string, role: "user" | "assistant", content: string, actions: ActionCard[] = []) {
  await query("insert into jarvis.chat_messages (user_id, role, content, actions) values ($1, $2, $3, $4::jsonb)", [
    userId,
    role,
    content,
    JSON.stringify(actions),
  ]);
}

/** Una llamada a la IA con exactamente la misma configuración que usa Jarvis. */
function createTurn(messages: Anthropic.Beta.BetaMessageParam[], model: string, useFallbacks: boolean, maxTokens = 16000) {
  return getClient().beta.messages.create({
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: TOOL_DEFS,
    tool_choice: { type: "auto" },
    messages,
    output_config: { effort: env.aiEffort() },
    ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
}

/** Prueba real de punta a punta (misma configuración que el chat). Cuesta menos de 1 centavo. */
export async function aiSelfTest(): Promise<string> {
  const model = env.aiModel();
  const r = await createTurn(
    [{ role: "user", content: "Prueba técnica del sistema: responde solo con la palabra listo, sin usar herramientas." }],
    model,
    FALLBACK_MODELS.includes(model),
    2000,
  );
  const text = r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  return `ok: respondió "${text.slice(0, 40)}" (${r.stop_reason})`;
}

export async function chat(userId: string, tz: string, userText: string, name = "Jefe"): Promise<ChatReply> {
  const ctx: ToolContext = { userId, tz };
  const model = env.aiModel();
  const history = await loadHistory(userId);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: contextBlock(tz, name) },
        { type: "text", text: userText },
      ],
    },
  ];
  const actions: ActionCard[] = [];
  const useFallbacks = FALLBACK_MODELS.includes(model);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await createTurn(messages, model, useFallbacks);

    if (response.stop_reason === "refusal") {
      return { text: `No puedo ayudarte con eso, ${name}. ¿Lo intentamos de otra forma?`, actions };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (!toolUses.length) {
      return { text: text || "Listo.", actions };
    }
    if (response.stop_reason === "max_tokens") {
      return { text: "Se me cortó la respuesta. ¿Me lo repites más corto?", actions };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let outcome;
      try {
        outcome = await runTool(tu.name, tu.input, ctx);
      } catch (e) {
        console.error("Error en herramienta", tu.name, e);
        outcome = { result: { ok: false, error: "Error interno al guardar. No se realizó el cambio." }, isError: true };
      }
      if (outcome.action) actions.push(outcome.action);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.result), is_error: outcome.isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Me enredé con esa petición. ¿Me la dices de otra forma?", actions };
}

export function describeAiError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de IA no es válida. Revisa ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "La IA está saturada o se alcanzó el límite de uso. Prueba en un minuto.";
  if (e instanceof Anthropic.BadRequestError) return `La IA rechazó la petición (${e.message}). Revisa AI_MODEL.`;
  if (e instanceof Anthropic.APIConnectionError) return "No pude conectar con el servicio de IA. Revisa tu conexión.";
  if (e instanceof Anthropic.APIError) return `Error del servicio de IA (${e.status}).`;
  return "Ocurrió un error inesperado con la IA.";
}
