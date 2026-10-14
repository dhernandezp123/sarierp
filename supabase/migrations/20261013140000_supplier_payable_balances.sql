-- AUD-03: lectura canonica de obligaciones principales. Sin reescribir historial.
-- INVOKER conserva RLS de cada tabla; el filtro explicito tambien protege al
-- invocarla desde los cores DEFINER autorizados de AUD-02.
create view public.supplier_payable_balances with (security_invoker = true) as
with amounts as (
  select a.id,a.tenant_id,a.proveedor_id,a.quotation_id,a.booking_id,
    a.descripcion,a.numero_factura_proveedor,a.monto,a.moneda,a.tipo,a.parent_ap_id,
    a.fecha_factura,a.fecha_vencimiento,a.status as stored_status,a.notas,a.documento_url,
    a.created_at,a.updated_at,a.cancelled_at,a.cancelled_by,a.cancellation_reason,
    (now() at time zone 'America/Tegucigalpa')::date as as_of_date,
    case when pr.id is not null then jsonb_build_object('id',pr.id,'nombre',pr.nombre,
      'tipo',pr.tipo,'terminos_pago',pr.terminos_pago) end as proveedores,
    case when q.id is not null then jsonb_build_object('id',q.id,'quotation_number',q.quotation_number) end as quotations,
    case when b.id is not null then jsonb_build_object('id',b.id,'booking_number',b.booking_number) end as bookings,
    n.credit_notes,n.debit_notes,p.paid_total,p.paid_this_month,n.active_notes,
    a.monto - n.credit_notes + n.debit_notes as total_adjusted,
    (a.monto::text in ('NaN','Infinity','-Infinity') or n.inconsistent or p.inconsistent) as has_inconsistent_movements
  from public.cuentas_pagar a
  left join public.proveedores pr on pr.id=a.proveedor_id and pr.tenant_id=a.tenant_id
  left join public.quotations q on q.id=a.quotation_id and q.tenant_id=a.tenant_id
  left join public.bookings b on b.id=a.booking_id and b.tenant_id=a.tenant_id
  left join lateral (
    select coalesce(sum(n.monto) filter (where n.tipo='NC'),0) as credit_notes,
      coalesce(sum(n.monto) filter (where n.tipo='ND'),0) as debit_notes,
      count(*) as active_notes,
      coalesce(bool_or(n.moneda is distinct from a.moneda or n.proveedor_id is distinct from a.proveedor_id
        or n.tipo not in ('NC','ND') or n.monto::text in ('NaN','Infinity','-Infinity')),false) as inconsistent
    from public.cuentas_pagar n
    where n.tenant_id=a.tenant_id and n.parent_ap_id=a.id and n.status <> 'Anulada'
  ) n on true
  left join lateral (
    select coalesce(sum(p.monto),0) as paid_total,
      coalesce(sum(p.monto) filter (where p.fecha_pago >= date_trunc('month',now() at time zone 'America/Tegucigalpa')::date
        and p.fecha_pago < (date_trunc('month',now() at time zone 'America/Tegucigalpa') + interval '1 month')::date),0) as paid_this_month,
      coalesce(bool_or(p.moneda is distinct from a.moneda or p.monto::text in ('NaN','Infinity','-Infinity')),false) as inconsistent
    from public.pagos_proveedor p
    where p.tenant_id=a.tenant_id and p.cuenta_pagar_id=a.id and p.status='Aplicado'
  ) p on true
  where a.tipo='AP' and a.parent_ap_id is null
    and a.tenant_id=public.current_tenant_id() and public.can_manage_finance()
), balances as (
  select amounts.*,
    total_adjusted - paid_total as pending_balance,
    not has_inconsistent_movements and total_adjusted < 0 as has_negative_obligation,
    not has_inconsistent_movements and total_adjusted >= 0 and paid_total > total_adjusted as has_overpayment,
    case when stored_status='Anulada' then 'Anulada'
      when has_inconsistent_movements or total_adjusted < 0 then 'Revisar'
      when paid_total >= total_adjusted then 'Pagada'
      when paid_total > 0 then 'Parcialmente Pagada'
      when fecha_vencimiento < as_of_date then 'Vencida' else 'Pendiente' end as status
  from amounts
)
select id,tenant_id,proveedor_id,quotation_id,booking_id,descripcion,numero_factura_proveedor,
  monto,moneda,tipo,parent_ap_id,fecha_factura,fecha_vencimiento,stored_status,status,
  notas,documento_url,created_at,updated_at,cancelled_at,cancelled_by,cancellation_reason,
  as_of_date,proveedores,quotations,bookings,
  case when not has_inconsistent_movements then credit_notes end as credit_notes,
  case when not has_inconsistent_movements then debit_notes end as debit_notes,
  case when not has_inconsistent_movements then total_adjusted end as total_adjusted,
  case when not has_inconsistent_movements then paid_total end as paid_total,
  case when not has_inconsistent_movements then pending_balance end as pending_balance,
  case when not has_inconsistent_movements then paid_this_month end as paid_this_month,
  case when status not in ('Anulada','Revisar') and pending_balance > 0
    then greatest(0,as_of_date-fecha_vencimiento) else 0 end as days_overdue,
  has_inconsistent_movements,has_negative_obligation,has_overpayment,
  (has_inconsistent_movements or has_negative_obligation or has_overpayment
    or (stored_status='Anulada' and (paid_total > 0 or active_notes > 0))) as needs_reconciliation
from balances;

revoke all on public.supplier_payable_balances from public,anon,authenticated,service_role;
grant select on public.supplier_payable_balances to authenticated;
comment on view public.supplier_payable_balances is
  'AUD-03: AP principales, NC/ND activas, pagos aplicados y saldo sin clamp. INVOKER + tenant + Finanzas. No actualiza documentos.';

-- Mismo calculo para las mutaciones atomicas, sin duplicar las formulas de lectura.
create or replace function public.supplier_payable_balance_internal(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance public.supplier_payable_balances%rowtype;
begin
  select * into v_balance from public.supplier_payable_balances where id=p_account_id;
  if not found then raise exception 'Cuenta principal no disponible' using errcode='42501'; end if;
  if v_balance.has_inconsistent_movements then
    raise exception 'La cuenta tiene movimientos inconsistentes; concilia sus datos' using errcode='23514'; end if;
  if v_balance.has_negative_obligation then
    raise exception 'Los ajustes superan la obligacion; concilia la cuenta' using errcode='23514'; end if;
  return jsonb_build_object('account_id',v_balance.id,'status',v_balance.status,
    'total_adjusted',v_balance.total_adjusted,'paid_total',v_balance.paid_total,'pending_balance',v_balance.pending_balance);
end;
$$;
revoke all on function public.supplier_payable_balance_internal(uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
