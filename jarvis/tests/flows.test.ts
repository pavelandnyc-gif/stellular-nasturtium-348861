import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

// Servicio push simulado: así se prueban envíos, errores y reintentos sin un iPhone.
const pushMock = vi.hoisted(() => ({ calls: [] as { endpoint: string; body: any; opts: any }[], nextStatus: [] as number[] }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string, opts: any) => {
      pushMock.calls.push({ endpoint: sub.endpoint, body: JSON.parse(body), opts });
      const status = pushMock.nextStatus.shift() ?? 201;
      if (status >= 400) throw Object.assign(new Error(`status ${status}`), { statusCode: status });
      return { statusCode: status };
    },
  },
}));

process.env.PGLITE_DIR = "memory://";
process.env.VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";

const { query, queryOne, closeDb } = await import("@/lib/db");
const ideas = await import("@/lib/repo/ideas");
const tasks = await import("@/lib/repo/tasks");
const habits = await import("@/lib/repo/habits");
const { getProfile } = await import("@/lib/repo/profile");
const scheduler = await import("@/lib/scheduler");
const { runTool } = await import("@/lib/ai/tools");

const U = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TZ = "America/New_York";
const today = () => DateTime.now().setZone(TZ).toISODate()!;
const plusDays = (n: number) => DateTime.now().setZone(TZ).plus({ days: n }).toISODate()!;

async function pending(refId: string) {
  return query("select * from jarvis.notifications where ref_id = $1 and status = 'pending' order by fire_at", [refId]);
}

beforeAll(async () => {
  await getProfile(U, "javier@example.com");
  await getProfile(OTHER, "otro@example.com");
  await query(
    "insert into jarvis.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://web.push.apple.com/abc', 'p256dh-key-xxxxx', 'authkey')",
    [U],
  );
});
afterAll(() => closeDb());
beforeEach(() => {
  pushMock.calls.length = 0;
  pushMock.nextStatus.length = 0;
});

describe("ideas", () => {
  it("guardar, buscar, editar y convertir en tarea", async () => {
    const i = await ideas.createIdea(U, "Quiero aprender a editar videos");
    expect((await ideas.listIdeas(U, { q: "videos" })).map((x) => x.id)).toContain(i.id);
    expect(await ideas.listIdeas(U, { q: "inexistente" })).toHaveLength(0);
    expect(await ideas.listIdeas(OTHER, { q: "videos" })).toHaveLength(0); // aislamiento entre usuarios
    const up = await ideas.updateIdea(U, i.id, "Aprender a editar videos en CapCut");
    expect(up?.content).toContain("CapCut");
    expect(await ideas.updateIdea(OTHER, i.id, "hack")).toBeNull();

    const r = await runTool("convert_idea_to_task", { idea_id: i.id, title: null, date: plusDays(2), time: null, priority: "media" }, { userId: U, tz: TZ });
    expect(r.isError).toBe(false);
    const linked = await ideas.getIdea(U, i.id);
    expect(linked?.task_id).toBeTruthy();
  });
});

