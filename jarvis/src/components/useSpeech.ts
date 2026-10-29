"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Dictado por voz con la Web Speech API (si el navegador la ofrece).
// En el iPhone, el dictado del teclado (el micrófono del teclado) funciona siempre.

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setError(null);
    const r: Rec = new Ctor();
    r.lang = "es-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e: any) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current(text.trim(), final);
    };
    r.onerror = (e: any) => {
      const msg =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Permiso de micrófono denegado. Usa el micrófono del teclado."
          : e.error === "no-speech"
            ? "No escuché nada. Inténtalo de nuevo."
            : "El dictado no está disponible aquí. Usa el micrófono del teclado.";
      setError(msg);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("No se pudo iniciar el dictado. Usa el micrófono del teclado.");
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
