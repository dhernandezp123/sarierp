-- Registro de declaración en alta, sin cambiar aprobación, roles ni cuentas previas.
-- Los registros no equivalen a correo verificado ni representación contractual.
create table public.legal_document_versions (
  document_key text not null check (document_key in ('platform', 'logistics')),
  version text not null,
  document_path text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (document_key, version)
);

create table public.signup_legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null,
  version text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null default 'signup_declaration' check (source = 'signup_declaration'),
  privacy_read boolean not null check (privacy_read),
  primary key (user_id, document_key, version),
  foreign key (document_key, version)
    references public.legal_document_versions(document_key, version)
);

alter table public.legal_document_versions enable row level security;
alter table public.signup_legal_acceptances enable row level security;
revoke all on public.legal_document_versions from public, anon, authenticated, service_role;
revoke all on public.signup_legal_acceptances from public, anon, authenticated, service_role;
grant select on public.legal_document_versions to service_role;
grant select on public.signup_legal_acceptances to authenticated, service_role;
create policy signup_legal_acceptances_read_own on public.signup_legal_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

-- VERSION_REGISTRY: hashes del contenido UTF-8 de los archivos públicos versionados.
insert into public.legal_document_versions (document_key, version, document_path, content_sha256)
values
  ('platform', '2026-09-07', '/legal/platform-2026-09-07.json', '01b869a9564253bbc040b565c082e1ffebcbcc40be22bbfbe9d2c31c04163587'),
  ('logistics', '2026-09-07', '/legal/logistics-2026-09-07.json', 'dde56f9b9b39d5c6806414df0921d6f8e3f8175470f0b13997d8e22d08f616d8');

create function public.capture_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim jsonb := new.raw_user_meta_data->'legal_acceptance';
  v_audience text;
  v_document text;
begin
  -- Compatibilidad: invitaciones, integraciones y cuentas antiguas no se inventan
  -- como aceptantes. No es una barrera de autorización del ERP.
  if v_claim is null then return new; end if;
  v_audience := case when new.raw_user_meta_data->>'requested_role' = 'Cliente'
    then 'portal' else 'erp' end;
  v_document := case when v_audience = 'portal' then 'logistics' else 'platform' end;

  if jsonb_typeof(v_claim) is distinct from 'object'
    or v_claim->'terms_accepted' is distinct from 'true'::jsonb
    or v_claim->'privacy_read' is distinct from 'true'::jsonb
    or v_claim->>'audience' is distinct from v_audience
    or not exists (
      select 1 from public.legal_document_versions d
      where d.document_key = v_document and d.version = v_claim->>'version'
    ) then
    raise exception 'Declaración de condiciones inválida. Recarga el formulario.'
      using errcode = '22023';
  end if;

  insert into public.signup_legal_acceptances
    (user_id, document_key, version, privacy_read)
  values (new.id, v_document, v_claim->>'version', true);
  return new;
end;
$$;

revoke all on function public.capture_signup_legal_acceptance()
  from public, anon, authenticated, service_role;
create trigger on_auth_user_created_legal_acceptance
  after insert on auth.users for each row
  execute function public.capture_signup_legal_acceptance();

comment on table public.signup_legal_acceptances is
  'Declaración recibida al crear la cuenta; no prueba identidad verificada ni representación. Se elimina al borrar la cuenta; gestionar conservación legal antes de esa operación.';
