-- ACC-SERVICE-01: tenant-owned service/account assignments; no real account data.
create table public.service_accounting_profiles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 source_kind text not null check(source_kind in ('service','product')), source_code text not null check(length(source_code) between 1 and 200),
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
 unique(tenant_id,id), unique(tenant_id,source_kind,source_code)
);
create table public.service_accounting_variants (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 profile_id uuid not null, tax_variant text not null check(tax_variant in ('I','E','Exonerada')),
 income_applicable boolean not null default true, expense_applicable boolean not null default true,
 income_account_id uuid, expense_account_id uuid,
 foreign key(tenant_id,profile_id) references public.service_accounting_profiles(tenant_id,id) on delete cascade,
 foreign key(tenant_id,income_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,expense_account_id) references public.accounting_accounts(tenant_id,id),
 unique(tenant_id,profile_id,tax_variant), check(income_applicable or income_account_id is null), check(expense_applicable or expense_account_id is null)
);
alter table public.service_accounting_profiles enable row level security;
alter table public.service_accounting_variants enable row level security;
create policy service_profiles_read on public.service_accounting_profiles for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance());
create policy service_variants_read on public.service_accounting_variants for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance());
revoke all on public.service_accounting_profiles,public.service_accounting_variants from public,anon,authenticated;
grant select on public.service_accounting_profiles,public.service_accounting_variants to authenticated;
grant all on public.service_accounting_profiles,public.service_accounting_variants to service_role;

create function public.save_service_accounting(p_source_kind text,p_source_code text,p_revision integer,p_variants jsonb,p_reason text) returns integer
language plpgsql security definer set search_path=public as $$
declare profile public.service_accounting_profiles; variant jsonb; account uuid; side text; before_values jsonb;
begin
 if auth.uid() is null or not public.is_invoice_master() then raise exception 'Solo el usuario máster puede configurar las cuentas de servicios' using errcode='42501';end if;
 if p_source_kind is null or p_source_kind not in ('service','product') or nullif(btrim(p_source_code),'') is null or length(p_source_code)>200
  or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el concepto y motivo del cambio';end if;
 if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants)>3 then raise exception 'Variantes inválidas';end if;
 if p_source_kind='service' then
  perform 1 from public.client_rate_catalog where tenant_id=public.current_tenant_id() and code=p_source_code and active for share;
 else
  perform 1 from public.service_products where tenant_id=public.current_tenant_id() and value=p_source_code and active for share;
 end if;
 if not found then raise exception 'Concepto no disponible en esta empresa';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 perform pg_advisory_xact_lock(hashtextextended('service-accounts:'||public.current_tenant_id()::text||':'||p_source_kind||':'||p_source_code,0));
 select * into profile from public.service_accounting_profiles where tenant_id=public.current_tenant_id() and source_kind=p_source_kind and source_code=p_source_code for update;
 if p_revision is distinct from coalesce(profile.revision,0) then raise exception 'La asignación cambió; recarga antes de guardar';end if;
 select jsonb_agg(to_jsonb(v) order by tax_variant) into before_values from public.service_accounting_variants v where profile_id=profile.id;
 if (select count(*) from jsonb_array_elements(p_variants))<>(select count(distinct value->>'tax_variant') from jsonb_array_elements(p_variants)) then raise exception 'No repitas una variante fiscal';end if;
 for variant in select value from jsonb_array_elements(p_variants) loop
  if variant->>'tax_variant' is null or variant->>'tax_variant' not in ('I','E','Exonerada') or jsonb_typeof(variant->'income_applicable') is distinct from 'boolean'
   or jsonb_typeof(variant->'expense_applicable') is distinct from 'boolean' then raise exception 'Revisa la variante y sus cuentas aplicables';end if;
  foreach side in array array['income','expense'] loop
   account:=nullif(variant->>(side||'_account_id'),'')::uuid;
   if not (variant->>(side||'_applicable'))::boolean and account is not null then raise exception 'Una cuenta no aplicable debe quedar vacía';end if;
   if account is not null and not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id()
    and a.active and a.postable and a.account_level='Auxiliar' and ((side='income' and a.kind='Ingreso') or (side='expense' and a.kind in ('Costo','Gasto')))) then raise exception 'Selecciona una auxiliar activa de la naturaleza y empresa correspondientes';end if;
  end loop;
 end loop;
 if profile.id is null then
  insert into public.service_accounting_profiles(source_kind,source_code,updated_by) values(p_source_kind,p_source_code,auth.uid()) returning * into profile;
 else
  update public.service_accounting_profiles set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=profile.id returning * into profile;
 end if;
 delete from public.service_accounting_variants where profile_id=profile.id and tenant_id=profile.tenant_id
  and tax_variant not in(select value->>'tax_variant' from jsonb_array_elements(p_variants));
 insert into public.service_accounting_variants(tenant_id,profile_id,tax_variant,income_applicable,expense_applicable,income_account_id,expense_account_id)
 select profile.tenant_id,profile.id,v->>'tax_variant',(v->>'income_applicable')::boolean,(v->>'expense_applicable')::boolean,
  nullif(v->>'income_account_id','')::uuid,nullif(v->>'expense_account_id','')::uuid from jsonb_array_elements(p_variants)v where true
 on conflict(tenant_id,profile_id,tax_variant) do update set income_applicable=excluded.income_applicable,expense_applicable=excluded.expense_applicable,
  income_account_id=excluded.income_account_id,expense_account_id=excluded.expense_account_id;
 insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values(profile.tenant_id,auth.uid(),'Contabilidad','Asignación de cuentas por servicio','service_accounting_profiles',profile.id,btrim(p_reason),
  jsonb_build_object('source_kind',p_source_kind,'source_code',p_source_code,'revision',profile.revision,'before',before_values,'after',p_variants));
 return profile.revision;
