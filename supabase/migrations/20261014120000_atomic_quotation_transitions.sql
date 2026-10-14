-- AUD-05: transitions, revision and audit belong to the same transaction.
-- Historical states/rows are preserved; they are not new transition targets.
alter table public.quotations
  add column status_revision bigint not null default 0,
  add column repricing_return_status text;
alter table public.quotations alter column status set default 'Borrador';
alter table public.quotation_status_history add column status_revision bigint;
alter table public.quotation_change_logs add column status_revision bigint;
create unique index quotation_status_history_revision_key
  on public.quotation_status_history(quotation_id, status_revision)
  where status_revision is not null;

create function public.quotation_transition_allowed(p_old text, p_new text, p_return text default null)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(case p_old
    when 'Borrador' then p_new = 'Pendiente de Fijar Precios'
    when 'Pendiente de Fijar Precios' then p_new in ('Pricing Aprobado', 'Perdida')
      or (p_new = 'Ganada' and p_return = 'Ganada')
    when 'Pricing Aprobado' then p_new in ('Enviada al Cliente', 'Pendiente de Fijar Precios')
    when 'Enviada al Cliente' then p_new in ('Ganada', 'Perdida', 'Pendiente de Fijar Precios')
    when 'Ganada' then p_new = 'Pendiente de Fijar Precios'
    else false end, false);
$$;

-- INVOKER deliberately: authenticated table writes cannot impersonate a
-- SECURITY DEFINER RPC. A client-set GUC is not an authorization mechanism.
create function public.guard_quotation_transition()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.status_revision := 0;
    new.repricing_return_status := null;
    return new;
  end if;
  v_changed := new.status is distinct from old.status
    or new.pricing_approved is distinct from old.pricing_approved
    or new.pricing_approved_at is distinct from old.pricing_approved_at
    or new.pricing_approved_by is distinct from old.pricing_approved_by;
  if current_user in ('authenticated', 'anon') and (
    v_changed or new.status_revision is distinct from old.status_revision
    or new.repricing_return_status is distinct from old.repricing_return_status
    or new.loss_reason is distinct from old.loss_reason
    or new.loss_reason_detail is distinct from old.loss_reason_detail
  ) then
    raise exception 'Usa la acción de transición y recarga la cotización' using errcode = '42501';
  end if;
  if not v_changed then
    new.status_revision := old.status_revision;
    return new;
  end if;
  if auth.uid() is not null then
    if not public.is_approved_active_user()
      or old.tenant_id is distinct from public.current_tenant_id()
      or not public.can_update_quotation(old.id)
      or not public.is_role(array['Admin', 'Pricing', 'Ventas']) then
      raise exception 'No tienes permiso para cambiar el estado' using errcode = '42501';
    end if;
    if (new.status = 'Pricing Aprobado'
        or (old.status = 'Pendiente de Fijar Precios' and new.status = 'Ganada')
        or (new.status = old.status and new.pricing_approved is true))
      and not public.is_role(array['Admin', 'Pricing']) then
      raise exception 'Solo Pricing puede aprobar precios' using errcode = '42501';
    end if;
    if new.status in ('Ganada', 'Perdida') and old.status <> 'Pendiente de Fijar Precios'
      and not public.is_role(array['Admin', 'Ventas']) then
      raise exception 'Solo Ventas puede registrar la respuesta del cliente' using errcode = '42501';
    end if;
    if new.status = 'Perdida' and not public.is_role(array['Admin', 'Ventas']) then
      raise exception 'Solo Ventas puede registrar la pérdida' using errcode = '42501';
    end if;
  end if;
  if new.status is distinct from old.status
    and not public.quotation_transition_allowed(old.status, new.status, old.repricing_return_status) then
    raise exception 'Transición no permitida: % a %', old.status, new.status using errcode = '23514';
  end if;
  new.status_revision := old.status_revision + 1;
  return new;
end;
$$;
create trigger a_guard_quotation_transition before insert or update on public.quotations
for each row execute function public.guard_quotation_transition();

