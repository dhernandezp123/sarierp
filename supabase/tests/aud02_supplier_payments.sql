-- AUD-02: RLS y RPC reales con fixtures ficticios. No usar en produccion.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.expect_error(command text,expected_state text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'Expected % but succeeded: %',expected_state,command;
end $$;
create function pg_temp.fixture_id(prefix text,n integer) returns uuid language sql immutable as $$
  select (prefix || '-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.fixture_id('ad020000',n),'role','authenticated')::text,true); end $$;
create function pg_temp.pay(n integer,amount numeric,key_number integer default null) returns jsonb language sql as $$
  select public.register_supplier_payment(pg_temp.fixture_id('ad022000',n),
    case when key_number is null then gen_random_uuid() else pg_temp.fixture_id('ad023000',key_number) end,
    amount,'USD',(now() at time zone 'America/Tegucigalpa')::date,'Transferencia','AUD-02',null);
$$;

insert into public.tenants(id,slug,name) values(pg_temp.fixture_id('ad020000',100),'aud02-other','AUD-02 otra empresa');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select pg_temp.fixture_id('ad020000',n),'authenticated','authenticated','aud02-'||n||'@test.local','{}'::jsonb from generate_series(1,12)n;
update public.profiles set rol=case right(id::text,3)
  when '001' then 'Admin'::public.user_role when '012' then 'Admin'::public.user_role when '002' then 'Finanzas'::public.user_role
  when '003' then 'Contabilidad'::public.user_role when '004' then 'Ventas'::public.user_role
  when '005' then 'Pricing'::public.user_role when '006' then 'Operaciones'::public.user_role
  when '007' then 'Cliente'::public.user_role else 'Finanzas'::public.user_role end,
  status=case when right(id::text,3)='009' then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3)<>'008',is_platform_admin=right(id::text,3)='012',
  tenant_id=case when right(id::text,3)='010' then pg_temp.fixture_id('ad020000',100)
    when right(id::text,3)='012' then null else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad020000-%';
insert into public.proveedores(id,nombre,tipo,tenant_id) values
  (pg_temp.fixture_id('ad021000',1),'AUD-02 proveedor','Otro','00000000-0000-4000-8000-000000000001'),
  (pg_temp.fixture_id('ad021000',2),'AUD-02 otra empresa','Otro',pg_temp.fixture_id('ad020000',100));
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo,fecha_vencimiento,tenant_id)
select pg_temp.fixture_id('ad022000',n),pg_temp.fixture_id('ad021000',1),'AUD-02 AP '||n,100,'AP',
  (now() at time zone 'America/Tegucigalpa')::date + case when n=4 then -1 else 30 end,
  '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1,8)n;
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo,tenant_id)
values(pg_temp.fixture_id('ad022000',100),pg_temp.fixture_id('ad021000',2),'AUD-02 other',100,'AP',pg_temp.fixture_id('ad020000',100));
-- Movimientos legacy sin clave tambien se preservan y pueden reversarse.
insert into public.pagos_proveedor(id,tenant_id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago)
values(pg_temp.fixture_id('ad024000',1),'00000000-0000-4000-8000-000000000001',pg_temp.fixture_id('ad022000',4),100,'USD',current_date,'Otro');

set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*)=8 from public.cuentas_pagar where id::text like 'ad022000-%'),'Finanzas ve solo su tenant');
select pg_temp.assert_true((pg_temp.pay(1,40,1)->>'status')='Parcialmente Pagada','Pago y estado atomicos');
select pg_temp.assert_true((pg_temp.pay(1,40,1)->>'already_applied')::boolean,'Reintento devuelve el mismo pago');
select pg_temp.assert_true((select count(*)=1 from public.pagos_proveedor where cuenta_pagar_id=pg_temp.fixture_id('ad022000',1)),'Sin duplicados');
select pg_temp.expect_error($q$select pg_temp.pay(1,41,1)$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.pay(1,61)$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.pay(1,'NaN'::numeric)$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.pay(1,0)$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.pay(1,0.001)$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_payment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),1,'HNL',current_date,'Otro')$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_payment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),1,'USD',current_date+2,'Otro')$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_payment(pg_temp.fixture_id('ad022000',1),null,1,'USD',current_date,'Otro')$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_payment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),1,'USD',null,'Otro')$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_payment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),1,'USD',current_date,'No valido')$q$,'23514');

