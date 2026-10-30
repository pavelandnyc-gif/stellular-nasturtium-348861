-- Javier pidió que Jarvis siempre le diga "Jefe" (se puede cambiar en Ajustes).
update jarvis.profiles set display_name = 'Jefe', updated_at = now() where display_name = 'Javier';
alter table jarvis.profiles alter column display_name set default 'Jefe'
