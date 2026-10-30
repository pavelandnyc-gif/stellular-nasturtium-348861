import { z } from "zod";
import { api, body } from "@/lib/api";
import { aiConfigured, chat, describeAiError, saveChat } from "@/lib/ai/agent";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = api(async (_req, { user }) => {
  const rows = await query(
    "select id, role, content, actions, created_at from jarvis.chat_messages where user_id = $1 order by created_at desc, (role = 'assistant') desc limit 60",
    [user.id],
  );
  return { ok: true, configured: aiConfigured(), messages: rows.reverse() };
});

export const POST = api(async (req, { user, profile }) => {
  const { message } = await body(req, z.object({ message: z.string().trim().min(1).max(2000) }));
  if (!aiConfigured()) {
    return Response.json(
      { ok: false, configured: false, error: "La conversación con IA requiere configurar ANTHROPIC_API_KEY. Mientras tanto, usa los formularios." },
      { status: 503 },
    );
  }
  await saveChat(user.id, "user", message);
  try {
    const reply = await chat(user.id, profile.timezone, message, profile.display_name);
    await saveChat(user.id, "assistant", reply.text, reply.actions);
    return { ok: true, reply };
  } catch (e) {
    console.error("IA:", e);
    const error = describeAiError(e);
    await saveChat(user.id, "assistant", `⚠️ ${error}`);
    return Response.json({ ok: false, error }, { status: 502 });
  }
});

export const DELETE = api(async (_req, { user }) => {
  await query("delete from jarvis.chat_messages where user_id = $1", [user.id]);
  return { ok: true };
});
