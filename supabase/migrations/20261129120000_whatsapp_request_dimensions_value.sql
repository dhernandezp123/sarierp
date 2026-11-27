-- WA-05. Medidas y valor declarado en solicitudes de WhatsApp.
-- "Medidas" ya no se guarda como volumen: tiene su propio campo. "Valor FOB/declarado" queda como texto
-- tal como lo escribio el vendedor. La alta guarda ambos; la deteccion de duplicados no cambia.

alter table public.solicitudes_cotizacion
 add column medidas text check(medidas is null or length(medidas) <= 500),
 add column valor_declarado text check(valor_declarado is null or length(valor_declarado) <= 200);

create or replace function public.whatsapp_create_quote_request(
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
 insert into public.solicitudes_cotizacion(id,tenant_id,codigo,cliente,modalidad,origen,destino,mercancia,peso,volumen,bultos,incoterm,notas,medidas,valor_declarado,
  texto_original,solicitado_por_id,whatsapp_message_id)
 values(result_id,p_tenant_id,v_codigo,v_cliente,v_modalidad,v_origen,v_destino,v_mercancia,v_peso,v_volumen,v_bultos,
  left(nullif(btrim(coalesce(p_data->>'incoterm','')),''),40),
  left(nullif(btrim(coalesce(p_data->>'notas','')),''),1000),left(nullif(btrim(coalesce(p_data->>'medidas','')),''),500),
  left(nullif(btrim(coalesce(p_data->>'valor','')),''),200),left(coalesce(p_texto,''),4000),p_profile_id,p_message_id);
 return query select result_id,v_codigo,true,false;
end;
$$;
