"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";
import { TaskFields, toRecurrence, type TaskFormValue } from "./TaskForm";

interface T {
  id: string;
  title: string;
  notes: string | null;
  status: "pending" | "done";
  due_date: string | null;
  due_time: string | null;
  priority: number | null;
  recurrence: { type: "daily" } | { type: "weekly"; days: number[] } | null;
  remind: boolean;
}

const SNOOZES = [
  { label: "15 min", m: 15 },
  { label: "1 hora", m: 60 },
  { label: "3 horas", m: 180 },
  { label: "Mañana", m: 24 * 60 },
];

export function TaskDetail({ task, today }: { task: T; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [form, setForm] = useState<TaskFormValue>({
    due_date: task.due_date,
    due_time: task.due_time,
    priority: task.priority,
    repeat: task.recurrence?.type ?? "none",
    days: task.recurrence?.type === "weekly" ? task.recurrence.days : [],
  });
  const [remind, setRemind] = useState(task.remind);

  async function act(body: object, after?: () => void) {
    setBusy(true);
    try {
      const r = await call(`/api/tasks/${task.id}`, "PATCH", body);
      if (r.message) toast(r.message);
      after?.();
      router.refresh();
    } catch {
      /* ya se mostró */
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar “${task.title}”? No se puede deshacer.`)) return;
    setBusy(true);
    try {
      await call(`/api/tasks/${task.id}`, "DELETE");
      toast("Tarea eliminada");
      router.push("/tareas");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  if (task.status === "done") {
    return (
      <div className="grid gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: "reopen" })}>
          Marcar como pendiente
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={remove}>Eliminar</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="card space-y-3 p-4">
        <label className="block text-xs text-muted">
          Título
          <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        </label>
        <label className="block text-xs text-muted">
          Notas
          <textarea className="field mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>
        <TaskFields value={form} onChange={setForm} today={today} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="size-5 accent-cyan-400" />
          Enviarme un aviso a la hora indicada
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={busy || !title.trim() || (form.repeat === "weekly" && !form.days.length)}
            onClick={() =>
              act(
                {
                  action: "update",
                  title,
                  notes: notes || null,
                  due_date: form.due_date,
                  due_time: form.due_time,
                  priority: form.priority,
                  recurrence: toRecurrence(form),
                  remind,
                },
                () => setEditing(false),
              )
            }
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button className="btn btn-primary h-14 w-full text-lg" disabled={busy} onClick={() => act({ action: "complete" })}>
        {task.recurrence ? "Hecho por hoy" : "Completar"}
      </button>
      <div>
        <p className="mb-2 text-sm text-muted">Posponer aviso</p>
        <div className="grid grid-cols-4 gap-2">
          {SNOOZES.map((s) => (
            <button key={s.m} className="btn btn-ghost px-2 text-sm" disabled={busy} onClick={() => act({ action: "snooze", minutes: s.m })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>Reprogramar</button>
        <button className="btn btn-danger" disabled={busy} onClick={remove}>Eliminar</button>
      </div>
    </div>
  );
}
