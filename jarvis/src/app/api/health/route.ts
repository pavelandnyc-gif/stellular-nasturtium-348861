import { NextResponse } from "next/server";
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
export async function GET() {
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
    appUrl: !!env.appUrl(),
    // Huella de 6 caracteres de la contraseña: permite comprobar cuál está puesta sin revelarla.
    dbPasswordFingerprint: dbFingerprint(),
  };
  const ok = checks.database === "ok" && checks.auth === "supabase" && checks.allowedEmails > 0 && checks.push && checks.cronSecret;
  return NextResponse.json({ ok, ...checks });
}
