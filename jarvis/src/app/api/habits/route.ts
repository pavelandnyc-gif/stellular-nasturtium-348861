import { z } from "zod";
import { api, body } from "@/lib/api";
import { createHabit, HABIT_SUGGESTIONS, listHabits } from "@/lib/repo/habits";
import { zDays, zTime } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = api(async (_req, { user, profile }) => ({
  ok: true,
  habits: await listHabits(user.id, profile.timezone, { includeInactive: true }),
}));

export const POST = api(async (req, { user }) => {
  const input = await body(
    req,
    z.object({
      suggestion: z.enum(["exercise", "reading"]).optional(),
      name: z.string().trim().min(1).max(200).optional(),
      emoji: z.string().max(16).nullable().optional(),
      days: zDays.optional(),
      habit_time: zTime.nullable().optional(),
      target_minutes: z.number().int().min(1).max(1440).nullable().optional(),
      remind: z.boolean().optional(),
    }),
  );
  const s = input.suggestion ? HABIT_SUGGESTIONS.find((x) => x.key === input.suggestion)! : null;
  const name = input.name ?? s?.name;
  if (!name) return Response.json({ ok: false, error: "Falta el nombre del hábito." }, { status: 400 });
  const habit = await createHabit(user.id, {
    name,
    emoji: input.emoji ?? s?.emoji ?? null,
    days: input.days ?? (s ? [...s.days] : []),
    habit_time: input.habit_time !== undefined ? input.habit_time : (s?.habit_time ?? null),
    target_minutes: input.target_minutes !== undefined ? input.target_minutes : (s?.target_minutes ?? null),
    remind: input.remind ?? true,
    suggestion_key: s?.key ?? null,
  });
  return { ok: true, habit };
});
