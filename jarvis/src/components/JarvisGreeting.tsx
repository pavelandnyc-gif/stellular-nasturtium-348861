"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./fetcher";
import { IconCheck } from "./icons";
import { closeMic, openMic, record, recordingSupported, type Recorder } from "./recorder";
import { toast } from "./Toast";
import { loadVoicePrefs, prepare, speak, speechSupported, stopSpeaking, unlockAudio, voicesReady } from "./voice";

const LAST_KEY = "jarvis.lastGreeting";
const REPEAT_AFTER_MS = 20 * 60_000; // vuelve a saludar si pasaron 20 min desde el último saludo

type Mode = "idle" | "listening" | "thinking" | "speaking";
interface Action {
  title: string;
  detail: string;
  href?: string;
}

const STATUS: Record<Mode, string> = {
  idle: "Toca el reactor para hablar",
  listening: "Te escucho…",
  thinking: "Procesando…",
  speaking: "Jarvis está hablando · toca para interrumpir",
};

/**
 * Pantalla de bienvenida: saludo hablado al abrir y conversación por voz
 * tocando el reactor (escucha → entiende → responde en voz alta → vuelve a escuchar).
 */
export function JarvisGreeting({ text, aiReady }: { text: string; aiReady: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [needsTap, setNeedsTap] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const textRef = useRef(text);
  textRef.current = text;
  const active = useRef(false); // conversación en curso
  const recRef = useRef<Recorder | null>(null);
  const coreRef = useRef<HTMLSpanElement>(null);
  const greetedRef = useRef(false);

  const markGreeted = () => {
    greetedRef.current = true;
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {
      /* */
    }
  };

  const sayGreeting = useCallback(async () => {
    setMode("speaking");
    const h = speak(textRef.current, loadVoicePrefs(), undefined, () => setMode((m) => (m === "speaking" ? "idle" : m)));
    const ok = await h.started;
    if (ok) {
      setNeedsTap(false);
      markGreeted();
    } else setMode("idle");
    return ok;
  }, []);

  // Texto del saludo letra por letra.
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

  // Saludo hablado al abrir (en iPhone suena con el primer toque).
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
      unlockAudio();
      if (!cancelled && !greetedRef.current && !active.current) sayGreeting();
    };
    const cleanup = () => {
      document.removeEventListener("touchend", onTap);
      document.removeEventListener("click", onTap);
    };
    voicesReady().then(async () => {
      await prepare(textRef.current); // audio listo de antemano: suena al instante al tocar
      if (cancelled || active.current) return;
      const ok = await sayGreeting();
      if (!ok && !cancelled && !active.current) {
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
  }, [sayGreeting]);

  // El núcleo del reactor late con tu voz mientras te escucha.
  useEffect(() => {
    if (mode !== "listening") {
      if (coreRef.current) coreRef.current.style.transform = "";
      return;
    }
    let raf = 0;
    const tick = () => {
      const lvl = recRef.current?.level() ?? 0;
      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + lvl * 0.6})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  useEffect(
    () => () => {
      active.current = false;
      recRef.current?.cancel();
      closeMic();
    },
    [],
  );

  function endConversation(goodbye?: string) {
    active.current = false;
    recRef.current = null;
    closeMic();
    setMode("idle");
    if (goodbye) setReply(goodbye);
  }

  async function transcribe(blob: Blob): Promise<string | null> {
    const form = new FormData();
    form.append("audio", blob, "voz");
    const res = await fetch("/api/stt", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = "/login";
      return null;
    }
    if (!res.ok) {
      toast(data.error ?? "No pude entender el audio.", "error");
      return null;
    }
    return (data.text as string) ?? "";
  }

  async function turn(): Promise<void> {
    if (!active.current) return;
    let stream: MediaStream;
    try {
      stream = await openMic();
    } catch {
      toast("Necesito permiso para usar el micrófono. Actívalo en Settings → Jarvis → Microphone.", "error");
      return endConversation();
    }
    setMode("listening");
    const r = record(stream);
    recRef.current = r;
    const res = await r.result;
    recRef.current = null;
    if (!active.current) return;
    if (!res.blob) return endConversation(heard ? "Aquí estaré cuando me necesites." : undefined);

    setMode("thinking");
    const said = await transcribe(res.blob);
    if (!active.current) return;
    if (said === null) return endConversation();
    if (!said) {
      setReply("No te entendí bien. ¿Me lo repites?");
      return turn();
    }
    setHeard(said);
    setReply(null);
    setActions([]);
    let answer: { text: string; actions: Action[] };
    try {
      answer = (await call<{ reply: { text: string; actions: Action[] } }>("/api/chat", "POST", { message: said })).reply;
    } catch {
      return endConversation();
    }
    if (!active.current) return;
    setReply(answer.text);
    setActions(answer.actions);
    if (answer.actions.length) router.refresh();

    setMode("speaking");
    const h = speak(answer.text, loadVoicePrefs());
    await h.started;
    await h.done;
    if (active.current) return turn(); // sigue la conversación
  }

  function onReactor() {
    unlockAudio();
    markGreeted();
    setNeedsTap(false);
    if (mode === "listening") return recRef.current?.stop();
    if (mode === "speaking") {
      stopSpeaking();
      if (active.current) return; // la conversación sigue escuchando
      return setMode("idle");
    }
    if (mode === "thinking") return;
    // idle → empezar a conversar
    if (!aiReady) return toast("La conversación con IA requiere configuración.", "error");
    if (!recordingSupported()) {
      toast("Este navegador no permite grabar voz. Usa el chat y el micrófono del teclado.", "info");
      return router.push("/jarvis");
    }
    active.current = true;
    setHeard(null);
    setReply(null);
    setActions([]);
    turn();
  }

  const showGreeting = !heard && !reply;

  return (
    <section className="rise mb-6 flex flex-col items-center text-center">
      <button
        onClick={onReactor}
        onTouchEnd={(e) => e.stopPropagation()}
        aria-label={STATUS[mode]}
        className="relative my-2 grid size-40 place-items-center"
      >
        <span
          className={`reactor ${mode === "speaking" || mode === "thinking" ? "reactor-talking" : ""} ${mode === "listening" ? "reactor-listening" : ""}`}
          aria-hidden
        >
          <span className="reactor-ring reactor-ring-1" />
          <span className="reactor-ring reactor-ring-2" />
          <span className="reactor-ring reactor-ring-3" />
          <span ref={coreRef} className="reactor-core" />
        </span>
      </button>
      <p className={`mb-2 text-xs font-medium tracking-wide ${mode === "listening" ? "text-red-300" : "text-cyan-soft"}`}>
        {mode === "listening" && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-bad align-middle" />}
        {needsTap && mode === "idle" ? "Toca la pantalla para escuchar a Jarvis 🔊" : STATUS[mode]}
      </p>

      {showGreeting ? (
        <p className="min-h-[4.5rem] max-w-md text-[17px] leading-relaxed text-text/95">
          {shown}
          {shown.length < text.length && <span className="animate-pulse text-cyan">▍</span>}
        </p>
      ) : (
        <div className="w-full max-w-md space-y-2 text-left">
          {heard && (
            <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-gradient-to-br from-cyan/90 to-azure/90 px-4 py-2 text-[15px] text-ink">
              {heard}
            </p>
          )}
          {reply && <p className="w-fit max-w-[90%] rounded-3xl rounded-bl-md border border-line bg-panel-2 px-4 py-2 text-[15px]">{reply}</p>}
          {actions.map((a, i) => (
            <Link key={i} href={a.href ?? "#"} className="flex items-start gap-2 rounded-2xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok text-ink">
                <IconCheck className="size-3" />
              </span>
              <span>
                <span className="block font-semibold text-emerald-200">{a.title}</span>
                <span className="text-emerald-100/80">{a.detail}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {mode !== "idle" && (
          <button
            className="btn btn-ghost px-5"
            onClick={() => {
              recRef.current?.cancel();
              stopSpeaking();
              endConversation();
            }}
          >
            Terminar
          </button>
        )}
        <Link href="/jarvis" className="btn btn-ghost px-5">
          Abrir chat
        </Link>
      </div>
    </section>
  );
}
