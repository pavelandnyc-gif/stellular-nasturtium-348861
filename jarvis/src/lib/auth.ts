import "server-only";
import { cookies } from "next/headers";
import { authMode, env } from "./env";
import { LOCAL_COOKIE, verifyLocalSession } from "./session";
import { createSupabaseServer } from "./supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/** Identidad verificada en el servidor. Nunca confía en datos del navegador. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const mode = authMode();
  if (mode === "supabase") {
    const supabase = await createSupabaseServer();
    // getClaims() verifica la firma del token (no basta con leer la cookie).
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    const email = (data.claims.email as string | undefined)?.toLowerCase() ?? null;
    const allowed = env.allowedEmails();
    // Lista cerrada: si ALLOWED_EMAILS está vacío, nadie entra (evita que un
    // desconocido cree una cuenta en tu Supabase y gaste tu IA).
    if (!email || !allowed.includes(email)) return null;
    return { id: data.claims.sub, email };
  }
  if (mode === "local") {
    const store = await cookies();
    const uid = await verifyLocalSession(env.sessionSecret()!, store.get(LOCAL_COOKIE)?.value);
    return uid ? { id: uid, email: null } : null;
  }
  return null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
  return user;
}
