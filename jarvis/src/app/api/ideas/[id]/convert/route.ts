import { z } from "zod";
import { api, body, notFound } from "@/lib/api";
import { getIdea, linkIdeaToTask } from "@/lib/repo/ideas";
import { createTask } from "@/lib/repo/tasks";
import { zDate, zPriority, zTime, zUuid } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { user, profile }, { id }) => {
  const input = await body(
    req,
    z.object({
      title: z.string().trim().min(1).max(500).optional(),
      due_date: zDate.nullable().optional(),
      due_time: zTime.nullable().optional(),
      priority: zPriority.optional(),
    }),
  );
  const idea = await getIdea(user.id, zUuid.parse(id));
  if (!idea) throw notFound("Idea");
  const task = await createTask(
    user.id,
    {
      title: input.title ?? idea.content.slice(0, 500),
      due_date: input.due_date ?? null,
      due_time: input.due_time ?? null,
      priority: input.priority ?? null,
      idea_id: idea.id,
    },
    profile.timezone,
  );
  await linkIdeaToTask(user.id, idea.id, task.id);
  return { ok: true, task };
});
