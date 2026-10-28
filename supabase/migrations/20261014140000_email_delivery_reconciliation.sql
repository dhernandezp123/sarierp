-- AUD-08. Deploy with the shared email delivery helper; no automatic legacy reset.
begin;

alter table public.client_email_deliveries
  drop constraint client_email_deliveries_status_check,
  add constraint client_email_deliveries_status_check check (status in ('processing', 'sent', 'failed', 'uncertain')),
  add column request_body text,
  add column provider_key text,
  add column first_attempt_at timestamptz,
  add column lease_token uuid,
  add column retry_authorized boolean not null default false;
alter table public.support_notification_outbox
  drop constraint support_notification_outbox_status_check,
  add constraint support_notification_outbox_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'skipped', 'uncertain')),
  add column request_body text,
  add column provider_key text,
  add column first_attempt_at timestamptz,
  add column lease_token uuid,
  add column retry_authorized boolean not null default false;

-- Snapshots contain message content. Existing staff SELECT does not expose these columns.
revoke select on public.client_email_deliveries, public.support_notification_outbox from authenticated;
grant select (id, tenant_id, package_id, event_type, recipient_email, status, attempts,
  resend_message_id, error_message, created_at, updated_at, sent_at)
  on public.client_email_deliveries to authenticated;
grant select (id, tenant_id, ticket_id, message_id, event_type, recipient_email, idempotency_key,
  status, attempts, resend_message_id, error_message, created_at, updated_at, sent_at)
  on public.support_notification_outbox to authenticated;

create table public.email_delivery_reconciliations (
  id uuid primary key default gen_random_uuid(),
  delivery_kind text not null check (delivery_kind in ('miami', 'support')),
  delivery_id uuid not null,
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references public.profiles(id),
  outcome text not null check (outcome in ('accepted', 'not_accepted')),
  evidence text not null check (char_length(btrim(evidence)) between 20 and 2000),
  provider_message_id text,
  previous_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.email_delivery_reconciliations enable row level security;
revoke all on public.email_delivery_reconciliations from public, anon, authenticated, service_role;
grant select, insert on public.email_delivery_reconciliations to service_role;

-- Maintenance only: an operator verifies provider logs/ID before invoking this RPC.
-- No provider call, email, or resetting attempts occurs in this transaction.
create function public.reconcile_email_delivery(
  p_kind text, p_delivery_id uuid, p_tenant_id uuid, p_expected_updated_at timestamptz,
  p_actor_id uuid, p_outcome text, p_evidence text, p_provider_message_id text default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_row jsonb;
  v_actor public.profiles%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_kind is null or p_kind not in ('miami', 'support')
    or p_outcome is null or p_outcome not in ('accepted', 'not_accepted')
    or p_evidence is null or char_length(btrim(p_evidence)) not between 20 and 2000
    or p_expected_updated_at is null then
    raise exception 'Invalid reconciliation evidence or parameters' using errcode = '22023';
  end if;
  if p_outcome = 'accepted' and nullif(btrim(p_provider_message_id), '') is null then
    raise exception 'Accepted email requires verified provider ID' using errcode = '22023';
  end if;
  if p_outcome = 'not_accepted' and p_provider_message_id is not null then
    raise exception 'Non-acceptance cannot include an accepted provider ID' using errcode = '22023';
  end if;
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found or v_actor.status <> 'Aprobado' or v_actor.is_active is not true
    or (p_kind = 'miami' and (v_actor.rol <> 'Admin' or v_actor.is_platform_admin is true or v_actor.tenant_id is distinct from p_tenant_id))
    or (p_kind = 'support' and v_actor.is_platform_admin is not true) then
    raise exception 'Reconciliation requires responsible administrator' using errcode = '42501';
  end if;
  v_table := case p_kind when 'miami' then 'client_email_deliveries' else 'support_notification_outbox' end;
  execute format('select to_jsonb(d) from public.%I d where id=$1 and tenant_id=$2 for update', v_table)
    into v_row using p_delivery_id, p_tenant_id;
  if v_row is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if (v_row->>'updated_at')::timestamptz is distinct from p_expected_updated_at
    or v_row->>'status' not in ('processing', 'uncertain', 'failed')
    or (v_row->>'status' = 'processing' and (v_row->>'updated_at')::timestamptz > v_now - interval '2 minutes') then
    raise exception 'Delivery changed or remains active' using errcode = 'PT409';
  end if;
  if p_outcome = 'accepted' then
    execute format('update public.%I set status=''sent'', resend_message_id=$1, sent_at=$2, updated_at=$2,
      error_message=null, lease_token=null, retry_authorized=false where id=$3 and tenant_id=$4', v_table)
      using btrim(p_provider_message_id), v_now, p_delivery_id, p_tenant_id;
  else
    -- Explicit proof of non-acceptance permits ONE new frozen request/key, still capped at 5 attempts.
    execute format('update public.%I set status=''failed'', resend_message_id=null, sent_at=null, updated_at=$1,
      error_message=''Non-acceptance verified by administrator'', request_body=null, provider_key=null,
      first_attempt_at=null, lease_token=null, retry_authorized=true where id=$2 and tenant_id=$3', v_table)
      using v_now, p_delivery_id, p_tenant_id;
  end if;
  insert into public.email_delivery_reconciliations(delivery_kind, delivery_id, tenant_id, actor_id,
    outcome, evidence, provider_message_id, previous_state)
  values(p_kind, p_delivery_id, p_tenant_id, p_actor_id, p_outcome, btrim(p_evidence),
    p_provider_message_id, v_row - 'request_body');
  return jsonb_build_object('id', p_delivery_id, 'status', case p_outcome when 'accepted' then 'sent' else 'failed' end);
end;
$$;
revoke all on function public.reconcile_email_delivery(text,uuid,uuid,timestamptz,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.reconcile_email_delivery(text,uuid,uuid,timestamptz,uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
