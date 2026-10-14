-- Ejecutar SOLO antes de AUD-02, en una base aislada; todo termina en rollback.
-- Demuestra que dos formularios con el mismo saldo pueden aplicar 60 + 60 a AP 100.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
values('ad020000-0000-4000-8000-000000000001','authenticated','authenticated','aud02-before@test.local','{}');
update public.profiles set rol='Finanzas',status='Aprobado',is_active=true,
  tenant_id='00000000-0000-4000-8000-000000000001'
where id='ad020000-0000-4000-8000-000000000001';
insert into public.proveedores(id,nombre,tipo,tenant_id)
values('ad021000-0000-4000-8000-000000000001','AUD-02 before','Otro','00000000-0000-4000-8000-000000000001');
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo,tenant_id)
values('ad022000-0000-4000-8000-000000000001','ad021000-0000-4000-8000-000000000001','AUD-02 before',100,'AP','00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad020000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.pagos_proveedor(cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,created_by)
values('ad022000-0000-4000-8000-000000000001',60,'USD',current_date,'Transferencia','ad020000-0000-4000-8000-000000000001'),
  ('ad022000-0000-4000-8000-000000000001',60,'USD',current_date,'Transferencia','ad020000-0000-4000-8000-000000000001');
update public.cuentas_pagar set status='Anulada' where id='ad022000-0000-4000-8000-000000000001';
do $$ begin
  if (select sum(monto) from public.pagos_proveedor where cuenta_pagar_id='ad022000-0000-4000-8000-000000000001') <> 120
    or (select status from public.cuentas_pagar where id='ad022000-0000-4000-8000-000000000001') <> 'Anulada' then
    raise exception 'La reproduccion no confirmo el fallo anterior';
  end if;
end $$;
select 'AUD-02 BEFORE: sobrepago 120/100 y anulacion sin motivo reproducidos' as result;
rollback;
