// Lectura central de la configuración. Nada de aquí con "secreto" llega al navegador:
// solo las variables NEXT_PUBLIC_* se exponen, y esas son públicas por diseño.

function clean(v: string | undefined) {
  const t = v?.trim();
  return t ? t : undefined;
}

export const env = {
  appUrl: () => clean(process.env.APP_URL)?.replace(/\/$/, ""),
  databaseUrl: () => clean(process.env.DATABASE_URL),
  supabaseUrl: () => clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: () =>
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  allowedEmails: () =>
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  localPassword: () => clean(process.env.LOCAL_AUTH_PASSWORD),
  sessionSecret: () => clean(process.env.SESSION_SECRET),
  anthropicKey: () => clean(process.env.ANTHROPIC_API_KEY),
  aiModel: () => clean(process.env.AI_MODEL) ?? "claude-opus-5-5",
  aiEffort: (): "low" | "medium" | "high" => {
    const e = clean(process.env.AI_EFFORT);
    return e === "medium" || e === "high" ? e : "low";
  },
  vapidPublic: () => clean(process.env.VAPID_PUBLIC_KEY),
  vapidPrivate: () => clean(process.env.VAPID_PRIVATE_KEY),
  vapidSubject: () => clean(process.env.VAPID_SUBJECT) ?? "mailto:jarvis@example.com",
  cronSecret: () => clean(process.env.CRON_SECRET),
};

export type AuthMode = "supabase" | "local" | "none";

export function authMode(): AuthMode {
  if (env.supabaseUrl() && env.supabaseKey()) return "supabase";
  if (env.localPassword() && env.sessionSecret()) return "local";
  return "none";
}

export const DEFAULT_TZ = "America/New_York";
