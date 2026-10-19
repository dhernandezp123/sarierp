\set ON_ERROR_STOP on
-- Target IDs with fictional names in an empty isolated database; rollback only.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'ASSERTION FAILED: %', message; end if; end $$;
insert into auth.users(id, aud, role, email, raw_user_meta_data) values
 ('af377000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'si-repair-ops@test.local', '{}');
update public.profiles set rol = 'Operaciones', status = 'Aprobado', is_active = true,
 tenant_id = '00000000-0000-4000-8000-000000000001' where id = 'af377000-0000-4000-8000-000000000001';
insert into public.clientes(id, nombre, tenant_id) values
 ('96078cfc-f6e9-4945-9306-c6b787aea3d2', 'Previous fixture', '00000000-0000-4000-8000-000000000001'),
 ('4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4', 'Current fixture', '00000000-0000-4000-8000-000000000001');
insert into public.quotations(id, quotation_number, cliente_id, status, created_by, tenant_id) values
 ('9720a5c2-a187-4cca-98ca-439e60095d48', 'SARIHN-2610-0340-AP', '4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4',
  'Ganada', 'af377000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', '{"sub":"af377000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.shipping_instructions(id, routing_number, quotation_id, client_id, created_by, tenant_id) values
 ('3abede6a-c1a0-43b0-a112-5c38c678c483', 'RT0039', '9720a5c2-a187-4cca-98ca-439e60095d48',
  '96078cfc-f6e9-4945-9306-c6b787aea3d2', 'af377000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', '{}', true);
update public.shipments set operational_status = 'Sin bookings', closed_at = now()
 where id = '3abede6a-c1a0-43b0-a112-5c38c678c483';
\ir ../migrations/20261019201000_repair_rt0039_client.sql
select pg_temp.assert_true((select client_id = '96078cfc-f6e9-4945-9306-c6b787aea3d2'
 from public.shipping_instructions where id = '3abede6a-c1a0-43b0-a112-5c38c678c483'), 'Closed operation is not repaired');
update public.shipments set closed_at = null where id = '3abede6a-c1a0-43b0-a112-5c38c678c483';
update public.quotations set cliente_id = '96078cfc-f6e9-4945-9306-c6b787aea3d2'
 where id = '9720a5c2-a187-4cca-98ca-439e60095d48';
\ir ../migrations/20261019201000_repair_rt0039_client.sql
select pg_temp.assert_true((select client_id = '96078cfc-f6e9-4945-9306-c6b787aea3d2'
 from public.shipments where id = '3abede6a-c1a0-43b0-a112-5c38c678c483'), 'Subsequent quotation change is not overwritten');
update public.quotations set cliente_id = '4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4'
 where id = '9720a5c2-a187-4cca-98ca-439e60095d48';
\ir ../migrations/20261019201000_repair_rt0039_client.sql
select pg_temp.assert_true((select si.client_id = q.cliente_id and s.client_id = q.cliente_id
 from public.shipping_instructions si join public.shipments s on s.shipping_instruction_id = si.id
 join public.quotations q on q.id = si.quotation_id
 where si.id = '3abede6a-c1a0-43b0-a112-5c38c678c483'), 'Both customer links are repaired');
\ir ../migrations/20261019201000_repair_rt0039_client.sql
select pg_temp.assert_true((select count(*) = 1 from public.activity_logs
 where entity_id = '3abede6a-c1a0-43b0-a112-5c38c678c483' and action = 'shipping_instruction_client_backfilled'
 and metadata->>'previous_si_client_id' = '96078cfc-f6e9-4945-9306-c6b787aea3d2'
 and metadata->>'client_id' = '4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4'), 'Repair is audited and idempotent');
rollback;
\echo 'shipping_instruction_client_repair.sql: OK'
