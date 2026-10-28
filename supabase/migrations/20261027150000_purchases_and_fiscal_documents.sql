-- Etapa 5: compras por cuenta, boletas y constancias de retención.
alter table public.invoice_items add column income_account_id uuid,
 add constraint invoice_item_income_account_fk foreign key(tenant_id,income_account_id) references public.accounting_accounts(tenant_id,id);
alter function public.create_invoice_with_items_trusted(jsonb,jsonb) rename to create_invoice_fiscal_base;
revoke all on function public.create_invoice_fiscal_base(jsonb,jsonb) from public,anon,authenticated;
create function public.create_invoice_with_items_trusted(p_invoice jsonb,p_items jsonb) returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare result record;line record;account uuid;
begin
 select * into result from public.create_invoice_fiscal_base(p_invoice,p_items);
 for line in select value,ordinality from jsonb_array_elements(p_items) with ordinality loop
  account:=nullif(coalesce(line.value->>'income_account_id',p_invoice->'line_accounts'->>(line.value->>'source_pricing_item_id')),'')::uuid;
  if account is not null then
   if not exists(select 1 from public.accounting_accounts where id=account and tenant_id=public.current_tenant_id() and kind='Ingreso' and active and postable) then raise exception 'Cuenta de ingreso inválida';end if;
   update public.invoice_items i set income_account_id=account where i.invoice_id=result.invoice_id and i.sort_order=line.ordinality-1;
  end if;
 end loop;
 return query select result.invoice_id::uuid,result.invoice_number::text;
end $$;
revoke all on function public.create_invoice_with_items_trusted(jsonb,jsonb) from public,anon,authenticated;

create table public.purchase_documents (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),request_id uuid not null,
 document_type text not null check(document_type in ('Factura de proveedor','Boleta de Compra')),document_number text not null,
 supplier_id uuid not null,office_id uuid,payable_id uuid,issue_date date not null,due_date date not null,
 currency text not null check(currency in ('HNL','USD')),exchange_rate numeric(18,6) not null check(exchange_rate>0 and exchange_rate<=1000000),
 subtotal numeric(14,2) not null,tax_amount numeric(14,2) not null,total numeric(14,2) not null check(total>0 and total::text<>'NaN'),
 items jsonb not null check(jsonb_typeof(items)='array'),issuer_snapshot jsonb,supplier_snapshot jsonb not null,fiscal_snapshot jsonb,
 notes text not null default '',status text not null default 'Emitida' check(status in ('Emitida','Anulada')),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(tenant_id,id),unique(tenant_id,request_id),unique(payable_id),
 foreign key(tenant_id,supplier_id) references public.proveedores(tenant_id,id),
 foreign key(tenant_id,office_id) references public.billing_offices(tenant_id,id),foreign key(tenant_id,payable_id) references public.cuentas_pagar(tenant_id,id)
);
alter table public.cuentas_pagar add column purchase_document_id uuid,
 add constraint payable_purchase_document_fk foreign key(tenant_id,purchase_document_id) references public.purchase_documents(tenant_id,id);
create table public.withholding_documents (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),request_id uuid not null,
 payable_id uuid not null,office_id uuid not null,document_number text not null,issue_date date not null,
 currency text not null check(currency in ('HNL','USD')),exchange_rate numeric(18,6) not null check(exchange_rate>0 and exchange_rate<=1000000),
 items jsonb not null,total numeric(14,2) not null check(total>0 and total::text<>'NaN'),
 issuer_snapshot jsonb not null,supplier_snapshot jsonb not null,fiscal_snapshot jsonb not null,
 status text not null default 'Emitida' check(status in ('Emitida','Anulada')),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(tenant_id,id),unique(tenant_id,request_id),unique(tenant_id,document_number),
 foreign key(tenant_id,office_id) references public.billing_offices(tenant_id,id),foreign key(tenant_id,payable_id) references public.cuentas_pagar(tenant_id,id)
);
alter table public.pagos_proveedor add column withholding_document_id uuid,
 add constraint supplier_payment_withholding_fk foreign key(tenant_id,withholding_document_id) references public.withholding_documents(tenant_id,id);
