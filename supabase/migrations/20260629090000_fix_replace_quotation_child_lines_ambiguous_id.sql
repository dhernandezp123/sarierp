-- Fase 5: corrige referencias ambiguas en reemplazo atomico de hijos de cotizacion.

create or replace function public.replace_quotation_child_lines(
  p_quotation_id uuid,
  p_replace_containers boolean default false,
  p_container_lines jsonb default '[]'::jsonb,
  p_replace_cargo boolean default false,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_replace_pricing boolean default false,
  p_pricing_items jsonb default '[]'::jsonb
)
returns table (
  quotation_id uuid,
  containers_count integer,
  cargo_lines_count integer,
  pricing_items_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_containers_count integer := 0;
  v_cargo_lines_count integer := 0;
  v_pricing_items_count integer := 0;
  v_item jsonb;
begin
  if v_user_id is null
    or not public.is_role(array['Admin', 'Ventas', 'Pricing', 'Operaciones'])
    or not public.can_select_quotation(p_quotation_id) then
    raise exception 'No tienes permiso para modificar el detalle de la cotizacion'
      using errcode = '42501';
  end if;

  perform 1
  from public.quotations q
  where q.id = p_quotation_id
    and q.deleted_at is null
  for update;

  if not found then
    raise exception 'La cotizacion no existe o fue eliminada';
  end if;

  if jsonb_typeof(coalesce(p_container_lines, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_cargo_lines, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_pricing_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Los detalles de cotizacion deben enviarse como arreglos';
  end if;

  if p_replace_containers then
    for v_item in select value from jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb))
    loop
      if nullif(btrim(coalesce(v_item->>'container_type_name', '')), '') is null
        or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
        raise exception 'Las lineas de contenedor contienen valores invalidos';
      end if;
    end loop;

    delete from public.quotation_containers qc
    where qc.quotation_id = p_quotation_id;

    insert into public.quotation_containers (
      quotation_id, container_type_id, container_type_name, quantity, notes
    )
    select
      p_quotation_id,
      nullif(value->>'container_type_id', '')::uuid,
      btrim(value->>'container_type_name'),
      coalesce((value->>'quantity')::numeric, 1),
      nullif(value->>'notes', '')
    from jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb));

    get diagnostics v_containers_count = row_count;
  end if;

  if p_replace_cargo then
    for v_item in select value from jsonb_array_elements(coalesce(p_cargo_lines, '[]'::jsonb))
    loop
      if nullif(btrim(coalesce(v_item->>'package_type', '')), '') is null
        or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
        raise exception 'Las lineas de carga contienen valores invalidos';
      end if;
    end loop;

    delete from public.quotation_cargo_lines qcl
    where qcl.quotation_id = p_quotation_id;

    insert into public.quotation_cargo_lines (
      quotation_id, quantity, package_type, length, width, height,
      dimension_unit, weight_lbs, ft3, cbm
    )
    select
      p_quotation_id,
      coalesce((value->>'quantity')::numeric, 1),
      btrim(value->>'package_type'),
      nullif(value->>'length', '')::numeric,
      nullif(value->>'width', '')::numeric,
      nullif(value->>'height', '')::numeric,
      coalesce(nullif(value->>'dimension_unit', ''), 'in'),
      nullif(value->>'weight_lbs', '')::numeric,
      nullif(value->>'ft3', '')::numeric,
      nullif(value->>'cbm', '')::numeric
    from jsonb_array_elements(coalesce(p_cargo_lines, '[]'::jsonb));

    get diagnostics v_cargo_lines_count = row_count;
  end if;

  if p_replace_pricing then
    for v_item in select value from jsonb_array_elements(coalesce(p_pricing_items, '[]'::jsonb))
    loop
      if nullif(btrim(coalesce(v_item->>'description', '')), '') is null
        or coalesce((v_item->>'quantity')::numeric, 0) <= 0
        or coalesce((v_item->>'cost_amount')::numeric, 0) < 0
        or coalesce((v_item->>'sale_amount')::numeric, 0) < 0
        or coalesce((v_item->>'tax_amount')::numeric, 0) < 0
        or coalesce((v_item->>'total_amount')::numeric, 0) < 0 then
        raise exception 'Los cargos de pricing contienen valores invalidos';
      end if;
    end loop;

    delete from public.pricing_items pi
    where pi.quotation_id = p_quotation_id;

    insert into public.pricing_items (
      quotation_id, item_type, description, cost_amount, sale_amount,
      currency, supplier, notes, created_by, quantity, taxable, tax_rate,
      tax_amount, total_amount, rate_code
    )
    select
      p_quotation_id,
      coalesce(nullif(value->>'item_type', ''), 'Otro'),
      btrim(value->>'description'),
      coalesce((value->>'cost_amount')::numeric, 0),
      coalesce((value->>'sale_amount')::numeric, 0),
      coalesce(nullif(value->>'currency', ''), 'USD'),
      nullif(value->>'supplier', ''),
      nullif(value->>'notes', ''),
      coalesce(nullif(value->>'created_by', '')::uuid, v_user_id),
      coalesce((value->>'quantity')::numeric, 1),
      coalesce((value->>'taxable')::boolean, false),
      coalesce((value->>'tax_rate')::numeric, 0),
      coalesce((value->>'tax_amount')::numeric, 0),
      coalesce((value->>'total_amount')::numeric, 0),
      nullif(value->>'rate_code', '')
    from jsonb_array_elements(coalesce(p_pricing_items, '[]'::jsonb));

    get diagnostics v_pricing_items_count = row_count;
  end if;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'quotations',
    'quotation_child_lines_replaced',
    'quotation',
    p_quotation_id,
    'Detalle de cotizacion reemplazado atomicamente',
    jsonb_build_object(
      'replace_containers', p_replace_containers,
      'replace_cargo', p_replace_cargo,
      'replace_pricing', p_replace_pricing,
      'containers_count', v_containers_count,
      'cargo_lines_count', v_cargo_lines_count,
      'pricing_items_count', v_pricing_items_count
    )
  );

  return query select
    p_quotation_id as quotation_id,
    v_containers_count as containers_count,
    v_cargo_lines_count as cargo_lines_count,
    v_pricing_items_count as pricing_items_count;
end;
$$;

revoke all on function public.replace_quotation_child_lines(
  uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb
) from public, anon;
grant execute on function public.replace_quotation_child_lines(
  uuid, boolean, jsonb, boolean, jsonb, boolean, jsonb
) to authenticated;
