-- GOV-ALERTS-03/04: avisos contables y actividad. Sin envios de correo durante migracion.
create table public.accounting_alert_settings(
 tenant_id uuid primary key references public.tenants(id),revision integer not null default 1,
 internal_enabled boolean not null default true,portal_enabled boolean not null default false,
 email_enabled boolean not null default false,before_days integer[] not null default array[7,3,0],
 overdue_days integer not null default 7 check(overdue_days between 1 and 90),
 inactivity_days integer[] not null default array[30,60,90],updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create table public.collections_contact_preferences(
 tenant_id uuid not null,cliente_id uuid not null,approved_emails text[] not null default '{}',
 portal_enabled boolean not null default false,revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid not null,
 primary key(tenant_id,cliente_id),foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),foreign key(tenant_id,updated_by) references public.profiles(tenant_id,id)
);
create table public.accounting_alert_configuration_events(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.profiles(id),reason text not null,snapshot jsonb not null,created_at timestamptz not null default now()
);
create table public.accounting_alert_events(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 recipient_id uuid not null,kind text not null check(kind in ('ready','due','courtesy','inactive')),
 entity_id uuid not null,stage text not null,title text not null,body text not null,href text not null,
 active boolean not null default true,notification_id uuid references public.notifications(id),created_at timestamptz not null default now(),checked_at timestamptz not null default now(),
 unique(tenant_id,recipient_id,kind,entity_id,stage),foreign key(tenant_id,recipient_id) references public.profiles(tenant_id,id)
);
create index accounting_alert_recipient on public.accounting_alert_events(tenant_id,recipient_id,active);
create table public.accounting_customer_reminders(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),invoice_id uuid not null,
 stage text not null,recipient_email text not null,cliente_id uuid not null,status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped','uncertain')),
 attempts integer not null default 0,updated_at timestamptz not null default now(),created_at timestamptz not null default now(),sent_at timestamptz,
 resend_message_id text,error_message text,request_body text,provider_key text,provider_credential_hash text,first_attempt_at timestamptz,lease_token uuid,retry_authorized boolean not null default false,
 unique(tenant_id,invoice_id,stage,recipient_email),foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id)
);
create table public.accounting_portal_reminders(
 tenant_id uuid not null,invoice_id uuid not null,profile_id uuid not null,stage text not null,notification_id uuid not null references public.client_notifications(id),
 primary key(tenant_id,invoice_id,profile_id,stage),foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),foreign key(tenant_id,profile_id) references public.profiles(tenant_id,id)
);
do $$declare t text;begin foreach t in array array['accounting_alert_settings','collections_contact_preferences','accounting_alert_configuration_events','accounting_alert_events','accounting_customer_reminders','accounting_portal_reminders'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t='accounting_alert_events' then
  execute format('create policy read_own on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.is_approved_active_user() and recipient_id=auth.uid())',t);
 else
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.is_approved_active_user() and public.can_manage_finance())',t);
 end if;
end loop;end $$;
grant all on public.accounting_customer_reminders to service_role;

