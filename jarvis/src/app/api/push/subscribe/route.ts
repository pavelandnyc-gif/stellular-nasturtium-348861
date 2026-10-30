import { z } from "zod";
import { api, body } from "@/lib/api";
import { query } from "@/lib/db";

const subSchema = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "el endpoint debe ser HTTPS"),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

export const POST = api(async (req, { user }) => {
  const sub = await body(req, subSchema);
  await query(
    `insert into jarvis.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, failures = 0, last_error = null`,
    [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, req.headers.get("user-agent")?.slice(0, 300) ?? null],
  );
  return { ok: true };
});

export const DELETE = api(async (req, { user }) => {
  const { endpoint } = await body(req, z.object({ endpoint: z.string().max(2000) }));
  await query("delete from jarvis.push_subscriptions where user_id = $1 and endpoint = $2", [user.id, endpoint]);
  return { ok: true };
});
