"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { IconBell, IconCheck, IconRepeat } from "./icons";
import { toast } from "./Toast";

export interface TaskItemData {
  id: string;
  title: string;
  when: string;
  repeat: string;
  overdue: boolean;
  priority: number | null;
  status: "pending" | "done";
  due_time: string | null;
  remind: boolean;
}

const PRIO_DOT: Record<number, string> = { 1: "bg-bad", 2: "bg-warn", 3: "bg-muted" };

export function TaskItem({ task }: { task: TaskItemData }) {
  const router = useRouter();
  const [done, setDone] = useState(task.status === "done");
  const [busy, setBusy] = useState(false);

  async function complete() {
    if (busy || done) return;
    setBusy(true);
    setDone(true);
    try {
      const r = await call(`/api/tasks/${task.id}`, "PATCH", { action: "complete" });
      toast(`✅ ${r.message}`);
      router.refresh();
    } catch {
      setDone(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rise flex items-center gap-3 py-2.5">
      <button
        onClick={complete}
        aria-label={`Completar ${task.title}`}
        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition-all ${
          done ? "border-ok bg-ok text-ink" : "border-line hover:border-cyan"
        }`}
      >
        {done && <IconCheck className="size-4" />}
      </button>
      <Link href={`/tareas/${task.id}`} className="min-w-0 flex-1">
        <div className={`truncate font-medium ${done ? "text-muted line-through" : ""}`}>
          {task.priority && <span className={`mr-2 inline-block size-2 rounded-full align-middle ${PRIO_DOT[task.priority]}`} />}
          {task.title}
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${task.overdue ? "text-bad" : "text-muted"}`}>
          {task.overdue && <span>Vencida ·</span>}
          <span>{task.when}</span>
          {task.repeat && (
            <span className="flex items-center gap-1">
              · <IconRepeat className="size-3" /> {task.repeat}
            </span>
          )}
          {task.remind && task.due_time && <IconBell className="size-3 text-cyan/70" />}
        </div>
      </Link>
    </li>
  );
}
