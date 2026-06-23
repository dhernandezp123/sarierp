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
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'finance-cai@test.local', '{}'::jsonb),
  ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ventas-cai@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '40000000-0000-0000-0000-000000000001' then 'Finanzas'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.cai_ranges (
  id, cai, document_type, rango_desde, rango_hasta,
  fecha_limite_emision, is_active
)
values
  (
    '41000000-0000-0000-0000-000000000001', 'CAI-FAC-A', 'Factura',
    '000-001-01-00000001', '000-001-01-00000100', current_date + 30, false
  ),
  (
    '41000000-0000-0000-0000-000000000002', 'CAI-FAC-B', 'Factura',
    '000-001-01-00000101', '000-001-01-00000200', current_date + 60, false
  ),
  (
    '41000000-0000-0000-0000-000000000003', 'CAI-NC-A', 'Nota de Crédito',
    '000-001-02-00000001', '000-001-02-00000100', current_date + 30, false
  );

insert into public.clientes (
  id, nombre, rtn, direccion, email_1
)
values (
  '42000000-0000-0000-0000-000000000001',
  'Cliente fiscal de prueba',
  '08011999123456',
  'Tegucigalpa, Honduras',
  'cliente-fiscal@test.local'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select public.activate_cai_range('41000000-0000-0000-0000-000000000001');
select public.activate_cai_range('41000000-0000-0000-0000-000000000002');
select public.activate_cai_range('41000000-0000-0000-0000-000000000003');

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(*) filter (where document_type = 'Factura') = 1
      and count(*) filter (where document_type = 'Nota de Crédito') = 1
    from public.cai_ranges
    where is_active is true
  ),
  'Debe existir un solo CAI activo por tipo documental'
);

select * from public.create_invoice_with_items(
  jsonb_build_object(
    'invoice_type', 'Factura',
    'cliente_id', '42000000-0000-0000-0000-000000000001',
    'issue_date', current_date,
    'currency', 'USD',
    'exchange_rate', 25.30
  ),
  jsonb_build_array(
    jsonb_build_object(
      'description', 'Flete marítimo',
      'quantity', 2,
      'unit_price', 100,
      'isv_rate', 15,
      'sort_order', 0
    ),
    jsonb_build_object(
      'description', 'Cargo exento',
      'quantity', 1,
      'unit_price', 50,
      'isv_rate', 0,
      'sort_order', 1
    )
  )
);

select * from public.create_invoice_with_items(
  jsonb_build_object(
    'invoice_type', 'Factura',
    'cliente_id', '42000000-0000-0000-0000-000000000001',
    'issue_date', current_date,
    'currency', 'HNL',
    'exchange_rate', 1
  ),
  jsonb_build_array(
    jsonb_build_object(
      'description', 'Servicio local',
      'quantity', 1,
      'unit_price', 1000,
      'isv_rate', 18,
      'sort_order', 0
    )
  )
);

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(distinct invoice_number) = 2
      and min(invoice_number) = '000-001-01-00000101'
      and max(invoice_number) = '000-001-01-00000102'
    from public.invoices
    where cliente_id = '42000000-0000-0000-0000-000000000001'
      and invoice_type = 'Factura'
  ),
  'La numeración fiscal debe ser correlativa y no duplicarse'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
      and sum(amount) = 1250
      and sum(ii.tax_amount) = 210
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.cliente_id = '42000000-0000-0000-0000-000000000001'
  ),
  'La factura y sus líneas deben guardarse juntas con impuestos calculados'
);

select pg_temp.assert_true(
  (
    select next_number = 103
    from public.cai_ranges
    where id = '41000000-0000-0000-0000-000000000002'
  ),
  'El correlativo CAI debe avanzar dentro de la misma transacción'
);

select pg_temp.expect_denied(
  $$select public.create_invoice_with_items(
    jsonb_build_object(
      'invoice_type', 'Nota de Débito',
      'cliente_id', '42000000-0000-0000-0000-000000000001',
      'issue_date', current_date,
      'currency', 'HNL',
      'exchange_rate', 1,
      'parent_invoice_id', (
        select id::text
        from public.invoices
        where cliente_id = '42000000-0000-0000-0000-000000000001'
          and invoice_type = 'Factura'
        order by invoice_number
        limit 1
      ),
      'motivo', 'Ajuste de prueba'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'description', 'Ajuste',
        'quantity', 1,
        'unit_price', 10,
        'isv_rate', 15,
        'sort_order', 0
      )
    )
  )$$,
  'No debe emitirse un documento fiscal sin CAI activo'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select public.activate_cai_range('41000000-0000-0000-0000-000000000001')$$,
  'Ventas no debe activar rangos CAI'
);

reset role;
rollback;

\echo 'phase4_cai_atomic.sql: OK'
