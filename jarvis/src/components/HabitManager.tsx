"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";
import { DayPicker } from "./TaskForm";
import { HabitCheck } from "./HabitCheck";

export interface HabitData {
  id: string;
  name: string;
  emoji: string | null;
  days: number[];
  habit_time: string | null;
  target_minutes: number | null;
  remind: boolean;
  active: boolean;
  schedule: string;
  dueToday: boolean;
  doneToday: boolean;
  streak: number;
  last7: { date: string; scheduled: boolean; done: boolean }[];
}

const LETTERS = ["", "L", "M", "X", "J", "V", "S", "D"];

function weekdayLetter(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return LETTERS[wd === 0 ? 7 : wd];
}

export function HabitRow({ h, highlight }: { h: HabitData; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const missed = h.last7.slice(0, 6).filter((d) => d.scheduled && !d.done).length;
  return (
    <li id={h.id} className={`rise card p-4 ${highlight ? "border-cyan/60" : ""} ${h.active ? "" : "opacity-60"}`}>
      {h.active && h.dueToday ? (
        <HabitCheck id={h.id} name={h.name} emoji={h.emoji} done={h.doneToday} detail={h.schedule} streak={h.streak} />
      ) : (
        <div className="flex items-center gap-3 p-1">
          <span className="text-2xl">{h.emoji ?? "⭐"}</span>
          <div className="flex-1">
            <div className="font-medium">{h.name}</div>
            <div className="text-xs text-muted">{h.active ? `${h.schedule} · hoy no toca` : "En pausa"}</div>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-end justify-between">
        <div className="flex gap-1.5" aria-label="Últimos 7 días">
          {h.last7.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <span
                className={`size-3 rounded-full ${d.done ? "bg-ok" : d.scheduled ? "border border-line bg-white/5" : "bg-transparent"}`}
                title={d.date}
              />
              <span className="text-[10px] text-muted">{weekdayLetter(d.date)}</span>
            </div>
          ))}
        </div>
        <button className="chip" onClick={() => setEditing((e) => !e)}>{editing ? "Cerrar" : "Ajustar"}</button>
      </div>
      {h.active && missed >= 2 && !h.doneToday && (
        <p className="mt-2 text-xs text-cyan-soft">Retomar es más fácil con poco: ¿qué tal solo 5 minutos hoy?</p>
      )}
      {editing && <HabitEditor h={h} onDone={() => setEditing(false)} />}
    </li>
  );
}

function HabitEditor({ h, onDone }: { h: HabitData; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(h.name);
  const [days, setDays] = useState<number[]>(h.days);
  const [time, setTime] = useState(h.habit_time ?? "");
  const [mins, setMins] = useState(h.target_minutes?.toString() ?? "");
  const [remind, setRemind] = useState(h.remind);
  const [busy, setBusy] = useState(false);

  async function save(extra: object = {}) {
    setBusy(true);
    try {
      await call(`/api/habits/${h.id}`, "PATCH", {
        name,
        days,
        habit_time: time || null,
        target_minutes: mins ? Number(mins) : null,
        remind,
        ...extra,
      });
      toast("Hábito actualizado");
      onDone();
      router.refresh();
    } catch {
      /* */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      <div>
        <p className="mb-1 text-xs text-muted">Días (ninguno marcado = todos los días)</p>
        <DayPicker days={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Hora del aviso
          <input type="time" className="field mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Minutos
          <input type="number" inputMode="numeric" min={1} max={1440} className="field mt-1" value={mins} onChange={(e) => setMins(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="size-5 accent-cyan-400" />
        Avisarme a esa hora
      </label>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn btn-primary col-span-3" disabled={busy || !name.trim()} onClick={() => save()}>Guardar</button>
        <button className="btn btn-ghost col-span-2 text-sm" disabled={busy} onClick={() => save({ active: !h.active })}>
          {h.active ? "Pausar hábito" : "Reactivar"}
        </button>
        <button
          className="btn btn-danger text-sm"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`¿Eliminar “${h.name}” y su historial?`)) return;
            await call(`/api/habits/${h.id}`, "DELETE");
            toast("Hábito eliminado");
            router.refresh();
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

export function Suggestion({ k, emoji, name, desc }: { k: "exercise" | "reading"; emoji: string; name: string; desc: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="text-3xl">{emoji}</span>
      <div className="flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <button
        className="btn btn-primary h-10 px-4 text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await call("/api/habits", "POST", { suggestion: k });
            toast(`${emoji} ${name} activado. Puedes ajustar días y hora.`);
            router.refresh();
          } catch {
            setBusy(false);
          }
        }}
      >
        Activar
      </button>
    </div>
  );
}

export function NewHabit() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("⭐");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [mins, setMins] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="btn btn-ghost w-full" onClick={() => setOpen(true)}>
        ＋ Nuevo hábito
      </button>
    );
  return (
    <div className="card space-y-3 p-4">
      <div className="flex gap-2">
        <input className="field w-16 text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
        <input className="field" placeholder="Ej.: Meditar" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">Días (ninguno = todos los días)</p>
        <DayPicker days={days} onChange={setDays} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Hora del aviso (opcional)
          <input type="time" className="field mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Minutos (opcional)
          <input type="number" inputMode="numeric" min={1} max={1440} className="field mt-1" value={mins} onChange={(e) => setMins(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
        <button
          className="btn btn-primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await call("/api/habits", "POST", {
                name,
                emoji: emoji || null,
                days,
                habit_time: time || null,
                target_minutes: mins ? Number(mins) : null,
                remind: !!time,
              });
              toast("Hábito creado");
              setOpen(false);
              setName("");
              router.refresh();
            } catch {
              /* */
            } finally {
              setBusy(false);
            }
          }}
        >
          Crear
        </button>
      </div>
    </div>
  );
}
