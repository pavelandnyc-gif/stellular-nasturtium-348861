-- ============================================================================
--  PAVÉLAND · "You Pick The Next One"  ·  Esquema de base de datos
--  Copia y pega TODO este archivo en:  Supabase → SQL Editor → New query → Run
--  Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------------

-- Una campaña = una votación de "Postre del Mes".
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default 'Postre del Mes',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

-- Solo puede haber UNA campaña activa a la vez.
create unique index if not exists campaigns_one_active_idx
  on public.campaigns (is_active)
  where is_active;

-- Los 3 postres de una campaña.
create table if not exists public.desserts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid     not null references public.campaigns(id) on delete cascade,
  "position"   smallint not null check ("position" between 1 and 3),
  name         text     not null,
  image_url    text,
  votes        integer  not null default 0 check (votes >= 0),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, "position")
);

create index if not exists desserts_campaign_idx on public.desserts (campaign_id);

-- Bitácora: una fila por cada toque válido. Sirve de auditoría y anti-fraude.
-- NO guarda ningún dato personal del cliente.
create table if not exists public.vote_events (
  id           bigserial primary key,
  vote_id      uuid,           -- clave de idempotencia: la genera el iPad al tocar
  dessert_id   uuid not null references public.desserts(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  device_token text,           -- id anónimo y aleatorio del navegador (no es una persona)
  created_at   timestamptz not null default now()
);

alter table public.vote_events add column if not exists vote_id uuid;

-- Esta unicidad es la que hace que un reintento NUNCA cuente dos veces.
-- El índice va SIN cláusula WHERE a propósito: `on conflict (vote_id)` no puede
-- apuntar a un índice parcial. En Postgres varios NULL no chocan entre sí, así
-- que las filas viejas sin vote_id conviven sin problema.
create unique index if not exists vote_events_vote_id_idx
  on public.vote_events (vote_id);

create index if not exists vote_events_campaign_idx on public.vote_events (campaign_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. VOTO ATÓMICO E IDEMPOTENTE
--
--    Dos garantías distintas, las dos necesarias:
--
--    a) NO SE PIERDEN VOTOS. `update ... set votes = votes + 1` toma un lock
--       de fila en Postgres, así que dos iPads votando en el mismo milisegundo
--       se serializan y se cuentan los dos. Si en cambio se leyera el número,
--       se sumara en JavaScript y se reescribiera, uno se perdería.
--
--    b) NO SE DUPLICAN VOTOS. El iPad genera un `vote_id` único al tocar. Si
--       la red tarda y el iPad reintenta, llega el MISMO vote_id: el índice
--       único lo rechaza y el contador no se vuelve a sumar. Un toque = un
--       voto, aunque el reintento se envíe cinco veces.
-- ---------------------------------------------------------------------------

-- La versión vieja (sin vote_id) tenía otra firma, así que hay que quitarla:
-- si no, PostgREST se quedaría con las dos.
drop function if exists public.cast_vote(uuid, text);

