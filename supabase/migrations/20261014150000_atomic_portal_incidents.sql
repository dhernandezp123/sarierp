-- AUD-11: reporting a portal incident commits the case, package flag and trace together.
begin;
alter table public.miami_incidencias
  add column request_key uuid,
  add column created_by uuid,
  add constraint miami_incident_actor_tenant_fkey foreign key(tenant_id,created_by)
    references public.profiles(tenant_id,id);
create unique index miami_incident_request_key
  on public.miami_incidencias(tenant_id,created_by,request_key) where request_key is not null;
create index miami_incident_active_package
  on public.miami_incidencias(tenant_id,package_id) where status in ('Abierta','En revisión');

-- Existing rows are not rewritten; duplicate/mislinked legacy cases require review.
drop policy if exists miami_incidencias_cliente_insert on public.miami_incidencias;
create function public.guard_portal_incident_write()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      raise exception 'Reporta la incidencia desde su acción autorizada' using errcode='42501';
    elsif new.tenant_id is distinct from old.tenant_id or new.cliente_id is distinct from old.cliente_id
      or new.package_id is distinct from old.package_id or new.created_by is distinct from old.created_by
      or new.request_key is distinct from old.request_key then
      raise exception 'No se puede cambiar la identidad de una incidencia' using errcode='42501';
    end if;
    if old.request_key is not null and (new.tipo is distinct from old.tipo or new.descripcion is distinct from old.descripcion) then
      raise exception 'El reporte original conserva su contenido' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_portal_incident_write() from public,anon,authenticated;
create trigger guard_portal_incident_write before insert or update on public.miami_incidencias
  for each row execute function public.guard_portal_incident_write();

create function public.report_miami_incident(p_package_id uuid,p_tipo text,p_descripcion text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_profile public.profiles%rowtype;
  v_package public.miami_packages%rowtype;
  v_incident public.miami_incidencias%rowtype;
  v_replay boolean := false;
begin
  select * into v_profile from public.profiles where id=auth.uid() for share;
  if not found or v_profile.rol is distinct from 'Cliente' or v_profile.status is distinct from 'Aprobado'
    or v_profile.is_active is not true or v_profile.is_platform_admin is true
    or v_profile.tenant_id is null or v_profile.cliente_id is null
    or v_profile.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Se requiere una sesión de cliente aprobada y activa' using errcode='42501';
  end if;
  if p_package_id is null or p_request_key is null or p_tipo is null
    or p_tipo not in ('Dañado','Incompleto','No reconozco este paquete','Pérdida','Otro')
    or p_descripcion is null or p_descripcion !~ '[^[:space:]]'
    or char_length(btrim(p_descripcion)) not between 1 and 5000 then
    raise exception 'Selecciona paquete, tipo y una descripción de hasta 5000 caracteres' using errcode='22023';
  end if;
  -- Same actor/key is serialized even when an altered retry targets a different package.
  perform pg_advisory_xact_lock(hashtextextended('miami_incident:'||v_profile.tenant_id::text||':'||v_profile.id::text||':'||p_request_key::text,0));
  select * into v_package from public.miami_packages where id=p_package_id
    and tenant_id=v_profile.tenant_id and cliente_id=v_profile.cliente_id for update;
  if not found then raise exception 'Paquete no disponible para esta cuenta' using errcode='42501'; end if;
  perform 1 from public.clientes where id=v_profile.cliente_id and tenant_id=v_profile.tenant_id
    and deleted_at is null for share;
  if not found then raise exception 'Cliente no disponible' using errcode='42501'; end if;
  select * into v_incident from public.miami_incidencias where tenant_id=v_profile.tenant_id
    and created_by=v_profile.id and request_key=p_request_key;
  if found then
    if v_incident.package_id is distinct from p_package_id or v_incident.tipo is distinct from p_tipo
      or v_incident.cliente_id is distinct from v_profile.cliente_id
      or v_incident.descripcion is distinct from btrim(p_descripcion) then
      raise exception 'La solicitud ya corresponde a otro reporte. Consulta Incidencias' using errcode='22023';
    end if;
    v_replay := true;
  else
    if v_package.status='Entregado' or v_package.cargo_status='Entregado' then
      raise exception 'Para un paquete entregado contacta al equipo; no se abrió un caso nuevo' using errcode='PT409';
    end if;
    if v_package.status not in ('Asignado','Con incidencia') then
      raise exception 'El paquete no está disponible para reportar. Actualiza la lista' using errcode='PT409';
    end if;
    if exists(select 1 from public.miami_incidencias where tenant_id=v_profile.tenant_id
      and package_id=p_package_id and status in ('Abierta','En revisión')) then
      raise exception 'El paquete ya tiene una incidencia abierta. Consulta Incidencias' using errcode='PT409';
    end if;
    insert into public.miami_incidencias(tenant_id,package_id,cliente_id,tipo,descripcion,status,request_key,created_by)
    values(v_profile.tenant_id,p_package_id,v_profile.cliente_id,p_tipo,btrim(p_descripcion),'Abierta',p_request_key,v_profile.id)
      returning * into v_incident;
    update public.miami_packages set status='Con incidencia' where id=p_package_id and tenant_id=v_profile.tenant_id;
    insert into public.miami_package_events(tenant_id,package_id,event_type,old_status,new_status,created_by,metadata)
    values(v_profile.tenant_id,p_package_id,'incident_reported',v_package.status,'Con incidencia',v_profile.id,
      jsonb_build_object('incident_id',v_incident.id,'tipo',p_tipo,'request_key',p_request_key));
    insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
    values(v_profile.tenant_id,v_profile.id,'Portal','report_miami_incident','miami_incidencias',v_incident.id,
      'Incidencia de paquete registrada',jsonb_build_object('package_id',p_package_id,'request_key',p_request_key));
  end if;
  return jsonb_build_object('incident_id',v_incident.id,'package_id',p_package_id,'cliente_id',v_incident.cliente_id,
    'tenant_id',v_incident.tenant_id,'created_by',v_incident.created_by,'request_key',v_incident.request_key,
    'tipo',v_incident.tipo,'descripcion',v_incident.descripcion,'status',v_incident.status,
    'package_status',case when v_replay then v_package.status else 'Con incidencia' end,
    'tracking_number',v_package.tracking_number,'already_applied',v_replay);
end;
$$;
revoke all on function public.report_miami_incident(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.report_miami_incident(uuid,text,text,uuid) to authenticated;

create function public.guard_miami_incident_event()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon') and (
    (tg_op<>'DELETE' and new.event_type='incident_reported')
    or (tg_op<>'INSERT' and old.event_type='incident_reported')) then
    raise exception 'El evento de incidencia se genera desde su acción autorizada' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_miami_incident_event() from public,anon,authenticated;
create trigger guard_miami_incident_event before insert or update or delete on public.miami_package_events
  for each row execute function public.guard_miami_incident_event();
notify pgrst,'reload schema';
commit;
