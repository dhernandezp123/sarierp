alter table public.platform_environment
 add column project_ref text,
 add column reset_enabled boolean not null default false,
 add column reset_nonce uuid not null default gen_random_uuid(),
 add column reset_armed_at timestamptz,
 add column dataset_client_id uuid,
 add column dataset_seeded_at timestamptz,
 add column dataset_version text,
 add column updated_at timestamptz not null default now();
update public.platform_environment n set
 project_ref=o.project_ref,reset_nonce=o.reset_nonce,
 dataset_client_id=o.dataset_client_id,dataset_seeded_at=o.dataset_seeded_at,
 dataset_version=o.dataset_version,updated_at=o.updated_at,
 verified_at=now(),verified_by='Demo-only schema parity release'
from public.demo_environment_legacy o where n.singleton and o.singleton and o.environment='demo';
grant execute on function public.is_demo_environment() to anon,authenticated;
-- Existing provisioning reads this sentinel; resetting is closed by the final bridge.
grant select,update on public.platform_environment to service_role;
