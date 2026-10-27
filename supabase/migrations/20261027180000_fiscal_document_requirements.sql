-- Requisitos de boleta (arts. 21/22) y respaldo de retención (art. 34), Acuerdo 481-2017.
-- Códigos de documento según reforma 609-2017: retención 05, boleta 11.
alter table public.purchase_documents add column source_cai text not null default '';
alter table public.withholding_documents add column source_document_snapshot jsonb not null default '{}';
create or replace function public.create_purchase_document(p_request_id uuid,p_document jsonb,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
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
  if kind='Boleta de Compra' and coalesce((item->>'tax_credit')::boolean,false) then raise exception 'La boleta de compra no respalda crédito fiscal de ISV';end if;
  amount:=round(quantity*price,2);tax:=round(amount*tax_rate/100,2);subtotal:=subtotal+amount;total_tax:=total_tax+tax;
  items:=items||jsonb_build_array(jsonb_build_object('description',btrim(item->>'description'),'quantity',quantity,'unit_price',price,'amount',amount,'tax_rate',tax_rate,'tax',tax,'tax_credit',coalesce((item->>'tax_credit')::boolean,false),'account_id',account));
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
 insert into public.purchase_documents(tenant_id,request_id,document_type,document_number,supplier_id,office_id,issue_date,due_date,currency,exchange_rate,subtotal,tax_amount,total,items,issuer_snapshot,supplier_snapshot,fiscal_snapshot,source_cai,notes,created_by)
 values(public.current_tenant_id(),p_request_id,kind,number,supplier.id,office,issue,due,currency,rate,subtotal,total_tax,subtotal+total_tax,items,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',case when kind='Boleta de Compra' then coalesce(nullif(p_document->>'supplier_identity',''),supplier.rtn) else supplier.rtn end,'address',left(coalesce(p_document->>'supplier_address',''),500),'phone',coalesce(nullif(p_document->>'supplier_phone',''),supplier.telefono),'email',supplier.email),fiscal,left(coalesce(p_document->>'source_cai',''),100),left(coalesce(p_document->>'notes',''),2000),auth.uid()) returning id into document_id;
 insert into public.cuentas_pagar(tenant_id,proveedor_id,descripcion,numero_factura_proveedor,monto,moneda,tipo_cambio,fecha_factura,fecha_vencimiento,created_by,purchase_document_id)
 values(public.current_tenant_id(),supplier.id,kind||' '||number,number,subtotal+total_tax,currency,rate,issue,due,auth.uid(),document_id) returning id into payable;
 update public.purchase_documents set payable_id=payable where id=document_id;
 return document_id;
end $$;

create or replace function public.create_withholding_document(p_request_id uuid,p_payable_id uuid,p_office_id uuid,p_issue_date date,p_items jsonb) returns uuid
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
 insert into public.withholding_documents(tenant_id,request_id,payable_id,office_id,document_number,issue_date,currency,exchange_rate,items,total,issuer_snapshot,supplier_snapshot,fiscal_snapshot,source_document_snapshot,created_by)
 values(payable.tenant_id,p_request_id,payable.id,p_office_id,fiscal->>'number',p_issue_date,payable.moneda,exchange,items,total,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',supplier.rtn,'phone',supplier.telefono,'email',supplier.email),fiscal,jsonb_build_object('number',payable.numero_factura_proveedor,'issue_date',payable.fecha_factura,'cai',coalesce((select coalesce(nullif(d.source_cai,''),d.fiscal_snapshot->>'cai') from public.purchase_documents d where d.id=payable.purchase_document_id),'')),auth.uid()) returning id into document_id;
 insert into public.pagos_proveedor(tenant_id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,referencia,notas,created_by,withholding_document_id)
 values(payable.tenant_id,payable.id,total,payable.moneda,p_issue_date,'Retención',fiscal->>'number','Retención fiscal; no es salida de caja',auth.uid(),document_id) returning id into payment_id;
 perform public.finish_supplier_action_internal(payable.id,'withholding_issued',jsonb_build_object('document_id',document_id,'payment_id',payment_id,'amount',total));
 return document_id;
end $$;


notify pgrst,'reload schema';
