-- Etapa 3: recibos, aplicaciones y movimientos históricos. Sin saldos iniciales.
create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  cliente_id uuid not null,
  request_id uuid not null,
  receipt_number text not null,
  amount numeric(14,2) not null check(amount>0),
  currency text not null check(currency in ('HNL','USD')),
  payment_date date not null,
  payment_method text not null check(payment_method in ('Efectivo','Cheque','Deposito','Transferencia','Tarjeta debito','Tarjeta credito','Mixto','Sin especificar')),
  origin_payment_id uuid unique,
  reference text not null default '', notes text not null default '',
  status text not null default 'Aplicado' check(status in ('Aplicado','Reversado')),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  reversed_at timestamptz, reversed_by uuid references auth.users(id), reversal_reason text,
  unique(tenant_id,id), unique(tenant_id,request_id), unique(tenant_id,receipt_number),
  foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),
  foreign key(tenant_id,origin_payment_id) references public.invoice_payments(tenant_id,id)
);
alter table public.invoice_payments
  add column receipt_id uuid,
  add column applied_document_id uuid,
  add column allocation_request_id uuid,
  add constraint invoice_payments_receipt_fk foreign key(tenant_id,receipt_id) references public.customer_receipts(tenant_id,id),
  add constraint invoice_payments_document_fk foreign key(tenant_id,applied_document_id) references public.invoices(tenant_id,id);
create unique index invoice_payments_allocation_request on public.invoice_payments(receipt_id,allocation_request_id,applied_document_id) where receipt_id is not null;
create index invoice_payments_receipt_idx on public.invoice_payments(receipt_id);

create table public.customer_movements (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  cliente_id uuid not null, movement_date date not null, currency text not null check(currency in ('HNL','USD')),
  kind text not null check(kind in ('Factura','Nota de Crédito','Nota de Débito','Pago','Reverso','Anulación')),
  debit numeric(14,2) not null default 0 check(debit>=0), credit numeric(14,2) not null default 0 check(credit>=0),
  reference text not null, description text not null,
  invoice_id uuid, receipt_id uuid, payment_id uuid,
  event_key text not null, reconstructed boolean not null default false,
  created_at timestamptz not null default now(),
  unique(tenant_id,event_key), check((debit>0 and credit=0) or (credit>0 and debit=0)),
  foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),
  foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),
  foreign key(tenant_id,receipt_id) references public.customer_receipts(tenant_id,id),
  foreign key(tenant_id,payment_id) references public.invoice_payments(tenant_id,id)
);
create index customer_movements_statement_idx on public.customer_movements(tenant_id,cliente_id,currency,movement_date,id);
alter table public.customer_receipts enable row level security;
alter table public.customer_movements enable row level security;
create policy customer_receipts_read on public.customer_receipts for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance());
create policy customer_movements_read on public.customer_movements for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance());
revoke all on public.customer_receipts,public.customer_movements from public,anon,authenticated;
grant select on public.customer_receipts,public.customer_movements to authenticated;

