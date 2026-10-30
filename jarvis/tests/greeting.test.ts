import { describe, expect, it } from "vitest";
import { buildGreeting } from "@/lib/greeting";

const base = { name: "Javier", tz: "America/New_York", random: () => 0 };

describe("saludo de Jarvis al abrir", () => {
  it("mañana con pendientes y hábitos", () => {
    const t = buildGreeting({
      ...base,
      now: new Date("2026-10-30T12:05:00Z"), // viernes 8:05 NY
      todayTasks: [{ title: "Llamar a mamá", due_time: "10:00" }, { title: "Comprar pan", due_time: null }],
      overdueCount: 1,
      pendingHabits: ["Leer", "Hacer ejercicio"],
      doneHabits: 0,
    });
    expect(t).toBe(
      "Buenos días, Javier. Todos los sistemas en orden. Tienes 2 pendientes hoy. El primero, Llamar a mamá, a las 10 de la mañana. Hay un asunto atrasado; cuando gustes lo reprogramamos. Hábitos por hacer: leer y hacer ejercicio. ¿Qué necesitas?",
    );
  });

  it("noche con el día despejado", () => {
    const t = buildGreeting({
      ...base,
      now: new Date("2026-10-31T01:30:00Z"), // viernes 21:30 NY
      todayTasks: [],
      overdueCount: 0,
      pendingHabits: [],
      doneHabits: 2,
    });
    expect(t).toMatch(/^Buenas noches, Javier\./);
    expect(t).toContain("Tu agenda de hoy está despejada.");
    expect(t).toContain("Hábitos de hoy cumplidos. Impecable.");
  });

  it("lee bien las horas de la tarde", () => {
    const t = buildGreeting({
      ...base,
      now: new Date("2026-10-30T16:00:00Z"),
      todayTasks: [{ title: "Gimnasio", due_time: "18:30" }],
      overdueCount: 0,
      pendingHabits: [],
      doneHabits: 0,
    });
    expect(t).toContain("Gimnasio, a las 6:30 de la tarde.");
  });
});
