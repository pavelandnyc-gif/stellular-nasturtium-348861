"use client";
import { primeAudioContext } from "./recorder";

/**
 * Sonido de encendido original, generado en el momento (sin archivos):
 * un barrido grave que sube, un zumbido suave y un "ping" final.
 */
export function playBootSound() {
  const ctx = primeAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  // Barrido ascendente
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(70, t);
  sweep.frequency.exponentialRampToValueAtTime(520, t + 0.9);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.9);
  sweepGain.gain.setValueAtTime(0.0001, t);
  sweepGain.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  sweep.connect(lp).connect(sweepGain).connect(master);
  sweep.start(t);
  sweep.stop(t + 1.15);

  // Zumbido de "reactor"
  const hum = ctx.createOscillator();
  const humGain = ctx.createGain();
  hum.type = "sine";
  hum.frequency.setValueAtTime(110, t + 0.3);
  humGain.gain.setValueAtTime(0.0001, t + 0.3);
  humGain.gain.exponentialRampToValueAtTime(0.35, t + 0.8);
  humGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  hum.connect(humGain).connect(master);
  hum.start(t + 0.3);
  hum.stop(t + 2);

  // "Ping" de sistema listo (dos notas)
  [
    [1318.5, 1.0],
    [1975.5, 1.12],
  ].forEach(([freq, at]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.4, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.7);
    o.connect(g).connect(master);
    o.start(t + at);
    o.stop(t + at + 0.75);
  });
}
