-- PLAT-01: consola de plataforma con operaciones acotadas y auditoría atómica.
-- No crea administradores de plataforma ni modifica empresas existentes.
create function public.can_manage_platform()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.is_platform_admin is true and p.tenant_id is null
    and p.rol = 'Admin' and p.status = 'Aprobado' and p.is_active is true)
$$;
revoke all on function public.can_manage_platform() from public, anon;
grant execute on function public.can_manage_platform() to authenticated;

create table public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete restrict,
  action text not null check (action in ('company_created', 'company_updated', 'user_access_updated')),
  entity_id uuid not null,
  entity_name text not null,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index platform_admin_events_created_idx on public.platform_admin_events(created_at desc, id);
alter table public.platform_admin_events enable row level security;
revoke all on table public.platform_admin_events from public, anon, authenticated;
grant select on table public.platform_admin_events to authenticated;
grant all on table public.platform_admin_events to service_role;
create policy platform_admin_events_read on public.platform_admin_events
  for select to authenticated using (public.can_manage_platform());

-- Una sesión ya emitida pierde el contexto operativo cuando se suspende la empresa.
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.tenant_id from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'Activo'
  where p.id = auth.uid() and p.status = 'Aprobado' and p.is_active is true
    and p.is_platform_admin is false
  limit 1
$$;

create function public.platform_admin_console(
  p_section text default 'overview', p_search text default '', p_status text default '', p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb; v_rows jsonb; v_total bigint; v_search text := '%' || btrim(coalesce(p_search, '')) || '%';
begin
  if not public.can_manage_platform() then raise exception 'Acceso de plataforma requerido' using errcode = '42501'; end if;
  if p_section is null or p_section not in ('overview', 'companies', 'users', 'activity')
    or p_page is null or p_page not between 1 and 100000 or length(coalesce(p_search, '')) > 100
    or p_status is null or (p_status <> '' and not (
      (p_section = 'companies' and p_status in ('Activo', 'Suspendido', 'Archivado'))
      or (p_section = 'users' and p_status in ('Pendiente', 'Aprobado', 'Rechazado')))) then
    raise exception 'Filtros inválidos' using errcode = '22023';
  end if;
  v_result := jsonb_build_object('page', p_page, 'page_size', 25, 'total', 0);
  if p_section = 'overview' then
    v_result := v_result || jsonb_build_object('summary', jsonb_build_object(
      'companies', (select count(*) from public.tenants),
      'active_companies', (select count(*) from public.tenants where status = 'Activo'),
      'suspended_companies', (select count(*) from public.tenants where status = 'Suspendido'),
      'users', (select count(*) from public.profiles where not is_platform_admin and tenant_id is not null),
      'pending_users', (select count(*) from public.profiles where not is_platform_admin and tenant_id is not null and status = 'Pendiente'),
      'open_tickets', (select count(*) from public.support_tickets where status not in ('Resuelto', 'Cerrado'))
    ));
  end if;
  if p_section = 'companies' then
    with filtered as (
      select t.id, t.name, t.slug, t.status, t.created_at, t.updated_at,
        (select count(*) from public.profiles p where p.tenant_id = t.id and not p.is_platform_admin) as users_count,
        (select count(*) from public.profiles p where p.tenant_id = t.id and not p.is_platform_admin
          and p.rol = 'Admin' and p.is_active is true and p.status = 'Aprobado') as admins_count,
        coalesce((select jsonb_agg(jsonb_build_object('hostname', d.hostname, 'is_primary', d.is_primary, 'is_active', d.is_active)
          order by d.is_primary desc, d.hostname) from public.tenant_domains d where d.tenant_id = t.id), '[]'::jsonb) as domains
      from public.tenants t where (t.name ilike v_search or t.slug ilike v_search)
        and (p_status = '' or t.status = p_status)
    ), page as (select * from filtered order by created_at desc, id limit 25 offset (p_page - 1) * 25)
    select (select count(*) from filtered), coalesce(jsonb_agg(to_jsonb(page) order by created_at desc, id), '[]'::jsonb)
      into v_total, v_rows from page;
    return v_result || jsonb_build_object('total', v_total, 'companies', v_rows);
  elsif p_section = 'users' then
    with filtered as (
      select p.id, p.nombre, p.apellido, p.email, p.rol, p.status, p.is_active, p.is_platform_admin,
        p.tenant_id, p.cliente_id, t.name as company_name, u.last_sign_in_at
      from public.profiles p left join public.tenants t on t.id = p.tenant_id left join auth.users u on u.id = p.id
      where (concat_ws(' ', p.nombre, p.apellido, p.email, t.name) ilike v_search)
        and (p_status = '' or p.status = p_status)
    ), page as (select * from filtered order by email nulls last, id limit 25 offset (p_page - 1) * 25)
    select (select count(*) from filtered), coalesce(jsonb_agg(to_jsonb(page) order by email nulls last, id), '[]'::jsonb)
      into v_total, v_rows from page;
    return v_result || jsonb_build_object('total', v_total, 'users', v_rows);
  end if;
  with filtered as (
    select e.id, e.action, e.entity_name, e.reason, e.created_at, t.name as company_name,
      coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email, 'Administrador') as actor_name
    from public.platform_admin_events e join public.profiles p on p.id = e.actor_id left join public.tenants t on t.id = e.tenant_id
    where concat_ws(' ', e.entity_name, e.reason, t.name, p.nombre, p.apellido, p.email) ilike v_search
  ), page as (select * from filtered order by created_at desc, id limit 25 offset (p_page - 1) * 25)
  select (select count(*) from filtered), coalesce(jsonb_agg(to_jsonb(page) order by created_at desc, id), '[]'::jsonb)
    into v_total, v_rows from page;
  return v_result || jsonb_build_object('total', v_total, 'activity', v_rows);
