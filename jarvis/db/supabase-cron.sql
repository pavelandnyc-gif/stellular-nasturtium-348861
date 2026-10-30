-- ============================================================================
--  JARVIS · Programador de avisos en Supabase (pg_cron + pg_net)
--  Llama cada minuto a https://TU-APP/api/cron/dispatch con tu CRON_SECRET.
--  Pégalo en Supabase → SQL Editor DESPUÉS de desplegar la app, cambiando:
--    1) TU-APP.vercel.app  → tu dirección real
--    2) TU_CRON_SECRET     → el mismo valor de CRON_SECRET que pusiste en Vercel
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda la dirección y el secreto en Vault (cifrados), no en texto plano.
select vault.create_secret('https://TU-APP.vercel.app/api/cron/dispatch', 'jarvis_dispatch_url');
select vault.create_secret('TU_CRON_SECRET', 'jarvis_cron_secret');

-- Si ya existía, lo quita para volver a crearlo.
select cron.unschedule('jarvis-dispatch') where exists (select 1 from cron.job where jobname = 'jarvis-dispatch');

select cron.schedule(
  'jarvis-dispatch',
  '* * * * *',          -- cada minuto
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Comprobar que corre (espera 2 minutos):
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
--
-- Para cambiar la dirección o el secreto más tarde:
--   select vault.update_secret((select id from vault.secrets where name = 'jarvis_dispatch_url'), 'https://NUEVA/api/cron/dispatch');
-- Para detenerlo:
--   select cron.unschedule('jarvis-dispatch');