create function public.save_accounting_alert_settings(p_revision integer,p_settings jsonb,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare current_revision integer;before_values integer[];inactive_values integer[];
begin
 if not public.is_approved_active_user() or not public.is_invoice_master() then raise exception 'Solo Administracion o el master contable puede configurar avisos' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 or jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Configuracion y motivo requeridos';end if;
 select array_agg(distinct x::integer order by x::integer desc) into before_values from jsonb_array_elements_text(p_settings->'before_days')x;
 select array_agg(distinct x::integer order by x::integer) into inactive_values from jsonb_array_elements_text(p_settings->'inactivity_days')x;
 if cardinality(before_values) not between 1 and 10 or cardinality(inactive_values) not between 1 and 10 or before_values is null or inactive_values is null
 or exists(select 1 from unnest(before_values)v where v not between 0 and 90) or exists(select 1 from unnest(inactive_values)v where v not between 1 and 730)
 or (p_settings->>'overdue_days')::integer not between 1 and 90 or p_settings->>'overdue_days' is null
 or jsonb_typeof(p_settings->'internal_enabled') is distinct from 'boolean' or jsonb_typeof(p_settings->'portal_enabled') is distinct from 'boolean' or jsonb_typeof(p_settings->'email_enabled') is distinct from 'boolean' then raise exception 'Revisa los intervalos y canales de alertas';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounting-alert-settings:'||public.current_tenant_id(),0));
 select revision into current_revision from public.accounting_alert_settings where tenant_id=public.current_tenant_id() for update;
 if p_revision is distinct from coalesce(current_revision,0) then raise exception 'La configuracion cambio; recarga antes de guardar';end if;
 insert into public.accounting_alert_settings(tenant_id,internal_enabled,portal_enabled,email_enabled,before_days,overdue_days,inactivity_days,updated_by)
 values(public.current_tenant_id(),(p_settings->>'internal_enabled')::boolean,(p_settings->>'portal_enabled')::boolean,(p_settings->>'email_enabled')::boolean,before_values,(p_settings->>'overdue_days')::integer,inactive_values,auth.uid())
 on conflict(tenant_id) do update set revision=accounting_alert_settings.revision+1,internal_enabled=excluded.internal_enabled,portal_enabled=excluded.portal_enabled,email_enabled=excluded.email_enabled,before_days=excluded.before_days,overdue_days=excluded.overdue_days,inactivity_days=excluded.inactivity_days,updated_at=now(),updated_by=auth.uid();
 insert into public.accounting_alert_configuration_events(tenant_id,actor_id,reason,snapshot) values(public.current_tenant_id(),auth.uid(),btrim(p_reason),p_settings);
end $$;
create function public.save_collections_contacts(p_client uuid,p_revision integer,p_slots text[],p_portal boolean,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.clientes%rowtype;emails text[];rev integer;
begin
 if not public.is_approved_active_user() or not public.is_invoice_master() then raise exception 'Sin permiso para seleccionar contactos de cobranza' using errcode='42501';end if;
 if p_slots is null or p_portal is null or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 or not(p_slots<@array['email_1','email_2']) then raise exception 'Seleccion y motivo requeridos';end if;
 select * into c from public.clientes where id=p_client and tenant_id=public.current_tenant_id() and deleted_at is null for share;
 if not found then raise exception 'Cliente no disponible';end if;
 select coalesce(array_agg(distinct lower(btrim(case v when 'email_1' then c.email_1 else c.email_2 end))),'{}') into emails from unnest(p_slots)v;
 if exists(select 1 from unnest(emails)e where e is null or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'El contacto seleccionado no tiene un correo valido en su perfil';end if;
 perform pg_advisory_xact_lock(hashtextextended('collections-contacts:'||p_client,0));
 select revision into rev from public.collections_contact_preferences where tenant_id=c.tenant_id and cliente_id=c.id for update;
 if p_revision is distinct from coalesce(rev,0) then raise exception 'Los contactos cambiaron; recarga antes de guardar';end if;
 insert into public.collections_contact_preferences(tenant_id,cliente_id,approved_emails,portal_enabled,updated_by) values(c.tenant_id,c.id,emails,p_portal,auth.uid())
 on conflict(tenant_id,cliente_id) do update set revision=collections_contact_preferences.revision+1,approved_emails=excluded.approved_emails,portal_enabled=excluded.portal_enabled,updated_by=auth.uid(),updated_at=now();
 insert into public.accounting_alert_configuration_events(tenant_id,actor_id,reason,snapshot) values(c.tenant_id,auth.uid(),btrim(p_reason),jsonb_build_object('client_id',c.id,'approved_emails',emails,'portal_enabled',p_portal));
end $$;

-- Extraer la consulta canonica en una funcion privada reutilizable por el scheduler.
-- No se simula auth.uid ni se atribuyen acciones de sistema a un administrador.
do $$declare definition text;header text;body text;query_body text;view_body text;begin
 select pg_get_functiondef('public.get_billing_work_queue()'::regprocedure),prosrc into definition,body from pg_proc where oid='public.get_billing_work_queue()'::regprocedure;
 if position('return query' in lower(body))=0 or position('public.current_tenant_id()' in body)=0 then raise exception 'Cola de facturacion no reconocida';end if;
 header:=left(definition,position('AS $function$' in definition)-1);
 if header='' then raise exception 'Cabecera de cola no reconocida';end if;
 query_body:='begin '||substring(body from position('return query' in lower(body)));
 execute replace(header,'get_billing_work_queue()','billing_work_queue_data_internal(p_tenant uuid)')||'AS $function$'||replace(query_body,'public.current_tenant_id()','p_tenant')||'$function$';
 execute header||'AS $function$'||left(body,position('return query' in lower(body))-1)||'return query select * from public.billing_work_queue_data_internal(public.current_tenant_id()); end; $function$';
 view_body:=pg_get_viewdef('public.customer_document_balances'::regclass,true);
 if position('current_tenant_id()' in view_body)=0 or position('can_manage_finance()' in view_body)=0 then raise exception 'Saldo canonico no reconocido';end if;
 view_body:=replace(replace(replace(replace(view_body,'public.current_tenant_id()','p_tenant'),'current_tenant_id()','p_tenant'),'public.can_manage_finance()','true'),'can_manage_finance()','true');
 execute 'create function public.accounting_document_balances_internal(p_tenant uuid) returns setof public.customer_document_balances language sql stable security definer set search_path=public set timezone=''America/Tegucigalpa'' as $fn$'||view_body||'$fn$';
end $$;

create function public.accounting_due_stage_internal(p_due date,p_today date,p_before integer[],p_repeat integer) returns text
language sql immutable set search_path=public as $$
 select case when p_due is null then null when p_due<p_today then p_due::text||':over:'||((p_today-p_due-1)/p_repeat)::text
 else (select p_due::text||':before:'||min(v)::text from unnest(p_before)v where v>=p_due-p_today) end;
$$;
create function public.client_activity_data_internal(p_tenant uuid)
returns table(id uuid,name text,seller_id uuid,created_date date,last_quotation date,last_operation date,last_movement date)
language sql stable security definer set search_path=public set timezone='America/Tegucigalpa' as $$
 select c.id,c.nombre,c.vendedor_asignado,(c.created_at at time zone 'America/Tegucigalpa')::date,
 (select max((q.created_at at time zone 'America/Tegucigalpa')::date) from public.quotations q where q.tenant_id=c.tenant_id and q.cliente_id=c.id and q.deleted_at is null),
 (select max((s.created_at at time zone 'America/Tegucigalpa')::date) from public.shipments s join public.shipping_instructions si on si.id=s.shipping_instruction_id and si.tenant_id=s.tenant_id and si.deleted_at is null where s.tenant_id=c.tenant_id and s.client_id=c.id and s.operational_status not in ('Cancelada','Cancelado')),
 greatest((select max(b.actual_etd) from public.bookings b join public.shipments s on s.id=b.shipment_id and s.tenant_id=b.tenant_id join public.shipping_instructions si on si.id=s.shipping_instruction_id and si.tenant_id=s.tenant_id and si.deleted_at is null
 where s.tenant_id=c.tenant_id and s.client_id=c.id and s.operational_status not in ('Cancelada','Cancelado') and b.replaced_by_booking_id is null and coalesce(b.booking_lifecycle_status,'Activo')<>'Cancelado' and b.actual_etd<=current_date),
 (select max((m.received_at at time zone 'America/Tegucigalpa')::date) from public.miami_packages m where m.tenant_id=c.tenant_id and m.cliente_id=c.id and m.received_at<=now()))
 from public.clientes c where c.tenant_id=p_tenant and c.deleted_at is null;
$$;
create function public.get_client_activity(p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public set timezone='America/Tegucigalpa' as $$
declare result jsonb;begin
 if not public.is_approved_active_user() or not public.is_role(array['Admin','Ventas','Contabilidad','Finanzas']) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Paginacion invalida';end if;
 with records as(select a.*,case when greatest(a.last_quotation,a.last_movement,a.created_date) is not null then greatest(current_date-greatest(a.last_quotation,a.last_movement,a.created_date),0) end as inactivity_days from public.client_activity_data_internal(public.current_tenant_id())a
 where not public.is_role(array['Ventas']) or a.seller_id=auth.uid()),page as(select * from records order by inactivity_days desc nulls last,id limit p_limit offset p_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from records),'thresholds',coalesce((select to_jsonb(inactivity_days) from public.accounting_alert_settings where tenant_id=public.current_tenant_id()),'[30,60,90]'::jsonb)) into result;return result;
end $$;

-- Consulta de candidatos siempre actual: pagos, anulaciones, cierre y responsables
-- se verifican de nuevo en cada ejecucion y al abrir la bandeja.
create function public.accounting_alert_candidates_internal(p_tenant uuid)
returns table(recipient_id uuid,kind text,entity_id uuid,stage text,title text,body text,href text)
language sql stable security definer set search_path=public set timezone='America/Tegucigalpa' as $$
 with settings as(select coalesce((select internal_enabled from public.accounting_alert_settings where tenant_id=p_tenant),true) enabled,
 coalesce((select before_days from public.accounting_alert_settings where tenant_id=p_tenant),array[7,3,0]) before_days,
 coalesce((select overdue_days from public.accounting_alert_settings where tenant_id=p_tenant),7) repeat_days,
 coalesce((select inactivity_days from public.accounting_alert_settings where tenant_id=p_tenant),array[30,60,90]) inactive),
 people as(select p.id,p.rol from public.profiles p where p.tenant_id=p_tenant and p.status='Aprobado' and p.is_active),
 due as(select b.*,public.accounting_due_stage_internal(b.due_date,current_date,s.before_days,s.repeat_days) stage from public.accounting_document_balances_internal(p_tenant)b cross join settings s where b.invoice_type<>'Proforma' and b.balance>0),
 ready as(select * from public.billing_work_queue_data_internal(p_tenant) where readiness_code='READY_TO_INVOICE'),
 activity as(select a.*,(select max(v) from unnest(s.inactive)v where current_date-greatest(a.last_quotation,a.last_movement,a.created_date)>=v) threshold from public.client_activity_data_internal(p_tenant)a cross join settings s)
 select p.id,'ready',r.quotation_id,'ready','Embarque listo para facturar',r.client_name||' · '||coalesce(r.quotation_number,r.quotation_id::text),case when p.rol::text='Operaciones' then '/operations/dashboard' else '/invoicing?view=work' end
 from ready r cross join people p cross join settings cfg where cfg.enabled and (p.rol::text in ('Admin','Contabilidad','Finanzas') or (p.rol::text='Operaciones' and exists(select 1 from public.shipments s where s.tenant_id=p_tenant and s.quotation_id=r.quotation_id and s.assigned_to=p.id and s.operational_status not in ('Cancelada','Cancelado'))))
 union all
 select p.id,'due',d.id,d.stage,case when d.due_date<current_date then 'Factura vencida' else 'Vencimiento de factura' end,
 coalesce(d.cliente_nombre,'Cliente sin nombre')||' · '||coalesce(d.invoice_number,d.id::text)||' · Vence '||to_char(d.due_date,'DD/MM/YYYY')||' · Saldo '||d.currency||' '||to_char(d.balance,'FM999999999999990.00'),
 case when p.rol::text='Operaciones' then '/operations/dashboard' else '/invoicing/'||d.id end
 from due d cross join people p cross join settings cfg where cfg.enabled and d.stage is not null and (p.rol::text in ('Admin','Contabilidad','Finanzas') or (p.rol::text='Operaciones' and exists(select 1 from public.invoices i join public.shipments s on s.quotation_id=i.quotation_id and s.tenant_id=i.tenant_id where i.id=d.root_id and i.tenant_id=p_tenant and s.assigned_to=p.id and s.operational_status not in ('Cancelada','Cancelado'))))
 union all
 select p.id,'courtesy',r.id,'revision:'||r.draft_revision||':'||r.requested_at::text,'Cortesia pendiente de aprobacion',coalesce(r.line_snapshot->>'description','Concepto')||' · '||r.reason,'/invoicing/courtesies'
 from public.invoice_courtesy_requests r join public.invoice_drafts d on d.id=r.draft_id and d.tenant_id=r.tenant_id cross join people p cross join settings cfg
 where cfg.enabled and r.tenant_id=p_tenant and r.status='Pendiente' and r.draft_revision=d.revision and d.status not in ('Emitida','Descartada') and p.id<>r.requested_by and public.invoice_courtesy_authority_internal(p_tenant,p.id) is not null
 union all
 select p.id,'inactive',a.id,'inactive:'||a.threshold||':'||greatest(a.last_quotation,a.last_movement,a.created_date),'Cliente sin actividad reciente',a.name||' · '||(current_date-greatest(a.last_quotation,a.last_movement,a.created_date))||' dias sin cotizar ni movimiento registrado','/clientes/activity'
 from activity a cross join people p cross join settings cfg where cfg.enabled and a.threshold is not null and (p.rol::text='Admin' or (p.rol::text='Ventas' and a.seller_id=p.id));
$$;
create function public.get_accounting_alerts(p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 if not public.is_approved_active_user() or not public.is_role(array['Admin','Contabilidad','Finanzas','Operaciones','Ventas','Pricing']) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Paginacion invalida';end if;
 with records as(select * from public.accounting_alert_candidates_internal(public.current_tenant_id()) where recipient_id=auth.uid()),page as(select * from records order by kind,entity_id,stage limit p_limit offset p_offset)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from records)) into result;return result;
end $$;

create function public.notify_invoice_courtesy_internal() returns trigger
language plpgsql security definer set search_path=public as $$
declare candidate record;event public.accounting_alert_events%rowtype;notification uuid;begin
 -- Una decision o cambio de revision resuelve inmediatamente el aviso anterior.
 update public.accounting_alert_events set active=false where tenant_id=new.tenant_id and kind='courtesy' and entity_id=new.id;
 update public.notifications n set is_read=true from public.accounting_alert_events a where a.tenant_id=new.tenant_id and a.kind='courtesy' and a.entity_id=new.id and a.notification_id=n.id and n.tenant_id=a.tenant_id;
 if new.status='Pendiente' then
  for candidate in select * from public.accounting_alert_candidates_internal(new.tenant_id) where kind='courtesy' and entity_id=new.id loop
   insert into public.accounting_alert_events(tenant_id,recipient_id,kind,entity_id,stage,title,body,href)
   values(new.tenant_id,candidate.recipient_id,candidate.kind,candidate.entity_id,candidate.stage,candidate.title,candidate.body,candidate.href)
   on conflict(tenant_id,recipient_id,kind,entity_id,stage) do update set active=true,title=excluded.title,body=excluded.body,checked_at=now() returning * into event;
   if event.notification_id is null then
    insert into public.notifications(tenant_id,user_id,title,message,type) values(new.tenant_id,candidate.recipient_id,candidate.title,candidate.body,'warning') returning id into notification;
    update public.accounting_alert_events set notification_id=notification where id=event.id;
   end if;
  end loop;
 elsif tg_op='UPDATE' and old.status='Pendiente' and new.status in ('Aprobada','Rechazada')
 and coalesce((select internal_enabled from public.accounting_alert_settings where tenant_id=new.tenant_id),true) then
  insert into public.notifications(tenant_id,user_id,title,message,type) values(new.tenant_id,new.requested_by,'Cortesia '||lower(new.status),coalesce(new.line_snapshot->>'description','Concepto')||' · '||new.review_reason,'info');
 end if;
 return new;
end $$;
create trigger notify_invoice_courtesy after insert or update on public.invoice_courtesy_requests for each row execute function public.notify_invoice_courtesy_internal();

create function public.accounting_reminder_documents_internal(p_tenant uuid)
returns table(invoice_id uuid,cliente_id uuid,invoice_number text,currency text,due_date date,balance numeric,stage text,emails text[],portal boolean)
language sql stable security definer set search_path=public set timezone='America/Tegucigalpa' as $$
 select b.id,b.cliente_id,b.invoice_number,b.currency,b.due_date,b.balance,
 public.accounting_due_stage_internal(b.due_date,current_date,s.before_days,s.overdue_days),
 case when s.email_enabled then array(select distinct lower(btrim(e)) from unnest(array[c.email_1,c.email_2])e
 where lower(btrim(e))=any(pref.approved_emails) and e ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') else '{}'::text[] end,
 s.portal_enabled and pref.portal_enabled
 from public.accounting_document_balances_internal(p_tenant)b
 join public.clientes c on c.id=b.cliente_id and c.tenant_id=b.tenant_id and c.deleted_at is null
 join public.collections_contact_preferences pref on pref.cliente_id=b.cliente_id and pref.tenant_id=b.tenant_id
 join public.accounting_alert_settings s on s.tenant_id=b.tenant_id
 where b.invoice_type<>'Proforma' and b.balance>0 and nullif(btrim(b.invoice_number),'') is not null and (s.portal_enabled or s.email_enabled);
$$;
create function public.process_accounting_alerts() returns jsonb
language plpgsql security definer set search_path=public set timezone='America/Tegucigalpa' as $$
declare tenant record;r record;event public.accounting_alert_events%rowtype;notification uuid;counter integer:=0;client_reminder record;recipient record;begin
 if auth.role() is distinct from 'service_role' and not(session_user='postgres' and current_setting('role',true) in ('none','postgres')) then raise exception 'Solo scheduler' using errcode='42501';end if;
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then raise exception 'Los avisos automaticos solo se procesan en Production';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('accounting-alert-scheduler',0)) then return jsonb_build_object('busy',true);end if;
 for tenant in select id from public.tenants loop
  update public.accounting_alert_events set active=false where tenant_id=tenant.id;
  for r in select * from public.accounting_alert_candidates_internal(tenant.id) loop
   insert into public.accounting_alert_events(tenant_id,recipient_id,kind,entity_id,stage,title,body,href)
   values(tenant.id,r.recipient_id,r.kind,r.entity_id,r.stage,r.title,r.body,r.href)
   on conflict(tenant_id,recipient_id,kind,entity_id,stage) do update set active=true,title=excluded.title,body=excluded.body,href=excluded.href,checked_at=now()
   returning * into event;
   if event.notification_id is null then
    insert into public.notifications(tenant_id,user_id,title,message,type) values(tenant.id,r.recipient_id,r.title,r.body,'warning') returning id into notification;
    update public.accounting_alert_events set notification_id=notification where id=event.id;counter:=counter+1;
   else update public.notifications set title=r.title,message=r.body where id=event.notification_id and tenant_id=tenant.id;end if;
  end loop;
  update public.notifications n set is_read=true from public.accounting_alert_events a where a.tenant_id=tenant.id and not a.active and a.notification_id=n.id and n.tenant_id=a.tenant_id;
  for client_reminder in select * from public.accounting_reminder_documents_internal(tenant.id) where stage is not null loop
   if client_reminder.portal then
    for recipient in select p.id from public.profiles p where p.tenant_id=tenant.id and p.cliente_id=client_reminder.cliente_id and p.rol::text='Cliente' and p.status='Aprobado' and p.is_active loop
     select notification_id into notification from public.accounting_portal_reminders where tenant_id=tenant.id and invoice_id=client_reminder.invoice_id and profile_id=recipient.id and stage=client_reminder.stage;
     if not found then
      insert into public.client_notifications(tenant_id,profile_id,title,body,type,entity_type,entity_id)
      values(tenant.id,recipient.id,'Recordatorio de factura',client_reminder.invoice_number||' · Vence '||to_char(client_reminder.due_date,'DD/MM/YYYY')||' · Saldo '||client_reminder.currency||' '||to_char(client_reminder.balance,'FM999999999999990.00'),'sistema','invoices',client_reminder.invoice_id) returning id into notification;
      insert into public.accounting_portal_reminders values(tenant.id,client_reminder.invoice_id,recipient.id,client_reminder.stage,notification);
     end if;
    end loop;
   end if;
   insert into public.accounting_customer_reminders(tenant_id,invoice_id,cliente_id,stage,recipient_email)
   select tenant.id,client_reminder.invoice_id,client_reminder.cliente_id,client_reminder.stage,email from unnest(client_reminder.emails)email on conflict do nothing;
  end loop;
  update public.accounting_customer_reminders job set status='skipped',error_message='Documento, etapa o destinatario ya no vigente',updated_at=now()
  where job.tenant_id=tenant.id and job.status='pending' and job.attempts=0 and not exists(select 1 from public.accounting_reminder_documents_internal(tenant.id)d where d.invoice_id=job.invoice_id and d.stage=job.stage and job.recipient_email=any(d.emails));
  update public.client_notifications n set read_at=coalesce(n.read_at,now()) from public.accounting_portal_reminders pr
  where pr.tenant_id=tenant.id and pr.notification_id=n.id and n.tenant_id=pr.tenant_id
  and not exists(select 1 from public.accounting_reminder_documents_internal(tenant.id)d where d.invoice_id=pr.invoice_id and d.stage=pr.stage and d.portal);
 end loop;
 return jsonb_build_object('created',counter,'processed_at',now());
end $$;

create function public.get_accounting_email_dispatch(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 if auth.role() is distinct from 'service_role' and not(session_user='postgres' and current_setting('role',true) in ('none','postgres')) then raise exception 'Solo scheduler' using errcode='42501';end if;
 if not exists(select 1 from public.platform_environment where singleton and environment='production') then return null;end if;
 select jsonb_build_object('id',j.id,'tenant_id',j.tenant_id,'invoice_id',j.invoice_id,'cliente_id',j.cliente_id,'stage',j.stage,'recipient_email',j.recipient_email,'invoice_number',d.invoice_number,'currency',d.currency,'due_date',d.due_date,'balance',d.balance) into result
 from public.accounting_customer_reminders j cross join lateral public.accounting_reminder_documents_internal(j.tenant_id)d
 where j.id=p_id and j.status='pending' and j.attempts=0 and d.invoice_id=j.invoice_id and d.stage=j.stage and j.recipient_email=any(d.emails);
 return result;
end $$;

-- Resumen financiero minimo del cliente autenticado; nunca expone costos/asientos.
create function public.get_portal_invoice_balance(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare client uuid;result jsonb;begin
 select cliente_id into client from public.profiles where id=auth.uid() and tenant_id=public.current_tenant_id() and rol::text='Cliente' and status='Aprobado' and is_active;
 if not found or client is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select jsonb_build_object('invoice_number',b.invoice_number,'issue_date',b.issue_date,'due_date',b.due_date,'currency',b.currency,'total',b.total,'balance',b.balance,'status',b.status) into result
 from public.accounting_document_balances_internal(public.current_tenant_id())b where b.id=p_invoice and b.cliente_id=client and b.invoice_type<>'Proforma';
 if result is null then raise exception 'Documento no disponible' using errcode='42501';end if;return result;
end $$;

revoke all on function public.billing_work_queue_data_internal(uuid),public.accounting_document_balances_internal(uuid),public.accounting_due_stage_internal(date,date,integer[],integer),public.client_activity_data_internal(uuid),public.accounting_alert_candidates_internal(uuid),public.accounting_reminder_documents_internal(uuid),public.notify_invoice_courtesy_internal(),public.process_accounting_alerts(),public.get_accounting_email_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.process_accounting_alerts(),public.get_accounting_email_dispatch(uuid) to service_role;
revoke all on function public.save_accounting_alert_settings(integer,jsonb,text),public.save_collections_contacts(uuid,integer,text[],boolean,text),public.get_client_activity(integer,integer),public.get_accounting_alerts(integer,integer),public.get_portal_invoice_balance(uuid) from public,anon;
grant execute on function public.save_accounting_alert_settings(integer,jsonb,text),public.save_collections_contacts(uuid,integer,text[],boolean,text),public.get_client_activity(integer,integer),public.get_accounting_alerts(integer,integer),public.get_portal_invoice_balance(uuid) to authenticated;
notify pgrst,'reload schema';
