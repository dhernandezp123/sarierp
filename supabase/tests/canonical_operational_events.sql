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

create or replace function pg_temp.expect_denied(command text, message text)
returns void language plpgsql as $$
declare
  was_denied boolean := false;
begin
  begin
    execute command;
  exception when others then
    was_denied := true;
  end;

  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('4c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-operational-events@test.local', '{}'::jsonb),
  ('4c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-operational-events@test.local', '{}'::jsonb),
  ('4c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'sales-operational-events@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '4c000000-0000-0000-0000-000000000001'
      then 'Admin'::public.user_role
    when '4c000000-0000-0000-0000-000000000002'
      then 'Operaciones'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.shipping_instructions (
  id,
  routing_number,
  created_by,
  status,
  shipment_status,
  operational_status,
  container_qty
) values
  (
    '4c100000-0000-0000-0000-000000000001',
    'RT-4C-MAIN',
    '4c000000-0000-0000-0000-000000000002',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    1
  ),
  (
    '4c100000-0000-0000-0000-000000000002',
    'RT-4C-OTHER',
    '4c000000-0000-0000-0000-000000000002',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    1
  ),
  (
    '4c100000-0000-0000-0000-000000000003',
    'RT-4C-MULTI',
    '4c000000-0000-0000-0000-000000000002',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    2
  ),
  (
    '4c100000-0000-0000-0000-000000000004',
    'RT-4C-FINALIZE',
    '4c000000-0000-0000-0000-000000000002',
    'Validada',
    'Booking Solicitado',
    'Listo para Booking',
    1
  );

insert into public.bookings (
  id,
  shipping_instruction_id,
  booking_number,
  carrier_booking,
  carrier,
  vessel_name,
  voyage,
  etd,
  eta,
  shipment_status,
  created_by
) values
  (
    '4c200000-0000-0000-0000-000000000001',
    '4c100000-0000-0000-0000-000000000001',
    'BOOK-4C-MAIN',
    null,
    'TEST CARRIER',
    'TEST VESSEL',
    'TEST VOYAGE',
    current_date,
    current_date + 10,
    'Booking Solicitado',
    '4c000000-0000-0000-0000-000000000002'
  ),
  (
    '4c200000-0000-0000-0000-000000000002',
    '4c100000-0000-0000-0000-000000000002',
    null,
    null,
    'TEST CARRIER',
    null,
    null,
    current_date,
    current_date + 10,
    'Booking Solicitado',
    '4c000000-0000-0000-0000-000000000002'
  ),
  (
    '4c200000-0000-0000-0000-000000000003',
    '4c100000-0000-0000-0000-000000000003',
    'BOOK-4C-MULTI-A',
    null,
    'TEST CARRIER',
    null,
    null,
    current_date,
    current_date + 10,
    'Booking Solicitado',
    '4c000000-0000-0000-0000-000000000002'
  ),
  (
    '4c200000-0000-0000-0000-000000000004',
    '4c100000-0000-0000-0000-000000000003',
    'BOOK-4C-MULTI-B',
    null,
    'TEST CARRIER',
    null,
    null,
    current_date,
    current_date + 10,
    'Booking Solicitado',
    '4c000000-0000-0000-0000-000000000002'
  ),
  (
    '4c200000-0000-0000-0000-000000000005',
    '4c100000-0000-0000-0000-000000000004',
    'BOOK-4C-FINAL',
    null,
    'TEST CARRIER',
    'TEST VESSEL',
    'TEST VOYAGE',
    current_date,
    current_date + 10,
    'Finalizado',
    '4c000000-0000-0000-0000-000000000002'
  ),
  (
    '4c200000-0000-0000-0000-000000000006',
    '4c100000-0000-0000-0000-000000000004',
    'BOOK-4C-CANCEL',
    null,
    'TEST CARRIER',
    null,
    null,
    current_date,
    current_date + 10,
    'Cancelada',
    '4c000000-0000-0000-0000-000000000002'
  );

insert into public.booking_containers (
  id,
  booking_id,
  container_type,
  quantity,
  notes
) values
  (
    '4c300000-0000-0000-0000-000000000001',
    '4c200000-0000-0000-0000-000000000001',
    '40HC',
    1,
    'CONT-4C-MAIN'
  ),
  (
    '4c300000-0000-0000-0000-000000000002',
    '4c200000-0000-0000-0000-000000000002',
    '40HC',
    1,
    'CONT-4C-OTHER'
  ),
  (
    '4c300000-0000-0000-0000-000000000003',
    '4c200000-0000-0000-0000-000000000005',
    '40HC',
    1,
    'CONT-4C-FINAL'
  );

insert into public.shipping_instruction_events (
  id,
  shipping_instruction_id,
  event_type,
  event_date,
  location,
  notes,
  created_by,
  created_at
) values
  (
    '4c400000-0000-0000-0000-000000000001',
    '4c100000-0000-0000-0000-000000000001',
    'Gate In',
    now() - interval '2 days',
    'Terminal A',
    'Gate In legacy',
    '4c000000-0000-0000-0000-000000000002',
    now() - interval '1 day'
  ),
  (
    '4c400000-0000-0000-0000-000000000002',
    '4c100000-0000-0000-0000-000000000003',
    'Zarpado',
    now() - interval '1 day',
    'Puerto A',
    'Evento sin referencia de booking',
    '4c000000-0000-0000-0000-000000000002',
    now()
  );

create temp table first_backfill as
select * from public.backfill_legacy_operational_events();

select pg_temp.assert_true(
  (
    select booking_id = '4c200000-0000-0000-0000-000000000001'
      and event_code = 'GATE_IN'
    from public.operational_events
    where source_system = 'legacy'
      and source_id = '4c400000-0000-0000-0000-000000000001'
  ),
  'Evento legacy de SI con un booking debe asociarse al booking'
);

select pg_temp.assert_true(
  (
    select booking_id is null
      and metadata ->> 'migration_resolution' = 'unresolved_multi_booking'
    from public.operational_events
    where source_system = 'legacy'
      and source_id = '4c400000-0000-0000-0000-000000000002'
  ),
  'Evento ambiguo de SI multi-booking debe quedar a nivel de SI'
);

select pg_temp.assert_true(
  (
    select count(*) = (
      select count(*) from public.shipping_instruction_events
      where id in (
        '4c400000-0000-0000-0000-000000000001',
        '4c400000-0000-0000-0000-000000000002'
      )
    )
    from public.operational_events
    where source_system = 'legacy'
      and source_id in (
        '4c400000-0000-0000-0000-000000000001',
        '4c400000-0000-0000-0000-000000000002'
      )
  ),
  'Backfill debe reconciliar uno a uno'
);

select * from public.backfill_legacy_operational_events();

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.operational_events
    where source_system = 'legacy'
      and source_id in (
        '4c400000-0000-0000-0000-000000000001',
        '4c400000-0000-0000-0000-000000000002'
      )
  ),
  'Backfill repetido no debe duplicar eventos'
);

