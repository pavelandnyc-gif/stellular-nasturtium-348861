import { z } from "zod";
import { api, body } from "@/lib/api";
import { completionHistory, createTask, listTasks, viewTask, type TaskScope } from "@/lib/repo/tasks";
import { zDate, zPriority, zRecurrence, zTime } from "@/lib/validation";

export const dynamic = "force-dynamic";

const SCOPES = ["today", "overdue", "upcoming", "nodate", "pending", "completed"] as const;

export const GET = api(async (req, { user, profile }) => {
  const url = new URL(req.url);
  const scope = z.enum(SCOPES).catch("pending").parse(url.searchParams.get("scope")) as TaskScope;
  if (scope === "completed") return { ok: true, history: await completionHistory(user.id) };
  const rows = await listTasks(user.id, scope, profile.timezone, { q: url.searchParams.get("q") });
  return { ok: true, tasks: rows.map((t) => viewTask(t, profile.timezone)) };
});

const taskInput = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(2000).nullable().optional(),
  due_date: zDate.nullable().optional(),
  due_time: zTime.nullable().optional(),
  priority: zPriority.optional(),
  recurrence: zRecurrence.optional(),
  remind: z.boolean().optional(),
});

export const POST = api(async (req, { user, profile }) => {
  const input = await body(req, taskInput);
  const task = await createTask(user.id, input, profile.timezone);
  return { ok: true, task: viewTask(task, profile.timezone) };
});
