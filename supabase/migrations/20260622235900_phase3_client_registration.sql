-- Fase 3: solicitudes públicas de acceso al portal de clientes.

alter table public.profiles
  add column if not exists registration_company text,
  add column if not exists registration_phone text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role := 'Ventas'::public.user_role;
begin
  -- La única preferencia pública admitida es Cliente y siempre nace Pendiente.
  -- Ningún metadata puede solicitar roles internos ni autoaprobar acceso.
  if new.raw_user_meta_data->>'requested_role' = 'Cliente' then
    v_role := 'Cliente'::public.user_role;
  end if;

  insert into public.profiles (
    id,
    nombre,
    apellido,
    email,
    rol,
    status,
    is_active,
    registration_company,
    registration_phone
  )
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'nombre', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'apellido', '')), ''),
    new.email,
    v_role,
    'Pendiente',
    true,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'company', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
