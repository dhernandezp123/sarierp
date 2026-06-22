-- Fase 2: integridad segura de Miami y numeración concurrente.

create sequence if not exists public.miami_manifest_number_seq;

do $$
declare
  v_max_suffix bigint;
  v_sequence_value bigint;
begin
  select coalesce(
    max(nullif(substring(manifest_number from '([0-9]+)$'), '')::bigint),
    0
  )
  into v_max_suffix
  from public.miami_manifests;

  select last_value into v_sequence_value
  from public.miami_manifest_number_seq;

  if greatest(v_max_suffix, v_sequence_value) <= 1 then
    perform setval('public.miami_manifest_number_seq', 1, false);
  else
    perform setval(
      'public.miami_manifest_number_seq',
      greatest(v_max_suffix, v_sequence_value),
      true
    );
  end if;
end;
$$;

revoke all on sequence public.miami_manifest_number_seq
  from public, anon, authenticated;

create or replace function public.next_manifest_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
begin
  if auth.uid() is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para generar manifiestos'
      using errcode = '42501';
  end if;

  v_sequence := nextval('public.miami_manifest_number_seq');

  return 'MAN-'
    || to_char(current_date, 'YYYYMMDD')
    || '-'
    || lpad(v_sequence::text, 6, '0');
end;
$$;

revoke all on function public.next_manifest_number() from public, anon;
grant execute on function public.next_manifest_number() to authenticated;

-- NOT VALID protege inmediatamente escrituras nuevas sin bloquear el despliegue
-- por posibles filas legacy. Se validarán después del preflight/limpieza.
alter table public.miami_packages
  add constraint miami_packages_tipo_carga_check
  check (tipo_carga in ('Paquetería', 'LCL', 'Aéreo Consolidado'))
  not valid;

alter table public.miami_packages
  add constraint miami_packages_cargo_status_check
  check (cargo_status in (
    'Recibido en Miami',
    'En Consolidación',
    'En Tránsito',
    'Llegado Honduras',
    'Entregado'
  ))
  not valid;

alter table public.miami_packages
  add constraint miami_packages_nonnegative_measurements_check
  check (
    coalesce(weight_lbs, 0) >= 0
    and coalesce(weight_kg, 0) >= 0
    and coalesce(length_in, 0) >= 0
    and coalesce(width_in, 0) >= 0
    and coalesce(height_in, 0) >= 0
    and coalesce(ft3, 0) >= 0
    and coalesce(cbm, 0) >= 0
  )
  not valid;

alter table public.miami_manifests
  add constraint miami_manifests_total_packages_nonnegative_check
  check (total_packages >= 0)
  not valid;