-- NC y pagos generales reducen primero la factura, luego las ND por fecha/id.
-- Los pagos dirigidos a una ND se reservan para ella; la suma siempre coincide
-- con invoice_receivables (la ND no se vuelve a contar como deuda adicional).
create view public.customer_document_balances with(security_invoker=true) as
with roots as (
  select i.*, coalesce((select sum(n.total) from public.invoices n where n.tenant_id=i.tenant_id and n.parent_invoice_id=i.id
    and n.invoice_type='Nota de Crédito' and n.deleted_at is null and n.status not in ('Borrador','Anulada')),0)
    + coalesce((select sum(p.amount) from public.invoice_payments p where p.tenant_id=i.tenant_id and p.invoice_id=i.id and p.status='Aplicado'
    and (p.applied_document_id is null or p.applied_document_id=i.id)),0) as pooled_reduction
  from public.invoices i where i.tenant_id=public.current_tenant_id() and public.can_manage_finance()
    and i.invoice_type in ('Factura','Proforma') and i.converted_invoice_id is null
    and i.deleted_at is null and i.status not in ('Borrador','Anulada')
), documents as (
  select r.id as root_id,r.id,r.tenant_id,r.cliente_id,r.cliente_nombre,r.invoice_type,r.invoice_number,r.currency,r.issue_date,r.due_date,
    r.payment_condition,r.credit_days,r.status,r.total,r.total as net,r.pooled_reduction,0 as priority from roots r
  union all
  select r.id,n.id,n.tenant_id,n.cliente_id,n.cliente_nombre,n.invoice_type,n.invoice_number,n.currency,n.issue_date,r.due_date,
    r.payment_condition,r.credit_days,n.status,n.total,
    n.total-coalesce((select sum(p.amount) from public.invoice_payments p where p.applied_document_id=n.id and p.status='Aplicado' and p.tenant_id=n.tenant_id),0),
    r.pooled_reduction,1 from roots r join public.invoices n on n.parent_invoice_id=r.id and n.tenant_id=r.tenant_id
    where n.invoice_type='Nota de Débito' and n.status not in ('Borrador','Anulada') and n.deleted_at is null
), ordered as (
 select d.*,coalesce(sum(net) over(partition by root_id order by priority,issue_date,id rows between unbounded preceding and 1 preceding),0) as preceding_net from documents d
)
select id,root_id,tenant_id,cliente_id,cliente_nombre,invoice_type,invoice_number,currency,issue_date,due_date,payment_condition,credit_days,status,total,
  greatest(round(net-greatest(pooled_reduction-preceding_net,0),2),0) as balance,
  greatest(current_date-issue_date,0) as days_elapsed,
  case when net>greatest(pooled_reduction-preceding_net,0) then greatest(current_date-due_date,0) else 0 end as days_overdue
from ordered;
revoke all on public.customer_document_balances from public,anon;
grant select on public.customer_document_balances to authenticated;

create view public.customer_receipt_balances with(security_invoker=true) as
select r.*,coalesce(p.applied,0) as applied_amount,
 case when r.status='Aplicado' then r.amount-coalesce(p.applied,0) else 0 end as unapplied_amount
from public.customer_receipts r left join lateral (
 select sum(amount) applied from public.invoice_payments p where p.receipt_id=r.id and p.tenant_id=r.tenant_id and p.status='Aplicado'
) p on true;
revoke all on public.customer_receipt_balances from public,anon;
grant select on public.customer_receipt_balances to authenticated;

create function public.capture_customer_invoice_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare issued boolean; was_issued boolean:=false;
begin
  if new.invoice_type='Proforma' or new.total<=0 then return new; end if;
  issued:=new.status not in ('Borrador','Anulada') and new.deleted_at is null;
  if tg_op='UPDATE' then
    was_issued:=old.status not in ('Borrador','Anulada') and old.deleted_at is null;
    if old.status='Anulada' and issued then raise exception 'No se puede reactivar un documento anulado'; end if;
    if was_issued and new.status='Borrador' then raise exception 'Un documento emitido no puede regresar a borrador'; end if;
  end if;
  if issued and not was_issued then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,credit,reference,description,invoice_id,event_key)
    values(new.tenant_id,new.cliente_id,new.issue_date,new.currency,new.invoice_type,
      case when new.invoice_type='Nota de Crédito' then 0 else new.total end,
      case when new.invoice_type='Nota de Crédito' then new.total else 0 end,
      new.invoice_number,coalesce(new.motivo,new.invoice_type),new.id,'invoice:'||new.id||':issue') on conflict do nothing;
  elsif was_issued and not issued then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,credit,reference,description,invoice_id,event_key)
    values(new.tenant_id,new.cliente_id,current_date,new.currency,'Anulación',
      case when new.invoice_type='Nota de Crédito' then new.total else 0 end,
      case when new.invoice_type='Nota de Crédito' then 0 else new.total end,
      new.invoice_number,'Anulación de '||new.invoice_type,new.id,'invoice:'||new.id||':void') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger capture_customer_invoice_movement after insert or update of status,deleted_at on public.invoices
