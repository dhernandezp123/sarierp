-- ACC-PURCHASING-01. Commercial requests/orders do not create accounting entries.
create function public.can_manage_purchase_workflow() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid()
 and p.tenant_id=public.current_tenant_id() and p.rol in ('Admin','Contabilidad') and p.status='Aprobado' and p.is_active);
$$;
revoke all on function public.can_manage_purchase_workflow() from public,anon;
grant execute on function public.can_manage_purchase_workflow() to authenticated;

create table public.purchase_workflow_documents (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 kind text not null check(kind in ('Solicitud','Orden')), document_number text not null,
 status text not null default 'Borrador' check(status in ('Borrador','Pendiente','Aprobada','Rechazada','Cancelada','Parcialmente facturada','Facturada')),
 revision integer not null default 1, source_request_id uuid references public.purchase_workflow_documents(id),
 supplier_id uuid references public.proveedores(id), office_id uuid references public.billing_offices(id),
 issue_date date not null, due_date date not null, currency text not null check(currency in ('HNL','USD')),
 exchange_rate numeric not null check(exchange_rate>0 and exchange_rate<=1000000), fiscal_mode text not null check(fiscal_mode in ('Mixta','Gravada','Exenta','Exonerada')),
 payment_condition text not null check(payment_condition in ('Contado','Credito')), payment_method text not null default '', payment_reference text not null default '',
 supplier_reference text not null default '', supplier_cai text not null default '', internal_notes text not null default '', commercial_notes text not null default '',
 issuer_snapshot jsonb, supplier_snapshot jsonb not null default '{}', items jsonb not null default '[]',
 subtotal numeric(20,2) not null default 0, tax_amount numeric(20,2) not null default 0, total numeric(20,2) not null default 0,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id), approved_at timestamptz, updated_at timestamptz not null default now(),
 unique(tenant_id,document_number), unique(tenant_id,id), unique(source_request_id), check(due_date>=issue_date),
 check((kind='Solicitud' and source_request_id is null) or kind='Orden')
);
create index purchase_workflow_list on public.purchase_workflow_documents(tenant_id,kind,issue_date,id);
create table public.purchase_workflow_events (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 document_id uuid not null references public.purchase_workflow_documents(id), request_id uuid not null,
 action text not null, reason text not null default '', actor_id uuid not null references auth.users(id),
 revision integer not null, payload_hash text not null, result_id uuid not null, created_at timestamptz not null default now(), unique(tenant_id,request_id)
);
create table public.purchase_order_allocations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 order_id uuid not null references public.purchase_workflow_documents(id), item_id uuid not null,
 purchase_document_id uuid not null references public.purchase_documents(id), quantity numeric not null check(quantity>0), discount_amount numeric(20,2) not null,
 is_active boolean not null default true,
 unique(order_id,item_id,purchase_document_id)
);
create index purchase_order_allocations_order on public.purchase_order_allocations(tenant_id,order_id);
alter table public.purchase_workflow_documents enable row level security;
alter table public.purchase_workflow_events enable row level security;
alter table public.purchase_order_allocations enable row level security;
create policy purchase_workflow_read on public.purchase_workflow_documents for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_purchase_workflow());
create policy purchase_workflow_events_read on public.purchase_workflow_events for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_purchase_workflow());
create policy purchase_order_allocations_read on public.purchase_order_allocations for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_purchase_workflow());
revoke all on public.purchase_workflow_documents,public.purchase_workflow_events,public.purchase_order_allocations from public,anon,authenticated;
grant select on public.purchase_workflow_documents,public.purchase_workflow_events,public.purchase_order_allocations to authenticated;

-- All writes, transitions, conversion and invoice allocation share one lock per document.
create function public.manage_purchase_workflow(p_request_id uuid,p_action text,p_id uuid,p_revision integer,
 p_document jsonb default '{}',p_items jsonb default '[]',p_reason text default '') returns uuid
