-- Registro de diagnóstico: errores del iPhone (voz, micrófono, avisos) para revisar fallas a distancia.
create table if not exists jarvis.diag_log (
  id          bigserial primary key,
  user_id     uuid,
  stage       text not null,
  message     text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists diag_log_created_idx on jarvis.diag_log (created_at desc);
alter table jarvis.diag_log enable row level security
