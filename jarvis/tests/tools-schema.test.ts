import { describe, expect, it } from "vitest";
process.env.PGLITE_DIR = "memory://";
const { TOOL_DEFS } = await import("@/lib/ai/tools");

function walk(node: any, path: string, out: string[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.type) && node.enum) out.push(`${path}: enum con lista de tipos`);
  if (Array.isArray(node.enum) && node.enum.includes(null)) out.push(`${path}: null dentro de enum`);
  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, out);
}

describe("esquemas de herramientas de la IA", () => {
  it("usan un formato estricto aceptado por la API (sin enum + lista de tipos)", () => {
    const problems: string[] = [];
    for (const t of TOOL_DEFS) walk((t as any).input_schema, (t as any).name, problems);
    expect(problems).toEqual([]);
  });
  it("todas son estrictas y con additionalProperties: false", () => {
    for (const t of TOOL_DEFS as any[]) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });
});
