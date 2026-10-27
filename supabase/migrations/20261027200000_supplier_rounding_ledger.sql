-- El redondeo se obtiene del diario inmutable, sin alterar el movimiento original.
alter table public.pagos_proveedor drop column accounting_base;
create or replace function public.post_supplier_payment_journal(p_payment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payment public.pagos_proveedor%rowtype;payable public.cuentas_pagar%rowtype;amount numeric;rate numeric;previous_amount numeric;previous_base numeric;adjusted numeric;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into payment from public.pagos_proveedor where id=p_payment_id and tenant_id=public.current_tenant_id();
 if not found or payment.status<>'Aplicado' then raise exception 'Pago no disponible';end if;
 select * into payable from public.cuentas_pagar where id=payment.cuenta_pagar_id;
 rate:=case when payment.moneda='HNL' then 1 else payable.tipo_cambio end;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Configura el tipo de cambio de la compra';end if;
 amount:=round(payment.monto*rate,2);
 select coalesce(sum(p.monto),0),coalesce(sum((select sum(l.debit) from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id)),0) into previous_amount,previous_base from public.pagos_proveedor p
 where p.cuenta_pagar_id=payable.id and p.id<>payment.id and p.status='Aplicado' and exists(select 1 from public.journal_entries e where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id);
 adjusted:=(public.supplier_payable_balance_internal(payable.id)->>'total_adjusted')::numeric;
 if previous_amount+payment.monto=adjusted then amount:=round(adjusted*rate,2)-previous_base;end if;

 return public.post_journal_internal(payment.fecha_pago,'Pago a proveedor: '||coalesce(payment.referencia,payable.descripcion),'Pago realizado',payment.id,'supplier-payment:'||payment.id,
  jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'debit',amount),jsonb_build_object('account_id',public.account_for(case when payment.withholding_document_id is not null then 'withholding_payable' else 'cash' end),'credit',amount)),payment.moneda,rate,payment.monto);
end $$;
