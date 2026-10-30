import { afterAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory://";
process.env.ELEVENLABS_API_KEY = "test";
process.env.ELEVENLABS_MONTHLY_CHAR_LIMIT = "100";

const calls: any[] = [];
let fail = false;
vi.stubGlobal("fetch", async (url: string, init: any) => {
  calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
  if (fail) return new Response("error", { status: 500 });
  return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
});

const { synthesize, ttsUsage, TtsLimitError } = await import("@/lib/tts");
const { closeDb } = await import("@/lib/db");
afterAll(() => closeDb());

describe("voz premium (ElevenLabs)", () => {
  it("llama a ElevenLabs con la voz por defecto y cuenta los caracteres", async () => {
    const audio = await synthesize("Buenos días, Javier."); // 20 caracteres
    expect(audio.byteLength).toBe(3);
    expect(calls[0].url).toContain("/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb");
    expect(calls[0].headers["xi-api-key"]).toBe("test");
    expect(calls[0].body.model_id).toBe("eleven_multilingual_v2");
    expect((await ttsUsage()).used).toBe(20);
  });

  it("si ElevenLabs falla, no se cobra del presupuesto", async () => {
    fail = true;
    await expect(synthesize("Esto falla")).rejects.toThrow();
    fail = false;
    expect((await ttsUsage()).used).toBe(20);
  });

  it("una frase repetida sale de la memoria y no se vuelve a pagar", async () => {
    const before = calls.length;
    const used = (await ttsUsage()).used;
    await synthesize("Buenos días, Jefe.");
    await synthesize("Buenos días, Jefe.");
    expect(calls.length).toBe(before + 1);
    expect((await ttsUsage()).used).toBe(used + "Buenos días, Jefe.".length);
  });

  it("nunca se pasa del tope mensual", async () => {
    const used = (await ttsUsage()).used;
    await synthesize("x".repeat(100 - used - 5)); // quedan 5
    await expect(synthesize("y".repeat(20))).rejects.toBeInstanceOf(TtsLimitError);
    const u = await ttsUsage();
    expect(u.used).toBe(95);
    expect(u.remaining).toBe(5);
  });
});
