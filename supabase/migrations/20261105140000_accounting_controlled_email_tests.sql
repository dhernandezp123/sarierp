-- GOV-CLIENTS-04B: pruebas expresamente autorizadas, separadas de facturas/cobranza.
create table public.accounting_email_tests(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),cliente_id uuid not null,
 request_id uuid not null,recipient_email text not null,authorization_reason text not null check(length(btrim(authorization_reason)) between 5 and 1000),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped','uncertain')),
 attempts integer not null default 0 check(attempts between 0 and 5),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),sent_at timestamptz,
 resend_message_id text,error_message text,request_body text,provider_key text,provider_credential_hash text,first_attempt_at timestamptz,lease_token uuid,retry_authorized boolean not null default false,
 unique(tenant_id,request_id),foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id)
);
alter table public.accounting_email_tests enable row level security;
revoke all on public.accounting_email_tests from public,anon,authenticated;
grant select on public.accounting_email_tests to authenticated;
grant all on public.accounting_email_tests to service_role;
create policy accounting_email_tests_finance_read on public.accounting_email_tests for select to authenticated
using(tenant_id=public.current_tenant_id() and public.is_approved_active_user() and public.can_manage_finance());
comment on table public.accounting_email_tests is 'Prueba controlada autorizada y sin cobro real; no forma parte del scheduler ni crea facturas, preferencias o invitaciones.';
notify pgrst,'reload schema';
