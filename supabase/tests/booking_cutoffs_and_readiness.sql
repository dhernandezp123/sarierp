\set ON_ERROR_STOP on

begin;
\o /dev/null

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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('5c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-5c@test.local', '{}'::jsonb),
  ('5c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-5c@test.local', '{}'::jsonb),
  ('5c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'client-5c@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '5c000000-0000-0000-0000-000000000001'
      then 'Admin'::public.user_role
    when '5c000000-0000-0000-0000-000000000002'
      then 'Operaciones'::public.user_role
    else 'Cliente'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre)
values ('5c100000-0000-0000-0000-000000000001', 'Cliente Fase 5C');

update public.profiles
set cliente_id = '5c100000-0000-0000-0000-000000000001'
where id = '5c000000-0000-0000-0000-000000000003';

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values
  (
    '5c200000-0000-0000-0000-000000000001',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000001',
    'Ganada', 'Q-5C-FCL', 'other_origin_fcl', 'FCL', 'Maritimo',
    'FOB', 'Shanghai', 'Puerto Cortes'
  ),
  (
    '5c200000-0000-0000-0000-000000000002',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000001',
    'Ganada', 'Q-5C-LCL', 'other_origin_lcl', 'LCL', 'Maritimo',
    'FOB', 'Ningbo', 'Puerto Cortes'
  ),
  (
    '5c200000-0000-0000-0000-000000000003',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000001',
    'Ganada', 'Q-5C-AIR', 'other_origin_air', 'Consolidado', 'Aereo',
    'FOB', 'Miami', 'San Pedro Sula'
  ),
  (
    '5c200000-0000-0000-0000-000000000004',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000001',
    'Ganada', 'Q-5C-ROAD', 'usa_ltl_ftl', 'LTL', 'Terrestre',
    'FOB', 'Miami', 'San Pedro Sula'
  );

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, validated_by, validated_at
) values
  (
    '5c300000-0000-0000-0000-000000000001', 'RT-5C-FCL',
    '5c200000-0000-0000-0000-000000000001',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000002',
    'Validada', 'Documentación Pendiente', 'Listo para Booking',
    '5c000000-0000-0000-0000-000000000002', now()
  ),
  (
    '5c300000-0000-0000-0000-000000000002', 'RT-5C-LCL',
    '5c200000-0000-0000-0000-000000000002',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000002',
    'Validada', 'Documentación Pendiente', 'Listo para Booking',
    '5c000000-0000-0000-0000-000000000002', now()
  ),
  (
    '5c300000-0000-0000-0000-000000000003', 'RT-5C-AIR',
    '5c200000-0000-0000-0000-000000000003',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000002',
    'Validada', 'Documentación Pendiente', 'Listo para Booking',
    '5c000000-0000-0000-0000-000000000002', now()
  ),
  (
    '5c300000-0000-0000-0000-000000000004', 'RT-5C-ROAD',
    '5c200000-0000-0000-0000-000000000004',
    '5c100000-0000-0000-0000-000000000001',
    '5c000000-0000-0000-0000-000000000002',
    'Validada', 'Documentación Pendiente', 'Listo para Booking',
    '5c000000-0000-0000-0000-000000000002', now()
  );

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values
  (
    '5c400000-0000-0000-0000-000000000001',
    '5c300000-0000-0000-0000-000000000001',
    'BOOK-5C-FCL', 'CB-5C-FCL', 'CARRIER FCL', 'VESSEL FCL', 'V001',
    current_date + 10, current_date + 30, 'Documentación Pendiente',
    '5c000000-0000-0000-0000-000000000002'
  ),
  (
    '5c400000-0000-0000-0000-000000000002',
    '5c300000-0000-0000-0000-000000000002',
    'BOOK-5C-LCL', 'CB-5C-LCL', 'CARRIER LCL', 'VESSEL LCL', 'V002',
    current_date + 11, current_date + 31, 'Documentación Pendiente',
    '5c000000-0000-0000-0000-000000000002'
  ),
  (
    '5c400000-0000-0000-0000-000000000003',
    '5c300000-0000-0000-0000-000000000003',
    'BOOK-5C-AIR', 'CB-5C-AIR', 'AIRLINE', null, null,
    current_date + 2, current_date + 3, 'Documentación Pendiente',
    '5c000000-0000-0000-0000-000000000002'
  ),
  (
    '5c400000-0000-0000-0000-000000000004',
    '5c300000-0000-0000-0000-000000000004',
    'BOOK-5C-ROAD', 'CB-5C-ROAD', 'TRUCKER', null, null,
    current_date + 2, current_date + 4, 'Documentación Pendiente',
    '5c000000-0000-0000-0000-000000000002'
  );

