-- Fase 3: garantizar columnas de solicitud y refrescar el schema cache de API.

alter table public.profiles
  add column if not exists registration_company text,
  add column if not exists registration_phone text;

notify pgrst, 'reload schema';