end $$;
revoke all on function public.save_service_accounting(text,text,integer,jsonb,text) from public,anon;
grant execute on function public.save_service_accounting(text,text,integer,jsonb,text) to authenticated;

create function public.resolve_service_account(p_kind text,p_code text,p_variant text,p_side text) returns uuid
language plpgsql security definer set search_path=public as $$
declare account uuid; applicable boolean; source_active boolean;
begin
 if p_kind is null or p_code is null then return null;end if;
 if p_kind not in ('service','product') or p_variant not in ('I','E','Exonerada') or p_side not in ('income','expense') then raise exception 'Referencia de servicio inválida';end if;
 if p_kind='service' then select active into source_active from public.client_rate_catalog where tenant_id=public.current_tenant_id() and code=p_code;
 else select active into source_active from public.service_products where tenant_id=public.current_tenant_id() and value=p_code;end if;
 if not found then raise exception 'Servicio no disponible en esta empresa';end if;
 -- Retired concepts retain their historical identity; only a valid explicit
 -- account can be copied to a replacement/credit document, never a new default.
 if not source_active then return null;end if;
 select case when p_side='income' then v.income_account_id else v.expense_account_id end,
  case when p_side='income' then v.income_applicable else v.expense_applicable end into account,applicable
 from public.service_accounting_profiles p join public.service_accounting_variants v on v.profile_id=p.id and v.tenant_id=p.tenant_id
 where p.tenant_id=public.current_tenant_id() and p.source_kind=p_kind and p.source_code=p_code and v.tax_variant=p_variant;
 if not found or not applicable or account is null then return null;end if;
 if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.active and a.postable and a.account_level='Auxiliar'
  and ((p_side='income' and a.kind='Ingreso') or (p_side='expense' and a.kind in ('Costo','Gasto')))) then return null;end if;
 return account;
end $$;
revoke all on function public.resolve_service_account(text,text,text,text) from public,anon,authenticated;

alter table public.invoice_items add column service_catalog_kind text check(service_catalog_kind in ('service','product')),
 add column service_catalog_code text,
 add constraint invoice_item_service_reference check((service_catalog_kind is null)=(service_catalog_code is null));

