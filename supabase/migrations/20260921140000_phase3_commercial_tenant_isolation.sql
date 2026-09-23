-- Fase 3 SaaS: aislamiento de clientes, cotizaciones, pricing y agentes.
-- La migración conserva el flujo y las RPC atómicas vigentes. El tenant siempre
-- se deriva de la sesión o del padre canónico; nunca se confía en el navegador.

alter table public.clientes add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.client_addresses add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.client_notes add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.client_pickup_requests add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.client_rates add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.cliente_history add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.sales_activities add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotations add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_containers add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_cargo_lines add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_status_history add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_change_logs add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.pricing_items add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.agents add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.agent_route_rates add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.agent_quotes add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.agent_quote_container_rates add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_options add column tenant_id uuid references public.tenants(id) on delete restrict;
alter table public.quotation_option_items add column tenant_id uuid references public.tenants(id) on delete restrict;

-- Backfill de raíces. Todos los registros históricos pertenecen a Sari; cuando
-- existe un padre/perfil con tenant se usa primero como comprobación adicional.
update public.clientes c
set tenant_id = coalesce(
  (select p.tenant_id from public.profiles p where p.id = c.vendedor_asignado),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.agents
set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;

update public.quotations q
set tenant_id = coalesce(
  (select c.tenant_id from public.clientes c where c.id = q.cliente_id),
  (select p.tenant_id from public.profiles p where p.id = q.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.sales_activities sa
set tenant_id = coalesce(
  (select c.tenant_id from public.clientes c where c.id = sa.cliente_id),
  (select p.tenant_id from public.profiles p where p.id = sa.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.client_pickup_requests cpr
set tenant_id = coalesce(
  (select c.tenant_id from public.clientes c where c.id = cpr.cliente_id),
  (select p.tenant_id from public.profiles p where p.id = cpr.profile_id),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.agent_quotes aq
set tenant_id = coalesce(
  (select q.tenant_id from public.quotations q where q.id = aq.quotation_id),
  (select a.tenant_id from public.agents a where a.id = aq.agent_id),
  '00000000-0000-4000-8000-000000000001'::uuid
);

-- Hijos de cliente.
update public.client_addresses child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

update public.client_notes child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

update public.client_rates child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

update public.cliente_history child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

-- Hijos de cotización.
update public.quotation_containers child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

update public.quotation_cargo_lines child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

update public.quotation_status_history child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

update public.quotation_change_logs child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

update public.pricing_items child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

update public.quotation_options child
set tenant_id = parent.tenant_id
from public.quotations parent
where parent.id = child.quotation_id;

-- Hijos de agente, tarifa y opción comercial.
update public.agent_route_rates child
set tenant_id = parent.tenant_id
from public.agents parent
where parent.id = child.agent_id;

update public.agent_quote_container_rates child
set tenant_id = parent.tenant_id
from public.agent_quotes parent
where parent.id = child.agent_quote_id;

update public.quotation_option_items child
set tenant_id = parent.tenant_id
from public.quotation_options parent
where parent.id = child.quotation_option_id;

do $phase3_preflight$
begin
  if exists (
    select 1
    from public.profiles p
    join public.clientes c on c.id = p.cliente_id
    where p.tenant_id is distinct from c.tenant_id
  ) then
    raise exception 'Existen perfiles vinculados a clientes de otro tenant';
  end if;

  if exists (
    select 1
    from public.quotations q
    join public.clientes c on c.id = q.cliente_id
    where q.tenant_id is distinct from c.tenant_id
  ) then
    raise exception 'Existen cotizaciones vinculadas a clientes de otro tenant';
  end if;

  if exists (
    select 1
    from public.agent_quotes aq
    join public.quotations q on q.id = aq.quotation_id
    where aq.tenant_id is distinct from q.tenant_id
  ) or exists (
    select 1
    from public.agent_quotes aq
    join public.agents a on a.id = aq.agent_id
    where aq.tenant_id is distinct from a.tenant_id
  ) then
    raise exception 'Existen tarifas de agente con referencias entre tenants';
  end if;

  if exists (
    select 1
    from public.quotation_options qo
    join public.agent_quotes aq on aq.id = qo.agent_quote_id
    where qo.tenant_id is distinct from aq.tenant_id
  ) or exists (
    select 1
    from public.quotation_options qo
    join public.agents a on a.id = qo.agent_id
    where qo.tenant_id is distinct from a.tenant_id
  ) then
    raise exception 'Existen opciones comerciales con referencias entre tenants';
  end if;

  if exists (
    select 1 from (
      select tenant_id from public.clientes
      union all select tenant_id from public.client_addresses
      union all select tenant_id from public.client_notes
      union all select tenant_id from public.client_pickup_requests
      union all select tenant_id from public.client_rates
      union all select tenant_id from public.cliente_history
      union all select tenant_id from public.sales_activities
      union all select tenant_id from public.quotations
      union all select tenant_id from public.quotation_containers
      union all select tenant_id from public.quotation_cargo_lines
      union all select tenant_id from public.quotation_status_history
      union all select tenant_id from public.quotation_change_logs
      union all select tenant_id from public.pricing_items
      union all select tenant_id from public.agents
      union all select tenant_id from public.agent_route_rates
      union all select tenant_id from public.agent_quotes
      union all select tenant_id from public.agent_quote_container_rates
      union all select tenant_id from public.quotation_options
      union all select tenant_id from public.quotation_option_items
    ) tenant_rows
    where tenant_id is null
  ) then
    raise exception 'El backfill comercial dejó filas sin tenant';
  end if;
end
$phase3_preflight$;

alter table public.clientes alter column tenant_id set not null;
alter table public.client_addresses alter column tenant_id set not null;
alter table public.client_notes alter column tenant_id set not null;
alter table public.client_pickup_requests alter column tenant_id set not null;
alter table public.client_rates alter column tenant_id set not null;
alter table public.cliente_history alter column tenant_id set not null;
alter table public.sales_activities alter column tenant_id set not null;
alter table public.quotations alter column tenant_id set not null;
alter table public.quotation_containers alter column tenant_id set not null;
alter table public.quotation_cargo_lines alter column tenant_id set not null;
alter table public.quotation_status_history alter column tenant_id set not null;
alter table public.quotation_change_logs alter column tenant_id set not null;
alter table public.pricing_items alter column tenant_id set not null;
alter table public.agents alter column tenant_id set not null;
alter table public.agent_route_rates alter column tenant_id set not null;
alter table public.agent_quotes alter column tenant_id set not null;
alter table public.agent_quote_container_rates alter column tenant_id set not null;
alter table public.quotation_options alter column tenant_id set not null;
alter table public.quotation_option_items alter column tenant_id set not null;

-- Claves compuestas para impedir referencias cruzadas aun desde service_role.
alter table public.profiles add constraint profiles_tenant_id_id_key unique (tenant_id, id);
alter table public.clientes add constraint clientes_tenant_id_id_key unique (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_id_id_key unique (tenant_id, id);
alter table public.agents add constraint agents_tenant_id_id_key unique (tenant_id, id);
alter table public.agent_quotes add constraint agent_quotes_tenant_id_id_key unique (tenant_id, id);
alter table public.quotation_containers add constraint quotation_containers_tenant_id_id_key unique (tenant_id, id);
alter table public.pricing_items add constraint pricing_items_tenant_id_id_key unique (tenant_id, id);
alter table public.quotation_options add constraint quotation_options_tenant_id_id_key unique (tenant_id, id);
alter table public.quotation_option_items add constraint quotation_option_items_tenant_id_id_key unique (tenant_id, id);

alter table public.profiles add constraint profiles_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_duplicated_from_fkey
  foreign key (tenant_id, duplicated_from) references public.quotations (tenant_id, id);

alter table public.client_addresses add constraint client_addresses_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.client_notes add constraint client_notes_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.client_rates add constraint client_rates_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.cliente_history add constraint cliente_history_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.client_pickup_requests add constraint client_pickup_requests_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id);
alter table public.client_pickup_requests add constraint client_pickup_requests_tenant_profile_fkey
  foreign key (tenant_id, profile_id) references public.profiles (tenant_id, id);
alter table public.sales_activities add constraint sales_activities_tenant_cliente_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id);

alter table public.quotation_containers add constraint quotation_containers_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.quotation_cargo_lines add constraint quotation_cargo_lines_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.quotation_status_history add constraint quotation_status_history_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.quotation_change_logs add constraint quotation_change_logs_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.pricing_items add constraint pricing_items_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;

alter table public.agent_route_rates add constraint agent_route_rates_tenant_agent_fkey
  foreign key (tenant_id, agent_id) references public.agents (tenant_id, id) on delete cascade;
alter table public.agent_quotes add constraint agent_quotes_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.agent_quotes add constraint agent_quotes_tenant_agent_fkey
  foreign key (tenant_id, agent_id) references public.agents (tenant_id, id);
alter table public.agent_quote_container_rates add constraint agent_quote_rates_tenant_agent_quote_fkey
  foreign key (tenant_id, agent_quote_id) references public.agent_quotes (tenant_id, id) on delete cascade;
alter table public.agent_quote_container_rates add constraint agent_quote_rates_tenant_container_fkey
  foreign key (tenant_id, quotation_container_id) references public.quotation_containers (tenant_id, id);

alter table public.quotation_options add constraint quotation_options_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.quotation_options add constraint quotation_options_tenant_agent_quote_fkey
  foreign key (tenant_id, agent_quote_id) references public.agent_quotes (tenant_id, id);
alter table public.quotation_options add constraint quotation_options_tenant_agent_fkey
  foreign key (tenant_id, agent_id) references public.agents (tenant_id, id);
alter table public.quotation_option_items add constraint quotation_option_items_tenant_option_fkey
  foreign key (tenant_id, quotation_option_id) references public.quotation_options (tenant_id, id) on delete cascade;
alter table public.quotation_option_items add constraint quotation_option_items_tenant_pricing_fkey
  foreign key (tenant_id, source_pricing_item_id) references public.pricing_items (tenant_id, id);
alter table public.pricing_items add constraint pricing_items_tenant_source_option_fkey
  foreign key (tenant_id, source_option_item_id) references public.quotation_option_items (tenant_id, id);

-- Los identificadores comerciales pueden repetirse entre empresas, no dentro de
-- una misma empresa. La independencia de secuencias se completa en Fase 5.
alter table public.clientes drop constraint clientes_codigo_cliente_key;
create unique index clientes_tenant_codigo_cliente_key
  on public.clientes (tenant_id, codigo_cliente)
  where codigo_cliente is not null;

alter table public.quotations drop constraint quotations_quotation_number_key;
create unique index quotations_tenant_quotation_number_key
  on public.quotations (tenant_id, quotation_number)
  where quotation_number is not null;

do $phase3_tenant_indexes$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clientes', 'client_addresses', 'client_notes', 'client_pickup_requests',
    'client_rates', 'cliente_history', 'sales_activities', 'quotations',
    'quotation_containers', 'quotation_cargo_lines',
    'quotation_status_history', 'quotation_change_logs', 'pricing_items',
    'agents', 'agent_route_rates', 'agent_quotes',
    'agent_quote_container_rates', 'quotation_options',
    'quotation_option_items'
  ] loop
    execute format(
      'create index if not exists %I on public.%I (tenant_id)',
      'idx_' || v_table || '_tenant_id',
      v_table
    );
  end loop;
end
$phase3_tenant_indexes$;

create or replace function public.enforce_current_tenant_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_tenant uuid := public.current_tenant_id();
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se puede cambiar la empresa propietaria del registro'
      using errcode = '42501';
  end if;

  if auth.uid() is not null then
    if v_current_tenant is null then
      raise exception 'El perfil autenticado no tiene una empresa activa'
        using errcode = '42501';
    end if;

    if new.tenant_id is null then
      new.tenant_id := v_current_tenant;
    elsif new.tenant_id is distinct from v_current_tenant then
      raise exception 'No se puede operar sobre otra empresa'
        using errcode = '42501';
    end if;
  end if;

  if new.tenant_id is null then
    raise exception 'tenant_id es obligatorio para registros comerciales';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_parent_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_parent_tenant uuid;
  v_current_tenant uuid := public.current_tenant_id();
begin
  v_parent_id := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;
  if v_parent_id is null then
    raise exception 'La referencia padre % es obligatoria', tg_argv[1];
  end if;

  execute format(
    'select tenant_id from public.%I where id = $1',
    tg_argv[0]
  ) into v_parent_tenant using v_parent_id;

  if not found or v_parent_tenant is null then
    raise exception 'No existe un padre válido para el registro comercial';
  end if;

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se puede cambiar la empresa propietaria del registro'
      using errcode = '42501';
  end if;

  if new.tenant_id is not null and new.tenant_id is distinct from v_parent_tenant then
    raise exception 'La empresa del registro no coincide con su padre'
      using errcode = '23514';
  end if;

  if auth.uid() is not null then
    if v_current_tenant is null
      or v_parent_tenant is distinct from v_current_tenant then
      raise exception 'No se puede operar sobre otra empresa'
        using errcode = '42501';
    end if;
  end if;

  new.tenant_id := v_parent_tenant;
  return new;
end;
$$;

revoke all on function public.enforce_current_tenant_row() from public, anon, authenticated;
revoke all on function public.enforce_parent_tenant() from public, anon, authenticated;

do $phase3_direct_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clientes', 'client_pickup_requests', 'sales_activities', 'quotations',
    'agents', 'agent_quotes'
  ] loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_table);
    execute format(
      'create trigger tenant_guard before insert or update on public.%I '
      'for each row execute function public.enforce_current_tenant_row()',
      v_table
    );
  end loop;
end
$phase3_direct_triggers$;

do $phase3_parent_triggers$
declare
  v_record record;
begin
  for v_record in
    select * from (values
      ('client_addresses', 'clientes', 'cliente_id'),
      ('client_notes', 'clientes', 'cliente_id'),
      ('client_rates', 'clientes', 'cliente_id'),
      ('cliente_history', 'clientes', 'cliente_id'),
      ('quotation_containers', 'quotations', 'quotation_id'),
      ('quotation_cargo_lines', 'quotations', 'quotation_id'),
      ('quotation_status_history', 'quotations', 'quotation_id'),
      ('quotation_change_logs', 'quotations', 'quotation_id'),
      ('pricing_items', 'quotations', 'quotation_id'),
      ('agent_route_rates', 'agents', 'agent_id'),
      ('agent_quote_container_rates', 'agent_quotes', 'agent_quote_id'),
      ('quotation_options', 'quotations', 'quotation_id'),
      ('quotation_option_items', 'quotation_options', 'quotation_option_id')
    ) as mappings(child_table, parent_table, parent_column)
  loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_record.child_table);
    execute format(
      'create trigger tenant_guard before insert or update on public.%I '
      'for each row execute function public.enforce_parent_tenant(%L, %L)',
      v_record.child_table,
      v_record.parent_table,
      v_record.parent_column
    );
  end loop;
end
$phase3_parent_triggers$;

comment on function public.enforce_current_tenant_row() is
  'Asigna tenant desde el perfil activo y bloquea mutaciones cross-tenant, incluidas RPC security definer.';
comment on function public.enforce_parent_tenant() is
  'Hereda tenant del padre canónico y bloquea referencias o mutaciones entre empresas.';

-- Helpers de autorización existentes, ahora limitados al tenant autenticado.
create or replace function public.can_insert_cliente()
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
      and p.tenant_id = public.current_tenant_id()
      and p.tenant_id is not null
      and p.is_active is true
      and p.status = 'Aprobado'
      and p.rol in ('Admin', 'Ventas')
  )
