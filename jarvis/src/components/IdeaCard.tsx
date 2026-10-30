"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";
import { TaskFields, emptyTaskForm, type TaskFormValue } from "./TaskForm";

export function IdeaCard({
  idea,
  when,
  today,
  highlight,
}: {
  idea: { id: string; content: string; task_id: string | null };
  when: string;
  today: string;
  highlight?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "convert">("view");
  const [text, setText] = useState(idea.content);
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm());
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch {
      /* mostrado */
    } finally {
      setBusy(false);
    }
  }

  return (
    <li id={idea.id} className={`rise card p-4 ${highlight ? "border-cyan/60" : ""}`}>
      {mode === "edit" ? (
        <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} autoFocus />
      ) : (
        <p className="whitespace-pre-wrap">{idea.content}</p>
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{when}</span>
        {idea.task_id && (
          <Link href={`/tareas/${idea.task_id}`} className="text-cyan">Convertida en tarea →</Link>
        )}
      </div>

      {mode === "convert" && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <TaskFields value={form} onChange={setForm} today={today} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "view" && (
          <>
            <button className="chip" onClick={() => setMode("edit")}>Editar</button>
            {!idea.task_id && <button className="chip" onClick={() => setMode("convert")}>Convertir en tarea</button>}
            <button
              className="chip"
              disabled={busy}
              onClick={() =>
                confirm("¿Eliminar esta idea?") &&
                run(async () => {
                  await call(`/api/ideas/${idea.id}`, "DELETE");
                  toast("Idea eliminada");
                })
              }
            >
              Eliminar
            </button>
          </>
        )}
        {mode === "edit" && (
          <>
            <button className="chip" onClick={() => (setText(idea.content), setMode("view"))}>Cancelar</button>
            <button
              className="chip"
              data-on
              disabled={busy || !text.trim()}
              onClick={() =>
                run(async () => {
                  await call(`/api/ideas/${idea.id}`, "PATCH", { content: text });
                  toast("Idea actualizada");
                  setMode("view");
                })
              }
            >
              Guardar
            </button>
          </>
        )}
        {mode === "convert" && (
          <>
            <button className="chip" onClick={() => setMode("view")}>Cancelar</button>
            <button
              className="chip"
              data-on
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await call(`/api/ideas/${idea.id}/convert`, "POST", {
                    due_date: form.due_date,
                    due_time: form.due_time,
                    priority: form.priority,
                  });
                  toast("✅ Idea convertida en tarea");
                  setMode("view");
                  router.push(`/tareas/${r.task.id}`);
                })
              }
            >
              Crear tarea
            </button>
          </>
        )}
      </div>
    </li>
  );
}
