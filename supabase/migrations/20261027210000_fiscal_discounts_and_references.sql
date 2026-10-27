-- FIN-PDF-02: referencias fiscales congeladas y descuentos de importe por línea.
-- Los importes guardados previamente conservan sus valores; el descuento histórico es cero.
alter table public.invoice_items add column discount_amount numeric(14,2) not null default 0 check(discount_amount>=0 and discount_amount::text<>'NaN');
alter table public.invoices add column discount_amount numeric(14,2) not null default 0 check(discount_amount>=0 and discount_amount::text<>'NaN'),add column parent_fiscal_snapshot jsonb;
alter table public.purchase_documents add column discount_amount numeric(14,2) not null default 0 check(discount_amount>=0 and discount_amount::text<>'NaN');
update public.invoices n set parent_fiscal_snapshot=jsonb_build_object('invoice_number',p.invoice_number,'cai',p.cai,'issue_date',p.issue_date)
from public.invoices p where p.id=n.parent_invoice_id and p.tenant_id=n.tenant_id;
create function public.capture_invoice_fiscal_reference() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
  if new.parent_fiscal_snapshot is distinct from old.parent_fiscal_snapshot then raise exception 'La referencia fiscal del documento es inmutable';end if;
 elsif new.parent_invoice_id is not null then
  select jsonb_build_object('invoice_number',invoice_number,'cai',cai,'issue_date',issue_date) into new.parent_fiscal_snapshot from public.invoices where id=new.parent_invoice_id and tenant_id=new.tenant_id;
  if not found then raise exception 'Documento de origen inexistente o ajeno';end if;
 else new.parent_fiscal_snapshot:=null;
 end if;
 return new;
