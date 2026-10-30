import { describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "@/lib/db";

const host = "aws-0-us-east-1.pooler.supabase.com";
describe("DATABASE_URL tolerante", () => {
  it("dirección normal", () => {
    expect(parseDatabaseUrl(`postgresql://postgres.abc:Clave123@${host}:6543/postgres`)).toEqual({
      user: "postgres.abc", password: "Clave123", host, port: 6543, database: "postgres",
    });
  });
  it("contraseña con símbolos sin codificar", () => {
    expect(parseDatabaseUrl(`postgresql://postgres.abc:a@b#c/d?e%@${host}:6543/postgres`)?.password).toBe("a@b#c/d?e%");
  });
  it("contraseña dejada entre corchetes", () => {
    expect(parseDatabaseUrl(`postgresql://postgres.abc:[Mi$Clave]@${host}:6543/postgres`)?.password).toBe("Mi$Clave");
  });
  it("contraseña codificada", () => {
    expect(parseDatabaseUrl(`postgres://postgres.abc:a%40b@${host}:6543/postgres`)?.password).toBe("a@b");
  });
  it("formato inválido", () => {
    expect(parseDatabaseUrl("hola")).toBeNull();
  });
});
