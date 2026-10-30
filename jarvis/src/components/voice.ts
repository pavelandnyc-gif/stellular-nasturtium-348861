"use client";
import { diag } from "./diag";

// Voz de Jarvis con la síntesis de voz del propio iPhone (gratis, sin internet).
// Las preferencias se guardan en este dispositivo, porque cada equipo tiene sus voces.

export interface VoicePrefs {
  engine: "premium" | "device"; // premium = ElevenLabs (si está configurada); device = voz del iPhone
  greet: boolean; // saludar en voz alta al abrir
  boot: boolean; // animación y sonido de arranque
  autoListen: boolean; // escuchar apenas termina el saludo
  replies: "voice" | "always" | "never"; // leer respuestas: solo si hablaste, siempre o nunca
  voiceName: string | null;
  rate: number;
}

const KEY = "jarvis.voice";
const DEFAULTS: VoicePrefs = { engine: "premium", greet: true, boot: true, autoListen: true, replies: "voice", voiceName: null, rate: 1 };

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

function speakDevice(text: string, prefs: VoicePrefs, onStart?: () => void, onEnd?: () => void): SpeakHandle {
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
  finishCurrent?.(); // primero marca como terminado: así la pausa no se toma como "inesperada"
  if (audioEl) audioEl.pause(); // avisa que terminó (si alguien esperaba el final del audio)
}

let finishCurrent: (() => void) | null = null;

// ── Voz premium (ElevenLabs, generada en el servidor) ───────────────────────
// iOS solo deja reproducir audio después de un toque. El truco: el primer toque
// en la app "desbloquea" un único reproductor, que luego se reutiliza siempre.

let audioEl: HTMLAudioElement | null = null;
let premium: Promise<boolean> | null = null;
const cache = new Map<string, string>(); // texto → audio ya generado (no se paga dos veces)
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function player() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.setAttribute("playsinline", "");
    audioEl.preload = "auto";
  }
  return audioEl;
}

/** Llamar dentro de un toque del usuario: deja el reproductor listo para sonar después. */
export function unlockAudio() {
  const a = player();
  // Nunca interrumpir algo que ya está sonando (antes esto cortaba el saludo).
  if (a.dataset.unlocked || !a.paused) return;
  a.src = SILENCE;
  a.play()
    .then(() => (a.dataset.unlocked = "1"))
    .catch(() => {});
  if (speechSupported() && !speechSynthesis.speaking) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

/** ¿Ya se puede reproducir audio sin un toque nuevo? (iPhone) */
export function audioUnlocked() {
  return !!audioEl?.dataset.unlocked;
}

/** Instala el desbloqueo en el primer toque de cualquier pantalla. */
export function installAudioUnlock() {
  const on = () => {
    unlockAudio();
    document.removeEventListener("touchend", on);
    document.removeEventListener("click", on);
  };
  document.addEventListener("touchend", on);
  document.addEventListener("click", on);
}

export function premiumAvailable(): Promise<boolean> {
  if (!premium) {
    premium = fetch("/api/tts")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !!d.enabled && (d.remaining ?? 1) > 0)
      .catch(() => false);
  }
  return premium;
}

/** Olvida los audios ya generados (al cambiar de voz). */
export function clearAudioCache() {
  cache.forEach((url) => URL.revokeObjectURL(url));
  cache.clear();
}

/** Genera y reproduce una frase con una voz concreta (para el probador de voces). */
export async function previewVoice(text: string, voiceId: string, onEnd?: () => void): Promise<boolean> {
  const key = `${voiceId}::${text}`;
  let url = cache.get(key) ?? null;
  if (!url) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) return false;
      url = URL.createObjectURL(await res.blob());
      cache.set(key, url);
    } catch {
      return false;
    }
  }
  return playUrl(url, loadVoicePrefs(), undefined, onEnd).started;
}

async function fetchAudio(text: string): Promise<string | null> {
  const hit = cache.get(text);
  if (hit) return hit;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean(text).slice(0, 800) }),
    });
    if (!res.ok) {
      if (res.status === 429 || res.status === 503) premium = Promise.resolve(false); // tope alcanzado: voz del iPhone
      return null;
    }
    const url = URL.createObjectURL(await res.blob());
    cache.set(text, url);
    return url;
  } catch {
    return null;
  }
}

/** Pre-genera el audio (por ejemplo, el saludo) para que suene al instante al tocar. */
export async function prepare(text: string, prefs = loadVoicePrefs()) {
  if (prefs.engine === "premium" && (await premiumAvailable())) await fetchAudio(text);
}

function playUrl(url: string, prefs: VoicePrefs, onStart?: () => void, onEnd?: () => void): SpeakHandle {
  const a = player();
  if (speechSupported()) speechSynthesis.cancel();
  a.pause();
  a.src = url;
  a.playbackRate = prefs.rate;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (finishCurrent === finish) finishCurrent = null;
    resolveDone();
    onEnd?.();
  };
  finishCurrent?.();
  finishCurrent = finish;
  const t0 = Date.now();
  a.onended = finish;
  a.onerror = () => {
    diag("audio", "error al reproducir", { code: a.error?.code, at: a.currentTime });
    finish();
  };
  // Si el iPhone pausa el audio por su cuenta (no lo pedimos nosotros), lo anotamos y seguimos.
  a.onpause = () => {
    if (!finished && !a.ended && a.currentTime > 0 && a.currentTime < (a.duration || Infinity) - 0.2) {
      diag("audio", "pausa inesperada", { at: a.currentTime, dur: a.duration, ms: Date.now() - t0 });
      a.play().catch(() => finish());
    }
  };
  a.onstalled = () => diag("audio", "audio atascado (stalled)", { at: a.currentTime, dur: a.duration });
  const started = a
    .play()
    .then(() => {
      a.dataset.unlocked = "1";
      onStart?.();
      return true;
    })
    .catch(() => {
      finish();
      return false;
    });
  return { started, done };
}

/**
 * Habla con la voz elegida. Si el audio premium ya está listo, empieza al instante
 * (importante en iOS: así funciona dentro del mismo toque). Si la voz premium no
 * está disponible o falla, usa la voz del iPhone.
 */
export function speak(text: string, prefs = loadVoicePrefs(), onStart?: () => void, onEnd?: () => void): SpeakHandle {
  if (!text) return { started: Promise.resolve(false), done: Promise.resolve() };
  const cached = cache.get(text);
  if (prefs.engine === "premium" && cached) return playUrl(cached, prefs, onStart, onEnd);
  if (prefs.engine !== "premium") return speakDevice(text, prefs, onStart, onEnd);

  let inner: SpeakHandle | null = null;
  const started = (async () => {
    const url = (await premiumAvailable()) ? await fetchAudio(text) : null;
    inner = url ? playUrl(url, prefs, onStart, onEnd) : speakDevice(text, prefs, onStart, onEnd);
    return inner.started;
  })();
  const done = started.then(() => inner?.done);
  return { started, done: done.then(() => undefined) };
}
