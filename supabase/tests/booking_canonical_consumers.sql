\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('4b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-consumers@test.local', '{}'::jsonb),
  ('4b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'client-one-consumers@test.local', '{}'::jsonb),
  ('4b000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'client-two-consumers@test.local', '{}'::jsonb);

insert into public.clientes (id, nombre)
values
  ('4b100000-0000-0000-0000-000000000001', 'Cliente Portal Uno'),
  ('4b100000-0000-0000-0000-000000000002', 'Cliente Portal Dos');

update public.profiles
set rol = case id
    when '4b000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    else 'Cliente'::public.user_role
  end,
  cliente_id = case id
    when '4b000000-0000-0000-0000-000000000002'
      then '4b100000-0000-0000-0000-000000000001'::uuid
    when '4b000000-0000-0000-0000-000000000003'
      then '4b100000-0000-0000-0000-000000000002'::uuid
    else null
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.quotations (
  id,
  cliente_id,
  created_by,
  status,
  quotation_number,
  service_product,
  origen,
  destino,
  commodity
) values
  (
    '4b200000-0000-0000-0000-000000000001',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Ganada',
    'Q-4B-MULTI',
    'other_origin_fcl',
    'Shanghai',
    'Puerto Cortes',
    'Carga multi-booking'
  ),
  (
    '4b200000-0000-0000-0000-000000000002',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Ganada',
    'Q-4B-SINGLE',
    'other_origin_fcl',
    'Miami',
    'Puerto Cortes',
    'Carga single-booking'
  ),
  (
    '4b200000-0000-0000-0000-000000000003',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Ganada',
    'Q-4B-ZERO',
    'other_origin_fcl',
    'Miami',
    'Puerto Cortes',
    'Carga sin booking'
  ),
  (
    '4b200000-0000-0000-0000-000000000004',
    '4b100000-0000-0000-0000-000000000002',
    '4b000000-0000-0000-0000-000000000001',
    'Ganada',
    'Q-4B-OTHER-CLIENT',
    'other_origin_fcl',
    'Miami',
    'Puerto Cortes',
    'Carga privada'
  );

insert into public.agent_quotes (
  id,
  quotation_id,
  agente_nombre,
  carrier,
  transit_time,
  free_days_destination,
  etd,
  is_selected
) values
  (
    '4b300000-0000-0000-0000-000000000001',
    '4b200000-0000-0000-0000-000000000001',
    'Agente Canonico 4B',
    'NEW CANONICAL CARRIER',
    '14',
    9,
    current_date + 10,
    true
  ),
  (
    '4b300000-0000-0000-0000-000000000002',
    '4b200000-0000-0000-0000-000000000003',
    'Agente Sin Bookings 4B',
    'NO BOOKING CARRIER',
    '10',
    5,
    current_date + 5,
    true
  );

insert into public.shipping_instructions (
  id,
  routing_number,
  quotation_id,
  client_id,
  created_by,
  status,
  shipment_status,
  operational_status,
  booking_number,
  carrier_booking,
  master_bl,
  house_bl,
  carrier,
  etd,
  eta,
  free_days,
  freight_terms,
  release_type,
  operational_comments
) values
  (
    '4b400000-0000-0000-0000-000000000001',
    'RT-4B-MULTI',
    '4b200000-0000-0000-0000-000000000001',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Validada',
    'Booking Confirmado',
    'Listo para Booking',
    'LEGACY-SI-BOOKING',
    'LEGACY-SI-CARRIER-BOOKING',
    'LEGACY-SI-MBL',
    'LEGACY-SI-HBL',
    'LEGACY-SI-CARRIER',
    current_date,
    current_date + 30,
    '99',
    'Prepaid',
    'Express Release',
    'COMENTARIO INTERNO QUE NO DEBE EXPONERSE'
  ),
  (
    '4b400000-0000-0000-0000-000000000002',
    'RT-4B-SINGLE',
    '4b200000-0000-0000-0000-000000000002',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    null, null, null, null, null, null, null, null, null, null, null
  ),
  (
    '4b400000-0000-0000-0000-000000000003',
    'RT-4B-ZERO',
    '4b200000-0000-0000-0000-000000000003',
    '4b100000-0000-0000-0000-000000000001',
    '4b000000-0000-0000-0000-000000000001',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    null, null, null, null, null, null, null, null, null, null, null
  ),
  (
    '4b400000-0000-0000-0000-000000000004',
    'RT-4B-OTHER',
    '4b200000-0000-0000-0000-000000000004',
    '4b100000-0000-0000-0000-000000000002',
    '4b000000-0000-0000-0000-000000000001',
    'Validada',
    'Booking Confirmado',
    'Booking Confirmado',
    null, null, null, null, null, null, null, null, null, null, null
  );

insert into public.bookings (
  id,
  shipping_instruction_id,
  booking_number,
  carrier_booking,
  master_bl,
  house_bl,
  carrier,
  vessel_name,
  voyage,
  etd,
  eta,
  actual_etd,
  tracking_url,
  shipment_status,
  free_days,
  remaining_free_days,
  operational_comments,
  created_by
) values
  (
    '4b500000-0000-0000-0000-000000000001',
    '4b400000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    null,
    'OLD DEFAULT CARRIER',
    null,
    null,
    current_date + 2,
    current_date + 20,
    null,
    null,
    'Booking Solicitado',
    3,
    2,
    'COMENTARIO INTERNO BOOKING',
    '4b000000-0000-0000-0000-000000000001'
  ),
  (
    '4b500000-0000-0000-0000-000000000002',
    '4b400000-0000-0000-0000-000000000001',
    'CONFIRMED-BOOKING-4B',
    'CONFIRMED-CARRIER-BOOKING-4B',
    null,
    null,
    'CONFIRMED CARRIER',
    'VESSEL CONFIRMED',
    'V001',
    current_date + 4,
    current_date + 24,
    current_date + 4,
    'https://tracking.example/confirmed',
    'Booking Confirmado',
    4,
    1,
    null,
    '4b000000-0000-0000-0000-000000000001'
  ),
  (
    '4b500000-0000-0000-0000-000000000003',
    '4b400000-0000-0000-0000-000000000001',
    null,
    null,
    'CACHE-MBL-THREE',
    null,
    'BL CARRIER',
    null,
    null,
    current_date + 6,
    current_date + 26,
    null,
    null,
    'Listo para Booking',
    5,
    3,
    null,
    '4b000000-0000-0000-0000-000000000001'
  ),
  (
    '4b500000-0000-0000-0000-000000000004',
    '4b400000-0000-0000-0000-000000000002',
    'SINGLE-BOOKING-4B',
    null,
    null,
    null,
    'SINGLE CARRIER',
    null,
    null,
    current_date + 3,
    current_date + 18,
    null,
    null,
    'Booking Solicitado',
    7,
    4,
    null,
    '4b000000-0000-0000-0000-000000000001'
  ),
  (
    '4b500000-0000-0000-0000-000000000005',
    '4b400000-0000-0000-0000-000000000004',
    'PRIVATE-BOOKING-4B',
    null,
    null,
    null,
    'PRIVATE CARRIER',
    null,
    null,
    current_date + 3,
    current_date + 18,
    null,
    null,
    'Booking Confirmado',
    7,
    5,
    null,
    '4b000000-0000-0000-0000-000000000001'
  );

insert into public.booking_containers (
  id,
  booking_id,
  container_type,
  quantity
) values
  ('4b600000-0000-0000-0000-000000000001', '4b500000-0000-0000-0000-000000000001', 'Contenedor 40HC', 1),
  ('4b600000-0000-0000-0000-000000000002', '4b500000-0000-0000-0000-000000000002', 'Contenedor 40HC', 1),
  ('4b600000-0000-0000-0000-000000000003', '4b500000-0000-0000-0000-000000000003', 'Contenedor 40HC', 1);

insert into public.bills_of_lading (
  id,
  booking_id,
  shipping_instruction_id,
  bl_type,
  bl_number,
  status,
  release_type,
  created_by
) values (
  '4b700000-0000-0000-0000-000000000001',
  '4b500000-0000-0000-0000-000000000003',
  '4b400000-0000-0000-0000-000000000001',
  'MBL',
  'STRUCTURED-MBL-4B',
  'Emitido',
  'Express Release',
  '4b000000-0000-0000-0000-000000000001'
);

insert into public.pricing_items (
  id,
  quotation_id,
  item_type,
  description,
  cost_amount,
  sale_amount,
  quantity,
  created_by
) values (
  '4b800000-0000-0000-0000-000000000001',
  '4b200000-0000-0000-0000-000000000001',
  'Flete',
  'Costo único de cotización',
  6700,
  7000,
  1,
  '4b000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"4b000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.get_client_shipments_v2(true)
  ),
  'Portal v2 debe devolver una operacion por SI del cliente, incluidos 0/1/N bookings'
);

select pg_temp.assert_true(
  (
    select booking_count = 3
      and aggregate_status = 'Parcialmente Confirmado'
    from public.get_client_shipments_v2(true)
    where id = '4b400000-0000-0000-0000-000000000001'
  ),
  'Portal v2 debe resumir tres bookings sin ocultarlos y detectar confirmación parcial'
);

select pg_temp.assert_true(
  (
    select booking_count = 1
    from public.get_client_shipments_v2(true)
    where id = '4b400000-0000-0000-0000-000000000002'
  ),
  'Portal v2 debe soportar una SI con un booking'
);

select pg_temp.assert_true(
  (
    select jsonb_array_length(bookings) = 3
      and not (bookings -> 0 ? 'operational_comments')
    from public.get_client_shipment_detail_v2(
      '4b400000-0000-0000-0000-000000000001'
    )
  ),
  'Detalle portal debe devolver todos los bookings sin comentarios operativos'
);

select pg_temp.assert_true(
  (
    select exists (
      select 1
      from jsonb_array_elements(detail.bookings) as booking
      cross join lateral jsonb_array_elements(booking -> 'bills_of_lading') as bill
      where booking ->> 'id' = '4b500000-0000-0000-0000-000000000003'
        and booking ->> 'master_bl' = 'CACHE-MBL-THREE'
        and bill ->> 'bl_number' = 'STRUCTURED-MBL-4B'
    )
    from public.get_client_shipment_detail_v2(
      '4b400000-0000-0000-0000-000000000001'
    ) as detail
  ),
  'Portal debe entregar el BL estructurado para que prevalezca sobre el cache de booking'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"4b000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.get_client_shipment_detail_v2(
      '4b400000-0000-0000-0000-000000000001'
    )
  ),
  'Un cliente no debe ver la operacion de otra cuenta'
);

