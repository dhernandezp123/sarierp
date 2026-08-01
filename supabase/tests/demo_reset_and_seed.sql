\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_failure(command text, message text)
returns void
language plpgsql
as $$
declare
  failed boolean := false;
begin
  begin
    execute command;
  exception when others then
    failed := true;
  end;

  if not failed then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_sqlstate(
  command text,
  expected_state text,
  message text
)
returns void
language plpgsql
as $$
declare
  observed_state text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics observed_state = returned_sqlstate;
    if observed_state is distinct from expected_state then
      raise exception
        'ASSERTION FAILED: % (SQLSTATE esperado %, recibido %)',
        message,
        expected_state,
        observed_state;
    end if;
    return;
  end;

  raise exception
    'ASSERTION FAILED: % (la sentencia no fue rechazada)',
    message;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.arm_demo_reset(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reset_and_seed_demo(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.revoke_demo_slot_sessions(text,uuid[])',
    'EXECUTE'
  ),
  'Los RPC destructivos y de sesiones no deben ser ejecutables por authenticated'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  raw_app_meta_data
)
values (
  'd0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'demo-bootstrap@forwarders.app',
  '{"nombre":"Demo","apellido":"Bootstrap tecnico"}'::jsonb,
  '{"demo_bootstrap_provisioner":"forwarders-demo-bootstrap-v1"}'::jsonb
);

update public.profiles
set nombre = 'Demo',
    apellido = 'Bootstrap tecnico',
    email = 'demo-bootstrap@forwarders.app',
    rol = 'Admin',
    status = 'Rechazado',
    approved_at = null,
    approved_by = null,
    is_active = false,
    cliente_id = null,
    is_demo_user = false,
    demo_expires_at = null,
    demo_access_grant_id = null,
    is_platform_admin = false
where id = 'd0000000-0000-4000-8000-000000000001';

update public.platform_environment
set environment = 'demo',
    project_ref = 'wlssekvxpfxhwedsjhpz',
    reset_enabled = false,
    reset_nonce = gen_random_uuid(),
    reset_armed_at = null,
    dataset_version = null,
    dataset_seeded_at = null,
    dataset_client_id = null,
    updated_at = clock_timestamp()
where singleton is true;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.expect_failure(
  $$select public.arm_demo_reset(
      'RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz'
    )$$,
  'Un usuario autenticado no debe armar el reset demo'
);

reset role;
create temporary table demo_reset_test_result (
  nonce uuid,
  result jsonb
) on commit drop;
grant select, insert, update on demo_reset_test_result to service_role;

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

select pg_temp.expect_sqlstate(
  $$select public.arm_demo_reset('CONFIRMACION INCORRECTA')$$,
  '22023',
  'El reset debe exigir la frase exacta y el project ref staging'
);

insert into demo_reset_test_result (nonce)
select public.arm_demo_reset(
  'RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz'
);

update demo_reset_test_result
set result = public.reset_and_seed_demo(
  'RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz',
  nonce
);

select pg_temp.assert_true(
  (select result ->> 'ok' = 'true' from demo_reset_test_result),
  'El reset transaccional debe completar el dataset Atlas'
);

select pg_temp.expect_sqlstate(
  format(
    'select public.reset_and_seed_demo(%L, %L::uuid)',
    'RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz',
    (select nonce::text from demo_reset_test_result)
  ),
  '42501',
  'El nonce consumido no debe poder reutilizarse'
);

reset role;

select pg_temp.assert_true(
  (
    select environment = 'demo'
      and project_ref = 'wlssekvxpfxhwedsjhpz'
      and reset_enabled is false
      and reset_armed_at is null
      and dataset_version = 'atlas-forwarding-demo-v1'
      and dataset_seeded_at is not null
      and dataset_client_id =
        '10000000-0000-4000-8000-000000000001'::uuid
    from public.platform_environment
    where singleton is true
  ),
  'El sentinel debe quedar listo y ligado al dataset/proyecto autorizados'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.clientes)
  and (select count(*) = 4 from public.quotations)
  and (select count(*) = 1 from public.shipments)
  and (select count(*) = 1 from public.bookings)
  and (select count(*) = 1 from public.invoices)
  and (select count(*) = 3 from public.miami_packages),
  'El seed debe producir los conteos comerciales declarados'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.company_settings cs
    where concat_ws(
      ' ',
      cs.legal_name,
      cs.trade_name,
      cs.email,
      cs.website,
      cs.invoice_footer_note,
      cs.condiciones_bl,
      cs.condiciones_awb,
      cs.condiciones_carta_porte,
      cs.plantilla_cotizacion
    ) ~* '(^|[^[:alnum:]_])sari([[:space:]]+express)?([^[:alnum:]_]|$)'
  )
  and not exists (
    select 1
    from public.email_templates et
    where concat_ws(
      ' ', et.template_key, et.nombre, et.descripcion, et.asunto, et.cuerpo
    ) ~* '(^|[^[:alnum:]_])sari([[:space:]]+express)?([^[:alnum:]_]|$)'
  ),
  'El reset no debe conservar branding Sari en configuracion o correos'
);

select pg_temp.assert_true(
  (
    select count(*) = 4 and bool_and(public is false)
    from storage.buckets
    where id in (
      'avatars',
      'booking-documents',
      'proveedor-docs',
      'miami-package-photos'
    )
  ),
  'Todos los buckets conocidos deben quedar privados despues del reset'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  raw_app_meta_data
)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'demo-admin-01@forwarders.app',
    '{}'::jsonb,
    '{"demo_provisioner":"forwarders-demo-provisioner-v1"}'::jsonb
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'demo-cliente-01@forwarders.app',
    '{}'::jsonb,
    '{"demo_provisioner":"forwarders-demo-provisioner-v1"}'::jsonb
  );

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

select pg_temp.expect_sqlstate(
  $$select public.revoke_demo_slot_sessions(
      '01',
      array['d1000000-0000-4000-8000-000000000001'::uuid]
    )$$,
  '22023',
  'La revocacion no debe aceptar una entrega parcial del slot'
);

select pg_temp.assert_true(
  public.revoke_demo_slot_sessions(
    '01',
    array[
      'd1000000-0000-4000-8000-000000000001'::uuid,
      'd2000000-0000-4000-8000-000000000002'::uuid
    ]
  ) = 0,
  'La revocacion debe validar la pareja exacta aun cuando no haya sesiones'
);

reset role;
rollback;

\echo 'demo_reset_and_seed.sql: OK'
