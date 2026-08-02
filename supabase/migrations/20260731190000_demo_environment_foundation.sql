-- Fundacion segura para ambientes demo y administracion privada de leads.
-- Los valores por defecto mantienen sin cambios a los usuarios existentes.

alter table public.profiles
  add column if not exists is_demo_user boolean not null default false,
  add column if not exists demo_expires_at timestamp with time zone,
  add column if not exists demo_access_grant_id uuid,
  add column if not exists is_platform_admin boolean not null default false;

comment on column public.profiles.is_demo_user is
  'Identifica cuentas temporales del sandbox comercial.';
comment on column public.profiles.demo_expires_at is
  'Vencimiento de acceso del usuario demo. NULL para usuarios normales.';
comment on column public.profiles.demo_access_grant_id is
  'Identifica una ventana de acceso demo; rota al reasignar el slot.';
comment on column public.profiles.is_platform_admin is
  'Permite administrar solicitudes comerciales de Hernova; no equivale al rol Admin del ERP.';

alter table public.profiles
  drop constraint if exists profiles_demo_access_shape_check;
alter table public.profiles
  add constraint profiles_demo_access_shape_check
  check (
    (
      is_demo_user is true
      and demo_expires_at is not null
      and demo_access_grant_id is not null
      and is_platform_admin is false
    )
    or (
      is_demo_user is false
      and demo_expires_at is null
      and demo_access_grant_id is null
    )
  );

-- Sentinel privado. Se crea cerrado y como production en todos los proyectos;
-- la habilitacion demo exige una accion SQL explicita en el proyecto correcto.
create table if not exists public.platform_environment (
  singleton boolean primary key default true check (singleton is true),
  environment text not null default 'production'
    check (environment in ('production', 'demo', 'customer')),
  project_ref text,
  reset_enabled boolean not null default false,
  reset_nonce uuid not null default gen_random_uuid(),
  updated_at timestamp with time zone not null default now(),
  check (environment = 'demo' or reset_enabled is false),
  check (environment <> 'demo' or project_ref is not null)
);

insert into public.platform_environment (
  singleton,
  environment,
  project_ref,
  reset_enabled
)
values (true, 'production', null, false)
on conflict (singleton) do nothing;

alter table public.platform_environment enable row level security;
revoke all on table public.platform_environment from public, anon, authenticated;
grant select, update on table public.platform_environment to service_role;

create or replace function public.is_demo_environment()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select pe.environment = 'demo'
    from public.platform_environment pe
    where pe.singleton is true
  ), false)
$$;

create or replace function public.current_user_is_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_demo_user
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), false)
$$;

create or replace function public.is_restricted_demo_context()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_demo_environment() or public.current_user_is_demo()
$$;

create or replace function public.is_demo_access_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'Aprobado'
      and p.is_active is true
      and (
        (
          public.is_demo_environment()
          and p.is_demo_user is true
          and p.demo_expires_at is not null
          and p.demo_expires_at > now()
          and p.demo_access_grant_id is not null
        )
        or (
          public.is_demo_environment() is false
          and p.is_demo_user is false
        )
      )
  )
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.rol = 'Admin'
      and p.status = 'Aprobado'
      and p.is_active is true
      and public.is_demo_environment() is false
      and p.is_demo_user is false
      and p.is_platform_admin is true
  )
$$;

-- Centraliza el vencimiento para las politicas y RPC que ya consultan el rol.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active is true
    and p.status = 'Aprobado'
    and (
      (
        public.is_demo_environment()
        and p.is_demo_user is true
        and p.demo_expires_at is not null
        and p.demo_expires_at > now()
        and p.demo_access_grant_id is not null
      )
      or (
        public.is_demo_environment() is false
        and p.is_demo_user is false
      )
    )
  limit 1
$$;

create or replace function public.get_current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active is true
    and p.status = 'Aprobado'
    and (
      (
        public.is_demo_environment()
        and p.is_demo_user is true
        and p.demo_expires_at is not null
        and p.demo_expires_at > now()
        and p.demo_access_grant_id is not null
      )
      or (
        public.is_demo_environment() is false
        and p.is_demo_user is false
      )
    )
  limit 1
