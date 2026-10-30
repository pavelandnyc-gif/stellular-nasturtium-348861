import Link from "next/link";
import { pageContext } from "@/lib/page";
import { listTasks, viewTask } from "@/lib/repo/tasks";
import { listHabits } from "@/lib/repo/habits";
import { upcomingAlerts } from "@/lib/scheduler";
import { aiConfigured } from "@/lib/ai/agent";
import { formatFull, formatInstant, todayIn } from "@/lib/time";
import { TaskItem } from "@/components/TaskItem";
import { HabitCheck } from "@/components/HabitCheck";
import { QuickCapture } from "@/components/QuickCapture";
import { Nudges } from "@/components/Nudges";
import { IconBell, IconGear } from "@/components/icons";
import { JarvisGreeting } from "@/components/JarvisGreeting";
import { buildGreeting } from "@/lib/greeting";

export default async function Home() {
  const { user, profile, tz } = await pageContext();
  const [overdue, today, habits, alerts] = await Promise.all([
    listTasks(user.id, "overdue", tz, { limit: 20 }),
    listTasks(user.id, "today", tz, { limit: 30 }),
    listHabits(user.id, tz),
    upcomingAlerts(user.id, 5),
  ]);
  const tasks = [...overdue, ...today].map((t) => viewTask(t, tz));
  const todaysHabits = habits.filter((h) => h.dueToday);
  const ai = aiConfigured();
  const todayIso = todayIn(tz);
  const welcome = buildGreeting({
    name: profile.display_name,
    tz,
    todayTasks: today.map((t) => ({ title: t.title, due_time: t.due_time })),
    overdueCount: overdue.length,
    pendingHabits: todaysHabits.filter((h) => !h.doneToday).map((h) => h.name),
    doneHabits: todaysHabits.filter((h) => h.doneToday).length,
  });

  return (
    <main className="page">
      <header className="mb-1 flex items-center justify-between">
        <p className="text-sm text-muted first-letter:uppercase">{formatFull(todayIso, null).replace(/ de \d{4}$/, "")}</p>
        <Link href="/ajustes" aria-label="Ajustes" className="grid size-11 place-items-center rounded-full bg-white/5 text-muted">
          <IconGear className="size-6" />
        </Link>
      </header>

      <JarvisGreeting text={welcome} aiReady={ai} />

      <Nudges />

      <section className="mb-6">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Tareas de hoy</h2>
          <Link href="/tareas" className="text-sm text-cyan">Ver todas</Link>
        </div>
        {tasks.length ? (
          <ul className="card divide-y divide-line/60 px-4">
            {tasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        ) : (
          <p className="card p-4 text-sm text-muted">Nada pendiente para hoy. 🎉</p>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Hábitos de hoy</h2>
          <Link href="/habitos" className="text-sm text-cyan">Gestionar</Link>
        </div>
        {todaysHabits.length ? (
          <div className="grid gap-2">
            {todaysHabits.map((h) => (
              <HabitCheck key={h.id} id={h.id} name={h.name} emoji={h.emoji} done={h.doneToday} detail={h.schedule} streak={h.streak} />
            ))}
          </div>
        ) : (
          <Link href="/habitos" className="card block p-4 text-sm text-muted">
            {habits.length ? "Hoy no toca ningún hábito. Descansa." : "Aún no tienes hábitos. Activa “Ejercicio” o “Lectura” →"}
          </Link>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Próximas alertas</h2>
        {alerts.length ? (
          <ul className="card divide-y divide-line/60 px-4">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.url} className="flex items-center gap-3 py-3">
                  <IconBell className="size-4 text-cyan" />
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="text-xs text-muted">{formatInstant(a.fire_at, tz)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-4 text-sm text-muted">No hay avisos programados. Pon una hora a una tarea para recibir uno.</p>
        )}
      </section>

      <QuickCapture aiReady={ai} today={todayIso} />
    </main>
  );
}
