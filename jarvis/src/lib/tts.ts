import "server-only";
import { query } from "./db";
import { env } from "./env";
import { forSpeech } from "./speech";
import { createHash } from "node:crypto";

// Voz premium de Jarvis con ElevenLabs. La clave vive solo en el servidor.
// Se cuenta cada carácter enviado y, al llegar al tope mensual, la app vuelve
// sola a la voz gratuita del iPhone (nunca se pasa del presupuesto).

export const MAX_TTS_CHARS = 800; // por petición

export function ttsConfigured() {
  return !!env.elevenKey();
}

function month() {
  return new Date().toISOString().slice(0, 7);
}

export async function ttsUsage() {
  const rows = await query<{ chars: number }>("select chars from jarvis.tts_usage where month = $1", [month()]);
  const used = rows[0]?.chars ?? 0;
  const limit = env.elevenMonthlyLimit();
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export class TtsLimitError extends Error {}

/** Reserva caracteres del presupuesto del mes; falla si se pasaría del tope. */
async function reserve(n: number) {
  const limit = env.elevenMonthlyLimit();
  const rows = await query<{ chars: number }>(
    `insert into jarvis.tts_usage (month, chars) values ($1, $2)
     on conflict (month) do update set chars = jarvis.tts_usage.chars + excluded.chars
       where jarvis.tts_usage.chars + excluded.chars <= $3
     returning chars`,
    [month(), n, limit],
  );
  if (!rows.length || rows[0].chars > limit) {
    if (rows.length) await release(n);
    throw new TtsLimitError("Se alcanzó el tope mensual de la voz premium.");
  }
}

async function release(n: number) {
  await query("update jarvis.tts_usage set chars = greatest(0, chars - $2) where month = $1", [month(), n]);
}

export const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export const TTS_MODELS = ["eleven_multilingual_v2", "eleven_v3", "eleven_flash_v2_5"] as const;
export type TtsModel = (typeof TTS_MODELS)[number];

function voiceSettings(model: string) {
  // eleven_v3 solo acepta estabilidad 0, 0.5 o 1 ("creativa", "natural", "robusta").
  if (model.includes("v3")) return { stability: 0.5 };
  // Menos estabilidad + algo de estilo = entonación más viva y menos monótona.
  return { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };
}

async function callTts(text: string, voice: string, model: string) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenKey()!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      language_code: model.includes("multilingual_v2") ? undefined : "es",
      voice_settings: voiceSettings(model),
    }),
    signal: AbortSignal.timeout(25_000),
  });
}

export async function synthesize(text: string, voiceId?: string | null, model?: string | null): Promise<ArrayBuffer> {
  const clean = forSpeech(text).slice(0, MAX_TTS_CHARS);
  const voice = voiceId && VOICE_ID_RE.test(voiceId) ? voiceId : env.elevenVoice();
  const chosen = model && (TTS_MODELS as readonly string[]).includes(model) ? model : env.elevenModel();
  // ¿Ya se generó esta misma frase con esta voz? Entonces sale gratis.
  const key = createHash("sha256").update(`${voice}|${chosen}|${clean}`).digest("hex");
  const hit = await query<{ audio: Uint8Array }>("select audio from jarvis.tts_cache where key = $1", [key]);
  if (hit[0]) {
    const a = hit[0].audio;
    return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;
  }
  await reserve(clean.length);
  try {
    let res = await callTts(clean, voice, chosen);
    // Si el modelo elegido no está disponible para esta voz o cuenta, se usa el de siempre.
    if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 401 && chosen !== env.elevenModel()) {
      res = await callTts(clean, voice, env.elevenModel());
    }
    if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const audio = await res.arrayBuffer();
    await query("insert into jarvis.tts_cache (key, audio) values ($1, $2) on conflict (key) do nothing", [
      key,
      Buffer.from(audio),
    ]).catch(() => {});
    // Limpieza ocasional: se guardan los audios de los últimos 7 días.
    if (Math.random() < 0.05) await query("delete from jarvis.tts_cache where created_at < now() - interval '7 days'").catch(() => {});
    return audio;
  } catch (e) {
    await release(clean.length); // si falló, no cuenta
    throw e;
  }
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
}

