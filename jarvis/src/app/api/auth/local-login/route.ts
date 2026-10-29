import { NextResponse } from "next/server";
import { authMode, env } from "@/lib/env";
import { LOCAL_COOKIE, LOCAL_MAX_AGE_S, safeEqual, signLocalSession } from "@/lib/session";

// Inicio de sesión del "modo local" (vista previa sin Supabase).
export async function POST(req: Request) {
  if (authMode() !== "local") return NextResponse.json({ ok: false, error: "El modo local no está activo." }, { status: 400 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  await new Promise((r) => setTimeout(r, 400)); // frena intentos repetidos
  if (typeof password !== "string" || !safeEqual(password, env.localPassword()!)) {
    return NextResponse.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCAL_COOKIE, await signLocalSession(env.sessionSecret()!), {
    httpOnly: true,
    sameSite: "lax",
    secure: (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https",
    path: "/",
    maxAge: LOCAL_MAX_AGE_S,
  });
  return res;
}
