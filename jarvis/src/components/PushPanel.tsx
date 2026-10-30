"use client";
import { useCallback, useEffect, useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";

interface Status {
  configured: boolean;
  publicKey: string | null;
  devices: { id: string; host: string; user_agent: string | null; last_success_at: string | null; last_error: string | null; failures: number }[];
  recent: {
    id: string;
    kind: string;
    title: string;
    fire_at: string;
    status: string;
    attempts: number;
    sent_at: string | null;
    received_at: string | null;
    clicked_at: string | null;
    last_error: string | null;
  }[];
}

function keyToBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function statusLabel(n: Status["recent"][number]) {
  if (n.received_at) return { text: n.clicked_at ? "Recibido y abierto" : "Recibido por el dispositivo", tone: "text-ok" };
  switch (n.status) {
    case "pending":
      return { text: n.attempts ? `Reintentando (${n.attempts})` : "Programado", tone: "text-muted" };
    case "sending":
      return { text: "Enviando…", tone: "text-muted" };
    case "sent":
      return { text: "Enviado al servicio push", tone: "text-cyan" };
    case "failed":
      return { text: "Falló", tone: "text-bad" };
    case "skipped":
      return { text: "Omitido (ya estaba hecho)", tone: "text-muted" };
    case "expired":
      return { text: "Vencido sin enviar", tone: "text-warn" };
    default:
      return { text: n.status, tone: "text-muted" };
  }
}

export function PushPanel({ tz }: { tz: string }) {
  const [env, setEnv] = useState<{ supported: boolean; standalone: boolean; ios: boolean; permission: NotificationPermission | "unsupported" }>({
    supported: false,
    standalone: false,
    ios: false,
    permission: "unsupported",
  });
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call<Status>("/api/push/status"));
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setEnv({
      supported,
      standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true,
      ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
      permission: supported ? Notification.permission : "unsupported",
    });
    if (supported) {
      navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then(setSub).catch(() => {});
    }
    refresh();
  }, [refresh]);

  // Activación: debe ocurrir dentro del toque del botón (requisito de iOS).
  async function enable() {
    if (!status?.publicKey) return toast("El servidor aún no tiene claves VAPID configuradas.", "error");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setEnv((e) => ({ ...e, permission }));
      if (permission !== "granted") {
        toast("Sin permiso no puedo enviarte avisos. Puedes cambiarlo en Ajustes de iOS → Notificaciones → Jarvis.", "error");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const s =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(status.publicKey) }));
      await call("/api/push/subscribe", "POST", s.toJSON());
      setSub(s);
      toast("🔔 Avisos activados en este dispositivo");
      refresh();
    } catch (e) {
      if ((e as Error).message !== "auth") toast(`No se pudo activar la suscripción: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!sub) return;
    setBusy(true);
    try {
      await call("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe();
      setSub(null);
      toast("Avisos desactivados en este dispositivo", "info");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setTestMsg("Enviando…");
    try {
      const r = await call<{ id: string; status: string }>("/api/push/test", "POST");
      setTestMsg("✓ Enviado al servicio push. Esperando confirmación del dispositivo…");
      // Espera hasta 20 s la confirmación del service worker.
      for (let i = 0; i < 10; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const s = await call<{ notification: { received_at: string | null } | null }>(`/api/push/status?id=${r.id}`);
        if (s.notification?.received_at) {
          setTestMsg("✓ Recibido por el dispositivo.");
          refresh();
          return;
        }
      }
      setTestMsg("Enviado, pero el dispositivo aún no confirma. Puede tardar si hay poca señal o si iOS está en modo Concentración/Ahorro de batería.");
      refresh();
    } catch (e) {
      setTestMsg(`✗ ${(e as Error).message}`);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("es-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  let state: { tone: string; text: string };
  if (!status) state = { tone: "text-muted", text: "Comprobando…" };
  else if (!status.configured) state = { tone: "text-warn", text: "El servidor no tiene claves VAPID: los avisos no se pueden enviar todavía." };
  else if (env.ios && !env.standalone) state = { tone: "text-warn", text: "En iPhone los avisos solo funcionan con Jarvis instalado en la pantalla de inicio." };
  else if (!env.supported) state = { tone: "text-warn", text: "Este navegador no admite notificaciones push." };
  else if (env.permission === "denied") state = { tone: "text-bad", text: "Bloqueadas. Actívalas en Ajustes de iOS → Notificaciones → Jarvis." };
  else if (sub) state = { tone: "text-ok", text: "Activadas en este dispositivo." };
  else state = { tone: "text-warn", text: "Desactivadas en este dispositivo." };

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <p className={`text-sm font-medium ${state.tone}`}>● {state.text}</p>
        <div className="grid grid-cols-2 gap-2">
          {sub ? (
            <button className="btn btn-ghost text-sm" disabled={busy} onClick={disable}>Desactivar aquí</button>
          ) : (
            <button
              className="btn btn-primary text-sm"
              disabled={busy || !env.supported || !status?.configured || env.permission === "denied" || (env.ios && !env.standalone)}
              onClick={enable}
            >
              Activar notificaciones
            </button>
          )}
          <button className="btn btn-ghost text-sm" disabled={busy || !status?.devices.length} onClick={test}>
            Enviar prueba
          </button>
        </div>
        {testMsg && <p className="text-sm text-muted">{testMsg}</p>}
        <p className="text-xs text-muted">
          Dispositivos suscritos: {status?.devices.length ?? 0}
          {status?.devices.some((d) => d.last_error) && " · alguno reportó errores recientes"}
        </p>
      </div>

      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Historial de avisos</summary>
        <ul className="mt-3 divide-y divide-line/60">
          {status?.recent.length ? (
            status.recent.map((n) => {
              const l = statusLabel(n);
              return (
                <li key={n.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{fmt(n.fire_at)}</span>
                  </div>
                  <div className={`text-xs ${l.tone}`}>
                    {l.text}
                    {n.last_error && n.status !== "sent" ? ` · ${n.last_error}` : ""}
                  </div>
                </li>
              );
            })
          ) : (
            <li className="py-2 text-muted">Aún no hay avisos.</li>
          )}
        </ul>
      </details>

      <p className="px-1 text-xs leading-relaxed text-muted">
        <b>Enviado al servicio push</b> significa que Apple aceptó el aviso. <b>Recibido por el dispositivo</b> significa que tu iPhone
        confirmó que le llegó. La entrega puede retrasarse o no ocurrir si el iPhone no tiene conexión, está en modo Concentración o
        Ahorro de energía, o si desactivas las notificaciones de Jarvis en Ajustes de iOS.
      </p>
    </div>
  );
}
