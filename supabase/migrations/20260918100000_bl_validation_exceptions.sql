-- Auditable exceptions for intentional BL/source discrepancies.

create table public.bl_validation_exceptions (
  id uuid primary key default gen_random_uuid(),
  bl_id uuid not null references public.bills_of_lading(id) on delete cascade,
  field_name text not null,
  document_value text not null,
  source_value text not null,
  source_label text not null,
  reason text not null,
  status text not null default 'ACTIVE',
  created_by uuid not null references public.profiles(id),
  created_by_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  closure_reason text,
  constraint bl_validation_exceptions_field_check check (
    field_name = any (array[
      'shipper', 'shipper_address', 'consignee', 'consignee_address',
      'notify_party', 'notify_party_address', 'place_of_receipt',
      'port_of_loading', 'port_of_discharge', 'place_of_delivery', 'carrier',
      'vessel_name', 'voyage', 'etd', 'eta', 'description_of_goods',
      'number_of_packages', 'package_type', 'gross_weight_kg',
      'measurement_cbm', 'freight_terms', 'release_type'
    ])
  ),
  constraint bl_validation_exceptions_reason_check check (
    char_length(btrim(reason)) between 8 and 2000
  ),
  constraint bl_validation_exceptions_values_check check (
    nullif(btrim(document_value), '') is not null
    and nullif(btrim(source_value), '') is not null
    and nullif(btrim(source_label), '') is not null
  ),
  constraint bl_validation_exceptions_status_check check (
    status = any (array['ACTIVE', 'SUPERSEDED', 'REVOKED'])
  ),
  constraint bl_validation_exceptions_closure_check check (
    (status = 'ACTIVE' and closed_at is null and closed_by is null and closure_reason is null)
    or
    (status <> 'ACTIVE' and closed_at is not null and closed_by is not null
      and nullif(btrim(closure_reason), '') is not null)
  )
);

create unique index bl_validation_exceptions_one_active_field_idx
on public.bl_validation_exceptions (bl_id, field_name)
where status = 'ACTIVE';

create index bl_validation_exceptions_history_idx
on public.bl_validation_exceptions (bl_id, created_at desc);

alter table public.bl_validation_exceptions enable row level security;

create policy "bl_validation_exceptions_select_operations"
on public.bl_validation_exceptions
for select to authenticated
using (public.can_access_bill_of_lading(bl_id));

revoke all on table public.bl_validation_exceptions from public, anon, authenticated;
grant select on table public.bl_validation_exceptions to authenticated;
grant all on table public.bl_validation_exceptions to service_role;

