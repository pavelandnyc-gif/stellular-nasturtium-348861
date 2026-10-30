import "server-only";

// Clima con Open-Meteo: gratis y sin cuenta. Por defecto, Nueva York.
// Se guarda 20 minutos en memoria para no consultarlo en cada saludo.

export interface Weather {
  temp: number;
  high: number;
  low: number;
  desc: string;
  rainChance: number; // % máximo del resto del día
  rainFromHour: number | null; // hora local en que la lluvia se vuelve probable (≥ 50 %)
  unit: "F" | "C";
}

const LAT = Number(process.env.WEATHER_LAT) || 40.7128;
const LON = Number(process.env.WEATHER_LON) || -74.006;

const CODES: [number[], string][] = [
  [[0], "despejado"],
  [[1, 2], "parcialmente nublado"],
  [[3], "nublado"],
  [[45, 48], "con niebla"],
  [[51, 53, 55, 56, 57], "con llovizna"],
  [[61, 63, 66, 80, 81], "con lluvia"],
  [[65, 67, 82], "con lluvia fuerte"],
  [[71, 73, 75, 77, 85, 86], "con nieve"],
  [[95, 96, 99], "con tormenta"],
];

function describe(code: number) {
  return CODES.find(([cs]) => cs.includes(code))?.[1] ?? "variable";
}

const cache = new Map<string, { at: number; data: Weather }>();

export async function getWeather(tz: string, unit: "F" | "C"): Promise<Weather | null> {
  const key = `${tz}:${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.data;
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    current: "temperature_2m,weather_code",
    hourly: "precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min",
    temperature_unit: unit === "C" ? "celsius" : "fahrenheit",
    timezone: tz,
    forecast_days: "1",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      current: { temperature_2m: number; weather_code: number; time: string };
      hourly: { time: string[]; precipitation_probability: (number | null)[] };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
    };
    const nowHour = Number(d.current.time.slice(11, 13));
    let rainChance = 0;
    let rainFromHour: number | null = null;
    d.hourly.time.forEach((t, i) => {
      const hour = Number(t.slice(11, 13));
      const p = d.hourly.precipitation_probability[i] ?? 0;
      if (hour < nowHour) return;
      rainChance = Math.max(rainChance, p);
      if (rainFromHour === null && p >= 50) rainFromHour = hour;
    });
    const data: Weather = {
      temp: Math.round(d.current.temperature_2m),
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      desc: describe(d.current.weather_code),
      rainChance,
      rainFromHour,
      unit,
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}
