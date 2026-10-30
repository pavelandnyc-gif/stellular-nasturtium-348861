// Programador para desarrollo/vista previa: llama al despachador cada minuto,
// igual que lo hará pg_cron en Supabase en producción.
// Uso: CRON_SECRET=... npm run scheduler   (con la app corriendo en APP_URL)
const base = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Falta CRON_SECRET.");
  process.exit(1);
}
async function tick() {
  try {
    const res = await fetch(`${base}/api/cron/dispatch`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    const data = await res.json();
    console.log(new Date().toLocaleTimeString(), JSON.stringify(data));
  } catch (e) {
    console.error(new Date().toLocaleTimeString(), "error:", e.message);
  }
}
await tick();
setInterval(tick, 60_000);
