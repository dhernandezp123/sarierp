-- FIN-02: cálculo fiscal explícito, equivalencia y proforma vinculada.
alter table public.invoice_items add column tax_treatment text
  check(tax_treatment in ('Gravada','Exenta','Exonerada'));
alter table public.invoices
  add column fiscal_mode text check(fiscal_mode in ('Gravada','Mixta','Exenta','Exonerada')),
  add column reference_equivalence jsonb,
  add column conversion_snapshot jsonb,
  add column exoneration_documents jsonb not null default '[]',
  add column source_proforma_id uuid,
  add column converted_invoice_id uuid;
alter table public.invoices add constraint invoices_source_proforma_fk
  foreign key(tenant_id,source_proforma_id) references public.invoices(tenant_id,id);
alter table public.invoices add constraint invoices_converted_invoice_fk
  foreign key(tenant_id,converted_invoice_id) references public.invoices(tenant_id,id);
create unique index invoices_source_proforma_unique on public.invoices(source_proforma_id) where source_proforma_id is not null;
alter table public.invoice_payments add column original_proforma_id uuid references public.invoices(id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fiscal-support','fiscal-support',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy fiscal_support_read on storage.objects for select to authenticated
using(bucket_id='fiscal-support' and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.can_manage_finance());
create policy fiscal_support_insert on storage.objects for insert to authenticated
with check(bucket_id='fiscal-support' and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.can_manage_finance());
-- Evidencia no se sobreescribe ni se borra desde cliente.

alter function public.create_invoice_with_items_trusted(jsonb,jsonb) rename to create_invoice_office_base;
revoke all on function public.create_invoice_office_base(jsonb,jsonb) from public,anon,authenticated;

create function public.create_invoice_with_items_trusted(p_invoice jsonb,p_items jsonb)
returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare
  result record; item jsonb; items jsonb := '[]'; treatment text; mode text := coalesce(p_invoice->>'fiscal_mode',case when (p_invoice->>'es_exonerado')::boolean then 'Exonerada' else 'Mixta' end);
  exempt numeric:=0; exonerated numeric:=0; taxable numeric:=0; amount numeric; rate numeric;
  conversion jsonb:=p_invoice->'conversion'; equivalent jsonb:=p_invoice->'reference_equivalence';
  conversion_rate numeric; equivalent_rate numeric; total_value numeric; docs jsonb:=coalesce(p_invoice->'exoneration_documents','[]'); doc jsonb;
  seq integer:=0; classification text;
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
    if conversion_rate is not null then
      item:=item || jsonb_build_object('unit_price',round(case when conversion->>'operation'='multiply'
        then (item->>'unit_price')::numeric*conversion_rate else (item->>'unit_price')::numeric/conversion_rate end,2));
    end if;
    amount:=round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2);
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
  update public.invoices set importe_exento=exempt,importe_exonerado=exonerated,es_exonerado=(exonerated>0),fiscal_mode=classification,
    reference_equivalence=equivalent, conversion_snapshot=case when conversion_rate is not null then jsonb_build_object('source_currency',conversion->>'source_currency',
      'target_currency',p_invoice->>'currency','rate',conversion_rate,'operation',conversion->>'operation','source_items',p_items) else null end,
    exoneration_documents=docs where id=result.invoice_id;
  update public.invoice_items i set tax_treatment=line.value->>'tax_treatment'
    from jsonb_array_elements(items) line where i.invoice_id=result.invoice_id and i.sort_order=(line.value->>'sort_order')::integer;
  return query select result.invoice_id::uuid,result.invoice_number::text;
end $$;
revoke all on function public.create_invoice_with_items_trusted(jsonb,jsonb) from public,anon,authenticated;

