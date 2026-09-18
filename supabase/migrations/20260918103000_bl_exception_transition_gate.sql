-- Enforce correction or an exact active exception before final BL transitions.

create or replace function public.bl_validation_value_key(
  p_field_name text,
  p_value text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
begin
  if v_value = '' then
    return '';
  end if;

  if p_field_name = any (array[
    'gross_weight_kg', 'measurement_cbm', 'number_of_packages'
  ]) and v_value ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
    return round(v_value::numeric, 3)::text;
  end if;

  if p_field_name = any (array['etd', 'eta']) then
    return left(v_value, 10);
  end if;

  return btrim(regexp_replace(
    translate(
      lower(v_value),
      U&'áéíóúüñ',
      'aeiouun'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
end;
$$;

revoke all on function public.bl_validation_value_key(text, text)
from public, anon, authenticated;
grant execute on function public.bl_validation_value_key(text, text)
to service_role;

create or replace function public.get_unresolved_bl_source_differences(p_bl_id uuid)
returns table (
  field_name text,
  document_value text,
  source_value text,
  source_label text
)
language sql
stable
security definer
set search_path = public
as $$
  with context as (
    select
      bl.*,
      b.carrier as booking_carrier,
      b.vessel_name as booking_vessel_name,
      b.voyage as booking_voyage,
      b.etd as booking_etd,
      b.eta as booking_eta,
      b.freight_terms as booking_freight_terms,
      b.release_type as booking_release_type,
      si.shipper as si_shipper,
      si.supplier_name as si_supplier_name,
      si.supplier_address as si_supplier_address,
      si.consignee as si_consignee,
      si.consignee_address as si_consignee_address,
      si.notify_party as si_notify_party,
      si.notify_party_address as si_notify_party_address,
      si.origin_address as si_origin_address,
      si.destination_address as si_destination_address,
      q.commodity as quotation_commodity,
      q.package_details as quotation_package_details,
      q.peso_kg as quotation_peso_kg,
      q.gross_weight as quotation_gross_weight,
      q.volumen_cbm as quotation_volumen_cbm,
      q.cantidad_bultos as quotation_cantidad_bultos,
      q.package_type as quotation_package_type,
      q.puerto_origen as quotation_port_of_loading,
      q.puerto_destino as quotation_port_of_discharge,
      c.nombre as client_name,
      c.direccion as client_address,
      c.ciudad as client_city,
      c.pais as client_country,
      parent.carrier as parent_carrier,
      parent.vessel_name as parent_vessel_name,
      parent.voyage as parent_voyage,
      parent.etd as parent_etd,
      parent.eta as parent_eta,
      parent.place_of_receipt as parent_place_of_receipt,
      parent.port_of_loading as parent_port_of_loading,
      parent.port_of_discharge as parent_port_of_discharge,
      parent.place_of_delivery as parent_place_of_delivery,
      parent.description_of_goods as parent_description_of_goods,
      parent.number_of_packages as parent_number_of_packages,
      parent.package_type as parent_package_type,
      parent.gross_weight_kg as parent_gross_weight_kg,
      parent.measurement_cbm as parent_measurement_cbm,
      parent.freight_terms as parent_freight_terms,
      parent.release_type as parent_release_type
    from public.bills_of_lading bl
    join public.bookings b on b.id = bl.booking_id
    join public.shipping_instructions si on si.id = bl.shipping_instruction_id
    left join public.quotations q on q.id = si.quotation_id
    left join public.clientes c on c.id = q.cliente_id
    left join public.bills_of_lading parent on parent.id = bl.parent_bl_id
    where bl.id = p_bl_id
  ),
  cargo_lines as (
    select
      sum(greatest(coalesce(qcl.quantity, 0), 0)) as packages,
      sum(
        greatest(coalesce(qcl.weight_lbs, 0), 0)
        * greatest(coalesce(qcl.quantity, 0), 0)
        / 2.20462
      ) as weight_kg,
      sum(greatest(coalesce(qcl.cbm, 0), 0)) as cbm,
      (
        select string_agg(grouped.package_type, ' / ' order by grouped.first_created)
        from (
          select btrim(qcl_type.package_type) as package_type,
                 min(qcl_type.created_at) as first_created
          from public.quotation_cargo_lines qcl_type
          join public.shipping_instructions si_type
            on si_type.quotation_id = qcl_type.quotation_id
          where si_type.id = (select shipping_instruction_id from context)
            and coalesce(qcl_type.quantity, 0) > 0
            and nullif(btrim(qcl_type.package_type), '') is not null
          group by btrim(qcl_type.package_type)
        ) grouped
      ) as package_types
    from public.quotation_cargo_lines qcl
    join public.shipping_instructions si_cargo on si_cargo.quotation_id = qcl.quotation_id
    where si_cargo.id = (select shipping_instruction_id from context)
      and coalesce(qcl.quantity, 0) > 0
  ),
  pairs as (
    select pair.*
    from context ctx
    cross join cargo_lines cargo
    cross join lateral (
      values
        ('carrier', ctx.carrier::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_carrier else ctx.booking_carrier end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('vessel_name', ctx.vessel_name::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_vessel_name else ctx.booking_vessel_name end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('voyage', ctx.voyage::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_voyage else ctx.booking_voyage end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('etd', ctx.etd::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_etd else ctx.booking_etd end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('eta', ctx.eta::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_eta else ctx.booking_eta end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('place_of_receipt', ctx.place_of_receipt::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_place_of_receipt else null end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('port_of_loading', ctx.port_of_loading::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_port_of_loading
            else coalesce(ctx.quotation_port_of_loading, ctx.si_origin_address)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('port_of_discharge', ctx.port_of_discharge::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_port_of_discharge
            else coalesce(ctx.quotation_port_of_discharge, ctx.si_destination_address)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('place_of_delivery', ctx.place_of_delivery::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_place_of_delivery else null end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('description_of_goods', ctx.description_of_goods::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_description_of_goods
            else coalesce(ctx.quotation_commodity, ctx.quotation_package_details)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('number_of_packages', ctx.number_of_packages::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_number_of_packages
            else coalesce(nullif(cargo.packages, 0), ctx.quotation_cantidad_bultos)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('package_type', ctx.package_type::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_package_type
            else coalesce(cargo.package_types, ctx.quotation_package_type)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('gross_weight_kg', ctx.gross_weight_kg::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_gross_weight_kg
            else coalesce(
              nullif(cargo.weight_kg, 0),
              nullif(ctx.quotation_peso_kg, 0),
              ctx.quotation_gross_weight
            )
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('measurement_cbm', ctx.measurement_cbm::text,
          case when ctx.bl_type = 'HBL'
            then ctx.parent_measurement_cbm
            else coalesce(nullif(cargo.cbm, 0), ctx.quotation_volumen_cbm)
          end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('freight_terms', ctx.freight_terms::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_freight_terms else ctx.booking_freight_terms end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('release_type', ctx.release_type::text,
          case when ctx.bl_type = 'HBL' then ctx.parent_release_type else ctx.booking_release_type end::text,
          case when ctx.bl_type = 'HBL' then 'MBL padre' else 'Booking / Shipping Instruction' end),
        ('shipper', ctx.shipper::text,
          case when ctx.bl_type = 'HBL' then coalesce(ctx.si_shipper, ctx.si_supplier_name) else null end::text,
          'Shipping Instruction / cotización'),
        ('shipper_address', ctx.shipper_address::text,
          case when ctx.bl_type = 'HBL' then ctx.si_supplier_address else null end::text,
          'Shipping Instruction / cotización'),
        ('consignee', ctx.consignee::text,
          case when ctx.bl_type = 'HBL' then coalesce(ctx.si_consignee, ctx.client_name) else null end::text,
          'Shipping Instruction / cotización'),
        ('consignee_address', ctx.consignee_address::text,
          case when ctx.bl_type = 'HBL' then coalesce(
            ctx.si_consignee_address,
            concat_ws(', ', ctx.client_address, ctx.client_city, ctx.client_country)
          ) else null end::text,
          'Shipping Instruction / cotización'),
        ('notify_party', ctx.notify_party::text,
          case when ctx.bl_type = 'HBL' then ctx.si_notify_party else null end::text,
          'Shipping Instruction / cotización'),
        ('notify_party_address', ctx.notify_party_address::text,
          case when ctx.bl_type = 'HBL' then ctx.si_notify_party_address else null end::text,
          'Shipping Instruction / cotización')
    ) pair(field_name, document_value, source_value, source_label)
  )
  select pair.field_name, pair.document_value, pair.source_value, pair.source_label
  from pairs pair
  where nullif(btrim(pair.document_value), '') is not null
    and nullif(btrim(pair.source_value), '') is not null
    and public.bl_validation_value_key(pair.field_name, pair.document_value)
      is distinct from public.bl_validation_value_key(pair.field_name, pair.source_value)
    and not exists (
      select 1
      from public.bl_validation_exceptions exception_row
      where exception_row.bl_id = p_bl_id
        and exception_row.field_name = pair.field_name
        and exception_row.status = 'ACTIVE'
        and public.bl_validation_value_key(pair.field_name, exception_row.document_value)
          = public.bl_validation_value_key(pair.field_name, pair.document_value)
        and public.bl_validation_value_key(pair.field_name, exception_row.source_value)
          = public.bl_validation_value_key(pair.field_name, pair.source_value)
        and public.bl_validation_value_key(pair.field_name, exception_row.source_label)
          = public.bl_validation_value_key(pair.field_name, pair.source_label)
    );
$$;

revoke all on function public.get_unresolved_bl_source_differences(uuid)
from public, anon, authenticated;
grant execute on function public.get_unresolved_bl_source_differences(uuid)
to service_role;

create or replace function public.enforce_bl_source_review_before_finalization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text;
begin
  if new.status is not distinct from old.status
     or new.status not in ('MBL Validado', 'Emitido') then
    return new;
  end if;

  select string_agg(distinct difference.field_name, ', ' order by difference.field_name)
  into v_fields
  from public.get_unresolved_bl_source_differences(new.id) difference;

  if v_fields is not null then
    raise exception 'BL_SOURCE_REVIEW_REQUIRED: corrige o justifica diferencias en %', v_fields
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_bl_source_review_before_finalization()
from public, anon, authenticated;

drop trigger if exists enforce_bl_source_review_before_finalization
on public.bills_of_lading;

create trigger enforce_bl_source_review_before_finalization
before update of status on public.bills_of_lading
for each row
execute function public.enforce_bl_source_review_before_finalization();

comment on function public.get_unresolved_bl_source_differences(uuid) is
  'Recalcula diferencias BL/fuente y excluye solo excepciones activas con el snapshot exacto.';
comment on function public.enforce_bl_source_review_before_finalization() is
  'Impide validar MBL o emitir HBL con diferencias de fuente sin corregir o justificar.';
