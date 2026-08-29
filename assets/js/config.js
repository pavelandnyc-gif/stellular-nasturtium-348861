/* ==========================================================================
   PAVÉLAND · Configuración
   --------------------------------------------------------------------------
   ESTE ES EL ÚNICO ARCHIVO QUE TIENES QUE EDITAR PARA CONECTAR LA BASE DE DATOS.

   1. Entra a  https://supabase.com  y crea un proyecto (gratis).
   2. Ve a  Project Settings → API  (o "Data API").
   3. Copia los dos valores y pégalos abajo, entre las comillas.

   La "anon key" es PÚBLICA por diseño: está pensada para ir en el navegador.
   Quien la vea NO puede inflar votos ni cambiar nada, porque las políticas RLS
   del archivo supabase/schema.sql solo permiten leer y llamar a cast_vote().
   NUNCA pegues aquí la "service_role key".
   ========================================================================== */

window.PAVELAND_CONFIG = {
  SUPABASE_URL: 'https://azsudzzzcisurelodmbg.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6c3Vkenp6Y2lzdXJlbG9kbWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTY2OTIsImV4cCI6MjEwMzUzMjY5Mn0.ysXhqpCu5VJziSSUpdSGH-_8mxay0Ew2NVXODwR98cE',

  /* Segundos que dura la pantalla de "¡Voto registrado!" antes de volver sola. */
  GRACIAS_SEGUNDOS: 2.6,

  /* Milisegundos que la pantalla queda bloqueada tras volver, para que un
     segundo toque accidental del mismo dedo no cuente como voto nuevo. */
  BLOQUEO_MS: 450,
};
