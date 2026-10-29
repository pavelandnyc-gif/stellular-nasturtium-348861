// Service worker de Jarvis.
// Recibe los avisos Web Push aunque la app esté cerrada, los muestra y le
// confirma al servidor que llegaron al dispositivo ("recibido") y si los tocaste.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function receipt(data, event) {
  if (!data || !data.id || !data.token) return Promise.resolve();
  return fetch("/api/push/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: data.id, token: data.token, event }),
    keepalive: true,
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Jarvis", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Jarvis";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || data.id || undefined, // mismo tag = no se duplica en pantalla
    data: { url: data.url || "/", id: data.id, token: data.token },
  };
  // iOS exige mostrar una notificación por cada push recibido.
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), receipt(data, "received")]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      await receipt(data, "clicked");
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) return c.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Si el servicio push renueva la suscripción, se vuelve a registrar.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/status");
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // Se volverá a intentar cuando abras la app (Ajustes muestra el estado).
      }
    })(),
  );
});

