import { describe, expect, it } from "vitest";
import { forSpeech } from "@/lib/speech";

describe("texto para voz natural", () => {
  it("convierte horas escritas en horas habladas", () => {
    expect(forSpeech("Hecho, Jefe. Mañana a las 10:00 a. m.")).toBe("Hecho, Jefe. Mañana a las 10 de la mañana.");
    expect(forSpeech("viernes 31 de octubre, 6:30 p. m.")).toBe("viernes 31 de octubre, las 6 y media de la tarde.");
    expect(forSpeech("a las 1:15 p.m.")).toBe("a la 1 y cuarto de la tarde.");
    expect(forSpeech("9:00 p. m.")).toBe("las 9 de la noche.");
  });
  it("cambia signos de escritura por pausas", () => {
    expect(forSpeech("Afuera, 57 grados y nublado; máxima de 63.")).toBe("Afuera, 57 grados y nublado, máxima de 63.");
    expect(forSpeech("Lluvia desde las 5: te sugiero paraguas.")).toBe("Lluvia desde las 5, te sugiero paraguas.");
    expect(forSpeech("Comprar pan · mañana (sin falta)")).toBe("Comprar pan, mañana, sin falta");
    expect(forSpeech("**Listo** 👍")).toBe("Listo");
  });
  it("no toca un texto ya natural", () => {
    const t = "Buenos días, Jefe. ¿Te doy el informe del día?";
    expect(forSpeech(t)).toBe(t);
  });
});
