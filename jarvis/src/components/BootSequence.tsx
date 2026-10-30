"use client";
import { useEffect, useState } from "react";

const LINES = ["Iniciando sistemas", "Conexión segura establecida", "Sincronizando agenda", "Reactor estable"];

/**
 * Pantalla de arranque tipo HUD. Si `waiting` es true, espera un toque
 * (en iPhone, ese toque es lo que permite que suene la voz).
 */
export function BootSequence({ name, waiting, running, onTap }: { name: string; waiting: boolean; running: boolean; onTap: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!running) return;
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= LINES.length + 1 ? n : n + 1)), 380);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div
      className="boot fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink"
      onClick={waiting ? onTap : undefined}
      role={waiting ? "button" : undefined}
      aria-label={waiting ? "Tocar para iniciar Jarvis" : undefined}
    >
      <div className="boot-grid" aria-hidden />
      <div className="boot-scan" aria-hidden />
      <div className={`relative grid size-56 place-items-center ${running ? "boot-power" : ""}`}>
        <span className="boot-ring boot-ring-1" />
        <span className="boot-ring boot-ring-2" />
        <span className="boot-ring boot-ring-3" />
        <span className={`reactor-core boot-core ${running ? "boot-core-on" : ""}`} style={{ inset: "78px" }} />
      </div>
      <div className="mt-8 h-32 w-72 font-mono text-[13px] tracking-wide text-cyan-soft/90">
        {waiting ? (
          <p className="animate-pulse text-center text-base">Toca para iniciar</p>
        ) : (
          <>
            {LINES.slice(0, shown).map((l) => (
              <p key={l} className="boot-line">
                <span className="text-cyan">›</span> {l}… <span className="text-ok">OK</span>
              </p>
            ))}
            {shown > LINES.length && <p className="boot-line mt-2 text-center text-base text-text">Bienvenido, {name}</p>}
          </>
        )}
      </div>
    </div>
  );
}
