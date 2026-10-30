-- Audios de voz ya generados: si Jarvis repite una frase, no se vuelve a pagar en ElevenLabs.
create table if not exists jarvis.tts_cache (
  key         text primary key,
  audio       bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists tts_cache_created_idx on jarvis.tts_cache (created_at);
alter table jarvis.tts_cache enable row level security
