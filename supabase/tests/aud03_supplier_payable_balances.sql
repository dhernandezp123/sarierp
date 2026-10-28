-- AUD-03: fixtures ficticios, RLS real y consistencia con el core de mutaciones.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.fixture_id(prefix text,n integer) returns uuid language sql immutable as $$
  select (prefix||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.fixture_id('ad030000',n),'role','authenticated')::text,true); end $$;
create function pg_temp.expect_error(command text,expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
  end;
  raise exception 'Expected % but succeeded: %',expected,command;
end $$;

insert into public.tenants(id,slug,name) values(pg_temp.fixture_id('ad030000',100),'aud03-other','AUD-03 otra empresa');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select pg_temp.fixture_id('ad030000',n),'authenticated','authenticated','aud03-'||n||'@test.local','{}'::jsonb from generate_series(1,11)n;
update public.profiles set rol=case right(id::text,3)
  when '001' then 'Admin'::public.user_role when '002' then 'Finanzas'::public.user_role
  when '003' then 'Contabilidad'::public.user_role when '004' then 'Ventas'::public.user_role
  when '005' then 'Pricing'::public.user_role when '006' then 'Operaciones'::public.user_role
  when '007' then 'Cliente'::public.user_role when '011' then 'Admin'::public.user_role else 'Finanzas'::public.user_role end,
  status=case when right(id::text,3)='009' then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3)<>'008',is_platform_admin=right(id::text,3)='011',
  tenant_id=case when right(id::text,3)='010' then pg_temp.fixture_id('ad030000',100)
    when right(id::text,3)='011' then null else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad030000-%';
insert into public.proveedores(id,nombre,tipo,tenant_id) values
  (pg_temp.fixture_id('ad031000',1),'AUD-03 proveedor','Otro','00000000-0000-4000-8000-000000000001'),
  (pg_temp.fixture_id('ad031000',2),'AUD-03 otra empresa','Otro',pg_temp.fixture_id('ad030000',100));
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,moneda,tipo,status,fecha_vencimiento,tenant_id)
select pg_temp.fixture_id('ad032000',n),pg_temp.fixture_id('ad031000',1),'AUD-03 AP '||n,
  case when n=3 then 100 when n=11 then 0.30 else 1000 end,
  case when n=12 then 'HNL' else 'USD' end,'AP',case when n in (5,8) then 'Anulada' else 'Pendiente' end,
  (now() at time zone 'America/Tegucigalpa')::date + case when n=6 then 0 when n in (2,7) then -3 else 30 end,
  '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1,13)n;
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo,tenant_id)
values(pg_temp.fixture_id('ad032000',100),pg_temp.fixture_id('ad031000',2),'AUD-03 other',9999,'AP',pg_temp.fixture_id('ad030000',100));
-- Los fixtures legacy se cargan como owner, sin reescribir estados ni falsificar
-- caminos de usuario: AUD-02 ya prueba la autorizacion de nuevas escrituras.
insert into public.cuentas_pagar(id,proveedor_id,parent_ap_id,descripcion,monto,moneda,tipo,status,tenant_id)
select pg_temp.fixture_id('ad033000',n),pg_temp.fixture_id('ad031000',1),pg_temp.fixture_id('ad032000',
  case when n in (3,4) then 1 when n=5 then 4 when n=6 then 10 when n=7 then 11 when n=8 then 12 else n end),
  'AUD-03 nota',case n when 1 then 200 when 2 then 300 when 3 then 500 when 4 then 700 when 5 then 1000 when 6 then 1200 when 7 then 0.10 else 200 end,
  case when n=8 then 'HNL' else 'USD' end,case when n in (2,4) then 'ND' else 'NC' end,
  case when n in (3,4) then 'Anulada' else 'Pendiente' end,'00000000-0000-4000-8000-000000000001'::uuid
from generate_series(1,8)n;
insert into public.pagos_proveedor(id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,tenant_id)
select pg_temp.fixture_id('ad034000',n),pg_temp.fixture_id('ad032000',
  case n when 1 then 2 when 2 then 3 when 3 then 7 when 4 then 8 when 5 then 9 else 11 end),
  case n when 1 then 100 when 2 then 120 when 3 then 10 when 4 then 20 when 5 then 50 else 0.20 end,
  case when n=5 then 'EUR' else 'USD' end,(now() at time zone 'America/Tegucigalpa')::date,'Otro',
  '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1,6)n;
insert into public.pagos_proveedor(id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,status,reversed_at,reversed_by,reversal_reason,tenant_id)
values(pg_temp.fixture_id('ad034000',7),pg_temp.fixture_id('ad032000',2),50,'USD',current_date,'Otro','Reversado',now(),pg_temp.fixture_id('ad030000',2),'AUD-03 reverso','00000000-0000-4000-8000-000000000001');
insert into public.cuentas_pagar(proveedor_id,parent_ap_id,descripcion,monto,tipo,tenant_id)
select pg_temp.fixture_id('ad031000',1),pg_temp.fixture_id('ad032000',13),'AUD-03 muchas notas',0.01,'NC',
  '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1,1005);
insert into public.pagos_proveedor(cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,tenant_id)
select pg_temp.fixture_id('ad032000',13),0.01,'USD',(now() at time zone 'America/Tegucigalpa')::date,'Otro',
  '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1,1005);

