-- Bridge the older Demo sentinel before applying the canonical verified sentinel.
-- Applied atomically with the restore migration; no customer environment is valid.
do $$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='demo' and project_ref='wlssekvxpfxhwedsjhpz' and not reset_enabled) then
  raise exception 'Expected unarmed Demo environment';
 end if;
end $$;
alter table public.platform_environment rename to demo_environment_legacy;
alter function public.is_demo_environment() rename to demo_environment_legacy_check;
revoke all on public.demo_environment_legacy from public,anon,authenticated,service_role;
revoke all on function public.demo_environment_legacy_check() from public,anon,authenticated,service_role;
