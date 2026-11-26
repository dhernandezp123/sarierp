\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERT: %',m;end if;end $$;
create function pg_temp.reject(c text,expected text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected rejection';end $$;
insert into public.tenants(id,slug,name) values
('ab130000-0000-4000-8000-000000000100','due-date-test','Due fixture'),
('ab130000-0000-4000-8000-000000000200','due-date-other','Other fixture');
insert into public.clientes(id,tenant_id,nombre,condicion_pago,dias_credito) values
('ab130000-0000-4000-8000-000000000001','ab130000-0000-4000-8000-000000000100','Credit fixture','Credito',30),
('ab130000-0000-4000-8000-000000000002','ab130000-0000-4000-8000-000000000100','Cash fixture','Contado',0);
-- Exercise the actual production trigger function with fixture rows only.
create temp table due_probe(id integer primary key,tenant_id uuid,invoice_type text,cliente_id uuid,issue_date date,due_date date,payment_condition text,credit_days integer);
create trigger due_probe_trigger before insert or update on due_probe for each row execute function public.set_invoice_credit_terms();
insert into due_probe values
(1,'ab130000-0000-4000-8000-000000000100','Factura','ab130000-0000-4000-8000-000000000001','2026-11-13',null,null,null),
(2,'ab130000-0000-4000-8000-000000000100','Factura','ab130000-0000-4000-8000-000000000001','2026-11-13','2026-12-31',null,null),
(3,'ab130000-0000-4000-8000-000000000100','Proforma','ab130000-0000-4000-8000-000000000002','2026-12-31','2027-01-30',null,null),
(4,'ab130000-0000-4000-8000-000000000100','Factura','ab130000-0000-4000-8000-000000000002','2026-11-13',null,null,null),
(5,'ab130000-0000-4000-8000-000000000100','Nota de Crédito','ab130000-0000-4000-8000-000000000001','2026-11-13','2026-12-31',null,null);
select pg_temp.ok((select due_date='2026-12-13' and credit_days=30 and payment_condition='Credito' from due_probe where id=1),'Client terms supply the default across months');
select pg_temp.ok((select due_date='2026-12-31' and credit_days=48 and payment_condition='Credito' from due_probe where id=2),'Manual due date survives and records actual document terms');
select pg_temp.ok((select due_date='2027-01-30' and credit_days=30 and payment_condition='Credito' from due_probe where id=3),'Proforma can cross year without changing client');
select pg_temp.ok((select due_date=issue_date and credit_days=0 and payment_condition='Contado' from due_probe where id=4),'Cash default remains same day');
select pg_temp.ok((select due_date is null and credit_days is null and payment_condition is null from due_probe where id=5),'Credit notes keep their existing date rules');
select pg_temp.ok((select condicion_pago='Contado' and dias_credito=0 from public.clientes where id='ab130000-0000-4000-8000-000000000002'),'Manual document terms never update the client');
select pg_temp.reject($c$update due_probe set due_date='2026-11-12' where id=1$c$,'anterior');
select pg_temp.reject($c$insert into due_probe values(6,'ab130000-0000-4000-8000-000000000200','Factura','ab130000-0000-4000-8000-000000000001','2026-11-13','2026-12-31',null,null)$c$,'no existe');
update due_probe set due_date='2027-01-13' where id=2;
select pg_temp.ok((select due_date='2027-01-13' and credit_days=61 from due_probe where id=2),'Manual update survives the trigger');
select pg_temp.ok((select due_date='2026-12-13' from due_probe where id=1),'Other documents stay unchanged');
rollback;
