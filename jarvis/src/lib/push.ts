import "server-only";
import webpush from "web-push";
import { query } from "./db";
import { env } from "./env";

export function pushConfigured() {
  return !!(env.vapidPublic() && env.vapidPrivate());
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(env.vapidSubject(), env.vapidPublic()!, env.vapidPrivate()!);
  configured = true;
}

export interface PushPayload {
  id: string;
  token: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface SendResult {
  delivered: number; // aceptado por el servicio push (Apple, Google, Mozilla)
  devices: number;
  transient: boolean; // hubo un error temporal: vale la pena reintentar
  error: string | null;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envía la notificación a todos los dispositivos de la persona. */
export async function sendToUser(userId: string, payload: PushPayload, ttlSeconds = 4 * 3600): Promise<SendResult> {
  if (!pushConfigured()) return { delivered: 0, devices: 0, transient: false, error: "Faltan las claves VAPID en el servidor." };
  setup();
  const subs = await query<SubRow>("select id, endpoint, p256dh, auth from jarvis.push_subscriptions where user_id = $1", [userId]);
  if (!subs.length) return { delivered: 0, devices: 0, transient: false, error: "No hay ningún dispositivo con notificaciones activadas." };

  let delivered = 0;
  let transient = false;
  const errors: string[] = [];
  const body = JSON.stringify(payload);
  // El "topic" hace que el servicio push reemplace un envío repetido del mismo aviso
  // en lugar de mostrarlo dos veces.
  const topic = payload.id.replace(/-/g, "").slice(0, 32);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: ttlSeconds,
          urgency: "high",
          topic,
          timeout: 10_000,
        });
        delivered++;
        await query(
          "update jarvis.push_subscriptions set failures = 0, last_success_at = now(), last_error = null where id = $1",
          [s.id],
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        const msg = status ? `HTTP ${status}` : (e as Error).message;
        errors.push(msg);
        if (status === 404 || status === 410) {
          // La suscripción ya no existe (se borró la app o se revocó el permiso).
          await query("delete from jarvis.push_subscriptions where id = $1", [s.id]);
        } else {
          if (!status || status === 429 || status >= 500) transient = true;
          await query("update jarvis.push_subscriptions set failures = failures + 1, last_error = $2 where id = $1", [s.id, msg]);
        }
      }
    }),
  );
  return { delivered, devices: subs.length, transient, error: errors.length ? errors.join("; ") : null };
}
