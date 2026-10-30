import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { safeEqual } from "@/lib/session";
import { checkTts } from "@/lib/tts";
import { getWeather } from "@/lib/weather";
import { TOOL_DEFS } from "@/lib/ai/tools";
import { aiSelfTest } from "@/lib/ai/agent";
import { authMode, env } from "@/lib/env";
import { createHash } from "node:crypto";
import { parseDatabaseUrl, query, usingLocalDatabase } from "@/lib/db";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// Traduce el error de conexión a una causa probable, sin mostrar la dirección ni la contraseña.
function describeDbError(e: unknown) {
  const err = e as { message?: string; code?: string };
  const msg = err.message ?? "";
  if (!env.databaseUrl()) return "error: falta DATABASE_URL";
  if (err.code === "28P01" || /password authentication failed/i.test(msg)) return "error: contraseña incorrecta en DATABASE_URL";
  if (/tenant or user not found/i.test(msg)) return "error: usuario o servidor del pooler incorrecto en DATABASE_URL";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "error: el servidor de DATABASE_URL no existe (revisa la dirección)";
  if (/Invalid URL|URI|malformed/i.test(msg)) return "error: DATABASE_URL mal escrita (¿símbolos especiales en la contraseña?)";
  if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(msg)) return "error: tiempo de espera agotado al conectar";
  if (/migraci/i.test(msg)) return "error: conectó, pero falló la migración";
  return `error: no conecta (código ${err.code ?? "desconocido"})`;
}

function dbFingerprint() {
  const url = env.databaseUrl();
  const p = url ? parseDatabaseUrl(url) : null;
  return p ? createHash("sha256").update(p.password).digest("hex").slice(0, 6) : null;
}

// Diagnóstico público: solo dice SÍ/NO de cada configuración. Nunca muestra valores.
export async function GET(req: Request) {
  let database: string;
  try {
    await query("select 1 from jarvis.profiles limit 1");
    database = usingLocalDatabase() ? "local (vista previa)" : "ok";
  } catch (e) {
    database = describeDbError(e);
  }
  const checks = {
    database,
    auth: authMode(),
    allowedEmails: env.allowedEmails().length,
    push: pushConfigured(),
    cronSecret: !!env.cronSecret(),
    ai: !!env.anthropicKey(),
    aiModel: env.aiModel(),
    voicePremium: !!env.elevenKey(),
    appUrl: !!env.appUrl(),
    // Huella de 6 caracteres de la contraseña: permite comprobar cuál está puesta sin revelarla.
    dbPasswordFingerprint: dbFingerprint(),
  };
  // Con el CRON_SECRET se puede pedir además una verificación real de la clave de IA
  // (consulta gratuita a la lista de modelos; no genera texto ni consume créditos).
  let aiCheck: string | undefined;
  const secret = env.cronSecret();
  if (new URL(req.url).searchParams.has("ai") && secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    if (!env.anthropicKey()) aiCheck = "sin clave";
    else {
      try {
        const client = new Anthropic({ apiKey: env.anthropicKey(), maxRetries: 1, timeout: 20_000 });
        const m = await client.models.retrieve(env.aiModel());
        // Valida también las herramientas de Jarvis contra la API (contar tokens no genera texto).
        const count = await client.beta.messages.countTokens({
          model: env.aiModel(),
          tools: TOOL_DEFS,
          messages: [{ role: "user", content: "Hola" }],
        });
        aiCheck = `ok: ${m.id} · herramientas válidas (${count.input_tokens} tokens)`;
        // ?ai=full: además hace una consulta real con la misma configuración que el chat.
        if (new URL(req.url).searchParams.get("ai") === "full") aiCheck += ` · consulta real ${await aiSelfTest()}`;
      } catch (e) {
        aiCheck =
          e instanceof Anthropic.AuthenticationError
            ? "error: clave inválida"
            : e instanceof Anthropic.NotFoundError
              ? "error: el modelo no existe o la cuenta no tiene acceso"
              : e instanceof Anthropic.BadRequestError
                ? `error: ${e.message.slice(0, 200)}`
                : e instanceof Anthropic.PermissionDeniedError
                ? "error: la cuenta no tiene permiso (¿falta saldo?)"
                : `error: ${(e as { status?: number }).status ?? "conexión"}`;
      }
    }
  }
  const voiceCheck = aiCheck !== undefined && env.elevenKey() ? await checkTts() : undefined;
  let weatherCheck: string | undefined;
  if (aiCheck !== undefined) {
    const w = await getWeather("America/New_York", "F");
    weatherCheck = w ? `ok: ${w.temp}°F ${w.desc}` : "error: no conecta con Open-Meteo";
  }
  const ok = checks.database === "ok" && checks.auth === "supabase" && checks.allowedEmails > 0 && checks.push && checks.cronSecret;
  return NextResponse.json({ ok, ...checks, ...(aiCheck ? { aiCheck } : {}), ...(voiceCheck ? { voiceCheck } : {}), ...(weatherCheck ? { weatherCheck } : {}) });
}
