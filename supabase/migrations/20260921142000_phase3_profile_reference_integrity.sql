-- Fase 3: las referencias de actor, asignación y auditoría también deben
-- pertenecer al tenant del registro comercial.

do $phase3_profile_reference_preflight$
declare
  v_record record;
  v_has_mismatch boolean;
begin
  for v_record in
    select * from (values
      ('clientes', 'vendedor_asignado'),
      ('clientes', 'deleted_by'),
      ('client_notes', 'created_by'),
      ('cliente_history', 'changed_by'),
      ('sales_activities', 'created_by'),
      ('quotations', 'created_by'),
      ('quotations', 'pricing_approved_by'),
      ('quotations', 'assigned_to'),
      ('quotations', 'deleted_by'),
      ('quotation_status_history', 'changed_by'),
      ('quotation_change_logs', 'changed_by'),
      ('pricing_items', 'created_by'),
      ('pricing_items', 'deleted_by'),
      ('agents', 'deleted_by'),
      ('agent_quotes', 'deleted_by'),
      ('quotation_options', 'created_by'),
      ('quotation_options', 'published_by'),
      ('quotation_options', 'accepted_by')
    ) as mappings(table_name, profile_column)
  loop
    execute format(
      'select exists ('
      'select 1 from public.%I row '
      'join public.profiles profile on profile.id = row.%I '
      'where row.tenant_id is distinct from profile.tenant_id'
      ')',
      v_record.table_name,
      v_record.profile_column
    ) into v_has_mismatch;

    if v_has_mismatch then
      raise exception 'Referencia de perfil cross-tenant en %.%',
        v_record.table_name,
        v_record.profile_column;
    end if;
  end loop;
end
$phase3_profile_reference_preflight$;

alter table public.clientes add constraint clientes_tenant_vendedor_fkey
  foreign key (tenant_id, vendedor_asignado) references public.profiles (tenant_id, id);
alter table public.clientes add constraint clientes_tenant_deleted_by_fkey
  foreign key (tenant_id, deleted_by) references public.profiles (tenant_id, id);
alter table public.client_notes add constraint client_notes_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id);
alter table public.cliente_history add constraint cliente_history_tenant_changed_by_fkey
  foreign key (tenant_id, changed_by) references public.profiles (tenant_id, id);
alter table public.sales_activities add constraint sales_activities_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id);

alter table public.quotations add constraint quotations_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_pricing_approved_by_fkey
  foreign key (tenant_id, pricing_approved_by) references public.profiles (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_assigned_to_fkey
  foreign key (tenant_id, assigned_to) references public.profiles (tenant_id, id);
alter table public.quotations add constraint quotations_tenant_deleted_by_fkey
  foreign key (tenant_id, deleted_by) references public.profiles (tenant_id, id);
alter table public.quotation_status_history add constraint quotation_status_history_tenant_changed_by_fkey
  foreign key (tenant_id, changed_by) references public.profiles (tenant_id, id);
alter table public.quotation_change_logs add constraint quotation_change_logs_tenant_changed_by_fkey
  foreign key (tenant_id, changed_by) references public.profiles (tenant_id, id);
alter table public.pricing_items add constraint pricing_items_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id);
alter table public.pricing_items add constraint pricing_items_tenant_deleted_by_fkey
  foreign key (tenant_id, deleted_by) references public.profiles (tenant_id, id);

alter table public.agents add constraint agents_tenant_deleted_by_fkey
  foreign key (tenant_id, deleted_by) references public.profiles (tenant_id, id);
alter table public.agent_quotes add constraint agent_quotes_tenant_deleted_by_fkey
  foreign key (tenant_id, deleted_by) references public.profiles (tenant_id, id);
alter table public.quotation_options add constraint quotation_options_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id);
alter table public.quotation_options add constraint quotation_options_tenant_published_by_fkey
  foreign key (tenant_id, published_by) references public.profiles (tenant_id, id);
alter table public.quotation_options add constraint quotation_options_tenant_accepted_by_fkey
  foreign key (tenant_id, accepted_by) references public.profiles (tenant_id, id);