$$;

create or replace function public.can_select_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_cliente_id is null then false
    when not public.is_approved_active_user() then false
    when public.current_tenant_id() is null then false
    when public.is_role(array['Admin', 'Ventas', 'Pricing']) then exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
        and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
    )
    when public.is_role(array['Operaciones']) then exists (
      select 1
      from public.clientes c
      join public.quotations q
        on q.cliente_id = c.id and q.tenant_id = c.tenant_id
      join public.shipping_instructions si on si.quotation_id = q.id
      where c.id = p_cliente_id
        and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
        and q.deleted_at is null
    )
    when public.is_role(array['Contabilidad']) then exists (
      select 1
      from public.clientes c
      join public.quotations q
        on q.cliente_id = c.id and q.tenant_id = c.tenant_id
      left join public.shipping_instructions si on si.quotation_id = q.id
      where c.id = p_cliente_id
        and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
        and q.deleted_at is null
        and (q.status = 'Ganada' or si.id is not null)
    )
    else false
  end
$$;

create or replace function public.can_update_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
        and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
    )
$$;

create or replace function public.can_delete_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and public.is_admin()
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
        and c.tenant_id = public.current_tenant_id()
    )
$$;

create or replace function public.can_select_quotation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_quotation_id is null then false
    when not public.is_approved_active_user() then false
    when public.current_tenant_id() is null then false
    when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
    )
    when public.is_role(array['Operaciones']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
        and exists (
          select 1 from public.shipping_instructions si
          where si.quotation_id = q.id
        )
    )
    when public.is_role(array['Contabilidad']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
        and (
          q.status = 'Ganada'
          or exists (
            select 1 from public.shipping_instructions si
            where si.quotation_id = q.id
          )
        )
    )
    else false
  end
