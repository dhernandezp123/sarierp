-- WA-04. Convertir una solicitud de WhatsApp en cotizacion del sistema.
-- Solo Admin y Pricing del tenant convierten. Cliente nuevo y cotizacion quedan a nombre de un vendedor
-- (Admin o Ventas activo): el que hizo la solicitud; si la hizo Pricing, el vendedor asignado al cliente
-- existente o, si no hay uno valido (o el cliente es nuevo), el que elija quien convierte.
-- La funcion asume la identidad (sub del JWT) de ese vendedor solo dentro de esta transaccion para reutilizar
-- create_quotation_with_child_lines y sus validaciones, numeracion e iniciales del vendedor.
-- Fuera de esta funcion Pricing sigue sin poder crear clientes ni cotizaciones.

alter table public.solicitudes_cotizacion
 add column quotation_id uuid,
 add column convertido_por uuid references auth.users(id),
 add column convertido_en timestamptz,
 add constraint solicitudes_cotizacion_quotation_unique unique(quotation_id),
 add constraint solicitudes_cotizacion_quotation_fkey foreign key(tenant_id,quotation_id) references public.quotations(tenant_id,id),
 add constraint solicitudes_cotizacion_conversion_check check(
  (quotation_id is null and convertido_por is null and convertido_en is null)
  or (quotation_id is not null and convertido_por is not null and convertido_en is not null and estado='Cotizada'));

