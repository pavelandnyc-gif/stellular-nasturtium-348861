import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

// Confirmación que envía el service worker del iPhone al recibir (o tocar) un aviso.
// No usa la sesión (el service worker puede despertar sin cookies vigentes):
// se valida con el token único de cada aviso.
const schema = z.object({ id: z.string().uuid(), token: z.string().min(16).max(64), event: z.enum(["received", "clicked"]) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { id, token, event } = parsed.data;
  // Tocar un aviso también prueba que llegó: ambos casos marcan "recibido".
  await query(
    `update jarvis.notifications set received_at = coalesce(received_at, now()),
       clicked_at = case when $3 then coalesce(clicked_at, now()) else clicked_at end
     where id = $1 and receipt_token = $2`,
    [id, token, event === "clicked"],
  );
  return NextResponse.json({ ok: true });
}
