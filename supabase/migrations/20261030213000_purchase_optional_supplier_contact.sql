-- Explicit business rule: identity is optional only for purchase slips.
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
  account:=coalesce(account,service_account,case when p_document ? 'expense_account_id' then nullif(p_document->>'expense_account_id','')::uuid else supplier.default_expense_account_id end);
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
  issuer:=public.fiscal_office_snapshot(office);fiscal:=public.allocate_additional_fiscal_number(office,kind,issue);number:=fiscal->>'number';
 else
  number:=btrim(p_document->>'document_number');if nullif(number,'') is null or length(number)>120 then raise exception 'Indica el número de factura del proveedor';end if;
  if exists(select 1 from public.purchase_documents where tenant_id=public.current_tenant_id() and supplier_id=supplier.id and document_number=number and status='Emitida') then raise exception 'Ya existe esta factura del proveedor';end if;
 end if;
 insert into public.purchase_documents(tenant_id,request_id,document_type,document_number,supplier_id,office_id,issue_date,due_date,currency,exchange_rate,subtotal,tax_amount,total,discount_amount,items,issuer_snapshot,supplier_snapshot,fiscal_snapshot,source_cai,notes,created_by)
 values(public.current_tenant_id(),p_request_id,kind,number,supplier.id,office,issue,due,currency,rate,subtotal,total_tax,subtotal+total_tax,discounts,items,issuer,
 jsonb_build_object('name',supplier.nombre,'rtn',case when kind='Boleta de Compra' then coalesce(nullif(btrim(p_document->>'supplier_identity'),''),nullif(btrim(supplier.rtn),'')) else supplier.rtn end,'address',left(coalesce(p_document->>'supplier_address',''),500),'phone',coalesce(nullif(p_document->>'supplier_phone',''),supplier.telefono),'email',supplier.email),fiscal,left(coalesce(p_document->>'source_cai',''),100),left(coalesce(p_document->>'notes',''),2000),auth.uid()) returning id into document_id;
 insert into public.cuentas_pagar(tenant_id,proveedor_id,descripcion,numero_factura_proveedor,monto,moneda,tipo_cambio,fecha_factura,fecha_vencimiento,created_by,purchase_document_id)
 values(public.current_tenant_id(),supplier.id,kind||' '||number,number,subtotal+total_tax,currency,rate,issue,due,auth.uid(),document_id) returning id into payable;
 update public.purchase_documents set payable_id=payable where id=document_id;
 return document_id;
end $$;
notify pgrst,'reload schema';
