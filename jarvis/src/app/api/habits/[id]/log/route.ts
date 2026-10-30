import { z } from "zod";
import { api, body, notFound } from "@/lib/api";
import { setHabitLog } from "@/lib/repo/habits";
import { todayIn } from "@/lib/time";
import { zDate, zUuid } from "@/lib/validation";

export const POST = api<{ id: string }>(async (req, { user, profile }, { id }) => {
  const input = await body(req, z.object({ done: z.boolean(), date: zDate.optional() }));
  const h = await setHabitLog(user.id, zUuid.parse(id), input.date ?? todayIn(profile.timezone), input.done);
  if (!h) throw notFound("Hábito");
  return { ok: true };
});
