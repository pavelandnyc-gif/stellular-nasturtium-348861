import "server-only";
import { query, queryOne } from "../db";
import { DEFAULT_TZ } from "../env";

export interface Profile {
  user_id: string;
  email: string | null;
  display_name: string;
  timezone: string;
  summary_enabled: boolean;
  summary_time: string;
  voice_id: string | null;
  weather_unit: "F" | "C";
}

export async function getProfile(userId: string, email: string | null = null): Promise<Profile> {
  const row = await queryOne<Profile>("select * from jarvis.profiles where user_id = $1", [userId]);
  if (row) return row;
  const created = await queryOne<Profile>(
    `insert into jarvis.profiles (user_id, email, timezone) values ($1, $2, $3)
     on conflict (user_id) do update set email = coalesce(jarvis.profiles.email, excluded.email)
     returning *`,
    [userId, email, DEFAULT_TZ],
  );
  return created!;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, "display_name" | "timezone" | "summary_enabled" | "summary_time" | "voice_id" | "weather_unit">>,
) {
  const p = await getProfile(userId);
  const next = { ...p, ...patch };
  const rows = await query<Profile>(
    `update jarvis.profiles set display_name = $2, timezone = $3, summary_enabled = $4, summary_time = $5, voice_id = $6, weather_unit = $7, updated_at = now()
     where user_id = $1 returning *`,
    [userId, next.display_name, next.timezone, next.summary_enabled, next.summary_time, next.voice_id ?? null, next.weather_unit ?? "F"],
  );
  return rows[0];
}
