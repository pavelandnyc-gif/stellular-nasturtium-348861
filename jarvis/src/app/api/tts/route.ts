import { z } from "zod";
import { api, body } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { MAX_TTS_CHARS, synthesize, TTS_MODELS, TtsLimitError, ttsConfigured, ttsUsage, VOICE_ID_RE } from "@/lib/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = api(async (_req, { profile }) => {
  if (!ttsConfigured()) return { ok: true, enabled: false };
  return { ok: true, enabled: true, voiceId: (profile as { voice_id?: string | null }).voice_id ?? null, ...(await ttsUsage()) };
});

export const POST = api(async (req, { profile }) => {
  if (!ttsConfigured()) throw new HttpError(503, "La voz premium no está configurada.");
  const { text, voiceId, model } = await body(
    req,
    z.object({
      text: z.string().trim().min(1).max(MAX_TTS_CHARS),
      voiceId: z.string().regex(VOICE_ID_RE).optional(),
      model: z.enum(TTS_MODELS).optional(),
    }),
  );
  try {
    const audio = await synthesize(text, voiceId ?? (profile as { voice_id?: string | null }).voice_id, model);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof TtsLimitError) throw new HttpError(429, e.message);
    console.error("TTS:", e);
    throw new HttpError(502, "No se pudo generar la voz premium.");
  }
});
