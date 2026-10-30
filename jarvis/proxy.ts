import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LOCAL_COOKIE, verifyLocalSession } from "@/lib/session";

// Se ejecuta antes de cada página: refresca la sesión de Supabase y manda a
// /login a quien no la tenga. La autorización real se repite en cada ruta del
// servidor (requireUser), así que esto es solo la primera barrera.

const PUBLIC_PATHS = ["/login", "/instalar", "/api/cron/", "/api/push/receipt", "/api/auth/", "/api/health"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

  let response = NextResponse.next({ request });
  let signedIn = false;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  } else if (process.env.SESSION_SECRET && process.env.LOCAL_AUTH_PASSWORD) {
    signedIn = !!(await verifyLocalSession(process.env.SESSION_SECRET, request.cookies.get(LOCAL_COOKIE)?.value));
  }

  if (!signedIn && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Inicia sesión para continuar." }, { status: 401 });
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|apple-touch-icon.png|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