describe("tareas y avisos", () => {
  it("crear con hora programa un aviso; reprogramar cancela el viejo y crea el nuevo", async () => {
    const t = await tasks.createTask(U, { title: "Llamar a mamá", due_date: plusDays(1), due_time: "10:00" }, TZ);
    let p = await pending(t.id);
    expect(p).toHaveLength(1);
    expect(new Date(p[0].fire_at).toISOString()).toBe(DateTime.fromISO(`${plusDays(1)}T10:00`, { zone: TZ }).toUTC().toISO({ suppressMilliseconds: false }));

    await tasks.updateTask(U, t.id, { due_date: plusDays(2) });
    p = await pending(t.id);
    expect(p).toHaveLength(1);
    expect(p[0].occurrence).toBe(`${plusDays(2)}T10:00`);
    const canceled = await query("select * from jarvis.notifications where ref_id = $1 and status = 'canceled'", [t.id]);
    expect(canceled).toHaveLength(1);
  });

  it("completar una tarea única cancela su aviso y queda en el historial", async () => {
    const t = await tasks.createTask(U, { title: "Pagar la luz", due_date: plusDays(1), due_time: "09:00" }, TZ);
    await tasks.completeTask(U, t.id, TZ);
    expect(await pending(t.id)).toHaveLength(0);
    const h = await tasks.completionHistory(U);
    expect(h.some((c) => c.task_id === t.id)).toBe(true);
    expect((await tasks.getTask(U, t.id))?.status).toBe("done");
  });

  it("completar una repetición conserva las siguientes", async () => {
    const t = await tasks.createTask(U, { title: "Sacar la basura", due_time: "20:00", recurrence: { type: "daily" } }, TZ);
    const first = t.due_date!;
    const r = await tasks.completeTask(U, t.id, TZ);
    expect(r?.task.status).toBe("pending");
    expect(r?.nextDate).toBe(DateTime.fromISO(first).plus({ days: 1 }).toISODate());
    const p = await pending(t.id);
    expect(p).toHaveLength(1);
    expect(p[0].occurrence).toBe(`${r!.nextDate}T20:00`);
    const again = await tasks.completeTask(U, t.id, TZ);
    expect(again?.nextDate).toBe(DateTime.fromISO(first).plus({ days: 2 }).toISODate());
    const hist = await query("select * from jarvis.task_completions where task_id = $1", [t.id]);
    expect(hist).toHaveLength(2);
  });

  it("posponer una tarea única mueve su hora; eliminar cancela los avisos", async () => {
    const t = await tasks.createTask(U, { title: "Revisar correo", due_date: plusDays(1), due_time: "11:00" }, TZ);
    const s = await tasks.snoozeTask(U, t.id, 60, TZ);
    expect(s).not.toBeNull();
    const p = await pending(t.id);
    expect(p).toHaveLength(1);
    expect(Math.abs(new Date(p[0].fire_at).getTime() - s!.until.getTime())).toBeLessThan(1000);
    await tasks.deleteTask(U, t.id);
    expect(await pending(t.id)).toHaveLength(0);
  });

  it("listas de hoy, próximas y vencidas", async () => {
    await query("insert into jarvis.tasks (user_id, title, due_date) values ($1, 'Vieja', $2::date)", [U, plusDays(-3)]);
    await tasks.createTask(U, { title: "Hoy sin hora", due_date: today() }, TZ);
    expect((await tasks.listTasks(U, "overdue", TZ)).map((t) => t.title)).toContain("Vieja");
    expect((await tasks.listTasks(U, "today", TZ)).map((t) => t.title)).toContain("Hoy sin hora");
    expect((await tasks.listTasks(U, "upcoming", TZ)).map((t) => t.title)).toContain("Llamar a mamá");
    expect(await tasks.listTasks(OTHER, "upcoming", TZ)).toHaveLength(0);
  });
});

