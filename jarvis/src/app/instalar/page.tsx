import Link from "next/link";
import { InstallStatus } from "@/components/InstallStatus";

export const metadata = { title: "Instalar Jarvis" };

const STEPS = [
  { t: "Abre Jarvis en Safari", d: "Debe ser Safari (en iOS 16.4 o posterior). Escribe tu dirección de Jarvis, la que empieza con https://." },
  { t: "Toca el botón Compartir", d: "Es el cuadrado con una flecha hacia arriba ( ⬆︎ ), abajo en el centro de la pantalla (o arriba, en iPad)." },
  { t: "Elige “Agregar a pantalla de inicio”", d: "Desliza la lista hacia abajo si no lo ves. Deja el nombre “Jarvis” y toca Agregar." },
  { t: "Abre Jarvis desde el ícono nuevo", d: "Se abrirá a pantalla completa, como una app. Inicia sesión una vez ahí (la app instalada no comparte la sesión de Safari)." },
  { t: "Activa las notificaciones", d: "Ve a Ajustes (⚙︎) → Notificaciones → “Activar notificaciones” y acepta el permiso. Luego toca “Enviar prueba”." },
];

export default function InstallPage() {
  return (
    <main className="page" style={{ paddingBottom: "calc(var(--safe-bottom) + 32px)" }}>
      <Link href="/" className="text-sm text-cyan">← Volver</Link>
      <h1 className="mt-3 text-2xl font-bold">Instala Jarvis en tu iPhone</h1>
      <p className="mb-5 text-sm text-muted">Dos minutos. No necesitas App Store.</p>
      <InstallStatus />
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={i} className="rise card flex gap-4 p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan to-azure font-bold text-ink">{i + 1}</span>
            <div>
              <p className="font-semibold">{s.t}</p>
              <p className="text-sm text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="card mt-5 space-y-2 p-4 text-sm text-muted">
        <p className="font-semibold text-text">Si los avisos no llegan</p>
        <p>• Revisa Ajustes de iOS → Notificaciones → Jarvis: “Permitir notificaciones” activado.</p>
        <p>• El modo Concentración o No molestar puede silenciarlos.</p>
        <p>• Sin internet, el aviso llega cuando el iPhone se reconecta (si no pasaron más de 4 horas).</p>
        <p>• Si borras el ícono de Jarvis, se pierde la suscripción: vuelve a instalar y activar.</p>
      </div>
    </main>
  );
}