// Voces sugeridas por su estilo (descripciones oficiales de ElevenLabs).
const SUGGESTED: Record<string, string> = {
  JBFqnCBsd6RMkjVDRZzb: "Británico, maduro, cálido y refinado",
  onwK4e9ZLuTAKqWW03F9: "Británico, maduro, con autoridad",
};

/** Voces disponibles en la cuenta de ElevenLabs (las de fábrica y las que guardes de la biblioteca). */
export async function listVoices(): Promise<VoiceOption[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": env.elevenKey()! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}`);
  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string | null }[];
  };
  const opts = data.voices.map((v) => {
    const l = v.labels ?? {};
    const spanish = /spanish|español|latin|mexic|argentin|castil/i.test(`${l.language ?? ""} ${l.accent ?? ""} ${v.name}`);
    const desc =
      SUGGESTED[v.voice_id] ??
      ([l.gender, l.age, l.accent, l.description ?? l.descriptive, l.use_case ?? l.use_case].filter(Boolean).join(", ") ||
        v.description ||
        "");
    return {
      id: v.voice_id,
      name: v.name.split(" - ")[0],
      description: desc + (spanish ? " · español nativo" : ""),
      recommended: v.voice_id in SUGGESTED || spanish,
    };
  });
  return opts.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
}

/** Verifica la clave sin gastar: consulta la voz configurada. */
export async function checkTts(): Promise<string> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(env.elevenVoice())}`, {
      headers: { "xi-api-key": env.elevenKey()! },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return `ok: ${((await res.json()) as { name: string }).name}`;
    if (res.status === 401) {
      // ElevenLabs explica el motivo: clave incorrecta o permisos que faltan en la clave.
      const body = (await res.json().catch(() => ({}))) as { detail?: { status?: string; message?: string } };
      const why = body.detail?.status ?? "";
      if (why === "missing_permissions") return `error: a la clave le faltan permisos (${body.detail?.message?.slice(0, 120) ?? ""})`;
      return `error: clave de ElevenLabs inválida${why ? ` (${why})` : ""}`;
    }
    if (res.status === 404) return "error: la voz configurada no existe en tu cuenta";
    return `error: ElevenLabs respondió ${res.status}`;
  } catch {
    return "error: no conecta con ElevenLabs";
  }
}

// ── Reconocimiento de voz (ElevenLabs Scribe) ───────────────────────────────
// Más fiable que el dictado del navegador dentro de la app instalada del iPhone.

export const MAX_STT_BYTES = 8 * 1024 * 1024;

export class SttError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const models = [env.elevenSttModel(), "scribe_v1"].filter((m, i, a) => a.indexOf(m) === i);
  let lastError = "";
  for (const model of models) {
    for (const lang of ["es", null]) {
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model_id", model);
      if (lang) form.append("language_code", lang);
      form.append("tag_audio_events", "false");
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": env.elevenKey()! },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return (data.text ?? "").trim();
      }
      const body = await res.text();
      lastError = `${res.status}: ${body.slice(0, 200)}`;
      if (res.status === 401) {
        throw new SttError(
          /missing_permissions/.test(body)
            ? "A la clave de ElevenLabs le falta el permiso de Speech to Text."
            : "La clave de ElevenLabs no es válida.",
          401,
        );
      }
      // 400/422: probamos sin idioma o con el modelo anterior; otros errores se cortan aquí.
      if (res.status !== 400 && res.status !== 422) throw new SttError(`ElevenLabs respondió ${lastError}`);
    }
  }
  throw new SttError(`No se pudo transcribir (${lastError})`);
}