for each row execute function public.capture_customer_invoice_movement();

create function public.capture_customer_payment_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare inv public.invoices%rowtype;
begin
  if new.receipt_id is not null then return new; end if;
  select * into inv from public.invoices where id=new.invoice_id and tenant_id=new.tenant_id;
  if tg_op='INSERT' and new.status='Aplicado' then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,credit,reference,description,invoice_id,payment_id,event_key)
    values(new.tenant_id,inv.cliente_id,new.payment_date,new.currency,'Pago',new.amount,coalesce(new.reference,inv.invoice_number),
      'Pago de '||inv.invoice_number,inv.id,new.id,'payment:'||new.id||':apply');
  elsif tg_op='UPDATE' and old.status='Aplicado' and new.status='Reversado' then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,reference,description,invoice_id,payment_id,event_key)
    values(new.tenant_id,inv.cliente_id,coalesce(new.reversed_at,now())::date,new.currency,'Reverso',new.amount,coalesce(new.reference,inv.invoice_number),
      coalesce(new.reversal_reason,'Reverso de pago'),inv.id,new.id,'payment:'||new.id||':reverse');
  end if;
  return new;
end $$;
create trigger capture_customer_payment_movement after insert or update of status on public.invoice_payments
for each row execute function public.capture_customer_payment_movement();

create function public.capture_customer_receipt_movement() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' and new.origin_payment_id is null then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,credit,reference,description,receipt_id,event_key)
    values(new.tenant_id,new.cliente_id,new.payment_date,new.currency,'Pago',new.amount,new.receipt_number,'Recibo · '||new.payment_method,new.id,'receipt:'||new.id||':apply');
  elsif tg_op='UPDATE' and old.status='Aplicado' and new.status='Reversado' then
    insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,reference,description,receipt_id,event_key)
    values(new.tenant_id,new.cliente_id,new.reversed_at::date,new.currency,'Reverso',new.amount,new.receipt_number,new.reversal_reason,new.id,'receipt:'||new.id||':reverse');
  end if;
  return new;
end $$;
create trigger capture_customer_receipt_movement after insert or update of status on public.customer_receipts
for each row execute function public.capture_customer_receipt_movement();

