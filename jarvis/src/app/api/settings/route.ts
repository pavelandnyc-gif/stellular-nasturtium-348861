import { z } from "zod";
import { api, body } from "@/lib/api";
import { updateProfile } from "@/lib/repo/profile";
import { syncSummary } from "@/lib/scheduler";
import { zTime, zZone } from "@/lib/validation";
import { query } from "@/lib/db";

export const PATCH = api(async (req, { user, profile }) => {
  const input = await body(
    req,
    z.object({
      display_name: z.string().trim().min(1).max(60).optional(),
      timezone: zZone.optional(),
      summary_enabled: z.boolean().optional(),
      summary_time: zTime.optional(),
    }),
  );
  const updated = await updateProfile(user.id, input);
  if (input.timezone && input.timezone !== profile.timezone) {
    // La zona cambió: reprograma todos los avisos con la nueva hora local.
    const { syncTaskNotifications, syncHabitNotifications } = await import("@/lib/scheduler");
    for (const t of await query<{ id: string }>("select id from jarvis.tasks where user_id = $1 and status = 'pending'", [user.id]))
      await syncTaskNotifications(t.id);
    for (const h of await query<{ id: string }>("select id from jarvis.habits where user_id = $1", [user.id]))
      await syncHabitNotifications(h.id);
  }
  await syncSummary(user.id);
  return { ok: true, profile: updated };
});
