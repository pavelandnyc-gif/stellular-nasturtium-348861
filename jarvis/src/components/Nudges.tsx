"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBell } from "./icons";

/** Avisos discretos: instalar la app o activar notificaciones. */
export function Nudges() {
  const [state, setState] = useState<"install" | "notify" | "denied" | null>(null);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIOS && !standalone) return setState("install");
    if (!("Notification" in window) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "default") return setState("notify");
    navigator.serviceWorker?.ready
      .then((r) => r.pushManager.getSubscription())
      .then((s) => !s && setState("notify"))
      .catch(() => {});
  }, []);
  if (!state) return null;
  const content = {
    install: { href: "/instalar", text: "Agrega Jarvis a tu pantalla de inicio para recibir avisos.", cta: "Cómo instalar" },
    notify: { href: "/ajustes#avisos", text: "Los avisos están desactivados en este dispositivo.", cta: "Activar" },
    denied: { href: "/ajustes#avisos", text: "Bloqueaste las notificaciones. Puedes reactivarlas en Ajustes de iOS.", cta: "Ver cómo" },
  }[state];
  return (
    <Link href={content.href} className="rise card mb-4 flex items-center gap-3 border-cyan/30 p-3 text-sm">
      <IconBell className="size-5 shrink-0 text-cyan" />
      <span className="flex-1 text-muted">{content.text}</span>
      <span className="font-semibold text-cyan">{content.cta}</span>
    </Link>
  );
}