end $$;
create trigger zz_invoice_fiscal_reference before insert or update on public.invoices for each row execute function public.capture_invoice_fiscal_reference();
revoke all on function public.capture_invoice_fiscal_reference() from public,anon,authenticated;
create or replace function public.create_invoice_office_base(
  p_invoice jsonb,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.current_tenant_id();
  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_type text := p_invoice->>'invoice_type';
  v_is_fiscal boolean;
  v_issue_date date := coalesce((p_invoice->>'issue_date')::date, current_date);
  v_due_date date := nullif(p_invoice->>'due_date', '')::date;
  v_currency text := coalesce(nullif(p_invoice->>'currency', ''), 'USD');
  v_exchange_rate numeric := coalesce((p_invoice->>'exchange_rate')::numeric, 1);
  v_client public.clientes%rowtype;
  v_cai public.cai_ranges%rowtype;
  v_item jsonb;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_rate numeric;
  v_discount numeric;
  v_line_amount numeric;
  v_exempt numeric := 0;
  v_taxable_15 numeric := 0;
  v_taxable_18 numeric := 0;
  v_subtotal numeric;
  v_tax_15 numeric;
  v_tax_18 numeric;
  v_tax_total numeric;
  v_total numeric;
  v_sequence bigint;
  v_sequence_key text;
  v_parent public.invoices%rowtype;
  v_quotation_id uuid := nullif(p_invoice->>'quotation_id', '')::uuid;
  v_point_of_sale text := nullif(btrim(p_invoice->>'point_of_sale'), '');
  v_points text[];
  v_parent_point text;
begin
  if v_user_id is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  v_points := public.get_billing_points_of_sale();
  v_point_of_sale := coalesce(v_point_of_sale, v_points[1]);
  if v_point_of_sale is null or not (v_point_of_sale = any(v_points)) then
    raise exception 'Selecciona un punto de venta configurado para esta empresa';
  end if;

  if v_invoice_type not in (
    'Proforma', 'Factura', 'Nota de Crédito', 'Nota de Débito'
  ) then
    raise exception 'Tipo de documento invalido';
  end if;
  if v_currency not in ('USD', 'HNL') then
    raise exception 'Moneda invalida';
  end if;
  if v_currency = 'USD' and v_exchange_rate <= 0 then
    raise exception 'El tipo de cambio debe ser mayor que cero';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El documento debe contener al menos una linea';
  end if;

  select * into v_client
  from public.clientes client
  where client.id = (p_invoice->>'cliente_id')::uuid
    and client.tenant_id = v_tenant_id
    and client.deleted_at is null;

  if not found then
    raise exception 'El cliente no existe o fue eliminado';
  end if;

  if v_invoice_type not in ('Nota de Crédito', 'Nota de Débito') then
    select name into v_parent_point from public.billing_offices
    where id=v_client.billing_office_id and tenant_id=v_tenant_id and is_active;
    if not found then raise exception 'Asigna una oficina de facturación activa al cliente'; end if;
    if nullif(btrim(p_invoice->>'point_of_sale'),'') is not null
      and p_invoice->>'point_of_sale' <> v_parent_point then
      raise exception 'La factura debe usar la oficina asignada al cliente';
    end if;
    v_point_of_sale := v_parent_point;
  end if;

  if v_quotation_id is not null and not exists (
    select 1 from public.quotations quotation
    where quotation.id = v_quotation_id
      and quotation.tenant_id = v_tenant_id
      and quotation.deleted_at is null
  ) then
    raise exception 'La cotizacion no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  v_is_fiscal := v_invoice_type <> 'Proforma';
  if v_is_fiscal and nullif(btrim(coalesce(v_client.rtn, '')), '') is null then
    raise exception 'El cliente debe tener RTN para emitir un documento fiscal';
  end if;

  if v_invoice_type in ('Nota de Crédito', 'Nota de Débito') then
    if nullif(p_invoice->>'parent_invoice_id', '') is null then
      raise exception 'Las notas requieren un documento fiscal relacionado';
    end if;

    select * into v_parent
    from public.invoices invoice
    where invoice.id = (p_invoice->>'parent_invoice_id')::uuid
      and invoice.tenant_id = v_tenant_id
      and invoice.deleted_at is null
      and invoice.invoice_type = 'Factura';

    if not found or v_parent.cliente_id is distinct from v_client.id then
      raise exception 'El documento relacionado no es una factura valida del cliente';
    end if;
    v_parent_point := v_parent.point_of_sale;
    if v_parent_point is null then
      select cai.point_of_sale into v_parent_point from public.cai_ranges cai
      where cai.tenant_id = v_tenant_id and cai.cai = v_parent.cai
        and cai.rango_desde = v_parent.rango_desde
      order by cai.created_at limit 1;
    end if;
    v_parent_point := coalesce(v_parent_point, v_points[1]);
    if nullif(btrim(p_invoice->>'point_of_sale'), '') is null then v_point_of_sale := v_parent_point; end if;
    if v_point_of_sale is distinct from v_parent_point then
      raise exception 'La nota debe emitirse en el punto de venta de la factura relacionada';
    end if;
    if nullif(btrim(coalesce(p_invoice->>'motivo', '')), '') is null then
      raise exception 'El motivo es obligatorio para notas de credito o debito';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_rate := coalesce((v_item->>'isv_rate')::numeric, 0);
    if v_description = '' or v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'Las lineas requieren descripcion, cantidad positiva y precio valido';
    end if;
    if v_rate not in (0, 15, 18) then
      raise exception 'La tasa ISV de una linea es invalida';
    end if;

    v_discount := coalesce((v_item->>'discount_amount')::numeric,0);
    if v_discount::text in ('NaN','Infinity','-Infinity') or v_discount<0 or v_discount<>round(v_discount,2) or v_discount>round(v_quantity*v_unit_price,2) then raise exception 'El descuento de línea debe estar entre cero y su importe bruto, con dos decimales';end if;
    v_line_amount := round(v_quantity * v_unit_price, 2)-v_discount;
    if v_rate = 0 then
      v_exempt := v_exempt + v_line_amount;
    elsif v_rate = 15 then
      v_taxable_15 := v_taxable_15 + v_line_amount;
    else
      v_taxable_18 := v_taxable_18 + v_line_amount;
    end if;
  end loop;

  v_subtotal := round(v_exempt + v_taxable_15 + v_taxable_18, 2);
  v_tax_15 := round(v_taxable_15 * 0.15, 2);
  v_tax_18 := round(v_taxable_18 * 0.18, 2);
  v_tax_total := v_tax_15 + v_tax_18;
  v_total := v_subtotal + v_tax_total;

  if v_is_fiscal then
    perform pg_advisory_xact_lock(hashtextextended(
      'cai:' || v_tenant_id::text || ':' || v_point_of_sale || ':' || v_invoice_type, 0));
    select * into v_cai
    from public.cai_ranges cai
    where cai.tenant_id = v_tenant_id
      and cai.point_of_sale = v_point_of_sale
      and cai.document_type = v_invoice_type
      and cai.is_active is true
    for update;

    if not found then
      raise exception 'No hay un rango CAI activo para % en %', v_invoice_type, v_point_of_sale;
    end if;
    if v_issue_date > v_cai.fecha_limite_emision then
      raise exception 'El rango CAI esta vencido para la fecha de emision';
    end if;
    if v_cai.next_number > v_cai.range_end then
      raise exception 'El rango CAI para % esta agotado', v_invoice_type;
    end if;

    v_invoice_number := v_cai.number_prefix
      || lpad(v_cai.next_number::text, v_cai.number_width, '0');
    update public.cai_ranges
    set next_number = next_number + 1
    where id = v_cai.id and tenant_id = v_tenant_id;
  else
    v_sequence_key := 'PROFORMA-' || to_char(v_issue_date, 'YYYYMM');
    v_sequence := public.allocate_tenant_document_sequence(
      v_tenant_id, v_sequence_key, 1
    );
    v_invoice_number := 'SARI-PRO-' || to_char(v_issue_date, 'YYYYMM')
      || '-' || lpad(v_sequence::text, 3, '0');
  end if;

  insert into public.invoices (
    tenant_id, invoice_number, invoice_type, status, quotation_id, cliente_id,
    cliente_nombre, cliente_rtn, cliente_direccion, cliente_email,
    issue_date, due_date, subtotal, tax_rate, tax_amount, total,
    currency, exchange_rate, total_lps, notes, motivo, parent_invoice_id,
    created_by, cai, rango_desde, rango_hasta, fecha_limite_emision,
    lugar_emision, point_of_sale, es_exonerado, orden_compra_exenta,
    no_constancia_exonerado, no_registro_sag, isv_18_rate,
    isv_18_amount, importe_exento, importe_exonerado
  ) values (
    v_tenant_id, v_invoice_number, v_invoice_type, 'Borrador',
    v_quotation_id, v_client.id,
    v_client.nombre, v_client.rtn, v_client.direccion, v_client.email_1,
    v_issue_date, v_due_date, v_subtotal, 15, v_tax_total, v_total,
    v_currency, v_exchange_rate,
    case when v_currency = 'USD' then round(v_total * v_exchange_rate, 2) else null end,
    nullif(p_invoice->>'notes', ''), nullif(p_invoice->>'motivo', ''),
    nullif(p_invoice->>'parent_invoice_id', '')::uuid, v_user_id,
    case when v_is_fiscal then v_cai.cai else null end,
    case when v_is_fiscal then v_cai.rango_desde else null end,
    case when v_is_fiscal then v_cai.rango_hasta else null end,
    case when v_is_fiscal then v_cai.fecha_limite_emision else null end,
    case when v_is_fiscal then v_cai.lugar_emision else null end,
    v_point_of_sale,
    coalesce((p_invoice->>'es_exonerado')::boolean, false),
    nullif(p_invoice->>'orden_compra_exenta', ''),
    nullif(p_invoice->>'no_constancia_exonerado', ''),
    nullif(p_invoice->>'no_registro_sag', ''),
    case when v_taxable_18 > 0 then 18 else 0 end,
    v_tax_18, v_exempt, 0
  ) returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(v_item->>'description');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_rate := (v_item->>'isv_rate')::numeric;
    v_discount := coalesce((v_item->>'discount_amount')::numeric,0);
    if v_discount::text in ('NaN','Infinity','-Infinity') or v_discount<0 or v_discount<>round(v_discount,2) or v_discount>round(v_quantity*v_unit_price,2) then raise exception 'El descuento de línea debe estar entre cero y su importe bruto, con dos decimales';end if;
    v_line_amount := round(v_quantity * v_unit_price, 2)-v_discount;

    insert into public.invoice_items (
      tenant_id, invoice_id, description, quantity, unit_price, amount,
      sort_order, isv_rate, tax_amount, discount_amount
    ) values (
      v_tenant_id, v_invoice_id, v_description, v_quantity, v_unit_price,
      v_line_amount, coalesce((v_item->>'sort_order')::integer, 0),
      v_rate, round(v_line_amount * v_rate / 100, 2), v_discount
    );
  end loop;

  return query select v_invoice_id, v_invoice_number;
end;
$$;



create or replace function public.create_invoice_fiscal_base(p_invoice jsonb,p_items jsonb)
returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare
  result record; item jsonb; items jsonb := '[]'; treatment text; mode text := coalesce(p_invoice->>'fiscal_mode',case when (p_invoice->>'es_exonerado')::boolean then 'Exonerada' else 'Mixta' end);
  exempt numeric:=0; exonerated numeric:=0; taxable numeric:=0; amount numeric; rate numeric;
  conversion jsonb:=p_invoice->'conversion'; equivalent jsonb:=p_invoice->'reference_equivalence';
  conversion_rate numeric; equivalent_rate numeric; total_value numeric; docs jsonb:=coalesce(p_invoice->'exoneration_documents','[]'); doc jsonb;
  seq integer:=0; classification text; discount numeric; discounts numeric:=0;
begin
  if auth.uid() is null or public.current_tenant_id() is null or not public.can_manage_finance() then
    raise exception 'Sin permiso para facturar' using errcode='42501'; end if;
  if mode not in ('Gravada','Mixta','Exenta','Exonerada') then raise exception 'Tratamiento fiscal inválido'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Agrega entre 1 y 500 líneas'; end if;
  if conversion is not null and conversion <> 'null'::jsonb then
    conversion_rate := (conversion->>'rate')::numeric;
    if conversion_rate is null or conversion_rate<=0 or conversion_rate>1000000
      or conversion->>'operation' not in ('multiply','divide')
      or conversion->>'operation' is null
      or conversion->>'source_currency' not in ('USD','HNL')
      or conversion->>'source_currency' is null
      or conversion->>'source_currency'=p_invoice->>'currency' then raise exception 'Conversión inválida'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    treatment:=case when mode in ('Exenta','Exonerada') then mode else
      coalesce(item->>'tax_treatment',case when coalesce((item->>'isv_rate')::numeric,0)>0 then 'Gravada' else 'Exenta' end) end;
    if treatment not in ('Gravada','Exenta','Exonerada') then raise exception 'Tratamiento de línea inválido'; end if;
    rate:=case when treatment='Gravada' then (item->>'isv_rate')::numeric else 0 end;
    if rate is null or (treatment='Gravada' and rate not in (15,18)) then raise exception 'Tasa de línea inválida'; end if;
    discount:=coalesce((item->>'discount_amount')::numeric,(p_invoice->'line_discounts'->>(item->>'source_pricing_item_id'))::numeric,0);
    if discount::text in ('NaN','Infinity','-Infinity') or discount<0 or discount<>round(discount,2) or discount>round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2) then raise exception 'Descuento inválido';end if;
    if conversion_rate is not null then
      discount:=round(case when conversion->>'operation'='multiply' then discount*conversion_rate else discount/conversion_rate end,2);
      item:=item || jsonb_build_object('unit_price',round(case when conversion->>'operation'='multiply'
        then (item->>'unit_price')::numeric*conversion_rate else (item->>'unit_price')::numeric/conversion_rate end,2));
    end if;
    item:=item||jsonb_build_object('discount_amount',discount);
    amount:=round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2)-discount;
    discounts:=discounts+discount;
    if treatment='Exenta' then exempt:=exempt+amount;
    elsif treatment='Exonerada' then exonerated:=exonerated+amount;
    else taxable:=taxable+amount; end if;
    items:=items || jsonb_build_array(item || jsonb_build_object('isv_rate',rate,'tax_treatment',treatment,'sort_order',seq));
    seq:=seq+1;
  end loop;
  if exonerated>0 and p_invoice->>'invoice_type'<>'Proforma' then
    if nullif(btrim(p_invoice->>'orden_compra_exenta'),'') is null
      or (nullif(btrim(p_invoice->>'no_constancia_exonerado'),'') is null and nullif(btrim(p_invoice->>'no_registro_sag'),'') is null) then
      raise exception 'Completa OCE y constancia de registro o SAG según corresponda';
    end if;
    if jsonb_typeof(docs) is distinct from 'array' or jsonb_array_length(docs) not between 1 and 10 then raise exception 'Adjunta el respaldo de exoneración'; end if;
    for doc in select value from jsonb_array_elements(docs) loop
      if not exists(select 1 from storage.objects where bucket_id='fiscal-support' and name=doc->>'path'
        and (storage.foldername(name))[1]=public.current_tenant_id()::text) then raise exception 'Respaldo de exoneración inexistente o ajeno'; end if;
    end loop;
  end if;
  classification:=case when (case when exempt>0 then 1 else 0 end)+(case when exonerated>0 then 1 else 0 end)+(case when taxable>0 then 1 else 0 end)>1 then 'Mixta'
    when exonerated>0 then 'Exonerada' when taxable>0 then 'Gravada' else 'Exenta' end;
  if mode='Gravada' and classification<>'Gravada' then raise exception 'La clasificación Gravada no coincide con las líneas'; end if;
  select * into result from public.create_invoice_office_base(p_invoice,items);
  select total into total_value from public.invoices where id=result.invoice_id;
  if equivalent is not null and equivalent<>'null'::jsonb then
    equivalent_rate:=(equivalent->>'rate')::numeric;
    if equivalent_rate is null or equivalent_rate<=0 or equivalent_rate>1000000
      or equivalent->>'operation' is null or equivalent->>'operation' not in ('multiply','divide')
      or equivalent->>'currency' is null or equivalent->>'currency' not in ('HNL','USD','EUR','GBP','CAD','MXN','GTQ','CRC')
      or equivalent->>'currency'=p_invoice->>'currency' then raise exception 'Equivalencia inválida'; end if;
    equivalent:=jsonb_build_object('currency',equivalent->>'currency','rate',equivalent_rate,'operation',equivalent->>'operation',
      'amount',round(case when equivalent->>'operation'='multiply' then total_value*equivalent_rate else total_value/equivalent_rate end,2));
  else equivalent:=null; end if;
  update public.invoices set discount_amount=discounts,importe_exento=exempt,importe_exonerado=exonerated,es_exonerado=(exonerated>0),fiscal_mode=classification,
    reference_equivalence=equivalent, conversion_snapshot=case when conversion_rate is not null then jsonb_build_object('source_currency',conversion->>'source_currency',
      'target_currency',p_invoice->>'currency','rate',conversion_rate,'operation',conversion->>'operation','source_items',p_items) else null end,
    exoneration_documents=docs where id=result.invoice_id;
  update public.invoice_items i set tax_treatment=line.value->>'tax_treatment'
    from jsonb_array_elements(items) line where i.invoice_id=result.invoice_id and i.sort_order=(line.value->>'sort_order')::integer;
  return query select result.invoice_id::uuid,result.invoice_number::text;
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
    'isv_rate',isv_rate,'tax_treatment',tax_treatment,'income_account_id',income_account_id,'discount_amount',discount_amount) order by sort_order,id) into items from public.invoice_items where invoice_id=source.id;
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
  if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.kind in ('Activo','Gasto') and a.active and a.postable) then raise exception 'Selecciona una cuenta de activo o gasto para cada línea';end if;
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
