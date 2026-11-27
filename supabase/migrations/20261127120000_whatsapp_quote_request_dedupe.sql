-- WA-03. Duplicados por contenido en solicitudes de WhatsApp.
-- Si el mismo vendedor envia en 24 horas una solicitud con los mismos datos (cliente, modalidad,
-- origen, destino, mercancia, peso, volumen, bultos; sin mayusculas ni espacios extra), no se
-- registra y se devuelve la existente. "COTIZACION NUEVA" (p_force) registra igual.
-- La idempotencia por whatsapp_message_id se conserva y se evalua primero.

create function public.whatsapp_normalize_text(p_value text) returns text
language sql immutable set search_path=public as $$
 select lower(regexp_replace(btrim(coalesce(p_value,'')),'\s+',' ','g'));
$$;

drop function public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text);

create function public.whatsapp_create_quote_request(
 p_tenant_id uuid,p_profile_id uuid,p_message_id text,p_data jsonb,p_texto text,p_force boolean default false
) returns table(id uuid,codigo text,created boolean,duplicate boolean)
language plpgsql security definer set search_path=public as $$
declare
 existing public.solicitudes_cotizacion%rowtype; next_n integer; result_id uuid:=gen_random_uuid(); v_codigo text;
 v_cliente text:=btrim(coalesce(p_data->>'cliente','')); v_modalidad text:=btrim(coalesce(p_data->>'modalidad',''));
 v_origen text:=btrim(coalesce(p_data->>'origen','')); v_destino text:=btrim(coalesce(p_data->>'destino',''));
 v_mercancia text:=btrim(coalesce(p_data->>'mercancia',''));
 v_peso text:=left(nullif(btrim(coalesce(p_data->>'peso','')),''),200); v_volumen text:=left(nullif(btrim(coalesce(p_data->>'volumen','')),''),200);
 v_bultos text:=left(nullif(btrim(coalesce(p_data->>'bultos','')),''),200);
begin
 if p_tenant_id is null or p_profile_id is null or nullif(btrim(coalesce(p_message_id,'')),'') is null then raise exception 'Solicitud invalida';end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Datos invalidos';end if;
 if v_cliente='' or v_modalidad='' or v_origen='' or v_destino='' or v_mercancia='' then raise exception 'Faltan datos obligatorios';end if;
 v_cliente:=left(v_cliente,200); v_modalidad:=left(v_modalidad,80); v_origen:=left(v_origen,200); v_destino:=left(v_destino,200); v_mercancia:=left(v_mercancia,500);
 if not exists(select 1 from public.whatsapp_find_sender(p_tenant_id,(select s.phone from public.whatsapp_quote_senders s
  where s.tenant_id=p_tenant_id and s.profile_id=p_profile_id)) f where f.profile_id=p_profile_id)
 then raise exception 'Remitente no autorizado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-quote-request:'||p_tenant_id,0));
 select * into existing from public.solicitudes_cotizacion r where r.tenant_id=p_tenant_id and r.whatsapp_message_id=p_message_id;
 if found then return query select existing.id,existing.codigo,false,false; return; end if;
 if not coalesce(p_force,false) then
  select * into existing from public.solicitudes_cotizacion r
  where r.tenant_id=p_tenant_id and r.solicitado_por_id=p_profile_id and r.creado_en>now()-interval '24 hours'
   and public.whatsapp_normalize_text(r.cliente)=public.whatsapp_normalize_text(v_cliente)
   and public.whatsapp_normalize_text(r.modalidad)=public.whatsapp_normalize_text(v_modalidad)
   and public.whatsapp_normalize_text(r.origen)=public.whatsapp_normalize_text(v_origen)
   and public.whatsapp_normalize_text(r.destino)=public.whatsapp_normalize_text(v_destino)
   and public.whatsapp_normalize_text(r.mercancia)=public.whatsapp_normalize_text(v_mercancia)
   and public.whatsapp_normalize_text(r.peso)=public.whatsapp_normalize_text(v_peso)
   and public.whatsapp_normalize_text(r.volumen)=public.whatsapp_normalize_text(v_volumen)
   and public.whatsapp_normalize_text(r.bultos)=public.whatsapp_normalize_text(v_bultos)
  order by r.creado_en desc limit 1;
  if found then return query select existing.id,existing.codigo,false,true; return; end if;
 end if;
 select coalesce(max(substring(r.codigo from 4)::integer),0)+1 into next_n from public.solicitudes_cotizacion r where r.tenant_id=p_tenant_id;
 v_codigo:='SQ-'||lpad(next_n::text,4,'0');
 insert into public.solicitudes_cotizacion(id,tenant_id,codigo,cliente,modalidad,origen,destino,mercancia,peso,volumen,bultos,incoterm,notas,
  texto_original,solicitado_por_id,whatsapp_message_id)
 values(result_id,p_tenant_id,v_codigo,v_cliente,v_modalidad,v_origen,v_destino,v_mercancia,v_peso,v_volumen,v_bultos,
  left(nullif(btrim(coalesce(p_data->>'incoterm','')),''),40),
  left(nullif(btrim(coalesce(p_data->>'notas','')),''),1000),left(coalesce(p_texto,''),4000),p_profile_id,p_message_id);
 return query select result_id,v_codigo,true,false;
end;
$$;

revoke all on function public.whatsapp_normalize_text(text),
 public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.whatsapp_normalize_text(text),
 public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text,boolean) to service_role;
