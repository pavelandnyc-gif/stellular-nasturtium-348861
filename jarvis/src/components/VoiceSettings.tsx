"use client";
import { useEffect, useState } from "react";
import { VoicePicker } from "./VoicePicker";
import { loadVoicePrefs, pickVoice, saveVoicePrefs, spanishVoices, speak, speechSupported, voicesReady, type VoicePrefs } from "./voice";

interface Premium {
  enabled: boolean;
  used?: number;
  limit?: number;
  remaining?: number;
}

export function VoiceSettings({ name }: { name: string }) {
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(true);
  const [premium, setPremium] = useState<Premium | null>(null);

  useEffect(() => {
    setSupported(speechSupported());
    setPrefs(loadVoicePrefs());
    voicesReady().then(() => setVoices(spanishVoices()));
    fetch("/api/tts")
      .then((r) => r.json())
      .then(setPremium)
      .catch(() => setPremium({ enabled: false }));
  }, []);

  if (!prefs) return null;
  const update = (p: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveVoicePrefs(next);
  };
  const current = pickVoice(prefs);

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Voz de Jarvis</h2>
      <div className="card space-y-3 p-4">
        {!supported ? (
          <p className="text-sm text-muted">Este navegador no permite que Jarvis hable.</p>
        ) : (
          <>
            <label className="block text-xs text-muted">
              Tipo de voz
              <select className="field mt-1" value={prefs.engine} onChange={(e) => update({ engine: e.target.value as VoicePrefs["engine"] })}>
                <option value="premium">Premium · ElevenLabs (estilo Jarvis)</option>
                <option value="device">Voz del iPhone (gratis)</option>
              </select>
            </label>
            {prefs.engine === "premium" && (
              <p className="text-xs text-muted">
                {premium === null
                  ? "Comprobando la voz premium…"
                  : premium.enabled
                    ? `● Voz premium activa · usados este mes: ${premium.used?.toLocaleString("es")} de ${premium.limit?.toLocaleString("es")} caracteres. Al llegar al tope, Jarvis usa la voz del iPhone hasta el mes siguiente.`
                    : "● La voz premium aún no está configurada en el servidor (falta ELEVENLABS_API_KEY). Mientras tanto se usa la voz del iPhone."}
              </p>
            )}
            {prefs.engine === "premium" && premium?.enabled && <VoicePicker name={name} />}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Saludarme en voz alta al abrir
                <br />
                <span className="text-xs text-muted">Como en la película. En iPhone empieza al primer toque.</span>
              </span>
              <input type="checkbox" className="size-6 accent-cyan-400" checked={prefs.greet} onChange={(e) => update({ greet: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Arranque del sistema al abrir
                <br />
                <span className="text-xs text-muted">Animación y sonido de encendido antes del saludo.</span>
              </span>
              <input type="checkbox" className="size-6 accent-cyan-400" checked={prefs.boot} onChange={(e) => update({ boot: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Escucharme apenas termina de saludar
                <br />
                <span className="text-xs text-muted">Contestas sin tocar nada. Si no dices nada, Jarvis se retira solo.</span>
              </span>
              <input type="checkbox" className="size-6 accent-cyan-400" checked={prefs.autoListen} onChange={(e) => update({ autoListen: e.target.checked })} />
            </label>
            <label className="block text-xs text-muted">
              Leer las respuestas en voz alta
              <select className="field mt-1" value={prefs.replies} onChange={(e) => update({ replies: e.target.value as VoicePrefs["replies"] })}>
                <option value="voice">Solo cuando le hablo con el micrófono</option>
                <option value="always">Siempre</option>
                <option value="never">Nunca</option>
              </select>
            </label>
            {prefs.engine === "device" && (
            <label className="block text-xs text-muted">
              Voz {voices.length === 0 && "(no se encontraron voces en español)"}
              <select className="field mt-1" value={current?.name ?? ""} onChange={(e) => update({ voiceName: e.target.value || null })}>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            )}
            <label className="block text-xs text-muted">
              Velocidad: {prefs.rate.toFixed(1)}×
              <input type="range" min={0.7} max={1.3} step={0.1} value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="mt-2 w-full accent-cyan-400" />
            </label>
            <button className="btn btn-ghost w-full text-sm" onClick={() => speak(`Hola, ${name}. Así sueno ahora. A tus órdenes.`, prefs)}>
              🔊 Probar voz
            </button>
            {prefs.engine === "device" && <p className="text-xs text-muted">
              Para una voz más natural: en el iPhone ve a Ajustes → Accesibilidad → Contenido leído → Voces → Español y descarga una voz
              “Mejorada” (por ejemplo, Jorge o Juan). Luego elígela aquí.
            </p>}
          </>
        )}
      </div>
    </section>
  );
}
