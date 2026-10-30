import "server-only";
import { query, queryOne } from "../db";

export interface Idea {
  id: string;
  user_id: string;
  content: string;
  task_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createIdea(userId: string, content: string) {
  return (await queryOne<Idea>("insert into jarvis.ideas (user_id, content) values ($1, $2) returning *", [
    userId,
    content.trim(),
  ]))!;
}

export async function listIdeas(userId: string, opts: { q?: string | null; sinceDays?: number | null; limit?: number } = {}) {
  const params: unknown[] = [userId];
  let where = "user_id = $1";
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    where += ` and content ilike $${params.length}`;
  }
  if (opts.sinceDays) {
    params.push(opts.sinceDays);
    where += ` and created_at >= now() - ($${params.length}::int * interval '1 day')`;
  }
  params.push(Math.min(opts.limit ?? 100, 500));
  return query<Idea>(`select * from jarvis.ideas where ${where} order by created_at desc limit $${params.length}`, params);
}

export async function getIdea(userId: string, id: string) {
  return queryOne<Idea>("select * from jarvis.ideas where user_id = $1 and id = $2", [userId, id]);
}

export async function updateIdea(userId: string, id: string, content: string) {
  return queryOne<Idea>(
    "update jarvis.ideas set content = $3, updated_at = now() where user_id = $1 and id = $2 returning *",
    [userId, id, content.trim()],
  );
}

export async function deleteIdea(userId: string, id: string) {
  const rows = await query("delete from jarvis.ideas where user_id = $1 and id = $2 returning id", [userId, id]);
  return rows.length > 0;
}

export async function linkIdeaToTask(userId: string, id: string, taskId: string) {
  await query("update jarvis.ideas set task_id = $3, updated_at = now() where user_id = $1 and id = $2", [userId, id, taskId]);
}
