"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BootSequence } from "./BootSequence";
import { playBootSound } from "./bootSound";
import { diag } from "./diag";
import { call } from "./fetcher";
import { IconCheck } from "./icons";
import { closeMic, openMic, primeAudioContext, record, recordingSupported, type Recorder } from "./recorder";
import { toast } from "./Toast";
import { audioUnlocked, loadVoicePrefs, prepare, speak, speechSupported, stopSpeaking, unlockAudio, voicesReady } from "./voice";

const LAST_KEY = "jarvis.lastGreeting";
const REPEAT_AFTER_MS = 60_000; // saluda cada vez que abres la app (o vuelves tras más de 1 minuto)
const BOOT_MS = 2300;

type Mode = "idle" | "listening" | "thinking" | "speaking";
type Boot = "hidden" | "waiting" | "running" | "leaving";
interface Action {
  title: string;
  detail: string;
  href?: string;
}

const STATUS: Record<Mode, string> = {
  idle: "Toca el reactor para hablar",
  listening: "Te escucho… (haz una pausa al terminar)",
  thinking: "Procesando…",
  speaking: "Jarvis está hablando · toca para interrumpir",
};

// Fin de palabra compatible con acentos (\b no reconoce "í" como letra).
const END = "(?=$|[\\s,.;:!¡?¿])";
const YES = new RegExp(`^(s[ií]|sip|dale|claro|adelante|por favor|ok|okay|va|venga|perfecto|seguro|d[aá]melo|el informe|informe|cu[eé]ntame|a ver)${END}`, "i");
const NO = new RegExp(`^(no|nop|despu[eé]s|luego|m[aá]s tarde|ahora no|no gracias)${END}`, "i");

function greetingDue() {
  try {
    return Date.now() - Number(localStorage.getItem(LAST_KEY) ?? 0) > REPEAT_AFTER_MS;
  } catch {
    return true;
  }
}

/**
 * Bienvenida de Jarvis: arranque del sistema → saludo corto → escucha sola →
 * informe del día si lo pides. Tocando el reactor se conversa en cualquier momento.
 */
