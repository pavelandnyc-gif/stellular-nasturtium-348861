import { NextResponse } from "next/server";
import { authMode, env } from "@/lib/env";
import { query, usingLocalDatabase } from "@/lib/db";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// Diagnóstico público: solo dice SÍ/NO de cada configuración. Nunca muestra valores.
export async function GET() {
  let database: string;
  try {
    await query("select 1 from jarvis.profiles limit 1");
    database = usingLocalDatabase() ? "local (vista previa)" : "ok";
  } catch (e) {
    const msg = (e as Error).message ?? "";
    database = /password|auth/i.test(msg) ? "error: contraseña de DATABASE_URL incorrecta" : "error: no conecta";
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
  };
  const ok = checks.database === "ok" && checks.auth === "supabase" && checks.allowedEmails > 0 && checks.push && checks.cronSecret;
  return NextResponse.json({ ok, ...checks });
}