$$;

create or replace function public.current_user_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.cliente_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active is true
    and p.status = 'Aprobado'
    and (
      (
        public.is_demo_environment()
        and p.is_demo_user is true
        and p.demo_expires_at is not null
        and p.demo_expires_at > now()
        and p.demo_access_grant_id is not null
      )
      or (
        public.is_demo_environment() is false
        and p.is_demo_user is false
      )
    )
  limit 1
$$;

create or replace function public.current_demo_access_grant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.demo_access_grant_id
  from public.profiles p
  where p.id = auth.uid()
    and public.is_demo_access_active()
  limit 1
$$;

revoke all on function public.is_demo_environment() from public, anon;
revoke all on function public.current_user_is_demo() from public, anon;
revoke all on function public.is_restricted_demo_context() from public, anon;
revoke all on function public.is_demo_access_active() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.get_current_user_role() from public, anon;
revoke all on function public.current_user_cliente_id() from public, anon;
revoke all on function public.current_demo_access_grant_id()
  from public, anon;

-- Las politicas publicas de leads y storage deben poder evaluar el ambiente
-- sin exponer la tabla privada platform_environment.
grant execute on function public.is_demo_environment() to anon, authenticated;
grant execute on function public.current_user_is_demo() to authenticated;
grant execute on function public.is_restricted_demo_context() to anon, authenticated;
grant execute on function public.is_demo_access_active() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.current_user_cliente_id() to authenticated;
grant execute on function public.current_demo_access_grant_id() to authenticated;

-- Ningun usuario autenticado puede autoasignarse privilegios de plataforma o demo.
create or replace function public.prevent_role_change_by_non_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Operaciones confiables de backend/SQL no tienen JWT de usuario.
  if auth.uid() is null then
    return new;
  end if;

  if new.is_demo_user is distinct from old.is_demo_user
    or new.demo_expires_at is distinct from old.demo_expires_at
    or new.demo_access_grant_id is distinct from old.demo_access_grant_id
    or new.is_platform_admin is distinct from old.is_platform_admin
  then
    raise exception 'No tienes permiso para modificar privilegios de plataforma';
  end if;

  if public.is_restricted_demo_context() and (
    new.rol is distinct from old.rol
    or new.status is distinct from old.status
    or new.is_active is distinct from old.is_active
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.cliente_id is distinct from old.cliente_id
    or new.nombre is distinct from old.nombre
    or new.apellido is distinct from old.apellido
    or new.email is distinct from old.email
    or new.avatar_url is distinct from old.avatar_url
  ) then
    raise exception 'Los perfiles y permisos son de solo lectura en el ambiente demo';
  end if;

  if not public.is_admin() and (
    new.rol is distinct from old.rol
    or new.status is distinct from old.status
    or new.is_active is distinct from old.is_active
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.cliente_id is distinct from old.cliente_id
  ) then
    raise exception 'No tienes permiso para modificar campos administrativos del perfil';
  end if;

  return new;
end;
$$;

drop policy if exists profiles_demo_update_guard on public.profiles;
drop policy if exists profiles_demo_select_guard on public.profiles;
create policy profiles_demo_select_guard
on public.profiles
as restrictive
for select
to authenticated
using (
  not public.is_restricted_demo_context()
  or id = auth.uid()
  or (
    public.is_demo_access_active()
    and is_demo_user is true
  )
);

create policy profiles_demo_update_guard
on public.profiles
as restrictive
for update
to authenticated
using (
  not public.is_restricted_demo_context()
  or id = auth.uid()
)
with check (
  not public.is_restricted_demo_context()
  or (
    id = auth.uid()
    and is_demo_user is true
    and demo_access_grant_id is not null
    and is_platform_admin is false
  )
);

drop policy if exists "Users can create own pending profile" on public.profiles;
create policy "Users can create own pending profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and public.is_demo_environment() is false
  and rol = 'Ventas'::public.user_role
  and status = 'Pendiente'
  and is_active is true
  and approved_at is null
  and approved_by is null
  and cliente_id is null
  and is_demo_user is false
  and demo_expires_at is null
  and demo_access_grant_id is null
  and is_platform_admin is false
);

