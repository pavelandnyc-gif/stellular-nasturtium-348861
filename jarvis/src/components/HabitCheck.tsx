"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { IconCheck } from "./icons";
import { toast } from "./Toast";

const CHEERS = ["¡Bien hecho!", "Un día más. 💪", "Así se construye un hábito.", "¡Sigue así!"];

export function HabitCheck({
  id,
  name,
  emoji,
  done,
  detail,
  streak,
}: {
  id: string;
  name: string;
  emoji: string | null;
  done: boolean;
  detail?: string;
  streak?: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(done);
  async function toggle() {
    const next = !on;
    setOn(next);
    try {
      await call(`/api/habits/${id}/log`, "POST", { done: next });
      if (next) toast(`${emoji ?? "✅"} ${name}: ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}`);
      router.refresh();
    } catch {
      setOn(!next);
    }
  }
  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
        on ? "border-ok/40 bg-ok/10" : "border-line bg-white/[0.03]"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji ?? "⭐"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      {!!streak && streak > 1 && <span className="text-xs text-warn">🔥 {streak}</span>}
      <span
        className={`grid size-8 place-items-center rounded-full border-2 ${on ? "border-ok bg-ok text-ink" : "border-line text-transparent"}`}
      >
        <IconCheck className="size-4" />
      </span>
    </button>
  );
}
