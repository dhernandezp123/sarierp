\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
declare denied boolean:=false;
begin begin execute command; exception when others then denied:=true; end;
  if not denied then raise exception 'Se esperaba rechazo: %',command; end if;
end $$;

insert into public.tenants(id,slug,name) values ('00000000-0000-4000-8000-000000000099','intake-other','Otra empresa');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000009901','authenticated','authenticated','intake-admin@test.local','{}'),
('00000000-0000-0000-0000-000000009902','authenticated','authenticated','intake-sales@test.local','{}'),
('00000000-0000-0000-0000-000000009903','authenticated','authenticated','intake-other@test.local','{}');
update public.profiles set tenant_id='00000000-0000-4000-8000-000000000001',rol='Admin',status='Aprobado',is_active=true,is_platform_admin=false,nombre='Admin',apellido='Pruebas'
where id='00000000-0000-0000-0000-000000009901';
update public.profiles set tenant_id='00000000-0000-4000-8000-000000000001',rol='Ventas',status='Aprobado',is_active=true,is_platform_admin=false,nombre='Vendedor',apellido='Cliente'
where id='00000000-0000-0000-0000-000000009902';
update public.profiles set tenant_id='00000000-0000-4000-8000-000000000099',rol='Admin',status='Aprobado',is_active=true,is_platform_admin=false
where id='00000000-0000-0000-0000-000000009903';
select pg_temp.expect_denied($q$insert into public.mail_intake_settings(tenant_id,mailbox) values('00000000-0000-4000-8000-000000000099','pricing@sarihn.com')$q$);
update public.mail_intake_settings set default_seller_id='00000000-0000-0000-0000-000000009901',enabled=true
where tenant_id='00000000-0000-4000-8000-000000000001';
-- Historical messages must not consume a reference.
select pg_temp.assert_true(public.register_mail_intake_message('00000000-0000-4000-8000-000000000001',
jsonb_build_object('message_id','historical','sender','new@test.local','received_at',now()-interval '1 day'),'request') is null,'No replay historico');
select public.register_mail_intake_message('00000000-0000-4000-8000-000000000001',
jsonb_build_object('message_id','new-request','conversation_id','thread-new','sender','new@test.local','subject','Solicitud de cotizacion','received_at',now()+interval '1 second'),'request');
select public.register_mail_intake_message('00000000-0000-4000-8000-000000000001',
jsonb_build_object('message_id','new-request','conversation_id','thread-new','sender','new@test.local','received_at',now()+interval '1 second'),'request');
select pg_temp.assert_true((select count(*)=1 from public.mail_intake_messages where message_id='new-request'),'Replay idempotente');
select pg_temp.assert_true((select q.status='Borrador' and q.created_by='00000000-0000-0000-0000-000000009901' and q.quotation_number like 'SARIHN-%-AP'
from public.mail_intake_messages m join public.quotations q on q.id=m.quotation_id where m.message_id='new-request'),'Borrador con referencia AP');
select public.register_mail_intake_message('00000000-0000-4000-8000-000000000001',
jsonb_build_object('message_id','follow-up','conversation_id','thread-new','sender','new@test.local','received_at',now()+interval '1 second'),'request');
select pg_temp.assert_true((select status='review' and quotation_id is null from public.mail_intake_messages where message_id='follow-up'),'Seguimiento sin nueva referencia');
insert into public.clientes(id,tenant_id,nombre,email_2,vendedor_asignado) values
('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000000001','Cliente intake','known@test.local','00000000-0000-0000-0000-000000009902');
select public.register_mail_intake_message('00000000-0000-4000-8000-000000000001',
jsonb_build_object('message_id','known-request','sender','known@test.local','received_at',now()+interval '1 second'),'request');
select pg_temp.assert_true((select q.created_by='00000000-0000-0000-0000-000000009902' and q.cliente_id='00000000-0000-4000-8000-000000009901'
from public.mail_intake_messages m join public.quotations q on q.id=m.quotation_id where m.message_id='known-request'),'Vendedor del cliente');
select pg_temp.expect_denied($q$update public.mail_intake_settings set default_seller_id='00000000-0000-0000-0000-000000009903'$q$);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009903',true);
select pg_temp.assert_true((select count(*)=0 from public.mail_intake_settings),'Otro tenant sin acceso');
select pg_temp.assert_true((select count(*)=0 from public.mail_intake_messages),'Otro tenant sin historial');
select pg_temp.expect_denied('select * from public.mail_intake_runtime');
select pg_temp.expect_denied($q$select public.register_mail_intake_message('00000000-0000-4000-8000-000000000001','{}','request')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009902',true);
select pg_temp.assert_true((select count(*)=0 from public.mail_intake_settings),'Ventas sin acceso a configuracion');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009901',true);
select pg_temp.assert_true((select count(*)=1 from public.mail_intake_settings),'Admin Sari ve configuracion');
select pg_temp.expect_denied($q$update public.mail_intake_settings set mailbox='other@example.com'$q$);
reset role;
rollback;
