-- WA-01. Solicitudes de cotizacion recibidas por WhatsApp (webhook Kapso).
-- El webhook llega sin sesion: usa service role y siempre pasa el tenant resuelto por el host.
-- Los numeros autorizados viven en una tabla propia administrada solo por Admin
-- (profiles permite autoedicion de campos basicos, asi que no sirve como fuente de autorizacion).
-- Lecturas por RLS; todas las escrituras pasan por RPC security definer.

-- Usuario autenticado, aprobado y activo del tenant actual con alguno de los roles indicados.
create function public.whatsapp_has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid()
  and p.tenant_id=public.current_tenant_id() and p.status='Aprobado' and p.is_active is true
  and p.is_platform_admin is false and p.rol::text=any(p_roles));
$$;

create table public.whatsapp_quote_senders (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 profile_id uuid not null,
 phone text not null check(phone ~ '^[1-9][0-9]{7,14}$'),
 is_active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 unique(tenant_id,phone), unique(tenant_id,profile_id),
 foreign key(tenant_id,profile_id) references public.profiles(tenant_id,id) on delete cascade
);

create table public.solicitudes_cotizacion (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 codigo text not null check(codigo ~ '^SQ-[0-9]{4,}$'),
 cliente text not null check(length(cliente) between 1 and 200),
 modalidad text not null check(length(modalidad) between 1 and 80),
 origen text not null check(length(origen) between 1 and 200),
 destino text not null check(length(destino) between 1 and 200),
 mercancia text not null check(length(mercancia) between 1 and 500),
 peso text, volumen text, bultos text, incoterm text, notas text,
 texto_original text not null check(length(texto_original) <= 4000),
 solicitado_por_id uuid not null,
 whatsapp_message_id text not null check(length(whatsapp_message_id) between 1 and 200),
 estado text not null default 'Pendiente' check(estado in ('Pendiente','En proceso','Cotizada')),
 estado_actualizado_por uuid references auth.users(id), estado_actualizado_en timestamptz,
 creado_en timestamptz not null default now(),
 unique(tenant_id,codigo), unique(tenant_id,whatsapp_message_id),
 foreign key(tenant_id,solicitado_por_id) references public.profiles(tenant_id,id)
);
create index solicitudes_cotizacion_list on public.solicitudes_cotizacion(tenant_id,estado,creado_en desc);
create index solicitudes_cotizacion_seller on public.solicitudes_cotizacion(tenant_id,solicitado_por_id,creado_en desc);

alter table public.whatsapp_quote_senders enable row level security;
alter table public.solicitudes_cotizacion enable row level security;

create policy whatsapp_quote_senders_read on public.whatsapp_quote_senders for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.whatsapp_has_role(array['Admin']));

-- Admin y Pricing ven la bandeja del tenant; Ventas solo sus propias solicitudes.
create policy solicitudes_cotizacion_read on public.solicitudes_cotizacion for select to authenticated using(
 tenant_id=public.current_tenant_id() and (public.whatsapp_has_role(array['Admin','Pricing'])
  or (solicitado_por_id=auth.uid() and public.whatsapp_has_role(array['Ventas']))));

revoke all on public.whatsapp_quote_senders,public.solicitudes_cotizacion from public,anon,authenticated;
grant select on public.whatsapp_quote_senders,public.solicitudes_cotizacion to authenticated;
grant all on public.whatsapp_quote_senders,public.solicitudes_cotizacion to service_role;