describe("despacho de avisos (programador)", () => {
  it("envía al vencer, no duplica y agenda la siguiente repetición", async () => {
    const t = await tasks.createTask(U, { title: "Tomar vitaminas", due_time: "07:30", recurrence: { type: "daily" } }, TZ);
    const [n] = await pending(t.id);
    const at = new Date(new Date(n.fire_at).getTime() + 10_000);

    const r1 = await scheduler.dispatchDue(at);
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    const mine = pushMock.calls.filter((c) => c.body.id === n.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].body.url).toBe(`/tareas/${t.id}?aviso=1`);
    expect(mine[0].opts.topic).toBe(n.id.replace(/-/g, "").slice(0, 32));

    const row = await queryOne("select status, sent_at from jarvis.notifications where id = $1", [n.id]);
    expect(row?.status).toBe("sent");

    // Segunda ejecución en el mismo minuto: no reenvía
    await scheduler.dispatchDue(at);
    expect(pushMock.calls.filter((c) => c.body.id === n.id)).toHaveLength(1);

    // Volver a sincronizar no puede revivir un aviso ya enviado (dedupe_key)
    await scheduler.syncTaskNotifications(t.id);
    const again = await queryOne("select status from jarvis.notifications where id = $1", [n.id]);
    expect(again?.status).toBe("sent");

    // La siguiente repetición queda programada
    const next = await pending(t.id);
    expect(next).toHaveLength(1);
    expect(next[0].id).not.toBe(n.id);
  });

  it("reintenta errores temporales y marca 'failed' tras agotar intentos", async () => {
    const t = await tasks.createTask(U, { title: "Reintento", due_date: plusDays(1), due_time: "15:00" }, TZ);
    const [n] = await pending(t.id);
    let at = new Date(new Date(n.fire_at).getTime() + 5_000);
    pushMock.nextStatus.push(503);
    await scheduler.dispatchDue(at);
    let row = await queryOne("select * from jarvis.notifications where id = $1", [n.id]);
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(new Date(row!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    // Fallan todos los intentos
    for (let i = 0; i < 4; i++) {
      pushMock.nextStatus.push(503);
      at = new Date(Math.max(at.getTime(), new Date(row!.next_attempt_at ?? 0).getTime()) + 61 * 60_000);
      await scheduler.dispatchDue(at);
      row = await queryOne("select * from jarvis.notifications where id = $1", [n.id]);
      if (row?.status !== "pending") break;
    }
    expect(row?.status).toBe("failed");
  });

  it("una suscripción caducada (410) se elimina", async () => {
    await query(
      "insert into jarvis.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/old', 'p256dh-key-yyyyy', 'authkey2')",
      [OTHER],
    );
    const t = await tasks.createTask(OTHER, { title: "Aviso a suscripción vieja", due_date: plusDays(1), due_time: "12:00" }, TZ);
    const [n] = await pending(t.id);
    pushMock.nextStatus.push(410);
    await scheduler.dispatchDue(new Date(new Date(n.fire_at).getTime() + 1000));
    expect(await query("select 1 from jarvis.push_subscriptions where user_id = $1", [OTHER])).toHaveLength(0);
    expect((await queryOne("select status from jarvis.notifications where id = $1", [n.id]))?.status).toBe("failed");
  });

  it("un aviso con más de 6 horas de retraso no se envía", async () => {
    const t = await tasks.createTask(U, { title: "Muy tarde", due_date: plusDays(1), due_time: "06:00" }, TZ);
    const [n] = await pending(t.id);
    await scheduler.dispatchDue(new Date(new Date(n.fire_at).getTime() + 7 * 3600_000));
    expect((await queryOne("select status from jarvis.notifications where id = $1", [n.id]))?.status).toBe("expired");
    expect(pushMock.calls.filter((c) => c.body.id === n.id)).toHaveLength(0);
  });

  it("notificación de prueba: se envía al instante y registra la confirmación del dispositivo", async () => {
    const { id, result } = await scheduler.sendTestNotification(U);
    expect(result).toBe("sent");
    const sent = pushMock.calls.find((c) => c.body.id === id)!;
    expect(sent.body.token).toHaveLength(32);
    const { POST } = await import("@/app/api/push/receipt/route");
    const bad = await POST(new Request("http://x/api/push/receipt", { method: "POST", body: JSON.stringify({ id, token: "0".repeat(32), event: "received" }) }));
    expect(bad.status).toBe(200);
    expect((await queryOne("select received_at from jarvis.notifications where id = $1", [id]))?.received_at).toBeNull();
    await POST(new Request("http://x/api/push/receipt", { method: "POST", body: JSON.stringify({ id, token: sent.body.token, event: "received" }) }));
    expect((await queryOne("select received_at from jarvis.notifications where id = $1", [id]))?.received_at).not.toBeNull();
  });
});

describe("hábitos", () => {
  it("marcar hoy conserva las próximas repeticiones y salta el aviso de hoy", async () => {
    const h = await habits.createHabit(U, { name: "Leer", emoji: "📖", days: [], habit_time: "23:59", target_minutes: 20 });
    let p = await pending(h.id);
    expect(p).toHaveLength(1);
    const firstDate = p[0].occurrence.slice(0, 10);

    await habits.setHabitLog(U, h.id, firstDate, true);
    p = await pending(h.id);
    expect(p).toHaveLength(1);
    expect(p[0].occurrence.slice(0, 10)).toBe(DateTime.fromISO(firstDate).plus({ days: 1 }).toISODate());

    const list = await habits.listHabits(U, TZ);
    const v = list.find((x) => x.id === h.id)!;
    expect(v.schedule).toContain("todos los días");
    if (firstDate === today()) {
      expect(v.doneToday).toBe(true);
      expect(v.streak).toBe(1);
    }

    // desmarcar devuelve el aviso de ese día
    await habits.setHabitLog(U, h.id, firstDate, false);
    p = await pending(h.id);
    expect(p[0].occurrence.slice(0, 10)).toBe(firstDate);
  });

  it("sugerencias: ejercicio L-M-V a las 8:00", async () => {
    const s = habits.HABIT_SUGGESTIONS.find((x) => x.key === "exercise")!;
    const h = await habits.createHabit(U, { name: s.name, days: [...s.days], habit_time: s.habit_time, suggestion_key: s.key });
    expect(habits.describeHabit(h)).toBe("los lunes, miércoles y viernes a las 8:00 a. m.");
    const [n] = await pending(h.id);
    expect([1, 3, 5]).toContain(DateTime.fromJSDate(new Date(n.fire_at)).setZone(TZ).weekday);
  });
});

describe("resumen diario", () => {
  it("se programa a la hora elegida y usa datos reales", async () => {
    await query("update jarvis.profiles set summary_enabled = true, summary_time = '07:00' where user_id = $1", [U]);
    await scheduler.syncSummary(U);
    const [n] = await query("select * from jarvis.notifications where user_id = $1 and kind = 'summary' and status = 'pending'", [U]);
    expect(DateTime.fromJSDate(new Date(n.fire_at)).setZone(TZ).toFormat("HH:mm")).toBe("07:00");
    const text = await scheduler.buildDailySummary(U, TZ);
    expect(text).toMatch(/Hoy sin hora|tareas? hoy/);
    expect(text).toContain("atrasado");
    expect(text).toContain("Leer");
  });
});

describe("herramientas de la IA (validación en el servidor)", () => {
  const ctx = { userId: U, tz: TZ };
  it("rechaza fechas y horas inválidas sin guardar nada", async () => {
    const before = (await query("select count(*)::int as n from jarvis.tasks")).at(0)!.n;
    const r = await runTool(
      "create_task",
      { title: "X", date: "2026-02-30", time: "25:00", priority: null, repeat: { type: "none", days: [] }, notes: null },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.action).toBeUndefined();
    expect((await query("select count(*)::int as n from jarvis.tasks")).at(0)!.n).toBe(before);
  });

  it("no puede tocar tareas de otro usuario", async () => {
    const t = await tasks.createTask(OTHER, { title: "Privada" }, TZ);
    const r = await runTool(
      "update_task",
      { task_id: t.id, action: "delete", date: null, time: null, snooze_minutes: null, title: null, priority: null },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(await tasks.getTask(OTHER, t.id)).not.toBeNull();
  });

  it("recordatorio semanal y 'pasa esta tarea para mañana'", async () => {
    const r = await runTool(
      "create_task",
      { title: "Hacer ejercicio", date: null, time: "08:00", priority: null, repeat: { type: "weekly", days: [1, 3, 5] }, notes: null },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(r.action?.detail).toContain("se repite los lunes, miércoles y viernes");
    const created = (r.result as any).tarea;
    expect(created.fecha_exacta).toMatch(/(lunes|miércoles|viernes) \d+ de \w+ de \d{4}, 8:00 a\. m\./);

    const t2 = await tasks.createTask(U, { title: "Comprar pan", due_date: today(), due_time: "18:00" }, TZ);
    const mv = await runTool(
      "update_task",
      { task_id: t2.id, action: "reschedule", date: plusDays(1), time: null, snooze_minutes: null, title: null, priority: null },
      ctx,
    );
    expect(mv.isError).toBe(false);
    expect((await tasks.getTask(U, t2.id))?.due_date).toBe(plusDays(1));
    expect((await tasks.getTask(U, t2.id))?.due_time).toBe("18:00");
  });

  it("ideas de esta semana", async () => {
    const r = await runTool("search_ideas", { query: null, since_days: 7 }, ctx);
    expect((r.result as any).ideas.length).toBeGreaterThan(0);
  });
});
