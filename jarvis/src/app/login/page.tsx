import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { authMode, env } from "@/lib/env";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getCurrentUser()) redirect(safeNext);
  const mode = authMode();
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="rise mb-8 text-center">
        <img src="/icons/icon-192.png" alt="" className="mx-auto mb-4 size-20 rounded-[22px] shadow-[0_0_40px_-8px_rgba(34,211,238,.6)]" />
        <h1 className="text-3xl font-bold tracking-tight">Jarvis</h1>
        <p className="text-sm text-muted">Tu asistente personal</p>
      </div>
      {mode === "none" ? (
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-semibold text-warn">Falta configurar el acceso</p>
          <p className="text-muted">
            Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o, para una prueba local, LOCAL_AUTH_PASSWORD y SESSION_SECRET).
            Consulta el README.
          </p>
        </div>
      ) : (
        <LoginForm
          mode={mode}
          next={safeNext}
          supabaseUrl={env.supabaseUrl() ?? ""}
          supabaseKey={env.supabaseKey() ?? ""}
        />
      )}
      <a href="/instalar" className="mt-6 text-center text-sm text-cyan">¿Cómo instalo Jarvis en mi iPhone?</a>
    </main>
  );
}
