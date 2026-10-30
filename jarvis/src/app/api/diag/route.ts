import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body } from "@/lib/api";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/session";

export const dynamic = "force-dynamic";

// El iPhone reporta aquí cada paso de la conversación por voz y sus errores.
export const POST = api(async (req, { user }) => {
  const d = await body(
    req,
    z.object({ stage: z.string().max(40), message: z.string().max(500), detail: z.record(z.string(), z.unknown()).optional() }),
  );
  await query("insert into jarvis.diag_log (user_id, stage, message, detail) values ($1, $2, $3, $4::jsonb)", [
    user.id,
    d.stage,
    d.message,
    JSON.stringify({ ...(d.detail ?? {}), ua: req.headers.get("user-agent")?.slice(0, 200) }),
  ]);
  await query("delete from jarvis.diag_log where id < (select max(id) - 300 from jarvis.diag_log)");
  return { ok: true };
});

// Lectura del registro (solo con CRON_SECRET).
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const rows = await query("select stage, message, detail, created_at from jarvis.diag_log order by id desc limit 60");
  return NextResponse.json({ ok: true, rows });
}
