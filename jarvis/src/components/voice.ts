"use client";
import { diag } from "./diag";
import { forSpeech } from "@/lib/speech";
import { getAudioContext } from "./recorder";

// Voz de Jarvis con la síntesis de voz del propio iPhone (gratis, sin internet).
// Las preferencias se guardan en este dispositivo, porque cada equipo tiene sus voces.

export interface VoicePrefs {
  engine: "premium" | "device"; // premium = ElevenLabs (si está configurada); device = voz del iPhone
  style: "natural" | "expressive"; // expresiva = modelo eleven_v3 (más emoción; experimental)
  greet: boolean; // saludar en voz alta al abrir
  boot: boolean; // animación y sonido de arranque
  autoListen: boolean; // escuchar apenas termina el saludo
  replies: "voice" | "always" | "never"; // leer respuestas: solo si hablaste, siempre o nunca
  voiceName: string | null;
  rate: number;
}

const KEY = "jarvis.voice";
const DEFAULTS: VoicePrefs = { engine: "premium", style: "natural", greet: true, boot: true, autoListen: true, replies: "voice", voiceName: null, rate: 1 };

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
  return forSpeech(text)
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
  stopWebAudio();
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
  return !!audioEl?.dataset.unlocked || getAudioContext()?.state === "running";
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
        body: JSON.stringify({ text, voiceId, model: loadVoicePrefs().style === "expressive" ? "eleven_v3" : undefined }),
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
      body: JSON.stringify({ text: text.slice(0, 800), model: loadVoicePrefs().style === "expressive" ? "eleven_v3" : undefined }),
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

// ── Reproducción por frases con Web Audio ───────────────────────────────────
// Más rápido: empieza a hablar con la primera frase mientras se generan las demás.
// Sin tropiezos: usa el mismo canal de audio que el micrófono (el iPhone ya no
// "cambia de modo" a mitad del audio) y encadena las frases sin huecos.

const buffers = new Map<string, Promise<AudioBuffer | null>>();
let sources: AudioBufferSourceNode[] = [];
let webDone: (() => void) | null = null;

/** Divide en frases: la primera sola (para empezar rápido) y el resto en trozos de hasta ~150 caracteres. */
export function splitSpeech(text: string): string[] {
  const sentences = (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [text]).map((x) => x.trim()).filter(Boolean);
  if (!sentences.length) return [text];
  let first = sentences.shift()!;
  // Un primer trozo muy corto ("Hecho.") se une a la siguiente frase para que suene natural.
  while (first.length < 25 && sentences.length) first = `${first} ${sentences.shift()}`;
  const out = [first];
  for (const s of sentences) {
    const last = out.length > 1 ? out[out.length - 1] : null;
    if (last && (last + " " + s).length <= 150) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}

function styleModel() {
  return loadVoicePrefs().style === "expressive" ? "eleven_v3" : undefined;
}

async function fetchBytes(text: string, voiceId?: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 800), voiceId, model: styleModel() }),
    });
    if (!res.ok) {
      if (res.status === 429 || res.status === 503) premium = Promise.resolve(false); // tope alcanzado: voz del iPhone
      return null;
    }
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function decoded(text: string): Promise<AudioBuffer | null> {
  const key = `${styleModel() ?? ""}::${text}`;
  let p = buffers.get(key);
  if (!p) {
    p = (async () => {
      const ctx = getAudioContext();
      const bytes = await fetchBytes(text);
      if (!bytes || !ctx) return null;
      try {
        return await ctx.decodeAudioData(bytes.slice(0));
      } catch {
        return null;
      }
    })();
    buffers.set(key, p);
    p.then((b) => b || buffers.delete(key));
  }
  return p;
}

function stopWebAudio() {
  for (const s of sources) {
    try {
      s.onended = null;
      s.stop();
    } catch {
      /* ya terminó */
    }
  }
  sources = [];
  const d = webDone;
  webDone = null;
  d?.();
}

function webAudioReady() {
  const ctx = getAudioContext();
  return !!ctx && ctx.state === "running";
}

function speakWebAudio(text: string, prefs: VoicePrefs, onStart?: () => void, onEnd?: () => void): SpeakHandle {
  const ctx = getAudioContext()!;
  stopWebAudio();
  if (speechSupported()) speechSynthesis.cancel();
  if (audioEl) audioEl.pause();
  const parts = splitSpeech(text);
  const pending = parts.map((p) => decoded(p)); // se piden todas a la vez; suena la primera en cuanto llega
  let resolveStart: (b: boolean) => void = () => {};
  let resolveDone: () => void = () => {};
  const started = new Promise<boolean>((r) => (resolveStart = r));
  const done = new Promise<void>((r) => (resolveDone = r));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    resolveStart(false);
    resolveDone();
    onEnd?.();
  };
  webDone = finish;
  (async () => {
    let at = 0;
    let first = true;
    for (const p of pending) {
      const buf = await p;
      if (finished) return;
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = prefs.rate;
      src.connect(ctx.destination);
      const when = Math.max(ctx.currentTime + 0.02, at);
      src.start(when);
      at = when + buf.duration / prefs.rate;
      sources.push(src);
      if (first) {
        first = false;
        resolveStart(true);
        onStart?.();
      }
    }
    if (first) {
      // No llegó ningún audio: que lo diga la voz del iPhone.
      webDone = null;
      const h = speakDevice(text, prefs, onStart, onEnd);
      resolveStart(await h.started);
      await h.done;
      finished = true;
      return resolveDone();
    }
    const last = sources.at(-1);
    if (last) last.onended = () => webDone === finish && (webDone = null, finish());
  })();
  return { started, done };
}

/** Pre-genera el audio (por ejemplo, el saludo) para que suene al instante al tocar. */
export async function prepare(text: string, prefs = loadVoicePrefs()) {
  if (prefs.engine !== "premium" || !(await premiumAvailable())) return;
  if (getAudioContext()) await Promise.all(splitSpeech(text).map((p) => decoded(p)));
  else await fetchAudio(text);
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
  if (prefs.engine !== "premium") return speakDevice(text, prefs, onStart, onEnd);
  // Camino principal: por frases y con Web Audio (más rápido y sin tropiezos).
  if (webAudioReady()) {
    let inner: SpeakHandle | null = null;
    const started = (async () => {
      inner = (await premiumAvailable()) ? speakWebAudio(text, prefs, onStart, onEnd) : speakDevice(text, prefs, onStart, onEnd);
      return inner.started;
    })();
    return { started, done: started.then(() => inner?.done).then(() => undefined) };
  }
  // Respaldo: reproductor normal con el audio completo.
  const cached = cache.get(text);
  if (cached) return playUrl(cached, prefs, onStart, onEnd);

  let inner: SpeakHandle | null = null;
  const started = (async () => {
    const url = (await premiumAvailable()) ? await fetchAudio(text) : null;
    inner = url ? playUrl(url, prefs, onStart, onEnd) : speakDevice(text, prefs, onStart, onEnd);
    return inner.started;
  })();
  const done = started.then(() => inner?.done);
  return { started, done: done.then(() => undefined) };
}