export function JarvisGreeting({ text, name, aiReady }: { text: string; name: string; aiReady: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [boot, setBoot] = useState<Boot>("hidden");
  const [needsTap, setNeedsTap] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [tapToSend, setTapToSend] = useState(false);
  const [greetKey, setGreetKey] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;
  const active = useRef(false);
  const recRef = useRef<Recorder | null>(null);
  const coreRef = useRef<HTMLSpanElement>(null);
  const turnsRef = useRef(0);
  const retriesRef = useRef(0);
  const autoRef = useRef(false); // la conversación la empezó Jarvis (tras el saludo)
  const offerRef = useRef(false); // acaba de ofrecer el informe del día

  const markGreeted = () => {
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {
      /* */
    }
  };

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

  /** Dice el saludo; al terminar, si está activado, se queda escuchando. */
  const greet = useCallback(async () => {
    markGreeted();
    setNeedsTap(false);
    setMode("speaking");
    const h = speak(textRef.current, loadVoicePrefs());
    const ok = await h.started;
    diag("greeting", ok ? "empezó a sonar" : "no sonó", { engine: loadVoicePrefs().engine });
    if (!ok) {
      setMode("idle");
      return;
    }
    await h.done;
    setMode("idle");
    const prefs = loadVoicePrefs();
    if (prefs.autoListen && aiReady && recordingSupported() && !active.current && document.visibilityState === "visible") {
      startConversation(true, /informe/.test(textRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady]);

  /** Toque en la pantalla de arranque: es el gesto que habilita el sonido en el iPhone. */
  function bootTap() {
    unlockAudio();
    primeAudioContext();
    runBoot();
  }

  function runBoot() {
    setBoot("running");
    playBootSound();
    setTimeout(() => {
      setBoot("leaving");
      setTimeout(() => setBoot("hidden"), 500);
      greet();
    }, BOOT_MS);
  }

  // Al abrir (o volver a la app): arranque + saludo.
  useEffect(() => {
    if (!greetingDue()) return;
    const prefs = loadVoicePrefs();
    let cancelled = false;
    // Prepara el audio del saludo mientras corre la animación.
    voicesReady().then(() => prepare(textRef.current));
    if (prefs.boot) {
      setBoot(audioUnlocked() ? "running" : "waiting");
      if (audioUnlocked()) setTimeout(() => !cancelled && runBoot(), 50);
    } else if (prefs.greet && speechSupported()) {
      const onTap = () => {
        cleanup();
        unlockAudio();
        primeAudioContext();
        if (!cancelled && !active.current) greet();
      };
      const cleanup = () => {
        document.removeEventListener("touchend", onTap);
        document.removeEventListener("click", onTap);
      };
      voicesReady().then(async () => {
        await prepare(textRef.current);
        if (cancelled || active.current) return;
        if (audioUnlocked()) return greet();
        setNeedsTap(true);
        document.addEventListener("touchend", onTap, { once: true });
        document.addEventListener("click", onTap, { once: true });
      });
      return () => {
        cancelled = true;
        cleanup();
      };
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetKey]);

  // Al volver a la app después de un rato: datos frescos y saludo nuevo.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (active.current) {
          recRef.current?.cancel();
          endConversation();
        }
        stopSpeaking();
      } else if (hiddenAt && Date.now() - hiddenAt > REPEAT_AFTER_MS) {
        router.refresh();
        setTimeout(() => setGreetKey((k) => k + 1), 900); // espera el saludo actualizado
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
    setTapToSend(false);
    if (goodbye) setReply(goodbye);
  }

  async function transcribe(blob: Blob): Promise<string | null> {
    const form = new FormData();
    form.append("audio", blob, "voz");
    const res = await fetch("/api/stt", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    diag("stt", res.ok ? `ok: "${String(data.text ?? "").slice(0, 80)}"` : `error ${res.status}: ${data.error ?? ""}`, {
      size: blob.size,
    });
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

  async function say(answer: string) {
    setReply(answer);
    setMode("speaking");
    const h = speak(answer, loadVoicePrefs());
    await h.started;
    await h.done;
  }

  async function turn(): Promise<void> {
    if (!active.current) return;
    let stream: MediaStream;
    try {
      stream = await openMic();
    } catch (e) {
      diag("mic", `getUserMedia falló: ${(e as Error).name} ${(e as Error).message}`);
      if (!autoRef.current) toast("Necesito permiso para usar el micrófono. Actívalo en Settings → Jarvis → Microphone.", "error");
      return endConversation();
    }
    setMode("listening");
    let r: Recorder;
    try {
      r = record(stream);
    } catch (e) {
      diag("record", `MediaRecorder falló: ${(e as Error).name} ${(e as Error).message}`);
      toast("Este iPhone no pudo grabar audio. Usa el chat con el micrófono del teclado.", "error");
      return endConversation();
    }
    recRef.current = r;
    setTapToSend(false);
    const hintTimer = setTimeout(() => setTapToSend(!r.autoStop), 1200);
    const res = await r.result;
    clearTimeout(hintTimer);
    recRef.current = null;
    diag("record", `fin: ${res.reason}`, { bytes: res.blob?.size ?? 0, autoStop: r.autoStop, auto: autoRef.current });
    if (!active.current) return;

    // Si Jarvis empezó a escuchar solo y no dijiste nada, se retira en silencio.
    if (res.reason === "no-speech" && autoRef.current && turnsRef.current === 0) return endConversation();
    if (!res.blob || (res.reason === "no-speech" && turnsRef.current > 0)) {
      return endConversation(turnsRef.current ? "Aquí estaré cuando me necesites." : "No llegó audio. Toca el reactor e inténtalo de nuevo.");
    }

    setMode("thinking");
    const said = await transcribe(res.blob);
    if (!active.current) return;
    if (said === null) return endConversation();
    if (!said) {
      if (++retriesRef.current >= 2 || res.reason === "no-speech") {
        return endConversation(autoRef.current && !turnsRef.current ? undefined : "No te escuché bien. Toca el reactor cuando quieras.");
      }
      setReply("No te entendí bien. ¿Me lo repites?");
      return turn();
    }
    retriesRef.current = 0;
    turnsRef.current += 1;
    setHeard(said);
    setReply(null);
    setActions([]);

    // Respuesta a "¿Te doy el informe del día?"
    const clean = said.trim().replace(/^[¡¿,.\s]+/, "");
    const offered = offerRef.current;
    offerRef.current = false;
    if ((offered && YES.test(clean)) || /^(dame |danos )?(el )?informe( del d[ií]a)?[.!]?$/i.test(clean)) {
      try {
        const b = await call<{ text: string }>("/api/briefing");
        if (!active.current) return;
        await say(b.text);
      } catch {
        return endConversation();
      }
      if (active.current) return turn();
      return;
    }
    if (offered && NO.test(clean)) {
      await say("Entendido. Aquí estoy si me necesitas.");
      return endConversation();
    }

    let answer: { text: string; actions: Action[] };
    try {
      answer = (await call<{ reply: { text: string; actions: Action[] } }>("/api/chat", "POST", { message: said })).reply;
    } catch (e) {
      diag("chat", `error: ${(e as Error).message}`);
      return endConversation();
    }
    if (!active.current) return;
    setActions(answer.actions);
    if (answer.actions.length) router.refresh();
    await say(answer.text);
    if (active.current) return turn(); // sigue la conversación
  }

  function startConversation(auto: boolean, offeringBriefing = false) {
    if (!aiReady) {
      if (!auto) toast("La conversación con IA requiere configuración.", "error");
      return;
    }
    if (!recordingSupported()) {
      if (!auto) {
        toast("Este navegador no permite grabar voz. Usa el chat y el micrófono del teclado.", "info");
        router.push("/jarvis");
      }
      return;
    }
    active.current = true;
    autoRef.current = auto;
    offerRef.current = offeringBriefing;
    turnsRef.current = 0;
    retriesRef.current = 0;
    if (!auto) {
      setHeard(null);
      setReply(null);
      setActions([]);
    }
    turn();
  }

  function onReactor() {
    unlockAudio();
    primeAudioContext(); // debe ocurrir en el mismo toque (requisito del iPhone)
    markGreeted();
    setNeedsTap(false);
    if (mode === "listening") return recRef.current?.stop();
    if (mode === "speaking") {
      stopSpeaking();
      if (active.current) return; // la conversación sigue escuchando
      return setMode("idle");
    }
    if (mode === "thinking") return;
    startConversation(false);
  }

  const showGreeting = !heard && !reply;

  return (
    <section className="rise mb-6 flex flex-col items-center text-center">
      {boot !== "hidden" &&
        createPortal(
          // Fuera de la sección animada: así cubre toda la pantalla.
          <div className={boot === "leaving" ? "boot-out" : ""}>
            <BootSequence name={name} waiting={boot === "waiting"} running={boot === "running" || boot === "leaving"} onTap={bootTap} />
          </div>,
          document.body,
        )}
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
        {needsTap && mode === "idle"
          ? "Toca la pantalla para escuchar a Jarvis 🔊"
          : mode === "listening" && tapToSend
            ? "Te escucho… toca el reactor cuando termines"
            : STATUS[mode]}
      </p>

      {showGreeting ? (
        <p className="min-h-[3rem] max-w-md text-[17px] leading-relaxed text-text/95">
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
