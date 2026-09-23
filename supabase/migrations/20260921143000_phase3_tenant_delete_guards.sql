-- Fase 3: los guards también protegen DELETE ejecutados dentro de funciones
-- SECURITY DEFINER, donde las policies RLS del invocador no son suficientes.

create or replace function public.enforce_current_tenant_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_tenant uuid := public.current_tenant_id();
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and (
      v_current_tenant is null
      or old.tenant_id is distinct from v_current_tenant
    ) then
      raise exception 'No se puede operar sobre otra empresa'
        using errcode = '42501';
    end if;
    return old;
  end if;

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
  if tg_op = 'DELETE' then
    if auth.uid() is not null and (
      v_current_tenant is null
      or old.tenant_id is distinct from v_current_tenant
    ) then
      raise exception 'No se puede operar sobre otra empresa'
        using errcode = '42501';
    end if;
    return old;
  end if;

  v_parent_id := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;
  if v_parent_id is null then
    raise exception 'La referencia padre % es obligatoria', tg_argv[1];
  end if;

  execute format(
    'select tenant_id from public.%I where id = $1',
    tg_argv[0]
  ) into v_parent_tenant using v_parent_id;

  if v_parent_tenant is null then
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

revoke all on function public.enforce_current_tenant_row()
  from public, anon, authenticated;
revoke all on function public.enforce_parent_tenant()
  from public, anon, authenticated;

do $phase3_direct_delete_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clientes', 'client_pickup_requests', 'sales_activities', 'quotations',
    'agents', 'agent_quotes'
  ] loop
    execute format('drop trigger tenant_guard on public.%I', v_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_current_tenant_row()',
      v_table
    );
  end loop;
end
$phase3_direct_delete_triggers$;

do $phase3_parent_delete_triggers$
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
    execute format('drop trigger tenant_guard on public.%I', v_record.child_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_parent_tenant(%L, %L)',
      v_record.child_table,
      v_record.parent_table,
      v_record.parent_column
    );
  end loop;
end
$phase3_parent_delete_triggers$;
