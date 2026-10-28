-- La anulación conserva el documento y requiere una decisión del rol Contabilidad.
create table public.fiscal_void_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 request_key uuid not null, invoice_id uuid, purchase_document_id uuid, withholding_document_id uuid,
 document_id uuid generated always as (coalesce(invoice_id,purchase_document_id,withholding_document_id)) stored,
 document_table text generated always as (case when invoice_id is not null then 'invoices' when purchase_document_id is not null then 'purchase_documents' else 'withholding_documents' end) stored,
 document_type text not null, document_number text not null, cai text, point_of_sale text,
 issue_date date, currency text not null, total numeric(14,2) not null, document_snapshot jsonb not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'Pendiente' check(status in ('Pendiente','Aprobada','Rechazada')),
 requested_at timestamptz not null default now(), requested_by uuid not null references auth.users(id), requested_by_name text not null,
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id), reviewed_by_name text, review_reason text,
 originals_confirmed boolean not null default false,
 accounting_result text check(accounting_result in ('Reversado','Sin asiento previo','No fiscal')),
 original_entry_id uuid, reversal_entry_id uuid,
 unique(tenant_id,id), unique(tenant_id,request_key), check(num_nonnulls(invoice_id,purchase_document_id,withholding_document_id)=1),
 foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),
 foreign key(tenant_id,purchase_document_id) references public.purchase_documents(tenant_id,id),
 foreign key(tenant_id,withholding_document_id) references public.withholding_documents(tenant_id,id),
 foreign key(tenant_id,original_entry_id) references public.journal_entries(tenant_id,id),
 foreign key(tenant_id,reversal_entry_id) references public.journal_entries(tenant_id,id),
 check((status='Pendiente' and reviewed_at is null and reviewed_by is null and accounting_result is null)
   or (status<>'Pendiente' and reviewed_at is not null and reviewed_by is not null and length(btrim(review_reason)) between 1 and 1000)),
 check(status<>'Aprobada' or (accounting_result is not null and (document_type='Proforma' or originals_confirmed))),
 check(accounting_result is distinct from 'Reversado' or (original_entry_id is not null and reversal_entry_id is not null))
);
create unique index fiscal_void_pending_unique on public.fiscal_void_requests(tenant_id,document_table,document_id) where status='Pendiente';
create unique index fiscal_void_approved_unique on public.fiscal_void_requests(tenant_id,document_table,document_id) where status='Aprobada';
create index fiscal_void_history on public.fiscal_void_requests(tenant_id,requested_at,id);
alter table public.fiscal_void_requests enable row level security;
create policy finance_read on public.fiscal_void_requests for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance());
revoke all on public.fiscal_void_requests from public,anon,authenticated;
grant select on public.fiscal_void_requests to authenticated;

do $$ declare target text; begin
 foreach target in array array['invoices','purchase_documents','withholding_documents'] loop
  execute format('alter table public.%I add column cancellation_request_id uuid, add column cancellation_reason text, add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id), add foreign key(tenant_id,cancellation_request_id) references public.fiscal_void_requests(tenant_id,id)',target);
 end loop;
end $$;

create function public.can_approve_fiscal_void() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and public.current_tenant_id() is not null and public.can_manage_finance() and public.is_role(array['Contabilidad'])
$$;