create function public.allocate_customer_receipt(p_receipt_id uuid,p_request_id uuid,p_allocations jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare receipt public.customer_receipts%rowtype; doc record; allocation jsonb; applied_amount numeric; allocated numeric; available numeric; root uuid;
begin
  if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into receipt from public.customer_receipts where id=p_receipt_id and tenant_id=public.current_tenant_id() for update;
  if not found or receipt.status<>'Aplicado' then raise exception 'Recibo no disponible'; end if;
  if p_request_id is null or jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 documentos'; end if;
  if exists(select 1 from public.invoice_payments where receipt_id=receipt.id and allocation_request_id=p_request_id) then return receipt.id; end if;
  if (select count(distinct value->>'document_id') from jsonb_array_elements(p_allocations))<>jsonb_array_length(p_allocations) then raise exception 'No repitas documentos'; end if;
  -- Mismo orden de locks para recibos concurrentes. Incluye raíces y notas.
  perform 1 from public.invoices i where i.tenant_id=receipt.tenant_id and (i.id in(select (value->>'document_id')::uuid from jsonb_array_elements(p_allocations))
    or i.id in(select n.parent_invoice_id from public.invoices n where n.id in(select (value->>'document_id')::uuid from jsonb_array_elements(p_allocations)))) order by i.id for update;
  select coalesce(sum(amount),0) into allocated from public.invoice_payments where receipt_id=receipt.id and status='Aplicado';
  available:=receipt.amount-allocated;
  for allocation in select a.value from jsonb_array_elements(p_allocations) a loop
    applied_amount:=(allocation->>'amount')::numeric;
    if applied_amount is null or applied_amount<=0 or applied_amount<>round(applied_amount,2) or applied_amount>available then raise exception 'La aplicación supera el disponible o contiene un importe inválido'; end if;
    select * into doc from public.customer_document_balances d where d.id=(allocation->>'document_id')::uuid and d.tenant_id=receipt.tenant_id;
    if not found or doc.cliente_id<>receipt.cliente_id or doc.currency<>receipt.currency or applied_amount>doc.balance
      or doc.status not in ('Aprobada','Parcialmente Pagada','Vencida','Pagada','Saldada') then raise exception 'Documento incompatible, no aprobado o saldo insuficiente'; end if;
    insert into public.invoice_payments(tenant_id,invoice_id,amount,currency,payment_date,payment_method,reference,notes,created_by,status,
      invoice_fiscal_type,point_of_sale,receipt_id,applied_document_id,allocation_request_id)
    select receipt.tenant_id,doc.root_id,applied_amount,receipt.currency,receipt.payment_date,receipt.payment_method,receipt.reference,receipt.notes,auth.uid(),'Aplicado',
      case when i.invoice_type='Proforma' then 'No aplica' else coalesce(i.fiscal_mode,'Mixta') end,i.point_of_sale,receipt.id,doc.id,p_request_id
    from public.invoices i where i.id=doc.root_id;
    available:=available-applied_amount;
  end loop;
  for root in select distinct invoice_id from public.invoice_payments where receipt_id=receipt.id and allocation_request_id=p_request_id loop
    update public.invoices i set status=case when coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=i.id and p.status='Aplicado'),0)>=public.invoice_adjusted_total(i.id) then 'Pagada' else 'Parcialmente Pagada' end,
      paid_date=case when coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=i.id and p.status='Aplicado'),0)>=public.invoice_adjusted_total(i.id)
        then (select max(p.payment_date) from public.invoice_payments p where p.invoice_id=i.id and p.status='Aplicado') else null end,
      payment_method=receipt.payment_method,payment_reference=receipt.reference,updated_by=auth.uid(),updated_at=now() where i.id=root;
  end loop;
  return receipt.id;
end $$;

create function public.register_customer_receipt(p_request_id uuid,p_cliente_id uuid,p_amount numeric,p_currency text,p_payment_date date,
  p_payment_method text,p_reference text,p_notes text,p_allocations jsonb default '[]') returns uuid
language plpgsql security definer set search_path=public as $$
declare receipt_id uuid; seq bigint;
begin
  if auth.uid() is null or not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'No autorizado' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('receipt:'||public.current_tenant_id()::text,0));
  select id into receipt_id from public.customer_receipts where tenant_id=public.current_tenant_id() and request_id=p_request_id;
  if found then return receipt_id; end if;
  if p_request_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>999999999999.99
    or p_currency is null or p_currency not in ('HNL','USD') or p_payment_date is null or p_payment_date>current_date
    or p_payment_method is null or p_payment_method not in ('Efectivo','Cheque','Deposito','Transferencia','Tarjeta debito','Tarjeta credito')
    or (p_payment_method<>'Efectivo' and nullif(btrim(p_reference),'') is null)
    or coalesce(length(p_reference),0)>200 or coalesce(length(p_notes),0)>2000 then raise exception 'Revisa importe, moneda, fecha y referencia del recibo'; end if;
  if not exists(select 1 from public.clientes where id=p_cliente_id and tenant_id=public.current_tenant_id()) then raise exception 'Cliente no disponible'; end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' then raise exception 'Aplicaciones inválidas'; end if;
  select count(*)+1 into seq from public.customer_receipts where tenant_id=public.current_tenant_id();
  insert into public.customer_receipts(tenant_id,cliente_id,request_id,receipt_number,amount,currency,payment_date,payment_method,reference,notes,created_by)
  values(public.current_tenant_id(),p_cliente_id,p_request_id,'REC-'||lpad(seq::text,8,'0'),p_amount,p_currency,p_payment_date,p_payment_method,coalesce(btrim(p_reference),''),coalesce(p_notes,''),auth.uid()) returning id into receipt_id;
  if jsonb_array_length(p_allocations)>0 then perform public.allocate_customer_receipt(receipt_id,p_request_id,p_allocations); end if;
  return receipt_id;
