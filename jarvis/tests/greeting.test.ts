import { describe, expect, it } from "vitest";
import { buildBriefing, buildGreeting } from "@/lib/greeting";

const base = { name: "Jefe", tz: "America/New_York", random: () => 0 };
const busy = {
  todayTasks: [{ title: "Llamar a mamá", due_time: "10:00" }, { title: "Comprar pan", due_time: null }],
  overdueCount: 1,
  pendingHabits: ["Leer", "Hacer ejercicio"],
  doneHabits: 0,
};

describe("saludo corto de Jarvis", () => {
  it("con pendientes ofrece el informe", () => {
    const t = buildGreeting({ ...base, ...busy, now: new Date("2026-10-30T12:05:00Z") });
    expect(t).toBe("Buenos días, Jefe. Sistemas en línea, agenda cargada y listo para despegar. ¿Te doy el informe del día?");
  });
  it("sin nada pendiente, ofrece ayuda", () => {
    const t = buildGreeting({ ...base, todayTasks: [], overdueCount: 0, pendingHabits: [], doneHabits: 1, now: new Date("2026-10-31T01:30:00Z") });
    expect(t).toMatch(/^Buenas noches, Jefe\./);
    expect(t).toContain("Agenda despejada. ¿En qué te ayudo?");
  });
});

describe("informe del día", () => {
  const now = new Date("2026-10-30T12:05:00Z"); // 8:05 NY
  it("incluye hora, clima con aviso de lluvia, pendientes y hábitos", () => {
    const t = buildBriefing({
      ...base,
      ...busy,
      now,
      weather: { temp: 57, high: 63, low: 50, desc: "nublado", rainChance: 80, rainFromHour: 17, unit: "F" },
    });
    expect(t).toContain("Son las 8:05 de la mañana.");
    expect(t).toContain("Afuera, 57 grados y nublado; máxima de 63. Lluvia probable desde las 5 de la tarde: te sugiero paraguas.");
    expect(t).toContain("Tengo 2 pendientes en el radar. El primero, Llamar a mamá, a las 10 de la mañana.");
    expect(t).toContain("leer y hacer ejercicio te esperan");
    expect(t).toMatch(/Eso es todo\. ¿Algo más\?$/);
  });
  it("funciona sin clima", () => {
    const t = buildBriefing({ ...base, ...busy, now, weather: null });
    expect(t).not.toContain("grados");
    expect(t).toContain("Tengo 2 pendientes");
  });
  it("lee bien las horas de la tarde", () => {
    const t = buildBriefing({
      ...base,
      now,
      todayTasks: [{ title: "Gimnasio", due_time: "18:30" }],
      overdueCount: 0,
      pendingHabits: [],
      doneHabits: 0,
      weather: null,
    });
    expect(t).toContain("Gimnasio, a las 6:30 de la tarde.");
  });
});