end;
$$;

create function public.platform_create_company(p_name text, p_slug text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := btrim(p_name); v_slug text := lower(btrim(p_slug));
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  if not public.can_manage_platform() then raise exception 'Acceso de plataforma requerido' using errcode = '42501'; end if;
  if v_name is null or length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]'
    or v_slug is null or length(v_slug) not between 1 and 63 or v_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    or v_slug in ('admin', 'api', 'app', 'mail', 'support', 'www')
    or p_reason is null or length(btrim(p_reason)) not between 5 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception 'Revisa nombre, subdominio y motivo' using errcode = '22023';
  end if;
  insert into public.tenants(name, slug) values (v_name, v_slug) returning id into v_id;
  insert into public.company_settings(tenant_id, legal_name, trade_name, updated_by)
    values (v_id, v_name, v_name, auth.uid());
  insert into public.tenant_domains(tenant_id, hostname, is_primary, is_active)
    values (v_id, v_slug || '.forwarders.app', true, true);
  insert into public.platform_admin_events(actor_id, tenant_id, action, entity_id, entity_name, reason, after_state)
    values (auth.uid(), v_id, 'company_created', v_id, v_name, btrim(p_reason),
      jsonb_build_object('name', v_name, 'slug', v_slug, 'status', 'Activo', 'hostname', v_slug || '.forwarders.app'));
  return v_id;
end;
$$;

create function public.platform_update_company(p_id uuid, p_name text, p_status text, p_expected_updated_at timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_before public.tenants%rowtype; v_name text := btrim(p_name);
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  if not public.can_manage_platform() then raise exception 'Acceso de plataforma requerido' using errcode = '42501'; end if;
  if v_name is null or length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]'
    or p_status is null or p_status not in ('Activo', 'Suspendido', 'Archivado')
    or p_reason is null or length(btrim(p_reason)) not between 5 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception 'Revisa nombre, estado y motivo' using errcode = '22023';
  end if;
  select * into v_before from public.tenants where id = p_id for update;
  if not found then raise exception 'Empresa no encontrada' using errcode = 'P0002'; end if;
  if p_expected_updated_at is distinct from v_before.updated_at then raise exception 'La empresa cambió' using errcode = '40001'; end if;
  if p_status = 'Activo' and not exists (select 1 from public.tenant_domains where tenant_id = p_id and is_active and is_primary) then
    raise exception 'La empresa necesita un dominio principal activo' using errcode = '22023';
  end if;
  if v_name = v_before.name and p_status = v_before.status then return p_id; end if;
  update public.tenants set name = v_name, status = p_status, updated_at = clock_timestamp() where id = p_id;
  insert into public.platform_admin_events(actor_id, tenant_id, action, entity_id, entity_name, reason, before_state, after_state)
    values (auth.uid(), p_id, 'company_updated', p_id, v_name, btrim(p_reason),
      jsonb_build_object('name', v_before.name, 'status', v_before.status), jsonb_build_object('name', v_name, 'status', p_status));
  return p_id;
