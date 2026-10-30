import { describe, expect, it, vi } from "vitest";

process.env.ELEVENLABS_API_KEY = "test";
const calls: { url: string; form: FormData }[] = [];
const replies: Response[] = [];
vi.stubGlobal("fetch", async (url: string, init: any) => {
  calls.push({ url, form: init.body });
  return replies.shift() ?? new Response(JSON.stringify({ text: "hola" }), { status: 200 });
});
const { transcribe, SttError } = await import("@/lib/tts");
const audio = new Blob([new Uint8Array(2000)], { type: "audio/mp4" });

describe("reconocimiento de voz (ElevenLabs Scribe)", () => {
  it("envía el audio con el modelo y el idioma español", async () => {
    replies.push(new Response(JSON.stringify({ text: " Recuérdame llamar a mi mamá mañana " }), { status: 200 }));
    expect(await transcribe(audio, "voz.m4a")).toBe("Recuérdame llamar a mi mamá mañana");
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(calls[0].form.get("model_id")).toBe("scribe_v2");
    expect(calls[0].form.get("language_code")).toBe("es");
  });

  it("si el modelo o el idioma no se aceptan, prueba alternativas", async () => {
    calls.length = 0;
    replies.push(new Response("bad", { status: 422 }), new Response("bad", { status: 422 }));
    replies.push(new Response(JSON.stringify({ text: "ok" }), { status: 200 }));
    expect(await transcribe(audio, "voz.m4a")).toBe("ok");
    expect(calls[2].form.get("model_id")).toBe("scribe_v1");
  });

  it("explica cuando falta el permiso en la clave", async () => {
    replies.push(new Response(JSON.stringify({ detail: { status: "missing_permissions" } }), { status: 401 }));
    await expect(transcribe(audio, "voz.m4a")).rejects.toThrow(/permiso de Speech to Text/);
    expect(SttError).toBeDefined();
  });
});
