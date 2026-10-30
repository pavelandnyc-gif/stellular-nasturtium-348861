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
  it("sin uniones de tipos (anyOf / listas de tipos) y sin marcas internas", () => {
    const json = JSON.stringify(TOOL_DEFS);
    expect(json).not.toContain("anyOf");
    expect(json).not.toContain("__optional");
    expect(json).not.toMatch(/"type":\[/);
    for (const t of TOOL_DEFS as any[]) expect(t.input_schema.additionalProperties).toBe(false);
  });
  it("los campos opcionales no están en required", () => {
    const create = (TOOL_DEFS as any[]).find((t) => t.name === "create_task");
    expect(create.input_schema.required).toEqual(["title", "repeat"]);
  });
});
