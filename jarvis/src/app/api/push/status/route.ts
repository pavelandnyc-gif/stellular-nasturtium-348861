import { api } from "@/lib/api";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// Estado de avisos: dispositivos suscritos e historial reciente de envíos.
export const GET = api(async (req, { user }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const rows = await query(
      "select id, status, sent_at, received_at, clicked_at, last_error from jarvis.notifications where user_id = $1 and id = $2",
      [user.id, id],
    );
    return { ok: true, notification: rows[0] ?? null };
  }
  const devices = await query(
    "select id, endpoint, user_agent, created_at, last_success_at, last_error, failures from jarvis.push_subscriptions where user_id = $1 order by created_at desc",
    [user.id],
  );
  const recent = await query(
    `select id, kind, title, fire_at, status, attempts, sent_at, received_at, clicked_at, last_error
     from jarvis.notifications where user_id = $1 and (status <> 'canceled')
     order by fire_at desc limit 25`,
    [user.id],
  );
  return {
    ok: true,
    configured: pushConfigured(),
    publicKey: env.vapidPublic() ?? null,
    devices: devices.map((d) => ({ ...d, endpoint: undefined, host: new URL(d.endpoint).host })),
    recent,
  };
});
