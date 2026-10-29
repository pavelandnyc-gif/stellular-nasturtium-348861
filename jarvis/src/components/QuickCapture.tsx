"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { call } from "./fetcher";
import { IconPlus } from "./icons";
import { MicButton } from "./MicButton";
import { TaskFields, emptyTaskForm, toRecurrence, type TaskFormValue } from "./TaskForm";
import { toast } from "./Toast";

/** Botón flotante para capturar algo al instante: idea, tarea o mensaje a Jarvis. */
export function QuickCapture({ aiReady, today, label = false }: { aiReady: boolean; today: string; label?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`btn btn-primary fixed right-4 z-30 rounded-full shadow-2xl ${label ? "h-14 px-5" : "size-14 p-0"}`}
        style={{ bottom: "calc(var(--safe-bottom) + var(--nav-h) + 14px)" }}
        aria-label="Captura rápida"
      >
        <IconPlus className="size-7" />
        {label && <span>Capturar</span>}
      </button>
      {open && <CaptureSheet aiReady={aiReady} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

function CaptureSheet({ aiReady, today, onClose }: { aiReady: boolean; today: string; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"idea" | "task">("idea");
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm());
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const base = useRef("");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function save() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      if (mode === "idea") {
        await call("/api/ideas", "POST", { content: t });
        toast("💡 Idea guardada");
      } else {
        const r = await call("/api/tasks", "POST", {
          title: t,
          due_date: form.due_date,
          due_time: form.due_time,
          priority: form.priority,
          recurrence: toRecurrence(form),
        });
        toast(`✅ Tarea guardada · ${r.task.when}${r.task.repeat ? " · " + r.task.repeat : ""}`);
      }
      onClose();
      router.refresh();
    } catch {
      // el error ya se mostró
    } finally {
      setBusy(false);
    }
  }

  function toJarvis() {
    const t = text.trim();
    if (!t) return;
    onClose();
    router.push(`/jarvis?q=${encodeURIComponent(t)}`);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="sheet card w-full rounded-b-none border-b-0 p-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Captura rápida"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex gap-2">
          <button className="chip" data-on={mode === "idea"} onClick={() => setMode("idea")}>💡 Idea</button>
          <button className="chip" data-on={mode === "task"} onClick={() => setMode("task")}>✅ Tarea</button>
          {listening && (
            <span className="ml-auto flex items-center gap-2 text-sm text-red-200">
              <span className="size-2 animate-pulse rounded-full bg-bad" /> Escuchando…
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <textarea
            ref={ref}
            rows={3}
            className="field resize-none"
            placeholder={mode === "idea" ? "Escribe o dicta tu idea…" : "¿Qué tienes que hacer?"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
          />
          <MicButton
            onListening={(on) => {
              if (on) base.current = text ? text + " " : "";
              setListening(on);
            }}
            onText={(t) => setText(base.current + t)}
          />
        </div>
        {mode === "task" && (
          <div className="mt-3">
            <TaskFields value={form} onChange={setForm} today={today} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={save}>
            {mode === "idea" ? "Guardar idea" : "Guardar tarea"}
          </button>
          <button className="btn btn-ghost" disabled={!text.trim() || !aiReady} onClick={toJarvis} title={aiReady ? "" : "Requiere configurar la IA"}>
            Decírselo a Jarvis
          </button>
        </div>
        {!aiReady && <p className="mt-2 text-xs text-muted">La conversación con IA requiere configuración; los formularios funcionan igual.</p>}
      </div>
    </div>
  );
}
