// Prepara un texto para decirlo en voz alta con naturalidad.
// Los signos "de escritura" (punto y coma, dos puntos, paréntesis, viñetas,
// abreviaturas) hacen que la voz suene robótica: aquí se cambian por pausas
// y palabras como las diría una persona.

function spokenHour(h: number, m: number, pm: boolean | null) {
  const h24 = pm === null ? h : pm ? (h % 12) + 12 : h % 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const part = h24 < 12 ? "de la mañana" : h24 < 19 ? "de la tarde" : "de la noche";
  if (h24 === 12 && m === 0) return "las 12 del mediodía";
  const art = h12 === 1 ? "la 1" : `las ${h12}`;
  const mins = m === 0 ? "" : m === 15 ? " y cuarto" : m === 30 ? " y media" : ` y ${m}`;
  return `${art}${mins} ${part}`;
}

export function forSpeech(input: string): string {
  let t = input;
  // Markdown y símbolos que no se pronuncian
  t = t.replace(/[*_#`>|]/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  // Horas: "a las 10:00 a. m." / "6:30 p.m." → "a las 10 de la mañana" / "las 6 y media de la tarde"
  const hour = (m: string, pre: string | undefined, h: string, mm: string | undefined, ap: string, off: number, all: string) => {
    let out = (pre ?? "") + spokenHour(Number(h), Number(mm ?? 0), ap.toLowerCase() === "p");
    // El punto de "m." puede ser también el final de la frase: se conserva.
    const next = all.slice(off + m.length);
    if (m.endsWith(".") && (next === "" || /^\s+[A-ZÁÉÍÓÚÑ¿¡]/.test(next))) out += ".";
    return out;
  };
  t = t.replace(/\b(a\s+)?las?\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?/gi, (m, pre, h, mm, ap, off, all) =>
    hour(m, pre, h, mm, ap, off, all),
  );
  t = t.replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?/gi, (m, h, mm, ap, off, all) => hour(m, undefined, h, mm, ap, off, all));
  // Paréntesis y corchetes → pausa breve
  t = t.replace(/\s*[([{]\s*/g, ", ").replace(/\s*[)\]}]\s*/g, ", ");
  // Punto y coma, dos puntos (que no sean de hora), viñetas y guiones → coma
  t = t.replace(/;/g, ",").replace(/:(?!\d)/g, ",");
  t = t.replace(/\s*[·•]\s*/g, ", ").replace(/\s+[–—-]\s+/g, ", ");
  // Barras: "y/o" → "o"
  t = t.replace(/\by\/o\b/gi, "o").replace(/\s*\/\s*/g, " o ");
  // Limpieza: comas repetidas, espacios, coma antes de punto
  t = t.replace(/,\s*,+/g, ",").replace(/\s+([,.!?])/g, "$1").replace(/,([.!?])/g, "$1");
  t = t.replace(/^[,\s]+/, "").replace(/[,\s]+$/, "").replace(/\s{2,}/g, " ");
  return t.trim();
}