create function public.pricing_service_reference(p_item uuid,p_quotation uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_code text; v_product text; v_item_type text; v_raw_code text;
begin
 select case when pi.rate_code like 'origin_charge:%' then split_part(pi.rate_code,':',2) else pi.rate_code end,q.service_product,pi.item_type,pi.rate_code
 into v_code,v_product,v_item_type,v_raw_code from public.pricing_items pi join public.quotations q on q.id=pi.quotation_id and q.tenant_id=pi.tenant_id
 where pi.id=p_item and pi.tenant_id=public.current_tenant_id() and pi.quotation_id=p_quotation and pi.deleted_at is null;
 if not found then raise exception 'La línea comercial no corresponde a esta cotización';end if;
 if exists(select 1 from public.client_rate_catalog c where c.tenant_id=public.current_tenant_id() and c.code=v_code) then
  return jsonb_build_object('service_catalog_kind','service','service_catalog_code',v_code);
 elsif v_item_type='freight' and coalesce(v_raw_code,'') not like 'origin_charge:%' and coalesce(v_raw_code,'') not like 'destination_charge:%'
  and exists(select 1 from public.service_products p where p.tenant_id=public.current_tenant_id() and p.value=v_product) then
  return jsonb_build_object('service_catalog_kind','product','service_catalog_code',v_product);
 end if;
 return '{}';
end $$;
revoke all on function public.pricing_service_reference(uuid,uuid) from public,anon,authenticated;

create or replace function public.create_invoice_with_items_trusted(p_invoice jsonb,p_items jsonb) returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare item jsonb; items jsonb:='[]'; ref jsonb; account uuid; variant text; treatment text; result record; position integer:=0;
 mode text:=coalesce(p_invoice->>'fiscal_mode',case when (p_invoice->>'es_exonerado')::boolean then 'Exonerada' else 'Mixta' end);
begin
 if auth.uid() is null or not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'Sin permiso para facturar' using errcode='42501';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Agrega entre 1 y 500 líneas';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  ref:=jsonb_build_object('service_catalog_kind',nullif(item->>'service_catalog_kind',''),'service_catalog_code',nullif(item->>'service_catalog_code',''));
  if nullif(item->>'source_pricing_item_id','') is not null then
   ref:=public.pricing_service_reference((item->>'source_pricing_item_id')::uuid,nullif(p_invoice->>'quotation_id','')::uuid);
  end if;
  if (ref->>'service_catalog_kind' is null)<>(ref->>'service_catalog_code' is null) then raise exception 'Referencia incompleta de servicio';end if;
  treatment:=case when mode in ('Exenta','Exonerada') then mode else coalesce(item->>'tax_treatment',case when coalesce((item->>'isv_rate')::numeric,0)>0 then 'Gravada' else 'Exenta' end) end;
  variant:=case treatment when 'Gravada' then 'I' when 'Exonerada' then 'Exonerada' else 'E' end;
  -- Resolve even with an explicit override to validate source ownership. Invalid
  -- defaults are not used; a valid, explicit per-document account is permitted.
  account:=public.resolve_service_account(ref->>'service_catalog_kind',ref->>'service_catalog_code',variant,'income');
  account:=coalesce(nullif(item->>'income_account_id','')::uuid,nullif(p_invoice->'line_accounts'->>(item->>'source_pricing_item_id'),'')::uuid,account);
  if account is not null and not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id()
   and a.kind='Ingreso' and a.active and a.postable) then raise exception 'Cuenta de ingreso inválida';end if;
  items:=items||jsonb_build_array(item||ref||jsonb_build_object('income_account_id',account));
 end loop;
 select * into result from public.create_invoice_fiscal_base(p_invoice,items);
 for item in select value from jsonb_array_elements(items) loop
  update public.invoice_items set income_account_id=nullif(item->>'income_account_id','')::uuid,service_catalog_kind=item->>'service_catalog_kind',service_catalog_code=item->>'service_catalog_code'
   where tenant_id=public.current_tenant_id() and public.invoice_items.invoice_id=result.invoice_id and sort_order=position;
  position:=position+1;
 end loop;
 return query select result.invoice_id::uuid,result.invoice_number::text;
end $$;
revoke all on function public.create_invoice_with_items_trusted(jsonb,jsonb) from public,anon,authenticated;

-- Current purchase/proforma bodies are preserved below with source snapshots.

