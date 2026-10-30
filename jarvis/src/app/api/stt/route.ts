import { api } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { MAX_STT_BYTES, SttError, transcribe, ttsConfigured } from "@/lib/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** Recibe el audio grabado en el iPhone y devuelve el texto. */
export const POST = api(async (req) => {
  if (!ttsConfigured()) throw new HttpError(503, "El reconocimiento de voz no está configurado.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "No llegó el audio.");
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1000) throw new HttpError(400, "El audio está vacío.");
  if (audio.size > MAX_STT_BYTES) throw new HttpError(413, "El audio es demasiado largo.");
  const ext = audio.type.includes("mp4") || audio.type.includes("aac") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  try {
    return { ok: true, text: await transcribe(audio, `voz.${ext}`) };
  } catch (e) {
    if (e instanceof SttError) throw new HttpError(e.status === 401 ? 502 : 502, e.message);
    console.error("STT:", e);
    throw new HttpError(502, "No pude entender el audio. Inténtalo de nuevo.");
  }
});
