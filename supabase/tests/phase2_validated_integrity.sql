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
  exception when unique_violation then
    was_denied := true;
  end;
  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select bool_and(convalidated)
    from pg_constraint
    where conname in (
      'miami_packages_tipo_carga_check',
      'miami_packages_cargo_status_check',
      'miami_packages_nonnegative_measurements_check',
      'miami_manifests_total_packages_nonnegative_check'
    )
  ),
  'Los constraints Miami deben estar validados'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'phase2-integrity@test.local',
  '{}'::jsonb
);

insert into public.quotations (id, created_by, quotation_number)
values (
  '21000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'QT-PHASE2-INTEGRITY'
);

insert into public.agent_quotes (quotation_id, agente_nombre, is_selected)
values (
  '21000000-0000-0000-0000-000000000001',
  'Agente A',
  true
);

select pg_temp.expect_denied(
  $$insert into public.agent_quotes (quotation_id, agente_nombre, is_selected)
    values ('21000000-0000-0000-0000-000000000001', 'Agente B', true)$$,
  'Debe impedir dos tarifas seleccionadas para una cotización'
);

insert into public.shipping_instructions (routing_number, quotation_id)
values ('SI-PHASE2-1', '21000000-0000-0000-0000-000000000001');

select pg_temp.expect_denied(
  $$insert into public.shipping_instructions (routing_number, quotation_id)
    values ('SI-PHASE2-2', '21000000-0000-0000-0000-000000000001')$$,
  'Debe impedir dos Shipping Instructions activas para una cotización'
);

insert into public.proveedores (id, nombre, tipo)
values ('22000000-0000-0000-0000-000000000001', 'Proveedor Phase 2', 'Agente');

insert into public.cuentas_pagar (
  proveedor_id,
  descripcion,
  numero_factura_proveedor,
  monto
)
values (
  '22000000-0000-0000-0000-000000000001',
  'Factura original',
  ' INV-001 ',
  100
);

select pg_temp.expect_denied(
  $$insert into public.cuentas_pagar
      (proveedor_id, descripcion, numero_factura_proveedor, monto)
    values
      ('22000000-0000-0000-0000-000000000001', 'Factura duplicada', 'inv-001', 100)$$,
  'Debe impedir números de factura AP duplicados por proveedor'
);

rollback;

\echo 'phase2_validated_integrity.sql: OK'
