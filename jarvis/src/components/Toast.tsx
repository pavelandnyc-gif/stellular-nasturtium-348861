"use client";
import { useEffect, useState } from "react";

type Kind = "ok" | "error" | "info";
interface Item {
  id: number;
  text: string;
  kind: Kind;
}

export function toast(text: string, kind: Kind = "ok") {
  window.dispatchEvent(new CustomEvent("jarvis-toast", { detail: { text, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { text, kind } = (e as CustomEvent).detail;
      const id = ++n;
      setItems((xs) => [...xs, { id, text, kind }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
    };
    window.addEventListener("jarvis-toast", on);
    return () => window.removeEventListener("jarvis-toast", on);
  }, []);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{ top: "calc(var(--safe-top) + 10px)" }}
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`rise pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
            t.kind === "error"
              ? "border-bad/40 bg-[#2a1012]/95 text-red-100"
              : t.kind === "info"
                ? "border-line bg-panel/95 text-text"
                : "border-cyan/40 bg-[#062028]/95 text-cyan-50"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