end;
$$;

create function public.platform_update_user_access(
  p_id uuid, p_role text, p_status text, p_is_active boolean, p_expected jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_before public.profiles%rowtype; v_tenant_id uuid; v_state jsonb; v_tenant_status text;
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  if not public.can_manage_platform() then raise exception 'Acceso de plataforma requerido' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('Admin', 'Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas', 'Cliente')
    or p_status is null or p_status not in ('Pendiente', 'Aprobado', 'Rechazado') or p_is_active is null
    or p_reason is null or length(btrim(p_reason)) not between 5 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception 'Revisa rol, estado y motivo' using errcode = '22023';
  end if;
  select tenant_id into v_tenant_id from public.profiles where id = p_id;
  -- Serializa cambios de acceso por empresa y los coordina con suspensión/reactivación.
  select status into v_tenant_status from public.tenants where id = v_tenant_id for update;
  select * into v_before from public.profiles where id = p_id for update;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_id = auth.uid() or v_before.is_platform_admin or v_before.tenant_id is null
    or v_before.tenant_id is distinct from v_tenant_id then
    raise exception 'Esta cuenta no se administra desde este formulario' using errcode = '42501';
  end if;
  v_state := jsonb_build_object('rol', v_before.rol, 'status', v_before.status, 'is_active', v_before.is_active, 'tenant_id', v_before.tenant_id);
  if p_expected is distinct from v_state then raise exception 'El usuario cambió' using errcode = '40001'; end if;
  if v_tenant_status <> 'Activo' then raise exception 'Reactiva la empresa antes de modificar sus accesos' using errcode = '22023'; end if;
  if (v_before.rol = 'Cliente') is distinct from (p_role = 'Cliente') then
    raise exception 'Los cambios entre cuentas de clientes e internas se gestionan desde la empresa' using errcode = '22023';
  end if;
  if p_role = 'Cliente' and p_status = 'Aprobado' and not exists (
    select 1 from public.clientes where id = v_before.cliente_id and tenant_id = v_tenant_id and deleted_at is null
  ) then raise exception 'Vincula la cuenta a un cliente desde la empresa antes de aprobarla' using errcode = '22023'; end if;
  if v_before.rol = 'Admin' and v_before.status = 'Aprobado' and v_before.is_active
    and (p_role <> 'Admin' or p_status <> 'Aprobado' or not p_is_active)
    and not exists (select 1 from public.profiles where tenant_id = v_tenant_id and id <> p_id
      and rol = 'Admin' and status = 'Aprobado' and is_active is true and not is_platform_admin) then
    raise exception 'La empresa debe conservar al menos un administrador activo' using errcode = '22023';
  end if;
  if v_state = jsonb_build_object('rol', p_role, 'status', p_status, 'is_active', p_is_active, 'tenant_id', v_tenant_id) then return p_id; end if;
  update public.profiles set rol = p_role::public.user_role, status = p_status, is_active = p_is_active,
    approved_at = case when p_status <> 'Aprobado' then null when v_before.status <> 'Aprobado' then clock_timestamp() else approved_at end,
    approved_by = case when p_status <> 'Aprobado' then null when v_before.status <> 'Aprobado' then auth.uid() else approved_by end
    where id = p_id;
  insert into public.platform_admin_events(actor_id, tenant_id, action, entity_id, entity_name, reason, before_state, after_state)
    values (auth.uid(), v_tenant_id, 'user_access_updated', p_id, coalesce(v_before.email, p_id::text), btrim(p_reason), v_state,
      jsonb_build_object('rol', p_role, 'status', p_status, 'is_active', p_is_active, 'tenant_id', v_tenant_id));
  return p_id;
end;
$$;

revoke all on function public.platform_admin_console(text,text,text,integer),
  public.platform_create_company(text,text,text), public.platform_update_company(uuid,text,text,timestamptz,text),
  public.platform_update_user_access(uuid,text,text,boolean,jsonb,text) from public, anon, authenticated;
grant execute on function public.platform_admin_console(text,text,text,integer),
  public.platform_create_company(text,text,text), public.platform_update_company(uuid,text,text,timestamptz,text),
  public.platform_update_user_access(uuid,text,text,boolean,jsonb,text) to authenticated;
notify pgrst, 'reload schema';
