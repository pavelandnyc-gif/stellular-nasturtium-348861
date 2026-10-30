import { z } from "zod";
import { api, body, notFound } from "@/lib/api";
import { deleteHabit, updateHabit } from "@/lib/repo/habits";
import { zDays, zTime, zUuid } from "@/lib/validation";

export const PATCH = api<{ id: string }>(async (req, { user }, { id }) => {
  const input = await body(
    req,
    z.object({
      name: z.string().trim().min(1).max(200).optional(),
      emoji: z.string().max(16).nullable().optional(),
      days: zDays.optional(),
      habit_time: zTime.nullable().optional(),
      target_minutes: z.number().int().min(1).max(1440).nullable().optional(),
      remind: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
  );
  const habit = await updateHabit(user.id, zUuid.parse(id), input);
  if (!habit) throw notFound("Hábito");
  return { ok: true, habit };
});

export const DELETE = api<{ id: string }>(async (_req, { user }, { id }) => {
  if (!(await deleteHabit(user.id, zUuid.parse(id)))) throw notFound("Hábito");
  return { ok: true };
});
