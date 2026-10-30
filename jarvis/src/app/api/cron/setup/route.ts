import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { safeEqual } from "@/lib/session";

export const dynamic = "force-dynamic";

// Configura (o actualiza) el programador de avisos dentro de Supabase:
// pg_cron llama cada minuto a /api/cron/dispatch con el CRON_SECRET.
// Es lo mismo que db/supabase-cron.sql, pero sin tener que pegar nada a mano.
// Protegido con CRON_SECRET; se puede ejecutar varias veces sin duplicar nada.
export async function POST(req: Request) {
  const secret = env.cronSecret();
  const appUrl = env.appUrl();
  if (!secret || !appUrl) return NextResponse.json({ ok: false, error: "Faltan CRON_SECRET o APP_URL." }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = `${appUrl}/api/cron/dispatch`;
  const steps: string[] = [];
  try {
    await query("create extension if not exists pg_cron");
    await query("create extension if not exists pg_net");
    steps.push("extensiones pg_cron y pg_net");

    // Guarda dirección y secreto cifrados en Vault (si está disponible).
    let useVault = true;
    try {
      for (const [name, value] of [
        ["jarvis_dispatch_url", url],
        ["jarvis_cron_secret", secret],
      ]) {
        const existing = await query<{ id: string }>("select id from vault.secrets where name = $1", [name]);
        if (existing.length) await query("select vault.update_secret($1::uuid, $2)", [existing[0].id, value]);
        else await query("select vault.create_secret($1, $2)", [value, name]);
      }
      steps.push("dirección y secreto guardados en Vault");
    } catch {
      useVault = false;
      steps.push("Vault no disponible: el secreto queda en la tarea programada");
    }

    const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const urlExpr = useVault ? "(select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_dispatch_url')" : lit(url);
    const secretExpr = useVault
      ? "(select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret')"
      : lit(secret);
    const command = `select net.http_post(
      url := ${urlExpr},
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || ${secretExpr}),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )`;

    await query("select cron.unschedule(jobid) from cron.job where jobname = 'jarvis-dispatch'");
    await query("select cron.schedule('jarvis-dispatch', '* * * * *', $1)", [command]);
    const jobs = await query<{ jobid: number; schedule: string; active: boolean }>(
      "select jobid, schedule, active from cron.job where jobname = 'jarvis-dispatch'",
    );
    steps.push("tarea 'jarvis-dispatch' programada cada minuto");
    return NextResponse.json({ ok: true, url, steps, job: jobs[0] ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, steps, error: (e as Error).message }, { status: 500 });
  }
}

// Estado: últimas ejecuciones del programador y respuestas recibidas.
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const job = await query("select jobid, schedule, active from cron.job where jobname = 'jarvis-dispatch'");
    const runs = await query(
      `select d.status, d.start_time from cron.job_run_details d join cron.job j on j.jobid = d.jobid
       where j.jobname = 'jarvis-dispatch' order by d.start_time desc limit 5`,
    );
    const responses = await query(
      "select status_code, left(content, 160) as content, created from net._http_response order by created desc limit 5",
    );
    return NextResponse.json({ ok: true, job: job[0] ?? null, runs, responses });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
