-- ============================================================================
--  JARVIS · Esquema inicial
--  Todas las tablas viven en el esquema `jarvis`, que la API pública de
--  Supabase (PostgREST) no expone. Además se activa RLS sin políticas: aunque
--  alguien tuviera la clave pública, no podría leer ni escribir nada.
--  Solo el servidor de Jarvis (con DATABASE_URL) accede, y filtra siempre por
--  el usuario autenticado.
-- ============================================================================

create schema if not exists jarvis;

-- Preferencias de cada persona.
create table if not exists jarvis.profiles (
  user_id         uuid primary key,
  email           text,
  display_name    text        not null default 'Javier',
  timezone        text        not null default 'America/New_York',
  summary_enabled boolean     not null default false,
  summary_time    text        not null default '08:00' check (summary_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Ideas: notas rápidas, sin fecha.
create table if not exists jarvis.ideas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null,
  content     text        not null check (length(content) between 1 and 4000),
  task_id     uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ideas_user_created_idx on jarvis.ideas (user_id, created_at desc);

-- Tareas y recordatorios. Un recordatorio es una tarea con hora.
-- Fecha y hora se guardan "de reloj local" (como las dices) junto con la zona
-- horaria del perfil; el instante exacto se calcula al programar el aviso, así
-- los cambios de horario de verano se respetan siempre.
create table if not exists jarvis.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null,
  title          text        not null check (length(title) between 1 and 500),
  notes          text,
  due_date       date,
  due_time       text check (due_time is null or due_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  priority       smallint check (priority between 1 and 3),   -- 1 alta · 2 media · 3 baja
  status         text        not null default 'pending' check (status in ('pending', 'done')),
  -- null = una sola vez · {"type":"daily"} · {"type":"weekly","days":[1,3,5]} (1 = lunes … 7 = domingo)
  recurrence     jsonb,
  remind         boolean     not null default true,
  snoozed_until  timestamptz,
  idea_id        uuid,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tasks_user_status_due_idx on jarvis.tasks (user_id, status, due_date);

-- Historial: una fila por cada vez que completas una tarea (o una repetición).
create table if not exists jarvis.task_completions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null,
  task_id          uuid        not null references jarvis.tasks(id) on delete cascade,
  title            text        not null,
  occurrence_date  date,
  completed_at     timestamptz not null default now()
);
create index if not exists task_completions_user_idx on jarvis.task_completions (user_id, completed_at desc);

-- Hábitos.
create table if not exists jarvis.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null,
  name            text        not null check (length(name) between 1 and 200),
  emoji           text,
  days            jsonb       not null default '[]'::jsonb,   -- [] = todos los días
  habit_time      text check (habit_time is null or habit_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  target_minutes  integer check (target_minutes is null or target_minutes between 1 and 1440),
  remind          boolean     not null default true,
  active          boolean     not null default true,
  suggestion_key  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists habits_user_idx on jarvis.habits (user_id, active);

create table if not exists jarvis.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null,
  habit_id    uuid        not null references jarvis.habits(id) on delete cascade,
  log_date    date        not null,
  created_at  timestamptz not null default now(),
  unique (habit_id, log_date)
);

-- Dispositivos suscritos a Web Push.
create table if not exists jarvis.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null,
  endpoint         text        not null unique,
  p256dh           text        not null,
  auth             text        not null,
  user_agent       text,
  failures         integer     not null default 0,
  last_success_at  timestamptz,
  last_error       text,
  created_at       timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on jarvis.push_subscriptions (user_id);

-- Cola persistente de avisos. El programador (cada minuto) toma las filas
-- `pending` vencidas, las marca `sending` y las envía.
--  · dedupe_key único: el mismo aviso de la misma repetición jamás se crea dos veces.
--  · sent_at     = aceptado por el servicio push (Apple/Google/Mozilla).
--  · received_at = el iPhone confirmó que lo recibió (lo informa el service worker).
create table if not exists jarvis.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null,
  kind             text        not null check (kind in ('task', 'habit', 'summary', 'test')),
  ref_id           uuid,
  occurrence       text,
  dedupe_key       text        not null unique,
  fire_at          timestamptz not null,
  title            text        not null,
  body             text        not null default '',
  url              text        not null default '/',
  status           text        not null default 'pending'
                   check (status in ('pending', 'sending', 'sent', 'failed', 'canceled', 'skipped', 'expired')),
  attempts         integer     not null default 0,
  next_attempt_at  timestamptz,
  locked_at        timestamptz,
  last_error       text,
  receipt_token    text        not null default replace(gen_random_uuid()::text, '-', ''),
  sent_at          timestamptz,
  received_at      timestamptz,
  clicked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists notifications_due_idx on jarvis.notifications (status, fire_at);
create index if not exists notifications_user_idx on jarvis.notifications (user_id, fire_at desc);
create index if not exists notifications_ref_idx on jarvis.notifications (ref_id, status);

-- Conversación con Jarvis.
create table if not exists jarvis.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  actions     jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_user_idx on jarvis.chat_messages (user_id, created_at desc);

-- Defensa extra: RLS activo y sin políticas = acceso denegado por la API pública.
alter table jarvis.profiles           enable row level security;
alter table jarvis.ideas              enable row level security;
alter table jarvis.tasks              enable row level security;
alter table jarvis.task_completions   enable row level security;
alter table jarvis.habits             enable row level security;
alter table jarvis.habit_logs         enable row level security;
alter table jarvis.push_subscriptions enable row level security;
alter table jarvis.notifications      enable row level security;
alter table jarvis.chat_messages      enable row level security;
