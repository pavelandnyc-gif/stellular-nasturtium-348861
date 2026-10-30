import { z } from "zod";
import { api, body } from "@/lib/api";
import { createIdea, listIdeas } from "@/lib/repo/ideas";

export const dynamic = "force-dynamic";

export const GET = api(async (req, { user }) => {
  const url = new URL(req.url);
  const ideas = await listIdeas(user.id, { q: url.searchParams.get("q"), sinceDays: Number(url.searchParams.get("dias")) || null });
  return { ok: true, ideas };
});

export const POST = api(async (req, { user }) => {
  const { content } = await body(req, z.object({ content: z.string().trim().min(1).max(4000) }));
  return { ok: true, idea: await createIdea(user.id, content) };
});
