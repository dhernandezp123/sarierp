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

create or replace function pg_temp.expect_failure(command text, message text)
returns void language plpgsql as $$
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

update public.platform_environment
set environment = 'demo',
    project_ref = 'wlssekvxpfxhwedsjhpz',
    reset_enabled = false,
    reset_armed_at = null,
    dataset_version = 'atlas-forwarding-demo-v1',
    dataset_seeded_at = now(),
    dataset_client_id = '10000000-0000-4000-8000-000000000001'
where singleton is true;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  'a1411000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'demo-finance-flow@test.local',
  '{}'::jsonb
);

update public.profiles
set rol = 'Admin',
    status = 'Aprobado',
    is_active = true,
    is_demo_user = true,
    demo_expires_at = now() + interval '1 day',
    demo_access_grant_id = 'a1411000-0000-4000-8000-000000000002',
    is_platform_admin = false
where id = 'a1411000-0000-4000-8000-000000000001';

insert into public.clientes (
  id, nombre, rtn, direccion, email_1, condicion_pago, dias_credito
)
values (
  'a1411000-0000-4000-8000-000000000010',
  'Cliente flujo financiero Demo',
  '08011999123456',
  'San Pedro Sula, Honduras',
  'cliente-demo@test.local',
  'Contado',
  0
);

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  financial_validation_status
)
values (
  'a1411000-0000-4000-8000-000000000020',
  'a1411000-0000-4000-8000-000000000010',
  'a1411000-0000-4000-8000-000000000001',
  'Ganada',
  'DEMO-Q-FINANCE-TEST',
  'Pendiente'
);

insert into public.pricing_items (
  id, quotation_id, item_type, description, cost_amount, sale_amount,
  currency, created_by, quantity, taxable, tax_rate, tax_amount, total_amount
)
values (
  'a1411000-0000-4000-8000-000000000030',
  'a1411000-0000-4000-8000-000000000020',
  'freight',
  'Flete ficticio para proforma Demo',
  70,
  100,
  'USD',
  'a1411000-0000-4000-8000-000000000001',
  1,
  false,
  0,
  0,
  100
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1411000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"a1411000-0000-4000-8000-000000000002"}}',
  true
);

update public.quotations
set financial_validation_status = 'Validado'
where id = 'a1411000-0000-4000-8000-000000000020';

select *
from public.create_invoice_from_quotation(
  jsonb_build_object(
    'invoice_type', 'Proforma',
    'cliente_id', 'a1411000-0000-4000-8000-000000000010',
    'issue_date', current_date,
    'currency', 'USD',
    'exchange_rate', 1,
    'notes', 'Documento ficticio sin validez fiscal'
  ),
  'a1411000-0000-4000-8000-000000000020'
);

reset role;

select pg_temp.assert_true(
  (
    select i.invoice_type = 'Proforma'
      and i.invoice_number like 'DEMO-PRO-%'
      and i.total = 100
    from public.invoices i
    where i.quotation_id = 'a1411000-0000-4000-8000-000000000020'
  ),
  'La cotizacion validada debe crear una Proforma Demo por el total cotizado'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(
        ii.source_pricing_item_id = 'a1411000-0000-4000-8000-000000000030'
      )
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.quotation_id = 'a1411000-0000-4000-8000-000000000020'
  ),
  'La linea debe conservar el vinculo canonico al pricing item'
);

update public.invoices
set status = 'Aprobada',
    lugar_emision = 'San Pedro Sula'
where quotation_id = 'a1411000-0000-4000-8000-000000000020';

set local role authenticated;

select *
from public.register_invoice_payment_v2(
  (
    select id from public.invoices
    where quotation_id = 'a1411000-0000-4000-8000-000000000020'
  ),
  25,
  'USD',
  current_date,
  'No aplica',
  'San Pedro Sula',
  'Cheque',
  'CHK-DEMO-001',
  'Pago ficticio para recibo Demo',
  '[]'::jsonb
);

reset role;

select pg_temp.assert_true(
  (
    select p.status = 'Aplicado'
      and p.payment_method = 'Cheque'
      and s.reference = 'CHK-DEMO-001'
    from public.invoice_payments p
    join public.invoice_payment_splits s on s.payment_id = p.id
    join public.invoices i on i.id = p.invoice_id
    where i.quotation_id = 'a1411000-0000-4000-8000-000000000020'
  ),
  'El pago ficticio debe conservar metodo, referencia y desglose para el recibo'
);

set local role authenticated;

select pg_temp.expect_failure(
  $sql$
    select * from public.create_invoice_from_quotation(
      jsonb_build_object(
        'invoice_type', 'Factura',
        'cliente_id', 'a1411000-0000-4000-8000-000000000010',
        'issue_date', current_date,
        'currency', 'USD',
        'exchange_rate', 1
      ),
      'a1411000-0000-4000-8000-000000000020'
    )
  $sql$,
  'Demo nunca debe aceptar una Factura fiscal vinculada'
);

select pg_temp.expect_failure(
  $sql$
    select * from public.create_invoice_from_quotation(
      jsonb_build_object(
        'invoice_type', 'Proforma',
        'cliente_id', 'a1411000-0000-4000-8000-000000000010',
        'issue_date', current_date,
        'currency', 'USD',
        'exchange_rate', 1
      ),
      'a1411000-0000-4000-8000-000000000020'
    )
  $sql$,
  'Una cotizacion no debe crear dos documentos activos'
);

reset role;
rollback;
