-- Facturas preparatorias sin numeración fiscal y sustituciones aprobadas.
-- No cambia documentos ni concede permisos a cuentas existentes.
create table public.invoice_master_settings (
  tenant_id uuid primary key references public.tenants(id),
  profile_id uuid not null references public.profiles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  assignment_source text not null default 'Admin' check(assignment_source in ('Admin','Despliegue autorizado')),
  check(assigned_by is not null or assignment_source='Despliegue autorizado')
);
create table public.invoice_drafts (
  id uuid primary key,
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  revision integer not null default 1 check(revision>0),
  status text not null default 'Borrador' check(status in ('Borrador','Pendiente de aprobación','Aprobada','Rechazada','Emitida','Descartada')),
  invoice_payload jsonb not null,
  items jsonb not null default '[]',
  editor_state jsonb not null default '{}',
  quotation_id uuid,
  quotation_fingerprint text,
  source_invoice_id uuid,
  source_snapshot jsonb,
  invoice_id uuid,
  reason text,
  reviewed_revision integer,
  approved_context_fingerprint text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_reason text,
  last_request_key uuid not null,
  last_request_fingerprint text not null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,quotation_id) references public.quotations(tenant_id,id),
  foreign key(tenant_id,source_invoice_id) references public.invoices(tenant_id,id),
  foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),
  check(jsonb_typeof(invoice_payload)='object' and jsonb_typeof(items)='array' and jsonb_typeof(editor_state)='object'),
  check((status='Emitida')=(invoice_id is not null))
);
create index invoice_drafts_tenant_updated on public.invoice_drafts(tenant_id,updated_at desc,id);
create unique index invoice_draft_replacement_unique on public.invoice_drafts(source_invoice_id) where status='Emitida' and source_invoice_id is not null;
create table public.invoice_workflow_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  draft_id uuid, actor_id uuid references public.profiles(id), actor_name text not null,
  action text not null, reason text, snapshot jsonb not null, created_at timestamptz not null default now(),
  foreign key(tenant_id,draft_id) references public.invoice_drafts(tenant_id,id),
  check(actor_id is not null or (draft_id is null and action='Master designado' and coalesce(snapshot->>'origin','')='Despliegue autorizado'))
);
create index invoice_workflow_events_draft on public.invoice_workflow_events(tenant_id,draft_id,created_at,id);
alter table public.invoices add column correction_reference jsonb;
do $$ declare target text; begin
 foreach target in array array['invoice_master_settings','invoice_drafts','invoice_workflow_events'] loop
  execute format('alter table public.%I enable row level security',target);
  execute format('revoke all on public.%I from public,anon,authenticated',target);
  execute format('grant select on public.%I to authenticated',target);
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',target);
 end loop;
end $$;

create function public.is_invoice_master() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_approved_active_user() and public.current_tenant_id() is not null
 and public.is_role(array['Admin','Contabilidad']) and exists(
  select 1 from public.invoice_master_settings s join public.profiles p on p.id=s.profile_id
  where s.tenant_id=public.current_tenant_id() and s.profile_id=auth.uid() and p.tenant_id=s.tenant_id
 );
$$;
create function public.invoice_workflow_event_internal(p_draft uuid,p_action text,p_reason text,p_snapshot jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 insert into public.invoice_workflow_events(tenant_id,draft_id,actor_id,actor_name,action,reason,snapshot)
 select public.current_tenant_id(),p_draft,auth.uid(),coalesce(nullif(btrim(nombre),''),'Usuario financiero'),p_action,p_reason,p_snapshot
 from public.profiles where id=auth.uid();
end $$;
create function public.set_invoice_master(p_profile_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare previous uuid;
begin
 if not public.is_role(array['Admin']) or not public.is_approved_active_user() or public.current_tenant_id() is null then raise exception 'Solo Administración puede designar al usuario master' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de la designación'; end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-master:'||public.current_tenant_id(),0));
 if p_profile_id is not null and not exists(select 1 from public.profiles where id=p_profile_id and tenant_id=public.current_tenant_id() and rol in ('Admin','Contabilidad') and status='Aprobado' and is_active) then raise exception 'El master debe ser Admin o Contabilidad aprobado, activo y de esta empresa'; end if;
 select profile_id into previous from public.invoice_master_settings where tenant_id=public.current_tenant_id();
 if previous is not distinct from p_profile_id then return; end if;
 if p_profile_id is null then delete from public.invoice_master_settings where tenant_id=public.current_tenant_id();
 else insert into public.invoice_master_settings(tenant_id,profile_id,assigned_by) values(public.current_tenant_id(),p_profile_id,auth.uid())
 on conflict(tenant_id) do update set profile_id=excluded.profile_id,assigned_by=excluded.assigned_by,assigned_at=now(),assignment_source='Admin'; end if;
 perform public.invoice_workflow_event_internal(null,'Master designado',btrim(p_reason),jsonb_build_object('previous',previous,'profile_id',p_profile_id));
