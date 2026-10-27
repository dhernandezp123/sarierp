-- La última cuota absorbe el redondeo acumulado del pago en moneda extranjera.
alter table public.pagos_proveedor add column accounting_base numeric(14,2);
update public.pagos_proveedor p set accounting_base=(select sum(l.debit) from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id)
 where exists(select 1 from public.journal_entries e where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id);
alter table public.journal_entries drop constraint journal_entries_source_currency_check;
alter table public.journal_entries add constraint journal_entries_source_currency_check check(source_currency in ('HNL','USD','EUR','MXN'));
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
 select coalesce(sum(p.monto),0),coalesce(sum(p.accounting_base),0) into previous_amount,previous_base from public.pagos_proveedor p
 where p.cuenta_pagar_id=payable.id and p.id<>payment.id and p.status='Aplicado' and p.accounting_base is not null;
 adjusted:=(public.supplier_payable_balance_internal(payable.id)->>'total_adjusted')::numeric;
 if previous_amount+payment.monto=adjusted then amount:=round(adjusted*rate,2)-previous_base;end if;
 update public.pagos_proveedor set accounting_base=amount where id=payment.id;
 return public.post_journal_internal(payment.fecha_pago,'Pago a proveedor: '||coalesce(payment.referencia,payable.descripcion),'Pago realizado',payment.id,'supplier-payment:'||payment.id,
  jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'debit',amount),jsonb_build_object('account_id',public.account_for(case when payment.withholding_document_id is not null then 'withholding_payable' else 'cash' end),'credit',amount)),payment.moneda,rate,payment.monto);
end $$;
create or replace function public.post_asset_depreciation(p_asset_id uuid,p_month date) returns uuid language plpgsql security definer set search_path=public as $$
declare asset public.fixed_assets%rowtype;existing uuid;months integer;amount numeric;entry_id uuid;record_id uuid:=gen_random_uuid();ending date;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into asset from public.fixed_assets where id=p_asset_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Activo no disponible';end if;
 select id into existing from public.asset_depreciations where asset_id=asset.id and period_month=p_month and status='Contabilizada';if found then return existing;end if;
 if asset.status<>'Activo' or asset.acquisition_line_id is null then raise exception 'Vincula una adquisición contabilizada y activa antes de depreciar';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Selecciona el primer día del mes';end if;
 ending:=(p_month+interval '1 month'-interval '1 day')::date;if ending>current_date then raise exception 'El mes aún no ha terminado';end if;
 select count(*) into months from public.asset_depreciations where asset_id=asset.id and status='Contabilizada';
 if p_month<>(asset.start_month+months*interval '1 month')::date or months>=asset.useful_months then raise exception 'Contabiliza los meses en orden, sin omitir ni repetir';end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 if not exists(select 1 from public.accounting_periods where tenant_id=asset.tenant_id and ending between starts_on and ends_on and not closed) then raise exception 'La fecha no pertenece a un período contable abierto';end if;
 amount:=round((asset.cost-asset.residual)*(months+1)/asset.useful_months,2)-round((asset.cost-asset.residual)*months/asset.useful_months,2);
 if amount>0 then
  entry_id:=public.post_journal_internal(ending,'Depreciación mensual '||asset.code||' · '||asset.name,'Depreciación',asset.id,'depreciation:'||record_id,
   jsonb_build_array(jsonb_build_object('account_id',asset.depreciation_account_id,'debit',amount),jsonb_build_object('account_id',asset.accumulated_account_id,'credit',amount)));
 end if;
 insert into public.asset_depreciations(id,tenant_id,asset_id,period_month,amount,entry_id,created_by) values(record_id,asset.tenant_id,asset.id,p_month,amount,entry_id,auth.uid());
 if months+1=asset.useful_months then update public.fixed_assets set status='Depreciado',updated_at=now() where id=asset.id;end if;
 return record_id;
end $$;

create or replace function public.reverse_asset_depreciation(p_depreciation_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare depreciation public.asset_depreciations%rowtype;asset public.fixed_assets%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into depreciation from public.asset_depreciations where id=p_depreciation_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Depreciación no disponible';end if;
 select * into asset from public.fixed_assets where id=depreciation.asset_id for update;
 select * into depreciation from public.asset_depreciations where id=p_depreciation_id for update;
 if asset.status='Baja' then raise exception 'Activo dado de baja';end if;
 if depreciation.status='Reversada' then return depreciation.id;end if;
 if nullif(btrim(p_reason),'') is null or p_date is null or p_date>current_date or p_date<(depreciation.period_month+interval '1 month'-interval '1 day')::date then raise exception 'Indica fecha y motivo de reverso';end if;
 if exists(select 1 from public.asset_depreciations where asset_id=asset.id and status='Contabilizada' and period_month>depreciation.period_month) then raise exception 'Revierte primero el último mes contabilizado';end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 if not exists(select 1 from public.accounting_periods where tenant_id=asset.tenant_id and p_date between starts_on and ends_on and not closed) then raise exception 'La fecha no pertenece a un período contable abierto';end if;
 if depreciation.entry_id is not null then perform public.reverse_journal_internal(depreciation.entry_id,p_date,p_reason);end if;
 update public.asset_depreciations set status='Reversada',reversal_reason=p_reason,reversed_at=now() where id=depreciation.id;
 update public.fixed_assets set status='Activo',updated_at=now() where id=asset.id;
 return depreciation.id;
end $$;


notify pgrst,'reload schema';
