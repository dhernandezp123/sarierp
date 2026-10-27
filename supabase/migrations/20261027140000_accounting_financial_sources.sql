-- Etapa 5: cobros, aplicaciones y pagos en el mismo motor contable.
alter table public.customer_receipts add column exchange_rate numeric(18,6) check(exchange_rate>0 and exchange_rate<=1000000);
alter table public.invoice_payments add column accounting_cash_base numeric(14,2),add column accounting_receivable_base numeric(14,2);

create function public.receipt_exchange_rate() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.currency='HNL' then new.exchange_rate:=1;
 elsif new.origin_payment_id is not null then
  select i.exchange_rate into new.exchange_rate from public.invoice_payments p join public.invoices i on i.id=p.invoice_id and i.tenant_id=p.tenant_id where p.id=new.origin_payment_id and p.tenant_id=new.tenant_id;
 end if;
 if new.exchange_rate is null or new.exchange_rate<=0 or new.exchange_rate>1000000 then raise exception 'Indica el tipo de cambio HNL por USD del recibo'; end if;
 return new;
end $$;
create trigger receipt_exchange_rate before insert on public.customer_receipts for each row execute function public.receipt_exchange_rate();

alter function public.register_customer_receipt(uuid,uuid,numeric,text,date,text,text,text,jsonb) rename to register_customer_receipt_legacy_internal;
revoke all on function public.register_customer_receipt_legacy_internal(uuid,uuid,numeric,text,date,text,text,text,jsonb) from public,anon,authenticated;

create function public.accounting_active_for(p_date date) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.accounting_settings where tenant_id=public.current_tenant_id() and automatic_posting and p_date>=starts_on)
$$;

create function public.post_receipt_cash(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare receipt public.customer_receipts%rowtype; amount numeric;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into receipt from public.customer_receipts where id=p_receipt_id and tenant_id=public.current_tenant_id();
 if not found or receipt.status<>'Aplicado' then raise exception 'Recibo no disponible'; end if;
 if receipt.origin_payment_id is not null then return null;end if;
 if receipt.exchange_rate is null then raise exception 'El recibo requiere tipo de cambio antes de contabilizar';end if;
 amount:=round(receipt.amount*receipt.exchange_rate,2);
 return public.post_journal_internal(receipt.payment_date,'Cobro '||receipt.receipt_number,'Recibo',receipt.id,'receipt:'||receipt.id||':cash',
   jsonb_build_array(jsonb_build_object('account_id',public.account_for('cash'),'debit',amount),jsonb_build_object('account_id',public.account_for('customer_advances'),'credit',amount)),
   receipt.currency,receipt.exchange_rate,receipt.amount);
end $$;

create function public.capture_receipt_accounting() returns trigger language plpgsql security definer set search_path=public as $$
declare entry_id uuid;
begin
 if tg_op='INSERT' and new.status='Aplicado' and public.accounting_active_for(new.payment_date) then perform public.post_receipt_cash(new.id);
 elsif tg_op='UPDATE' and old.status='Aplicado' and new.status='Reversado' then
  select id into entry_id from public.journal_entries where tenant_id=new.tenant_id and source_key=case when new.origin_payment_id is null then 'receipt:'||new.id||':cash' else 'payment:'||new.origin_payment_id||':cash' end;
  if entry_id is not null then perform public.reverse_journal_internal(entry_id,new.reversed_at::date,new.reversal_reason);end if;
 end if;
 return new;
end $$;
create trigger capture_receipt_accounting after insert or update of status on public.customer_receipts for each row execute function public.capture_receipt_accounting();

create function public.post_customer_payment_journal(p_payment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payment public.invoice_payments%rowtype;invoice public.invoices%rowtype;receipt public.customer_receipts%rowtype;
 cash_base numeric;ar_base numeric;rate numeric;lines jsonb;purpose text;source_key text;entry_date date;difference numeric;applied_before numeric;cash_before numeric;ar_before numeric;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into payment from public.invoice_payments where id=p_payment_id and tenant_id=public.current_tenant_id();
 if not found or payment.status<>'Aplicado' then raise exception 'Pago no disponible'; end if;
 select * into invoice from public.invoices where id=payment.invoice_id and tenant_id=payment.tenant_id;
 if payment.receipt_id is not null then
  if invoice.invoice_type='Proforma' then return null;end if;
  select * into receipt from public.customer_receipts where id=payment.receipt_id;
  rate:=receipt.exchange_rate;purpose:='customer_advances';source_key:='payment:'||payment.id||':allocation';entry_date:=greatest(payment.payment_date,invoice.issue_date,payment.created_at::date);
 elsif payment.original_proforma_id is not null then
  rate:=invoice.exchange_rate;purpose:='customer_advances';source_key:='payment:'||payment.id||':allocation';entry_date:=invoice.issue_date;
 else
  rate:=case when invoice.currency='HNL' then 1 else invoice.exchange_rate end;purpose:='cash';source_key:='payment:'||payment.id||':cash';entry_date:=payment.payment_date;
 end if;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Falta tipo de cambio del cobro'; end if;
 cash_base:=round(payment.amount*rate,2);
 ar_base:=round(payment.amount*case when invoice.currency='HNL' then 1 else invoice.exchange_rate end,2);
 if payment.receipt_id is not null then
  select coalesce(sum(p.amount),0),coalesce(sum(p.accounting_cash_base),0) into applied_before,cash_before from public.invoice_payments p
   where p.receipt_id=receipt.id and p.id<>payment.id and p.status='Aplicado' and p.accounting_cash_base is not null;
  if applied_before+payment.amount=receipt.amount then cash_base:=round(receipt.amount*rate,2)-cash_before;end if;
 end if;
 select coalesce(sum(p.amount),0),coalesce(sum(p.accounting_receivable_base),0) into applied_before,ar_before from public.invoice_payments p
   where p.invoice_id=invoice.id and p.id<>payment.id and p.status='Aplicado' and p.accounting_receivable_base is not null;
 if invoice.invoice_type='Factura' and applied_before+payment.amount=public.invoice_adjusted_total(invoice.id) then
  ar_base:=round(public.invoice_adjusted_total(invoice.id)*case when invoice.currency='HNL' then 1 else invoice.exchange_rate end,2)-ar_before;
 end if;
 if invoice.invoice_type='Proforma' then ar_base:=cash_base;end if;
 lines:=jsonb_build_array(jsonb_build_object('account_id',public.account_for(purpose),'debit',cash_base),
   jsonb_build_object('account_id',public.account_for(case when invoice.invoice_type='Proforma' then 'customer_advances' else 'receivable' end),'credit',ar_base));
 difference:=cash_base-ar_base;
 if difference>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('exchange_gain'),'credit',difference));
 elsif difference<0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('exchange_loss'),'debit',-difference));end if;
 update public.invoice_payments set accounting_cash_base=cash_base,accounting_receivable_base=case when invoice.invoice_type='Factura' then ar_base else null end where id=payment.id;
 return public.post_journal_internal(entry_date,'Pago / aplicación de '||invoice.invoice_number,'Pago recibido',payment.id,source_key,lines,payment.currency,rate,payment.amount);