end $$;

create function public.reverse_customer_receipt(p_receipt_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare receipt public.customer_receipts%rowtype; payment record;
begin
  if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Indica el motivo del reverso'; end if;
  select * into receipt from public.customer_receipts where id=p_receipt_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Recibo no disponible'; end if;
  if receipt.status='Reversado' then return receipt.id; end if;
  perform 1 from public.invoices i where i.id in(select p.invoice_id from public.invoice_payments p where p.receipt_id=receipt.id) order by i.id for update;
  update public.customer_receipts set status='Reversado',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason) where id=receipt.id;
  for payment in select id from public.invoice_payments where receipt_id=receipt.id and status='Aplicado' order by invoice_id,id loop
    perform public.reverse_invoice_payment_tenant_internal(payment.id,p_reason);
  end loop;
  return receipt.id;
end $$;

-- La reversión de un recibo debe ser completa para no dejar encabezado y caja inconsistentes.
create or replace function public.reverse_invoice_payment(p_payment_id uuid,p_reason text)
returns table(payment_id uuid,invoice_status text,paid_total numeric,pending_balance numeric)
language plpgsql security definer set search_path=public as $$
declare payment public.invoice_payments%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into payment from public.invoice_payments where id=p_payment_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Pago no disponible'; end if;
 if payment.receipt_id is not null then raise exception 'Revierte el recibo completo desde Cobranza'; end if;
 return query select * from public.reverse_invoice_payment_tenant_internal(p_payment_id,p_reason);
end $$;

-- Si la exoneración final reduce el total, el exceso de anticipo queda disponible.
-- Se reclasifica la aplicación, no el ingreso de caja original.
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
    'isv_rate',isv_rate,'tax_treatment',tax_treatment) order by sort_order,id) into items from public.invoice_items where invoice_id=source.id;
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

-- Reconstrucción identificada: conserva lo que existe; no inventa anulaciones históricas.
insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,credit,reference,description,invoice_id,event_key,reconstructed)
select tenant_id,cliente_id,issue_date,currency,invoice_type,case when invoice_type='Nota de Crédito' then 0 else total end,
 case when invoice_type='Nota de Crédito' then total else 0 end,invoice_number,invoice_type,id,'invoice:'||id||':issue',true
from public.invoices where invoice_type in ('Factura','Nota de Crédito','Nota de Débito') and status not in ('Borrador','Anulada') and deleted_at is null and total>0 and cliente_id is not null;
insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,credit,reference,description,invoice_id,payment_id,event_key,reconstructed)
select p.tenant_id,i.cliente_id,p.payment_date,p.currency,'Pago',p.amount,coalesce(p.reference,i.invoice_number),'Pago histórico',i.id,p.id,'payment:'||p.id||':apply',true
from public.invoice_payments p join public.invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id where i.cliente_id is not null;
insert into public.customer_movements(tenant_id,cliente_id,movement_date,currency,kind,debit,reference,description,invoice_id,payment_id,event_key,reconstructed)
select p.tenant_id,i.cliente_id,coalesce(p.reversed_at,p.created_at)::date,p.currency,'Reverso',p.amount,coalesce(p.reference,i.invoice_number),'Reverso histórico',i.id,p.id,'payment:'||p.id||':reverse',true
from public.invoice_payments p join public.invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id where i.cliente_id is not null and p.status='Reversado';

revoke all on function public.capture_customer_invoice_movement(),public.capture_customer_payment_movement(),public.capture_customer_receipt_movement() from public,anon,authenticated;
revoke all on function public.allocate_customer_receipt(uuid,uuid,jsonb),public.register_customer_receipt(uuid,uuid,numeric,text,date,text,text,text,jsonb),public.reverse_customer_receipt(uuid,text) from public,anon;
grant execute on function public.allocate_customer_receipt(uuid,uuid,jsonb),public.register_customer_receipt(uuid,uuid,numeric,text,date,text,text,text,jsonb),public.reverse_customer_receipt(uuid,text) to authenticated;
notify pgrst,'reload schema';
