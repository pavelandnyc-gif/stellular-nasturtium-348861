import { describe, expect, it } from "vitest";
import {
  advanceRecurring,
  formatFull,
  formatRecurrence,
  formatTime,
  formatWhen,
  nextOccurrenceDate,
  nextTaskFire,
  toInstant,
  todayIn,
} from "@/lib/time";

const NY = "America/New_York";

describe("zona horaria y horario de verano (America/New_York)", () => {
  it("8:00 a. m. sigue siendo 8:00 local antes y después del fin del horario de verano (1 nov 2026)", () => {
    // 31 oct: EDT (UTC-4) → 12:00Z. 2 nov: EST (UTC-5) → 13:00Z.
    expect(toInstant("2026-10-31", "08:00", NY).toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(toInstant("2026-11-01", "08:00", NY).toISOString()).toBe("2026-11-01T13:00:00.000Z");
    expect(toInstant("2026-11-02", "08:00", NY).toISOString()).toBe("2026-11-02T13:00:00.000Z");
  });

  it("inicio del horario de verano (8 mar 2026): 2:30 a. m. no existe y se mueve a 3:30 EDT", () => {
    expect(toInstant("2026-03-08", "02:30", NY).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(toInstant("2026-03-08", "09:00", NY).toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(toInstant("2026-03-07", "09:00", NY).toISOString()).toBe("2026-03-07T14:00:00.000Z");
  });

  it("'hoy' depende de la zona: 23:30 en NY ya es mañana en UTC", () => {
    const now = new Date("2026-10-30T03:30:00Z"); // 29 oct 23:30 en NY
    expect(todayIn(NY, now)).toBe("2026-10-29");
    expect(todayIn("UTC", now)).toBe("2026-10-30");
  });

  it("recordatorio diario a las 8:00 cruza el cambio de hora sin desfasarse", () => {
    const task = { due_date: "2026-10-31", due_time: "08:00", recurrence: { type: "daily" } };
    const afterSat = new Date("2026-10-31T12:30:00Z"); // sábado 8:30 EDT
    const f = nextTaskFire(task, NY, afterSat)!;
    expect(f.date).toBe("2026-11-01");
    expect(f.at.toISOString()).toBe("2026-11-01T13:00:00.000Z"); // 8:00 EST
  });
});

describe("repeticiones", () => {
  const mwf = { type: "weekly" as const, days: [1, 3, 5] };

  it("lunes, miércoles y viernes", () => {
    // 29 oct 2026 es jueves
    expect(nextOccurrenceDate(mwf, "2026-10-29")).toBe("2026-10-30"); // viernes
    expect(nextOccurrenceDate(mwf, "2026-10-30", true)).toBe("2026-11-02"); // lunes
    expect(formatRecurrence(mwf)).toBe("los lunes, miércoles y viernes");
    expect(formatRecurrence({ type: "daily" })).toBe("todos los días");
    expect(formatRecurrence({ type: "weekly", days: [1, 2, 3, 4, 5] })).toBe("de lunes a viernes");
  });

  it("completar una repetición avanza a la siguiente sin perder la serie", () => {
    const now = new Date("2026-10-30T14:00:00Z"); // viernes 10:00 NY
    expect(advanceRecurring(mwf, "2026-10-30", NY, now)).toBe("2026-11-02");
  });

  it("si estaba atrasada varios días, salta a la próxima desde hoy", () => {
    const now = new Date("2026-11-11T14:00:00Z"); // miércoles 11 nov
    expect(advanceRecurring(mwf, "2026-10-30", NY, now)).toBe("2026-11-11");
  });

  it("el próximo aviso de una tarea repetitiva ignora repeticiones que ya pasaron", () => {
    const now = new Date("2026-11-02T14:00:00Z"); // lunes 9:00 EST (ya pasó la de las 8:00)
    const f = nextTaskFire({ due_date: "2026-11-02", due_time: "08:00", recurrence: mwf }, NY, now)!;
    expect(f.date).toBe("2026-11-04");
  });

  it("una tarea única en el pasado no programa aviso", () => {
    const now = new Date("2026-10-30T15:00:00Z");
    expect(nextTaskFire({ due_date: "2026-10-30", due_time: "10:00", recurrence: null }, NY, now)).toBeNull();
  });
});

describe("formato en español", () => {
  const now = new Date("2026-10-29T16:00:00Z"); // jueves 29 oct 12:00 NY
  it("fechas relativas y completas", () => {
    expect(formatWhen("2026-10-30", "10:00", NY, now)).toBe("mañana, 10:00 a. m.");
    expect(formatWhen("2026-10-29", null, NY, now)).toBe("hoy");
    expect(formatWhen("2026-11-06", "20:30", NY, now)).toBe("viernes 6 de noviembre, 8:30 p. m.");
    expect(formatFull("2026-10-30", "10:00")).toBe("viernes 30 de octubre de 2026, 10:00 a. m.");
    expect(formatTime("00:05")).toBe("12:05 a. m.");
    expect(formatTime("12:00")).toBe("12:00 p. m.");
  });
});