alter table public.pagos_proveedor drop constraint pagos_proveedor_metodo_pago_check;
alter table public.pagos_proveedor add constraint pagos_proveedor_metodo_pago_check check(metodo_pago in ('Transferencia','Cheque','Efectivo','Otro','Retención'));
alter table public.accounting_mappings drop constraint accounting_mappings_purpose_check;
alter table public.accounting_mappings add constraint accounting_mappings_purpose_check check(purpose in ('receivable','payable','cash','customer_advances','sales','purchases','sales_tax','purchase_tax','exchange_gain','exchange_loss','withholding_payable'));
do $$ declare table_name text;begin
 foreach table_name in array array['purchase_documents','withholding_documents'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);execute format('grant select on public.%I to authenticated',table_name);
 end loop;
end $$;

create function public.fiscal_office_snapshot(p_office_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare office public.billing_offices%rowtype;settings public.company_settings%rowtype;
begin
 select * into office from public.billing_offices where id=p_office_id and tenant_id=public.current_tenant_id() and is_active;
 if not found then raise exception 'Oficina no disponible';end if;
 select * into settings from public.company_settings where tenant_id=office.tenant_id;
 if nullif(btrim(settings.legal_name),'') is null or nullif(btrim(settings.rtn),'') is null or nullif(btrim(settings.address),'') is null
  or nullif(btrim(office.address),'') is null or nullif(btrim(office.phone),'') is null or nullif(btrim(office.email),'') is null
  or office.establishment_code='' or office.emission_point_code='' then raise exception 'Completa domicilio fiscal, contacto y códigos SAR de la oficina';end if;
 return jsonb_build_object('legal_name',settings.legal_name,'trade_name',settings.trade_name,'rtn',settings.rtn,'fiscal_address',settings.address,
  'address',office.address,'phone',office.phone,'email',office.email,'office_name',office.name,'invoice_footer_note',settings.invoice_footer_note);
end $$;
create function public.allocate_additional_fiscal_number(p_office_id uuid,p_type text,p_date date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare office public.billing_offices%rowtype;cai public.cai_ranges%rowtype;number text;
begin
 if p_type not in ('Boleta de Compra','Comprobante de Retención') or p_date is null or p_date>current_date then raise exception 'Tipo o fecha fiscal inválidos';end if;
 select * into office from public.billing_offices where id=p_office_id and tenant_id=public.current_tenant_id() and is_active;
 if not found then raise exception 'Oficina no disponible';end if;
 perform pg_advisory_xact_lock(hashtextextended('cai:'||office.tenant_id::text||':'||office.name||':'||p_type,0));
 select * into cai from public.cai_ranges where tenant_id=office.tenant_id and point_of_sale=office.name and document_type=p_type and is_active for update;
 if not found then raise exception 'No hay CAI activo para % en %',p_type,office.name;end if;
 if p_date>cai.fecha_limite_emision or current_date>cai.fecha_limite_emision then raise exception 'CAI vencido';end if;
 if cai.next_number>cai.range_end then raise exception 'CAI agotado';end if;
 if left(cai.rango_desde,7)<>office.establishment_code||'-'||office.emission_point_code then raise exception 'El CAI no corresponde a los códigos SAR de la oficina';end if;
 number:=cai.number_prefix||lpad(cai.next_number::text,cai.number_width,'0');
 update public.cai_ranges set next_number=next_number+1 where id=cai.id;
 return jsonb_build_object('number',number,'cai',cai.cai,'rango_desde',cai.rango_desde,'rango_hasta',cai.rango_hasta,'fecha_limite_emision',cai.fecha_limite_emision,'point_of_sale',office.name);
end $$;

create function public.create_purchase_document(p_request_id uuid,p_document jsonb,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare supplier public.proveedores%rowtype;document_id uuid;payable uuid;office uuid:=nullif(p_document->>'office_id','')::uuid;
 kind text:=p_document->>'document_type';currency text:=p_document->>'currency';rate numeric;issue date:=(p_document->>'issue_date')::date;due date;
 item jsonb;items jsonb:='[]';quantity numeric;price numeric;tax_rate numeric;amount numeric;tax numeric;subtotal numeric:=0;total_tax numeric:=0;
 account uuid;issuer jsonb;fiscal jsonb;number text;
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
  quantity:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;tax_rate:=coalesce((item->>'tax_rate')::numeric,0);account:=(item->>'account_id')::uuid;
  if nullif(btrim(item->>'description'),'') is null or length(item->>'description')>500 or quantity is null or quantity<=0 or quantity>1000000 or price is null or price<0 or price>100000000 or tax_rate not in (0,15,18) then raise exception 'Línea de compra inválida';end if;
  if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.kind in ('Activo','Gasto') and a.active and a.postable) then raise exception 'Selecciona una cuenta de activo o gasto para cada línea';end if;
  amount:=round(quantity*price,2);tax:=round(amount*tax_rate/100,2);subtotal:=subtotal+amount;total_tax:=total_tax+tax;
  items:=items||jsonb_build_array(jsonb_build_object('description',btrim(item->>'description'),'quantity',quantity,'unit_price',price,'amount',amount,'tax_rate',tax_rate,'tax',tax,'tax_credit',coalesce((item->>'tax_credit')::boolean,false),'account_id',account));
 end loop;
 if subtotal+total_tax<=0 then raise exception 'La compra debe tener importe positivo';end if;
 if office is not null then issuer:=public.fiscal_office_snapshot(office);end if;
 if kind='Boleta de Compra' then
  if nullif(btrim(supplier.rtn),'') is null then raise exception 'Completa el RTN del proveedor antes de emitir la boleta';end if;
  issuer:=public.fiscal_office_snapshot(office);fiscal:=public.allocate_additional_fiscal_number(office,kind,issue);number:=fiscal->>'number';
 else
  number:=btrim(p_document->>'document_number');if nullif(number,'') is null or length(number)>120 then raise exception 'Indica el número de factura del proveedor';end if;
  if exists(select 1 from public.purchase_documents where tenant_id=public.current_tenant_id() and supplier_id=supplier.id and document_number=number and status='Emitida') then raise exception 'Ya existe esta factura del proveedor';end if;
 end if;
 insert into public.purchase_documents(tenant_id,request_id,document_type,document_number,supplier_id,office_id,issue_date,due_date,currency,exchange_rate,subtotal,tax_amount,total,items,issuer_snapshot,supplier_snapshot,fiscal_snapshot,notes,created_by)
 values(public.current_tenant_id(),p_request_id,kind,number,supplier.id,office,issue,due,currency,rate,subtotal,total_tax,subtotal+total_tax,items,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',supplier.rtn,'phone',supplier.telefono,'email',supplier.email),fiscal,left(coalesce(p_document->>'notes',''),2000),auth.uid()) returning id into document_id;
 insert into public.cuentas_pagar(tenant_id,proveedor_id,descripcion,numero_factura_proveedor,monto,moneda,tipo_cambio,fecha_factura,fecha_vencimiento,created_by,purchase_document_id)
 values(public.current_tenant_id(),supplier.id,kind||' '||number,number,subtotal+total_tax,currency,rate,issue,due,auth.uid(),document_id) returning id into payable;
 update public.purchase_documents set payable_id=payable where id=document_id;
 return document_id;
end $$;

create function public.create_withholding_document(p_request_id uuid,p_payable_id uuid,p_office_id uuid,p_issue_date date,p_items jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare payable public.cuentas_pagar%rowtype;supplier public.proveedores%rowtype;document_id uuid;payment_id uuid;issuer jsonb;fiscal jsonb;item jsonb;items jsonb:='[]';base numeric;rate numeric;amount numeric;total numeric:=0;exchange numeric;balance jsonb;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Falta identificador de solicitud';end if;
 perform pg_advisory_xact_lock(hashtextextended('withholding:'||public.current_tenant_id()::text||':'||p_request_id::text,0));
 select id into document_id from public.withholding_documents where tenant_id=public.current_tenant_id() and request_id=p_request_id;if found then return document_id;end if;
 payable:=public.lock_supplier_payable_internal(p_payable_id);
 if payable.status='Anulada' then raise exception 'Compra anulada';end if;
 select * into supplier from public.proveedores where id=payable.proveedor_id and tenant_id=payable.tenant_id;
 if nullif(btrim(supplier.rtn),'') is null then raise exception 'Completa RTN del proveedor retenido';end if;
 if p_issue_date is null or p_issue_date>current_date or p_issue_date<payable.fecha_factura then raise exception 'Fecha de retención inválida';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Ingresa los conceptos de retención';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  base:=(item->>'base')::numeric;rate:=(item->>'rate')::numeric;
  if nullif(btrim(item->>'description'),'') is null or base is null or base<=0 or base>payable.monto or rate is null or rate<=0 or rate>100 then raise exception 'Revisa concepto, base y porcentaje de retención';end if;
  amount:=round(base*rate/100,2);if amount<=0 then raise exception 'Retención sin importe';end if;total:=total+amount;
  items:=items||jsonb_build_array(jsonb_build_object('description',left(btrim(item->>'description'),500),'base',base,'rate',rate,'amount',amount));
 end loop;
 balance:=public.supplier_payable_balance_internal(payable.id);if total>(balance->>'pending_balance')::numeric then raise exception 'La retención supera el saldo pendiente';end if;
 exchange:=case when payable.moneda='HNL' then 1 else payable.tipo_cambio end;if exchange is null or exchange<=0 or exchange>1000000 then raise exception 'Configura el tipo de cambio de la compra';end if;
 issuer:=public.fiscal_office_snapshot(p_office_id);fiscal:=public.allocate_additional_fiscal_number(p_office_id,'Comprobante de Retención',p_issue_date);
 insert into public.withholding_documents(tenant_id,request_id,payable_id,office_id,document_number,issue_date,currency,exchange_rate,items,total,issuer_snapshot,supplier_snapshot,fiscal_snapshot,created_by)
 values(payable.tenant_id,p_request_id,payable.id,p_office_id,fiscal->>'number',p_issue_date,payable.moneda,exchange,items,total,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',supplier.rtn,'phone',supplier.telefono,'email',supplier.email),fiscal,auth.uid()) returning id into document_id;
 insert into public.pagos_proveedor(tenant_id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,referencia,notas,created_by,withholding_document_id)
 values(payable.tenant_id,payable.id,total,payable.moneda,p_issue_date,'Retención',fiscal->>'number','Retención fiscal; no es salida de caja',auth.uid(),document_id) returning id into payment_id;
 perform public.finish_supplier_action_internal(payable.id,'withholding_issued',jsonb_build_object('document_id',document_id,'payment_id',payment_id,'amount',total));
 return document_id;
end $$;

create function public.sync_purchase_fiscal_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='cuentas_pagar' then
  if new.status='Anulada' and new.purchase_document_id is not null then update public.purchase_documents set status='Anulada' where id=new.purchase_document_id;end if;
 else
  if new.status='Reversado' and new.withholding_document_id is not null then update public.withholding_documents set status='Anulada' where id=new.withholding_document_id;end if;
 end if;
 return new;
end $$;
create trigger sync_purchase_fiscal_status after update of status on public.cuentas_pagar for each row execute function public.sync_purchase_fiscal_status();
create trigger sync_withholding_fiscal_status after update of status on public.pagos_proveedor for each row execute function public.sync_purchase_fiscal_status();

revoke all on function public.fiscal_office_snapshot(uuid),public.allocate_additional_fiscal_number(uuid,text,date),public.sync_purchase_fiscal_status() from public,anon,authenticated;
revoke all on function public.create_purchase_document(uuid,jsonb,jsonb),public.create_withholding_document(uuid,uuid,uuid,date,jsonb) from public,anon;
grant execute on function public.create_purchase_document(uuid,jsonb,jsonb),public.create_withholding_document(uuid,uuid,uuid,date,jsonb) to authenticated;

alter function public.post_supplier_payable_journal(uuid) rename to post_supplier_payable_base;
revoke all on function public.post_supplier_payable_base(uuid) from public,anon,authenticated;
create function public.post_supplier_payable_journal(p_payable_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payable public.cuentas_pagar%rowtype;document public.purchase_documents%rowtype;line record;lines jsonb:='[]';gross numeric;tax_credit numeric;net numeric;allocated numeric:=0;value numeric;position integer:=0;total_lines integer;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into payable from public.cuentas_pagar where id=p_payable_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Compra no disponible';end if;
 if payable.purchase_document_id is null then return public.post_supplier_payable_base(p_payable_id);end if;
 if payable.status='Anulada' then raise exception 'Compra anulada';end if;
 select * into document from public.purchase_documents where id=payable.purchase_document_id;
 gross:=round(document.total*document.exchange_rate,2);
 select round(coalesce(sum((x->>'tax')::numeric) filter(where (x->>'tax_credit')::boolean),0)*document.exchange_rate,2)
 into tax_credit from jsonb_array_elements(document.items) x;
 net:=gross-tax_credit;
 select count(distinct x->>'account_id') into total_lines from jsonb_array_elements(document.items) x;
 for line in select x->>'account_id' account_id,sum((x->>'amount')::numeric+case when (x->>'tax_credit')::boolean then 0 else (x->>'tax')::numeric end) amount
  from jsonb_array_elements(document.items) x group by x->>'account_id' order by x->>'account_id' loop
  position:=position+1;value:=case when position=total_lines then net-allocated else round(line.amount*document.exchange_rate,2) end;allocated:=allocated+value;
  if value>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',line.account_id,'debit',value));end if;
 end loop;
 if tax_credit>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('purchase_tax'),'debit',tax_credit));end if;
 lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'credit',gross));
 return public.post_journal_internal(document.issue_date,document.document_type||' '||document.document_number,'Compra',payable.id,'payable:'||payable.id,lines,document.currency,document.exchange_rate,document.total);
end $$;
revoke all on function public.post_supplier_payable_journal(uuid) from public,anon,authenticated;

create or replace function public.post_invoice_journal(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice public.invoices%rowtype;lines jsonb;gross numeric;tax numeric;net numeric;is_credit boolean;line record;value numeric;allocated numeric:=0;position integer:=0;total_lines integer;rate numeric;default_account uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into invoice from public.invoices where id=p_invoice_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
 if not found or invoice.invoice_type='Proforma' or invoice.status in ('Borrador','Anulada') then raise exception 'El documento no está emitido';end if;
 if not exists(select 1 from public.accounting_settings where tenant_id=invoice.tenant_id and starts_on is not null and invoice.issue_date>=starts_on) then raise exception 'Configura la fecha de inicio contable antes de contabilizar documentos';end if;
 rate:=case when invoice.currency='HNL' then 1 else invoice.exchange_rate end;gross:=round(invoice.total*rate,2);tax:=round(invoice.tax_amount*rate,2);net:=gross-tax;is_credit:=invoice.invoice_type='Nota de Crédito';
 if gross<=0 then raise exception 'Documento sin importe contable';end if;
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

create or replace function public.save_accounting_settings(p_automatic boolean,p_start date,p_mappings jsonb) returns void language plpgsql security definer set search_path=public as $$
declare mapping record; expected_kind text;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_mappings) is distinct from 'object' then raise exception 'Asignaciones inválidas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 for mapping in select * from jsonb_each_text(p_mappings) loop
  if mapping.value is null or mapping.value='' then delete from public.accounting_mappings where tenant_id=public.current_tenant_id() and purpose=mapping.key;continue;end if;
  expected_kind:=case mapping.key when 'receivable' then 'Activo' when 'cash' then 'Activo' when 'purchase_tax' then 'Activo'
    when 'payable' then 'Pasivo' when 'customer_advances' then 'Pasivo' when 'sales_tax' then 'Pasivo' when 'withholding_payable' then 'Pasivo'
    when 'sales' then 'Ingreso' when 'exchange_gain' then 'Ingreso' when 'purchases' then 'Gasto' when 'exchange_loss' then 'Gasto' end;
  if expected_kind is null or not exists(select 1 from public.accounting_accounts where id=mapping.value::uuid and tenant_id=public.current_tenant_id() and active and postable and kind=expected_kind) then raise exception 'Cuenta incompatible para %',mapping.key; end if;
  insert into public.accounting_mappings(tenant_id,purpose,account_id) values(public.current_tenant_id(),mapping.key,mapping.value::uuid)
    on conflict(tenant_id,purpose) do update set account_id=excluded.account_id;
 end loop;
 if p_automatic then
  if p_start is null or not exists(select 1 from public.accounting_periods where tenant_id=public.current_tenant_id() and p_start between starts_on and ends_on and not closed) then raise exception 'Selecciona una fecha de inicio dentro de un período abierto'; end if;
  if (select count(*) from public.accounting_mappings where tenant_id=public.current_tenant_id() and purpose in ('receivable','payable','cash','customer_advances','sales','purchases','sales_tax','purchase_tax'))<8 then raise exception 'Completa las ocho cuentas operativas antes de activar'; end if;
 end if;
 if exists(select 1 from public.journal_entries where tenant_id=public.current_tenant_id()) and exists(select 1 from public.accounting_settings where tenant_id=public.current_tenant_id() and starts_on is distinct from p_start) then raise exception 'La fecha de inicio con asientos existentes no se cambia'; end if;
 insert into public.accounting_settings(tenant_id,automatic_posting,starts_on) values(public.current_tenant_id(),coalesce(p_automatic,false),p_start)
   on conflict(tenant_id) do update set automatic_posting=excluded.automatic_posting,starts_on=excluded.starts_on,updated_at=now();
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
    'isv_rate',isv_rate,'tax_treatment',tax_treatment,'income_account_id',income_account_id) order by sort_order,id) into items from public.invoice_items where invoice_id=source.id;
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
create or replace function public.post_supplier_payment_journal(p_payment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payment public.pagos_proveedor%rowtype;payable public.cuentas_pagar%rowtype;amount numeric;rate numeric;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into payment from public.pagos_proveedor where id=p_payment_id and tenant_id=public.current_tenant_id();
 if not found or payment.status<>'Aplicado' then raise exception 'Pago no disponible';end if;
 select * into payable from public.cuentas_pagar where id=payment.cuenta_pagar_id;
 rate:=case when payment.moneda='HNL' then 1 else payable.tipo_cambio end;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Configura el tipo de cambio de la compra';end if;
 amount:=round(payment.monto*rate,2);
 return public.post_journal_internal(payment.fecha_pago,'Pago a proveedor: '||coalesce(payment.referencia,payable.descripcion),'Pago realizado',payment.id,'supplier-payment:'||payment.id,
  jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'debit',amount),jsonb_build_object('account_id',public.account_for(case when payment.withholding_document_id is not null then 'withholding_payable' else 'cash' end),'credit',amount)),payment.moneda,rate,payment.monto);
end $$;
notify pgrst,'reload schema';