create table if not exists public.demo_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  access_grant_id uuid not null,
  shared_sandbox_acknowledged boolean not null default false,
  accepted_at timestamp with time zone not null default now(),
  unique (user_id, terms_version, access_grant_id),
  check (length(btrim(terms_version)) between 1 and 40),
  check (shared_sandbox_acknowledged is true)
);

create table if not exists public.demo_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_grant_id uuid not null,
  event_type text not null,
  created_at timestamp with time zone not null default now(),
  check (event_type in ('session_started', 'terms_accepted'))
);

create index if not exists demo_access_events_user_created_idx
  on public.demo_access_events (user_id, created_at desc);

alter table public.demo_terms_acceptances enable row level security;
alter table public.demo_access_events enable row level security;

create policy demo_terms_acceptances_select_own
on public.demo_terms_acceptances
for select
to authenticated
using (
  (
    user_id = auth.uid()
    and public.is_demo_access_active()
    and access_grant_id = public.current_demo_access_grant_id()
  )
  or public.is_platform_admin()
);

create policy demo_terms_acceptances_insert_own
on public.demo_terms_acceptances
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_is_demo()
  and public.is_demo_access_active()
  and access_grant_id = public.current_demo_access_grant_id()
  and shared_sandbox_acknowledged is true
);

create policy demo_access_events_select_platform
on public.demo_access_events
for select
to authenticated
using (public.is_platform_admin());

revoke all on table public.demo_terms_acceptances
  from public, anon, authenticated;
revoke all on table public.demo_access_events
  from public, anon, authenticated;
grant select, insert on table public.demo_terms_acceptances to authenticated;
grant select on table public.demo_access_events to authenticated;
grant all on table public.demo_terms_acceptances to service_role;
grant all on table public.demo_access_events to service_role;

create or replace function public.log_demo_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_demo()
    or not public.is_demo_access_active()
  then
    raise exception 'Acceso demo no disponible' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.demo_access_events e
    where e.user_id = auth.uid()
      and e.access_grant_id = public.current_demo_access_grant_id()
      and e.event_type = 'session_started'
      and e.created_at >= now() - interval '30 minutes'
  ) then
    insert into public.demo_access_events (user_id, access_grant_id, event_type)
    values (
      auth.uid(),
      public.current_demo_access_grant_id(),
      'session_started'
    );
  end if;
end;
$$;

revoke all on function public.log_demo_session() from public, anon;
grant execute on function public.log_demo_session() to authenticated;

create or replace function public.log_demo_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.demo_access_events (user_id, access_grant_id, event_type)
  values (new.user_id, new.access_grant_id, 'terms_accepted');
  return new;
end;
$$;

drop trigger if exists demo_terms_acceptance_event on public.demo_terms_acceptances;
create trigger demo_terms_acceptance_event
after insert on public.demo_terms_acceptances
for each row execute function public.log_demo_terms_acceptance();

-- Todo usuario demo vencido queda bloqueado en tablas operativas con RLS.
-- Se omiten perfiles y bitacoras demo para poder mostrar el motivo y cerrar sesion.
do $$
declare
  target record;
begin
  for target in
    select c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity is true
      and c.relname not in (
        'profiles',
        'demo_terms_acceptances',
        'demo_access_events'
      )
  loop
    execute format(
      'drop policy if exists demo_access_active_guard on public.%I',
      target.table_name
    );
    execute format(
      'create policy demo_access_active_guard on public.%I as restrictive for all to authenticated using (public.is_demo_access_active()) with check (public.is_demo_access_active())',
      target.table_name
    );
  end loop;
end
$$;

-- Un Admin Demo puede recorrer el ERP, pero no administrar configuracion sensible.
do $$
declare
  table_name text;
  operation text;