language plpgsql security definer set search_path=public as $$
<<wf>>
declare
 tenant uuid:=public.current_tenant_id(); d public.purchase_workflow_documents%rowtype;
 supplier public.proveedores%rowtype; previous public.purchase_workflow_events%rowtype;
 result_id uuid; doc_id uuid:=coalesce(p_id,gen_random_uuid()); signature text;
 item jsonb; line jsonb; normalized jsonb:='[]'; ids uuid[]:='{}'; item_id uuid; account uuid; assigned uuid;
 qty numeric; price numeric; discount numeric; amount numeric; tax numeric; tax_rate numeric; treatment text; variant text;
 subtotal numeric:=0; taxes numeric:=0; mode text; kind text; office uuid; supplier_id uuid; issuer jsonb; supplier_snapshot jsonb;
 issue date; due date; currency text; rate numeric; used numeric; used_discount numeric; remaining numeric;
 n bigint; number text; invoice_items jsonb:='[]'; allocations jsonb:='[]'; all_billed boolean;
begin
 if not public.can_manage_purchase_workflow() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null or p_action not in ('save','submit','approve','reject','cancel','order','invoice') or p_action is null then raise exception 'Accion invalida';end if;
 if length(coalesce(p_reason,''))>1000 then raise exception 'Motivo demasiado largo';end if;
 signature:=md5(jsonb_build_object('action',p_action,'id',p_id,'revision',p_revision,'document',p_document,'items',p_items,'reason',p_reason)::text);
 perform pg_advisory_xact_lock(hashtextextended('purchase-workflow-request:'||tenant||':'||p_request_id,0));
 select * into previous from public.purchase_workflow_events where tenant_id=tenant and request_id=p_request_id;
 if found then
  if previous.payload_hash<>signature then raise exception 'El identificador ya se utilizo con otros datos';end if;
  return previous.result_id;
 end if;
 if p_id is not null then
  select * into d from public.purchase_workflow_documents where id=p_id and tenant_id=tenant for update;
  if not found then raise exception 'Documento no disponible' using errcode='42501';end if;
  if d.revision is distinct from p_revision then raise exception 'El documento cambio; recarga antes de continuar';end if;
 elsif p_action<>'save' then raise exception 'Selecciona un documento';
 end if;

 if p_action='save' then
  if p_id is not null and (d.status not in ('Borrador','Rechazada','Aprobada','Pendiente') or exists(select 1 from public.purchase_order_allocations where order_id=d.id)
   or exists(select 1 from public.purchase_workflow_documents where source_request_id=d.id)) then raise exception 'Este documento ya no admite edicion';end if;
  kind:=coalesce(d.kind,p_document->>'kind');mode:=p_document->>'fiscal_mode';
  issue:=(p_document->>'issue_date')::date;due:=(p_document->>'due_date')::date;currency:=p_document->>'currency';
  rate:=case when currency='HNL' then 1 else (p_document->>'exchange_rate')::numeric end;
  office:=nullif(p_document->>'office_id','')::uuid;supplier_id:=nullif(p_document->>'supplier_id','')::uuid;
  if kind is null or kind not in ('Solicitud','Orden') or mode is null or mode not in ('Mixta','Gravada','Exenta','Exonerada')
   or issue is null or due is null or due<issue or currency is null or currency not in ('HNL','USD') or rate is null or rate::text in ('NaN','Infinity','-Infinity') or rate<=0 or rate>1000000
   or coalesce(p_document->>'payment_condition','') not in ('Contado','Credito')
   or coalesce(p_document->>'payment_method','') not in ('','Transferencia','Cheque','Efectivo','Otro') then raise exception 'Revisa fechas, moneda y condiciones';end if;
  if office is null then raise exception 'Selecciona una oficina';end if;
  issuer:=public.fiscal_office_snapshot(office)||(select jsonb_build_object('logo_url',logo_url) from public.company_settings where tenant_id=tenant);
  supplier_snapshot:='{}';
  if supplier_id is not null then
   select * into supplier from public.proveedores where id=supplier_id and tenant_id=tenant and is_active;
   if not found then raise exception 'Proveedor no disponible';end if;
   supplier_snapshot:=jsonb_build_object('name',supplier.nombre,'rtn',supplier.rtn,'email',supplier.email,'phone',supplier.telefono,'address',left(coalesce(p_document->>'supplier_address',''),500));
  end if;
  if kind='Orden' and supplier_id is null then raise exception 'La orden requiere proveedor';end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Ingresa entre 1 y 200 lineas';end if;
  for item in select value from jsonb_array_elements(p_items) loop
   item_id:=(item->>'id')::uuid;qty:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
   discount:=coalesce((item->>'discount_amount')::numeric,0);tax_rate:=coalesce((item->>'tax_rate')::numeric,0);
   treatment:=case when mode in ('Exenta','Exonerada') then mode when mode='Gravada' then 'Gravada' else item->>'tax_treatment' end;
   if treatment in ('Exenta','Exonerada') then tax_rate:=0;end if;
   if item_id is null or item_id=any(ids) or nullif(btrim(item->>'description'),'') is null or length(item->>'description')>500
    or qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>1000000
    or price is null or price::text in ('NaN','Infinity','-Infinity') or price<0 or price>100000000
    or discount::text in ('NaN','Infinity','-Infinity') or discount<0 or discount<>round(discount,2) or discount>round(qty*price,2)
    or treatment is null or treatment not in ('Gravada','Exenta','Exonerada') or tax_rate not in (0,15,18)
    or (treatment='Gravada' and tax_rate=0) then raise exception 'Linea de compra invalida';end if;
   ids:=array_append(ids,item_id);account:=nullif(item->>'account_id','')::uuid;
   variant:=case when treatment='Exonerada' then 'Exonerada' when tax_rate>0 then 'I' else 'E' end;
   if (nullif(item->>'service_catalog_kind','') is null)<>(nullif(item->>'service_catalog_code','') is null) then raise exception 'Referencia incompleta de servicio';end if;
   if nullif(item->>'service_catalog_kind','') is not null then
    assigned:=public.resolve_service_account(item->>'service_catalog_kind',item->>'service_catalog_code',variant,'expense');
    if assigned is not null then
     if account is not null and account<>assigned then raise exception 'La cuenta debe coincidir con el servicio';end if;account:=assigned;
    end if;
   end if;
   if account is not null and not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=tenant and a.active and a.postable and a.kind in ('Activo','Costo','Gasto')) then raise exception 'Cuenta de compra no disponible';end if;
   amount:=round(qty*price,2)-discount;tax:=round(amount*tax_rate/100,2);subtotal:=subtotal+amount;taxes:=taxes+tax;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('id',item_id,'description',btrim(item->>'description'),'quantity',qty,'unit_price',price,'discount_amount',discount,'tax_rate',tax_rate,'tax_treatment',treatment,'amount',amount,'tax',tax,'account_id',account,'service_catalog_kind',nullif(item->>'service_catalog_kind',''),'service_catalog_code',nullif(item->>'service_catalog_code','')));
  end loop;
  if p_id is null then
   perform pg_advisory_xact_lock(hashtextextended('purchase-workflow-number:'||tenant,0));
   select count(*)+1 into n from public.purchase_workflow_documents where tenant_id=tenant;
   number:=(case when kind='Solicitud' then 'SC-' else 'OC-' end)||lpad(n::text,6,'0');
   insert into public.purchase_workflow_documents(id,tenant_id,kind,document_number,issue_date,due_date,currency,exchange_rate,fiscal_mode,payment_condition,created_by)
   values(doc_id,tenant,kind,number,issue,due,currency,rate,mode,p_document->>'payment_condition',auth.uid());
  end if;
  update public.purchase_workflow_documents set supplier_id=wf.supplier_id,office_id=office,
   issue_date=issue,due_date=due,currency=wf.currency,exchange_rate=rate,fiscal_mode=mode,
   payment_condition=p_document->>'payment_condition',payment_method=coalesce(p_document->>'payment_method',''),
   payment_reference=left(coalesce(p_document->>'payment_reference',''),200),supplier_reference=left(coalesce(p_document->>'supplier_reference',''),200),
   supplier_cai=left(coalesce(p_document->>'supplier_cai',''),100),internal_notes=left(coalesce(p_document->>'internal_notes',''),2000),
   commercial_notes=left(coalesce(p_document->>'commercial_notes',''),2000),issuer_snapshot=issuer,supplier_snapshot=wf.supplier_snapshot,
   items=normalized,subtotal=wf.subtotal,tax_amount=taxes,total=wf.subtotal+taxes,
   status='Borrador',approved_at=null,approved_by=null,revision=case when p_id is null then 1 else revision+1 end,updated_at=now() where id=doc_id;
  result_id:=doc_id;
 elsif p_action='order' then
  if d.kind<>'Solicitud' or d.status<>'Aprobada' or d.supplier_id is null then raise exception 'Aprueba la solicitud e indica proveedor antes de generar orden';end if;
  if exists(select 1 from public.purchase_workflow_documents where source_request_id=d.id) then raise exception 'La solicitud ya tiene una orden';end if;
  perform pg_advisory_xact_lock(hashtextextended('purchase-workflow-number:'||tenant,0));
  select count(*)+1 into n from public.purchase_workflow_documents where tenant_id=tenant;
  result_id:=gen_random_uuid();
  insert into public.purchase_workflow_documents(id,tenant_id,kind,document_number,source_request_id,supplier_id,office_id,issue_date,due_date,currency,exchange_rate,fiscal_mode,payment_condition,payment_method,payment_reference,supplier_reference,supplier_cai,internal_notes,commercial_notes,issuer_snapshot,supplier_snapshot,items,subtotal,tax_amount,total,created_by)
  values(result_id,tenant,'Orden','OC-'||lpad(n::text,6,'0'),d.id,d.supplier_id,d.office_id,d.issue_date,d.due_date,d.currency,d.exchange_rate,d.fiscal_mode,d.payment_condition,d.payment_method,d.payment_reference,d.supplier_reference,d.supplier_cai,d.internal_notes,d.commercial_notes,d.issuer_snapshot,d.supplier_snapshot,d.items,d.subtotal,d.tax_amount,d.total,auth.uid());
  update public.purchase_workflow_documents set revision=revision+1,updated_at=now() where id=d.id;
 elsif p_action='invoice' then
  if d.kind<>'Orden' or d.status not in ('Aprobada','Parcialmente facturada') then raise exception 'La orden no admite facturas';end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Selecciona cantidades a facturar';end if;
  for item in select value from jsonb_array_elements(p_items) loop
   item_id:=(item->>'id')::uuid;qty:=(item->>'quantity')::numeric;
   if item_id is null or item_id=any(ids) or qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 then raise exception 'Cantidad de factura invalida';end if;
   ids:=array_append(ids,item_id);select value into line from jsonb_array_elements(d.items) where value->>'id'=item_id::text;
   if not found then raise exception 'Linea ajena a la orden';end if;
   select coalesce(sum(quantity),0),coalesce(sum(discount_amount),0) into used,used_discount from public.purchase_order_allocations where order_id=d.id and purchase_order_allocations.item_id=wf.item_id and is_active;
   remaining:=(line->>'quantity')::numeric-used;
   if qty>remaining then raise exception 'La cantidad supera el remanente de la orden';end if;
   discount:=case when qty=remaining then (line->>'discount_amount')::numeric-used_discount else least(round((line->>'discount_amount')::numeric*qty/(line->>'quantity')::numeric,2),(line->>'discount_amount')::numeric-used_discount) end;
   invoice_items:=invoice_items||jsonb_build_array(line||jsonb_build_object('quantity',qty,'discount_amount',discount,'tax_credit',true,
    'service_tax_variant',case when line->>'tax_treatment'='Exonerada' then 'Exonerada' when (line->>'tax_rate')::numeric>0 then 'I' else 'E' end));
   allocations:=allocations||jsonb_build_array(jsonb_build_object('id',item_id,'quantity',qty,'discount_amount',discount));
  end loop;
  -- A request used outside this workflow must not silently reuse an unrelated invoice.
  perform pg_advisory_xact_lock(hashtextextended('purchase:'||tenant||':'||p_request_id,0));
  if exists(select 1 from public.purchase_documents where tenant_id=tenant and request_id=p_request_id) then raise exception 'Identificador ya utilizado por otra compra';end if;
  result_id:=public.create_purchase_document(p_request_id,p_document||jsonb_build_object('document_type','Factura de proveedor','supplier_id',d.supplier_id,'office_id',d.office_id,'currency',d.currency,'exchange_rate',d.exchange_rate),invoice_items);
  for item in select value from jsonb_array_elements(allocations) loop
   insert into public.purchase_order_allocations(tenant_id,order_id,item_id,purchase_document_id,quantity,discount_amount)
   values(tenant,d.id,(item->>'id')::uuid,result_id,(item->>'quantity')::numeric,(item->>'discount_amount')::numeric);
  end loop;
  select not exists(select 1 from jsonb_array_elements(d.items) l where (l->>'quantity')::numeric>(select coalesce(sum(a.quantity),0) from public.purchase_order_allocations a where a.order_id=d.id and a.item_id=(l->>'id')::uuid and a.is_active)) into all_billed;
  update public.purchase_workflow_documents set status=case when all_billed then 'Facturada' else 'Parcialmente facturada' end,revision=revision+1,updated_at=now() where id=d.id;
 else
  if p_action='submit' and d.status not in ('Borrador','Rechazada') then raise exception 'Transicion invalida';end if;
  if p_action in ('approve','reject') and d.status<>'Pendiente' then raise exception 'Envia el documento a aprobacion primero';end if;
  if p_action='cancel' and (d.status in ('Cancelada','Facturada') or exists(select 1 from public.purchase_workflow_documents where source_request_id=d.id)) then raise exception 'No se puede cancelar este documento';end if;
  if p_action in ('reject','cancel') and nullif(btrim(p_reason),'') is null then raise exception 'Indica un motivo';end if;
  if p_action in ('submit','approve') and d.total<=0 then raise exception 'El documento debe tener importe positivo';end if;
  if p_action='approve' then
   -- Revalidate canonical resources and freeze the supplier/office at approval.
   issuer:=public.fiscal_office_snapshot(d.office_id)||(select jsonb_build_object('logo_url',logo_url) from public.company_settings where tenant_id=tenant);
   supplier_snapshot:=d.supplier_snapshot;
   if d.supplier_id is not null then
    select * into supplier from public.proveedores where id=d.supplier_id and tenant_id=tenant and is_active;
    if not found then raise exception 'Proveedor no disponible';end if;
    supplier_snapshot:=d.supplier_snapshot||jsonb_build_object('name',supplier.nombre,'rtn',supplier.rtn,'email',supplier.email,'phone',supplier.telefono);
   end if;
   update public.purchase_workflow_documents set issuer_snapshot=issuer,supplier_snapshot=wf.supplier_snapshot where id=d.id;
  end if;
  update public.purchase_workflow_documents set status=case p_action when 'submit' then 'Pendiente' when 'approve' then 'Aprobada' when 'reject' then 'Rechazada' else 'Cancelada' end,
   approved_by=case when p_action='approve' then auth.uid() else approved_by end,approved_at=case when p_action='approve' then now() else approved_at end,
   revision=revision+1,updated_at=now() where id=d.id;
  result_id:=d.id;
 end if;
 insert into public.purchase_workflow_events(tenant_id,document_id,request_id,action,reason,actor_id,revision,payload_hash,result_id)
 select tenant,case when p_action='order' then d.id else doc_id end,p_request_id,p_action,coalesce(p_reason,''),auth.uid(),revision,signature,result_id from public.purchase_workflow_documents where id=case when p_action='order' then d.id else doc_id end;
 return result_id;