insert into public.booking_containers (
  id, booking_id, container_type, quantity, notes
) values (
  '5c500000-0000-0000-0000-000000000001',
  '5c400000-0000-0000-0000-000000000001',
  'Contenedor 40HC',
  1,
  'TCLU1234567'
);

insert into public.booking_documents (
  id, booking_id, document_type, file_name, file_url, uploaded_by
)
select
  gen_random_uuid(),
  booking.id,
  document_type,
  document_type || '.pdf',
  'test/' || booking.id || '/' || document_type || '.pdf',
  '5c000000-0000-0000-0000-000000000002'
from public.bookings booking
cross join unnest(array[
  'Booking Confirmation',
  'Commercial Invoice',
  'Packing List'
]) document_type
where booking.id::text like '5c400000-%';

select set_config(
  'request.jwt.claim.sub',
  '5c000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  public.booking_operational_mode(
    '5c400000-0000-0000-0000-000000000001'
  ) = 'SEA_FCL',
  'Debe clasificar FCL maritimo'
);
select pg_temp.assert_true(
  public.booking_operational_mode(
    '5c400000-0000-0000-0000-000000000002'
  ) = 'SEA_LCL',
  'Debe clasificar LCL maritimo'
);
select pg_temp.assert_true(
  public.booking_operational_mode(
    '5c400000-0000-0000-0000-000000000003'
  ) = 'AIR',
  'Debe clasificar aereo'
);
select pg_temp.assert_true(
  public.booking_operational_mode(
    '5c400000-0000-0000-0000-000000000004'
  ) = 'ROAD_LTL',
  'Debe clasificar terrestre LTL'
);

select pg_temp.assert_true(
  jsonb_array_length(
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000001'
    ) -> 'missing_vgm_containers'
  ) = 1,
  'FCL sin VGM debe bloquear exactamente un contenedor'
);

select pg_temp.assert_true(
  (
    public.transition_booking_status(
      '5c400000-0000-0000-0000-000000000001',
      (
        select updated_at
        from public.bookings
        where id = '5c400000-0000-0000-0000-000000000001'
      ),
      'Listo para Embarque',
      now(),
      'Puerto Cortes',
      null,
      '{}'::jsonb
    ) ->> 'transitioned'
  )::boolean = false,
  'Listo para Embarque debe bloquearse sin VGM'
);

select pg_temp.expect_denied(
  $$select public.create_or_replace_booking_cutoff(
      '5c400000-0000-0000-0000-000000000001',
      null,
      'PORT',
      'Puerto',
      now() + interval '1 day',
      'Timezone/Invalido',
      'MANUAL',
      null, null, null, null, '{}'::jsonb, false
    )$$,
  'Timezone invalido debe bloquearse'
);

select public.create_or_replace_booking_cutoff(
  '5c400000-0000-0000-0000-000000000001',
  null,
  'PORT',
  'Cut-off puerto',
  now() + interval '48 hours',
  'America/Tegucigalpa',
  'MANUAL',
  'PORT-REF-1',
  (
    select id
    from public.booking_schedule_revisions
    where booking_id = '5c400000-0000-0000-0000-000000000001'
    order by revision_number desc
    limit 1
  ),
  null,
  null,
  '{"client_visible": true}'::jsonb,
  false
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_cutoffs
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and cutoff_code = 'PORT'
      and superseded_by_cutoff_id is null
  ),
  'Debe crear un cut-off vigente'
);

select public.create_or_replace_booking_cutoff(
  '5c400000-0000-0000-0000-000000000001',
  null,
  'DOCUMENTATION',
  'Documentacion vencida',
  now() - interval '1 hour',
  'America/Tegucigalpa',
  'MANUAL',
  null,
  null,
  null,
  null,
  '{}'::jsonb,
  false
);

select pg_temp.assert_true(
  jsonb_array_length(
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000001'
    ) -> 'overdue_cutoffs'
  ) = 1,
  'Cut-off vencido debe aparecer como bloqueo'
);

select pg_temp.expect_denied(
  $$select public.save_container_vgm_draft(
      '5c400000-0000-0000-0000-000000000001',
      '5c500000-0000-0000-0000-000000000001',
      -10, 'KG', 'METHOD_2', now(), null, null, null, '{}'::jsonb
    )$$,
  'Masa invalida debe bloquearse'
);

