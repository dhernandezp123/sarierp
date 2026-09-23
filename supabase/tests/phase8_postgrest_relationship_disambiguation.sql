begin;

do $phase8_postgrest_relationship_test$
declare
  v_equivalent_duplicates integer;
  v_quotation_client_key_count integer;
  v_quotation_client_key_columns integer;
begin
  select count(*)
  into v_equivalent_duplicates
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
    and composite.condeferred = legacy.condeferred;

  if v_equivalent_duplicates <> 0 then
    raise exception 'Persisten % relaciones equivalentes duplicadas', v_equivalent_duplicates;
  end if;

  select count(*), max(array_length(conkey, 1))
  into v_quotation_client_key_count, v_quotation_client_key_columns
  from pg_constraint
  where conrelid = 'public.quotations'::regclass
    and conname = 'quotations_cliente_id_fkey'
    and contype = 'f';

  if v_quotation_client_key_count <> 1 or v_quotation_client_key_columns <> 2 then
    raise exception 'quotations_cliente_id_fkey no conserva la relación compuesta tenant/cliente';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quotations'::regclass
      and conname = 'quotations_tenant_cliente_fkey'
  ) then
    raise exception 'La relación duplicada quotations_tenant_cliente_fkey todavía existe';
  end if;
end
$phase8_postgrest_relationship_test$;

rollback;

