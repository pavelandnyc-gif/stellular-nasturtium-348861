"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadVoicePrefs, speak, speechSupported, stopSpeaking, voicesReady } from "./voice";

const LAST_KEY = "jarvis.lastGreeting";
const REPEAT_AFTER_MS = 20 * 60_000; // vuelve a saludar si pasaron 20 min desde el último saludo

/** Bienvenida al abrir la app: reactor animado + saludo escrito y hablado. */
export function JarvisGreeting({ text, aiReady }: { text: string; aiReady: boolean }) {
  const [shown, setShown] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;

  const say = useCallback(async () => {
    const h = speak(
      textRef.current,
      loadVoicePrefs(),
      () => setSpeaking(true),
      () => setSpeaking(false),
    );
    const ok = await h.started;
    if (ok) {
      setNeedsTap(false);
      try {
        localStorage.setItem(LAST_KEY, String(Date.now()));
      } catch {
        /* */
      }
    }
    return ok;
  }, []);

  // Texto que aparece letra por letra, como en la película.
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text]);

  // Al abrir: intenta hablar. iOS solo permite la voz después de un toque, así que
  // si se bloquea, el primer toque en cualquier parte de la pantalla la activa.
  useEffect(() => {
    if (!speechSupported() || !loadVoicePrefs().greet) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    } catch {
      /* */
    }
    if (Date.now() - last < REPEAT_AFTER_MS) return;
    let cancelled = false;
    const onTap = () => {
      cleanup();
      if (!cancelled) say();
    };
    const cleanup = () => {
      document.removeEventListener("touchend", onTap);
      document.removeEventListener("click", onTap);
    };
    voicesReady().then(async () => {
      if (cancelled) return;
      const ok = await say();
      if (!ok && !cancelled) {
        setNeedsTap(true);
        document.addEventListener("touchend", onTap, { once: true });
        document.addEventListener("click", onTap, { once: true });
      }
    });
    return () => {
      cancelled = true;
      cleanup();
      stopSpeaking();
    };
  }, [say]);

  return (
    <section className="rise mb-6 flex flex-col items-center text-center">
      <button
        onClick={() => (speaking ? stopSpeaking() : say())}
        aria-label={speaking ? "Silenciar a Jarvis" : "Escuchar a Jarvis"}
        className="relative my-2 grid size-36 place-items-center"
      >
        <span className={`reactor ${speaking ? "reactor-talking" : ""}`} aria-hidden>
          <span className="reactor-ring reactor-ring-1" />
          <span className="reactor-ring reactor-ring-2" />
          <span className="reactor-ring reactor-ring-3" />
          <span className="reactor-core" />
        </span>
      </button>
      <p className="min-h-[4.5rem] max-w-md text-[17px] leading-relaxed text-text/95">
        {shown}
        {shown.length < text.length && <span className="animate-pulse text-cyan">▍</span>}
      </p>
      {needsTap && (
        <p className="mt-1 text-xs text-cyan-soft">Toca la pantalla para escuchar a Jarvis 🔊</p>
      )}
      <Link href="/jarvis" className="btn btn-primary mt-4 px-6">
        {aiReady ? "Hablar con Jarvis" : "Abrir Jarvis"}
      </Link>
    </section>
  );
}
