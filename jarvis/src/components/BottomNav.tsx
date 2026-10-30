"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBulb, IconChat, IconFlame, IconList } from "./icons";

const TABS = [
  { href: "/", label: "Jarvis", Icon: IconChat, match: (p: string) => p === "/" || p.startsWith("/jarvis") },
  { href: "/hoy", label: "Hoy", Icon: IconList, match: (p: string) => /^\/(hoy|tareas|ajustes)/.test(p) },
  { href: "/ideas", label: "Ideas", Icon: IconBulb, match: (p: string) => p.startsWith("/ideas") },
  { href: "/habitos", label: "Hábitos", Icon: IconFlame, match: (p: string) => p.startsWith("/habitos") },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-ink/85 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-[var(--nav-h)] max-w-[640px] items-stretch">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-cyan" : "text-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`size-6 transition-transform ${active ? "scale-110" : ""}`} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
