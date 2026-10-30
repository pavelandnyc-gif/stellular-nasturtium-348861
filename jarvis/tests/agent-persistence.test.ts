import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// IA simulada: devuelve respuestas guionizadas para comprobar el ciclo
// "la IA pide una herramienta → el servidor valida y guarda → la IA confirma".
const ai = vi.hoisted(() => ({ script: [] as any[], requests: [] as any[] }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static BadRequestError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    beta = {
      messages: {
        create: async (req: any) => {
          ai.requests.push(structuredClone(req));
          return ai.script.shift();
        },
      },
    };
  }
  return { default: Anthropic };
});
vi.mock("web-push", () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) } }));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pglite-"));
process.env.PGLITE_DIR = dir;
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.AI_MODEL = "claude-opus-5-5";

const db = await import("@/lib/db");
const { chat, saveChat } = await import("@/lib/ai/agent");
const { getProfile } = await import("@/lib/repo/profile");

const U = "33333333-3333-4333-8333-333333333333";
const TZ = "America/New_York";

afterAll(async () => {
  await db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

const toolUse = (id: string, name: string, input: unknown) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});
const text = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

describe("conversación con Jarvis (IA simulada)", () => {
  it("guarda la idea y solo entonces muestra la confirmación", async () => {
    await getProfile(U, null);
    ai.script.push(
      toolUse("t1", "save_idea", { content: "Quiero aprender a editar videos" }),
      text("Guardada, Javier: “Quiero aprender a editar videos”."),
    );
    const r = await chat(U, TZ, "Guarda esta idea: quiero aprender a editar videos");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("idea_saved");
    expect(await db.query("select * from jarvis.ideas where user_id = $1", [U])).toHaveLength(1);

    // La petición usa el modelo configurado, herramientas estrictas, contexto con fecha y fallbacks.
    const req = ai.requests[0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.tools.length).toBeGreaterThan(5);
    expect(JSON.stringify(req.messages)).toContain("zona America/New_York");
    // El resultado de la herramienta vuelve a la IA con ok: true
    const toolResult = ai.requests[1].messages.at(-1).content[0];
    expect(JSON.parse(toolResult.content).ok).toBe(true);
  });

  it("si la herramienta falla, no hay tarjeta de 'hecho'", async () => {
    ai.script.push(
      toolUse("t2", "create_task", {
        title: "Llamar a mamá",
        date: "2026-13-40",
        time: "10:00",
        priority: null,
        repeat: { type: "none", days: [] },
        notes: null,
      }),
      text("No pude guardarla: la fecha no es válida. ¿Qué día quieres?"),
    );
    const r = await chat(U, TZ, "Recuérdame llamar a mi mamá el 40 de trecember");
    expect(r.actions).toHaveLength(0);
    const sent = ai.requests.at(-1).messages.at(-1).content[0];
    expect(sent.is_error).toBe(true);
    expect(await db.query("select * from jarvis.tasks where user_id = $1", [U])).toHaveLength(0);
  });

  it("incluye el historial reciente para entender 'esta tarea'", async () => {
    await saveChat(U, "user", "Recuérdame comprar pan mañana a las 6 pm");
    await saveChat(U, "assistant", "Listo.", [{ type: "task_created", title: "Recordatorio creado", detail: "Comprar pan", href: "/tareas/abc" }]);
    ai.script.push(text("¿A qué hora mañana?"));
    await chat(U, TZ, "Pasa esta tarea para mañana");
    const msgs = ai.requests.at(-1).messages;
    expect(JSON.stringify(msgs)).toContain("Comprar pan");
    expect(msgs[0].role).toBe("user");
  });
});

describe("persistencia", () => {
  it("los datos siguen ahí después de cerrar y volver a abrir la base", async () => {
    await db.query("insert into jarvis.tasks (user_id, title) values ($1, 'Persistente')", [U]);
    await db.closeDb();
    const rows = await db.query("select title from jarvis.tasks where user_id = $1", [U]);
    expect(rows.map((r) => r.title)).toContain("Persistente");
    const ideas = await db.query("select content from jarvis.ideas where user_id = $1", [U]);
    expect(ideas).toHaveLength(1);
  });
});
