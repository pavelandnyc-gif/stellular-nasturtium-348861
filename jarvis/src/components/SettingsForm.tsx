"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";

interface S {
  display_name: string;
  timezone: string;
  summary_enabled: boolean;
  summary_time: string;
}

export function SettingsForm({ initial, zones }: { initial: S; zones: string[] }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    try {
      await call("/api/settings", "PATCH", s);
      toast(s.summary_enabled ? `Guardado. Resumen diario a las ${s.summary_time}.` : "Ajustes guardados");
      router.refresh();
    } catch {
      /* */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">Perfil y horario</h2>
        <div className="card space-y-3 p-4">
          <label className="block text-xs text-muted">
            Cómo te llama Jarvis
            <input className="field mt-1" value={s.display_name} maxLength={60} onChange={(e) => setS({ ...s, display_name: e.target.value })} />
          </label>
          <label className="block text-xs text-muted">
            Zona horaria (respeta el horario de verano automáticamente)
            <select className="field mt-1" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-semibold">Resumen diario</h2>
        <div className="card space-y-3 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Enviarme un resumen de mi día<br /><span className="text-xs text-muted">Tareas de hoy, atrasadas y hábitos, con tus datos reales.</span></span>
            <input type="checkbox" className="size-6 accent-cyan-400" checked={s.summary_enabled} onChange={(e) => setS({ ...s, summary_enabled: e.target.checked })} />
          </label>
          {s.summary_enabled && (
            <label className="block text-xs text-muted">
              Hora
              <input type="time" className="field mt-1" value={s.summary_time} onChange={(e) => setS({ ...s, summary_time: e.target.value || "08:00" })} />
            </label>
          )}
        </div>
      </div>
      {dirty && (
        <button className="btn btn-primary w-full" disabled={busy || !s.display_name.trim()} onClick={save}>
          Guardar cambios
        </button>
      )}
    </section>
  );
}
