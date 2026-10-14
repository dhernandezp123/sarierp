-- AUD-11: preserve confirmed request identities and their idempotency evidence.
begin;
create or replace function public.guard_portal_incident_write()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      raise exception 'Reporta la incidencia desde su acción autorizada' using errcode='42501';
    elsif tg_op='DELETE' then
      if old.request_key is not null then
        raise exception 'La incidencia reportada conserva su historial' using errcode='42501';
      end if;
      return old;
    elsif new.tenant_id is distinct from old.tenant_id or new.cliente_id is distinct from old.cliente_id
      or new.package_id is distinct from old.package_id or new.created_by is distinct from old.created_by
      or new.request_key is distinct from old.request_key then
      raise exception 'No se puede cambiar la identidad de una incidencia' using errcode='42501';
    end if;
    if old.request_key is not null and (new.tipo is distinct from old.tipo or new.descripcion is distinct from old.descripcion) then
      raise exception 'El reporte original conserva su contenido' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger guard_portal_incident_write on public.miami_incidencias;
create trigger guard_portal_incident_write before insert or update or delete on public.miami_incidencias
  for each row execute function public.guard_portal_incident_write();
commit;
