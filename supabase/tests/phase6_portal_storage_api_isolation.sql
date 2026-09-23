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
  denied boolean := false;
begin
  begin execute command;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 13
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
      and is_nullable = 'NO'
      and table_name in (
        'activity_logs', 'client_email_deliveries', 'client_notifications',
        'notifications', 'profile_role_change_logs', 'push_tokens',
        'signup_legal_acceptances', 'user_tasks', 'support_tickets',
        'support_ticket_messages', 'support_ticket_attachments',
        'support_ticket_events', 'support_notification_outbox'
      )
  ) and (
    select count(*) = 13 and bool_and(permissive = 'RESTRICTIVE')
    from pg_policies
    where schemaname = 'public'
      and policyname = 'tenant_isolation_guard'
      and tablename in (
        'activity_logs', 'client_email_deliveries', 'client_notifications',
        'notifications', 'profile_role_change_logs', 'push_tokens',
        'signup_legal_acceptances', 'user_tasks', 'support_tickets',
        'support_ticket_messages', 'support_ticket_attachments',
        'support_ticket_events', 'support_notification_outbox'
      )
  ),
  'Las 13 tablas de portal/auditoría/soporte deben exigir tenant y RLS restrictivo'
);

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000016', 'mya-phase6', 'MYA Phase 6', 'Activo');

insert into public.tenant_domains (tenant_id, hostname, is_primary, is_active)
values ('00000000-0000-4000-8000-000000000016', 'mya-phase6.forwarders.app', true, true);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000961', 'authenticated', 'authenticated', 'sari-admin-p6@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000962', 'authenticated', 'authenticated', 'mya-admin-p6@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000963', 'authenticated', 'authenticated', 'platform-p6@test.local', '{}'::jsonb);

update public.profiles
set rol = 'Admin'::public.user_role,
    status = 'Aprobado',
    is_active = true,
    tenant_id = case id
      when '00000000-0000-0000-0000-000000000961' then '00000000-0000-4000-8000-000000000001'::uuid
      when '00000000-0000-0000-0000-000000000962' then '00000000-0000-4000-8000-000000000016'::uuid
      else null
    end,
    is_platform_admin = id = '00000000-0000-0000-0000-000000000963'
where id in (
  '00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962',
  '00000000-0000-0000-0000-000000000963'
);

insert into public.activity_logs (tenant_id, user_id, module, action, description)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000961', 'phase6', 'sari', 'Sari'),
  ('00000000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000962', 'phase6', 'mya', 'MYA');

insert into public.support_tickets (
  id, tenant_id, ticket_number, subject, category, priority, status, created_by
) values
  (
    '00000000-0000-4000-8000-000000000661',
    '00000000-0000-4000-8000-000000000001',
    'P6-SARI', 'Soporte Sari Fase 6', 'Consulta', 'Normal', 'Nuevo',
    '00000000-0000-0000-0000-000000000961'
  ),
  (
    '00000000-0000-4000-8000-000000000662',
    '00000000-0000-4000-8000-000000000016',
    'P6-MYA', 'Soporte MYA Fase 6', 'Consulta', 'Normal', 'Nuevo',
    '00000000-0000-0000-0000-000000000962'
  );

insert into public.support_ticket_messages (id, tenant_id, ticket_id, author_id, body)
values
  ('00000000-0000-4000-8000-000000000671', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000661', '00000000-0000-0000-0000-000000000961', 'Mensaje Sari'),
  ('00000000-0000-4000-8000-000000000672', '00000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000662', '00000000-0000-0000-0000-000000000962', 'Mensaje MYA');

insert into public.support_ticket_attachments (
  tenant_id, ticket_id, message_id, uploaded_by, file_name, file_path, mime_type, size_bytes
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000661',
    '00000000-0000-4000-8000-000000000671',
    '00000000-0000-0000-0000-000000000961',
    'sari.pdf',
    '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000661/00000000-0000-0000-0000-000000000961/sari.pdf',
    'application/pdf', 100
  ),
  (
    '00000000-0000-4000-8000-000000000016',
    '00000000-0000-4000-8000-000000000662',
    '00000000-0000-4000-8000-000000000672',
    '00000000-0000-0000-0000-000000000962',
    'mya.pdf',
    '00000000-0000-4000-8000-000000000016/00000000-0000-4000-8000-000000000662/00000000-0000-0000-0000-000000000962/mya.pdf',
    'application/pdf', 100
  );

insert into storage.objects (bucket_id, name, owner_id)
values
  ('support-attachments', '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000661/00000000-0000-0000-0000-000000000961/sari.pdf', '00000000-0000-0000-0000-000000000961'),
  ('support-attachments', '00000000-0000-4000-8000-000000000016/00000000-0000-4000-8000-000000000662/00000000-0000-0000-0000-000000000962/mya.pdf', '00000000-0000-0000-0000-000000000962');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000961","role":"authenticated"}', true);

select pg_temp.assert_true(
  (select count(*) = 1 from public.activity_logs where module = 'phase6')
  and public.can_view_support_ticket('00000000-0000-4000-8000-000000000661')
  and not public.can_view_support_ticket('00000000-0000-4000-8000-000000000662')
  and (select count(*) = 1 from storage.objects where bucket_id = 'support-attachments'),
  'Sari solo debe ver su auditoría, ticket y attachment'
);

select pg_temp.expect_denied(
  $$insert into public.notifications (tenant_id, user_id, title)
    values ('00000000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000962', 'Cross tenant')$$,
  'Un Admin Sari no debe crear notificaciones para MYA'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000962","role":"authenticated"}', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.activity_logs where module = 'phase6')
  and public.can_view_support_ticket('00000000-0000-4000-8000-000000000662')
  and not public.can_view_support_ticket('00000000-0000-4000-8000-000000000661')
  and (select count(*) = 1 from storage.objects where bucket_id = 'support-attachments'),
  'MYA solo debe ver su auditoría, ticket y attachment'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000963","role":"authenticated"}', true);
select pg_temp.assert_true(
  public.can_view_support_ticket('00000000-0000-4000-8000-000000000661')
  and public.can_view_support_ticket('00000000-0000-4000-8000-000000000662')
  and (select count(*) = 2 from storage.objects where bucket_id = 'support-attachments'),
  'Hernova debe poder atender ambos tickets sin convertir los datos operativos en globales'
);

rollback;
