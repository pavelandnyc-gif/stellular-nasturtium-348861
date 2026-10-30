import "server-only";
import { listHabits } from "./repo/habits";
import { listTasks } from "./repo/tasks";
import type { GreetingInput } from "./greeting";

/** Datos del día que usan el saludo y el informe. */
export async function dayInput(userId: string, tz: string, name: string): Promise<Omit<GreetingInput, "random" | "now">> {
  const [overdue, today, habits] = await Promise.all([
    listTasks(userId, "overdue", tz, { limit: 20 }),
    listTasks(userId, "today", tz, { limit: 30 }),
    listHabits(userId, tz),
  ]);
  const todays = habits.filter((h) => h.dueToday);
  return {
    name,
    tz,
    todayTasks: today.map((t) => ({ title: t.title, due_time: t.due_time })),
    overdueCount: overdue.length,
    pendingHabits: todays.filter((h) => !h.doneToday).map((h) => h.name),
    doneHabits: todays.filter((h) => h.doneToday).length,
  };
}