create function public.audit_quotation_transition()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_notes text;
begin
  if new.status_revision = old.status_revision then return new; end if;
  if new.status = 'Perdida' then
    v_notes := 'Razón: ' || new.loss_reason || coalesce('. Detalle: ' || new.loss_reason_detail, '');
  elsif new.status = 'Pendiente de Fijar Precios' and old.status <> 'Borrador' then
    select 'Repricing: ' || l.reason into v_notes from public.quotation_change_logs l
      where l.quotation_id = new.id and l.status_revision = new.status_revision
        and l.change_type = 'quotation_reopened_for_repricing';
  end if;
  insert into public.quotation_status_history
    (tenant_id, quotation_id, old_status, new_status, changed_by, notes, status_revision)
  values (new.tenant_id, new.id, old.status, new.status, coalesce(auth.uid(), new.created_by),
    coalesce(v_notes, case when new.status = old.status then 'Pricing aprobado nuevamente' end), new.status_revision);
  return new;
end;
$$;
create trigger audit_quotation_transition after update on public.quotations
for each row execute function public.audit_quotation_transition();
-- History is generated by the creation/status triggers, never by a browser.
revoke insert, update, delete on public.quotation_status_history from authenticated, anon;
revoke all on function public.guard_quotation_transition(), public.audit_quotation_transition() from public, anon, authenticated;

-- The option publication RPC remains the canonical implementation. Only the
-- version-checked entry point below can call it after this migration.
alter function public.send_quotation_with_options(uuid) rename to send_quotation_with_options_aud05_internal;
revoke all on function public.send_quotation_with_options_aud05_internal(uuid) from public, anon, authenticated, service_role;

create function public.transition_quotation(
  p_quotation_id uuid, p_expected_status text, p_expected_revision bigint, p_new_status text,
  p_reason text default null, p_loss_reason text default null, p_loss_detail text default null,
  p_sync_operation boolean default false
)
returns public.quotations language plpgsql security definer set search_path = public as $$
declare
  v_old public.quotations%rowtype;
  v_result public.quotations%rowtype;
  v_approval boolean;
  v_reason text := nullif(btrim(p_reason), '');
  v_cost numeric; v_sale numeric; v_profit numeric; v_gp numeric;
  v_si record;