begin
  foreach table_name in array array[
    'company_settings',
    'cai_ranges',
    'email_templates',
    'surcharge_rules',
    'client_rate_catalog',
    'agents',
    'agent_route_rates',
    'proveedores',
    'service_products',
    'miami_carriers',
    'tax_rates',
    'container_types',
    'package_types',
    'countries',
    'ports',
    'locations_catalog'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    foreach operation in array array['insert', 'update', 'delete']
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        table_name || '_demo_' || operation || '_guard',
        table_name
      );

      if operation = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_restricted_demo_context())',
          table_name || '_demo_' || operation || '_guard',
          table_name
        );
      elsif operation = 'update' then
        execute format(
          'create policy %I on public.%I as restrictive for update to authenticated using (not public.is_restricted_demo_context()) with check (not public.is_restricted_demo_context())',
          table_name || '_demo_' || operation || '_guard',
          table_name
        );
      else
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_restricted_demo_context())',
          table_name || '_demo_' || operation || '_guard',
          table_name
        );
      end if;
    end loop;
  end loop;
end
$$;

-- Los hard-deletes de entidades raiz no forman parte del recorrido demo.
-- Se conservan los reemplazos de lineas hijas usados por los formularios.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clientes',
    'quotations',
    'invoices',
    'shipping_instructions',
    'shipments',
    'bookings',
    'bills_of_lading',
    'miami_manifests',
    'miami_shipments',
    'miami_packages',
    'cuentas_pagar'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_demo_root_delete_guard',
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_restricted_demo_context())',
      table_name || '_demo_root_delete_guard',
      table_name
    );
  end loop;
end
$$;

-- Las RPC SECURITY DEFINER omiten RLS; se envuelven con el guard demo.
alter function public.activate_cai_range(uuid)
  rename to activate_cai_range_trusted;
revoke all on function public.activate_cai_range_trusted(uuid)
  from public, anon, authenticated;

