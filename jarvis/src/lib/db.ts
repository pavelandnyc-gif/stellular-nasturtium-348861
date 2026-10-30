import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

// Capa mínima de acceso a PostgreSQL.
//  · Producción: `postgres` (porsager) contra Supabase usando DATABASE_URL.
//  · Vista previa local: PGlite, un PostgreSQL real compilado a WASM que guarda
//    los datos en .data/pglite. Mismo SQL, mismas migraciones.

export type Row = Record<string, any>;

interface Querier {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

interface Driver extends Querier {
  transaction<R>(fn: (tx: Querier) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

// Fechas (date) y horas se devuelven como texto "2026-10-30" para no
// convertirlas accidentalmente a otra zona horaria.
const DATE_OID = 1082;

/**
 * Lee DATABASE_URL de forma tolerante: la contraseña puede traer símbolos
 * (@ # / ? %) sin codificar, o quedar entre los corchetes de la plantilla de
 * Supabase ("[mi-clave]"). Se toma todo lo que hay entre "usuario:" y la última "@".
 */
export function parseDatabaseUrl(raw: string) {
  const m = raw.trim().match(/^postgres(?:ql)?:\/\/([^:/@]+):(.*)@([^@/:?#]+)(?::(\d+))?\/([^?#]*)/);
  if (!m) return null;
  let password = m[2];
  if (/^\[.*\]$/.test(password)) password = password.slice(1, -1);
  try {
    if (/%[0-9a-f]{2}/i.test(password)) password = decodeURIComponent(password);
  } catch {
    // no estaba codificada: se usa tal cual
  }
  return {
    user: decodeURIComponent(m[1]),
    password,
    host: m[3],
    port: m[4] ? Number(m[4]) : 5432,
    database: m[5] || "postgres",
  };
}

async function createPostgres(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const parts = parseDatabaseUrl(url);
  if (!parts) throw new Error("Invalid URL: DATABASE_URL no tiene el formato postgresql://usuario:clave@servidor:puerto/base");
  const local = parts.host === "localhost" || parts.host === "127.0.0.1";
  const sql = postgres({
    ...parts,
    ssl: local ? false : "require",
    prepare: false, // requerido por el "transaction pooler" de Supabase
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    types: {
      date: { to: DATE_OID, from: [DATE_OID], serialize: (x: string) => x, parse: (x: string) => x },
      // Los parámetros JSON ya llegan como texto (JSON.stringify): no codificarlos dos veces.
      jsonb: {
        to: 3802,
        from: [3802],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
      json: {
        to: 114,
        from: [114],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
    onnotice: () => {},
  });
  return {
    async query(text, params = []) {
      const rows = await sql.unsafe(text, params as any[]);
      return rows as unknown as any[];
    },
    async transaction(fn) {
      return (await sql.begin(async (tx) =>
        fn({ query: async (text, params = []) => (await tx.unsafe(text, params as any[])) as unknown as any[] }),
      )) as any;
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

async function createPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, { parsers: { [DATE_OID]: (x: string) => x } });
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as any[]);
      return res.rows as any[];
    },
    async transaction(fn) {
      return db.transaction((tx) =>
        fn({ query: async (text, params = []) => (await tx.query(text, params as any[])).rows as any[] }),
      );
    },
    close: () => db.close(),
  };
}

type G = typeof globalThis & { __jarvisDb?: Promise<Driver> };
const g = globalThis as G;

async function init(): Promise<Driver> {
  const url = env.databaseUrl();
  if (!url && process.env.VERCEL) {
    throw new Error("Falta DATABASE_URL: en producción Jarvis necesita la base de datos de Supabase.");
  }
  const driver = url ? await createPostgres(url) : await createPglite();
  await migrate(driver);
  return driver;
}

function driver(): Promise<Driver> {
  if (!g.__jarvisDb) {
    g.__jarvisDb = init().catch((e) => {
      g.__jarvisDb = undefined;
      throw e;
    });
  }
  return g.__jarvisDb;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await driver()).query<T>(text, params);
}

export async function transaction<R>(fn: (tx: Querier) => Promise<R>): Promise<R> {
  return (await driver()).transaction(fn);
}

export async function queryOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function usingLocalDatabase() {
  return !env.databaseUrl();
}

export async function closeDb() {
  if (g.__jarvisDb) {
    const d = await g.__jarvisDb;
    g.__jarvisDb = undefined;
    await d.close();
  }
}

// ── Migraciones ─────────────────────────────────────────────────────────────
// Se aplican solas al primer uso. Un candado de Postgres evita que dos
// instancias del servidor las ejecuten a la vez.
function migrationsDir() {
  return path.join(process.cwd(), "db", "migrations");
}

export async function migrate(d: Driver) {
  const files = fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await d.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(727274)");
    await tx.query(
      "create table if not exists public.jarvis_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await tx.query<{ name: string }>("select name from public.jarvis_migrations")).map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const text = fs.readFileSync(path.join(migrationsDir(), f), "utf8");
      try {
        for (const stmt of splitSql(text)) await tx.query(stmt);
      } catch (e) {
        throw new Error(`Falló la migración ${f}: ${(e as Error).message}`);
      }
      await tx.query("insert into public.jarvis_migrations (name) values ($1)", [f]);
    }
  });
}

// Separa un archivo SQL en sentencias (las migraciones no usan funciones con $$).
export function splitSql(text: string) {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
