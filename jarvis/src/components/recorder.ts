"use client";

// Grabación de voz con detección automática de silencio:
// empieza a escuchar, nota cuándo hablas y corta solo cuando haces una pausa.

export interface Recording {
  blob: Blob | null; // audio grabado (puede no tener voz si reason = "no-speech")
  reason: "silence" | "manual" | "no-speech" | "max";
}

export interface Recorder {
  stop(): void; // termina ya (y envía lo grabado)
  cancel(): void; // descarta
  result: Promise<Recording>;
  level: () => number; // volumen actual 0..1 (para animar el reactor)
  autoStop: boolean; // false si el iPhone no permitió medir el volumen: hay que tocar para enviar
  mime: string;
}

const SILENCE_MS = 1100; // pausa que indica que terminaste (más corta = respuesta más rápida)
const NO_SPEECH_MS = 7000; // si no dices nada en 7 s, se cierra
const MAX_MS = 30_000;

let shared: MediaStream | null = null;
let audioCtx: AudioContext | null = null;

/**
 * Llamar DENTRO del toque del usuario: en iPhone el analizador de audio solo
 * funciona si se activa en ese mismo momento.
 */
export function primeAudioContext() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctx();
    if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/** Contexto de audio compartido (micrófono y voz de Jarvis usan el mismo). */
export function getAudioContext() {
  return audioCtx;
}

/** Abre el micrófono (pide permiso la primera vez). Se reutiliza durante la conversación. */
export async function openMic(): Promise<MediaStream> {
  if (shared && shared.getAudioTracks().some((t) => t.readyState === "live")) return shared;
  shared = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return shared;
}

export function closeMic() {
  shared?.getTracks().forEach((t) => t.stop());
  shared = null;
}

export function recordingSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function pickMime() {
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

export function record(stream: MediaStream): Recorder {
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const ctx = audioCtx ?? primeAudioContext();
  let analyser: AnalyserNode | null = null;
  let src: MediaStreamAudioSourceNode | null = null;
  try {
    if (ctx) {
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
    }
  } catch {
    analyser = null;
  }
  const buf = new Float32Array(1024);
  // Si el medidor de volumen no corre, no se puede detectar el silencio: se envía al tocar.
  const vadOk = () => !!analyser && ctx?.state === "running";

  let current = 0;
  let spoke = false;
  let lastVoice = performance.now();
  const started = performance.now();
  let reason: Recording["reason"] = "manual";
  let cancelled = false;
  let noiseFloor = 0.01;

  const result = new Promise<Recording>((resolve) => {
    rec.onstop = () => {
      clearInterval(timer);
      try {
        src?.disconnect();
      } catch {
        /* */
      }
      const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || mime || "audio/mp4" }) : null;
      if (cancelled) return resolve({ blob: null, reason: "manual" });
      // Sin voz detectada se devuelve igual el audio: quien llama decide si lo envía.
      resolve({ blob, reason: spoke ? reason : "no-speech" });
    };
  });

  const timer = setInterval(() => {
    const now0 = performance.now();
    if (!vadOk() || !analyser) {
      // Sin medidor: se graba hasta que toques el reactor (máximo 30 s).
      if (now0 - started > MAX_MS && rec.state !== "inactive") {
        spoke = true;
        reason = "max";
        rec.stop();
      }
      current = 0.3 + 0.2 * Math.sin(now0 / 150);
      return;
    }
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    current = Math.min(1, rms * 8);
    const now = performance.now();
    // Calibra el ruido de fondo durante el primer medio segundo.
    if (now - started < 500) noiseFloor = Math.max(noiseFloor, rms * 1.5);
    const threshold = Math.max(0.012, noiseFloor * 1.8);
    if (rms > threshold) {
      spoke = true;
      lastVoice = now;
    }
    const finish = (r: Recording["reason"]) => {
      reason = r;
      if (rec.state !== "inactive") rec.stop();
    };
    if (spoke && now - lastVoice > SILENCE_MS) finish("silence");
    else if (!spoke && now - started > NO_SPEECH_MS) finish("no-speech");
    else if (now - started > MAX_MS) finish("max");
  }, 80);

  rec.start(250);
  return {
    stop: () => {
      spoke = spoke || chunks.length > 2;
      reason = "manual";
      if (rec.state !== "inactive") rec.stop();
    },
    cancel: () => {
      cancelled = true;
      if (rec.state !== "inactive") rec.stop();
    },
    result,
    level: () => current,
    get autoStop() {
      return vadOk();
    },
    mime: rec.mimeType || mime,
  };
}
