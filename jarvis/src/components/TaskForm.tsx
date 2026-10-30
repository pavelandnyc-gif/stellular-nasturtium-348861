"use client";
export interface TaskFormValue {
  due_date: string | null;
  due_time: string | null;
  priority: number | null;
  repeat: "none" | "daily" | "weekly";
  days: number[];
}

const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

export function addDaysIso(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function emptyTaskForm(): TaskFormValue {
  return { due_date: null, due_time: null, priority: null, repeat: "none", days: [] };
}

export function toRecurrence(v: TaskFormValue) {
  if (v.repeat === "daily") return { type: "daily" as const };
  if (v.repeat === "weekly" && v.days.length) return { type: "weekly" as const, days: v.days };
  return null;
}

/** Campos de fecha, hora, prioridad y repetición (todos opcionales). */
export function TaskFields({ value, onChange, today }: { value: TaskFormValue; onChange: (v: TaskFormValue) => void; today: string }) {
  const set = (p: Partial<TaskFormValue>) => onChange({ ...value, ...p });
  const tmr = addDaysIso(today, 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip" data-on={value.due_date === today} onClick={() => set({ due_date: value.due_date === today ? null : today })}>
          Hoy
        </button>
        <button type="button" className="chip" data-on={value.due_date === tmr} onClick={() => set({ due_date: value.due_date === tmr ? null : tmr })}>
          Mañana
        </button>
        {[1, 2, 3].map((p) => (
          <button key={p} type="button" className="chip" data-on={value.priority === p} onClick={() => set({ priority: value.priority === p ? null : p })}>
            {p === 1 ? "🔴 Alta" : p === 2 ? "🟡 Media" : "⚪ Baja"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Fecha
          <input type="date" className="field mt-1" value={value.due_date ?? ""} min={value.repeat === "none" ? today : undefined} onChange={(e) => set({ due_date: e.target.value || null })} />
        </label>
        <label className="text-xs text-muted">
          Hora (aviso)
          <input type="time" className="field mt-1" value={value.due_time ?? ""} onChange={(e) => set({ due_time: e.target.value || null })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Repetir:</span>
        {(["none", "daily", "weekly"] as const).map((r) => (
          <button key={r} type="button" className="chip" data-on={value.repeat === r} onClick={() => set({ repeat: r })}>
            {r === "none" ? "No" : r === "daily" ? "Cada día" : "Días…"}
          </button>
        ))}
      </div>
      {value.repeat === "weekly" && <DayPicker days={value.days} onChange={(days) => set({ days })} />}
      {value.due_time && !value.due_date && value.repeat === "none" && (
        <p className="text-xs text-warn">Elige una fecha para que el aviso pueda sonar.</p>
      )}
    </div>
  );
}

export function DayPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  return (
    <div className="flex justify-between gap-1">
      {DAY_LETTERS.map((l, i) => {
        const d = i + 1;
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            className="chip size-10 justify-center p-0"
            data-on={on}
            onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort())}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
