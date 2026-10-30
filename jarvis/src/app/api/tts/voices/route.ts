import { api } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { env } from "@/lib/env";
import { listVoices, ttsConfigured } from "@/lib/tts";

export const dynamic = "force-dynamic";

export const GET = api(async (_req, { profile }) => {
  if (!ttsConfigured()) throw new HttpError(503, "La voz premium no está configurada.");
  try {
    return {
      ok: true,
      current: (profile as { voice_id?: string | null }).voice_id ?? env.elevenVoice(),
      voices: await listVoices(),
    };
  } catch {
    throw new HttpError(502, "No pude consultar las voces de ElevenLabs.");
  }
});
