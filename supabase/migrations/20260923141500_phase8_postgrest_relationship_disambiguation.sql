-- Hotfix de corte multiempresa: PostgREST considera cada foreign key como una
-- relación distinta. Las claves simples legacy y sus reemplazos compuestos por
-- tenant producían PGRST201 en embeds de Comercial, Operaciones y Finanzas.
--
-- Cuando ambas constraints tienen exactamente la misma semántica referencial,
-- se elimina la simple y se conserva la compuesta bajo el nombre legacy. Así se
-- mantiene el contrato de los hints existentes y queda un único camino seguro
-- por tenant. Los pares con acciones distintas se conservan para no cambiar su
-- comportamiento y deben desambiguarse explícitamente desde la consulta.

do $phase8_postgrest_relationships$
declare
  v_pair record;
  v_reconciled integer := 0;
begin
  for v_pair in
    select
      child_ns.nspname as child_schema,
      child.relname as child_table,
      composite.conname as composite_name,
      legacy.conname as legacy_name
    from pg_constraint composite
    join pg_class child on child.oid = composite.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = composite.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join pg_attribute child_tenant
      on child_tenant.attrelid = composite.conrelid
     and child_tenant.attname = 'tenant_id'
    join pg_attribute parent_tenant
      on parent_tenant.attrelid = composite.confrelid
     and parent_tenant.attname = 'tenant_id'
    join pg_constraint legacy
      on legacy.contype = 'f'
     and legacy.conrelid = composite.conrelid
     and legacy.confrelid = composite.confrelid
     and legacy.conkey = composite.conkey[2:array_length(composite.conkey, 1)]
     and legacy.confkey = composite.confkey[2:array_length(composite.confkey, 1)]
    where composite.contype = 'f'
      and child_ns.nspname = 'public'
      and parent_ns.nspname = 'public'
      and array_length(composite.conkey, 1) = 2
      and composite.conkey[1] = child_tenant.attnum
      and composite.confkey[1] = parent_tenant.attnum
      and composite.confdeltype = legacy.confdeltype
      and composite.confupdtype = legacy.confupdtype
      and composite.confmatchtype = legacy.confmatchtype
      and composite.condeferrable = legacy.condeferrable
      and composite.condeferred = legacy.condeferred
      and composite.convalidated
      and legacy.convalidated
    order by child.relname, legacy.conname
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      v_pair.child_schema,
      v_pair.child_table,
      v_pair.legacy_name
    );
    execute format(
      'alter table %I.%I rename constraint %I to %I',
      v_pair.child_schema,
      v_pair.child_table,
      v_pair.composite_name,
      v_pair.legacy_name
    );
    v_reconciled := v_reconciled + 1;
  end loop;

  if v_reconciled = 0 then
    raise exception 'No se encontraron relaciones duplicadas equivalentes para reconciliar';
  end if;

  raise notice 'Relaciones PostgREST reconciliadas: %', v_reconciled;
end
$phase8_postgrest_relationships$;

notify pgrst, 'reload schema';

