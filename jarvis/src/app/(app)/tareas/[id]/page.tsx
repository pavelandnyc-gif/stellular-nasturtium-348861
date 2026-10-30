import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page";
import { getTask, PRIORITY_LABEL, viewTask } from "@/lib/repo/tasks";
import { query } from "@/lib/db";
import { formatFull, formatInstant, todayIn } from "@/lib/time";
import { TaskDetail } from "@/components/TaskDetail";
import { IconBack, IconBell, IconRepeat } from "@/components/icons";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { user, tz } = await pageContext();
  const { id } = await params;
  const fromAlert = (await searchParams).aviso === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTask(user.id, id);
  if (!t) notFound();
  const v = viewTask(t, tz);
  const next = await query<{ fire_at: Date }>(
    "select fire_at from jarvis.notifications where ref_id = $1 and user_id = $2 and status = 'pending' order by fire_at limit 1",
    [id, user.id],
  );

  return (
    <main className="page">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/tareas" className="-ml-2 grid size-10 place-items-center text-muted" aria-label="Volver"><IconBack /></Link>
        <span className="text-sm text-muted">{fromAlert ? "Desde tu aviso" : "Tarea"}</span>
      </header>

      <section className="rise card mb-4 p-5">
        <h1 className={`text-2xl font-bold ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</h1>
        {t.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{t.notes}</p>}
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 text-muted">Cuándo</dt>
            <dd className={v.overdue ? "text-bad" : ""}>
              {t.due_date ? formatFull(t.due_date, t.due_time) : "Sin fecha"}
              {v.overdue && " · vencida"}
            </dd>
          </div>
          {v.repeat && (
            <div className="flex gap-2">
              <dt className="w-24 text-muted">Repite</dt>
              <dd className="flex items-center gap-1"><IconRepeat /> {v.repeat}</dd>
            </div>
          )}
          {t.priority && (
            <div className="flex gap-2">
              <dt className="w-24 text-muted">Prioridad</dt>
              <dd className="capitalize">{PRIORITY_LABEL[t.priority]}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-24 text-muted">Aviso</dt>
            <dd className="flex items-center gap-1">
              <IconBell className="size-4 text-cyan" />
              {next[0] ? formatInstant(next[0].fire_at, tz) : t.status === "done" ? "—" : t.due_time ? "Ya sonó" : "Sin hora, sin aviso"}
            </dd>
          </div>
          {t.status === "done" && t.completed_at && (
            <div className="flex gap-2">
              <dt className="w-24 text-muted">Completada</dt>
              <dd>{formatInstant(t.completed_at, tz)}</dd>
            </div>
          )}
        </dl>
      </section>

      <TaskDetail
        task={{
          id: t.id,
          title: t.title,
          notes: t.notes,
          status: t.status,
          due_date: t.due_date,
          due_time: t.due_time,
          priority: t.priority,
          recurrence: v.recurrence,
          remind: t.remind,
        }}
        today={todayIn(tz)}
      />
    </main>
  );
}
