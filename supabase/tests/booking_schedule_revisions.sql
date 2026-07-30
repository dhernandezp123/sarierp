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
  blocked boolean := false;
begin
  begin
    execute command;
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_deferred_denied(
  command text,
  message text
)
returns void language plpgsql as $$
declare
  blocked boolean := false;
begin
  begin
    execute command;
    set constraints all immediate;
  exception when others then
    blocked := true;
  end;
  set constraints all deferred;
  if not blocked then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create temp table baseline_counts as
select
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.booking_documents) as documents,
  (select count(*) from public.bills_of_lading) as bls,
  (select count(*) from public.operational_events) as events;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-5b@test.local', '{}'::jsonb),
  ('5b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-5b@test.local', '{}'::jsonb),
  ('5b000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'client-5b@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '5b000000-0000-0000-0000-000000000001'
      then 'Admin'::public.user_role
    when '5b000000-0000-0000-0000-000000000002'
      then 'Operaciones'::public.user_role
    else 'Cliente'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre)
values ('5b100000-0000-0000-0000-000000000001', 'Cliente Fase 5B');

update public.profiles
set cliente_id = '5b100000-0000-0000-0000-000000000001'
where id = '5b000000-0000-0000-0000-000000000003';

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '5b200000-0000-0000-0000-000000000001',
  '5b100000-0000-0000-0000-000000000001',
  '5b000000-0000-0000-0000-000000000001',
  'Ganada',
  'Q-5B-001',
  'other_origin_fcl',
  'FCL',
  'Maritimo',
  'FOB',
  'Shanghai',
  'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, container_qty
) values (
  '5b300000-0000-0000-0000-000000000001',
  'RT-5B-001',
  '5b200000-0000-0000-0000-000000000001',
  '5b100000-0000-0000-0000-000000000001',
  '5b000000-0000-0000-0000-000000000002',
  'Validada',
  'Booking Solicitado',
  'Listo para Booking',
  5
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values
  (
    '5b400000-0000-0000-0000-000000000001',
    '5b300000-0000-0000-0000-000000000001',
    'BOOK-5B-MAIN', 'CB-5B-MAIN', 'CARRIER A', 'VESSEL A', 'V001',
    '2026-08-01', '2026-08-20', 'Booking Confirmado',
    '5b000000-0000-0000-0000-000000000002'
  ),
  (
    '5b400000-0000-0000-0000-000000000002',
    '5b300000-0000-0000-0000-000000000001',
    'BOOK-5B-CANCEL', 'CB-5B-CANCEL', 'CARRIER A', 'VESSEL B', 'V002',
    '2026-08-02', '2026-08-21', 'Booking Solicitado',
    '5b000000-0000-0000-0000-000000000002'
  ),
  (
    '5b400000-0000-0000-0000-000000000003',
    '5b300000-0000-0000-0000-000000000001',
    'BOOK-5B-BL', 'CB-5B-BL', 'CARRIER A', 'VESSEL C', 'V003',
    '2026-08-03', '2026-08-22', 'Booking Confirmado',
    '5b000000-0000-0000-0000-000000000002'
  ),
  (
    '5b400000-0000-0000-0000-000000000004',
    '5b300000-0000-0000-0000-000000000001',
    'BOOK-5B-PHYSICAL', 'CB-5B-PHYSICAL', 'CARRIER A', 'VESSEL D', 'V004',
    '2026-08-04', '2026-08-23', 'Booking Confirmado',
    '5b000000-0000-0000-0000-000000000002'
  ),
  (
    '5b400000-0000-0000-0000-000000000005',
    '5b300000-0000-0000-0000-000000000001',
    'BOOK-5B-FINAL', 'CB-5B-FINAL', 'CARRIER A', 'VESSEL E', 'V005',
    '2026-07-01', '2026-07-20', 'Finalizado',
    '5b000000-0000-0000-0000-000000000002'
  );

update public.shipping_instructions
set primary_booking_id = '5b400000-0000-0000-0000-000000000001'
where id = '5b300000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  (
    select count(*) = 5
      and bool_and(revision_number = 1)
      and bool_and(revision_type = 'INITIAL')
    from public.booking_schedule_revisions
    where booking_id::text like '5b400000-%'
  ),
  'Cada booking con itinerario debe crear revision INITIAL'
);