-- Bloqueo del documento raíz antes de solicitud/decisión, igual que pagos y notas.
create function public.lock_fiscal_document_internal(p_table text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare doc jsonb; root uuid; parent uuid; details jsonb; payment jsonb; payable jsonb;
begin
 if auth.uid() is null or not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_table='invoices' then
  select parent_invoice_id into parent from public.invoices where id=p_id and tenant_id=public.current_tenant_id();
  if parent is not null then perform 1 from public.invoices where id=parent and tenant_id=public.current_tenant_id() for update; end if;
  select to_jsonb(i) into doc from public.invoices i where id=p_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
  if doc->>'converted_invoice_id' is not null then raise exception 'La proforma convertida conserva su historial; utiliza la factura final'; end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') into details from public.invoice_items l where invoice_id=p_id and tenant_id=public.current_tenant_id();
 elsif p_table in ('purchase_documents','withholding_documents') then
  if p_table='purchase_documents' then
   select payable_id into root from public.purchase_documents where id=p_id and tenant_id=public.current_tenant_id();
  else
   select payable_id into root from public.withholding_documents where id=p_id and tenant_id=public.current_tenant_id();
  end if;
  if root is null then raise exception 'Documento no disponible' using errcode='42501'; end if;
  payable:=to_jsonb(public.lock_supplier_payable_internal(root));
  if p_table='purchase_documents' then
   select to_jsonb(d) into doc from public.purchase_documents d where id=p_id and tenant_id=public.current_tenant_id() for update;
  else
   select to_jsonb(p) into payment from public.pagos_proveedor p where withholding_document_id=p_id and tenant_id=public.current_tenant_id() for update;
   if payment is null then raise exception 'Retención sin movimiento asociado; requiere conciliación'; end if;
   select to_jsonb(d) into doc from public.withholding_documents d where id=p_id and tenant_id=public.current_tenant_id() for update;
  end if;
 else raise exception 'Tipo de documento no admitido'; end if;
 if doc is null then raise exception 'Documento no disponible' using errcode='42501'; end if;
 return jsonb_build_object('document',doc,'items',coalesce(details,doc->'items'),'payable',payable,'payment',payment);
end $$;

create function public.request_fiscal_void(p_table text,p_document_id uuid,p_request_key uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare snapshot jsonb; doc jsonb; existing public.fiscal_void_requests%rowtype; result uuid; kind text; actor_name text;
begin
 if auth.uid() is null or not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_request_key is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica un motivo de hasta 1000 caracteres y un identificador de solicitud'; end if;
 select * into existing from public.fiscal_void_requests where tenant_id=public.current_tenant_id() and request_key=p_request_key;
 if found then
  if existing.document_table is distinct from p_table or existing.document_id is distinct from p_document_id or existing.reason is distinct from btrim(p_reason) or existing.requested_by<>auth.uid() then raise exception 'La solicitud ya existe con otros datos'; end if;
  return existing.id;
 end if;
 snapshot:=public.lock_fiscal_document_internal(p_table,p_document_id); doc:=snapshot->'document';
 select * into existing from public.fiscal_void_requests where tenant_id=public.current_tenant_id() and request_key=p_request_key;
 if found then
  if existing.document_table is distinct from p_table or existing.document_id is distinct from p_document_id or existing.reason is distinct from btrim(p_reason) or existing.requested_by<>auth.uid() then raise exception 'La solicitud ya existe con otros datos'; end if;
  return existing.id;
 end if;
 if doc->>'status'='Anulada' then raise exception 'El documento ya está anulado'; end if;
 if exists(select 1 from public.fiscal_void_requests where tenant_id=public.current_tenant_id() and document_table=p_table and document_id=p_document_id and status='Pendiente') then raise exception 'Ya hay una solicitud pendiente para este documento'; end if;
 kind:=coalesce(doc->>'invoice_type',doc->>'document_type','Comprobante de Retención');
 select coalesce(nullif(nombre,''),'Usuario financiero') into actor_name from public.profiles where id=auth.uid();
 insert into public.fiscal_void_requests(tenant_id,request_key,invoice_id,purchase_document_id,withholding_document_id,document_type,document_number,cai,point_of_sale,issue_date,currency,total,document_snapshot,reason,requested_by,requested_by_name)
 values(public.current_tenant_id(),p_request_key,case when p_table='invoices' then p_document_id end,case when p_table='purchase_documents' then p_document_id end,case when p_table='withholding_documents' then p_document_id end,
 kind,coalesce(doc->>'invoice_number',doc->>'document_number','Sin número'),coalesce(doc->>'cai',doc->'fiscal_snapshot'->>'cai'),coalesce(doc->>'point_of_sale',doc->'fiscal_snapshot'->>'point_of_sale'),
 (doc->>'issue_date')::date,doc->>'currency',(doc->>'total')::numeric,snapshot,btrim(p_reason),auth.uid(),actor_name) returning id into result;
 return result;
end $$;

create function public.review_fiscal_void(p_request_id uuid,p_approve boolean,p_reason text,p_originals_confirmed boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare request public.fiscal_void_requests%rowtype; snapshot jsonb; original uuid; reversal uuid; entry_key text; result text; actor_name text;
begin
 if not public.can_approve_fiscal_void() then raise exception 'Solo Contabilidad puede aprobar o rechazar anulaciones' using errcode='42501'; end if;
 if p_approve is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de la decisión (hasta 1000 caracteres)'; end if;
 select * into request from public.fiscal_void_requests where id=p_request_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Solicitud no disponible' using errcode='42501'; end if;
 if request.status<>'Pendiente' then
  if request.status=(case when p_approve then 'Aprobada' else 'Rechazada' end) and request.review_reason=btrim(p_reason) then return request.id; end if;
  raise exception 'La solicitud ya fue resuelta y su decisión no puede cambiar';
 end if;
 if p_approve then snapshot:=public.lock_fiscal_document_internal(request.document_table,request.document_id); end if;
 select * into request from public.fiscal_void_requests where id=p_request_id and tenant_id=public.current_tenant_id() for update;
 if request.status<>'Pendiente' then
  if request.status=(case when p_approve then 'Aprobada' else 'Rechazada' end) and request.review_reason=btrim(p_reason) then return request.id; end if;
  raise exception 'La solicitud ya fue resuelta';
 end if;
 if p_approve then
  if request.document_type<>'Proforma' and p_originals_confirmed is distinct from true then raise exception 'Confirma el resguardo del original y la copia con la leyenda ANULADA'; end if;
  if snapshot is distinct from request.document_snapshot then raise exception 'El documento cambió desde la solicitud; recházala y registra una nueva para revisar los datos actuales'; end if;
  entry_key:=case request.document_table when 'invoices' then 'invoice:'||request.document_id when 'purchase_documents' then 'payable:'||(snapshot->'document'->>'payable_id') else 'supplier-payment:'||(snapshot->'payment'->>'id') end;
  select id into original from public.journal_entries where tenant_id=request.tenant_id and journal_entries.source_key=entry_key;
  if original is not null then
   reversal:=public.reverse_journal_internal(original,(now() at time zone 'America/Tegucigalpa')::date,'Anulación '||request.document_number||': '||btrim(p_reason));
  end if;
  result:=case when request.document_type='Proforma' then 'No fiscal' when original is null then 'Sin asiento previo' else 'Reversado' end;
 end if;
 select coalesce(nullif(nombre,''),'Contabilidad') into actor_name from public.profiles where id=auth.uid();
 update public.fiscal_void_requests set status=case when p_approve then 'Aprobada' else 'Rechazada' end,
 reviewed_at=now(),reviewed_by=auth.uid(),reviewed_by_name=actor_name,review_reason=btrim(p_reason),originals_confirmed=coalesce(p_originals_confirmed,false),accounting_result=result,original_entry_id=original,reversal_entry_id=reversal where id=request.id;
 if p_approve then
  if request.document_table='invoices' then update public.invoices set status='Anulada' where id=request.document_id and tenant_id=request.tenant_id;
  elsif request.document_table='purchase_documents' then perform public.cancel_supplier_payable((snapshot->'document'->>'payable_id')::uuid,left(request.reason||' / Aprobación: '||btrim(p_reason),1000));
  else perform public.reverse_supplier_payment((snapshot->'payment'->>'id')::uuid,left(request.reason||' / Aprobación: '||btrim(p_reason),1000)); end if;
 end if;
 return request.id;
end $$;

create function public.guard_fiscal_void_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'El historial de anulaciones no se elimina'; end if;
 if old.status<>'Pendiente' or not public.can_approve_fiscal_void() or new.reviewed_by is distinct from auth.uid()
 or new.status not in ('Aprobada','Rechazada') or (to_jsonb(new)-array['document_id','document_table','status','reviewed_at','reviewed_by','reviewed_by_name','review_reason','originals_confirmed','accounting_result','original_entry_id','reversal_entry_id'])
 is distinct from (to_jsonb(old)-array['document_id','document_table','status','reviewed_at','reviewed_by','reviewed_by_name','review_reason','originals_confirmed','accounting_result','original_entry_id','reversal_entry_id']) then raise exception 'La solicitud y sus decisiones son inmutables; solo Contabilidad puede resolverla' using errcode='42501'; end if;
 return new;
end $$;
create trigger fiscal_void_history_immutable before update or delete on public.fiscal_void_requests for each row execute function public.guard_fiscal_void_history();

create function public.guard_fiscal_document_void() returns trigger language plpgsql security definer set search_path=public as $$
declare request public.fiscal_void_requests%rowtype;
begin
 if tg_op='DELETE' then raise exception 'Los documentos se conservan; solicita su anulación a Contabilidad'; end if;
 if tg_op='INSERT' then
  if new.status='Anulada' then raise exception 'No se crea un documento ya anulado'; end if;
  if num_nonnulls(new.cancellation_request_id,new.cancellation_reason,new.cancelled_at,new.cancelled_by)>0 then raise exception 'La aprobación se registra mediante el flujo de Contabilidad'; end if;
  if tg_table_name='invoices' then
   if new.deleted_at is not null then raise exception 'No se crea un documento oculto'; end if;
  end if;
  return new;
 end if;
 if tg_table_name='invoices' then
  if new.deleted_at is distinct from old.deleted_at then raise exception 'El documento no se oculta ni elimina; solicita su anulación a Contabilidad'; end if;
 end if;
 if old.status='Anulada' and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'El documento anulado conserva su contenido e historial'; end if;
 if new.status='Anulada' and old.status is distinct from new.status then
  select * into request from public.fiscal_void_requests where tenant_id=new.tenant_id and document_table=tg_table_name and document_id=new.id and status='Aprobada' and reviewed_by=auth.uid();
  if not found or not public.can_approve_fiscal_void() then raise exception 'La anulación requiere una solicitud aprobada por Contabilidad' using errcode='42501'; end if;
  new.cancellation_request_id:=request.id;new.cancellation_reason:=request.reason;new.cancelled_at:=request.reviewed_at;new.cancelled_by:=request.reviewed_by;
 elsif (new.cancellation_request_id,new.cancellation_reason,new.cancelled_at,new.cancelled_by) is distinct from (old.cancellation_request_id,old.cancellation_reason,old.cancelled_at,old.cancelled_by) then raise exception 'La aprobación de anulación no se modifica';
 end if;
 return new;
end $$;
do $$ declare target text;begin
 foreach target in array array['invoices','purchase_documents','withholding_documents'] loop
  execute format('create trigger fiscal_document_void_guard before insert or update or delete on public.%I for each row execute function public.guard_fiscal_document_void()',target);
 end loop;
end $$;
revoke all on function public.lock_fiscal_document_internal(text,uuid),public.guard_fiscal_void_history(),public.guard_fiscal_document_void() from public,anon,authenticated;
revoke all on function public.can_approve_fiscal_void(),public.request_fiscal_void(text,uuid,uuid,text),public.review_fiscal_void(uuid,boolean,text,boolean) from public,anon;
grant execute on function public.can_approve_fiscal_void(),public.request_fiscal_void(text,uuid,uuid,text),public.review_fiscal_void(uuid,boolean,text,boolean) to authenticated;
notify pgrst,'reload schema';
