import Link from "next/link";
import { pageContext } from "@/lib/page";
import { listIdeas } from "@/lib/repo/ideas";
import { aiConfigured } from "@/lib/ai/agent";
import { formatInstant, todayIn } from "@/lib/time";
import { IdeaCard } from "@/components/IdeaCard";
import { QuickCapture } from "@/components/QuickCapture";

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ q?: string; dias?: string; id?: string }> }) {
  const { user, tz } = await pageContext();
  const sp = await searchParams;
  const q = sp.q?.slice(0, 100) ?? "";
  const dias = Number(sp.dias) || null;
  const ideas = await listIdeas(user.id, { q, sinceDays: dias, limit: 300 });

  return (
    <main className="page">
      <h1 className="mb-4 text-2xl font-bold">Ideas</h1>
      <form className="mb-3">
        {dias && <input type="hidden" name="dias" value={dias} />}
        <input name="q" defaultValue={q} className="field" placeholder="Buscar en tus ideas…" type="search" enterKeyHint="search" />
      </form>
      <div className="mb-4 flex gap-2">
        <Link href={`/ideas${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="chip" data-on={!dias}>Todas</Link>
        <Link href={`/ideas?dias=7${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="chip" data-on={dias === 7}>Esta semana</Link>
        <Link href={`/ideas?dias=30${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="chip" data-on={dias === 30}>Este mes</Link>
      </div>
      {ideas.length ? (
        <ul className="grid gap-3">
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} when={`Guardada ${formatInstant(i.created_at, tz)}`} today={todayIn(tz)} highlight={sp.id === i.id} />
          ))}
        </ul>
      ) : (
        <p className="card p-4 text-sm text-muted">
          {q || dias ? "No encontré ideas con ese filtro." : "Aún no guardas ideas. Toca ＋ y escribe lo que se te ocurra."}
        </p>
      )}
      <QuickCapture aiReady={aiConfigured()} today={todayIn(tz)} label />
    </main>
  );
}