select pg_temp.assert_true(
  (
    select original_etd = '2026-08-01'
      and original_eta = '2026-08-20'
    from public.bookings
    where id = '5b400000-0000-0000-0000-000000000001'
  ),
  'La insercion debe fijar ETD/ETA originales'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, container_qty
) values (
  '5b300000-0000-0000-0000-000000000002',
  'RT-5B-OTHER-SHIPMENT',
  null,
  '5b100000-0000-0000-0000-000000000001',
  '5b000000-0000-0000-0000-000000000002',
  'Validada',
  'Booking Solicitado',
  'Listo para Booking',
  1
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values (
  '5b400000-0000-0000-0000-000000000099',
  '5b300000-0000-0000-0000-000000000002',
  'BOOK-5B-OTHER',
  'CB-5B-OTHER',
  'CARRIER Z',
  'VESSEL Z',
  'V099',
  '2026-08-15',
  '2026-09-01',
  'Booking Solicitado',
  '5b000000-0000-0000-0000-000000000002'
);

select set_config('app.booking_schedule_write_mode', 'booking_replace', true);
select pg_temp.expect_deferred_denied(
  $$update public.bookings
    set supersedes_booking_id =
      '5b400000-0000-0000-0000-000000000001'
    where id = '5b400000-0000-0000-0000-000000000099'$$,
  'Una relacion de reemplazo entre shipments debe bloquearse'
);
select pg_temp.expect_denied(
  $$update public.bookings
    set supersedes_booking_id = id
    where id = '5b400000-0000-0000-0000-000000000099'$$,
  'Una relacion ciclica consigo misma debe bloquearse'
);
select set_config('app.booking_schedule_write_mode', '', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5b000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.record_operational_event(
    '5b300000-0000-0000-0000-000000000001',
    '5b400000-0000-0000-0000-000000000001',
    null,
    'SCHEDULE_REVISED',
    'Evento manual indebido'
  )$$,
  'Frontend no debe duplicar eventos reservados de itinerario'
);

create temp table revised as
select public.revise_booking_schedule(
  '5b400000-0000-0000-0000-000000000001',
  (
    select updated_at from public.bookings
    where id = '5b400000-0000-0000-0000-000000000001'
  ),
  'Cambio confirmado por naviera',
  'CARRIER A',
  'VESSEL A2',
  'V001B',
  '2026-08-05',
  '2026-08-24',
  'Transbordo Cartagena'
) as result;

select pg_temp.assert_true(
  (
    select etd = '2026-08-05'
      and eta = '2026-08-24'
      and original_etd = '2026-08-01'
      and original_eta = '2026-08-20'
    from public.bookings
    where id = '5b400000-0000-0000-0000-000000000001'
  ),
  'La revision cambia vigentes y conserva originales'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_schedule_revisions
    where booking_id = '5b400000-0000-0000-0000-000000000001'
      and revision_number = 2
      and revision_type = 'SCHEDULE_CHANGE'
      and vessel_name = 'VESSEL A2'
      and voyage = 'V001B'
  ),
  'Cambio de ETD/vessel/voyage debe crear revision secuencial'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.operational_events
    where booking_id = '5b400000-0000-0000-0000-000000000001'
      and event_code = 'SCHEDULE_REVISED'
  ),
  'La revision debe crear evento operativo estable'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.activity_logs
    where entity_id = '5b400000-0000-0000-0000-000000000001'
      and action = 'booking_schedule_revised'
  ),
  'La revision debe crear activity log'
);