end $$;
revoke all on function public.manage_purchase_workflow(uuid,text,uuid,integer,jsonb,jsonb,text) from public,anon;
grant execute on function public.manage_purchase_workflow(uuid,text,uuid,integer,jsonb,jsonb,text) to authenticated;

-- Fiscal cancellation restores remaining quantities, while preserving the allocation history.
create function public.sync_purchase_order_void() returns trigger language plpgsql security definer set search_path=public as $$
declare d public.purchase_workflow_documents%rowtype; next_status text;
begin
 if new.status='Anulada' and old.status is distinct from new.status then
  for d in select * from public.purchase_workflow_documents where id in(select order_id from public.purchase_order_allocations where purchase_document_id=new.id and is_active) order by id for update loop
   update public.purchase_order_allocations set is_active=false where order_id=d.id and purchase_document_id=new.id;
   next_status:=case when d.status='Cancelada' then 'Cancelada' when exists(select 1 from public.purchase_order_allocations where order_id=d.id and is_active) then 'Parcialmente facturada' else 'Aprobada' end;
   update public.purchase_workflow_documents set status=next_status,revision=revision+1,updated_at=now() where id=d.id;
   insert into public.purchase_workflow_events(tenant_id,document_id,request_id,action,reason,actor_id,revision,payload_hash,result_id)
   values(d.tenant_id,d.id,gen_random_uuid(),'invoice_voided','Factura vinculada anulada mediante el flujo fiscal',coalesce(auth.uid(),new.created_by),d.revision+1,md5(new.id::text),new.id);
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.sync_purchase_order_void() from public,anon,authenticated;
create trigger sync_purchase_order_void after update of status on public.purchase_documents for each row execute function public.sync_purchase_order_void();
notify pgrst,'reload schema';
