"use client";
import { useEffect, useState } from "react";

export function InstallStatus() {
  const [s, setS] = useState<"standalone" | "safari" | "other" | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const safari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setS(standalone ? "standalone" : safari || !ios ? "safari" : "other");
  }, []);
  if (s === "standalone")
    return <p className="card mb-4 border-ok/40 p-3 text-sm text-ok">✓ Ya estás usando Jarvis como app instalada.</p>;
  if (s === "other")
    return <p className="card mb-4 border-warn/40 p-3 text-sm text-warn">Estás en otro navegador. En iPhone, abre este enlace en Safari para instalarla.</p>;
  return null;
}
