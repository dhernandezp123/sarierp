-- AUD-01: consultar una cotizacion no autoriza a modificar sus precios.
-- Las RPC de seleccion/aceptacion siguen siendo las operaciones atomicas
-- canonicas. No se reescriben snapshots, datos historicos ni documentos.

create or replace function public.can_write_quotation_pricing(p_quotation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_approved_active_user() and exists (
    select 1 from public.quotations q
    where q.id = p_quotation_id
      and q.tenant_id = public.current_tenant_id()
      and q.deleted_at is null
      and (
        (public.is_role(array['Admin', 'Pricing'])
          and q.status in ('Borrador', 'Pendiente de Fijar Precios', 'Pricing Aprobado'))
        or (public.is_role(array['Ventas'])
          and q.service_product in ('miami_lcl', 'miami_air')
          -- El editor comercial tambien permite corregir una propuesta Miami
          -- enviada. Las opciones ofrecidas conservan su snapshot independiente.
          and q.status in ('Borrador', 'Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente')
          and (q.created_by = auth.uid() or exists (
            select 1 from public.clientes c
            where c.id = q.cliente_id and c.tenant_id = q.tenant_id
              and c.deleted_at is null and c.vendedor_asignado = auth.uid()
          )))
      )
  )
$$;

create or replace function public.can_write_agent_quote(p_agent_quote_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_pricing_catalogs() and exists (
    select 1 from public.agent_quotes aq
    join public.quotations q on q.id = aq.quotation_id and q.tenant_id = aq.tenant_id
    where aq.id = p_agent_quote_id and aq.tenant_id = public.current_tenant_id()
      and aq.deleted_at is null and q.deleted_at is null
      and q.status = 'Pendiente de Fijar Precios'
  )
$$;

create or replace function public.can_manage_client_rates(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_approved_active_user()
    and public.is_role(array['Admin', 'Pricing', 'Ventas'])
    and exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
    )
$$;

revoke all on function public.can_write_quotation_pricing(uuid),
  public.can_write_agent_quote(uuid), public.can_manage_client_rates(uuid)
  from public, anon;
grant execute on function public.can_write_quotation_pricing(uuid),
  public.can_write_agent_quote(uuid), public.can_manage_client_rates(uuid)
  to authenticated, service_role;

-- Guards restrictivos: no amplian las policies existentes, incluidas las de
-- borrado. SELECT conserva su politica y el aislamiento tenant sigue vigente.
create policy pricing_items_write_insert_guard on public.pricing_items
  as restrictive for insert to authenticated
  with check (public.can_write_quotation_pricing(quotation_id));
create policy pricing_items_write_update_guard on public.pricing_items
  as restrictive for update to authenticated
  using (public.can_write_quotation_pricing(quotation_id))
  with check (public.can_write_quotation_pricing(quotation_id));
create policy pricing_items_write_delete_guard on public.pricing_items
  as restrictive for delete to authenticated
  using (public.can_write_quotation_pricing(quotation_id));

create policy agent_quotes_write_insert_guard on public.agent_quotes
  as restrictive for insert to authenticated
  with check (
    public.can_manage_pricing_catalogs() and exists (
      select 1 from public.quotations q
      where q.id = quotation_id and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null and q.status = 'Pendiente de Fijar Precios'
    )
  );
create policy agent_quotes_write_update_guard on public.agent_quotes
  as restrictive for update to authenticated
  using (public.can_write_agent_quote(id))
  with check (
    public.can_manage_pricing_catalogs() and exists (
      select 1 from public.quotations q
      where q.id = quotation_id and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null and q.status = 'Pendiente de Fijar Precios'
    )
  );
create policy agent_quotes_write_delete_guard on public.agent_quotes
  as restrictive for delete to authenticated
  using (public.can_write_agent_quote(id));

create policy agent_container_rates_write_insert_guard on public.agent_quote_container_rates
  as restrictive for insert to authenticated
  with check (public.can_write_agent_quote(agent_quote_id));
create policy agent_container_rates_write_update_guard on public.agent_quote_container_rates
  as restrictive for update to authenticated
  using (public.can_write_agent_quote(agent_quote_id))
  with check (public.can_write_agent_quote(agent_quote_id));
create policy agent_container_rates_write_delete_guard on public.agent_quote_container_rates
  as restrictive for delete to authenticated
  using (public.can_write_agent_quote(agent_quote_id));

create policy client_rates_write_insert_guard on public.client_rates
  as restrictive for insert to authenticated
  with check (public.can_manage_client_rates(cliente_id));
create policy client_rates_write_update_guard on public.client_rates
  as restrictive for update to authenticated
  using (public.can_manage_client_rates(cliente_id))
  with check (public.can_manage_client_rates(cliente_id));
create policy client_rates_write_delete_guard on public.client_rates
  as restrictive for delete to authenticated
  using (public.can_manage_client_rates(cliente_id));

-- Impide cambiar is_selected directamente aunque el usuario gestione tarifas.
-- INVOKER es deliberado: authenticated no puede adoptar el rol propietario de
-- una RPC SECURITY DEFINER. Seleccion/aceptacion validadas por esas RPC pueden
-- modificar el flag y el pricing juntos; un GUC del cliente no da excepciones.
create or replace function public.guard_direct_agent_quote_selection()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' then
    if (tg_op = 'INSERT' and new.is_selected is true)
      or (tg_op = 'UPDATE' and (
        new.is_selected is distinct from old.is_selected
        or new.quotation_id is distinct from old.quotation_id
      )) then
      raise exception 'Selecciona la tarifa mediante el flujo atomico de pricing'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_direct_agent_quote_selection() from public, anon, authenticated;
create trigger guard_direct_agent_quote_selection_trigger
before insert or update on public.agent_quotes
for each row execute function public.guard_direct_agent_quote_selection();

-- Estas RPC eran SECURITY DEFINER y podian saltarse RLS. Los cuerpos ya
-- probados se conservan privados; los entrypoints validan escritura bajo lock.
alter function public.replace_quotation_child_lines(uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb)
  rename to replace_quotation_child_lines_aud01_internal;
revoke all on function public.replace_quotation_child_lines_aud01_internal(uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb)
  from public, anon, authenticated, service_role;

create function public.replace_quotation_child_lines(
  p_quotation_id uuid,
  p_replace_containers boolean default false,
  p_container_lines jsonb default '[]'::jsonb,
  p_replace_cargo boolean default false,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_replace_pricing boolean default false,
  p_pricing_items jsonb default '[]'::jsonb
)
returns table (quotation_id uuid, containers_count integer, cargo_lines_count integer, pricing_items_count integer)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_select_quotation(p_quotation_id) then
    raise exception 'No tienes acceso al detalle de la cotizacion' using errcode = '42501';
  end if;
  perform 1 from public.quotations q
    where q.id = p_quotation_id and q.tenant_id = public.current_tenant_id()
      and q.deleted_at is null for update;
  if not found then
    raise exception 'Cotizacion no disponible' using errcode = '42501';
  end if;
  if p_replace_pricing and not public.can_write_quotation_pricing(p_quotation_id) then
    raise exception 'No tienes permiso para reemplazar el pricing de esta cotizacion' using errcode = '42501';
  end if;
  return query select * from public.replace_quotation_child_lines_aud01_internal(
    p_quotation_id, p_replace_containers, p_container_lines, p_replace_cargo,
    p_cargo_lines, p_replace_pricing, p_pricing_items);
end;
$$;

alter function public.replace_client_rates(uuid, text, jsonb, jsonb, jsonb)
  rename to replace_client_rates_aud01_internal;
revoke all on function public.replace_client_rates_aud01_internal(uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
create function public.replace_client_rates(
  p_cliente_id uuid,
  p_destination text,
  p_destination_rate_codes jsonb default '[]'::jsonb,
  p_global_rate_codes jsonb default '[]'::jsonb,
  p_rows jsonb default '[]'::jsonb
)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_client_rates(p_cliente_id) then
    raise exception 'No tienes permiso para modificar tarifas del cliente' using errcode = '42501';
  end if;
  perform 1 from public.clientes c
    where c.id = p_cliente_id and c.tenant_id = public.current_tenant_id()
      and c.deleted_at is null for update;
  if not found or not public.can_manage_client_rates(p_cliente_id) then
    raise exception 'Cliente no disponible' using errcode = '42501';
  end if;
  return public.replace_client_rates_aud01_internal(p_cliente_id, p_destination,
    p_destination_rate_codes, p_global_rate_codes, p_rows);
end;
$$;

alter function public.create_quotation_with_child_lines(jsonb, jsonb, jsonb, jsonb)
  rename to create_quotation_with_child_lines_aud01_internal;
revoke all on function public.create_quotation_with_child_lines_aud01_internal(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
create function public.create_quotation_with_child_lines(
  p_quotation_data jsonb,
  p_container_lines jsonb default '[]'::jsonb,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_pricing_items jsonb default '[]'::jsonb
)
returns table (id uuid, quotation_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_initial_status text;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para crear cotizaciones' using errcode = '42501';
  end if;
  if p_quotation_data is null or jsonb_typeof(p_quotation_data) <> 'object' then
    raise exception 'Los datos de la cotizacion deben ser un objeto' using errcode = '23514';
  end if;
  v_initial_status := coalesce(nullif(p_quotation_data->>'status', ''), 'Borrador');
  if v_initial_status not in ('Borrador', 'Pendiente de Fijar Precios', 'Pricing Aprobado')
    or (v_initial_status = 'Pricing Aprobado'
      and coalesce(p_quotation_data->>'service_product', '') not in ('miami_lcl', 'miami_air')) then
    raise exception 'Estado inicial no permitido para este producto' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_pricing_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Los cargos de pricing deben ser un arreglo' using errcode = '23514';
  end if;
  if public.is_role(array['Ventas'])
    and jsonb_array_length(coalesce(p_pricing_items, '[]'::jsonb)) > 0
    and coalesce(p_quotation_data->>'service_product', '') not in ('miami_lcl', 'miami_air') then
    raise exception 'Ventas solo puede crear cargos automaticos de Miami' using errcode = '42501';
  end if;
  return query select * from public.create_quotation_with_child_lines_aud01_internal(
    p_quotation_data || jsonb_build_object('status', v_initial_status),
    p_container_lines, p_cargo_lines, p_pricing_items);
end;
$$;

revoke all on function public.replace_quotation_child_lines(uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb),
  public.replace_client_rates(uuid, text, jsonb, jsonb, jsonb),
  public.create_quotation_with_child_lines(jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_quotation_child_lines(uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb),
  public.replace_client_rates(uuid, text, jsonb, jsonb, jsonb),
  public.create_quotation_with_child_lines(jsonb, jsonb, jsonb, jsonb)
  to authenticated;

-- El checker de vencimientos no necesita abrir escritura de tarifas cerradas.
-- Se reserva y notifica dentro de una transaccion por tenant, sin enviar correo.
create function public.notify_expired_agent_quotes_for_current_tenant()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_quote record;
  v_notified integer := 0;
  v_recipients integer;
begin
  if v_tenant is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para procesar avisos de tarifas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p
    where p.tenant_id = v_tenant and p.rol = 'Pricing'
      and p.is_active is true and p.status = 'Aprobado') then
    return 0;
  end if;
  for v_quote in
    select aq.id, aq.valid_until, q.quotation_number
    from public.agent_quotes aq
    join public.quotations q on q.id = aq.quotation_id and q.tenant_id = aq.tenant_id
    where aq.tenant_id = v_tenant and q.deleted_at is null and aq.deleted_at is null
      and aq.is_selected is true and aq.valid_until < current_date
      and aq.expiry_notified_at is null
      and q.status in ('Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente', 'Ganada')
    order by aq.id for update of aq skip locked
  loop
    insert into public.notifications (tenant_id, user_id, title, message, type)
    select v_tenant, p.id, 'Tarifa vencida en cotización activa',
      'La tarifa seleccionada de la cotización ' || coalesce(v_quote.quotation_number, v_quote.id::text)
        || ' venció el ' || to_char(v_quote.valid_until, 'DD/MM/YYYY')
        || '. Actualizar antes de aprobar.', 'warning'
    from public.profiles p where p.tenant_id = v_tenant and p.rol = 'Pricing'
      and p.is_active is true and p.status = 'Aprobado';
    get diagnostics v_recipients = row_count;
    if v_recipients > 0 then
      update public.agent_quotes set expiry_notified_at = now() where id = v_quote.id and tenant_id = v_tenant;
      v_notified := v_notified + 1;
    end if;
  end loop;
  return v_notified;
end;
$$;
revoke all on function public.notify_expired_agent_quotes_for_current_tenant() from public, anon;
grant execute on function public.notify_expired_agent_quotes_for_current_tenant() to authenticated;

comment on function public.can_write_quotation_pricing(uuid) is
  'AUD-01: Admin/Pricing en estados editables; Ventas solo cargos Miami propios/asignados, incluido el editor comercial enviado.';
comment on function public.can_manage_client_rates(uuid) is
  'AUD-01: Admin/Pricing/Ventas administran tarifas del cliente; los demas roles conservan consulta.';

notify pgrst, 'reload schema';
