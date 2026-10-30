import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/diag", () => ({ diag: () => {} }));
const { splitSpeech } = await import("@/components/voice");

describe("voz por frases", () => {
  it("la primera frase sale sola para empezar rápido", () => {
    expect(
      splitSpeech("Buenos días, Jefe. Sistemas en línea, agenda cargada y listo para despegar. ¿Te doy el informe del día?"),
    ).toEqual(["Buenos días, Jefe. Sistemas en línea, agenda cargada y listo para despegar.", "¿Te doy el informe del día?"]);
  });
  it("une un comienzo muy corto con la siguiente frase", () => {
    expect(splitSpeech("Hecho. Mañana a las 10 de la mañana.")).toEqual(["Hecho. Mañana a las 10 de la mañana."]);
  });
  it("agrupa el resto en trozos razonables y no pierde texto", () => {
    const t =
      "Son las 8 y 5 de la mañana. Afuera, 57 grados y nublado, máxima de 63. Tengo 3 pendientes en el radar. El primero, llamar a mamá, a las 10 de la mañana. Y no lo olvido, leer te espera. Eso es todo. ¿Algo más?";
    const parts = splitSpeech(t);
    expect(parts.join(" ")).toBe(t);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 160)).toBe(true);
  });
  it("texto sin punto final", () => {
    expect(splitSpeech("Listo")).toEqual(["Listo"]);
  });
});