-- Una solicitud convertida no vuelve a otro estado.
create or replace function public.whatsapp_set_quote_request_status(p_id uuid,p_estado text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.solicitudes_cotizacion%rowtype;
begin
 if not public.whatsapp_has_role(array['Admin','Pricing']) then raise exception 'No autorizado' using errcode='42501';end if;
 if p_estado is null or p_estado not in ('Pendiente','En proceso','Cotizada') then raise exception 'Estado invalido';end if;
 select * into r from public.solicitudes_cotizacion where id=p_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 if r.quotation_id is not null then raise exception 'La solicitud ya fue convertida en cotizacion; su estado no cambia';end if;
 update public.solicitudes_cotizacion set estado=p_estado,estado_actualizado_por=auth.uid(),estado_actualizado_en=now() where id=r.id;
end;
$$;

-- Perfil que puede tener cotizaciones a su nombre en el tenant.
create function public.whatsapp_is_quote_owner(p_tenant_id uuid,p_profile_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select p_profile_id is not null and exists(select 1 from public.profiles p where p.id=p_profile_id and p.tenant_id=p_tenant_id
  and p.status='Aprobado' and p.is_active is true and p.is_platform_admin is false and p.rol in ('Admin','Ventas'));
$$;

create function public.whatsapp_convert_quote_request(
 p_request_id uuid,p_quotation_data jsonb,p_container_lines jsonb default '[]'::jsonb,p_cargo_lines jsonb default '[]'::jsonb,
 p_pricing_items jsonb default '[]'::jsonb,p_new_client jsonb default null,p_seller_id uuid default null
) returns table(quotation_id uuid,quotation_number text,cliente_id uuid,seller_id uuid)
language plpgsql security definer set search_path=public as $$
declare
 v_tenant uuid:=public.current_tenant_id(); v_caller uuid:=auth.uid(); r public.solicitudes_cotizacion%rowtype;
 v_claims text:=current_setting('request.jwt.claims',true); v_claim_sub text:=current_setting('request.jwt.claim.sub',true);
 v_cliente uuid; v_codigo text; v_nombre text; v_q record; v_existing text; v_owner uuid; v_client_seller uuid;
begin
 if v_caller is null or v_tenant is null or not public.whatsapp_has_role(array['Admin','Pricing']) then raise exception 'No autorizado' using errcode='42501';end if;
 if p_quotation_data is null or jsonb_typeof(p_quotation_data)<>'object' then raise exception 'Datos de cotizacion invalidos';end if;
 select * into r from public.solicitudes_cotizacion s where s.id=p_request_id and s.tenant_id=v_tenant for update;
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 if r.quotation_id is not null then
  select q.quotation_number into v_existing from public.quotations q where q.id=r.quotation_id;
  raise exception 'La solicitud % ya fue convertida en la cotizacion %',r.codigo,coalesce(v_existing,r.quotation_id::text);
 end if;
 if (p_new_client is null)=(nullif(p_quotation_data->>'cliente_id','') is null) then raise exception 'Elige un cliente existente o crea uno nuevo';end if;
 if p_new_client is null then
  v_cliente:=(p_quotation_data->>'cliente_id')::uuid;
  select c.vendedor_asignado into v_client_seller from public.clientes c where c.id=v_cliente and c.tenant_id=v_tenant and c.deleted_at is null;
  if not found then raise exception 'Cliente no disponible';end if;
 end if;

 -- Dueno de la cotizacion (y del cliente nuevo).
 if public.whatsapp_is_quote_owner(v_tenant,r.solicitado_por_id) then
  v_owner:=r.solicitado_por_id;
 elsif exists(select 1 from public.profiles p where p.id=r.solicitado_por_id and p.tenant_id=v_tenant and p.status='Aprobado'
  and p.is_active is true and p.is_platform_admin is false and p.rol='Pricing') then
  if v_cliente is not null and public.whatsapp_is_quote_owner(v_tenant,v_client_seller) then v_owner:=v_client_seller;
  elsif public.whatsapp_is_quote_owner(v_tenant,p_seller_id) then v_owner:=p_seller_id;
  else raise exception 'Elige el vendedor (Admin o Ventas activo) a cuyo nombre quedara la cotizacion';end if;
 else
  raise exception 'El usuario que hizo la solicitud ya no esta activo; no se puede convertir';
 end if;
 if p_seller_id is not null and p_seller_id<>v_owner then raise exception 'La cotizacion queda a nombre de otro vendedor; no se puede elegir uno distinto';end if;

 -- Identidad del vendedor solo para esta transaccion; se restaura antes de vincular la solicitud.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',v_owner::text,true);

 if p_new_client is not null then
  if jsonb_typeof(p_new_client)<>'object' then raise exception 'Datos de cliente invalidos';end if;
  v_nombre:=btrim(coalesce(p_new_client->>'nombre',''));
  if v_nombre='' or length(v_nombre)>200 then raise exception 'El nombre del cliente es obligatorio';end if;
  if nullif(p_new_client->>'billing_office_id','') is not null and not exists(select 1 from public.billing_offices b where b.id=(p_new_client->>'billing_office_id')::uuid and b.tenant_id=v_tenant)
  then raise exception 'Oficina de facturacion no disponible';end if;
  insert into public.clientes(tenant_id,nombre,nit,contacto,telefono,email_1,pais,tipo_persona,billing_office_id,condicion_pago,dias_credito,tipo_cliente,vendedor_asignado)
  values(v_tenant,v_nombre,nullif(btrim(coalesce(p_new_client->>'nit','')),''),nullif(btrim(coalesce(p_new_client->>'contacto','')),''),
   nullif(btrim(coalesce(p_new_client->>'telefono','')),''),nullif(btrim(coalesce(p_new_client->>'email_1','')),''),nullif(btrim(coalesce(p_new_client->>'pais','')),''),
   coalesce(nullif(p_new_client->>'tipo_persona',''),'Corporativo'),nullif(p_new_client->>'billing_office_id','')::uuid,
   coalesce(nullif(p_new_client->>'condicion_pago',''),'Contado'),coalesce(nullif(p_new_client->>'dias_credito','')::integer,0),
   nullif(btrim(coalesce(p_new_client->>'tipo_cliente','')),''),v_owner)
  returning id,codigo_cliente into v_cliente,v_codigo;
  insert into public.cliente_history(tenant_id,cliente_id,changed_by,action,notes)
  values(v_tenant,v_cliente,v_caller,'Cliente creado','Cliente '||coalesce(v_codigo,v_nombre)||' creado desde la solicitud de WhatsApp '||r.codigo);
 end if;

 select * into v_q from public.create_quotation_with_child_lines(
  p_quotation_data||jsonb_build_object('cliente_id',v_cliente),p_container_lines,p_cargo_lines,p_pricing_items);

 perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(v_claim_sub,''),true);
 if auth.uid() is distinct from v_caller then raise exception 'No se pudo restaurar la sesion';end if;

 update public.solicitudes_cotizacion set quotation_id=v_q.id,estado='Cotizada',estado_actualizado_por=v_caller,estado_actualizado_en=now(),
  convertido_por=v_caller,convertido_en=now() where id=r.id;
 return query select v_q.id,v_q.quotation_number,v_cliente,v_owner;
end;
$$;

revoke all on function public.whatsapp_is_quote_owner(uuid,uuid),
 public.whatsapp_convert_quote_request(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_convert_quote_request(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to authenticated;
