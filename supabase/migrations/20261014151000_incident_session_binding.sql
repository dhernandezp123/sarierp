-- AUD-11: an asynchronous browser action must not execute as a different session.
begin;
alter function public.report_miami_incident(uuid,text,text,uuid) rename to report_miami_incident_internal;
revoke all on function public.report_miami_incident_internal(uuid,text,text,uuid) from public,anon,authenticated,service_role;
create function public.report_miami_incident(
  p_package_id uuid,p_tipo text,p_descripcion text,p_request_key uuid,p_expected_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then
    raise exception 'La sesión cambió. Actualiza el portal antes de reportar' using errcode='42501';
  end if;
  return public.report_miami_incident_internal(p_package_id,p_tipo,p_descripcion,p_request_key);
end;
$$;
revoke all on function public.report_miami_incident(uuid,text,text,uuid,uuid) from public,anon,service_role;
grant execute on function public.report_miami_incident(uuid,text,text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
