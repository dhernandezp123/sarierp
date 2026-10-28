-- Fase 7 SaaS: resoluciÃ³n pÃºblica limitada por hostname y alta ligada al tenant.

update public.company_settings settings
set logo_url = '/logo/sari-logo.png'
from public.tenants tenant
where tenant.id = settings.tenant_id
  and tenant.slug = 'sari'
  and nullif(btrim(settings.logo_url), '') is null;

create or replace function public.resolve_tenant_public_context(p_hostname text)
returns table (
  tenant_id uuid,
  slug text,
  tenant_name text,
  hostname text,
  trade_name text,
  logo_url text,
  primary_color text,
  secondary_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tenant.id,
    tenant.slug,
    tenant.name,
    domain.hostname,
    settings.trade_name,
    settings.logo_url,
    settings.primary_color,
    settings.secondary_color
  from public.tenant_domains domain
  join public.tenants tenant on tenant.id = domain.tenant_id
  join public.company_settings settings on settings.tenant_id = tenant.id
  where domain.hostname = lower(btrim(p_hostname))
    and p_hostname = btrim(p_hostname)
    and lower(p_hostname) = p_hostname
    and p_hostname !~ '[[:space:]/@,:]'
    and domain.is_active is true
    and tenant.status = 'Activo'
  limit 1
$$;

revoke all on function public.resolve_tenant_public_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_tenant_public_context(text)
  to anon, authenticated, service_role;

comment on function public.resolve_tenant_public_context(text) is
  'Identidad visual pÃºblica mÃ­nima para un hostname activo; no concede acceso ni reemplaza RLS.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role := 'Ventas'::public.user_role;
  v_tenant_id uuid;
  v_hostname text := nullif(btrim(coalesce(new.raw_user_meta_data->>'tenant_hostname', '')), '');
  v_invited_tenant text := nullif(btrim(coalesce(new.raw_user_meta_data->>'tenant_id', '')), '');
begin
  -- La Ãºnica preferencia pÃºblica admitida es Cliente y siempre nace Pendiente.
  -- NingÃºn metadata puede solicitar roles internos ni autoaprobar acceso.
  if new.raw_user_meta_data->>'requested_role' = 'Cliente' then
    v_role := 'Cliente'::public.user_role;
  end if;

  if new.invited_at is not null
    and new.raw_user_meta_data->>'invited_by_admin' = 'true'
    and v_invited_tenant is not null
  then
    begin
      v_tenant_id := v_invited_tenant::uuid;
    exception when invalid_text_representation then
      raise exception 'La invitaciÃ³n no contiene una empresa vÃ¡lida'
        using errcode = '22023';
    end;

    if not exists (
      select 1 from public.tenants tenant
      where tenant.id = v_tenant_id and tenant.status = 'Activo'
    ) then
      raise exception 'La empresa de la invitaciÃ³n no estÃ¡ activa'
        using errcode = '22023';
    end if;
  elsif v_hostname is not null then
    select context.tenant_id
    into v_tenant_id
    from public.resolve_tenant_public_context(v_hostname) context;

    if v_tenant_id is null then
      raise exception 'El dominio de registro no corresponde a una empresa activa'
        using errcode = '22023';
    end if;
  end if;

  insert into public.profiles (
    id,
    tenant_id,
    nombre,
    apellido,
    email,
    rol,
    status,
    is_active,
    registration_company,
    registration_phone
  )
  values (
    new.id,
    v_tenant_id,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'nombre', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'apellido', '')), ''),
    new.email,
    v_role,
    'Pendiente',
    true,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'company', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

create or replace function public.capture_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim jsonb := new.raw_user_meta_data->'legal_acceptance';
  v_audience text;
  v_document text;
  v_tenant_id uuid;
begin
  if v_claim is null then return new; end if;
  v_audience := case when new.raw_user_meta_data->>'requested_role' = 'Cliente'
    then 'portal' else 'erp' end;
  v_document := case when v_audience = 'portal' then 'logistics' else 'platform' end;

  if jsonb_typeof(v_claim) is distinct from 'object'
    or v_claim->'terms_accepted' is distinct from 'true'::jsonb
    or v_claim->'privacy_read' is distinct from 'true'::jsonb
    or v_claim->>'audience' is distinct from v_audience
    or not exists (
      select 1 from public.legal_document_versions document
      where document.document_key = v_document
        and document.version = v_claim->>'version'
    ) then
    raise exception 'DeclaraciÃ³n de condiciones invÃ¡lida. Recarga el formulario.'
      using errcode = '22023';
  end if;

  select profile.tenant_id
  into v_tenant_id
  from public.profiles profile
  where profile.id = new.id;

  if v_tenant_id is null then
    raise exception 'No se pudo asociar la aceptaciÃ³n legal a una empresa'
      using errcode = '22023';
  end if;

  insert into public.signup_legal_acceptances
    (user_id, tenant_id, document_key, version, privacy_read)
  values (new.id, v_tenant_id, v_document, v_claim->>'version', true);
  return new;
end;
$$;

revoke all on function public.capture_signup_legal_acceptance()
  from public, anon, authenticated, service_role;
