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

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.legal_document_versions
    where version = '2026-09-24'
      and (
        (document_key = 'platform'
          and document_path = '/legal/platform-2026-09-24.json'
          and content_sha256 = 'a6458ebcf3965c2ba4e03061cd73f571b385de895623b490dbd44575751e83ca')
        or
        (document_key = 'logistics'
          and document_path = '/legal/logistics-2026-09-24.json'
          and content_sha256 = '11e0e7bcc3889798788c763e34a7e421c963b65c4375d902c272c34ee2916d26')
      )
  ),
  'el catálogo debe contener ambas ediciones y sus hashes'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  (
    '09240000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'legal-current-erp@test.invalid',
    jsonb_build_object(
      'tenant_hostname', 'sari.forwarders.app',
      'legal_acceptance', jsonb_build_object(
        'version', '2026-09-24',
        'audience', 'erp',
        'terms_accepted', true,
        'privacy_read', true
      )
    )
  ),
  (
    '09240000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'legal-current-portal@test.invalid',
    jsonb_build_object(
      'tenant_hostname', 'sari.forwarders.app',
      'requested_role', 'Cliente',
      'legal_acceptance', jsonb_build_object(
        'version', '2026-09-24',
        'audience', 'portal',
        'terms_accepted', true,
        'privacy_read', true
      )
    )
  );

select pg_temp.assert_true(
  exists (
    select 1
    from public.signup_legal_acceptances
    where user_id = '09240000-0000-0000-0000-000000000001'
      and document_key = 'platform'
      and version = '2026-09-24'
      and tenant_id is not null
  ),
  'el alta ERP debe registrar la edición de plataforma vigente y su tenant'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.signup_legal_acceptances
    where user_id = '09240000-0000-0000-0000-000000000002'
      and document_key = 'logistics'
      and version = '2026-09-24'
      and tenant_id is not null
  ),
  'el alta de portal debe registrar la edición logística vigente y su tenant'
);

do $$
begin
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data)
    values (
      '09240000-0000-0000-0000-000000000003',
      'authenticated',
      'authenticated',
      'legal-current-invalid@test.invalid',
      jsonb_build_object(
        'tenant_hostname', 'sari.forwarders.app',
        'legal_acceptance', jsonb_build_object(
          'version', '2026-09-25',
          'audience', 'erp',
          'terms_accepted', true,
          'privacy_read', true
        )
      )
    );
    raise exception 'ASSERTION FAILED: una edición no registrada fue aceptada';
  exception when invalid_parameter_value then
    null;
  end;
end;
$$;

rollback;
