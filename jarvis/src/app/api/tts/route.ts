import { z } from "zod";
import { api, body } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { MAX_TTS_CHARS, synthesize, TtsLimitError, ttsConfigured, ttsUsage } from "@/lib/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = api(async () => {
  if (!ttsConfigured()) return { ok: true, enabled: false };
  return { ok: true, enabled: true, ...(await ttsUsage()) };
});

export const POST = api(async (req) => {
  if (!ttsConfigured()) throw new HttpError(503, "La voz premium no está configurada.");
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(MAX_TTS_CHARS) }));
  try {
    const audio = await synthesize(text);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof TtsLimitError) throw new HttpError(429, e.message);
    console.error("TTS:", e);
    throw new HttpError(502, "No se pudo generar la voz premium.");
  }
});