$$;

create or replace function public.can_select_quotation_row(
  p_quotation_id uuid,
  p_status text,
  p_deleted_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_quotation_id is null or p_deleted_at is not null then false
    when not public.is_approved_active_user() then false
    when not exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
    ) then false
    when public.is_role(array['Admin', 'Pricing', 'Ventas']) then true
    when public.is_role(array['Operaciones']) then exists (
      select 1 from public.shipping_instructions si
      where si.quotation_id = p_quotation_id
    )
    when public.is_role(array['Contabilidad']) then (
      p_status = 'Ganada'
      or exists (
        select 1 from public.shipping_instructions si
        where si.quotation_id = p_quotation_id
      )
    )
    else false
  end
$$;

create or replace function public.can_update_quotation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_quotation_id is null then false
    when not public.is_approved_active_user() then false
    when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
    )
    when public.is_role(array['Contabilidad']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
    else false
  end
$$;

create or replace function public.can_delete_quotation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and public.is_admin()
    and exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id
        and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
    )
$$;

-- Clientes y CRM.
drop policy if exists clientes_select_policy on public.clientes;
drop policy if exists clientes_insert_policy on public.clientes;
drop policy if exists clientes_update_policy on public.clientes;
drop policy if exists clientes_delete_policy on public.clientes;
create policy clientes_select_policy on public.clientes for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_cliente(id));
create policy clientes_insert_policy on public.clientes for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_insert_cliente());
create policy clientes_update_policy on public.clientes for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_update_cliente(id))
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and (
      public.is_admin()
      or (public.is_role(array['Ventas']) and deleted_at is null)
    )
  );
