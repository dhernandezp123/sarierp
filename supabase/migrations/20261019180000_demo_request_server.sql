-- Phase 1: prepare the server receiver before publishing its frontend.
-- Deliberately preserve the old insert path until phase 2, after rollout.
create table public.demo_request_limits (
  request_key text primary key check (request_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 5)
);
create index demo_request_limits_expiry on public.demo_request_limits(window_started_at);
alter table public.demo_request_limits enable row level security;
revoke all on public.demo_request_limits from public, anon, authenticated, service_role;

create function public.submit_demo_lead(p_lead jsonb, p_request_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_attempts integer;
  v_now timestamptz := clock_timestamp();
  v_nombre text := btrim(p_lead->>'nombre');
  v_empresa text := btrim(p_lead->>'empresa');
  v_email text := btrim(p_lead->>'email');
  v_telefono text := btrim(coalesce(p_lead->>'telefono', ''));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode = '42501';
  end if;
  if p_request_key is null or p_request_key !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_lead) is distinct from 'object'
    or jsonb_typeof(p_lead->'nombre') is distinct from 'string'
    or jsonb_typeof(p_lead->'empresa') is distinct from 'string'
    or jsonb_typeof(p_lead->'email') is distinct from 'string'
    or (p_lead ? 'telefono' and jsonb_typeof(p_lead->'telefono') is distinct from 'string')
    or coalesce(length(v_nombre), 0) not between 1 and 120
    or coalesce(length(v_empresa), 0) not between 1 and 160
    or coalesce(length(v_email), 0) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_telefono) > 40 then
    raise exception 'Invalid demo request' using errcode = '22023';
  end if;

  -- Only keyed HMACs are retained. Opportunistic cleanup on new submissions.
  delete from public.demo_request_limits where window_started_at < v_now - interval '1 day';
  insert into public.demo_request_limits(request_key, window_started_at, attempts)
    values (p_request_key, v_now, 1)
  on conflict (request_key) do update set
    window_started_at = case when demo_request_limits.window_started_at <= v_now - interval '15 minutes'
      then v_now else demo_request_limits.window_started_at end,
    attempts = case when demo_request_limits.window_started_at <= v_now - interval '15 minutes'
      then 1 else demo_request_limits.attempts + 1 end
    where demo_request_limits.window_started_at <= v_now - interval '15 minutes'
      or demo_request_limits.attempts < 5
  returning attempts into v_attempts;
  if not found then return false; end if;

  insert into public.leads(nombre, empresa, email, telefono)
    values (v_nombre, v_empresa, v_email, nullif(v_telefono, ''));
  return true;
end;
$$;
revoke all on function public.submit_demo_lead(jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_demo_lead(jsonb, text) to service_role;
