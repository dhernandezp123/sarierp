-- Notas comerciales específicas por opción.
-- Las observaciones generales continúan en quotations.client_notes.

alter table public.quotation_options
  add column if not exists client_notes text not null default '';

alter table public.quotation_options
  drop constraint if exists quotation_options_client_notes_length_check;

alter table public.quotation_options
  add constraint quotation_options_client_notes_length_check
  check (char_length(client_notes) <= 4000);

create or replace function public.save_current_pricing_as_option_v2(
  p_quotation_id uuid,
  p_label text default null,
  p_is_recommended boolean default false,
  p_option_id uuid default null,
  p_client_notes text default null
)
returns table (option_id uuid, option_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
  v_option_code text;
begin
  if char_length(coalesce(p_client_notes, '')) > 4000 then
    raise exception 'Las notas de la opción no pueden superar 4000 caracteres';
  end if;

  select saved.option_id, saved.option_code
  into v_option_id, v_option_code
  from public.save_current_pricing_as_option(
    p_quotation_id,
    p_label,
    p_is_recommended,
    p_option_id
  ) as saved;

  update public.quotation_options
  set client_notes = coalesce(p_client_notes, ''),
      updated_at = now()
  where id = v_option_id;

  return query select v_option_id, v_option_code;
end;
$$;

create or replace function public.update_draft_quotation_option_details(
  p_option_id uuid,
  p_label text,
  p_is_recommended boolean,
  p_client_notes text
)
returns table (option_id uuid, option_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_option public.quotation_options%rowtype;
  v_label text;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para editar opciones comerciales'
      using errcode = '42501';
  end if;

  if char_length(coalesce(p_client_notes, '')) > 4000 then
    raise exception 'Las notas de la opción no pueden superar 4000 caracteres';
  end if;

  select qo.* into v_option
  from public.quotation_options qo
  where qo.id = p_option_id
  for update;

  if not found then
    raise exception 'La opción no existe' using errcode = 'P0002';
  end if;

  if v_option.status <> 'Borrador' then
    raise exception 'Solo las opciones en borrador pueden editarse';
  end if;

  v_label := coalesce(nullif(btrim(p_label), ''), v_option.label);

  if p_is_recommended then
    update public.quotation_options
    set is_recommended = false,
        updated_at = now()
    where quotation_id = v_option.quotation_id
      and id <> v_option.id
      and is_recommended is true;
  end if;

  update public.quotation_options
  set label = v_label,
      is_recommended = p_is_recommended,
      client_notes = coalesce(p_client_notes, ''),
      updated_at = now()
  where id = v_option.id
  returning * into v_option;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'pricing',
    'quotation_option_updated',
    'quotation',
    v_option.quotation_id,
    'Detalles comerciales actualizados: ' || v_option.option_code || ' - ' || v_option.label,
    jsonb_build_object(
      'quotation_option_id', v_option.id,
      'option_code', v_option.option_code,
      'label', v_option.label,
      'is_recommended', v_option.is_recommended,
      'client_notes_changed', true
    )
  );

  return query select v_option.id, v_option.option_code;
end;
$$;

revoke all on function public.save_current_pricing_as_option_v2(
  uuid, text, boolean, uuid, text
) from public, anon;
revoke all on function public.update_draft_quotation_option_details(
  uuid, text, boolean, text
) from public, anon;

grant execute on function public.save_current_pricing_as_option_v2(
  uuid, text, boolean, uuid, text
) to authenticated;
grant execute on function public.update_draft_quotation_option_details(
  uuid, text, boolean, text
) to authenticated;

comment on column public.quotation_options.client_notes is
  'Observaciones comerciales visibles para el cliente y exclusivas de esta opción.';
comment on function public.save_current_pricing_as_option_v2(
  uuid, text, boolean, uuid, text
) is 'Guarda o reemplaza un snapshot comercial junto con sus notas específicas.';
comment on function public.update_draft_quotation_option_details(
  uuid, text, boolean, text
) is 'Edita nombre, recomendación y notas sin reemplazar el snapshot financiero.';
