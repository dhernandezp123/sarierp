-- Approved active tenant Admin has full financial administration.
-- The individually designated accounting master keeps its authority.
create or replace function public.is_invoice_master() returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_approved_active_user() and public.current_tenant_id() is not null
 and (public.is_role(array['Admin']) or (public.is_role(array['Contabilidad']) and exists(
  select 1 from public.invoice_master_settings s join public.profiles p on p.id=s.profile_id
  where s.tenant_id=public.current_tenant_id() and s.profile_id=auth.uid() and p.tenant_id=s.tenant_id
 )));
$$;
revoke all on function public.is_invoice_master() from public,anon;
grant execute on function public.is_invoice_master() to authenticated;
comment on function public.is_invoice_master() is 'Approved active tenant Admin or designated accounting master; no platform or cross-tenant access.';

-- Admin approvals remain valid only while that reviewer is an approved active
-- tenant Admin; accounting approvals retain the assignment epoch and identity.
do $patch$
declare definition text; old_guard text := $old$  if draft.reviewed_by is distinct from (select profile_id from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Cambió el usuario master; solicita una nueva aprobación'; end if;
  if draft.reviewed_at<(select assigned_at from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Se renovó el permiso master; solicita una nueva aprobación'; end if;$old$; new_guard text := $new$  if draft.reviewed_at is null then raise exception 'La correccion requiere aprobacion registrada';end if;
  if not exists(select 1 from public.profiles reviewer where reviewer.id=draft.reviewed_by
   and reviewer.tenant_id=draft.tenant_id and reviewer.rol='Admin'
   and reviewer.status='Aprobado' and reviewer.is_active) then
   if not exists(select 1 from public.profiles reviewer where reviewer.id=draft.reviewed_by
    and reviewer.tenant_id=draft.tenant_id and reviewer.rol='Contabilidad'
    and reviewer.status='Aprobado' and reviewer.is_active) then
    raise exception 'El revisor ya no tiene autorizacion; solicita nueva aprobacion';
   end if;
  if draft.reviewed_by is distinct from (select profile_id from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Cambió el usuario master; solicita una nueva aprobación'; end if;
  if draft.reviewed_at<(select assigned_at from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Se renovó el permiso master; solicita una nueva aprobación'; end if;
  end if;$new$;
begin
 definition:=replace(pg_get_functiondef('public.issue_invoice_draft(uuid,integer)'::regprocedure),E'\r\n',E'\n');
 if position(old_guard in definition)=0 then raise exception 'Unexpected correction approval guard; review before applying';end if;
 execute replace(definition,old_guard,new_guard);
end $patch$;