select public.save_container_vgm_draft(
  '5c400000-0000-0000-0000-000000000001',
  '5c500000-0000-0000-0000-000000000001',
  28500,
  'KG',
  'METHOD_2',
  now(),
  null,
  null,
  'Pesaje terminal',
  '{}'::jsonb
);

select public.verify_container_vgm(
  (
    select id
    from public.container_vgm_records
    where booking_container_id =
      '5c500000-0000-0000-0000-000000000001'
      and status = 'DRAFT'
  ),
  (
    select updated_at
    from public.container_vgm_records
    where booking_container_id =
      '5c500000-0000-0000-0000-000000000001'
      and status = 'DRAFT'
  )
);

select public.submit_container_vgm(
  (
    select id
    from public.container_vgm_records
    where booking_container_id =
      '5c500000-0000-0000-0000-000000000001'
      and status = 'VERIFIED'
  ),
  (
    select updated_at
    from public.container_vgm_records
    where booking_container_id =
      '5c500000-0000-0000-0000-000000000001'
      and status = 'VERIFIED'
  ),
  'SUB-5C-001'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.container_vgm_records
    where booking_container_id =
      '5c500000-0000-0000-0000-000000000001'
      and status = 'SUBMITTED'
  ),
  'Debe existir una sola VGM activa enviada'
);

set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '5c000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select public.waive_booking_cutoff(
  (
    select id
    from public.booking_cutoffs
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and cutoff_code = 'DOCUMENTATION'
      and superseded_by_cutoff_id is null
  ),
  (
    select updated_at
    from public.booking_cutoffs
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and cutoff_code = 'DOCUMENTATION'
      and superseded_by_cutoff_id is null
  ),
  'Autorizacion operativa de prueba',
  now() + interval '2 hours'
);

select pg_temp.assert_true(
  (
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000001'
    ) ->> 'ready'
  )::boolean,
  'FCL completo con excepcion vigente debe estar listo'
);

select pg_temp.assert_true(
  (
    public.transition_booking_status(
      '5c400000-0000-0000-0000-000000000001',
      (
        select updated_at
        from public.bookings
        where id = '5c400000-0000-0000-0000-000000000001'
      ),
      'Listo para Embarque',
      now(),
      'Puerto Cortes',
      'Readiness completo',
      '{}'::jsonb
    ) ->> 'transitioned'
  )::boolean,
  'Listo para Embarque debe permitirse con readiness completo'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_readiness_evaluations
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and trigger_status = 'Listo para Embarque'
  ),
  'La transicion debe guardar snapshot de readiness'
);

-- LCL y aereo no exigen contenedores ni VGM; cargo recibido si aplica.
set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '5c000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select public.complete_booking_readiness_requirement(
  (
    select id
    from public.booking_readiness_requirements
    where booking_id = '5c400000-0000-0000-0000-000000000002'
      and requirement_code = 'CARGO_RECEIVED'
  ),
  (
    select updated_at
    from public.booking_readiness_requirements
    where booking_id = '5c400000-0000-0000-0000-000000000002'
      and requirement_code = 'CARGO_RECEIVED'
  ),
  'MANUAL_OPERATIONAL_EVIDENCE',
  null,
  '{"location": "CFS"}'::jsonb
);

select public.complete_booking_readiness_requirement(
  (
    select id
    from public.booking_readiness_requirements
    where booking_id = '5c400000-0000-0000-0000-000000000003'
      and requirement_code = 'CARGO_RECEIVED'
  ),
  (
    select updated_at
    from public.booking_readiness_requirements
    where booking_id = '5c400000-0000-0000-0000-000000000003'
      and requirement_code = 'CARGO_RECEIVED'
  ),
  'MANUAL_OPERATIONAL_EVIDENCE',
  null,
  '{"location": "Aeropuerto"}'::jsonb
);

select pg_temp.assert_true(
  (
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000002'
    ) ->> 'ready'
  )::boolean
  and jsonb_array_length(
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000002'
    ) -> 'missing_vgm_containers'
  ) = 0,
  'LCL sin contenedor no debe exigir VGM'
);

select pg_temp.assert_true(
  (
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000003'
    ) ->> 'ready'
  )::boolean,
  'Aereo completo no debe exigir reglas maritimas'
);

select pg_temp.assert_true(
  (
    public.evaluate_booking_readiness(
      '5c400000-0000-0000-0000-000000000004'
    ) ->> 'ready'
  )::boolean,
  'Terrestre completo no debe exigir reglas maritimas'
);