end $$;

create function public.capture_payment_accounting() returns trigger language plpgsql security definer set search_path=public as $$
declare entry record;
begin
 if new.status='Aplicado' and public.accounting_active_for(greatest(new.payment_date,case when tg_op='UPDATE' then current_date else new.payment_date end)) then
  if tg_op='INSERT' or new.invoice_id is distinct from old.invoice_id then perform public.post_customer_payment_journal(new.id);end if;
 elsif tg_op='UPDATE' and old.status='Aplicado' and new.status='Reversado' then
  for entry in select id from public.journal_entries where tenant_id=new.tenant_id and
    (source_key='payment:'||new.id||':allocation' or (new.receipt_id is null and source_key='payment:'||new.id||':cash')) loop
   perform public.reverse_journal_internal(entry.id,new.reversed_at::date,new.reversal_reason);
  end loop;
 end if;
 return new;
end $$;
create trigger capture_payment_accounting after insert or update of status,invoice_id on public.invoice_payments for each row execute function public.capture_payment_accounting();

alter table public.cuentas_pagar add column expense_account_id uuid,
 add constraint payable_expense_account_fk foreign key(tenant_id,expense_account_id) references public.accounting_accounts(tenant_id,id);
create function public.post_supplier_payable_journal(p_payable_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payable public.cuentas_pagar%rowtype;amount numeric;rate numeric;is_credit boolean;expense uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into payable from public.cuentas_pagar where id=p_payable_id and tenant_id=public.current_tenant_id();
 if not found or payable.status='Anulada' or payable.fecha_factura is null then raise exception 'La compra requiere documento activo y fecha';end if;
 rate:=case when payable.moneda='HNL' then 1 else payable.tipo_cambio end;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Registra el tipo de cambio de la compra en USD';end if;
 amount:=round(payable.monto*rate,2);is_credit:=payable.tipo='NC';expense:=coalesce(payable.expense_account_id,public.account_for('purchases'));
 return public.post_journal_internal(payable.fecha_factura,'Compra '||coalesce(payable.numero_factura_proveedor,payable.descripcion),'Compra',payable.id,'payable:'||payable.id,
   jsonb_build_array(jsonb_build_object('account_id',expense,'debit',case when is_credit then 0 else amount end,'credit',case when is_credit then amount else 0 end),
   jsonb_build_object('account_id',public.account_for('payable'),'debit',case when is_credit then amount else 0 end,'credit',case when is_credit then 0 else amount end)),payable.moneda,rate,payable.monto);
end $$;

create function public.capture_payable_accounting() returns trigger language plpgsql security definer set search_path=public as $$
declare entry_id uuid;
begin
 select id into entry_id from public.journal_entries where tenant_id=new.tenant_id and source_key='payable:'||new.id;
 if tg_op='UPDATE' and entry_id is not null and
  (new.monto,new.moneda,new.tipo_cambio,new.expense_account_id,new.fecha_factura,new.proveedor_id) is distinct from (old.monto,old.moneda,old.tipo_cambio,old.expense_account_id,old.fecha_factura,old.proveedor_id) then
   raise exception 'La compra contabilizada es inmutable; anula y registra la corrección';end if;
 if new.status='Anulada' then
  if entry_id is not null then perform public.reverse_journal_internal(entry_id,new.cancelled_at::date,new.cancellation_reason);end if;
 elsif public.accounting_active_for(new.fecha_factura) then perform public.post_supplier_payable_journal(new.id);end if;
 return new;
end $$;
create trigger capture_payable_accounting after insert or update on public.cuentas_pagar for each row execute function public.capture_payable_accounting();

create function public.post_supplier_payment_journal(p_payment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
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
  jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'debit',amount),jsonb_build_object('account_id',public.account_for('cash'),'credit',amount)),payment.moneda,rate,payment.monto);
