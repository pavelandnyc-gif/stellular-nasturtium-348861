import { z } from "zod";
import { isValidDate, isValidZone, TIME_RE } from "./time";

export const zDate = z.string().refine(isValidDate, "fecha inválida (AAAA-MM-DD)");
export const zTime = z.string().regex(TIME_RE, "hora inválida (HH:MM)");
export const zDays = z.array(z.number().int().min(1).max(7)).max(7);
export const zRecurrence = z
  .union([z.object({ type: z.literal("daily") }), z.object({ type: z.literal("weekly"), days: zDays.min(1) })])
  .nullable();
export const zPriority = z.number().int().min(1).max(3).nullable();
export const zZone = z.string().refine(isValidZone, "zona horaria inválida");
export const zUuid = z.string().uuid();