-- Rollover crea una nueva version de cut-off sin borrar la anterior.
select public.rollover_booking_schedule(
  '5c400000-0000-0000-0000-000000000001',
  (
    select updated_at
    from public.bookings
    where id = '5c400000-0000-0000-0000-000000000001'
  ),
  'Rollover 5C',
  'VESSEL FCL 2',
  'V002',
  current_date + 12,
  current_date + 32,
  'Nueva ruta',
  'Documentación Pendiente',
  now(),
  null,
  jsonb_build_array(
    jsonb_build_object(
      'cutoff_code', 'PORT',
      'cutoff_label', 'Cut-off puerto revisado',
      'due_at', (now() + interval '72 hours')::text,
      'timezone', 'America/Tegucigalpa'
    )
  )
);

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(*) filter (
        where superseded_by_cutoff_id is null
          and status <> 'CANCELLED'
      ) = 1
    from public.booking_cutoffs
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and cutoff_code = 'PORT'
  ),
  'Rollover debe versionar el cut-off'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.container_vgm_records
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and status = 'SUBMITTED'
  ),
  'Rollover conserva VGM del mismo contenedor'
);

-- Replacement inicia readiness independiente y no copia datos 5C.
select public.replace_booking(
  '5c400000-0000-0000-0000-000000000002',
  (
    select updated_at
    from public.bookings
    where id = '5c400000-0000-0000-0000-000000000002'
  ),
  'CARRIER LCL 2',
  'BOOK-5C-LCL-NEW',
  'CB-5C-LCL-NEW',
  'VESSEL LCL 2',
  'V003',
  current_date + 15,
  current_date + 35,
  'Replacement 5C',
  'KEEP_WITH_OLD',
  'Ruta sustituta',
  false
);

select pg_temp.assert_true(
  (
    select count(*) = 12
    from public.booking_readiness_requirements
    where booking_id = (
      select replaced_by_booking_id
      from public.bookings
      where id = '5c400000-0000-0000-0000-000000000002'
    )
  ),
  'Booking sustituto debe iniciar su propia plantilla'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.booking_cutoffs
    where booking_id = (
      select replaced_by_booking_id
      from public.bookings
      where id = '5c400000-0000-0000-0000-000000000002'
    )
  )
  and not exists (
    select 1
    from public.container_vgm_records
    where booking_id = (
      select replaced_by_booking_id
      from public.bookings
      where id = '5c400000-0000-0000-0000-000000000002'
    )
  ),
  'Replacement no copia cut-offs ni VGM'
);

-- Seguridad, auditoria e historia.
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.create_or_replace_booking_cutoff(uuid,uuid,text,text,timestamptz,text,text,text,uuid,text,text,jsonb,boolean)',
    'EXECUTE'
  ),
  'Anon no ejecuta RPC de cut-offs'
);

select pg_temp.assert_true(
  (
    select count(*) >= 1
    from public.activity_logs
    where entity_id = '5c400000-0000-0000-0000-000000000001'
      and action in (
        'cutoff_created',
        'vgm_recorded',
        'readiness_transition_blocked'
      )
  ),
  'Acciones 5C deben registrar activity logs'
);

select pg_temp.assert_true(
  (
    select count(*) >= 1
    from public.operational_events
    where booking_id = '5c400000-0000-0000-0000-000000000001'
      and event_code in (
        'CUTOFF_CREATED',
        'VGM_RECORDED',
        'READINESS_BLOCKED'
      )
  ),
  'Acciones 5C deben registrar eventos'
);

set local role postgres;
select pg_temp.expect_denied(
  $$delete from public.booking_cutoffs
    where booking_id = '5c400000-0000-0000-0000-000000000001'$$,
  'No debe eliminarse historia de cut-offs'
);

select pg_temp.expect_denied(
  $$delete from public.container_vgm_records
    where booking_id = '5c400000-0000-0000-0000-000000000001'$$,
  'No debe eliminarse historia VGM'
);

select set_config(
  'request.jwt.claim.sub',
  '5c000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;

select pg_temp.expect_denied(
  $$select public.create_or_replace_booking_cutoff(
      '5c400000-0000-0000-0000-000000000003',
      null, 'PORT', 'No autorizado', now() + interval '1 day',
      'America/Tegucigalpa', 'MANUAL', null, null, null, null,
      '{}'::jsonb, false
    )$$,
  'Cliente no puede crear cut-offs'
);

set local role postgres;
select pg_temp.assert_true(
  public.seed_booking_readiness_requirements(
    '5c400000-0000-0000-0000-000000000001',
    true
  ) = 0,
  'Backfill de readiness debe ser idempotente'
);

\o
\echo 'booking_cutoffs_and_readiness: OK'
rollback;
