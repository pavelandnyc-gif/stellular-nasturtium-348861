"use client";
import { useEffect, useState } from "react";
import { call } from "./fetcher";
import { toast } from "./Toast";
import { clearAudioCache, previewVoice, unlockAudio } from "./voice";

interface V {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
}

/** Probador de voces de ElevenLabs: escucha la misma frase con cada voz y elige una. */
export function VoicePicker({ name }: { name: string }) {
  const [voices, setVoices] = useState<V[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = `Buenos días, ${name}. Todos los sistemas en orden. ¿Qué necesitas?`;

  useEffect(() => {
    fetch("/api/tts/voices")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error);
        setVoices(d.voices);
        setCurrent(d.current);
      })
      .catch((e) => setError(e.message || "No pude cargar las voces."));
  }, []);

  async function play(v: V) {
    unlockAudio();
    setPlaying(v.id);
    const ok = await previewVoice(sample, v.id, () => setPlaying(null));
    if (!ok) {
      setPlaying(null);
      toast("No se pudo reproducir esa voz (¿tope mensual alcanzado?).", "error");
    }
  }

  async function choose(v: V) {
    await call("/api/settings", "PATCH", { voice_id: v.id });
    clearAudioCache();
    setCurrent(v.id);
    toast(`Listo: Jarvis ahora habla con la voz de ${v.name}.`);
  }

  if (error) return <p className="text-xs text-bad">{error}</p>;
  if (!voices) return <p className="text-xs text-muted">Cargando voces…</p>;
  const list = showAll ? voices : voices.filter((v) => v.recommended || v.id === current).slice(0, 12);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Toca ▶ para escuchar la misma frase con cada voz (cada prueba usa unos 70 caracteres de tu plan) y “Usar” para elegirla.
      </p>
      <ul className="divide-y divide-line/60 rounded-2xl border border-line">
        {list.map((v) => (
          <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
            <button
              onClick={() => play(v)}
              disabled={!!playing}
              aria-label={`Escuchar ${v.name}`}
              className={`grid size-10 shrink-0 place-items-center rounded-full ${playing === v.id ? "bg-cyan text-ink" : "bg-white/5 text-cyan-soft"}`}
            >
              {playing === v.id ? "■" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {v.name} {v.id === current && <span className="text-xs text-ok">· en uso</span>}
              </div>
              <div className="truncate text-xs text-muted">{v.description}</div>
            </div>
            {v.id !== current && (
              <button className="chip" onClick={() => choose(v)}>
                Usar
              </button>
            )}
          </li>
        ))}
      </ul>
      {!showAll && voices.length > list.length && (
        <button className="text-xs text-cyan" onClick={() => setShowAll(true)}>
          Ver todas mis voces ({voices.length})
        </button>
      )}
      <p className="text-xs text-muted">
        ¿Quieres más opciones en español? En elevenlabs.io → Voices → Voice Library, filtra por Spanish y Male, y toca “Add to my voices”.
        Aparecerán aquí.
      </p>
    </div>
  );
}
