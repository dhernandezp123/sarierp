-- Fase 2 SaaS: configuración y branding aislados por tenant.

alter table public.company_settings
  add column if not exists primary_color text not null default '#0038BD',
  add column if not exists secondary_color text not null default '#07111F';

do $company_settings_constraints$
begin
  if exists (
    select 1 from public.company_settings where tenant_id is null
  ) then
    raise exception 'company_settings contiene filas sin tenant; ejecute el backfill antes de Fase 2';
  end if;

  if exists (
    select 1
    from public.company_settings
    group by tenant_id
    having count(*) > 1
  ) then
    raise exception 'company_settings contiene más de una fila para el mismo tenant';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_settings'::regclass
      and conname = 'company_settings_primary_color_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_primary_color_check
      check (primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_settings'::regclass
      and conname = 'company_settings_secondary_color_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_secondary_color_check
      check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$company_settings_constraints$;

alter table public.company_settings
  alter column tenant_id set not null;

create unique index if not exists company_settings_tenant_id_key
  on public.company_settings (tenant_id);

drop policy if exists "admin_write" on public.company_settings;
drop policy if exists "authenticated_read" on public.company_settings;
drop policy if exists "company_settings_select_internal" on public.company_settings;
drop policy if exists company_settings_select_tenant_internal on public.company_settings;
drop policy if exists company_settings_insert_tenant_admin on public.company_settings;
drop policy if exists company_settings_update_tenant_admin on public.company_settings;
drop policy if exists company_settings_delete_tenant_admin on public.company_settings;

create policy company_settings_select_tenant_internal
on public.company_settings
for select
to authenticated
using (
  public.is_approved_active_user()
  and tenant_id = public.current_tenant_id()
);

create policy company_settings_insert_tenant_admin
on public.company_settings
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and public.is_admin()
  and tenant_id = public.current_tenant_id()
);

create policy company_settings_update_tenant_admin
on public.company_settings
for update
to authenticated
using (
  public.is_approved_active_user()
  and public.is_admin()
  and tenant_id = public.current_tenant_id()
)
with check (
  public.is_approved_active_user()
  and public.is_admin()
  and tenant_id = public.current_tenant_id()
);

-- No se crea policy DELETE: cada tenant conserva una sola configuración y la
-- interfaz únicamente permite crearla o actualizarla.

create or replace function public.get_current_company_settings()
returns setof public.company_settings
language sql
stable
security invoker
set search_path = public
as $$
  select cs.*
  from public.company_settings cs
  where cs.tenant_id = public.current_tenant_id()
$$;

create or replace function public.get_current_company_branding()
returns table (
  legal_name text,
  trade_name text,
  rtn text,
  address text,
  city text,
  country text,
  phone text,
  email text,
  logo_url text,
  primary_color text,
  secondary_color text,
  miami_consignee text,
  miami_address_line text,
  miami_suite_prefix text,
  miami_city text,
  miami_state text,
  miami_zip text,
  miami_country text,
  miami_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cs.legal_name,
    cs.trade_name,
    cs.rtn,
    cs.address,
    cs.city,
    cs.country,
    cs.phone,
    cs.email,
    cs.logo_url,
    cs.primary_color,
    cs.secondary_color,
    cs.miami_consignee,
    cs.miami_address_line,
    cs.miami_suite_prefix,
    cs.miami_city,
    cs.miami_state,
    cs.miami_zip,
    cs.miami_country,
    cs.miami_phone
  from public.company_settings cs
  where cs.tenant_id = public.current_tenant_id()
$$;

revoke all on function public.get_current_company_settings()
  from public, anon, authenticated;
revoke all on function public.get_current_company_branding()
  from public, anon, authenticated;
grant execute on function public.get_current_company_settings()
  to authenticated, service_role;
grant execute on function public.get_current_company_branding()
  to authenticated, service_role;

comment on function public.get_current_company_settings() is
  'Configuración completa del tenant para personal interno; conserva RLS del invocador.';
comment on function public.get_current_company_branding() is
  'Subset de branding y contacto permitido para perfiles aprobados, incluido Cliente.';
