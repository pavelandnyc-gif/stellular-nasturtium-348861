-- Contador mensual de caracteres enviados a ElevenLabs (voz premium),
-- para respetar el tope de gasto configurado.
create table if not exists jarvis.tts_usage (
  month  text primary key,              -- '2026-10'
  chars  integer not null default 0
);
alter table jarvis.tts_usage enable row level security;