end $$;
create function public.invoice_source_snapshot_internal(p_invoice public.invoices) returns jsonb language sql immutable as $$
 select to_jsonb(p_invoice)-array['status','updated_at','paid_date','payment_method','payment_reference','cancellation_request_id','cancellation_reason','cancelled_at','cancelled_by'];
$$;
create function public.invoice_quotation_fingerprint_internal(p_id uuid) returns text language sql stable security definer set search_path=public as $$
 select md5(coalesce(jsonb_agg(to_jsonb(p) order by created_at,id)::text,'[]')) from public.pricing_items p where quotation_id=p_id and tenant_id=public.current_tenant_id() and deleted_at is null;
$$;
create function public.invoice_draft_context_internal(p_payload jsonb) returns text language plpgsql security definer set search_path=public as $$
declare client public.clientes%rowtype; office public.billing_offices%rowtype; settings public.company_settings%rowtype;
begin
 select * into client from public.clientes where id=nullif(p_payload->>'cliente_id','')::uuid and tenant_id=public.current_tenant_id() for share;
 select * into office from public.billing_offices where id=client.billing_office_id and tenant_id=public.current_tenant_id() for share;
 select * into settings from public.company_settings where tenant_id=public.current_tenant_id() for share;
 return md5(jsonb_build_object('client',jsonb_build_object('id',client.id,'name',client.nombre,'rtn',client.rtn,'address',client.direccion,'email',client.email_1,'terms',client.condicion_pago,'days',client.dias_credito,'office',client.billing_office_id,'deleted',client.deleted_at),
  'office',to_jsonb(office)-array['updated_at','created_at'],'settings',to_jsonb(settings)-array['updated_at','created_at'])::text);
