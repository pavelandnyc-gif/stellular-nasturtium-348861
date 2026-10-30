"use client";

// Voz de Jarvis con la síntesis de voz del propio iPhone (gratis, sin internet).
// Las preferencias se guardan en este dispositivo, porque cada equipo tiene sus voces.

export interface VoicePrefs {
  greet: boolean; // saludar en voz alta al abrir
  replies: "voice" | "always" | "never"; // leer respuestas: solo si hablaste, siempre o nunca
  voiceName: string | null;
  rate: number;
}

const KEY = "jarvis.voice";
const DEFAULTS: VoicePrefs = { greet: true, replies: "voice", voiceName: null, rate: 1 };

export function loadVoicePrefs(): VoicePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveVoicePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* modo privado: no se guarda */
  }
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Voces masculinas en español, como el Jarvis de la película (si el equipo las tiene).
const PREFERRED = ["jorge", "juan", "diego", "carlos", "andrés", "andres", "enrique", "pablo", "jaime", "reed", "eddy", "rocko"];

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"));
}

export function pickVoice(prefs: VoicePrefs): SpeechSynthesisVoice | null {
  const voices = spanishVoices();
  if (!voices.length) return null;
  if (prefs.voiceName) {
    const saved = voices.find((v) => v.name === prefs.voiceName);
    if (saved) return saved;
  }
  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    let s = 0;
    if (PREFERRED.some((p) => name.includes(p))) s += 10;
    if (/enhanced|premium|mejorada/.test(name)) s += 5;
    if (/es-(mx|us)/i.test(v.lang)) s += 2;
    if (/es-es/i.test(v.lang)) s += 1;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/** Espera a que el navegador cargue la lista de voces (en iOS llega con retraso). */
export function voicesReady(): Promise<void> {
  if (!speechSupported() || speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(res, 1500);
    speechSynthesis.addEventListener("voiceschanged", () => (clearTimeout(t), res()), { once: true });
  });
}

function clean(text: string) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SpeakHandle {
  started: Promise<boolean>; // false si el navegador no permitió hablar (iOS sin toque previo)
  done: Promise<void>;
}

export function speak(text: string, prefs = loadVoicePrefs(), onStart?: () => void, onEnd?: () => void): SpeakHandle {
  if (!speechSupported() || !text) return { started: Promise.resolve(false), done: Promise.resolve() };
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean(text));
  const v = pickVoice(prefs);
  if (v) u.voice = v;
  u.lang = v?.lang ?? "es-MX";
  u.rate = prefs.rate;
  u.pitch = 0.9;
  let resolveStart: (b: boolean) => void = () => {};
  let resolveDone: () => void = () => {};
  const started = new Promise<boolean>((r) => (resolveStart = r));
  const done = new Promise<void>((r) => (resolveDone = r));
  u.onstart = () => {
    resolveStart(true);
    onStart?.();
  };
  u.onend = u.onerror = () => {
    resolveStart(false);
    resolveDone();
    onEnd?.();
  };
  speechSynthesis.speak(u);
  // Si en 1,2 s no empezó, iOS lo bloqueó por falta de un toque del usuario.
  setTimeout(() => resolveStart(false), 1200);
  return { started, done };
}

export function stopSpeaking() {
  if (speechSupported()) speechSynthesis.cancel();
}
