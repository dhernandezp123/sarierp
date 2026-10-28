-- AUD-07 release dependency. A fresh installation is always Demo until an
-- authorized database owner verifies and configures its actual environment.
create table public.platform_environment (
  singleton boolean primary key default true check (singleton is true),
  environment text not null check (environment in ('demo', 'production')),
  verified_at timestamptz,
  verified_by text,
  constraint production_environment_requires_verification check (
    environment = 'demo' or (verified_at is not null and length(btrim(verified_by)) >= 3 and verified_by is not null)
  )
);
alter table public.platform_environment enable row level security;
revoke all on public.platform_environment from public, anon, authenticated, service_role;
grant select on public.platform_environment to service_role;
insert into public.platform_environment(singleton, environment) values (true, 'demo');

create function public.is_demo_environment()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select environment from public.platform_environment where singleton is true), 'demo') <> 'production';
$$;
revoke all on function public.is_demo_environment() from public, anon, authenticated;
grant execute on function public.is_demo_environment() to service_role;
