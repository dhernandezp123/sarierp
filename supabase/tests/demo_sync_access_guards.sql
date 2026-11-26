begin;
do $$
begin
  if not exists (select 1 from public.platform_environment where singleton
    and environment = 'demo' and project_ref = 'wlssekvxpfxhwedsjhpz' and not reset_enabled)
  then raise exception 'Demo sentinel missing'; end if;
  if exists (
    select 1 from pg_tables t where t.schemaname = 'public'
      and t.tablename not in ('platform_environment', 'demo_environment_legacy',
        'demo_terms_acceptances', 'demo_access_events', 'profiles', 'leads')
      and not exists (select 1 from pg_policies p where p.schemaname = t.schemaname
        and p.tablename = t.tablename and p.policyname = 'demo_access_active_guard'
        and p.permissive = 'RESTRICTIVE' and p.qual like '%is_demo_access_active%'
        and p.with_check like '%is_demo_access_active%')
  ) then raise exception 'Missing temporary access guard'; end if;
  if pg_get_functiondef('public.current_tenant_id()'::regprocedure)
    not like '%is_demo_access_active%'
  then raise exception 'Tenant helper lost Demo expiry check'; end if;
  if exists (select 1 from storage.buckets where public)
  then raise exception 'Public Demo bucket'; end if;
end $$;
rollback;
