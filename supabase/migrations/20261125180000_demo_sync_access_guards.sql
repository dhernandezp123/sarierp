-- DEMO-SYNC-20261125: keep new shared tables behind temporary Demo access.
do $$
declare relation record;
begin
  if not exists (
    select 1 from public.platform_environment
    where singleton and environment = 'demo'
      and project_ref = 'wlssekvxpfxhwedsjhpz' and not reset_enabled
  ) then raise exception 'Demo sentinel required'; end if;

  for relation in
    select tablename from pg_tables where schemaname = 'public'
      and tablename not in ('platform_environment', 'demo_environment_legacy',
        'demo_terms_acceptances', 'demo_access_events', 'profiles', 'leads')
  loop
    execute format('drop policy if exists demo_access_active_guard on public.%I', relation.tablename);
    execute format('create policy demo_access_active_guard on public.%I as restrictive for all to authenticated using (public.is_demo_access_active()) with check (public.is_demo_access_active())', relation.tablename);
  end loop;

  if exists (select 1 from storage.buckets where public) then
    raise exception 'Demo Storage must remain private';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'demo_parity_storage_block'
    and permissive = 'RESTRICTIVE') then
    raise exception 'Demo Storage guard missing';
  end if;
end $$;
notify pgrst, 'reload schema';
