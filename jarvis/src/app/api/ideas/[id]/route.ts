import { z } from "zod";
import { api, body, notFound } from "@/lib/api";
import { deleteIdea, updateIdea } from "@/lib/repo/ideas";
import { zUuid } from "@/lib/validation";

export const PATCH = api<{ id: string }>(async (req, { user }, { id }) => {
  const { content } = await body(req, z.object({ content: z.string().trim().min(1).max(4000) }));
  const idea = await updateIdea(user.id, zUuid.parse(id), content);
  if (!idea) throw notFound("Idea");
  return { ok: true, idea };
});

export const DELETE = api<{ id: string }>(async (_req, { user }, { id }) => {
  if (!(await deleteIdea(user.id, zUuid.parse(id)))) throw notFound("Idea");
  return { ok: true };
});