create or replace function public.acknowledge_bl_validation_exception(
  p_bl_id uuid,
  p_field_name text,
  p_document_value text,
  p_source_value text,
  p_source_label text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_bl public.bills_of_lading%rowtype;
  v_exception public.bl_validation_exceptions%rowtype;
  v_actor_name text;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para justificar diferencias documentales'
      using errcode = '42501';
  end if;

  if p_field_name is null or p_field_name <> all (array[
    'shipper', 'shipper_address', 'consignee', 'consignee_address',
    'notify_party', 'notify_party_address', 'place_of_receipt',
    'port_of_loading', 'port_of_discharge', 'place_of_delivery', 'carrier',
    'vessel_name', 'voyage', 'etd', 'eta', 'description_of_goods',
    'number_of_packages', 'package_type', 'gross_weight_kg',
    'measurement_cbm', 'freight_terms', 'release_type'
  ]) then
    raise exception 'Campo documental no permitido para excepciones'
      using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) not between 8 and 2000 then
    raise exception 'La justificación debe tener entre 8 y 2000 caracteres'
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_document_value, '')), '') is null
     or nullif(btrim(coalesce(p_source_value, '')), '') is null
     or nullif(btrim(coalesce(p_source_label, '')), '') is null then
    raise exception 'Los valores comparados y su fuente son obligatorios'
      using errcode = '22023';
  end if;

  select bl.*
  into v_bl
  from public.bills_of_lading bl
  where bl.id = p_bl_id
  for update;

  if not found then
    raise exception 'BL no encontrado' using errcode = 'P0002';
  end if;

  if v_bl.bl_type = 'HBL' and v_bl.status in ('Emitido', 'Liberado') then
    raise exception 'El HBL emitido es inmutable; no admite nuevas excepciones'
      using errcode = '55000';
  end if;

  select nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), '')
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id;

  v_actor_name := coalesce(v_actor_name, 'Usuario de Operaciones');

  update public.bl_validation_exceptions
  set status = 'SUPERSEDED',
      closed_at = clock_timestamp(),
      closed_by = v_user_id,
      closure_reason = 'Reemplazada por una nueva justificación para el campo'
  where bl_id = p_bl_id
    and field_name = p_field_name
    and status = 'ACTIVE';

  insert into public.bl_validation_exceptions (
    bl_id, field_name, document_value, source_value, source_label,
    reason, created_by, created_by_name
  ) values (
    p_bl_id,
    p_field_name,
    btrim(p_document_value),
    btrim(p_source_value),
    btrim(p_source_label),
    btrim(p_reason),
    v_user_id,
    v_actor_name
  )
  returning * into v_exception;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_bl',
    'validation_exception_acknowledged',
    'bill_of_lading',
    p_bl_id,
    format('Diferencia documental justificada en %s', p_field_name),
    jsonb_build_object(
      'exception_id', v_exception.id,
      'field', p_field_name,
      'document_value', btrim(p_document_value),
      'source_value', btrim(p_source_value),
      'source_label', btrim(p_source_label),
      'reason', btrim(p_reason)
    )
  );

  return to_jsonb(v_exception);
end;
$$;

revoke all on function public.acknowledge_bl_validation_exception(
  uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.acknowledge_bl_validation_exception(
  uuid, text, text, text, text, text
) to authenticated, service_role;

create or replace function public.revoke_bl_validation_exception(
  p_exception_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_exception public.bl_validation_exceptions%rowtype;
  v_bl public.bills_of_lading%rowtype;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para revocar excepciones documentales'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) not between 8 and 2000 then
    raise exception 'El motivo de revocación debe tener entre 8 y 2000 caracteres'
      using errcode = '22023';
  end if;

  select exception_row.*
  into v_exception
  from public.bl_validation_exceptions exception_row
  where exception_row.id = p_exception_id
  for update;

  if not found then
    raise exception 'Excepción documental no encontrada' using errcode = 'P0002';
  end if;

  select bl.*
  into v_bl
  from public.bills_of_lading bl
  where bl.id = v_exception.bl_id
  for update;

  if v_exception.status <> 'ACTIVE' then
    raise exception 'La excepción ya no está activa' using errcode = '55000';
  end if;

  if v_bl.bl_type = 'HBL' and v_bl.status in ('Emitido', 'Liberado') then
    raise exception 'El HBL emitido es inmutable; no admite cambios de excepciones'
      using errcode = '55000';
  end if;

  update public.bl_validation_exceptions
  set status = 'REVOKED',
      closed_at = clock_timestamp(),
      closed_by = v_user_id,
      closure_reason = btrim(p_reason)
  where id = p_exception_id
  returning * into v_exception;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_bl',
    'validation_exception_revoked',
    'bill_of_lading',
    v_exception.bl_id,
    format('Excepción documental revocada en %s', v_exception.field_name),
    jsonb_build_object(
      'exception_id', v_exception.id,
      'field', v_exception.field_name,
      'reason', btrim(p_reason)
    )
  );

  return to_jsonb(v_exception);
end;
$$;

revoke all on function public.revoke_bl_validation_exception(uuid, text)
from public, anon;
grant execute on function public.revoke_bl_validation_exception(uuid, text)
to authenticated, service_role;

comment on table public.bl_validation_exceptions is
  'Historial auditable de discrepancias intencionales entre un BL y sus fuentes operativas.';
comment on function public.acknowledge_bl_validation_exception(uuid, text, text, text, text, text) is
  'Registra atómicamente la justificación de una diferencia documental y conserva versiones anteriores.';
comment on function public.revoke_bl_validation_exception(uuid, text) is
  'Revoca una justificación activa sin borrar su historial.';
