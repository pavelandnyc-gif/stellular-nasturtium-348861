-- Unidad del clima en el informe del día: 'F' (Fahrenheit) o 'C' (Celsius).
alter table jarvis.profiles add column if not exists weather_unit text not null default 'F'
  check (weather_unit in ('F', 'C'))
