-- Canonical integrity for BL numbering, transitions and issued HBL documents.

create table if not exists public.hbl_number_counters (
  number_date date primary key,
  last_value integer not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

alter table public.hbl_number_counters enable row level security;
revoke all on table public.hbl_number_counters from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.bills_of_lading bl
    where bl.bl_type = 'HBL'
      and nullif(btrim(bl.bl_number), '') is not null
    group by upper(btrim(bl.bl_number))
    having count(*) > 1
  ) then
    raise exception 'Existen numeros HBL duplicados; deben reconciliarse antes de aplicar la restriccion unica';
  end if;
end;
$$;

create unique index if not exists bills_of_lading_hbl_number_unique_idx
on public.bills_of_lading (upper(btrim(bl_number)))
where bl_type = 'HBL' and nullif(btrim(bl_number), '') is not null;

create or replace function public.allocate_internal_hbl_number(p_number_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(
    p_number_date,
    timezone('America/Tegucigalpa', clock_timestamp())::date
  );
  v_prefix text := 'SARI-HBL-' || to_char(v_date, 'YYYYMMDD') || '-';
  v_existing_max integer;
  v_next integer;
begin
  select coalesce(max(
    case
      when substring(bl.bl_number from char_length(v_prefix) + 1) ~ '^[0-9]+$'
        then substring(bl.bl_number from char_length(v_prefix) + 1)::integer
      else null
    end
  ), 0)
  into v_existing_max
  from public.bills_of_lading bl
  where bl.bl_type = 'HBL'
    and bl.bl_number like v_prefix || '%';

  insert into public.hbl_number_counters as counter (
    number_date,
    last_value,
    updated_at
  ) values (
    v_date,
    v_existing_max + 1,
    clock_timestamp()
  )
  on conflict (number_date) do update
  set last_value = greatest(counter.last_value, excluded.last_value - 1) + 1,
      updated_at = clock_timestamp()
  returning last_value into v_next;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.allocate_internal_hbl_number(date)
from public, anon, authenticated;

create or replace function public.assign_hbl_number_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bl_type = 'HBL' and nullif(btrim(new.bl_number), '') is null then
    new.bl_number := public.allocate_internal_hbl_number(
      timezone('America/Tegucigalpa', clock_timestamp())::date
    );
  end if;

  return new;
end;
$$;

revoke all on function public.assign_hbl_number_before_insert()
from public, anon, authenticated;

drop trigger if exists assign_hbl_number_before_insert
on public.bills_of_lading;

create trigger assign_hbl_number_before_insert
before insert on public.bills_of_lading
for each row
execute function public.assign_hbl_number_before_insert();

create or replace function public.protect_issued_hbl_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bl_type <> 'HBL' or old.status not in ('Emitido', 'Liberado') then
    return new;
  end if;

  if old.status = 'Emitido'
     and new.status = 'Liberado'
     and (to_jsonb(new) - array['status', 'release_date', 'updated_at'])
       is not distinct from
       (to_jsonb(old) - array['status', 'release_date', 'updated_at']) then
    return new;
  end if;

  raise exception 'El HBL emitido es inmutable; solo puede registrarse su liberacion'
    using errcode = '55000';
end;
$$;

revoke all on function public.protect_issued_hbl_document()
from public, anon, authenticated;

drop trigger if exists protect_issued_hbl_document
on public.bills_of_lading;

create trigger protect_issued_hbl_document
before update on public.bills_of_lading
for each row
execute function public.protect_issued_hbl_document();

create or replace function public.protect_issued_hbl_containers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bl_id uuid := case when tg_op = 'DELETE' then old.bl_id else new.bl_id end;
begin
  if exists (
    select 1
    from public.bills_of_lading bl
    where bl.id = v_bl_id
      and bl.bl_type = 'HBL'
      and bl.status in ('Emitido', 'Liberado')
  ) then
    raise exception 'Los contenedores de un HBL emitido son inmutables'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_issued_hbl_containers()
from public, anon, authenticated;

drop trigger if exists protect_issued_hbl_containers
on public.bl_containers;

create trigger protect_issued_hbl_containers
before insert or update or delete on public.bl_containers
for each row
execute function public.protect_issued_hbl_containers();

revoke update on table public.bills_of_lading from anon, authenticated;
grant update (
  bl_number,
  release_type,
  originals_count,
  copies_count,
  freight_terms,
  hbl_freight_visibility,
  bl_date,
  shipper,
  shipper_address,
  consignee,
  consignee_address,
  consignee_tax_id,
  consignee_contact,
  consignee_email,
  notify_party,
  notify_party_address,
  notify_party_tax_id,
  notify_party_contact,
  notify_party_email,
  place_of_receipt,
  port_of_loading,
  port_of_discharge,
  place_of_delivery,
  carrier,
  vessel_name,
  voyage,
  etd,
  eta,
  description_of_goods,
  marks_and_numbers,
  number_of_packages,
  package_type,
  gross_weight_kg,
  measurement_cbm,
  special_instructions,
  printed_at_destination,
  draft_file_url,
  draft_file_name,
  placa_camion,
  nombre_operador,
  updated_at
) on table public.bills_of_lading to authenticated;

create or replace function public.transition_bill_of_lading(
  p_bl_id uuid,
  p_expected_status text,
  p_target_status text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.bills_of_lading%rowtype;
  v_new public.bills_of_lading%rowtype;
  v_transport_mode text;
  v_next_amendment integer;
  v_amendment public.bl_amendments%rowtype;
  v_booking_updated_at timestamptz;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para cambiar el estado del BL'
      using errcode = '42501';
  end if;

  select bl.*
  into v_old
  from public.bills_of_lading bl
  where bl.id = p_bl_id
  for update;

  if not found then
    raise exception 'BL no encontrado'
      using errcode = 'P0002';
  end if;

  if v_old.status is distinct from p_expected_status
     or v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BL_VERSION_CONFLICT: el documento fue actualizado por otro usuario'
      using errcode = '40001';
  end if;

  if not (
    (v_old.status = 'MBL Draft' and p_target_status = 'MBL Validado')
    or (v_old.status = 'HBL Draft' and p_target_status = U&'Pendiente Aprobaci\00F3n Cliente')
    or (v_old.status = U&'Pendiente Aprobaci\00F3n Cliente' and p_target_status = 'Aprobado por Cliente')
    or (v_old.status = 'Aprobado por Cliente' and p_target_status = 'Emitido')
    or (v_old.status = 'Emitido' and p_target_status = 'Liberado')
  ) then
    raise exception 'Transicion de BL no permitida: % -> %', v_old.status, p_target_status
      using errcode = '22023';
  end if;

  if nullif(btrim(v_old.bl_number), '') is null
     or nullif(btrim(v_old.shipper), '') is null
     or nullif(btrim(v_old.consignee), '') is null
     or nullif(btrim(v_old.port_of_loading), '') is null
     or nullif(btrim(v_old.port_of_discharge), '') is null
     or nullif(btrim(v_old.carrier), '') is null
     or nullif(btrim(v_old.description_of_goods), '') is null
     or coalesce(v_old.gross_weight_kg, 0) <= 0 then
    raise exception 'El BL no tiene completos los datos documentales obligatorios'
      using errcode = '23514';
  end if;

  select q.tipo_transporte
  into v_transport_mode
  from public.shipping_instructions si
  left join public.quotations q on q.id = si.quotation_id
  where si.id = v_old.shipping_instruction_id;

  if translate(
       lower(coalesce(v_transport_mode, '')),
       chr(225) || chr(233) || chr(237) || chr(243) || chr(250),
       'aeiou'
     ) like '%aereo%' then
    if nullif(btrim(v_old.voyage), '') is null then
      raise exception 'El numero de vuelo es obligatorio'
        using errcode = '23514';
    end if;
  elsif translate(
          lower(coalesce(v_transport_mode, '')),
          chr(225) || chr(233) || chr(237) || chr(243) || chr(250),
          'aeiou'
        ) not like '%terrestre%' then
    if nullif(btrim(v_old.vessel_name), '') is null
       or nullif(btrim(v_old.voyage), '') is null then
      raise exception 'Buque y voyage son obligatorios'
        using errcode = '23514';
    end if;
  end if;

  if v_old.bl_type = 'MBL'
     and p_target_status = 'MBL Validado'
     and nullif(btrim(v_old.draft_file_url), '') is null then
    raise exception 'El draft MBL del agente es obligatorio'
      using errcode = '23514';
  end if;

  update public.bills_of_lading bl
  set status = p_target_status,
      client_approved_at = case
        when p_target_status = 'Aprobado por Cliente' then clock_timestamp()
        else bl.client_approved_at
      end,
      client_approved_by = case
        when p_target_status = 'Aprobado por Cliente' then v_user_id::text
        else bl.client_approved_by
      end,
      issued_by = case
        when p_target_status = 'Emitido' then v_user_id
        else bl.issued_by
      end,
      issue_date = case
        when p_target_status = 'Emitido'
          then timezone('America/Tegucigalpa', clock_timestamp())::date
        else bl.issue_date
      end,
      release_date = case
        when p_target_status = 'Liberado'
          then timezone('America/Tegucigalpa', clock_timestamp())::date
        else bl.release_date
      end,
      updated_at = clock_timestamp()
  where bl.id = v_old.id
  returning * into v_new;

  select coalesce(max(a.amendment_number), 0) + 1
  into v_next_amendment
  from public.bl_amendments a
  where a.bl_id = v_new.id;

  insert into public.bl_amendments (
    bl_id,
    amendment_number,
    notes,
    changed_fields,
    status_before,
    status_after,
    created_by
  ) values (
    v_new.id,
    v_next_amendment,
    'Cambio de estado mediante flujo canonico',
    jsonb_build_object('status', v_old.status || ' -> ' || v_new.status),
    v_old.status,
    v_new.status,
    v_user_id
  )
  returning * into v_amendment;

  if (v_new.bl_type = 'MBL' and p_target_status = 'MBL Validado')
     or (v_new.bl_type = 'HBL' and p_target_status = 'Emitido') then
    select b.updated_at
    into v_booking_updated_at
    from public.update_booking_canonical(
      v_new.booking_id,
      v_new.shipping_instruction_id,
      (select current_booking.updated_at from public.bookings current_booking where current_booking.id = v_new.booking_id),
      case
        when v_new.bl_type = 'MBL'
          then jsonb_build_object('master_bl', v_new.bl_number)
        else jsonb_build_object('house_bl', v_new.bl_number)
      end
    ) b;
  else
    select b.updated_at
    into v_booking_updated_at
    from public.bookings b
    where b.id = v_new.booking_id;
  end if;

  insert into public.activity_logs (
    user_id,
    module,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    v_user_id,
    'operations_bl',
    'status_change',
    'bill_of_lading',
    v_new.id,
    format('%s paso de "%s" a "%s"', v_new.bl_type, v_old.status, v_new.status),
    jsonb_build_object(
      'from', v_old.status,
      'to', v_new.status,
      'booking_id', v_new.booking_id
    )
  );

  return jsonb_build_object(
    'bill_of_lading', to_jsonb(v_new),
    'amendment', to_jsonb(v_amendment),
    'booking_updated_at', v_booking_updated_at
  );
end;
$$;

revoke all on function public.transition_bill_of_lading(uuid, text, text, timestamptz)
from public, anon;
grant execute on function public.transition_bill_of_lading(uuid, text, text, timestamptz)
to authenticated, service_role;

comment on function public.transition_bill_of_lading(uuid, text, text, timestamptz) is
  'Valida y cambia el estado documental de un BL atomically con bitacora y sincronizacion canonica del booking.';