set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*)=13 and bool_and(tipo='AP' and parent_ap_id is null)
  from public.supplier_payable_balances where id::text like 'ad032000-%'),'Solo principales del tenant, sin duplicar notas');
select pg_temp.assert_true((select total_adjusted=800 and pending_balance=800 and credit_notes=200
  and debit_notes=0 and paid_total=0 from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',1)),'NC200: saldo800');
select pg_temp.assert_true((select total_adjusted=1300 and pending_balance=1200 and paid_total=100
  and paid_this_month=100 and days_overdue=3 and status='Parcialmente Pagada' and stored_status='Pendiente'
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',2)),'ND300/pago100, reverso excluido y estado derivado');
select pg_temp.assert_true((select pending_balance=-20 and has_overpayment and needs_reconciliation
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',3)),'Sobrepago visible con saldo negativo');
select pg_temp.assert_true((select pending_balance=0 and total_adjusted=0 and status='Pagada' and not needs_reconciliation
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',4)),'NC total');
select pg_temp.assert_true((select status='Anulada' and days_overdue=0 from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',5)),'Anulada no vencida');
select pg_temp.assert_true((select status='Pendiente' and days_overdue=0 from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',6)),'Vence hoy no vencida');
select pg_temp.assert_true((select pending_balance=990 and days_overdue=3 from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',7)),'Vencido parcial');
select pg_temp.assert_true((select status='Anulada' and paid_total=20 and needs_reconciliation from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',8)),'Legacy anulada con pago activo advertida');
select pg_temp.assert_true((select has_inconsistent_movements and needs_reconciliation and status='Revisar'
  and pending_balance is null and total_adjusted is null and paid_this_month is null
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',9)),'No mezcla montos de distintas monedas');
select pg_temp.assert_true((select total_adjusted=-200 and has_negative_obligation and needs_reconciliation and status='Revisar'
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',10)),'Ajustes excesivos visibles');
select pg_temp.assert_true((select pending_balance=0 and total_adjusted=0.20 and paid_total=0.20 and not has_overpayment
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',11)),'Centavos exactos');
select pg_temp.assert_true((select moneda='HNL' and pending_balance=800 from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',12)),'Moneda propia');
select pg_temp.assert_true((select credit_notes=10.05 and paid_total=10.05 and pending_balance=979.90
  from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',13)),'Agrega mas de 1000 notas/pagos sin truncar ni producto cartesiano');
select pg_temp.assert_true((select proveedores->>'nombre'='AUD-03 proveedor' from public.supplier_payable_balances where id=pg_temp.fixture_id('ad032000',1)),'Metadata del proveedor');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.supplier_payable_balances','INSERT')
  and not has_table_privilege('authenticated','public.supplier_payable_balances','UPDATE')
  and not has_table_privilege('authenticated','public.supplier_payable_balances','DELETE'),'Vista solo lectura');
do $$ declare n integer; begin
  foreach n in array array[1,3] loop
    perform pg_temp.as_user(n);
    perform pg_temp.assert_true((select count(*)=13 from public.supplier_payable_balances where id::text like 'ad032000-%'),'Admin/Contabilidad autorizados');
  end loop;
  foreach n in array array[4,5,6,7,8,9,11] loop
    perform pg_temp.as_user(n);
    perform pg_temp.assert_true((select count(*)=0 from public.supplier_payable_balances),'Sin datos para rol/perfil no autorizado');
  end loop;
end $$;
select pg_temp.as_user(10);
select pg_temp.assert_true((select count(*)=1 and bool_and(pending_balance=9999) from public.supplier_payable_balances),'Segundo tenant aislado');
select pg_temp.as_user(2);
select pg_temp.expect_error($q$select public.supplier_payable_balance_internal(pg_temp.fixture_id('ad032000',1))$q$,'42501');
reset role;
-- Como owner, claims Finance: el core privado tiene exactamente el contrato de
-- saldo de la vista y no modifica estados al consultar.
do $$ declare r record; actual jsonb; begin
  for r in select * from public.supplier_payable_balances where id::text like 'ad032000-%'
    and not has_inconsistent_movements and not has_negative_obligation loop
    actual:=public.supplier_payable_balance_internal(r.id);
    perform pg_temp.assert_true((actual->>'total_adjusted')::numeric=r.total_adjusted
      and (actual->>'paid_total')::numeric=r.paid_total and (actual->>'pending_balance')::numeric=r.pending_balance
      and actual->>'status'=r.status,'Core de mutaciones y lectura coinciden');
  end loop;
end $$;
select pg_temp.expect_error($q$select public.supplier_payable_balance_internal(pg_temp.fixture_id('ad032000',9))$q$,'23514');
select pg_temp.expect_error($q$select public.supplier_payable_balance_internal(pg_temp.fixture_id('ad032000',10))$q$,'23514');
select pg_temp.assert_true((select bool_and(status='Pendiente') from public.cuentas_pagar where id::text like 'ad032000-%' and id not in (pg_temp.fixture_id('ad032000',5),pg_temp.fixture_id('ad032000',8))),'Leer no reescribe estado historico');
set local role anon;
select pg_temp.expect_error($q$select * from public.supplier_payable_balances$q$,'42501');
reset role;
select 'AUD-03: saldos canonicos, anomalias, RLS y equivalencia de mutaciones aprobados' as result;
rollback;