end $$;
create function public.capture_supplier_payment_accounting() returns trigger language plpgsql security definer set search_path=public as $$
declare entry_id uuid;
begin
 if tg_op='INSERT' and public.accounting_active_for(new.fecha_pago) then perform public.post_supplier_payment_journal(new.id);
 elsif tg_op='UPDATE' and old.status='Aplicado' and new.status='Reversado' then
  select id into entry_id from public.journal_entries where tenant_id=new.tenant_id and source_key='supplier-payment:'||new.id;
  if entry_id is not null then perform public.reverse_journal_internal(entry_id,new.reversed_at::date,new.reversal_reason);end if;
 end if;
 return new;
end $$;
create trigger capture_supplier_payment_accounting after insert or update of status on public.pagos_proveedor for each row execute function public.capture_supplier_payment_accounting();

revoke all on function public.receipt_exchange_rate(),public.accounting_active_for(date),public.post_receipt_cash(uuid),public.capture_receipt_accounting(),
 public.post_customer_payment_journal(uuid),public.capture_payment_accounting(),public.post_supplier_payable_journal(uuid),public.capture_payable_accounting(),
 public.post_supplier_payment_journal(uuid),public.capture_supplier_payment_accounting() from public,anon,authenticated;

create function public.register_customer_receipt(p_request_id uuid,p_cliente_id uuid,p_amount numeric,p_currency text,p_payment_date date,
  p_payment_method text,p_reference text,p_notes text,p_allocations jsonb default '[]',p_exchange_rate numeric default null) returns uuid
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
  insert into public.customer_receipts(tenant_id,cliente_id,request_id,receipt_number,amount,currency,payment_date,payment_method,reference,notes,created_by,exchange_rate)
  values(public.current_tenant_id(),p_cliente_id,p_request_id,'REC-'||lpad(seq::text,8,'0'),p_amount,p_currency,p_payment_date,p_payment_method,coalesce(btrim(p_reference),''),coalesce(p_notes,''),auth.uid(),p_exchange_rate) returning id into receipt_id;
  if jsonb_array_length(p_allocations)>0 then perform public.allocate_customer_receipt(receipt_id,p_request_id,p_allocations); end if;
  return receipt_id;
end $$;
revoke all on function public.register_customer_receipt(uuid,uuid,numeric,text,date,text,text,text,jsonb,numeric) from public,anon;
grant execute on function public.register_customer_receipt(uuid,uuid,numeric,text,date,text,text,text,jsonb,numeric) to authenticated;
notify pgrst,'reload schema';
