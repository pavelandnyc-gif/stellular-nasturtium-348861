// Aplica las migraciones a la base de datos de DATABASE_URL.
// La app también las aplica sola al arrancar; este comando es para hacerlo a mano.
// Uso: DATABASE_URL=... npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "db", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await sql.begin(async (tx) => {
  await tx.unsafe("select pg_advisory_xact_lock(727274)");
  await tx.unsafe("create table if not exists public.jarvis_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await tx.unsafe("select name from public.jarvis_migrations")).map((r) => r.name as string));
  for (const f of files) {
    if (done.has(f)) {
      console.log("·", f, "(ya aplicada)");
      continue;
    }
    await tx.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
    await tx.unsafe("insert into public.jarvis_migrations (name) values ($1)", [f]);
    console.log("✓", f);
  }
});
await sql.end();
console.log("Listo.");
