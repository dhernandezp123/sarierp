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
declare was_denied boolean := false;
begin
  begin execute command;
  exception when others then was_denied := true;
  end;
  if not was_denied then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values ('46000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'finance-cxc@test.local', '{}'::jsonb);

update public.profiles set rol = 'Finanzas', status = 'Aprobado', is_active = true
where id = '46000000-0000-0000-0000-000000000001';

insert into public.clientes (id, nombre, rtn)
values ('47000000-0000-0000-0000-000000000001', 'Cliente CxC', '08011999123456');

insert into public.invoices (
  id, invoice_number, invoice_type, status, cliente_id, cliente_nombre,
  issue_date, due_date, subtotal, tax_amount, total, currency, exchange_rate,
  parent_invoice_id
)
values
  ('48000000-0000-0000-0000-000000000001', 'CXC-FAC-001', 'Factura', 'Aprobada',
   '47000000-0000-0000-0000-000000000001', 'Cliente CxC', current_date - 10,
   current_date - 1, 100, 0, 100, 'USD', 1, null),
  ('48000000-0000-0000-0000-000000000002', 'CXC-NC-001', 'Nota de Crédito', 'Enviada',
   '47000000-0000-0000-0000-000000000001', 'Cliente CxC', current_date - 5,
   null, 20, 0, 20, 'USD', 1, '48000000-0000-0000-0000-000000000001'),
  ('48000000-0000-0000-0000-000000000003', 'CXC-ND-001', 'Nota de Débito', 'Enviada',
   '47000000-0000-0000-0000-000000000001', 'Cliente CxC', current_date - 4,
   null, 10, 0, 10, 'USD', 1, '48000000-0000-0000-0000-000000000001');

select pg_temp.assert_true(
  (
    select original_total = 100 and credit_notes = 20 and debit_notes = 10
      and adjusted_total = 90 and paid_total = 0 and balance = 90
      and receivable_status = 'Vencida' and days_overdue = 1
    from public.invoice_receivables
    where invoice_id = '48000000-0000-0000-0000-000000000001'
  ),
  'CxC debe calcular factura menos NC más ND menos pagos aplicados'
);

select public.refresh_invoice_receivable_statuses();

select pg_temp.assert_true(
  (
    select status = 'Vencida'
    from public.invoices
    where id = '48000000-0000-0000-0000-000000000001'
  ),
  'La sincronización debe marcar automáticamente la factura vencida'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.register_invoice_payment(
  '48000000-0000-0000-0000-000000000001', 40, 'USD', current_date,
  'Transferencia', 'CXC-REF-001', null
);

select pg_temp.assert_true(
  (
    select adjusted_total = 90 and paid_total = 40 and balance = 50
      and receivable_status = 'Vencida'
    from public.invoice_receivables
    where invoice_id = '48000000-0000-0000-0000-000000000001'
  ),
  'Un pago parcial debe reducir el saldo y conservar vencimiento'
);

select pg_temp.expect_denied(
  $$select public.register_invoice_payment(
    '48000000-0000-0000-0000-000000000001', 51, 'USD', current_date,
    null, null, null
  )$$,
  'No se debe pagar más que el saldo ajustado por notas'
);

select * from public.register_invoice_payment(
  '48000000-0000-0000-0000-000000000001', 50, 'USD', current_date,
  'Transferencia', 'CXC-REF-002', null
);

select pg_temp.assert_true(
  (
    select balance = 0 and receivable_status = 'Pagada'
    from public.invoice_receivables
    where invoice_id = '48000000-0000-0000-0000-000000000001'
  ),
  'Al completar el saldo ajustado la factura debe quedar pagada'
);

select pg_temp.expect_denied(
  $$insert into public.invoices (
      invoice_number, invoice_type, status, cliente_id, issue_date,
      subtotal, tax_amount, total, currency, exchange_rate, parent_invoice_id
    ) values (
      'CXC-NC-BAD', 'Nota de Crédito', 'Enviada',
      '47000000-0000-0000-0000-000000000001', current_date,
      1, 0, 1, 'HNL', 1, '48000000-0000-0000-0000-000000000001'
    )$$,
  'Una nota no puede usar moneda distinta de su factura'
);

reset role;

select pg_temp.assert_true(
  exists (
    select 1 from cron.job
    where jobname = 'refresh-invoice-receivable-statuses'
      and schedule = '5 0 * * *'
  ),
  'Debe existir la tarea diaria de actualización de vencimientos'
);

rollback;

\echo 'phase4_receivables.sql: OK'
