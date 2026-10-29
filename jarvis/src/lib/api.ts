import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireUser, type CurrentUser } from "./auth";
import { getProfile, type Profile } from "./repo/profile";

export interface ApiContext {
  user: CurrentUser;
  profile: Profile;
}

/** Envuelve una ruta de API: exige sesión válida y traduce errores a JSON. */
export function api<P = Record<string, string>>(
  fn: (req: Request, ctx: ApiContext, params: P) => Promise<unknown>,
) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const user = await requireUser();
      const profile = await getProfile(user.id, user.email);
      const data = await fn(req, { user, profile }, await route.params);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos: " + e.issues.map((i) => `${i.path.join(".") || "valor"}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  console.error(e);
  return NextResponse.json({ ok: false, error: "Error interno del servidor." }, { status: 500 });
}

export async function body<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "El cuerpo de la petición no es JSON válido.");
  }
  return schema.parse(json);
}

export function notFound(what = "Elemento") {
  return new HttpError(404, `${what} no encontrado.`);
}