select pg_temp.expect_denied(
  $$select public.revise_booking_schedule(
    '5b400000-0000-0000-0000-000000000001',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000001'),
    'Sin cambios',
    'CARRIER A', 'VESSEL A2', 'V001B',
    '2026-08-05', '2026-08-24', 'Transbordo Cartagena'
  )$$,
  'Una revision sin cambios debe bloquearse'
);

select pg_temp.expect_denied(
  $$select public.revise_booking_schedule(
    '5b400000-0000-0000-0000-000000000001',
    '2000-01-01 00:00:00+00',
    'Version obsoleta',
    'CARRIER A', 'VESSEL X', 'VX',
    '2026-08-06', '2026-08-25', null
  )$$,
  'El control optimista debe detectar concurrencia'
);

select pg_temp.expect_denied(
  $$update public.bookings
    set original_etd = '2026-07-31'
    where id = '5b400000-0000-0000-0000-000000000001'$$,
  'original_etd debe ser inmutable'
);

select public.rollover_booking_schedule(
  '5b400000-0000-0000-0000-000000000001',
  (
    select updated_at from public.bookings
    where id = '5b400000-0000-0000-0000-000000000001'
  ),
  'Rollover por falta de espacio',
  'VESSEL R',
  'VR01',
  '2026-08-10',
  '2026-08-29',
  'Directo',
  null,
  now(),
  null
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_schedule_revisions
    where booking_id = '5b400000-0000-0000-0000-000000000001'
      and revision_type = 'ROLLOVER_SAME_BOOKING'
      and booking_number = 'BOOK-5B-MAIN'
  ),
  'Rollover conserva el booking number y crea revision propia'
);

select pg_temp.expect_denied(
  $$select public.revise_booking_schedule(
    '5b400000-0000-0000-0000-000000000005',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000005'),
    'No permitido',
    'CARRIER A', 'VESSEL Z', 'VZ',
    '2026-08-10', '2026-08-30', null
  )$$,
  'Booking finalizado debe ser inmutable'
);

reset role;
select set_config('app.booking_schedule_write_mode', 'admin_correction', true);
update public.bookings
set shipment_status = 'Listo para Embarque',
    updated_at = clock_timestamp()
where id = '5b400000-0000-0000-0000-000000000004';
select set_config('app.booking_schedule_write_mode', '', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5b000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select public.rollover_booking_schedule(
  '5b400000-0000-0000-0000-000000000004',
  (
    select updated_at from public.bookings
    where id = '5b400000-0000-0000-0000-000000000004'
  ),
  'Rollover antes de embarque',
  'VESSEL D2',
  'V004B',
  '2026-08-08',
  '2026-08-27',
  null,
  'Booking Confirmado'
);

select pg_temp.assert_true(
  (
    select shipment_status = 'Booking Confirmado'
    from public.bookings
    where id = '5b400000-0000-0000-0000-000000000004'
  ),
  'Rollover desde Listo para Embarque permite retroceso controlado'
);

reset role;
select set_config('app.booking_schedule_write_mode', 'admin_correction', true);
update public.bookings
set actual_etd = '2026-08-04',
    updated_at = clock_timestamp()
where id = '5b400000-0000-0000-0000-000000000004';
select set_config('app.booking_schedule_write_mode', '', true);

insert into public.booking_containers (
  id, booking_id, container_type, quantity, notes
) values (
  '5b500000-0000-0000-0000-000000000001',
  '5b400000-0000-0000-0000-000000000004',
  'Contenedor 40HC',
  1,
  'CONT-5B-PHYSICAL'
);

insert into public.operational_events (
  id, shipment_id, shipping_instruction_id, booking_id,
  booking_container_id, event_code, event_label, occurred_at,
  source_system, created_by
) values (
  '5b600000-0000-0000-0000-000000000001',
  '5b300000-0000-0000-0000-000000000001',
  '5b300000-0000-0000-0000-000000000001',
  '5b400000-0000-0000-0000-000000000004',
  '5b500000-0000-0000-0000-000000000001',
  'GATE_IN',
  'Gate In',
  now(),
  'system',
  '5b000000-0000-0000-0000-000000000002'
);

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type,
  bl_number, status, release_type, created_by
) values (
  '5b700000-0000-0000-0000-000000000001',
  '5b400000-0000-0000-0000-000000000003',
  '5b300000-0000-0000-0000-000000000001',
  'MBL',
  'MBL-5B-ISSUED',
  'Emitido',
  'Express Release',
  '5b000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5b000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select public.rollover_booking_schedule(
    '5b400000-0000-0000-0000-000000000004',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000004'),
    'Rollover tardio', 'VESSEL NEW', 'VN',
    '2026-08-12', '2026-08-30'
  )$$,
  'Rollover despues de actual ETD debe bloquearse'
);