create policy clientes_delete_policy on public.clientes for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_delete_cliente(id));

drop policy if exists client_addresses_admin_all on public.client_addresses;
drop policy if exists client_addresses_cliente_all on public.client_addresses;
create policy client_addresses_admin_all on public.client_addresses
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_admin()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_admin()
  );
create policy client_addresses_cliente_all on public.client_addresses
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_cliente()
    and cliente_id = public.current_user_cliente_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_cliente()
    and cliente_id = public.current_user_cliente_id()
  );

drop policy if exists client_notes_select_policy on public.client_notes;
drop policy if exists client_notes_insert_policy on public.client_notes;
drop policy if exists client_notes_update_policy on public.client_notes;
drop policy if exists client_notes_delete_policy on public.client_notes;
create policy client_notes_select_policy on public.client_notes for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_cliente(cliente_id));
create policy client_notes_insert_policy on public.client_notes for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.can_select_cliente(cliente_id)
    and created_by = auth.uid()
  );
create policy client_notes_update_policy on public.client_notes for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy client_notes_delete_policy on public.client_notes for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists client_rates_select_policy on public.client_rates;
drop policy if exists client_rates_insert_policy on public.client_rates;
drop policy if exists client_rates_update_policy on public.client_rates;
drop policy if exists client_rates_delete_policy on public.client_rates;
create policy client_rates_select_policy on public.client_rates for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_approved_active_user());
create policy client_rates_insert_policy on public.client_rates for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user());
create policy client_rates_update_policy on public.client_rates for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_approved_active_user())
  with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user());
