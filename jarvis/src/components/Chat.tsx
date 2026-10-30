"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { call } from "./fetcher";
import { IconCheck, IconSend } from "./icons";
import { MicButton } from "./MicButton";
import { QuickCapture } from "./QuickCapture";
import { loadVoicePrefs, speak, stopSpeaking } from "./voice";

interface Action {
  type: string;
  title: string;
  detail: string;
  href?: string;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: Action[];
  pending?: boolean;
}

const EXAMPLES = [
  "Recuérdame llamar a mi mamá mañana a las diez",
  "Guarda esta idea: quiero aprender a editar videos",
  "Recuérdame hacer ejercicio los lunes, miércoles y viernes a las ocho",
  "Quiero leer veinte minutos todas las noches",
  "¿Qué tengo pendiente hoy?",
  "¿Qué ideas guardé esta semana?",
];

export function Chat(props: { configured: boolean; model: string; name: string; today: string }) {
  return (
    <Suspense>
      <ChatInner {...props} />
    </Suspense>
  );
}

function ChatInner({ configured, model, name, today }: { configured: boolean; model: string; name: string; today: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const base = useRef("");
  const sentQ = useRef(false);
  const usedMic = useRef(false);

  useEffect(() => {
    call<{ messages: Msg[] }>("/api/chat")
      .then((r) => setMsgs(r.messages))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = useCallback(
    async (message: string) => {
      const m = message.trim();
      if (!m || busy) return;
      setText("");
      setBusy(true);
      const tmp: Msg = { id: "u" + Date.now(), role: "user", content: m, actions: [] };
      setMsgs((xs) => [...xs, tmp, { id: "p", role: "assistant", content: "", actions: [], pending: true }]);
      try {
        const r = await call<{ reply: { text: string; actions: Action[] } }>("/api/chat", "POST", { message: m });
        setMsgs((xs) => [
          ...xs.filter((x) => !x.pending),
          { id: "a" + Date.now(), role: "assistant", content: r.reply.text, actions: r.reply.actions },
        ]);
        const prefs = loadVoicePrefs();
        if (prefs.replies === "always" || (prefs.replies === "voice" && usedMic.current)) speak(r.reply.text, prefs);
        usedMic.current = false;
        if (r.reply.actions.length) router.refresh();
      } catch (e) {
        setMsgs((xs) => [
          ...xs.filter((x) => !x.pending),
          { id: "e" + Date.now(), role: "assistant", content: `⚠️ ${(e as Error).message === "offline" ? "Sin conexión. No se guardó nada." : (e as Error).message}`, actions: [] },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  // Mensaje que llega desde la captura rápida (/jarvis?q=…)
  useEffect(() => {
    const q = params.get("q");
    if (q && loaded && configured && !sentQ.current) {
      sentQ.current = true;
      router.replace("/jarvis");
      send(q);
    }
  }, [params, loaded, configured, send, router]);

  return (
    <main className="mx-auto flex h-[100dvh] max-w-[640px] flex-col" style={{ paddingTop: "var(--safe-top)" }}>
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-cyan to-azure font-bold text-ink shadow-[0_0_24px_-4px_rgba(34,211,238,.7)]">J</span>
        <div className="flex-1">
          <h1 className="font-semibold leading-tight">Jarvis</h1>
          <p className="text-xs text-muted">{configured ? (busy ? "Pensando…" : "En línea") : "IA sin configurar"}</p>
        </div>
        {msgs.length > 0 && configured && (
          <button
            className="text-xs text-muted"
            onClick={async () => {
              if (!confirm("¿Borrar la conversación? Tus tareas e ideas no se borran.")) return;
              await call("/api/chat", "DELETE");
              setMsgs([]);
            }}
          >
            Limpiar
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {!configured && (
          <div className="card space-y-2 border-warn/40 p-4 text-sm">
            <p className="font-semibold text-warn">La conversación con IA requiere configuración</p>
            <p className="text-muted">
              Falta la clave <code className="text-text">ANTHROPIC_API_KEY</code> en el servidor. Mientras tanto puedes guardar ideas, tareas y
              recordatorios con el botón <b>＋</b>, y gestionar hábitos en su pestaña. Todo funciona igual.
            </p>
          </div>
        )}
        {configured && loaded && msgs.length === 0 && (
          <div className="rise pt-6 text-center">
            <p className="text-lg font-semibold">A tus órdenes, {name}.</p>
            <p className="mb-4 text-sm text-muted">Escríbeme o háblame con el micrófono. Por ejemplo:</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} className="card px-4 py-3 text-left text-sm text-muted active:scale-[0.99]" onClick={() => send(e)}>
                  “{e}”
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </div>

      {configured ? (
        <form
          className="border-t border-line/70 bg-ink/90 px-3 pt-2 backdrop-blur"
          style={{ paddingBottom: "calc(var(--safe-bottom) + var(--nav-h) + 8px)" }}
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          {listening && (
            <div className="mb-2 flex items-center gap-2 px-1 text-sm text-red-200">
              <span className="size-2 animate-pulse rounded-full bg-bad" /> Escuchando… habla ahora y toca el micrófono para terminar
            </div>
          )}
          <div className="flex items-end gap-2">
            <MicButton
              onListening={(on) => {
                if (on) {
                  stopSpeaking();
                  base.current = text ? text + " " : "";
                  usedMic.current = true;
                }
                setListening(on);
              }}
              onText={(t) => setText(base.current + t)}
            />
            <textarea
              rows={1}
              className="field max-h-32 min-h-11 resize-none py-2.5"
              placeholder="Escribe a Jarvis…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                  e.preventDefault();
                  send(text);
                }
              }}
              enterKeyHint="send"
              maxLength={2000}
            />
            <button type="submit" className="btn btn-primary size-11 shrink-0 rounded-full p-0" disabled={busy || !text.trim()} aria-label="Enviar">
              <IconSend />
            </button>
          </div>
          <p className="mt-1 px-1 text-[10px] text-muted/70">Modelo: {model}</p>
        </form>
      ) : (
        <QuickCapture aiReady={false} today={today} label />
      )}
    </main>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.pending) {
    return (
      <div className="flex gap-1 px-2 py-3" aria-label="Jarvis está pensando">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 animate-bounce rounded-full bg-cyan/70" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    );
  }
  const mine = m.role === "user";
  return (
    <div className={`rise flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
          mine ? "rounded-br-md bg-gradient-to-br from-cyan/90 to-azure/90 text-ink" : "rounded-bl-md border border-line bg-panel-2"
        }`}
      >
        {m.content}
      </div>
      {m.actions?.map((a, i) => (
        <Link
          key={i}
          href={a.href ?? "#"}
          className="rise mt-2 flex max-w-[85%] items-start gap-2 rounded-2xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm"
        >
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
  );
}
