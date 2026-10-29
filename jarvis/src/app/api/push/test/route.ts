import { api } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { pushConfigured } from "@/lib/push";
import { sendTestNotification } from "@/lib/scheduler";
import { queryOne } from "@/lib/db";

export const POST = api(async (_req, { user }) => {
  if (!pushConfigured()) throw new HttpError(503, "El servidor aún no tiene claves VAPID configuradas.");
  const { id, result } = await sendTestNotification(user.id);
  const row = await queryOne("select status, last_error, sent_at from jarvis.notifications where id = $1", [id]);
  return { ok: result === "sent", id, status: row?.status, error: row?.last_error ?? null };
});