begin
  if auth.uid() is null or not public.is_approved_active_user()
    or not public.is_role(array['Admin', 'Pricing', 'Ventas']) then
    raise exception 'No tienes permiso para cambiar el estado' using errcode = '42501';
  end if;
  select q.* into v_old from public.quotations q
    where q.id = p_quotation_id and q.tenant_id = public.current_tenant_id()
      and q.deleted_at is null for update;
  if not found or not public.can_update_quotation(p_quotation_id) then
    raise exception 'Cotización no disponible' using errcode = '42501';
  end if;
  if p_expected_revision is null or v_old.status_revision <> p_expected_revision
    or v_old.status is distinct from p_expected_status then
    raise exception 'La cotización cambió. Recarga antes de continuar' using errcode = '40001';
  end if;
  v_approval := p_new_status = 'Pricing Aprobado'
    or (v_old.status = 'Pendiente de Fijar Precios' and p_new_status = 'Ganada');
  if not public.quotation_transition_allowed(v_old.status, p_new_status, v_old.repricing_return_status)
    and not (v_old.status = 'Pricing Aprobado' and p_new_status = v_old.status) then
    raise exception 'Transición no permitida: % a %', v_old.status, p_new_status using errcode = '23514';
  end if;
  if v_approval then
    if not public.is_role(array['Admin', 'Pricing']) then
      raise exception 'Solo Pricing puede aprobar precios' using errcode = '42501';
    end if;
    if p_new_status = 'Ganada' and exists (select 1 from public.quotation_options where quotation_id = p_quotation_id) then
      raise exception 'Ofrece las opciones y registra la elección del cliente' using errcode = '23514';
    end if;
    if coalesce(v_old.service_product, '') not in ('miami_lcl', 'miami_air') and not exists (
      select 1 from public.agent_quotes a where a.quotation_id = p_quotation_id
        and a.is_selected is true and a.deleted_at is null
        and a.valid_until is not null
        and coalesce(nullif(btrim(a.agente_nombre), ''), a.agent_id::text) is not null
        and (v_old.quote_type <> 'FCL' or nullif(btrim(a.carrier), '') is not null)
    ) then
      raise exception 'Selecciona una tarifa de agente con datos comerciales completos' using errcode = '23514';
    end if;
    if not exists (select 1 from public.pricing_items where quotation_id = p_quotation_id and deleted_at is null) then
      raise exception 'Agrega al menos una línea de venta' using errcode = '23514';
    end if;
    -- Same persisted net totals as Pricing Comparison; issued invoices and
    -- commercial option snapshots are not recalculated here.
    select sum(coalesce(pi.cost_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)),
           sum(coalesce(pi.sale_amount, 0) * coalesce(nullif(pi.quantity, 0), 1))
      into v_cost, v_sale from public.pricing_items pi
      where pi.quotation_id = p_quotation_id and pi.deleted_at is null;
    if v_sale is null or v_sale <= 0 or v_cost < 0
      or v_cost::text in ('NaN', 'Infinity', '-Infinity') or v_sale::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Totales comerciales inválidos' using errcode = '23514';
    end if;
    v_profit := v_sale - v_cost; v_gp := v_profit / v_sale * 100;
    if v_gp < 5 and v_reason is null then
      raise exception 'Justifica la aprobación con margen menor al 5%%' using errcode = '23514';
    end if;
  end if;
  if p_new_status = 'Perdida' then
    if p_loss_reason is null or p_loss_reason <> all(array[
      'Tarifa alta', 'Tiempo de respuesta (enviada tarde)', 'Cliente eligió otro proveedor',
      'Tiempo de tránsito no competitivo', 'Ruta o servicio no disponible', 'Condiciones de pago',
      'Cliente canceló o postergó el embarque', 'Sin respuesta del cliente', 'Otra'])
      or (p_loss_reason = 'Otra' and nullif(btrim(p_loss_detail), '') is null) then
      raise exception 'Selecciona una razón de pérdida y completa su detalle' using errcode = '23514';
    end if;
  end if;
  if p_new_status = 'Pendiente de Fijar Precios' and v_old.status <> 'Borrador' then
    if v_reason is null then raise exception 'Debes ingresar el motivo del repricing' using errcode = '23514'; end if;
    insert into public.quotation_change_logs(tenant_id, quotation_id, change_type, reason, changed_by, status_revision)
      values (v_old.tenant_id, p_quotation_id, 'quotation_reopened_for_repricing', v_reason, auth.uid(), v_old.status_revision + 1);
  end if;
  if p_sync_operation and not (v_old.status = 'Pendiente de Fijar Precios' and p_new_status = 'Ganada' and v_approval) then
    raise exception 'La sincronización requiere cerrar un repricing ganado' using errcode = '23514';
  end if;
  if p_new_status = 'Enviada al Cliente' and exists (select 1 from public.quotation_options where quotation_id = p_quotation_id) then
    perform public.send_quotation_with_options_aud05_internal(p_quotation_id);
  else
    update public.quotations set
      status = p_new_status,
      pricing_approved = case when v_approval then true when p_new_status = 'Pendiente de Fijar Precios' then false else pricing_approved end,
      pricing_approved_at = case when v_approval then clock_timestamp() when p_new_status = 'Pendiente de Fijar Precios' then null else pricing_approved_at end,
      pricing_approved_by = case when v_approval then auth.uid() when p_new_status = 'Pendiente de Fijar Precios' then null else pricing_approved_by end,
      repricing_return_status = case when p_new_status = 'Pendiente de Fijar Precios' and v_old.status = 'Ganada' then 'Ganada'
        when p_new_status = 'Ganada' then null else repricing_return_status end,
      loss_reason = case when p_new_status = 'Perdida' then p_loss_reason else loss_reason end,
      loss_reason_detail = case when p_new_status = 'Perdida' then nullif(btrim(p_loss_detail), '') else loss_reason_detail end,
      total_cost = case when v_approval then v_cost else total_cost end,
      total_sale = case when v_approval then v_sale else total_sale end,
      profit_amount = case when v_approval then v_profit else profit_amount end,
      gp_percentage = case when v_approval then v_gp else gp_percentage end
      where id = p_quotation_id;
  end if;
  if p_sync_operation then
    for v_si in select si.id from public.shipping_instructions si
      where si.quotation_id = p_quotation_id and si.deleted_at is null
        and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada') order by si.id
    loop
      perform public.sync_shipping_instruction_from_selected_agent_quote_v2(v_si.id, coalesce(v_reason, 'Repricing desde Pricing Comparison'));
    end loop;
  end if;
  insert into public.activity_logs(tenant_id, user_id, module, action, entity_type, entity_id, description, metadata)
    values (v_old.tenant_id, auth.uid(), 'quotations',
      case when p_new_status = 'Pendiente de Fijar Precios' and v_old.status <> 'Borrador' then 'quotation_reopened_for_repricing' else 'status_changed' end,
      'quotation', p_quotation_id, 'Estado actualizado de ' || v_old.status || ' a ' || p_new_status,
      jsonb_build_object('oldStatus', v_old.status, 'newStatus', p_new_status, 'reason', v_reason,
        'status_revision', v_old.status_revision + 1, 'sync_operation', p_sync_operation));
  select q.* into v_result from public.quotations q where q.id = p_quotation_id;
  return v_result;