create function public.convert_proforma_to_invoice(p_proforma_id uuid,p_invoice jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.invoices%rowtype; result record; items jsonb; paid numeric; final_total numeric;
begin
  if auth.uid() is null or not public.can_manage_finance() then raise exception 'Sin permiso' using errcode='42501'; end if;
  select * into source from public.invoices where id=p_proforma_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
  if not found or source.invoice_type<>'Proforma' or source.status='Anulada' then raise exception 'Proforma no disponible'; end if;
  if source.converted_invoice_id is not null then return source.converted_invoice_id; end if;
  select jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_price',unit_price,
    'isv_rate',isv_rate,'tax_treatment',tax_treatment) order by sort_order,id) into items from public.invoice_items where invoice_id=source.id;
  select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=source.id and status='Aplicado';
  select * into result from public.create_invoice_with_items_trusted(p_invoice || jsonb_build_object(
    'invoice_type','Factura','cliente_id',source.cliente_id,'currency',source.currency,'exchange_rate',source.exchange_rate,
    'issue_date',current_date,'notes',source.notes),items);
  select total into final_total from public.invoices where id=result.invoice_id;
  if paid>final_total then raise exception 'El anticipo supera la factura final; concilia el remanente antes de convertir'; end if;
  update public.invoices set source_proforma_id=source.id where id=result.invoice_id;
  update public.invoice_payments set original_proforma_id=source.id,invoice_id=result.invoice_id
    where invoice_id=source.id and status='Aplicado';
  if paid>0 then update public.invoices set status=case when paid=final_total then 'Pagada' else 'Parcialmente Pagada' end where id=result.invoice_id; end if;
  update public.invoices set converted_invoice_id=result.invoice_id where id=source.id;
  return result.invoice_id;
end $$;
revoke all on function public.convert_proforma_to_invoice(uuid,jsonb) from public,anon;
grant execute on function public.convert_proforma_to_invoice(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
-- Solo las RPC autorizadas escriben importes y vínculos; las pantallas conservan
-- actualización de estado/comentarios, pero no pueden adulterar el documento.
revoke insert,delete on public.invoices from authenticated;
revoke insert,update,delete on public.invoice_items from authenticated;
revoke all on function public.create_invoice_with_items(jsonb,jsonb) from authenticated;
create function public.guard_invoice_financial_snapshot()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user='authenticated' and (
    (to_jsonb(new) - array['status','notes','paid_date','payment_method','payment_reference','updated_at'])
    is distinct from (to_jsonb(old) - array['status','notes','paid_date','payment_method','payment_reference','updated_at'])
  ) then raise exception 'Los importes y vínculos fiscales solo cambian mediante el flujo autorizado'; end if;
  if old.converted_invoice_id is not null and current_user='authenticated' then
    raise exception 'La proforma convertida conserva su historial; utiliza la factura final';
  end if;
  return new;
end $$;
create trigger guard_invoice_financial_snapshot before update on public.invoices
for each row execute function public.guard_invoice_financial_snapshot();
revoke all on function public.guard_invoice_financial_snapshot() from public,anon,authenticated;

create function public.guard_payment_converted_proforma()
returns trigger language plpgsql set search_path=public as $$
begin
  perform 1 from public.invoices where id=new.invoice_id and tenant_id=new.tenant_id for update;
  if exists(select 1 from public.invoices where id=new.invoice_id and converted_invoice_id is not null) then
    raise exception 'La proforma ya se convirtió; registra el pago en la factura final';
  end if;
  return new;
end $$;
create trigger zz_payment_converted_proforma before insert on public.invoice_payments
for each row execute function public.guard_payment_converted_proforma();
revoke all on function public.guard_payment_converted_proforma() from public,anon,authenticated;

create or replace function public.create_invoice_from_quotation_tenant_internal(
  p_invoice jsonb,
  p_quotation_id uuid
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.quotations%rowtype;
  v_items jsonb;
  v_invoice_id uuid;
  v_invoice_number text;
  v_currency text;
begin
  if auth.uid() is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  if p_invoice->>'invoice_type' is distinct from 'Factura' then
    raise exception 'La vinculacion de cotizacion solo aplica a Facturas';
  end if;

  select * into v_quotation
  from public.quotations
  where id = p_quotation_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'La cotizacion no existe o fue eliminada';
  end if;
  if v_quotation.status is distinct from 'Ganada' then
    raise exception 'La cotizacion debe estar Ganada antes de facturar';
  end if;
  if v_quotation.financial_validation_status is distinct from 'Validado' then
    raise exception 'Los costos de la cotizacion deben estar validados antes de facturar';
  end if;
  if nullif(p_invoice->>'cliente_id', '')::uuid is distinct from v_quotation.cliente_id then
    raise exception 'El cliente de la factura no coincide con la cotizacion';
  end if;
  if exists (
    select 1
    from public.invoices i
    where i.quotation_id = p_quotation_id
      and i.invoice_type = 'Factura'
      and i.status <> 'Anulada'
      and i.deleted_at is null
  ) then
    raise exception 'La cotizacion ya tiene una factura activa';
  end if;
  if exists (
    select 1
    from public.pricing_items pi
    where pi.quotation_id = p_quotation_id
      and pi.deleted_at is null
      and (
        nullif(btrim(pi.description), '') is null
        or coalesce(pi.quantity, 0) <= 0
        or coalesce(pi.sale_amount, -1) < 0
        or (case when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) else 0 end)
          not in (0, 15, 18)
      )
  ) then
    raise exception 'La cotizacion contiene lineas no facturables; revisa cantidad, precio e ISV';
  end if;

  select
    case when count(distinct coalesce(nullif(currency, ''), 'USD')) = 1
      then min(coalesce(nullif(currency, ''), 'USD'))
      else null
    end,
    jsonb_agg(
      jsonb_build_object(
        'source_pricing_item_id', source_pricing_item_id,
        'description', description,
        'quantity', quantity,
        'unit_price', unit_price,
        'isv_rate', isv_rate,
        'sort_order', sort_order
      ) order by sort_order
    )
  into v_currency, v_items
  from (
    select
      pi.id as source_pricing_item_id,
      pi.description,
      pi.quantity,
      pi.sale_amount as unit_price,
      case when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) else 0 end as isv_rate,
      row_number() over (order by pi.created_at, pi.id)::integer - 1 as sort_order,
      pi.currency
    from public.pricing_items pi
    where pi.quotation_id = p_quotation_id
      and pi.deleted_at is null
  ) source_lines;

  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'La cotizacion no tiene lineas comerciales para facturar';
  end if;
  if v_currency is null or v_currency not in ('USD', 'HNL') then
    raise exception 'Todas las lineas de la cotizacion deben usar una sola moneda valida';
  end if;
  if coalesce(nullif(p_invoice->>'currency', ''), 'USD') is distinct from v_currency
    or (p_invoice->'conversion' is not null and p_invoice->'conversion' <> 'null'::jsonb) then
    if p_invoice->'conversion'->>'source_currency' is distinct from v_currency then
      raise exception 'Confirma la moneda original y la conversión de la cotización';
    end if;
  end if;

  select created.invoice_id, created.invoice_number
  into v_invoice_id, v_invoice_number
  from public.create_invoice_with_items(
    p_invoice || jsonb_build_object('quotation_id', p_quotation_id),
    v_items
  ) created;

  update public.invoice_items ii
  set source_pricing_item_id = (line.value->>'source_pricing_item_id')::uuid
  from jsonb_array_elements(v_items) line(value)
  where ii.invoice_id = v_invoice_id
    and ii.sort_order = (line.value->>'sort_order')::integer;

  return query select v_invoice_id, v_invoice_number;
