import { api } from "@/lib/api";
import { dayInput } from "@/lib/day";
import { buildBriefing } from "@/lib/greeting";
import { getWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

/** Informe del día de Jarvis (hora, clima, pendientes y hábitos). */
export const GET = api(async (_req, { user, profile }) => {
  const unit = ((profile as { weather_unit?: string }).weather_unit === "C" ? "C" : "F") as "F" | "C";
  const [input, weather] = await Promise.all([
    dayInput(user.id, profile.timezone, profile.display_name),
    getWeather(profile.timezone, unit),
  ]);
  return { ok: true, text: buildBriefing({ ...input, weather }), weather };
});
