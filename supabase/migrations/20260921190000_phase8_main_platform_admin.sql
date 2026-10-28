-- Fase 8: la rama principal no depende de helpers exclusivos del ambiente Demo.
-- Se redefine la comprobacion de administrador de plataforma con el modelo
-- productivo versionado para que instalaciones limpias y upgrades sean iguales.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_platform_admin is true
      and profile.status = 'Aprobado'
      and profile.is_active is true
      and profile.rol <> 'Cliente'::public.user_role
  )
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

comment on function public.is_platform_admin() is
  'Administrador de plataforma activo de la rama productiva; no depende del esquema Demo.';

notify pgrst, 'reload schema';