select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),pg_temp.fixture_id('ad025000',1),'NC','Descuento',20);
select pg_temp.assert_true((public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),pg_temp.fixture_id('ad025000',1),'NC','Descuento',20)->>'already_applied')::boolean,'NC reintentada sin duplicado');
select pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),pg_temp.fixture_id('ad025000',1),'NC','Descuento',21)$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),'NC','Exceso',41)$q$,'23514');
select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),pg_temp.fixture_id('ad025000',2),'ND','Cargo',10);
select pg_temp.assert_true((pg_temp.pay(1,50,2)->>'status')='Pagada','Base 100 - NC20 + ND10, pagos 40+50');
select pg_temp.expect_error($q$select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',1),'Anular')$q$,'23514');
select pg_temp.expect_error($q$select public.cancel_supplier_payable((select id from public.cuentas_pagar where request_key=pg_temp.fixture_id('ad025000',2)),'Anular ND')$q$,'23514');
select pg_temp.assert_true((select status<>'Anulada' from public.cuentas_pagar where request_key=pg_temp.fixture_id('ad025000',2)),'Anulacion ND invalida se revierte');
select pg_temp.expect_error($q$select public.register_supplier_payment((select id from public.cuentas_pagar where request_key=pg_temp.fixture_id('ad025000',1)),gen_random_uuid(),1,'USD',current_date,'Otro')$q$,'42501');

-- Authenticated no puede eludir las RPC; service/owner tampoco edita el original.
select pg_temp.expect_error($q$insert into public.pagos_proveedor(cuenta_pagar_id,monto) values(pg_temp.fixture_id('ad022000',1),1)$q$,'42501');
select pg_temp.expect_error($q$insert into public.cuentas_pagar(proveedor_id,descripcion,monto,tipo,parent_ap_id) values(pg_temp.fixture_id('ad021000',1),'Directa',1,'NC',pg_temp.fixture_id('ad022000',1))$q$,'42501');
select pg_temp.expect_error($q$update public.cuentas_pagar set status='Anulada' where id=pg_temp.fixture_id('ad022000',1)$q$,'42501');
select pg_temp.expect_error($q$update public.cuentas_pagar set monto=1000 where id=pg_temp.fixture_id('ad022000',1)$q$,'42501');
select pg_temp.expect_error($q$delete from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',1)$q$,'42501');
with changed as (update public.pagos_proveedor set monto=1 where cuenta_pagar_id=pg_temp.fixture_id('ad022000',1) returning id)
select pg_temp.assert_true((select count(*)=0 from changed),'RLS bloquea UPDATE directo');
with removed as (delete from public.pagos_proveedor where cuenta_pagar_id=pg_temp.fixture_id('ad022000',1) returning id)
select pg_temp.assert_true((select count(*)=0 from removed),'RLS bloquea DELETE directo');
-- Alta AP y adjuntos del flujo existente siguen permitidos.
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo)
values(pg_temp.fixture_id('ad022000',9),pg_temp.fixture_id('ad021000',1),'AP nueva',100,'AP');
update public.cuentas_pagar set documento_url='fixture.pdf' where id=pg_temp.fixture_id('ad022000',9);
select pg_temp.assert_true((select documento_url='fixture.pdf' from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',9)),'Adjunto compatible');

-- Reverso conserva el pago, su motivo, responsable y fecha; reabre la cuenta.
select public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',2)),'Pago equivocado');
select pg_temp.assert_true((select status='Parcialmente Pagada' from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',1)),'Estado tras reverso');
select pg_temp.assert_true((select monto=50 and status='Reversado' and reversed_by=pg_temp.fixture_id('ad020000',2) and reversed_at is not null from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',2)),'Original conservado y auditado');
select pg_temp.assert_true((pg_temp.pay(1,50,2)->>'payment_status')='Reversado','Reintento de clave reversada no vuelve a aplicar');
select pg_temp.assert_true((public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',2)),'Pago equivocado')->>'already_applied')::boolean,'Reverso idempotente');
select pg_temp.expect_error($q$select public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',2)),'Otro motivo')$q$,'23514');
select pg_temp.expect_error($q$select public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',1)),'   ')$q$,'23514');
select public.cancel_supplier_payable((select id from public.cuentas_pagar where request_key=pg_temp.fixture_id('ad025000',2)),'Cargo incorrecto');
select public.cancel_supplier_payable((select id from public.cuentas_pagar where request_key=pg_temp.fixture_id('ad025000',1)),'Descuento incorrecto');
select public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',1)),'Anulacion de cuenta');
select pg_temp.expect_error($q$select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',1),'')$q$,'23514');
select pg_temp.assert_true((public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',1),'Factura duplicada')->>'status')='Anulada','Anula con historial reversado y notas anuladas');
select pg_temp.assert_true((public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',1),'Factura duplicada')->>'already_applied')::boolean,'Anulacion idempotente');
select pg_temp.expect_error($q$select pg_temp.pay(1,1)$q$,'23514');
select pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',1),gen_random_uuid(),'ND','Cargo',1)$q$,'23514');
select pg_temp.assert_true((pg_temp.pay(1,40,1)->>'already_applied')::boolean,'Replay historico confirmado incluso tras anulacion');
select pg_temp.assert_true((public.reverse_supplier_payment(pg_temp.fixture_id('ad024000',1),'Legacy')->>'status')='Vencida','Legacy sin clave, reverso reabre vencida');
-- Una cuenta anulada sin movimientos tambien conserva su base y existencia.
select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',2),'Documento sin servicio');
select pg_temp.expect_error($q$update public.cuentas_pagar set monto=200 where id=pg_temp.fixture_id('ad022000',2)$q$,'42501');
select pg_temp.expect_error($q$delete from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',2)$q$,'42501');

-- Matriz de roles y tenants con las cuatro RPC y cores privados.
do $$ declare n integer; begin
  foreach n in array array[4,5,6,7,8,9,10,12] loop
    perform pg_temp.as_user(n);
    perform pg_temp.expect_error($q$select pg_temp.pay(2,1)$q$,'42501');
    perform pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',2),gen_random_uuid(),'ND','Cargo',1)$q$,'42501');
    perform pg_temp.expect_error($q$select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',2),'Motivo')$q$,'42501');
    perform pg_temp.expect_error($q$select public.reverse_supplier_payment(pg_temp.fixture_id('ad024000',1),'Motivo')$q$,'42501');
    perform pg_temp.expect_error($q$select public.lock_supplier_payable_internal(pg_temp.fixture_id('ad022000',2))$q$,'42501');
    perform pg_temp.expect_error($q$select public.supplier_payable_balance_internal(pg_temp.fixture_id('ad022000',2))$q$,'42501');
    perform pg_temp.expect_error($q$select public.finish_supplier_action_internal(pg_temp.fixture_id('ad022000',2),'fake','{}')$q$,'42501');
  end loop;
  foreach n in array array[1,3] loop
    perform pg_temp.as_user(n);
    perform pg_temp.assert_true((pg_temp.pay(n+4,10)->>'paid_total')::numeric=10,'Admin/Contabilidad permitidos');
  end loop;
end $$;
select pg_temp.as_user(2);
select pg_temp.expect_error($q$select pg_temp.pay(100,1)$q$,'42501');
select pg_temp.assert_true((select count(*)=0 from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',100)),'RLS lectura cross-tenant');
select pg_temp.as_user(10);
select pg_temp.assert_true((pg_temp.pay(100,10)->>'paid_total')::numeric=10,'Finanzas de segundo tenant opera su cuenta');
select pg_temp.assert_true((select bool_and(tenant_id=pg_temp.fixture_id('ad020000',100)) from public.pagos_proveedor where cuenta_pagar_id=pg_temp.fixture_id('ad022000',100)),'Pago hereda tenant del padre');
select pg_temp.as_user(2);
select pg_temp.pay(8,20,8);

reset role;
select pg_temp.expect_error($q$update public.pagos_proveedor set monto=1 where id=pg_temp.fixture_id('ad024000',1)$q$,'42501');
select pg_temp.expect_error($q$delete from public.pagos_proveedor where id=pg_temp.fixture_id('ad024000',1)$q$,'42501');
select pg_temp.expect_error($q$update public.cuentas_pagar set monto=1 where request_key=pg_temp.fixture_id('ad025000',1)$q$,'42501');
-- Un fallo de auditoria cancela tanto el movimiento como el estado.
create function pg_temp.fail_supplier_audit() returns trigger language plpgsql as $$
begin if new.entity_id in (pg_temp.fixture_id('ad022000',3),pg_temp.fixture_id('ad022000',8)) then raise exception 'AUD-02 simulated audit failure'; end if; return new; end $$;
create trigger aud02_fail_audit before insert on public.activity_logs for each row execute function pg_temp.fail_supplier_audit();
set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.expect_error($q$select pg_temp.pay(3,100,3)$q$,'P0001');
select pg_temp.assert_true((select count(*)=0 from public.pagos_proveedor where cuenta_pagar_id=pg_temp.fixture_id('ad022000',3)),'Rollback del pago');
select pg_temp.assert_true((select status='Pendiente' from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',3)),'Rollback del estado');
select pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',3),gen_random_uuid(),'NC','Fallo',100)$q$,'P0001');
select pg_temp.assert_true((select count(*)=0 from public.cuentas_pagar where parent_ap_id=pg_temp.fixture_id('ad022000',3)),'Rollback de NC');
select pg_temp.expect_error($q$select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',3),'Fallo anulacion')$q$,'P0001');
select pg_temp.assert_true((select status='Pendiente' and cancelled_at is null from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',3)),'Rollback de anulacion y metadatos');
select pg_temp.expect_error($q$select public.reverse_supplier_payment((select id from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',8)),'Fallo reverso')$q$,'P0001');
select pg_temp.assert_true((select status='Aplicado' and reversed_at is null and reversal_reason is null from public.pagos_proveedor where request_key=pg_temp.fixture_id('ad023000',8)),'Rollback del reverso y metadatos');
select pg_temp.assert_true((select status='Parcialmente Pagada' from public.cuentas_pagar where id=pg_temp.fixture_id('ad022000',8)),'Rollback del estado tras reverso');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_error($q$select pg_temp.pay(2,1)$q$,'42501');
select pg_temp.expect_error($q$select public.register_supplier_adjustment(pg_temp.fixture_id('ad022000',2),gen_random_uuid(),'NC','Anon',1)$q$,'42501');
select pg_temp.expect_error($q$select public.cancel_supplier_payable(pg_temp.fixture_id('ad022000',2),'Anon')$q$,'42501');
select pg_temp.expect_error($q$select public.reverse_supplier_payment(pg_temp.fixture_id('ad024000',1),'Anon')$q$,'42501');
reset role;
select pg_temp.assert_true((select count(*)>0 from public.activity_logs where action='supplier_payment_registered' and entity_id=pg_temp.fixture_id('ad022000',1)),'Auditoria registrada');
select 'AUD-02: pagos, ajustes, reversos, permisos y rollback aprobados' as result;
rollback;