create policy client_rates_delete_policy on public.client_rates for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_approved_active_user());

drop policy if exists cliente_history_select_sales on public.cliente_history;
drop policy if exists cliente_history_insert_sales on public.cliente_history;
create policy cliente_history_select_sales on public.cliente_history for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
  );
create policy cliente_history_insert_sales on public.cliente_history for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
    and changed_by = auth.uid()
  );

drop policy if exists cliente_insert_pickup on public.client_pickup_requests;
drop policy if exists cliente_select_pickup on public.client_pickup_requests;
drop policy if exists staff_update_pickup on public.client_pickup_requests;
create policy cliente_insert_pickup on public.client_pickup_requests for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and profile_id = auth.uid()
  );
create policy cliente_select_pickup on public.client_pickup_requests for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_admin_or_operations())
  );
create policy staff_update_pickup on public.client_pickup_requests for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin_or_operations())
  with check (tenant_id = public.current_tenant_id() and public.is_admin_or_operations());

drop policy if exists sales_activities_select on public.sales_activities;
drop policy if exists sales_activities_insert on public.sales_activities;
drop policy if exists sales_activities_update on public.sales_activities;
create policy sales_activities_select on public.sales_activities for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and deleted_at is null
    and public.is_approved_active_user()
    and (public.is_role(array['Admin', 'Ventas']) or created_by = auth.uid())
  );