select pg_temp.expect_denied(
  $$select public.replace_booking(
    '5b400000-0000-0000-0000-000000000003',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000003'),
    'CARRIER B', 'BOOK-NEW-BL', 'CB-NEW-BL',
    'VESSEL NEW', 'VN', '2026-08-10', '2026-08-30',
    'Reserva sustituida'
  )$$,
  'BL emitido debe bloquear reemplazo normal'
);

select pg_temp.expect_denied(
  $$select public.replace_booking(
    '5b400000-0000-0000-0000-000000000004',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000004'),
    'CARRIER B', 'BOOK-NEW-PHYSICAL', 'CB-NEW-PHYSICAL',
    'VESSEL NEW', 'VN', '2026-08-10', '2026-08-30',
    'Reserva sustituida', 'MOVE_ALL_IF_NOT_PHYSICALLY_USED'
  )$$,
  'Contenedor con Gate In no puede moverse'
);

create temp table replacement as
select public.replace_booking(
  '5b400000-0000-0000-0000-000000000001',
  (
    select updated_at from public.bookings
    where id = '5b400000-0000-0000-0000-000000000001'
  ),
  'CARRIER B',
  'BOOK-5B-REPLACEMENT',
  'CB-5B-REPLACEMENT',
  'VESSEL N',
  'VN01',
  '2026-08-12',
  '2026-08-31',
  'Nueva reserva emitida',
  'KEEP_WITH_OLD'
) as result;

select pg_temp.assert_true(
  (
    select old_booking.booking_lifecycle_status = 'REPLACED'
      and old_booking.shipment_status = 'Cancelada'
      and old_booking.replaced_by_booking_id = new_booking.id
      and new_booking.supersedes_booking_id = old_booking.id
      and new_booking.booking_lifecycle_status = 'ACTIVE'
      and new_booking.master_bl is null
      and new_booking.house_bl is null
      and new_booking.actual_etd is null
      and new_booking.actual_eta is null
      and new_booking.tracking_url is null
    from public.bookings old_booking
    join public.bookings new_booking
      on new_booking.id = old_booking.replaced_by_booking_id
    where old_booking.id = '5b400000-0000-0000-0000-000000000001'
  ),
  'Reemplazo debe conservar anterior y no copiar BL/actuals/tracking'
);

select pg_temp.assert_true(
  (
    select si.primary_booking_id = old_booking.replaced_by_booking_id
    from public.shipping_instructions si
    join public.bookings old_booking
      on old_booking.id = '5b400000-0000-0000-0000-000000000001'
    where si.id = '5b300000-0000-0000-0000-000000000001'
  ),
  'Primary booking debe actualizarse al sustituto'
);

select public.cancel_booking(
  '5b400000-0000-0000-0000-000000000002',
  (
    select updated_at from public.bookings
    where id = '5b400000-0000-0000-0000-000000000002'
  ),
  'Cliente cancelo la carga'
);