end;
$$;


create or replace function public.register_invoice_payment_v2(
  p_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_invoice_fiscal_type text,
  p_point_of_sale text,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null,
  p_payment_splits jsonb default '[]'::jsonb
)
returns table (
  payment_id uuid,
  invoice_status text,
  paid_total numeric,
  pending_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.invoices invoice
    where invoice.id = p_invoice_id
      and invoice.tenant_id = v_tenant_id
      and invoice.deleted_at is null
  ) then
    raise exception 'El documento no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  perform 1 from public.invoices where id=p_invoice_id and tenant_id=v_tenant_id for update;
  if exists(select 1 from public.invoices where id=p_invoice_id and converted_invoice_id is not null) then
    raise exception 'La proforma ya se convirtió; registra el pago en la factura final';
  end if;

  if not exists (
    select 1 from public.invoices invoice
    where invoice.id = p_invoice_id
      and invoice.tenant_id = v_tenant_id
      and btrim(p_point_of_sale) = btrim(coalesce(invoice.lugar_emision, ''))
    union all
    select 1 from public.cai_ranges cai
    where cai.tenant_id = v_tenant_id
      and cai.is_active
      and nullif(btrim(coalesce(cai.lugar_emision, '')), '') is not null
      and btrim(cai.lugar_emision) = btrim(p_point_of_sale)
    union all
    select 1 from public.company_settings settings
    where settings.tenant_id = v_tenant_id
      and btrim(p_point_of_sale) in (
        btrim(coalesce(settings.lugar_emision_defecto, '')),
        btrim(coalesce(settings.city, ''))
      )
  ) then
    raise exception 'El punto de venta no pertenece a una ciudad configurada';
  end if;

  return query
  select result.payment_id, result.invoice_status,
    result.paid_total, result.pending_balance
  from public.register_invoice_payment_v2_tenant_internal(
    p_invoice_id, p_amount, p_currency, p_payment_date,
    p_invoice_fiscal_type, p_point_of_sale, p_payment_method,
    p_reference, p_notes, p_payment_splits
  ) result;
end;
$$;