reset role;

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.shipping_instructions
    where id = '4b400000-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 3
    from public.bookings
    where shipping_instruction_id = '4b400000-0000-0000-0000-000000000001'
  ),
  'Reportes deben producir una fila operacion y tres filas booking, sin fila legacy adicional'
);

select pg_temp.assert_true(
  (
    select b.eta = current_date + 20
      and b.remaining_free_days = 2
      and b.eta is distinct from si.eta
    from public.bookings b
    join public.shipping_instructions si
      on si.id = b.shipping_instruction_id
    where b.id = '4b500000-0000-0000-0000-000000000001'
  ),
  'Alertas ETA y free days deben obtener sus valores del booking, no de SI legacy'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.bookings
    where shipping_instruction_id = '4b400000-0000-0000-0000-000000000001'
      and eta is not null
  ) and (
    select count(*) = 0
    from public.bookings
    where shipping_instruction_id = '4b400000-0000-0000-0000-000000000003'
  ),
  'Alertas multi-booking deben poder evaluarse por booking y conservar SI sin booking'
);

select pg_temp.assert_true(
  (
    select sum(cost_amount * quantity) = 6700
    from public.pricing_items
    where quotation_id = '4b200000-0000-0000-0000-000000000001'
  ),
  'Cost Validation debe conservar el costo a nivel de cotizacion sin multiplicarlo por bookings'
);