select pg_temp.assert_true(
  (
    select booking_lifecycle_status = 'CANCELLED'
      and cancellation_reason = 'Cliente cancelo la carga'
      and cancelled_at is not null
      and replaced_by_booking_id is null
    from public.bookings
    where id = '5b400000-0000-0000-0000-000000000002'
  ),
  'Cancelacion debe distinguir CANCELLED de REPLACED'
);

select pg_temp.expect_denied(
  $$select public.cancel_booking(
    '5b400000-0000-0000-0000-000000000004',
    (select updated_at from public.bookings
      where id = '5b400000-0000-0000-0000-000000000004'),
    'Cancelacion tardia'
  )$$,
  'Cancelacion despues de embarque debe bloquearse'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.operational_events
    where event_code = 'BOOKING_REPLACED'
      and (
        booking_id = '5b400000-0000-0000-0000-000000000001'
        or booking_id = (
          select replaced_by_booking_id
          from public.bookings
          where id = '5b400000-0000-0000-0000-000000000001'
        )
      )
  ),
  'Reemplazo debe crear eventos en ambos bookings'
);

select pg_temp.expect_denied(
  $$delete from public.booking_schedule_revisions
    where booking_id = '5b400000-0000-0000-0000-000000000001'$$,
  'No se permite eliminar historial'
);

reset role;

select pg_temp.assert_true(
  public.derive_shipment_operational_status(
    '5b300000-0000-0000-0000-000000000001'
  ) <> 'Cancelado',
  'Cancelados/reemplazados no bloquean mientras existan bookings activos'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5b000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select jsonb_array_length(bookings) = 4
      and not exists (
        select 1
        from jsonb_array_elements(bookings) item
        where item ->> 'id' in (
          '5b400000-0000-0000-0000-000000000001',
          '5b400000-0000-0000-0000-000000000002'
        )
      )
    from public.get_client_shipment_detail_v2(
      '5b300000-0000-0000-0000-000000000001'
    )
  ),
  'Portal solo debe exponer bookings activos'
);

reset role;

select pg_temp.assert_true(
  (
    select count(*) filter (
      where booking_lifecycle_status = 'ACTIVE'
    ) > 0
      and count(*) filter (
        where booking_lifecycle_status = 'REPLACED'
      ) = 1
      and count(*) filter (
        where booking_lifecycle_status = 'CANCELLED'
      ) = 1
    from public.bookings
    where shipment_id = '5b300000-0000-0000-0000-000000000001'
  ),
  'Reportes pueden distinguir activos, reemplazados y cancelados'
);

-- Repetir la forma del backfill no debe duplicar la revision inicial.
insert into public.booking_schedule_revisions (
  shipment_id, booking_id, revision_number, revision_type,
  carrier, booking_number, carrier_booking, vessel_name, voyage,
  etd, eta, reason, source, effective_at, metadata
)
select
  b.shipment_id, b.id, 1, 'INITIAL',
  b.carrier, b.booking_number, b.carrier_booking, b.vessel_name, b.voyage,
  b.etd, b.eta, 'Backfill repetido', 'phase_5b_backfill',
  coalesce(b.created_at, now()), '{"source":"phase_5b_backfill"}'::jsonb
from public.bookings b
where b.id = '5b400000-0000-0000-0000-000000000003'
on conflict (booking_id, revision_number) do nothing;

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_schedule_revisions
    where booking_id = '5b400000-0000-0000-0000-000000000003'
      and revision_number = 1
  ),
  'Backfill INITIAL debe ser idempotente'
);

select pg_temp.assert_true(
  (
    select
      (select count(*) from public.bookings) >= bookings
      and (select count(*) from public.booking_documents) >= documents
      and (select count(*) from public.bills_of_lading) >= bls
      and (select count(*) from public.operational_events) >= events
    from baseline_counts
  ),
  'Fase 5B no elimina historia operativa'
);

rollback;

\echo 'booking_schedule_revisions.sql: OK'