end;
$$;
revoke all on function public.transition_quotation(uuid, text, bigint, text, text, text, text, boolean) from public, anon;
grant execute on function public.transition_quotation(uuid, text, bigint, text, text, text, text, boolean) to authenticated;

-- Canonical option publication and acceptance bodies, with audit delegated to the trigger.
create or replace function public.send_quotation_with_options_aud05_internal(p_quotation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.quotations%rowtype;
  v_count integer;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para enviar opciones comerciales'
      using errcode = '42501';
  end if;

  select q.* into v_quote
  from public.quotations q
  where q.id = p_quotation_id and q.deleted_at is null
  for update;

  if not found then raise exception 'La cotización no existe' using errcode = 'P0002'; end if;

  if v_quote.status <> 'Pricing Aprobado' then
    raise exception 'La cotización debe tener Pricing Aprobado antes de enviarse';
  end if;

  if exists (
    select 1
    from public.quotation_options qo
    where qo.quotation_id = p_quotation_id
      and qo.status = 'Borrador'
      and not exists (
        select 1 from public.quotation_option_items qoi
        where qoi.quotation_option_id = qo.id
      )
  ) then
    raise exception 'Todas las opciones deben tener líneas comerciales';
  end if;

  update public.quotation_options
  set status = 'Ofrecida', published_by = v_user_id,
      offered_at = coalesce(offered_at, now()), updated_at = now()
  where quotation_id = p_quotation_id and status = 'Borrador';

  get diagnostics v_count = row_count;

  if not exists (
    select 1 from public.quotation_options
    where quotation_id = p_quotation_id and status = 'Ofrecida'
  ) then
    raise exception 'Guarda al menos una opción comercial antes de enviar';
  end if;

  update public.quotations
  set status = 'Enviada al Cliente'
  where id = p_quotation_id;


  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'pricing', 'quotation_options_sent', 'quotation',
    p_quotation_id, 'Cotización enviada al cliente con opciones comerciales',
    jsonb_build_object('published_options', v_count)
  );

  return v_count;
end;
$$;