create temp table legacy_si_snapshot as
select
  booking_number,
  carrier_booking,
  master_bl,
  house_bl,
  carrier,
  etd,
  eta,
  free_days
from public.shipping_instructions
where id = '4b400000-0000-0000-0000-000000000001';

grant select on legacy_si_snapshot to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"4b000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temp table repricing_result as
select *
from public.sync_shipping_instruction_from_selected_agent_quote_v2(
  '4b400000-0000-0000-0000-000000000001',
  'Prueba Fase 4B'
);

select pg_temp.assert_true(
  (
    select updated_bookings = 1
      and skipped_count = 2
      and updated_booking_ids @> array[
        '4b500000-0000-0000-0000-000000000001'::uuid
      ]
    from repricing_result
  ),
  'Repricing mixto debe listar un booking actualizado y dos omitidos'
);

select pg_temp.assert_true(
  (
    select skipped_bookings @> jsonb_build_array(
      jsonb_build_object(
        'booking_id', '4b500000-0000-0000-0000-000000000002'::uuid,
        'status', 'Booking Confirmado',
        'reason', 'DATOS_OPERATIVOS_CONFIRMADOS'
      )
    )
    from repricing_result
  ),
  'Repricing debe explicar la omision del booking confirmado'
);

select pg_temp.assert_true(
  (
    select skipped_bookings @> jsonb_build_array(
      jsonb_build_object(
        'booking_id', '4b500000-0000-0000-0000-000000000003'::uuid,
        'status', 'Listo para Booking',
        'reason', 'BL_ESTRUCTURADO_EXISTENTE'
      )
    )
    from repricing_result
  ),
  'Repricing debe omitir y explicar un booking con BL estructurado'
);