create policy sales_activities_insert on public.sales_activities for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
  );
create policy sales_activities_update on public.sales_activities for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and deleted_at is null
    and public.is_approved_active_user()
    and (
      public.is_admin()
      or (public.is_role(array['Ventas']) and created_by = auth.uid())
    )
  )
  with check (tenant_id = public.current_tenant_id());

-- Agentes y tarifas de agente.
drop policy if exists agents_select_internal on public.agents;
drop policy if exists agents_insert_pricing on public.agents;
drop policy if exists agents_update_pricing on public.agents;
drop policy if exists agents_delete_pricing on public.agents;
create policy agents_select_internal on public.agents for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
  );
create policy agents_insert_pricing on public.agents for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs());
create policy agents_update_pricing on public.agents for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs())
  with check (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs());
create policy agents_delete_pricing on public.agents for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs());

drop policy if exists agent_route_rates_select_policy on public.agent_route_rates;
drop policy if exists agent_route_rates_insert_policy on public.agent_route_rates;
drop policy if exists agent_route_rates_update_policy on public.agent_route_rates;
drop policy if exists agent_route_rates_delete_policy on public.agent_route_rates;
create policy agent_route_rates_select_policy on public.agent_route_rates for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
  );
create policy agent_route_rates_insert_policy on public.agent_route_rates for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs());
create policy agent_route_rates_update_policy on public.agent_route_rates for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs())
  with check (tenant_id = public.current_tenant_id() and public.can_manage_pricing_catalogs());
create policy agent_route_rates_delete_policy on public.agent_route_rates for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- Cotizaciones y líneas canónicas.
drop policy if exists quotations_select_policy on public.quotations;
drop policy if exists quotations_insert_policy on public.quotations;
drop policy if exists quotations_update_policy on public.quotations;
drop policy if exists quotations_delete_policy on public.quotations;
create policy quotations_select_policy on public.quotations for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.can_select_quotation_row(id, status, deleted_at)
  );
create policy quotations_insert_policy on public.quotations for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and created_by = auth.uid()
    and public.is_role(array['Admin', 'Ventas'])
  );
create policy quotations_update_policy on public.quotations for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_update_quotation(id))
  with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user());
create policy quotations_delete_policy on public.quotations for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_delete_quotation(id));

drop policy if exists quotation_containers_select_policy on public.quotation_containers;
drop policy if exists quotation_containers_insert_policy on public.quotation_containers;
drop policy if exists quotation_containers_update_policy on public.quotation_containers;
drop policy if exists quotation_containers_delete_policy on public.quotation_containers;
create policy quotation_containers_select_policy on public.quotation_containers for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_containers_insert_policy on public.quotation_containers for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_containers_update_policy on public.quotation_containers for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id))
  with check (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_containers_delete_policy on public.quotation_containers for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or public.can_select_quotation(quotation_id))
  );

drop policy if exists quotation_cargo_lines_select_policy on public.quotation_cargo_lines;
drop policy if exists quotation_cargo_lines_insert_policy on public.quotation_cargo_lines;
drop policy if exists quotation_cargo_lines_update_policy on public.quotation_cargo_lines;
drop policy if exists quotation_cargo_lines_delete_policy on public.quotation_cargo_lines;
create policy quotation_cargo_lines_select_policy on public.quotation_cargo_lines for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_cargo_lines_insert_policy on public.quotation_cargo_lines for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_cargo_lines_update_policy on public.quotation_cargo_lines for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id))
  with check (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));
create policy quotation_cargo_lines_delete_policy on public.quotation_cargo_lines for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or public.can_select_quotation(quotation_id))
  );

drop policy if exists quotation_status_history_select_policy on public.quotation_status_history;
drop policy if exists quotation_status_history_insert_policy on public.quotation_status_history;
create policy quotation_status_history_select_policy on public.quotation_status_history for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_role(array['Admin'])
      or changed_by = auth.uid()
      or public.can_select_quotation(quotation_id)
    )
  );
