-- Demo-only bootstrap for empty local replay; preserves an existing sentinel.
do $$ begin
 if not exists(select 1 from public.profiles) and not exists(select 1 from public.clientes) then
  update public.platform_environment set environment='demo',project_ref='wlssekvxpfxhwedsjhpz'
  where singleton and environment='production' and project_ref is null;
 end if;
 if not exists(select 1 from public.platform_environment where singleton and environment='demo' and project_ref='wlssekvxpfxhwedsjhpz') then
  raise exception 'Demo branch requires its own sandbox sentinel';
 end if;
end $$;
