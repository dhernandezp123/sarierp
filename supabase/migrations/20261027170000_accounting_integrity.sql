-- Un reintento con otro request_id tampoco duplica la factura del proveedor.
create unique index purchase_supplier_document_unique
 on public.purchase_documents(tenant_id,supplier_id,document_number)
 where status='Emitida' and document_type='Factura de proveedor';

-- Una baja conserva el historial de depreciaciones y cancela el valor en libros.
create or replace view public.fixed_asset_balances with(security_invoker=true) as
select a.*,coalesce(d.accumulated,0) accumulated_depreciation,
 case when a.status='Baja' then 0 else a.cost-coalesce(d.accumulated,0) end net_book_value,
 coalesce(d.months,0) depreciated_months,(a.start_month+coalesce(d.months,0)*interval '1 month')::date next_month,d.last_month
from public.fixed_assets a left join lateral(select sum(amount) accumulated,count(*) months,max(period_month) last_month
 from public.asset_depreciations d where d.asset_id=a.id and d.tenant_id=a.tenant_id and d.status='Contabilizada') d on true;
