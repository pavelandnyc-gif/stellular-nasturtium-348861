"use client";
/** Envía un evento de diagnóstico al servidor (sin bloquear ni mostrar errores). */
export function diag(stage: string, message: string, detail: Record<string, unknown> = {}) {
  try {
    fetch("/api/diag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, message: message.slice(0, 500), detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* */
  }
}
