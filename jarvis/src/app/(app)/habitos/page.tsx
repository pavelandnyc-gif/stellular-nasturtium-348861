import { pageContext } from "@/lib/page";
import { HABIT_SUGGESTIONS, describeHabit, listHabits } from "@/lib/repo/habits";
import { HabitRow, NewHabit, Suggestion } from "@/components/HabitManager";

export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { user, tz } = await pageContext();
  const { h: highlight } = await searchParams;
  const habits = await listHabits(user.id, tz, { includeInactive: true });
  const used = new Set(habits.map((h) => h.suggestion_key).filter(Boolean));
  const suggestions = HABIT_SUGGESTIONS.filter((s) => !used.has(s.key));
  const doneToday = habits.filter((h) => h.active && h.dueToday && h.doneToday).length;
  const dueToday = habits.filter((h) => h.active && h.dueToday).length;

  return (
    <main className="page">
      <h1 className="text-2xl font-bold">Hábitos</h1>
      <p className="mb-5 text-sm text-muted">
        {dueToday ? `Hoy: ${doneToday} de ${dueToday} hechos.` : "Constancia, no perfección."} Marcar hoy no cambia tus próximas repeticiones.
      </p>

      {suggestions.length > 0 && (
        <section className="mb-6 grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sugerencias</h2>
          {suggestions.map((s) => (
            <Suggestion key={s.key} k={s.key} emoji={s.emoji} name={s.name} desc={describeHabit({ days: [...s.days], habit_time: s.habit_time, target_minutes: s.target_minutes })} />
          ))}
        </section>
      )}

      <ul className="mb-4 grid gap-3">
        {habits.map((h) => (
          <HabitRow key={h.id} h={h} highlight={highlight === h.id} />
        ))}
      </ul>
      <NewHabit />
    </main>
  );
}
