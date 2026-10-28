\set ON_ERROR_STOP on
-- PNOTE-01: ejecutar solo en una base aislada con las migraciones vigentes.
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_write_denied(command text)
returns void language plpgsql as $$
declare changed integer;
begin
  begin
    execute command;
    get diagnostics changed = row_count;
  exception when insufficient_privilege then return;
  end;
  if changed <> 0 then raise exception 'Expected write denial: %', command; end if;
end;
$$;

insert into public.tenants(id, slug, name)
values ('ae010000-0000-4000-8000-000000000100', 'pnote-other', 'PNOTE otra empresa');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('ae010000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'pnote-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 5) n;
update public.profiles set
  rol = case right(id::text, 3)
    when '001' then 'Pricing'::public.user_role
    when '002' then 'Admin'::public.user_role
    when '003' then 'Ventas'::public.user_role
    when '004' then 'Cliente'::public.user_role
    else 'Pricing'::public.user_role end,
  status = 'Aprobado', is_active = true,
  tenant_id = case when right(id::text, 3) = '005'
    then 'ae010000-0000-4000-8000-000000000100'::uuid
    else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ae010000-%';
insert into public.quotations(id, quotation_number, quote_type, status, created_by, tenant_id)
select ('ae012000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'TEST-PNOTE-' || n, case when n = 1 then 'FCL' else 'LCL' end,
  'Pendiente de Fijar Precios', 'ae010000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 2) n;
insert into public.agent_quotes(id, quotation_id, agente_nombre, ocean_freight, suggested_sale, is_selected, tenant_id)
select ('ae014000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('ae012000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'PNOTE agente', 100, 150, true, '00000000-0000-4000-8000-000000000001'::uuid from generate_series(1, 2) n;
select pg_temp.assert_true((select count(*) = 2 from public.agent_quotes
  where id::text like 'ae014000-%' and internal_notes is null), 'Notas opcionales en tarifas existentes');
create temp table pnote_rates as select id, to_jsonb(aq) - 'internal_notes' as snapshot
  from public.agent_quotes aq where id::text like 'ae014000-%';
create temp table pnote_quotes as select id, to_jsonb(q) as snapshot
  from public.quotations q where id::text like 'ae012000-%';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.agent_quotes set internal_notes = E'Salida directa.\nMás días libres.' where id::text like 'ae014000-%';
select pg_temp.assert_true((select count(*) = 2 from public.agent_quotes
  where id::text like 'ae014000-%' and internal_notes = E'Salida directa.\nMás días libres.'), 'Pricing guarda FCL y LCL con saltos de línea');
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.agent_quotes set internal_notes = 'Tarifa elegida por disponibilidad' where id = 'ae014000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select internal_notes = 'Tarifa elegida por disponibilidad' from public.agent_quotes
  where id = 'ae014000-0000-4000-8000-000000000001'), 'Admin puede editar notas');
update public.agent_quotes set internal_notes = null where id = 'ae014000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select internal_notes is null from public.agent_quotes
  where id = 'ae014000-0000-4000-8000-000000000002'), 'Se puede vaciar una nota');

select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.expect_write_denied($q$update public.agent_quotes set internal_notes = 'Ventas' where id::text like 'ae014000-%'$q$);
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select pg_temp.expect_write_denied($q$update public.agent_quotes set internal_notes = 'Cliente' where id::text like 'ae014000-%'$q$);
select pg_temp.assert_true((select count(*) = 0 from public.agent_quotes where id::text like 'ae014000-%'), 'Cliente no puede leer notas internas');
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select pg_temp.expect_write_denied($q$update public.agent_quotes set internal_notes = 'Otro tenant' where id::text like 'ae014000-%'$q$);
select pg_temp.assert_true((select count(*) = 0 from public.agent_quotes where id::text like 'ae014000-%'), 'Sin lectura entre empresas');
reset role;
select pg_temp.assert_true((select count(*) = 2 from public.agent_quotes aq join pnote_rates b using (id)
  where to_jsonb(aq) - 'internal_notes' = b.snapshot), 'Notas no cambian costos, selección ni otros campos');
select pg_temp.assert_true((select count(*) = 2 from public.quotations q join pnote_quotes b using (id)
  where to_jsonb(q) = b.snapshot), 'Notas no alteran estado ni cotización');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.agent_quotes(id, quotation_id, agente_nombre, ocean_freight, internal_notes, tenant_id)
select ('ae015000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('ae012000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Alternativa con nota', 200, 'Disponibilidad por confirmar', '00000000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 2) n;
select pg_temp.assert_true((select count(*) = 2 from public.agent_quotes
  where id::text like 'ae015000-%' and internal_notes = 'Disponibilidad por confirmar' and is_selected is false), 'Crear tarifas FCL/LCL con notas propias');
reset role;
select set_config('request.jwt.claims', '', true);
update public.quotations set status = 'Pricing Aprobado' where id::text like 'ae012000-%';
update public.quotations set status = 'Enviada al Cliente' where id::text like 'ae012000-%';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ae010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_write_denied($q$update public.agent_quotes set internal_notes = 'Cambio tardío' where id::text like 'ae014000-%'$q$);
reset role;
rollback;
