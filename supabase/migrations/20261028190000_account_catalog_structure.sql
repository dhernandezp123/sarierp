-- ACC-IMPORT-PDF-01: generic chart structure; no real catalog or opening data.
alter table public.accounting_accounts drop constraint accounting_accounts_kind_check;
alter table public.accounting_accounts add constraint accounting_accounts_kind_check check(kind in ('Activo','Pasivo','Patrimonio','Ingreso','Costo','Gasto','Resultado','Orden'));
alter table public.accounting_accounts add column account_level text check(account_level in ('Tipo','Grupo','Mayor','SubCuenta','Auxiliar'));
alter table public.accounting_accounts add constraint accounting_grouping_postability check(not postable or (kind<>'Resultado' and (account_level is null or account_level not in ('Tipo','Grupo'))));

create or replace function public.save_accounting_account(p_account jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare account_id uuid:=nullif(p_account->>'id','')::uuid; parent uuid:=nullif(p_account->>'parent_id','')::uuid; previous public.accounting_accounts%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 if coalesce((p_account->>'postable')::boolean,true) and (p_account->>'kind'='Resultado' or p_account->>'account_level' in ('Tipo','Grupo')) then raise exception 'Una cuenta agrupadora no recibe movimientos';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 if parent is not null and not exists(select 1 from public.accounting_accounts where id=parent and tenant_id=public.current_tenant_id() and not postable and (kind=p_account->>'kind' or (kind='Resultado' and p_account->>'kind' in ('Ingreso','Costo','Gasto')))) then raise exception 'La cuenta padre debe ser agrupadora del mismo tipo y empresa'; end if;
 if account_id is not null then
  select * into previous from public.accounting_accounts where id=account_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Cuenta no disponible'; end if;
  if exists(select 1 from public.journal_lines l where l.account_id=previous.id) and
    (previous.code is distinct from p_account->>'code' or previous.kind is distinct from p_account->>'kind' or not coalesce((p_account->>'postable')::boolean,true)) then raise exception 'Una cuenta con movimientos conserva código, tipo y capacidad de movimiento'; end if;
  if exists(with recursive parents as(select id,parent_id from public.accounting_accounts where id=parent union all
    select a.id,a.parent_id from public.accounting_accounts a join parents p on a.id=p.parent_id) select 1 from parents where id=account_id) then raise exception 'Jerarquía circular'; end if;
  if exists(select 1 from public.accounting_accounts where parent_id=account_id) and
    (coalesce((p_account->>'postable')::boolean,true) or previous.kind is distinct from p_account->>'kind') then raise exception 'Una cuenta con hijas debe seguir siendo agrupadora del mismo tipo'; end if;
  update public.accounting_accounts set code=btrim(p_account->>'code'),name=btrim(p_account->>'name'),kind=p_account->>'kind',parent_id=parent,
    postable=coalesce((p_account->>'postable')::boolean,true),active=coalesce((p_account->>'active')::boolean,true),account_level=case when p_account?'account_level' then nullif(btrim(p_account->>'account_level'),'') else previous.account_level end,updated_at=now() where id=account_id;
 else
  insert into public.accounting_accounts(tenant_id,code,name,kind,parent_id,postable,active,account_level) values(public.current_tenant_id(),btrim(p_account->>'code'),btrim(p_account->>'name'),p_account->>'kind',parent,
    coalesce((p_account->>'postable')::boolean,true),coalesce((p_account->>'active')::boolean,true),nullif(btrim(p_account->>'account_level'),'')) returning id into account_id;
 end if;
 return account_id;
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
  if expected_kind is null or not exists(select 1 from public.accounting_accounts where id=mapping.value::uuid and tenant_id=public.current_tenant_id() and active and postable and (kind=expected_kind or (mapping.key='purchases' and kind='Costo'))) then raise exception 'Cuenta incompatible para %',mapping.key; end if;
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

create or replace function public.post_journal_internal(p_date date,p_description text,p_source_type text,p_source_id uuid,p_source_key text,p_lines jsonb,
 p_currency text default 'HNL',p_rate numeric default 1,p_original_total numeric default null,p_reverses uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare entry_id uuid; line jsonb; account public.accounting_accounts%rowtype; debit numeric; credit numeric; total_debit numeric:=0;total_credit numeric:=0;seq bigint;position integer:=0;order_debit numeric:=0;order_credit numeric:=0;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 select id into entry_id from public.journal_entries where tenant_id=public.current_tenant_id() and source_key=p_source_key;
 if found then return entry_id; end if;
 if p_date is null or p_date>current_date or nullif(btrim(p_description),'') is null or length(p_description)>2000 then raise exception 'Revisa fecha y concepto del asiento'; end if;
 if not exists(select 1 from public.accounting_periods where tenant_id=public.current_tenant_id() and p_date between starts_on and ends_on and not closed) then raise exception 'La fecha no pertenece a un período contable abierto'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 2 and 500 then raise exception 'Un asiento requiere entre 2 y 500 líneas'; end if;
 select coalesce(max(entry_number),0)+1 into seq from public.journal_entries where tenant_id=public.current_tenant_id();
 insert into public.journal_entries(tenant_id,entry_number,entry_date,description,source_type,source_id,source_key,source_currency,exchange_rate,original_total,reverses_id,created_by)
 values(public.current_tenant_id(),seq,p_date,btrim(p_description),p_source_type,p_source_id,p_source_key,p_currency,p_rate,p_original_total,p_reverses,auth.uid()) returning id into entry_id;
 for line in select value from jsonb_array_elements(p_lines) loop
  debit:=coalesce((line->>'debit')::numeric,0);credit:=coalesce((line->>'credit')::numeric,0);
  if debit::text in ('NaN','Infinity','-Infinity') or credit::text in ('NaN','Infinity','-Infinity') or debit<0 or credit<0 or (debit>0)=(credit>0) or debit<>round(debit,2) or credit<>round(credit,2) then raise exception 'Cada línea requiere solo débito o crédito positivo con dos decimales'; end if;
  select * into account from public.accounting_accounts where id=(line->>'account_id')::uuid and tenant_id=public.current_tenant_id() and postable and (active or p_reverses is not null);
  if not found then raise exception 'Cuenta no disponible para contabilizar'; end if;
  if account.kind='Orden' then order_debit:=order_debit+debit;order_credit:=order_credit+credit;end if;
  position:=position+1;total_debit:=total_debit+debit;total_credit:=total_credit+credit;
  insert into public.journal_lines(tenant_id,entry_id,account_id,account_code,account_name,debit,credit,description,sort_order)
    values(public.current_tenant_id(),entry_id,account.id,account.code,account.name,debit,credit,left(coalesce(line->>'description',''),2000),position);
 end loop;
 if total_debit<>total_credit or total_debit<=0 then raise exception 'Asiento desbalanceado: debe %, haber %',total_debit,total_credit; end if;
 if order_debit<>order_credit then raise exception 'Las cuentas de orden deben balancearse separadas de las cuentas financieras';end if;
 return entry_id;
end $$;

create or replace function public.create_purchase_document(p_request_id uuid,p_document jsonb,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare supplier public.proveedores%rowtype;document_id uuid;payable uuid;office uuid:=nullif(p_document->>'office_id','')::uuid;
 kind text:=p_document->>'document_type';currency text:=p_document->>'currency';rate numeric;issue date:=(p_document->>'issue_date')::date;due date;
 item jsonb;items jsonb:='[]';quantity numeric;price numeric;tax_rate numeric;amount numeric;tax numeric;subtotal numeric:=0;total_tax numeric:=0;
 account uuid;issuer jsonb;fiscal jsonb;number text;discount numeric;discounts numeric:=0;
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
  if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.kind in ('Activo','Costo','Gasto') and a.active and a.postable) then raise exception 'Selecciona una cuenta de activo, costo o gasto para cada línea';end if;
  if kind='Boleta de Compra' and coalesce((item->>'tax_credit')::boolean,false) then raise exception 'La boleta de compra no respalda crédito fiscal de ISV';end if;
  discount:=coalesce((item->>'discount_amount')::numeric,0);
  if discount::text in ('NaN','Infinity','-Infinity') or discount<0 or discount<>round(discount,2) or discount>round(quantity*price,2) then raise exception 'Descuento de compra inválido';end if;
  discounts:=discounts+discount;amount:=round(quantity*price,2)-discount;tax:=round(amount*tax_rate/100,2);subtotal:=subtotal+amount;total_tax:=total_tax+tax;
  items:=items||jsonb_build_array(jsonb_build_object('description',btrim(item->>'description'),'quantity',quantity,'unit_price',price,'amount',amount,'discount_amount',discount,'tax_rate',tax_rate,'tax',tax,'tax_credit',coalesce((item->>'tax_credit')::boolean,false),'account_id',account));
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

notify pgrst,'reload schema';
