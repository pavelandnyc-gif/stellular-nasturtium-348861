import Link from "next/link";
import { pageContext } from "@/lib/page";
import { completionHistory, listTasks, viewTask } from "@/lib/repo/tasks";
import { aiConfigured } from "@/lib/ai/agent";
import { formatInstant, todayIn } from "@/lib/time";
import { TaskItem } from "@/components/TaskItem";
import { QuickCapture } from "@/components/QuickCapture";
import { IconBack, IconCheck } from "@/components/icons";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const { user, tz } = await pageContext();
  const sp = await searchParams;
  const history = sp.ver === "historial";
  const q = sp.q?.slice(0, 100) ?? "";

  const tabs = (
    <div className="mb-4 flex gap-2">
      <Link href="/tareas" className="chip" data-on={!history}>Pendientes</Link>
      <Link href="/tareas?ver=historial" className="chip" data-on={history}>Completadas</Link>
    </div>
  );

  const header = (
    <header className="mb-4 flex items-center gap-2">
      <Link href="/" className="-ml-2 grid size-10 place-items-center text-muted" aria-label="Volver"><IconBack /></Link>
      <h1 className="text-2xl font-bold">Pendientes</h1>
    </header>
  );

  if (history) {
    const items = await completionHistory(user.id, 200);
    return (
      <main className="page">
        {header}
        {tabs}
        {items.length ? (
          <ul className="card divide-y divide-line/60 px-4">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="grid size-6 place-items-center rounded-full bg-ok/20 text-ok"><IconCheck className="size-3.5" /></span>
                <Link href={`/tareas/${c.task_id}`} className="min-w-0 flex-1">
                  <span className="block truncate">{c.title}</span>
                  <span className="text-xs text-muted">Completada {formatInstant(c.completed_at, tz)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-4 text-sm text-muted">Todavía no has completado tareas.</p>
        )}
      </main>
    );
  }

  const [overdue, today, upcoming, nodate] = await Promise.all(
    (["overdue", "today", "upcoming", "nodate"] as const).map((s) => listTasks(user.id, s, tz, { q })),
  );
  const sections = [
    { title: "Vencidas", items: overdue, tone: "text-bad" },
    { title: "Hoy", items: today, tone: "" },
    { title: "Próximas", items: upcoming, tone: "" },
    { title: "Sin fecha", items: nodate, tone: "" },
  ];
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <main className="page">
      {header}
      {tabs}
      <form className="mb-4">
        <input name="q" defaultValue={q} className="field" placeholder="Buscar tareas…" type="search" enterKeyHint="search" />
      </form>
      {total === 0 && <p className="card p-4 text-sm text-muted">{q ? "Sin resultados." : "No tienes pendientes. Usa ＋ para crear uno."}</p>}
      {sections
        .filter((s) => s.items.length)
        .map((s) => (
          <section key={s.title} className="mb-5">
            <h2 className={`mb-1 text-sm font-semibold uppercase tracking-wide text-muted ${s.tone}`}>
              {s.title} · {s.items.length}
            </h2>
            <ul className="card divide-y divide-line/60 px-4">
              {s.items.map((t) => (
                <TaskItem key={t.id} task={viewTask(t, tz)} />
              ))}
            </ul>
          </section>
        ))}
      <QuickCapture aiReady={aiConfigured()} today={todayIn(tz)} />
    </main>
  );
}
