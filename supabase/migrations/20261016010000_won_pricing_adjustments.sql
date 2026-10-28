-- A won sale can be repriced without asking the client to choose it again.
-- Keep the old commercial snapshot intact and create an auditable successor.
alter table public.quotation_options add column supersedes_option_id uuid;
alter table public.quotation_options add constraint quotation_options_supersedes_tenant_fkey
  foreign key (tenant_id, supersedes_option_id)
  references public.quotation_options(tenant_id, id) on delete restrict;

create function public.snapshot_won_quotation_adjustment(p_quotation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_quote public.quotations%rowtype;
  v_previous public.quotation_options%rowtype;
  v_draft public.quotation_options%rowtype;
  v_agent uuid;
  v_drafts integer;
  v_saved record;
begin
  if auth.uid() is null or not public.is_approved_active_user()
    or not public.is_role(array['Admin','Pricing']) then
    raise exception 'Solo Pricing puede aprobar el ajuste' using errcode='42501';
  end if;
  select * into v_quote from public.quotations where id=p_quotation_id
    and tenant_id=public.current_tenant_id() and deleted_at is null for update;
  if not found or not public.can_update_quotation(p_quotation_id)
    or v_quote.repricing_return_status is distinct from 'Ganada'
    or v_quote.status not in ('Pendiente de Fijar Precios','Pricing Aprobado') then
    raise exception 'El ajuste requiere una venta ganada reabierta' using errcode='23514';
  end if;
  select * into v_previous from public.quotation_options
    where quotation_id=p_quotation_id and status='Aceptada' for update;
  if not found then
    raise exception 'Registra la elección del cliente para la nueva venta' using errcode='23514';
  end if;
  select id into v_agent from public.agent_quotes where quotation_id=p_quotation_id
    and is_selected and deleted_at is null for update;
  if v_agent is distinct from v_previous.agent_quote_id then
    raise exception 'La tarifa seleccionada cambió; ofrece la nueva opción al cliente' using errcode='23514';
  end if;

  -- A draft is mutable; offered/accepted content is never overwritten.
  select count(*) into v_drafts from public.quotation_options
    where quotation_id=p_quotation_id and status='Borrador' and agent_quote_id=v_agent;
  if v_drafts=1 then
    select * into v_draft from public.quotation_options
      where quotation_id=p_quotation_id and status='Borrador' and agent_quote_id=v_agent for update;
  end if;
  select * into v_saved from public.save_current_pricing_as_option_v2(
    p_quotation_id, coalesce(v_draft.label, 'Ajuste de opción '||v_previous.option_code),
    false, v_draft.id, coalesce(v_draft.client_notes,v_previous.client_notes));

  update public.quotation_options set status='No seleccionada', is_recommended=false, updated_at=now()
    where id=v_previous.id;
  update public.quotation_options set status='Aceptada', supersedes_option_id=v_previous.id,
    accepted_by=null, accepted_at=null, updated_at=now() where id=v_saved.option_id;
  -- Keep current line IDs: issued invoices and operational documents are untouched.
  update public.pricing_items p set source_option_item_id=i.id
    from public.quotation_option_items i where i.quotation_option_id=v_saved.option_id
      and i.source_pricing_item_id=p.id and p.quotation_id=p_quotation_id and p.deleted_at is null;
  insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
  values(v_quote.tenant_id,auth.uid(),'pricing','won_quotation_adjustment_approved','quotation',p_quotation_id,
    'Ajuste de venta ganada aprobado sin nueva elección del cliente',
    jsonb_build_object('previous_option_id',v_previous.id,'adjusted_option_id',v_saved.option_id,
      'original_acceptance_preserved',true,'client_confirmation_requested',false,
      'previous_cost',v_previous.cost_total,'previous_sale',v_previous.sale_subtotal,
      'new_cost',(select cost_total from public.quotation_options where id=v_saved.option_id),
      'new_sale',(select sale_subtotal from public.quotation_options where id=v_saved.option_id)));
end;
$$;
revoke all on function public.snapshot_won_quotation_adjustment(uuid) from public,anon,authenticated,service_role;

-- Extend only the explicit return-to-won context, including an intermediate
-- approval reached by earlier UI versions. The normal transition list is unchanged.
create or replace function public.quotation_transition_allowed(p_old text,p_new text,p_return text default null)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(case p_old
    when 'Borrador' then p_new='Pendiente de Fijar Precios'
    when 'Pendiente de Fijar Precios' then p_new in ('Pricing Aprobado','Perdida')
      or (p_new='Ganada' and p_return='Ganada')
    when 'Pricing Aprobado' then p_new in ('Enviada al Cliente','Pendiente de Fijar Precios')
      or (p_new='Ganada' and p_return='Ganada')
    when 'Enviada al Cliente' then p_new in ('Ganada','Perdida','Pendiente de Fijar Precios')
    when 'Ganada' then p_new='Pendiente de Fijar Precios'
    else false end,false);
$$;

-- Patch the current canonical bodies, retaining revision, tenant, audit,
-- profitability and synchronization guards. Fail closed on unexpected bodies.
do $$
declare v_definition text; v_before text; v_after text;
begin
  v_definition:=pg_get_functiondef('public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)'::regprocedure);
  v_before:='or (v_old.status = ''Pendiente de Fijar Precios'' and p_new_status = ''Ganada'')';
  v_after:='or (v_old.status in (''Pendiente de Fijar Precios'', ''Pricing Aprobado'') and p_new_status = ''Ganada'' and v_old.repricing_return_status = ''Ganada'')';
  if strpos(v_definition,v_before)=0 then raise exception 'Approval guard not found'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before:='if p_new_status = ''Ganada'' and exists (select 1 from public.quotation_options where quotation_id = p_quotation_id) then';
  v_after:='if p_new_status = ''Ganada'' and exists (select 1 from public.quotation_options where quotation_id = p_quotation_id)
      and not exists (select 1 from public.quotation_options where quotation_id=p_quotation_id and status=''Aceptada'') then';
  if strpos(v_definition,v_before)=0 then raise exception 'Commercial selection guard not found'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before:='not (v_old.status = ''Pendiente de Fijar Precios'' and p_new_status = ''Ganada'' and v_approval)';
  v_after:='not (v_old.status in (''Pendiente de Fijar Precios'', ''Pricing Aprobado'') and v_old.repricing_return_status = ''Ganada'' and p_new_status = ''Ganada'' and v_approval)';
  if strpos(v_definition,v_before)=0 then raise exception 'Operational sync guard not found'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before:='  if p_new_status = ''Perdida'' then';
  v_after:='  if v_approval and p_new_status=''Ganada'' and exists (select 1 from public.quotation_options where quotation_id=p_quotation_id) then
    perform public.snapshot_won_quotation_adjustment(p_quotation_id);
  end if;
  if p_new_status = ''Perdida'' then';
  if strpos(v_definition,v_before)=0 then raise exception 'Transition insert point not found'; end if;
  execute replace(v_definition,v_before,v_after);

  v_definition:=pg_get_functiondef('public.guard_quotation_transition()'::regprocedure);
  v_before:='(old.status = ''Pendiente de Fijar Precios'' and new.status = ''Ganada'')';
  v_after:='(old.status in (''Pendiente de Fijar Precios'', ''Pricing Aprobado'') and new.status = ''Ganada'' and old.repricing_return_status = ''Ganada'')';
  if strpos(v_definition,v_before)=0 then raise exception 'Pricing role guard not found'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before:='and old.status <> ''Pendiente de Fijar Precios''';
  v_after:='and not (old.status in (''Pendiente de Fijar Precios'', ''Pricing Aprobado'') and old.repricing_return_status = ''Ganada'')';
  if strpos(v_definition,v_before)=0 then raise exception 'Sales role guard not found'; end if;
  execute replace(v_definition,v_before,v_after);
end;
$$;
comment on column public.quotation_options.supersedes_option_id is
  'Internal successor of an already won commercial choice; no new client acceptance. Original accepted snapshot is preserved.';
notify pgrst,'reload schema';
