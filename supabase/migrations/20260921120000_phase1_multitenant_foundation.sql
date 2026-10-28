-- Fase 1 SaaS: fundación aditiva multiempresa.
-- Esta migración registra a Sari como tenant inicial sin cambiar todavía las
-- políticas de negocio del ERP ni hacer tenant_id obligatorio.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'Activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format_check check (
    slug = lower(slug)
    and char_length(slug) between 1 and 63
    and slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  constraint tenants_slug_reserved_check check (
    slug not in ('admin', 'api', 'app', 'mail', 'support', 'www')
  ),
  constraint tenants_name_present_check check (btrim(name) <> ''),
  constraint tenants_status_check check (
    status in ('Activo', 'Suspendido', 'Archivado')
  )
);

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null unique,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint tenant_domains_hostname_format_check check (
    hostname = lower(hostname)
    and char_length(hostname) between 3 and 253
    and hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);

create unique index if not exists tenant_domains_one_primary_per_tenant_idx
  on public.tenant_domains (tenant_id)
  where is_primary is true;

create index if not exists tenant_domains_tenant_id_idx
  on public.tenant_domains (tenant_id);

alter table public.profiles
  add column if not exists tenant_id uuid;

alter table public.company_settings
  add column if not exists tenant_id uuid;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_tenant_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_settings'::regclass
      and conname = 'company_settings_tenant_id_fkey'
  ) then
    alter table public.company_settings
      add constraint company_settings_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;
end
$constraints$;

create index if not exists profiles_tenant_id_idx
  on public.profiles (tenant_id);

create index if not exists company_settings_tenant_id_idx
  on public.company_settings (tenant_id);

insert into public.tenants (id, slug, name, status)
values (
  '00000000-0000-4000-8000-000000000001',
  'sari',
  'Sari Express',
  'Activo'
)
on conflict (slug) do nothing;

do $sari_bootstrap$
declare
  v_sari_tenant_id uuid;
begin
  select id
  into v_sari_tenant_id
  from public.tenants
  where slug = 'sari';

  if v_sari_tenant_id is null then
    raise exception 'No se pudo resolver el tenant inicial de Sari';
  end if;

  insert into public.tenant_domains (
    id,
    tenant_id,
    hostname,
    is_primary,
    is_active
  )
  values (
    '00000000-0000-4000-8001-000000000001',
    v_sari_tenant_id,
    'sari.forwarders.app',
    true,
    true
  )
  on conflict (hostname) do nothing;

  if not exists (
    select 1
    from public.tenant_domains
    where hostname = 'sari.forwarders.app'
      and tenant_id = v_sari_tenant_id
      and is_primary is true
  ) then
    raise exception 'El dominio sari.forwarders.app está asociado a otro tenant';
  end if;

  -- Los administradores de plataforma quedan fuera de un tenant operativo. Si
  -- también necesitan operar Sari, deben usar un perfil tenant-scoped separado.
  update public.profiles
  set tenant_id = v_sari_tenant_id
  where tenant_id is null
    and coalesce(is_platform_admin, false) is false;

  update public.company_settings
  set tenant_id = v_sari_tenant_id
  where tenant_id is null;
end
$sari_bootstrap$;

comment on table public.tenants is
  'Empresas licenciatarias aisladas dentro de Forwarders ERP.';
comment on table public.tenant_domains is
  'Hostnames permitidos para resolver la identidad visual de un tenant.';
comment on column public.profiles.tenant_id is
  'Empresa operativa del perfil; los administradores exclusivos de plataforma pueden permanecer sin tenant.';
comment on column public.company_settings.tenant_id is
  'Empresa propietaria de la configuración corporativa.';

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'Aprobado'
    and p.is_active is true
  limit 1
$$;

create or replace function public.is_current_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_tenant_id = public.current_tenant_id(), false)
$$;

revoke all on function public.current_tenant_id() from public, anon, authenticated;
revoke all on function public.is_current_tenant(uuid) from public, anon, authenticated;
grant execute on function public.current_tenant_id() to authenticated, service_role;
grant execute on function public.is_current_tenant(uuid) to authenticated, service_role;

create or replace function public.prevent_profile_tenant_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Operaciones confiables sin JWT realizan invitaciones y backfills.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.tenant_id is not null then
    raise exception 'La empresa del perfil solo puede asignarse mediante una operación confiable'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.tenant_id is distinct from old.tenant_id
  then
    raise exception 'La empresa del perfil solo puede cambiarse mediante una operación confiable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_tenant_change()
  from public, anon, authenticated;
grant execute on function public.prevent_profile_tenant_change()
  to service_role;

drop trigger if exists prevent_profile_tenant_change_trigger on public.profiles;
create trigger prevent_profile_tenant_change_trigger
before insert or update on public.profiles
for each row execute function public.prevent_profile_tenant_change();

-- Durante la fase aditiva, los perfiles creados directamente por un usuario
-- quedan sin tenant hasta que una operación confiable los vincule.
drop policy if exists "Users can create own pending profile" on public.profiles;
create policy "Users can create own pending profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and rol = 'Ventas'::public.user_role
  and status = 'Pendiente'
  and is_active = true
  and approved_at is null
  and approved_by is null
  and cliente_id is null
  and tenant_id is null
);

alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;

drop policy if exists tenants_select_authorized on public.tenants;
create policy tenants_select_authorized
on public.tenants
for select
to authenticated
using (
  id = public.current_tenant_id()
  or public.is_platform_admin()
);

drop policy if exists tenant_domains_select_authorized on public.tenant_domains;
create policy tenant_domains_select_authorized
on public.tenant_domains
for select
to authenticated
using (
  tenant_id = public.current_tenant_id()
  or public.is_platform_admin()
);

revoke all on table public.tenants from public, anon, authenticated;
revoke all on table public.tenant_domains from public, anon, authenticated;
grant select on table public.tenants to authenticated;
grant select on table public.tenant_domains to authenticated;
grant all on table public.tenants to service_role;
grant all on table public.tenant_domains to service_role;