alter function public.finalize_quotation_option_selection(uuid, boolean) rename to finalize_quotation_option_selection_aud05_internal;
revoke all on function public.finalize_quotation_option_selection_aud05_internal(uuid, boolean) from public, anon, authenticated, service_role;
create or replace function public.finalize_quotation_option_selection_aud05_internal(
  p_option_id uuid,
  p_sync_operation boolean default false
)
returns table (
  quotation_id uuid,
  option_id uuid,
  option_code text,
  quotation_status text,
  synced_shipping_instructions integer,
  updated_bookings integer,
  skipped_bookings integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_option public.quotation_options%rowtype;
  v_quote public.quotations%rowtype;
  v_shipping_instruction record;
  v_sync record;
  v_synced_shipping_instructions integer := 0;
  v_updated_bookings integer := 0;
  v_skipped_bookings integer := 0;
begin
  if v_user_id is null
    or not public.is_approved_active_user()
    or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para registrar la opción elegida'
      using errcode = '42501';
  end if;

  select qo.*
  into v_option
  from public.quotation_options qo
  where qo.id = p_option_id
  for update;

  if not found then
    raise exception 'La opción no existe' using errcode = 'P0002';
  end if;

  select q.*
  into v_quote
  from public.quotations q
  where q.id = v_option.quotation_id
    and q.deleted_at is null
  for update;

  if not found or not public.can_select_quotation(v_option.quotation_id) then
    raise exception 'No tienes acceso a la cotización' using errcode = '42501';
  end if;

  if v_option.status <> 'Aceptada' then
    perform * from public.accept_quotation_option(p_option_id);

    select qo.*
    into v_option
    from public.quotation_options qo
    where qo.id = p_option_id;
  end if;

  if p_sync_operation then
    for v_shipping_instruction in
      select si.id
      from public.shipping_instructions si
      where si.quotation_id = v_option.quotation_id
        and si.deleted_at is null
        and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      order by si.created_at, si.id
    loop
      select *
      into v_sync
      from public.sync_shipping_instruction_from_selected_agent_quote_v2(
        v_shipping_instruction.id,
        'Opción comercial elegida por el cliente: ' || v_option.option_code
      );

      v_synced_shipping_instructions := v_synced_shipping_instructions + 1;
      v_updated_bookings := v_updated_bookings + coalesce(v_sync.updated_bookings, 0);
      v_skipped_bookings := v_skipped_bookings + coalesce(v_sync.skipped_count, 0);
    end loop;
  end if;

  if v_quote.status = 'Enviada al Cliente' then
    update public.quotations
    set status = 'Ganada'
    where id = v_option.quotation_id;

  elsif v_quote.status <> 'Ganada' then
    raise exception 'La cotización debe estar Enviada al Cliente antes de cerrar la elección';
  end if;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'quotations',
    case
      when p_sync_operation then 'quotation_option_finalized_with_operational_sync'
      else 'quotation_option_finalized_without_operational_sync'
    end,
    'quotation',
    v_option.quotation_id,
    case
      when p_sync_operation then
        'Opción elegida y propagada a operación: ' || v_option.option_code
      else
        'Opción elegida sin actualizar operación: ' || v_option.option_code
    end,
    jsonb_build_object(
      'quotation_option_id', v_option.id,
      'option_code', v_option.option_code,
      'agent_quote_id', v_option.agent_quote_id,
      'synced_shipping_instructions', v_synced_shipping_instructions,
      'updated_bookings', v_updated_bookings,
      'skipped_bookings', v_skipped_bookings
    )
  );

  return query select
    v_option.quotation_id,
    v_option.id,
    v_option.option_code,
    'Ganada'::text,
    v_synced_shipping_instructions,
    v_updated_bookings,
    v_skipped_bookings;
end;
$$;