create policy quotation_status_history_insert_policy on public.quotation_status_history for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and changed_by = auth.uid()
    and public.can_select_quotation(quotation_id)
  );

drop policy if exists quotation_change_logs_select_policy on public.quotation_change_logs;
drop policy if exists quotation_change_logs_insert_policy on public.quotation_change_logs;
create policy quotation_change_logs_select_policy on public.quotation_change_logs for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_role(array['Admin'])
      or changed_by = auth.uid()
      or public.can_select_quotation(quotation_id)
    )
  );
create policy quotation_change_logs_insert_policy on public.quotation_change_logs for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and changed_by = auth.uid()
    and public.can_select_quotation(quotation_id)
  );

drop policy if exists pricing_items_select_policy on public.pricing_items;
drop policy if exists pricing_items_insert_policy on public.pricing_items;
drop policy if exists pricing_items_update_policy on public.pricing_items;
drop policy if exists pricing_items_delete_policy on public.pricing_items;
create policy pricing_items_select_policy on public.pricing_items for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy pricing_items_insert_policy on public.pricing_items for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy pricing_items_update_policy on public.pricing_items for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy pricing_items_delete_policy on public.pricing_items for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_role(array['Admin', 'Pricing', 'Ventas', 'Operaciones'])
    and public.can_select_quotation(quotation_id)
  );

drop policy if exists agent_quotes_select_policy on public.agent_quotes;
drop policy if exists agent_quotes_insert_policy on public.agent_quotes;
drop policy if exists agent_quotes_update_policy on public.agent_quotes;
drop policy if exists agent_quotes_delete_policy on public.agent_quotes;
create policy agent_quotes_select_policy on public.agent_quotes for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy agent_quotes_insert_policy on public.agent_quotes for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy agent_quotes_update_policy on public.agent_quotes for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_approved_active_user()
    and public.can_select_quotation(quotation_id)
  );
create policy agent_quotes_delete_policy on public.agent_quotes for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists agent_quote_container_rates_select_policy on public.agent_quote_container_rates;
drop policy if exists agent_quote_container_rates_insert_policy on public.agent_quote_container_rates;
drop policy if exists agent_quote_container_rates_update_policy on public.agent_quote_container_rates;
drop policy if exists agent_quote_container_rates_delete_policy on public.agent_quote_container_rates;
create policy agent_quote_container_rates_select_policy on public.agent_quote_container_rates for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.agent_quotes aq
      where aq.id = agent_quote_id
        and aq.tenant_id = public.current_tenant_id()
        and public.can_select_quotation(aq.quotation_id)
    )
  );
create policy agent_quote_container_rates_insert_policy on public.agent_quote_container_rates for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.agent_quotes aq
      where aq.id = agent_quote_id
        and aq.tenant_id = public.current_tenant_id()
        and public.can_select_quotation(aq.quotation_id)
    )
  );
create policy agent_quote_container_rates_update_policy on public.agent_quote_container_rates for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.agent_quotes aq
      where aq.id = agent_quote_id
        and aq.tenant_id = public.current_tenant_id()
        and public.can_select_quotation(aq.quotation_id)
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.agent_quotes aq
      where aq.id = agent_quote_id
        and aq.tenant_id = public.current_tenant_id()
        and public.can_select_quotation(aq.quotation_id)
    )
  );
create policy agent_quote_container_rates_delete_policy on public.agent_quote_container_rates for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_admin()
      or exists (
        select 1 from public.agent_quotes aq
        where aq.id = agent_quote_id
          and aq.tenant_id = public.current_tenant_id()
          and public.can_select_quotation(aq.quotation_id)
      )
    )
  );

drop policy if exists quotation_options_select_policy on public.quotation_options;
create policy quotation_options_select_policy on public.quotation_options for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.can_select_quotation(quotation_id));

drop policy if exists quotation_option_items_select_policy on public.quotation_option_items;
create policy quotation_option_items_select_policy on public.quotation_option_items for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.quotation_options qo
      where qo.id = quotation_option_id
        and qo.tenant_id = public.current_tenant_id()
        and public.can_select_quotation(qo.quotation_id)
    )
  );

comment on column public.clientes.tenant_id is 'Empresa propietaria del cliente.';
comment on column public.quotations.tenant_id is 'Empresa propietaria de la cotización y su flujo comercial.';
comment on column public.agents.tenant_id is 'Empresa propietaria del agente y sus tarifas.';
