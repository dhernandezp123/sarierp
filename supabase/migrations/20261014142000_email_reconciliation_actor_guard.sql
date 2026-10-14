-- AUD-08: null roles must fail closed; a known provider ID cannot authorize a new send.
begin;
create or replace function public.reconcile_email_delivery(
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
  if not found or v_actor.status is distinct from 'Aprobado' or v_actor.is_active is not true
    or (p_kind = 'miami' and (v_actor.rol is distinct from 'Admin' or v_actor.is_platform_admin is true or v_actor.tenant_id is distinct from p_tenant_id))
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
  if p_outcome = 'not_accepted' and nullif(btrim(v_row->>'resend_message_id'), '') is not null then
    raise exception 'Existing provider ID requires acceptance review, not a fresh send' using errcode = '22023';
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
notify pgrst, 'reload schema';
commit;
