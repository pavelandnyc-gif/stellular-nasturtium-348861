import { pageContext } from "@/lib/page";
import { aiConfigured } from "@/lib/ai/agent";
import { dayInput } from "@/lib/day";
import { buildGreeting, hourlyRandom } from "@/lib/greeting";
import { nowIn, todayIn } from "@/lib/time";
import { JarvisGreeting } from "@/components/JarvisGreeting";

// Inicio: solo Jarvis y tú. Pendientes, hábitos y alertas están en la pestaña "Hoy".
export default async function Home() {
  const { user, profile, tz } = await pageContext();
  const input = await dayInput(user.id, tz, profile.display_name);
  const welcome = buildGreeting({ ...input, random: hourlyRandom(`${user.id}:${todayIn(tz)}:${nowIn(tz).hour}`) });
  return <JarvisGreeting text={welcome} name={profile.display_name} aiReady={aiConfigured()} />;
}
