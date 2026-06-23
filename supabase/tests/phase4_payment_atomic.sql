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
  ('43000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'finance-payment@test.local', '{}'::jsonb),
  ('43000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ventas-payment@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '43000000-0000-0000-0000-000000000001' then 'Finanzas'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre, rtn)
values (
  '44000000-0000-0000-0000-000000000001',
  'Cliente de pagos',
  '08011999123456'
);

insert into public.invoices (
  id, invoice_number, invoice_type, status, cliente_id, cliente_nombre,
  issue_date, subtotal, tax_amount, total, currency, exchange_rate
)
values (
  '45000000-0000-0000-0000-000000000001',
  'TEST-PAY-001', 'Factura', 'Aprobada',
  '44000000-0000-0000-0000-000000000001', 'Cliente de pagos',
  current_date, 100, 0, 100, 'USD', 1
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"43000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.register_invoice_payment(
  '45000000-0000-0000-0000-000000000001',
  40, 'USD', current_date, 'Transferencia', 'REF-001', 'Pago parcial'
);

select pg_temp.assert_true(
  (
    select status = 'Parcialmente Pagada' and paid_date is null
    from public.invoices
    where id = '45000000-0000-0000-0000-000000000001'
  ),
  'El primer pago debe dejar la factura parcialmente pagada'
);

select * from public.register_invoice_payment(
  '45000000-0000-0000-0000-000000000001',
  60, 'USD', current_date, 'Transferencia', 'REF-002', 'Pago final'
);

select pg_temp.assert_true(
  (
    select status = 'Pagada' and paid_date = current_date
    from public.invoices
    where id = '45000000-0000-0000-0000-000000000001'
  ),
  'El pago completo debe marcar factura y fecha en la misma transacción'
);

select pg_temp.expect_denied(
  $$select public.register_invoice_payment(
    '45000000-0000-0000-0000-000000000001',
    1, 'USD', current_date, null, null, null
  )$$,
  'No debe aceptarse un pago sobre una factura ya pagada'
);

select pg_temp.expect_denied(
  $$update public.invoices
    set status = 'Anulada'
    where id = '45000000-0000-0000-0000-000000000001'$$,
  'No debe anularse una factura con pagos aplicados'
);

select * from public.reverse_invoice_payment(
  (
    select id
    from public.invoice_payments
    where invoice_id = '45000000-0000-0000-0000-000000000001'
      and amount = 40
  ),
  'Transferencia identificada en cuenta incorrecta'
);

select pg_temp.assert_true(
  (
    select status = 'Parcialmente Pagada' and paid_date is null
    from public.invoices
    where id = '45000000-0000-0000-0000-000000000001'
  ),
  'El reverso debe recalcular estado y fecha de pago'
);

select pg_temp.assert_true(
  (
    select status = 'Reversado'
      and reversed_at is not null
      and reversed_by = '43000000-0000-0000-0000-000000000001'
      and reversal_reason is not null
    from public.invoice_payments
    where invoice_id = '45000000-0000-0000-0000-000000000001'
      and amount = 40
  ),
  'El pago original debe conservarse con auditoría de reverso'
);

select pg_temp.expect_denied(
  $$delete from public.invoice_payments
    where invoice_id = '45000000-0000-0000-0000-000000000001'$$,
  'Los pagos no deben poder eliminarse físicamente'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.activity_logs
    where entity_id = '45000000-0000-0000-0000-000000000001'
      and action in ('Pago registrado', 'Pago reversado')
  ),
  'Registro y reverso deben crear eventos de auditoría'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"43000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select public.register_invoice_payment(
    '45000000-0000-0000-0000-000000000001',
    1, 'USD', current_date, null, null, null
  )$$,
  'Ventas no debe registrar pagos'
);

reset role;
rollback;

\echo 'phase4_payment_atomic.sql: OK'
