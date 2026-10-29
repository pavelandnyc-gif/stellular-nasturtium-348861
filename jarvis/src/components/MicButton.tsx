"use client";
import { IconMic } from "./icons";
import { useSpeech } from "./useSpeech";
import { toast } from "./Toast";
import { useEffect } from "react";

/** Botón de micrófono. Si el navegador no permite dictado, no se muestra
 *  (el micrófono del teclado del iPhone sigue disponible). */
export function MicButton({
  onText,
  onListening,
  className = "",
}: {
  onText: (text: string, final: boolean) => void;
  onListening?: (on: boolean) => void;
  className?: string;
}) {
  const { supported, listening, error, start, stop } = useSpeech(onText);
  useEffect(() => {
    if (error) toast(error, "info");
  }, [error]);
  useEffect(() => {
    onListening?.(listening);
  }, [listening, onListening]);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-label={listening ? "Detener dictado" : "Hablar"}
      aria-pressed={listening}
      className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors ${
        listening ? "listening bg-bad text-white" : "bg-white/5 text-cyan-soft"
      } ${className}`}
    >
      <IconMic className="size-5" />
    </button>
  );
}

export function ListeningBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-red-200">
      <span className="size-2 animate-pulse rounded-full bg-bad" /> Escuchando… habla ahora
    </div>
  );
}