select pg_temp.assert_true(
  (
    select shipment_status = 'Booking Solicitado'
    from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'
  ),
  'Backfill no debe actualizar estados'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"4c000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.record_operational_event(
    p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
    p_booking_id => '4c200000-0000-0000-0000-000000000001',
    p_event_code => 'OPERATIONAL_NOTE',
    p_event_label => 'Nota',
    p_notes => 'Intento de Ventas'
  )$$,
  'Ventas no debe registrar eventos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"4c000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.record_operational_event(
    p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
    p_booking_id => '4c200000-0000-0000-0000-000000000002',
    p_event_code => 'GATE_IN',
    p_event_label => 'Gate In'
  )$$,
  'Booking de otra SI debe rechazarse'
);

select pg_temp.expect_denied(
  $$select * from public.record_operational_event(
    p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
    p_booking_id => '4c200000-0000-0000-0000-000000000001',
    p_booking_container_id => '4c300000-0000-0000-0000-000000000002',
    p_event_code => 'GATE_IN',
    p_event_label => 'Gate In'
  )$$,
  'Contenedor de otro booking debe rechazarse'
);

select pg_temp.expect_denied(
  $$select * from public.record_operational_event(
    p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
    p_booking_id => '4c200000-0000-0000-0000-000000000001',
    p_event_code => 'OPERATIONAL_NOTE',
    p_event_label => 'Nota sin contenido'
  )$$,
  'Nota libre sin notas debe rechazarse'
);

select * from public.record_operational_event(
  p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
  p_booking_id => '4c200000-0000-0000-0000-000000000001',
  p_event_code => 'OPERATIONAL_NOTE',
  p_event_label => 'Nota válida',
  p_notes => 'Contenido de la nota'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.operational_events
    where booking_id = '4c200000-0000-0000-0000-000000000001'
      and event_label = 'Nota válida'
      and source_system = 'manual'
  ),
  'Evento válido debe insertarse'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.activity_logs
    where entity_id = '4c200000-0000-0000-0000-000000000001'
      and action = 'operational_event_created'
  ),
  'Evento y activity log deben crearse en la misma llamada'
);

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000002',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000002'),
    'Booking Confirmado'
  )$$,
  'Confirmación sin booking number debe rechazarse'
);

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000001',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000001'),
    'Finalizado'
  )$$,
  'Salto de Booking Solicitado a Finalizado debe rechazarse'
);

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000001',
    '2000-01-01'::timestamptz,
    'Booking Confirmado'
  )$$,
  'Versión desactualizada debe rechazarse'
);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Booking Confirmado'
);