end $$;
create function public.save_invoice_draft(p_id uuid,p_revision integer,p_request_key uuid,p_invoice jsonb,p_items jsonb,p_editor_state jsonb,p_quotation_id uuid default null,p_source_invoice_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare draft public.invoice_drafts%rowtype; source public.invoices%rowtype; fingerprint text; v_source_snapshot jsonb;
begin
 if not public.can_manage_finance() or public.current_tenant_id() is null or auth.uid() is null then raise exception 'Sin permiso para preparar facturas' using errcode='42501'; end if;
 if p_id is null or p_request_key is null or p_revision is null or p_revision<0 then raise exception 'Identificador y versión requeridos'; end if;
 if jsonb_typeof(p_invoice) is distinct from 'object' or p_invoice->>'invoice_type' is distinct from 'Factura' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 or jsonb_typeof(p_editor_state) is distinct from 'object' then raise exception 'Borrador de factura inválido'; end if;
 if pg_column_size(p_invoice)+pg_column_size(p_items)+pg_column_size(p_editor_state)>1048576 then raise exception 'El borrador excede el tamaño permitido'; end if;
 if nullif(p_invoice->>'parent_invoice_id','') is not null then raise exception 'El borrador de factura no es una nota fiscal'; end if;
 if nullif(p_invoice->>'cliente_id','') is not null and not exists(select 1 from public.clientes where id=(p_invoice->>'cliente_id')::uuid and tenant_id=public.current_tenant_id() and deleted_at is null) then raise exception 'Cliente ajeno o eliminado'; end if;
 if p_quotation_id is not null then
  perform 1 from public.quotations where id=p_quotation_id and tenant_id=public.current_tenant_id() and deleted_at is null for share;
  if not found then raise exception 'Cotización no disponible'; end if;
 end if;
 fingerprint:=md5(jsonb_build_object('invoice',p_invoice,'items',p_items,'editor',p_editor_state,'quotation',p_quotation_id,'source',p_source_invoice_id)::text);
 perform pg_advisory_xact_lock(hashtextextended('invoice-draft:'||p_id,0));
 select * into draft from public.invoice_drafts where id=p_id for update;
 if found then
  if draft.tenant_id<>public.current_tenant_id() then raise exception 'Borrador no disponible' using errcode='42501'; end if;
  if draft.last_request_key=p_request_key then
   if draft.last_request_fingerprint<>fingerprint then raise exception 'La solicitud ya existe con otros datos'; end if;
   return to_jsonb(draft);
  end if;
  if draft.status in ('Emitida','Descartada') then raise exception 'Este borrador ya no admite cambios'; end if;
  if draft.revision<>p_revision then raise exception 'El borrador cambió; recarga antes de guardar'; end if;
  if draft.source_invoice_id is distinct from p_source_invoice_id then raise exception 'La factura original no puede cambiar'; end if;
 elsif p_revision<>0 then raise exception 'Borrador no disponible';
 end if;
 if p_source_invoice_id is not null then
  select * into source from public.invoices where id=p_source_invoice_id and tenant_id=public.current_tenant_id() and deleted_at is null for share;
  if not found or source.invoice_type<>'Factura' or source.cai is null then raise exception 'Selecciona una factura fiscal numerada para corregir'; end if;
  v_source_snapshot:=public.invoice_source_snapshot_internal(source);
 end if;
 if draft.id is null then
  insert into public.invoice_drafts(id,tenant_id,invoice_payload,items,editor_state,quotation_id,quotation_fingerprint,source_invoice_id,source_snapshot,last_request_key,last_request_fingerprint)
  values(p_id,public.current_tenant_id(),p_invoice,p_items,p_editor_state,p_quotation_id,case when p_quotation_id is not null then public.invoice_quotation_fingerprint_internal(p_quotation_id) end,p_source_invoice_id,v_source_snapshot,p_request_key,fingerprint) returning * into draft;
 else
  update public.invoice_drafts set revision=revision+1,status='Borrador',invoice_payload=p_invoice,items=p_items,editor_state=p_editor_state,
   quotation_id=p_quotation_id,quotation_fingerprint=case when p_quotation_id is not null then public.invoice_quotation_fingerprint_internal(p_quotation_id) end,
   source_snapshot=v_source_snapshot,reviewed_revision=null,approved_context_fingerprint=null,reviewed_by=null,reviewed_at=null,review_reason=null,reason=null,
   last_request_key=p_request_key,last_request_fingerprint=fingerprint,updated_at=now() where id=p_id returning * into draft;
 end if;
 perform public.invoice_workflow_event_internal(draft.id,'Borrador guardado',null,to_jsonb(draft));
 return to_jsonb(draft);
end $$;

create function public.submit_invoice_correction(p_id uuid,p_revision integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare draft public.invoice_drafts%rowtype;
begin
 if not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'Sin permiso' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de la corrección'; end if;
 select * into draft from public.invoice_drafts where id=p_id and tenant_id=public.current_tenant_id() for update;
 if not found or draft.source_invoice_id is null or draft.revision<>p_revision or draft.status in ('Emitida','Descartada') then raise exception 'Corrección no disponible o desactualizada'; end if;
 if draft.status='Pendiente de aprobación' and draft.reason=btrim(p_reason) then return to_jsonb(draft); end if;
 update public.invoice_drafts set status='Pendiente de aprobación',reason=btrim(p_reason),reviewed_revision=null,approved_context_fingerprint=null,reviewed_by=null,reviewed_at=null,review_reason=null,updated_at=now() where id=p_id returning * into draft;
 perform public.invoice_workflow_event_internal(p_id,'Corrección solicitada',btrim(p_reason),to_jsonb(draft)); return to_jsonb(draft);
end $$;
create function public.review_invoice_correction(p_id uuid,p_revision integer,p_approve boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare draft public.invoice_drafts%rowtype;
begin
 perform 1 from public.invoice_master_settings where tenant_id=public.current_tenant_id() for share;
 if not public.is_invoice_master() then raise exception 'Solo el usuario master puede aprobar correcciones' using errcode='42501'; end if;
 if p_approve is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de la decisión'; end if;
 select * into draft from public.invoice_drafts where id=p_id and tenant_id=public.current_tenant_id() for update;
 if not found or draft.source_invoice_id is null or draft.revision<>p_revision then raise exception 'Corrección no disponible o desactualizada'; end if;
 if draft.status=(case when p_approve then 'Aprobada' else 'Rechazada' end) and draft.reviewed_revision=p_revision and draft.review_reason=btrim(p_reason) then return to_jsonb(draft); end if;
 if draft.status<>'Pendiente de aprobación' then raise exception 'La corrección debe estar pendiente de aprobación'; end if;
 update public.invoice_drafts set status=case when p_approve then 'Aprobada' else 'Rechazada' end,
  reviewed_revision=revision,approved_context_fingerprint=case when p_approve then public.invoice_draft_context_internal(invoice_payload) end,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason),updated_at=now() where id=p_id returning * into draft;
 perform public.invoice_workflow_event_internal(p_id,'Corrección '||lower(draft.status),btrim(p_reason),to_jsonb(draft)); return to_jsonb(draft);
end $$;

create function public.issue_invoice_draft(p_id uuid,p_revision integer) returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare draft public.invoice_drafts%rowtype; source public.invoices%rowtype; result record; payload jsonb; issued public.invoices%rowtype;
begin
 if not public.can_manage_finance() or public.current_tenant_id() is null or auth.uid() is null then raise exception 'Sin permiso para emitir' using errcode='42501'; end if;
 select * into draft from public.invoice_drafts where id=p_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Borrador no disponible' using errcode='42501'; end if;
 if draft.source_invoice_id is not null then perform 1 from public.invoice_master_settings where tenant_id=draft.tenant_id for share; end if;
 if draft.source_invoice_id is not null and not public.is_invoice_master() then raise exception 'Solo el usuario master puede emitir una corrección' using errcode='42501'; end if;
 if draft.status='Emitida' then
  select * into issued from public.invoices where id=draft.invoice_id and tenant_id=draft.tenant_id;
  return query select issued.id,issued.invoice_number; return;
 end if;
 if p_revision is distinct from draft.revision or draft.status not in ('Borrador','Aprobada') then raise exception 'Recarga el borrador y confirma su versión antes de emitir'; end if;
 if nullif(draft.invoice_payload->>'issue_date','') is null then raise exception 'Confirma la fecha de emisión antes de emitir'; end if;
 if draft.invoice_payload->>'currency'='USD' and (nullif(draft.invoice_payload->>'exchange_rate','') is null or (draft.invoice_payload->>'exchange_rate')::numeric<=0 or (draft.invoice_payload->>'exchange_rate')::numeric>1000000 or (draft.invoice_payload->>'exchange_rate')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Completa el tipo de cambio USD antes de emitir'; end if;
 if draft.source_invoice_id is not null then
  if draft.status<>'Aprobada' or draft.reviewed_revision is distinct from draft.revision then raise exception 'La corrección requiere aprobación del master sobre esta versión'; end if;
  if draft.reviewed_by is distinct from (select profile_id from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Cambió el usuario master; solicita una nueva aprobación'; end if;
  if draft.reviewed_at<(select assigned_at from public.invoice_master_settings where tenant_id=draft.tenant_id) then raise exception 'Se renovó el permiso master; solicita una nueva aprobación'; end if;
  if draft.approved_context_fingerprint is distinct from public.invoice_draft_context_internal(draft.invoice_payload) then raise exception 'Los datos del cliente o emisor cambiaron; solicita una nueva aprobación'; end if;
  select * into source from public.invoices where id=draft.source_invoice_id and tenant_id=draft.tenant_id for update;
  if source.status<>'Anulada' or source.cancellation_request_id is null then raise exception 'Contabilidad debe aprobar la anulación del original antes de emitir la sustitución'; end if;
  if public.invoice_source_snapshot_internal(source) is distinct from draft.source_snapshot then raise exception 'La factura original cambió; revisa y solicita nueva aprobación'; end if;
  if exists(select 1 from public.invoice_drafts where source_invoice_id=source.id and status='Emitida') then raise exception 'La factura ya tiene una sustitución emitida'; end if;
  if source.quotation_id is not null then perform 1 from public.quotations where id=source.quotation_id and tenant_id=draft.tenant_id for update; end if;
 end if;
 if draft.quotation_id is not null then
  perform 1 from public.quotations where id=draft.quotation_id and tenant_id=draft.tenant_id for update;
  if public.invoice_quotation_fingerprint_internal(draft.quotation_id) is distinct from draft.quotation_fingerprint then raise exception 'Las líneas de cotización cambiaron; vuelve a cargarlas y guarda el borrador'; end if;
 end if;
 payload:=draft.invoice_payload||jsonb_build_object('invoice_type','Factura');
 if draft.quotation_id is not null then select * into result from public.create_invoice_from_quotation(payload,draft.quotation_id);
 else select * into result from public.create_manual_invoice_with_items(payload,draft.items); end if;
 update public.invoices set status='Aprobada',quotation_id=case when draft.source_invoice_id is not null then source.quotation_id else quotation_id end,correction_reference=case when draft.source_invoice_id is not null then
  jsonb_build_object('invoice_id',source.id,'invoice_number',source.invoice_number,'cai',source.cai,'issue_date',source.issue_date,'reason',draft.reason,'approved_by',draft.reviewed_by,'approved_at',draft.reviewed_at) end
 where id=result.invoice_id and tenant_id=draft.tenant_id;
 update public.invoice_drafts set status='Emitida',invoice_id=result.invoice_id,updated_at=now() where id=draft.id returning * into draft;
 perform public.invoice_workflow_event_internal(draft.id,'Factura emitida',draft.reason,to_jsonb(draft));
 return query select result.invoice_id::uuid,result.invoice_number::text;
end $$;

create function public.guard_invoice_workflow_history() returns trigger language plpgsql as $$ begin raise exception 'El historial de facturación es inmutable'; end $$;
create trigger invoice_workflow_events_immutable before update or delete on public.invoice_workflow_events for each row execute function public.guard_invoice_workflow_history();
create function public.guard_issued_invoice_notes() returns trigger language plpgsql as $$
begin
 if current_user='authenticated' and old.invoice_type='Factura' and old.cai is not null and
  (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) then raise exception 'La factura numerada conserva su contenido; prepara una corrección aprobada por el master'; end if;
 return new;
end $$;
create trigger guard_issued_invoice_notes before update on public.invoices for each row execute function public.guard_issued_invoice_notes();
revoke all on function public.invoice_workflow_event_internal(uuid,text,text,jsonb),public.invoice_source_snapshot_internal(public.invoices),public.invoice_quotation_fingerprint_internal(uuid),public.invoice_draft_context_internal(jsonb),public.guard_invoice_workflow_history(),public.guard_issued_invoice_notes() from public,anon,authenticated;
revoke all on function public.is_invoice_master(),public.set_invoice_master(uuid,text),public.save_invoice_draft(uuid,integer,uuid,jsonb,jsonb,jsonb,uuid,uuid),public.submit_invoice_correction(uuid,integer,text),public.review_invoice_correction(uuid,integer,boolean,text),public.issue_invoice_draft(uuid,integer) from public,anon;
grant execute on function public.is_invoice_master(),public.set_invoice_master(uuid,text),public.save_invoice_draft(uuid,integer,uuid,jsonb,jsonb,jsonb,uuid,uuid),public.submit_invoice_correction(uuid,integer,text),public.review_invoice_correction(uuid,integer,boolean,text),public.issue_invoice_draft(uuid,integer) to authenticated;
notify pgrst,'reload schema';
