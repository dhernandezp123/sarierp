-- Corrección Fase 3: EXECUTE dinámico no actualiza FOUND en PL/pgSQL.
-- tenant_id es NOT NULL en todos los padres comerciales, por lo que NULL
-- distingue de forma segura una referencia inexistente.

create or replace function public.enforce_parent_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_parent_tenant uuid;
  v_current_tenant uuid := public.current_tenant_id();
begin
  v_parent_id := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;
  if v_parent_id is null then
    raise exception 'La referencia padre % es obligatoria', tg_argv[1];
  end if;

  execute format(
    'select tenant_id from public.%I where id = $1',
    tg_argv[0]
  ) into v_parent_tenant using v_parent_id;

  if v_parent_tenant is null then
    raise exception 'No existe un padre válido para el registro comercial';
  end if;

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se puede cambiar la empresa propietaria del registro'
      using errcode = '42501';
  end if;

  if new.tenant_id is not null and new.tenant_id is distinct from v_parent_tenant then
    raise exception 'La empresa del registro no coincide con su padre'
      using errcode = '23514';
  end if;

  if auth.uid() is not null then
    if v_current_tenant is null
      or v_parent_tenant is distinct from v_current_tenant then
      raise exception 'No se puede operar sobre otra empresa'
        using errcode = '42501';
    end if;
  end if;

  new.tenant_id := v_parent_tenant;
  return new;
end;
$$;

revoke all on function public.enforce_parent_tenant()
  from public, anon, authenticated;