create or replace function public.create_purchase_document(p_request_id uuid,p_document jsonb,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare supplier public.proveedores%rowtype;document_id uuid;payable uuid;office uuid:=nullif(p_document->>'office_id','')::uuid;
 kind text:=p_document->>'document_type';currency text:=p_document->>'currency';rate numeric;issue date:=(p_document->>'issue_date')::date;due date;
 item jsonb;items jsonb:='[]';quantity numeric;price numeric;tax_rate numeric;amount numeric;tax numeric;subtotal numeric:=0;total_tax numeric:=0;
 service_account uuid; variant text; account uuid;issuer jsonb;fiscal jsonb;number text;discount numeric;discounts numeric:=0;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Falta identificador de solicitud';end if;
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||public.current_tenant_id()::text||':'||p_request_id::text,0));
 select id into document_id from public.purchase_documents where tenant_id=public.current_tenant_id() and request_id=p_request_id;if found then return document_id;end if;
 select * into supplier from public.proveedores where id=(p_document->>'supplier_id')::uuid and tenant_id=public.current_tenant_id() and is_active;
 if not found then raise exception 'Proveedor no disponible';end if;
 if kind is null or kind not in ('Factura de proveedor','Boleta de Compra') or currency is null or currency not in ('HNL','USD') or issue is null or issue>current_date then raise exception 'Revisa tipo, moneda y fecha de compra';end if;
 rate:=case when currency='HNL' then 1 else (p_document->>'exchange_rate')::numeric end;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Indica tipo de cambio válido';end if;
 due:=coalesce(nullif(p_document->>'due_date','')::date,issue+supplier.terminos_pago);if due<issue then raise exception 'El vencimiento no puede ser anterior a la compra';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Ingresa entre 1 y 200 líneas';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  quantity:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;tax_rate:=coalesce((item->>'tax_rate')::numeric,0);account:=nullif(item->>'account_id','')::uuid;
  if (nullif(item->>'service_catalog_kind','') is null)<>(nullif(item->>'service_catalog_code','') is null) then raise exception 'Referencia incompleta de servicio';end if;
  variant:=coalesce(nullif(item->>'service_tax_variant',''),case when tax_rate>0 then 'I' else 'E' end);
  if variant not in ('I','E','Exonerada') or (variant='I')<>(tax_rate>0) then raise exception 'Variante fiscal de compra inconsistente';end if;
  service_account:=public.resolve_service_account(nullif(item->>'service_catalog_kind',''),nullif(item->>'service_catalog_code',''),variant,'expense');
  account:=coalesce(account,service_account);
  if nullif(btrim(item->>'description'),'') is null or length(item->>'description')>500 or quantity is null or quantity<=0 or quantity>1000000 or price is null or price<0 or price>100000000 or tax_rate not in (0,15,18) then raise exception 'Línea de compra inválida';end if;
  if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.kind in ('Activo','Costo','Gasto') and a.active and a.postable) then raise exception 'Selecciona una cuenta de activo, costo o gasto para cada línea';end if;
  if kind='Boleta de Compra' and coalesce((item->>'tax_credit')::boolean,false) then raise exception 'La boleta de compra no respalda crédito fiscal de ISV';end if;
  discount:=coalesce((item->>'discount_amount')::numeric,0);
  if discount::text in ('NaN','Infinity','-Infinity') or discount<0 or discount<>round(discount,2) or discount>round(quantity*price,2) then raise exception 'Descuento de compra inválido';end if;
  discounts:=discounts+discount;amount:=round(quantity*price,2)-discount;tax:=round(amount*tax_rate/100,2);subtotal:=subtotal+amount;total_tax:=total_tax+tax;
  items:=items||jsonb_build_array(jsonb_build_object('description',btrim(item->>'description'),'quantity',quantity,'unit_price',price,'amount',amount,'discount_amount',discount,'tax_rate',tax_rate,'tax',tax,'tax_credit',coalesce((item->>'tax_credit')::boolean,false),'account_id',account,'service_catalog_kind',nullif(item->>'service_catalog_kind',''),'service_catalog_code',nullif(item->>'service_catalog_code',''),'service_tax_variant',variant));
 end loop;
 if subtotal+total_tax<=0 then raise exception 'La compra debe tener importe positivo';end if;
 if office is not null then issuer:=public.fiscal_office_snapshot(office);end if;
 if kind='Boleta de Compra' then
  if nullif(btrim(coalesce(nullif(p_document->>'supplier_identity',''),supplier.rtn)),'') is null or nullif(btrim(p_document->>'supplier_address'),'') is null or nullif(btrim(coalesce(nullif(p_document->>'supplier_phone',''),supplier.telefono)),'') is null then raise exception 'Completa RTN o identidad, domicilio y teléfono del proveedor de la boleta';end if;
  issuer:=public.fiscal_office_snapshot(office);fiscal:=public.allocate_additional_fiscal_number(office,kind,issue);number:=fiscal->>'number';
 else
  number:=btrim(p_document->>'document_number');if nullif(number,'') is null or length(number)>120 then raise exception 'Indica el número de factura del proveedor';end if;
  if exists(select 1 from public.purchase_documents where tenant_id=public.current_tenant_id() and supplier_id=supplier.id and document_number=number and status='Emitida') then raise exception 'Ya existe esta factura del proveedor';end if;
 end if;
 insert into public.purchase_documents(tenant_id,request_id,document_type,document_number,supplier_id,office_id,issue_date,due_date,currency,exchange_rate,subtotal,tax_amount,total,discount_amount,items,issuer_snapshot,supplier_snapshot,fiscal_snapshot,source_cai,notes,created_by)
 values(public.current_tenant_id(),p_request_id,kind,number,supplier.id,office,issue,due,currency,rate,subtotal,total_tax,subtotal+total_tax,discounts,items,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',case when kind='Boleta de Compra' then coalesce(nullif(p_document->>'supplier_identity',''),supplier.rtn) else supplier.rtn end,'address',left(coalesce(p_document->>'supplier_address',''),500),'phone',coalesce(nullif(p_document->>'supplier_phone',''),supplier.telefono),'email',supplier.email),fiscal,left(coalesce(p_document->>'source_cai',''),100),left(coalesce(p_document->>'notes',''),2000),auth.uid()) returning id into document_id;
 insert into public.cuentas_pagar(tenant_id,proveedor_id,descripcion,numero_factura_proveedor,monto,moneda,tipo_cambio,fecha_factura,fecha_vencimiento,created_by,purchase_document_id)
 values(public.current_tenant_id(),supplier.id,kind||' '||number,number,subtotal+total_tax,currency,rate,issue,due,auth.uid(),document_id) returning id into payable;
 update public.purchase_documents set payable_id=payable where id=document_id;
 return document_id;
end $$;

create or replace function public.convert_proforma_to_invoice(p_proforma_id uuid,p_invoice jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.invoices%rowtype; result record; items jsonb; paid numeric; final_total numeric;
  payment record; receipt uuid; remaining numeric; applied numeric; sequence_number bigint;
begin
  if auth.uid() is null or not public.can_manage_finance() then raise exception 'Sin permiso' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('receipt:'||public.current_tenant_id()::text,0));
  -- Los recibos se bloquean antes de sus facturas, igual que en aplicar/revertir.
  perform 1 from public.customer_receipts r where r.id in(select receipt_id from public.invoice_payments where invoice_id=p_proforma_id and status='Aplicado')
    and r.tenant_id=public.current_tenant_id() order by r.id for update;
  select * into source from public.invoices where id=p_proforma_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
  if not found or source.invoice_type<>'Proforma' or source.status='Anulada' then raise exception 'Proforma no disponible'; end if;
  if source.converted_invoice_id is not null then return source.converted_invoice_id; end if;
  select jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_price',unit_price,
    'isv_rate',isv_rate,'tax_treatment',tax_treatment,'income_account_id',income_account_id,'discount_amount',discount_amount,'service_catalog_kind',service_catalog_kind,'service_catalog_code',service_catalog_code) order by sort_order,id) into items from public.invoice_items where invoice_id=source.id;
  select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=source.id and status='Aplicado';
  select * into result from public.create_invoice_with_items_trusted(p_invoice || jsonb_build_object(
    'invoice_type','Factura','cliente_id',source.cliente_id,'currency',source.currency,'exchange_rate',source.exchange_rate,
    'issue_date',current_date,'notes',source.notes),items);
  select total into final_total from public.invoices where id=result.invoice_id;
  update public.invoices set source_proforma_id=source.id where id=result.invoice_id;
  if paid<=final_total then
    update public.invoice_payments set original_proforma_id=source.id,invoice_id=result.invoice_id,applied_document_id=result.invoice_id
      where invoice_id=source.id and status='Aplicado';
    if paid>0 then update public.invoices set status=case when paid=final_total then 'Pagada' else 'Parcialmente Pagada' end where id=result.invoice_id; end if;
  else
    update public.invoices set status='Aprobada' where id=result.invoice_id;
    remaining:=final_total;
    for payment in select * from public.invoice_payments where invoice_id=source.id and status='Aplicado' order by payment_date,id for update loop
      receipt:=payment.receipt_id;
      if receipt is null then
        select count(*)+1 into sequence_number from public.customer_receipts where tenant_id=source.tenant_id;
        insert into public.customer_receipts(tenant_id,cliente_id,request_id,receipt_number,amount,currency,payment_date,payment_method,reference,notes,created_by,origin_payment_id)
        values(source.tenant_id,source.cliente_id,payment.id,'REC-'||lpad(sequence_number::text,8,'0'),payment.amount,payment.currency,payment.payment_date,
          case when payment.payment_method in ('Efectivo','Cheque','Deposito','Transferencia','Tarjeta debito','Tarjeta credito','Mixto') then payment.payment_method else 'Sin especificar' end,
          coalesce(payment.reference,''),'Anticipo originado en '||source.invoice_number,auth.uid(),payment.id) returning id into receipt;
        update public.invoice_payments set receipt_id=receipt,applied_document_id=source.id,original_proforma_id=source.id where id=payment.id;
      end if;
      perform public.reverse_invoice_payment_tenant_internal(payment.id,'Reclasificación de anticipo a factura final; el remanente permanece en el recibo');
      applied:=least(payment.amount,remaining);
      if applied>0 then
        perform public.allocate_customer_receipt(receipt,payment.id,jsonb_build_array(jsonb_build_object('document_id',result.invoice_id,'amount',applied)));
        update public.invoice_payments set original_proforma_id=source.id where receipt_id=receipt and allocation_request_id=payment.id;
        remaining:=remaining-applied;
      end if;
    end loop;
  end if;
  update public.invoices set converted_invoice_id=result.invoice_id where id=source.id;
  return result.invoice_id;
