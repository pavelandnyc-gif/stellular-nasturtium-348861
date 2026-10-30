import { z } from "zod";
import { api, body, notFound } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { completeTask, deleteTask, getTask, reopenTask, snoozeTask, updateTask, viewTask } from "@/lib/repo/tasks";
import { zDate, zPriority, zRecurrence, zTime, zUuid } from "@/lib/validation";
import { formatFull, formatInstant } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(async (_req, { user, profile }, { id }) => {
  const t = await getTask(user.id, zUuid.parse(id));
  if (!t) throw notFound("Tarea");
  return { ok: true, task: viewTask(t, profile.timezone) };
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("snooze"), minutes: z.number().int().min(1).max(60 * 24 * 14) }),
  z.object({
    action: z.literal("update"),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().max(2000).nullable().optional(),
    due_date: zDate.nullable().optional(),
    due_time: zTime.nullable().optional(),
    priority: zPriority.optional(),
    recurrence: zRecurrence.optional(),
    remind: z.boolean().optional(),
  }),
]);

export const PATCH = api<{ id: string }>(async (req, { user, profile }, { id }) => {
  const tz = profile.timezone;
  const input = await body(req, patchSchema);
  const taskId = zUuid.parse(id);
  const existing = await getTask(user.id, taskId);
  if (!existing) throw notFound("Tarea");
  switch (input.action) {
    case "complete": {
      const r = (await completeTask(user.id, taskId, tz))!;
      return {
        ok: true,
        task: viewTask(r.task, tz),
        message: r.nextDate
          ? `Hecho. Próxima repetición: ${formatFull(r.nextDate, r.task.due_time)}`
          : "Tarea completada.",
      };
    }
    case "reopen":
      return { ok: true, task: viewTask((await reopenTask(user.id, taskId))!, tz) };
    case "snooze": {
      const r = await snoozeTask(user.id, taskId, input.minutes, tz);
      if (!r) throw new HttpError(400, "Solo se pueden posponer tareas pendientes.");
      return { ok: true, task: viewTask(r.task, tz), message: `Te aviso de nuevo ${formatInstant(r.until, tz)}` };
    }
    case "update": {
      const { action: _a, ...patch } = input;
      const t = await updateTask(user.id, taskId, patch);
      return { ok: true, task: viewTask(t!, tz), message: "Cambios guardados." };
    }
  }
});

export const DELETE = api<{ id: string }>(async (_req, { user }, { id }) => {
  if (!(await deleteTask(user.id, zUuid.parse(id)))) throw notFound("Tarea");
  return { ok: true };
});
