\set ON_ERROR_STOP on
begin;

-- Ejecutar sobre una base local con la migración aplicada; rollback al terminar.
create function pg_temp.check_legal(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', message; end if;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
('07090000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'legal-erp@test.invalid',
 '{"legal_acceptance":{"version":"2026-09-07","audience":"erp","terms_accepted":true,"privacy_read":true,"recorded_at":"1999-01-01"}}'),
('07090000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'legal-portal@test.invalid',
 '{"requested_role":"Cliente","legal_acceptance":{"version":"2026-09-07","audience":"portal","terms_accepted":true,"privacy_read":true}}'),
('07090000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'legal-legacy@test.invalid', '{}');

select pg_temp.check_legal((select count(*) = 2 from public.signup_legal_acceptances
 where user_id::text like '07090000-%'), 'Solo altas con declaración crean evidencia');
select pg_temp.check_legal((select document_key = 'logistics' from public.signup_legal_acceptances
 where user_id = '07090000-0000-0000-0000-000000000002'), 'Portal registra documento logístico');
select pg_temp.check_legal((select bool_and(recorded_at >= transaction_timestamp())
 from public.signup_legal_acceptances where user_id::text like '07090000-%'), 'Fecha del servidor, no del cliente');
select pg_temp.check_legal((select count(*) = 3 from public.profiles
 where id::text like '07090000-%' and status = 'Pendiente'), 'Aprobación y perfil existentes conservados');

update auth.users set raw_user_meta_data = '{}' where id = '07090000-0000-0000-0000-000000000001';
select pg_temp.check_legal((select count(*) = 1 from public.signup_legal_acceptances
 where user_id = '07090000-0000-0000-0000-000000000001'), 'Editar metadata no borra evidencia');

do $$
declare payload jsonb;
begin
  foreach payload in array array[
    '{"version":"2026-09-07","audience":"erp","terms_accepted":false,"privacy_read":true}'::jsonb,
    '{"version":"2026-09-07","audience":"erp","terms_accepted":"true","privacy_read":true}'::jsonb,
    '{"version":"desconocida","audience":"erp","terms_accepted":true,"privacy_read":true}'::jsonb,
    '{"version":"2026-09-07","audience":"portal","terms_accepted":true,"privacy_read":true}'::jsonb,
    '{"version":"2026-09-07","audience":"erp","terms_accepted":true}'::jsonb,
    'null'::jsonb
  ] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values ('07090000-0000-0000-0000-000000000004', 'legal-invalid@test.invalid', jsonb_build_object('legal_acceptance', payload));
      raise exception 'FAIL: declaración inválida admitida';
    exception when invalid_parameter_value then null;
    end;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"07090000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.check_legal((select count(*) = 1 from public.signup_legal_acceptances), 'RLS permite solo evidencia propia');
do $$ begin
  begin
    update public.signup_legal_acceptances set recorded_at = '1999-01-01';
    raise exception 'FAIL: usuario pudo modificar evidencia';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.signup_legal_acceptances;
    raise exception 'FAIL: usuario pudo borrar evidencia';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.signup_legal_acceptances (user_id, document_key, version, privacy_read)
    values ('07090000-0000-0000-0000-000000000003', 'platform', '2026-09-07', true);
    raise exception 'FAIL: usuario pudo falsificar evidencia';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.signup_legal_acceptances;
    raise exception 'FAIL: anon pudo leer evidencia';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_legal(not has_function_privilege('authenticated', 'public.capture_signup_legal_acceptance()', 'EXECUTE'), 'Trigger no invocable por API');
rollback;
