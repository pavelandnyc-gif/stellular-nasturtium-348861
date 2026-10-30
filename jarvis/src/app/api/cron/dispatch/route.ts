import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/session";
import { dispatchDue } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El programador (pg_cron de Supabase, o cualquier servicio cron) llama aquí
// cada minuto con:  Authorization: Bearer <CRON_SECRET>
async function handle(req: Request) {
  const secret = env.cronSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET no está configurado." }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const report = await dispatchDue();
    return NextResponse.json({ ok: true, ...report, at: new Date().toISOString() });
  } catch (e) {
    console.error("dispatch", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
