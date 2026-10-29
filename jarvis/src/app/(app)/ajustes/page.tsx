import Link from "next/link";
import { pageContext } from "@/lib/page";
import { aiConfigured } from "@/lib/ai/agent";
import { authMode, env } from "@/lib/env";
import { usingLocalDatabase } from "@/lib/db";
import { COMMON_ZONES } from "@/lib/time";
import { SettingsForm } from "@/components/SettingsForm";
import { PushPanel } from "@/components/PushPanel";
import { LogoutButton } from "@/components/LogoutButton";
import { IconBack } from "@/components/icons";

export default async function SettingsPage() {
  const { user, profile } = await pageContext();
  const zones = COMMON_ZONES.includes(profile.timezone) ? COMMON_ZONES : [profile.timezone, ...COMMON_ZONES];
  const mode = authMode();
  return (
    <main className="page space-y-6">
      <header className="flex items-center gap-2">
        <Link href="/" className="-ml-2 grid size-10 place-items-center text-muted" aria-label="Volver"><IconBack /></Link>
        <h1 className="text-2xl font-bold">Ajustes</h1>
      </header>

      <SettingsForm
        initial={{
          display_name: profile.display_name,
          timezone: profile.timezone,
          summary_enabled: profile.summary_enabled,
          summary_time: profile.summary_time,
        }}
        zones={zones}
      />

      <section id="avisos" className="scroll-mt-6">
        <h2 className="mb-2 text-lg font-semibold">Notificaciones</h2>
        <PushPanel tz={profile.timezone} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Inteligencia artificial</h2>
        <div className="card space-y-1 p-4 text-sm">
          {aiConfigured() ? (
            <>
              <p><span className="text-ok">●</span> Activa · modelo <code>{env.aiModel()}</code> · esfuerzo {env.aiEffort()}</p>
              <p className="text-muted">El modelo se cambia con la variable AI_MODEL en el servidor.</p>
            </>
          ) : (
            <>
              <p><span className="text-warn">●</span> Sin configurar</p>
              <p className="text-muted">Añade ANTHROPIC_API_KEY en el servidor para conversar con Jarvis. Los formularios funcionan sin ella.</p>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Cuenta</h2>
        <div className="card space-y-3 p-4 text-sm">
          <p>{user.email ?? "Modo local (vista previa)"}</p>
          <p className="text-muted">
            Acceso: {mode === "supabase" ? "Supabase Auth" : "contraseña local"} · Datos: {usingLocalDatabase() ? "base local de prueba (este equipo)" : "PostgreSQL en Supabase"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/instalar" className="btn btn-ghost text-sm">Instalar en iPhone</Link>
            <Link href="/tareas?ver=historial" className="btn btn-ghost text-sm">Historial</Link>
            <LogoutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