select pg_temp.assert_true(
  (
    select carrier = 'NEW CANONICAL CARRIER'
      and etd = current_date + 10
      and eta = current_date + 24
      and estimated_transit_days = 14
      and free_days = 9
      and freight_terms = 'Prepaid'
      and release_type = 'Express Release'
    from public.bookings
    where id = '4b500000-0000-0000-0000-000000000001'
  ),
  'Repricing debe actualizar carrier, ETD, ETA, transito, free days y defaults permitidos'
);

select pg_temp.assert_true(
  (
    select carrier = 'CONFIRMED CARRIER'
      and vessel_name = 'VESSEL CONFIRMED'
      and actual_etd = current_date + 4
    from public.bookings
    where id = '4b500000-0000-0000-0000-000000000002'
  ),
  'Repricing no debe modificar bookings confirmados'
);

select pg_temp.assert_true(
  (
    select
      si.booking_number = snapshot.booking_number
      and si.carrier_booking = snapshot.carrier_booking
      and si.master_bl = snapshot.master_bl
      and si.house_bl = snapshot.house_bl
      and si.carrier = snapshot.carrier
      and si.etd = snapshot.etd
      and si.eta = snapshot.eta
      and si.free_days = snapshot.free_days
    from public.shipping_instructions si
    cross join legacy_si_snapshot snapshot
    where si.id = '4b400000-0000-0000-0000-000000000001'
  ),
  'Repricing v2 no debe escribir ningun campo booking legacy en SI'
);

select pg_temp.assert_true(
  (
    select updated_bookings = 0 and skipped_count = 0
    from public.sync_shipping_instruction_from_selected_agent_quote_v2(
      '4b400000-0000-0000-0000-000000000003',
      'SI sin bookings'
    )
  ),
  'Repricing debe manejar una SI sin bookings sin inventar filas'
);

reset role;

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.sync_shipping_instruction_from_selected_agent_quote(uuid,text)',
    'EXECUTE'
  ),
  'El rol autenticado no debe poder invocar repricing v1 que escribe SI legacy'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.activity_logs
    where action = 'shipping_instruction_repriced_canonical'
      and entity_id in (
        '4b400000-0000-0000-0000-000000000001',
        '4b400000-0000-0000-0000-000000000003'
      )
  ),
  'Repricing debe auditar actualizados, omitidos y SI sin bookings'
);

rollback;

\echo 'booking_canonical_consumers.sql: OK'
