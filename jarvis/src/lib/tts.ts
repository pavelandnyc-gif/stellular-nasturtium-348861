import "server-only";
import { query } from "./db";
import { env } from "./env";

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

export async function synthesize(text: string, voiceId?: string | null): Promise<ArrayBuffer> {
  const clean = text.slice(0, MAX_TTS_CHARS);
  const voice = voiceId && VOICE_ID_RE.test(voiceId) ? voiceId : env.elevenVoice();
  await reserve(clean.length);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": env.elevenKey()!, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: clean,
          model_id: env.elevenModel(),
          language_code: env.elevenModel().includes("multilingual_v2") ? undefined : "es",
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.arrayBuffer();
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
    if (res.status === 401) return "error: clave de ElevenLabs inválida";
    if (res.status === 404) return "error: la voz configurada no existe en tu cuenta";
    return `error: ElevenLabs respondió ${res.status}`;
  } catch {
    return "error: no conecta con ElevenLabs";
  }
}