select pg_temp.assert_true(
  (
    select shipment_status = 'Booking Confirmado'
    from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'
  ),
  'Transición válida debe actualizar el estado'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.operational_events
    where booking_id = '4c200000-0000-0000-0000-000000000001'
      and event_code = 'BOOKING_CONFIRMED'
      and source_system = 'transition'
  ),
  'Transición válida debe crear su evento'
);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Documentación Pendiente'
);

insert into public.booking_documents (
  booking_id,
  document_type,
  file_name,
  file_url,
  uploaded_by
)
select
  '4c200000-0000-0000-0000-000000000001',
  document_type,
  document_type || '.pdf',
  'tests/' || replace(lower(document_type), ' ', '-') || '.pdf',
  '4c000000-0000-0000-0000-000000000002'
from unnest(array[
  'Booking Confirmation',
  'Commercial Invoice',
  'Packing List',
  'Master BL',
  'House BL'
]) as required(document_type);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Listo para Embarque'
);

select set_config('app.booking_schedule_write_mode', 'admin_correction', true);
update public.bookings
set vessel_name = null,
    updated_at = clock_timestamp()
where id = '4c200000-0000-0000-0000-000000000001';

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000001',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000001'),
    'Embarcado'
  )$$,
  'Embarque sin vessel debe rechazarse'
);

update public.bookings
set vessel_name = 'TEST VESSEL',
    updated_at = clock_timestamp()
where id = '4c200000-0000-0000-0000-000000000001';
select set_config('app.booking_schedule_write_mode', '', true);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Embarcado',
  now()
);

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000002',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000002'),
    'Arribado'
  )$$,
  'Arribo antes de embarque debe rechazarse'
);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'En Tránsito',
  now()
);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Arribado',
  now()
);

select pg_temp.expect_denied(
  $$select public.transition_booking_status(
    '4c200000-0000-0000-0000-000000000001',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000001'),
    'Finalizado'
  )$$,
  'Finalización sin entrega debe rechazarse'
);

select * from public.record_operational_event(
  p_shipping_instruction_id => '4c100000-0000-0000-0000-000000000001',
  p_booking_id => '4c200000-0000-0000-0000-000000000001',
  p_event_code => 'DELIVERED',
  p_event_label => 'Entrega registrada',
  p_notes => 'Entregado al consignatario'
);

select public.transition_booking_status(
  '4c200000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
    where id = '4c200000-0000-0000-0000-000000000001'),
  'Finalizado',
  now()
);

select pg_temp.expect_denied(
  $$select * from public.update_booking_canonical(
    '4c200000-0000-0000-0000-000000000001',
    '4c100000-0000-0000-0000-000000000001',
    (select updated_at from public.bookings
      where id = '4c200000-0000-0000-0000-000000000001'),
    '{"notes":"cambio"}'::jsonb
  )$$,
  'Booking finalizado debe ser inmutable'
);

select pg_temp.expect_denied(
  $$select public.finalize_shipping_instruction_canonical(
    '4c100000-0000-0000-0000-000000000003',
    (select updated_at from public.shipping_instructions
      where id = '4c100000-0000-0000-0000-000000000003')
  )$$,
  'SI con booking pendiente debe rechazar finalización'
);

select public.finalize_shipping_instruction_canonical(
  '4c100000-0000-0000-0000-000000000004',
  (select updated_at from public.shipping_instructions
    where id = '4c100000-0000-0000-0000-000000000004')
);

select pg_temp.assert_true(
  (
    select operational_status = 'Finalizado'
      and shipment_status <> 'Finalizado'
    from public.shipping_instructions
    where id = '4c100000-0000-0000-0000-000000000004'
  ),
  'Finalización canónica debe actualizar solo el estado propio operativo de SI'
);

select pg_temp.assert_true(
  (
    select (metadata ->> 'cancelled_bookings_ignored')::integer = 1
    from public.operational_events
    where shipping_instruction_id = '4c100000-0000-0000-0000-000000000004'
      and booking_id is null
      and event_label = 'Shipping Instruction finalizada'
  ),
  'Booking cancelado debe excluirse explícitamente al finalizar SI'
);

select pg_temp.assert_true(
  (
    select count(*) >= 1
    from public.activity_logs
    where entity_id = '4c100000-0000-0000-0000-000000000004'
      and action = 'shipping_instruction_finalized_canonical'
  ),
  'Finalización de SI debe registrar activity log'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.shipping_instruction_events
    where id in (
      '4c400000-0000-0000-0000-000000000001',
      '4c400000-0000-0000-0000-000000000002'
    )
  ),
  'Flujo canónico no debe escribir ni modificar eventos legacy'
);

rollback;