-- Admin: alta o edicion de un numero autorizado. El telefono se normaliza a digitos (codigo de pais incluido).
create function public.whatsapp_save_sender(p_id uuid,p_profile_id uuid,p_phone text,p_is_active boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id(); v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 result_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not public.whatsapp_has_role(array['Admin']) then raise exception 'No autorizado' using errcode='42501';end if;
 if v_phone !~ '^[1-9][0-9]{7,14}$' then raise exception 'Numero invalido: usa codigo de pais y numero (8 a 15 digitos)';end if;
 if p_profile_id is null or not exists(select 1 from public.profiles p where p.id=p_profile_id and p.tenant_id=tenant
  and p.status='Aprobado' and p.is_active is true and p.is_platform_admin is false and p.rol in ('Admin','Ventas','Pricing'))
 then raise exception 'Usuario no disponible: debe ser Admin, Ventas o Pricing activo';end if;
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-sender:'||tenant,0));
 if exists(select 1 from public.whatsapp_quote_senders s where s.tenant_id=tenant and s.phone=v_phone and s.id<>result_id) then raise exception 'Ese numero ya esta registrado';end if;
 if exists(select 1 from public.whatsapp_quote_senders s where s.tenant_id=tenant and s.profile_id=p_profile_id and s.id<>result_id) then raise exception 'Ese usuario ya tiene un numero registrado';end if;
 if p_id is null then
  insert into public.whatsapp_quote_senders(id,tenant_id,profile_id,phone,is_active,created_by,updated_by)
  values(result_id,tenant,p_profile_id,v_phone,coalesce(p_is_active,true),auth.uid(),auth.uid());
 else
  update public.whatsapp_quote_senders set profile_id=p_profile_id,phone=v_phone,is_active=coalesce(p_is_active,is_active),
   updated_by=auth.uid(),updated_at=now() where id=p_id and tenant_id=tenant;
  if not found then raise exception 'Numero no disponible' using errcode='42501';end if;
 end if;
 return result_id;
end;
$$;

create function public.whatsapp_delete_sender(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.whatsapp_has_role(array['Admin']) then raise exception 'No autorizado' using errcode='42501';end if;
 delete from public.whatsapp_quote_senders where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Numero no disponible' using errcode='42501';end if;
end;
$$;

-- Admin y Pricing cambian el estado; Ventas solo lee.
create function public.whatsapp_set_quote_request_status(p_id uuid,p_estado text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.whatsapp_has_role(array['Admin','Pricing']) then raise exception 'No autorizado' using errcode='42501';end if;
 if p_estado is null or p_estado not in ('Pendiente','En proceso','Cotizada') then raise exception 'Estado invalido';end if;
 update public.solicitudes_cotizacion set estado=p_estado,estado_actualizado_por=auth.uid(),estado_actualizado_en=now()
 where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
end;
$$;

-- Webhook (service role): remitente autorizado dentro del tenant.
create function public.whatsapp_find_sender(p_tenant_id uuid,p_phone text)
returns table(profile_id uuid,nombre text)
language sql stable security definer set search_path=public as $$
 select p.id, btrim(coalesce(p.nombre,'')||' '||coalesce(p.apellido,''))
 from public.whatsapp_quote_senders s
 join public.tenants t on t.id=s.tenant_id and t.status='Activo'
 join public.profiles p on p.id=s.profile_id and p.tenant_id=s.tenant_id
 where s.tenant_id=p_tenant_id and s.phone=p_phone and s.is_active is true
  and p.status='Aprobado' and p.is_active is true and p.is_platform_admin is false
  and p.rol in ('Admin','Ventas','Pricing')
 limit 1
$$;

-- Webhook (service role): alta idempotente por (tenant, whatsapp_message_id).
create function public.whatsapp_create_quote_request(
 p_tenant_id uuid,p_profile_id uuid,p_message_id text,p_data jsonb,p_texto text
) returns table(id uuid,codigo text,created boolean)
language plpgsql security definer set search_path=public as $$
declare
 existing public.solicitudes_cotizacion%rowtype; next_n integer; result_id uuid:=gen_random_uuid(); v_codigo text;
 v_cliente text:=btrim(coalesce(p_data->>'cliente','')); v_modalidad text:=btrim(coalesce(p_data->>'modalidad',''));
 v_origen text:=btrim(coalesce(p_data->>'origen','')); v_destino text:=btrim(coalesce(p_data->>'destino',''));
 v_mercancia text:=btrim(coalesce(p_data->>'mercancia',''));
begin
 if p_tenant_id is null or p_profile_id is null or nullif(btrim(coalesce(p_message_id,'')),'') is null then raise exception 'Solicitud invalida';end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Datos invalidos';end if;
 if v_cliente='' or v_modalidad='' or v_origen='' or v_destino='' or v_mercancia='' then raise exception 'Faltan datos obligatorios';end if;
 if not exists(select 1 from public.whatsapp_find_sender(p_tenant_id,(select s.phone from public.whatsapp_quote_senders s
  where s.tenant_id=p_tenant_id and s.profile_id=p_profile_id)) f where f.profile_id=p_profile_id)
 then raise exception 'Remitente no autorizado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-quote-request:'||p_tenant_id,0));
 select * into existing from public.solicitudes_cotizacion r where r.tenant_id=p_tenant_id and r.whatsapp_message_id=p_message_id;
 if found then return query select existing.id,existing.codigo,false; return; end if;
 select coalesce(max(substring(r.codigo from 4)::integer),0)+1 into next_n from public.solicitudes_cotizacion r where r.tenant_id=p_tenant_id;
 v_codigo:='SQ-'||lpad(next_n::text,4,'0');
 insert into public.solicitudes_cotizacion(id,tenant_id,codigo,cliente,modalidad,origen,destino,mercancia,peso,volumen,bultos,incoterm,notas,
  texto_original,solicitado_por_id,whatsapp_message_id)
 values(result_id,p_tenant_id,v_codigo,left(v_cliente,200),left(v_modalidad,80),left(v_origen,200),left(v_destino,200),left(v_mercancia,500),
  left(nullif(btrim(coalesce(p_data->>'peso','')),''),200),left(nullif(btrim(coalesce(p_data->>'volumen','')),''),200),
  left(nullif(btrim(coalesce(p_data->>'bultos','')),''),200),left(nullif(btrim(coalesce(p_data->>'incoterm','')),''),40),
  left(nullif(btrim(coalesce(p_data->>'notas','')),''),1000),left(coalesce(p_texto,''),4000),p_profile_id,p_message_id);
 return query select result_id,v_codigo,true;
end;
$$;

revoke all on function public.whatsapp_has_role(text[]),public.whatsapp_save_sender(uuid,uuid,text,boolean),
 public.whatsapp_delete_sender(uuid),public.whatsapp_set_quote_request_status(uuid,text),
 public.whatsapp_find_sender(uuid,text),public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.whatsapp_has_role(text[]),public.whatsapp_save_sender(uuid,uuid,text,boolean),
 public.whatsapp_delete_sender(uuid),public.whatsapp_set_quote_request_status(uuid,text) to authenticated;
grant execute on function public.whatsapp_find_sender(uuid,text),
 public.whatsapp_create_quote_request(uuid,uuid,text,jsonb,text) to service_role;