end $$;
create or replace function public.post_invoice_journal(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice public.invoices%rowtype;lines jsonb;gross numeric;tax numeric;net numeric;is_credit boolean;line record;value numeric;allocated numeric:=0;position integer:=0;total_lines integer;rate numeric;default_account uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into invoice from public.invoices where id=p_invoice_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
 if not found or invoice.invoice_type='Proforma' or invoice.status in ('Borrador','Anulada') then raise exception 'El documento no está emitido';end if;
 if not exists(select 1 from public.accounting_settings where tenant_id=invoice.tenant_id and starts_on is not null and invoice.issue_date>=starts_on) then raise exception 'Configura la fecha de inicio contable antes de contabilizar documentos';end if;
 rate:=case when invoice.currency='HNL' then 1 else invoice.exchange_rate end;gross:=round(invoice.total*rate,2);tax:=round(invoice.tax_amount*rate,2);net:=gross-tax;is_credit:=invoice.invoice_type='Nota de Crédito';
 if gross<=0 then raise exception 'Documento sin importe contable';end if;
 if exists(select 1 from public.invoice_items where invoice_id=invoice.id and tenant_id=invoice.tenant_id
  and service_catalog_code is not null and income_account_id is null and amount>0) then
  raise exception 'La factura contiene servicios sin cuenta de ingreso guardada; solicita revisión de Contabilidad antes de contabilizar';
 end if;
 default_account:=public.account_for('sales');
 lines:=jsonb_build_array(jsonb_build_object('account_id',public.account_for('receivable'),'debit',case when is_credit then 0 else gross end,'credit',case when is_credit then gross else 0 end));
 select count(distinct coalesce(income_account_id,default_account)) into total_lines from public.invoice_items where invoice_id=invoice.id;
 for line in select coalesce(income_account_id,default_account) account_id,sum(amount) amount from public.invoice_items where invoice_id=invoice.id group by coalesce(income_account_id,default_account) order by coalesce(income_account_id,default_account) loop
  position:=position+1;value:=case when position=total_lines then net-allocated else round(line.amount*rate,2) end;allocated:=allocated+value;
  if value>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',line.account_id,'debit',case when is_credit then value else 0 end,'credit',case when is_credit then 0 else value end));end if;
 end loop;
 if total_lines=0 and net>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',default_account,'debit',case when is_credit then net else 0 end,'credit',case when is_credit then 0 else net end));end if;
 if tax>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('sales_tax'),'debit',case when is_credit then tax else 0 end,'credit',case when is_credit then 0 else tax end));end if;
 return public.post_journal_internal(invoice.issue_date,invoice.invoice_type||' '||invoice.invoice_number,'Factura',invoice.id,'invoice:'||invoice.id,lines,invoice.currency,rate,invoice.total);
end $$;
notify pgrst,'reload schema';
