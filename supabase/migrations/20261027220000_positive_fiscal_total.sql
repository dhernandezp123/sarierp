-- El descuento no puede dejar un documento fiscal sin importe contabilizable.
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
  if total_value<=0 then raise exception 'El documento debe tener importe positivo después de descuentos';end if;
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
