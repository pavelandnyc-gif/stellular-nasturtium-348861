import { pageContext } from "@/lib/page";
import { aiConfigured } from "@/lib/ai/agent";
import { env } from "@/lib/env";
import { todayIn } from "@/lib/time";
import { Chat } from "@/components/Chat";

export default async function JarvisPage() {
  const { profile, tz } = await pageContext();
  return <Chat configured={aiConfigured()} model={env.aiModel()} name={profile.display_name} today={todayIn(tz)} />;
}
