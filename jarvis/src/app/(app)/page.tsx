import Link from "next/link";
import { pageContext } from "@/lib/page";
import { listTasks, viewTask } from "@/lib/repo/tasks";
import { listHabits } from "@/lib/repo/habits";
import { upcomingAlerts } from "@/lib/scheduler";
import { aiConfigured } from "@/lib/ai/agent";
import { formatFull, formatInstant, greeting, todayIn } from "@/lib/time";
import { TaskItem } from "@/components/TaskItem";
import { HabitCheck } from "@/components/HabitCheck";
import { QuickCapture } from "@/components/QuickCapture";
import { Nudges } from "@/components/Nudges";
import { IconBell, IconChat, IconGear } from "@/components/icons";

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
  const pendingHabits = todaysHabits.filter((h) => !h.doneToday).length;
  const ai = aiConfigured();
  const todayIso = todayIn(tz);

  return (
    <main className="page">
      <header className="mb-5 flex items-start justify-between">
        <div className="rise">
          <p className="text-sm capitalize text-muted">{formatFull(todayIso, null).replace(/ de \d{4}$/, "")}</p>
          <h1 className="text-[28px] font-bold tracking-tight">
            {greeting(tz)}, <span className="bg-gradient-to-r from-cyan-soft to-azure bg-clip-text text-transparent">{profile.display_name}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tasks.length === 0 && pendingHabits === 0
              ? "Día despejado. ¿Algo que quieras anotar?"
              : `${tasks.length} ${tasks.length === 1 ? "pendiente" : "pendientes"} y ${pendingHabits} ${pendingHabits === 1 ? "hábito" : "hábitos"} por hoy.`}
          </p>
        </div>
        <Link href="/ajustes" aria-label="Ajustes" className="grid size-11 place-items-center rounded-full bg-white/5 text-muted">
          <IconGear className="size-6" />
        </Link>
      </header>

      <Nudges />

      <Link href="/jarvis" className="rise card mb-5 flex items-center gap-3 p-4">
        <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-cyan to-azure text-ink">
          <IconChat className="size-6" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Hablar con Jarvis</span>
          <span className="block text-xs text-muted">
            {ai ? "“Recuérdame llamar a mi mamá mañana a las diez”" : "La IA requiere configuración · usa la captura rápida"}
          </span>
        </span>
      </Link>

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