-- Preserve the INVOKER editor and child-line RLS; only its status write uses the RPC.
drop function public.save_quotation_edit(uuid, text, jsonb, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean);
create or replace function public.save_quotation_edit(
  p_quotation_id uuid,
  p_expected_status text,
  p_quotation_data jsonb,
  p_replace_containers boolean default false,
  p_container_lines jsonb default '[]'::jsonb,
  p_replace_cargo boolean default false,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_replace_pricing boolean default false,
  p_pricing_items jsonb default '[]'::jsonb,
  p_send_to_pricing boolean default false,
  p_expected_revision bigint default null,
  p_repricing_reason text default null
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_old public.quotations%rowtype;
  v_new public.quotations%rowtype;
begin
  if auth.uid() is null or not public.can_update_quotation(p_quotation_id) then
    raise exception 'No tienes permiso para editar esta cotización' using errcode = '42501';
  end if;
  select q.* into v_old from public.quotations q
    where q.id = p_quotation_id and q.deleted_at is null for update;
  if not found then
    raise exception 'Cotización no disponible' using errcode = '42501';
  end if;
  if v_old.status is distinct from p_expected_status then
    raise exception 'La cotización cambió de estado. Recarga antes de guardar' using errcode = '40001';
  end if;
  if p_expected_revision is not null and v_old.status_revision <> p_expected_revision then
    raise exception 'Quotation changed. Reload before saving' using errcode = '40001';
  end if;
  if p_send_to_pricing and p_expected_revision is null then
    raise exception 'Reload before sending to Pricing' using errcode = '40001';
  end if;
  if p_quotation_data is null or jsonb_typeof(p_quotation_data) <> 'object' then
    raise exception 'Datos de cotización inválidos' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_quotation_data) k
    where k <> all(array['cliente_id', 'service_product', 'quote_type', 'valid_until', 'contact_name', 'contact_email', 'contact_phone', 'incoterm', 'tipo_transporte', 'origen', 'destino', 'puerto_origen', 'puerto_destino', 'pickup_address', 'delivery_address', 'preferred_carrier', 'transit_time', 'target_rate', 'container_type', 'package_type', 'package_details', 'peso_kg', 'peso_lbs', 'gross_weight', 'volumen_cbm', 'volumen_ft3', 'cantidad_bultos', 'commodity', 'requires_insurance', 'commercial_value', 'pricing_notes', 'observaciones', 'client_notes', 'total_cost', 'total_sale', 'profit_amount', 'gp_percentage'])) then
    raise exception 'El formulario contiene campos no editables' using errcode = '23514';
  end if;
  select * into v_new from jsonb_populate_record(v_old, p_quotation_data);
  if v_new.cliente_id is null or nullif(btrim(v_new.commodity), '') is null then
    raise exception 'Cliente y descripción de carga son requeridos' using errcode = '23514';
  end if;
  if p_send_to_pricing and (
    v_old.status not in ('Borrador', 'Pricing Aprobado', 'Enviada al Cliente')
    or nullif(btrim(v_new.tipo_transporte), '') is null
    or nullif(btrim(v_new.quote_type), '') is null
  ) then
    raise exception 'No se puede enviar a Pricing desde este estado o faltan datos de transporte' using errcode = '23514';
  end if;
  if p_replace_pricing and coalesce(v_new.service_product, '') not in ('miami_lcl', 'miami_air') then
    raise exception 'El editor solo puede reemplazar cargos automáticos Miami' using errcode = '23514';
  end if;
  if (v_new.quote_type in ('FCL', 'FTL') and p_replace_containers and jsonb_array_length(p_container_lines) = 0)
    or ((v_new.quote_type in ('LCL', 'LTL', 'Courier', 'Consolidado') or v_new.service_product in ('miami_lcl', 'miami_air'))
      and p_replace_cargo and jsonb_array_length(p_cargo_lines) = 0) then
    raise exception 'Agrega al menos una línea de carga o contenedor' using errcode = '23514';
  end if;
  update public.quotations q set
    cliente_id = v_new.cliente_id,
    service_product = v_new.service_product,
    quote_type = v_new.quote_type,
    valid_until = v_new.valid_until,
    contact_name = v_new.contact_name,
    contact_email = v_new.contact_email,
    contact_phone = v_new.contact_phone,
    incoterm = v_new.incoterm,
    tipo_transporte = v_new.tipo_transporte,
    origen = v_new.origen,
    destino = v_new.destino,
    puerto_origen = v_new.puerto_origen,
    puerto_destino = v_new.puerto_destino,
    pickup_address = v_new.pickup_address,
    delivery_address = v_new.delivery_address,
    preferred_carrier = v_new.preferred_carrier,
    transit_time = v_new.transit_time,
    target_rate = v_new.target_rate,
    container_type = v_new.container_type,
    package_type = v_new.package_type,
    package_details = v_new.package_details,
    peso_kg = v_new.peso_kg,
    peso_lbs = v_new.peso_lbs,
    gross_weight = v_new.gross_weight,
    volumen_cbm = v_new.volumen_cbm,
    volumen_ft3 = v_new.volumen_ft3,
    cantidad_bultos = v_new.cantidad_bultos,
    commodity = v_new.commodity,
    requires_insurance = v_new.requires_insurance,
    commercial_value = v_new.commercial_value,
    pricing_notes = v_new.pricing_notes,
    observaciones = v_new.observaciones,
    client_notes = v_new.client_notes,
    total_cost = v_new.total_cost,
    total_sale = v_new.total_sale,
    profit_amount = v_new.profit_amount,
    gp_percentage = v_new.gp_percentage
  where q.id = p_quotation_id;
  if not found then
    raise exception 'No se pudo guardar la cotización' using errcode = '42501';
  end if;
  if p_replace_containers or p_replace_cargo or p_replace_pricing then
    perform public.replace_quotation_child_lines(p_quotation_id,
      p_replace_containers, p_container_lines, p_replace_cargo, p_cargo_lines,
      p_replace_pricing, p_pricing_items);
  end if;
  if p_send_to_pricing then
    perform public.transition_quotation(p_quotation_id, v_old.status, v_old.status_revision,
      'Pendiente de Fijar Precios', p_repricing_reason);
  end if;
  insert into public.activity_logs(user_id, module, action, entity_type, entity_id, description)
    values (auth.uid(), 'quotations', case when p_send_to_pricing then 'resend_to_pricing' else 'quotation_edit_saved' end,
      'quotation', p_quotation_id, 'Formulario y detalle guardados en una transacción');
  return p_quotation_id;