create or replace function public.cast_vote(
  p_dessert_id   uuid,
  p_vote_id      uuid default null,
  p_device_token text default null
)
returns table (dessert_id uuid, votes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_votes    integer;
  v_vote_id  uuid    := coalesce(p_vote_id, gen_random_uuid());
  v_insertadas integer;
begin
  select d.campaign_id into v_campaign
    from public.desserts d
    join public.campaigns c on c.id = d.campaign_id and c.is_active
   where d.id = p_dessert_id;

  if v_campaign is null then
    raise exception 'Postre no encontrado o campaña cerrada (%)', p_dessert_id
      using errcode = 'P0002';
  end if;

  -- La bitácora es la puerta: si este vote_id ya pasó, no se inserta nada.
  insert into public.vote_events (vote_id, dessert_id, campaign_id, device_token)
  values (v_vote_id, p_dessert_id, v_campaign, left(coalesce(p_device_token, ''), 64))
  on conflict (vote_id) do nothing;

  get diagnostics v_insertadas = row_count;

  if v_insertadas = 1 then
    update public.desserts
       set votes = votes + 1, updated_at = now()
     where id = p_dessert_id
    returning votes into v_votes;
  else
    -- Reintento de un voto que ya estaba contado: devolvemos el total actual
    -- sin volver a sumar.
    select votes into v_votes from public.desserts where id = p_dessert_id;
  end if;

  return query select p_dessert_id, v_votes;
end;
$$;

-- El público (anon) SOLO puede llamar a esta función. No puede tocar las tablas.
revoke all on function public.cast_vote(uuid, uuid, text) from public;
grant execute on function public.cast_vote(uuid, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. FUNCIONES DE ADMINISTRADOR (requieren sesión iniciada)
-- ---------------------------------------------------------------------------

-- Pone en cero los votos de la campaña activa y borra su bitácora.
create or replace function public.reset_votes(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  delete from public.vote_events where campaign_id = p_campaign_id;
  update public.desserts set votes = 0, updated_at = now() where campaign_id = p_campaign_id;
end;
$$;

revoke all on function public.reset_votes(uuid) from public;
grant execute on function public.reset_votes(uuid) to authenticated;

-- Cierra la campaña actual (queda archivada con sus votos) y abre una nueva
-- con 3 postres. Devuelve el id de la campaña nueva.
create or replace function public.start_new_campaign(
  p_title text default 'Postre del Mes',
  p_name1 text default 'Postre #1',
  p_name2 text default 'Postre #2',
  p_name3 text default 'Postre #3'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.campaigns
     set is_active = false, closed_at = now()
   where is_active;

  insert into public.campaigns (title, is_active)
  values (coalesce(nullif(trim(p_title), ''), 'Postre del Mes'), true)
  returning id into v_new;

  insert into public.desserts (campaign_id, "position", name) values
    (v_new, 1, coalesce(nullif(trim(p_name1), ''), 'Postre #1')),
    (v_new, 2, coalesce(nullif(trim(p_name2), ''), 'Postre #2')),
    (v_new, 3, coalesce(nullif(trim(p_name3), ''), 'Postre #3'));

  return v_new;
end;
$$;

revoke all on function public.start_new_campaign(text, text, text, text) from public;
grant execute on function public.start_new_campaign(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. SEGURIDAD A NIVEL DE FILA (RLS)
--    La "anon key" que va en el HTML es pública por diseño. RLS es lo que
--    impide que alguien la use para inflar votos o cambiar los nombres.
-- ---------------------------------------------------------------------------

alter table public.campaigns   enable row level security;
alter table public.desserts    enable row level security;
alter table public.vote_events enable row level security;

-- Cualquiera puede LEER la campaña y los postres (la pantalla pública los necesita).
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
  for select using (true);

drop policy if exists desserts_read on public.desserts;
create policy desserts_read on public.desserts
  for select using (true);

-- Solo un administrador con sesión iniciada puede escribir.
drop policy if exists campaigns_admin_write on public.campaigns;
create policy campaigns_admin_write on public.campaigns
  for all to authenticated using (true) with check (true);

drop policy if exists desserts_admin_write on public.desserts;
create policy desserts_admin_write on public.desserts
  for all to authenticated using (true) with check (true);

-- La bitácora solo la lee el administrador. Nadie la escribe directamente:
-- las inserciones ocurren dentro de cast_vote(), que es SECURITY DEFINER.
drop policy if exists vote_events_admin_read on public.vote_events;
create policy vote_events_admin_read on public.vote_events
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 5. REALTIME (para que /admin se actualice solo, sin refrescar)
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.desserts;
  exception when others then null;   -- ya estaba añadida, o la publicación no aplica
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. DATOS INICIALES (solo si la base está vacía)
-- ---------------------------------------------------------------------------

do $$
declare
  v_campaign uuid;
begin
  if not exists (select 1 from public.campaigns) then
    insert into public.campaigns (title, is_active)
    values ('Postre del Mes', true)
    returning id into v_campaign;

    insert into public.desserts (campaign_id, "position", name) values
      (v_campaign, 1, 'Postre #1'),
      (v_campaign, 2, 'Postre #2'),
      (v_campaign, 3, 'Postre #3');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. ALMACENAMIENTO DE FOTOS
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('dessert-images', 'dessert-images', true)
on conflict (id) do update set public = true;

drop policy if exists "dessert images public read" on storage.objects;
create policy "dessert images public read" on storage.objects
  for select using (bucket_id = 'dessert-images');

drop policy if exists "dessert images admin write" on storage.objects;
create policy "dessert images admin write" on storage.objects
  for insert to authenticated with check (bucket_id = 'dessert-images');

drop policy if exists "dessert images admin update" on storage.objects;
create policy "dessert images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'dessert-images');

drop policy if exists "dessert images admin delete" on storage.objects;
create policy "dessert images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'dessert-images');

-- ============================================================================
--  LISTO. Ahora crea tu usuario administrador en:
--  Supabase → Authentication → Users → Add user → Create new user
--  (marca "Auto Confirm User")
-- ============================================================================
