-- Voz de ElevenLabs elegida por la persona desde Ajustes (null = la del servidor).
alter table jarvis.profiles add column if not exists voice_id text
  check (voice_id is null or voice_id ~ '^[A-Za-z0-9]{10,40}$')