create function public.activate_cai_range(p_range_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_restricted_demo_context() then
    raise exception 'La configuracion CAI es de solo lectura en el ambiente demo'
      using errcode = '42501';
  end if;

  return public.activate_cai_range_trusted(p_range_id);
end;
$$;

revoke all on function public.activate_cai_range(uuid) from public, anon;
grant execute on function public.activate_cai_range(uuid) to authenticated;

alter function public.delete_miami_manifest(uuid, text)
  rename to delete_miami_manifest_trusted;
revoke all on function public.delete_miami_manifest_trusted(uuid, text)
  from public, anon, authenticated;

create function public.delete_miami_manifest(
  p_manifest_id uuid,
  p_reason text
)
returns table (
  manifest_number text,
  deleted_packages integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_restricted_demo_context() then
    raise exception 'La eliminacion completa de manifiestos esta bloqueada en el ambiente demo'
      using errcode = '42501';
  end if;

  return query
  select result.manifest_number, result.deleted_packages
  from public.delete_miami_manifest_trusted(
    p_manifest_id,
    p_reason
  ) as result;
end;
$$;

revoke all on function public.delete_miami_manifest(uuid, text)
  from public, anon;
grant execute on function public.delete_miami_manifest(uuid, text)
  to authenticated;

alter function public.delete_miami_manifest_package(uuid)
  rename to delete_miami_manifest_package_trusted;
revoke all on function public.delete_miami_manifest_package_trusted(uuid)
  from public, anon, authenticated;

create function public.delete_miami_manifest_package(
  p_package_id uuid
)
returns table (
  tracking_number text,
  manifest_number text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_restricted_demo_context() then
    raise exception 'La eliminacion de paquetes de manifiesto esta bloqueada en el ambiente demo'
      using errcode = '42501';
  end if;

  return query
  select result.tracking_number, result.manifest_number
  from public.delete_miami_manifest_package_trusted(p_package_id) as result;
end;
$$;

revoke all on function public.delete_miami_manifest_package(uuid)
  from public, anon;
grant execute on function public.delete_miami_manifest_package(uuid)
  to authenticated;

-- Los identificadores creados durante la demo no deben usar prefijos del cliente Sari.
create or replace function public.generate_quotation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_initials text;
  number_prefix text;
begin
  select upper(
    left(coalesce(p.nombre, 'X'), 1)
    || left(coalesce(p.apellido, 'X'), 1)
  )
  into seller_initials
  from public.profiles p
  where p.id = new.created_by;

  seller_initials := coalesce(seller_initials, 'XX');
  number_prefix := case
    when public.is_demo_environment() then 'DEMO-Q-'
    else 'SARIHN-'
  end;

  if new.quotation_number is null then
    new.quotation_number := number_prefix
      || to_char(now(), 'YYMM')
      || '-'
      || lpad(nextval('public.quotation_number_seq')::text, 4, '0')
      || '-'
      || seller_initials;
  end if;

  return new;
end;
$$;

create or replace function public.rewrite_demo_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_demo_environment()
    and new.invoice_number like 'SARI-PRO-%'
  then
    new.invoice_number := 'DEMO-PRO-'
      || substring(new.invoice_number from length('SARI-PRO-') + 1);
  end if;

  return new;
end;
$$;

drop trigger if exists rewrite_demo_invoice_number_trigger on public.invoices;
create trigger rewrite_demo_invoice_number_trigger
before insert on public.invoices
for each row execute function public.rewrite_demo_invoice_number();

alter function public.create_invoice_with_items(jsonb, jsonb)
  rename to create_invoice_with_items_trusted;
revoke all on function public.create_invoice_with_items_trusted(jsonb, jsonb)
  from public, anon, authenticated;

create function public.create_invoice_with_items(
  p_invoice jsonb,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted_result record;
begin
  if public.is_restricted_demo_context()
    and p_invoice ->> 'invoice_type' is distinct from 'Proforma'
  then
    raise exception 'El ambiente demo solo permite documentos Proforma'
      using errcode = '42501';
  end if;

  select *
  into trusted_result
  from public.create_invoice_with_items_trusted(p_invoice, p_items);

  return query
  select i.id, i.invoice_number
  from public.invoices i
  where i.id = trusted_result.invoice_id;
end;
$$;

revoke all on function public.create_invoice_with_items(jsonb, jsonb)
  from public, anon;
grant execute on function public.create_invoice_with_items(jsonb, jsonb)
  to authenticated;

-- Las solicitudes comerciales pertenecen a Hernova, no a los Admin de clientes.
alter table public.leads
  add column if not exists status text not null default 'Nueva',
  add column if not exists notes text,
  add column if not exists contacted_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.leads
  drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in ('Nueva', 'Contactada', 'Demo programada', 'Convertida', 'Cerrada'));

alter table public.leads
  drop constraint if exists leads_nombre_length_check;
alter table public.leads
  add constraint leads_nombre_length_check
  check (length(btrim(nombre)) between 2 and 120);

alter table public.leads
  drop constraint if exists leads_empresa_length_check;
alter table public.leads
  add constraint leads_empresa_length_check
  check (length(btrim(empresa)) between 2 and 160);

alter table public.leads
  drop constraint if exists leads_email_length_check;
alter table public.leads
  add constraint leads_email_length_check
  check (length(btrim(email)) between 5 and 254 and position('@' in email) > 1);

alter table public.leads
  drop constraint if exists leads_telefono_length_check;
alter table public.leads
  add constraint leads_telefono_length_check
  check (telefono is null or length(btrim(telefono)) <= 40);

drop policy if exists "leads_auth_read" on public.leads;
drop policy if exists "leads_insert_public" on public.leads;
drop policy if exists leads_select_platform_admin on public.leads;
drop policy if exists leads_update_platform_admin on public.leads;

create policy leads_insert_public
on public.leads
for insert
to anon, authenticated
with check (
  public.is_demo_environment() is false
  and status = 'Nueva'
  and notes is null
  and contacted_at is null
);

create policy leads_select_platform_admin
on public.leads
for select
to authenticated
using (public.is_platform_admin());

create policy leads_update_platform_admin
on public.leads
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

revoke all on table public.leads from anon;
revoke insert on table public.leads from authenticated;
grant insert (nombre, empresa, email, telefono) on table public.leads
  to anon, authenticated;
grant select, update on table public.leads to authenticated;

create or replace function public.set_leads_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_leads_updated_at();

notify pgrst, 'reload schema';
