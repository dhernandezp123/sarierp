-- AUD-05: maintenance only. Restore return metadata solely from an explicit,
-- unambiguous final Ganada -> pending history entry, never from a shipment alone.
create function public.recover_proven_legacy_repricing(
  p_quotation_id uuid, p_history_id uuid, p_expected_revision bigint, p_reason text
) returns void language plpgsql security invoker set search_path=public as $$
declare q public.quotations%rowtype; h public.quotation_status_history%rowtype;
begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Owner-reviewed maintenance only' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 20 then
    raise exception 'Document the review evidence' using errcode='22023';
  end if;
  select * into q from public.quotations where id=p_quotation_id for update;
  if not found or q.status <> 'Pendiente de Fijar Precios' or q.pricing_approved is not false
    or q.repricing_return_status is not null or q.status_revision is distinct from p_expected_revision then
    raise exception 'Quotation changed or is not an unresolved legacy case' using errcode='PT409';
  end if;
  select * into h from public.quotation_status_history where id=p_history_id
    and quotation_id=q.id and tenant_id=q.tenant_id for share;
  if not found or h.old_status is distinct from 'Ganada' or h.new_status is distinct from q.status
    or h.created_at is null or h.created_at>clock_timestamp()
    or exists(select 1 from public.quotation_status_history other where other.quotation_id=q.id
      and other.id<>h.id and (other.created_at is null or other.created_at>=h.created_at)) then
    raise exception 'Final history does not prove the return state uniquely' using errcode='23514';
  end if;
  update public.quotations set repricing_return_status='Ganada' where id=q.id;
  insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
  values(q.tenant_id,null,'quotations','recover_proven_legacy_repricing','quotation',q.id,
    'Reviewed migration maintenance: restore proven repricing return metadata',
    jsonb_build_object('reason',btrim(p_reason),'source_history_id',h.id,'source_history_actor',h.changed_by,
      'database_role',current_user,'status_revision',q.status_revision,'old_return_status',null,'new_return_status','Ganada'));
end $$;
revoke all on function public.recover_proven_legacy_repricing(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