end;
$$;
revoke all on function public.save_quotation_edit(uuid, text, jsonb, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean, bigint, text) from public, anon;
grant execute on function public.save_quotation_edit(uuid, text, jsonb, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean, bigint, text) to authenticated;

create function public.finalize_quotation_option_selection(
  p_option_id uuid, p_sync_operation boolean default false,
  p_expected_status text default null, p_expected_revision bigint default null
)
returns table (quotation_id uuid, option_id uuid, option_code text, quotation_status text,
  synced_shipping_instructions integer, updated_bookings integer, skipped_bookings integer)
language plpgsql security definer set search_path = public as $$
declare v_quote public.quotations%rowtype;
begin
  if auth.uid() is null or not public.is_approved_active_user()
    or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para registrar la opción elegida' using errcode = '42501';
  end if;
  -- Lock parent first, like transition/publication, then the option. This
  -- prevents lock inversion when publication races against acceptance.
  select q.* into v_quote from public.quotations q
    join public.quotation_options qo on qo.quotation_id = q.id
    where qo.id = p_option_id and q.tenant_id = public.current_tenant_id()
      and q.deleted_at is null for update of q;
  if not found or not public.can_select_quotation(v_quote.id) then
    raise exception 'Cotización no disponible' using errcode = '42501';
  end if;
  if p_expected_revision is null or v_quote.status_revision <> p_expected_revision
    or v_quote.status is distinct from p_expected_status then
    raise exception 'La cotización cambió. Recarga antes de registrar la elección' using errcode = '40001';
  end if;
  return query select * from public.finalize_quotation_option_selection_aud05_internal(p_option_id, p_sync_operation);
end;
$$;
revoke all on function public.finalize_quotation_option_selection(uuid, boolean, text, bigint) from public, anon;
grant execute on function public.finalize_quotation_option_selection(uuid, boolean, text, bigint) to authenticated;
