-- FIN-REP-01 / plan etapa 1: financial cutoffs, separate from today's live views.
create table public.finance_history_coverage (
 tenant_id uuid primary key references public.tenants(id), starts_on date not null,
 has_legacy boolean not null default false
);
create table public.finance_history (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id),
 entity text not null check(entity in ('invoice','payable','customer_payment','supplier_payment','receipt')),
 source_id uuid not null, effective_on date not null, data jsonb not null,
 reconstructed boolean not null default false, recorded_at timestamptz not null default clock_timestamp(),
 actor_id uuid references public.profiles(id)
);
create index finance_history_cutoff on public.finance_history(tenant_id,entity,source_id,effective_on desc,id desc);
do $$ declare t text;begin
 foreach t in array array['finance_history','finance_history_coverage'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',t);
 end loop;
end $$;

create function public.capture_finance_history() returns trigger language plpgsql security definer set search_path=public as $$
declare d jsonb; previous jsonb; entity_name text:=tg_argv[0]; effective date; v_tenant uuid; relevant text[];
begin
 d:=case when tg_op='DELETE' then to_jsonb(old)||jsonb_build_object('status','Anulada','deleted_at',clock_timestamp()) else to_jsonb(new) end;
 if entity_name='invoice' and d->>'status'='Borrador' and (tg_op='INSERT' or old.status='Borrador') then return new;end if;
 if tg_op='UPDATE' then
  previous:=to_jsonb(old);
  relevant:=case entity_name
   when 'invoice' then array['cliente_id','invoice_type','parent_invoice_id','invoice_number','issue_date','due_date','currency','total','status','deleted_at']
   when 'payable' then array['proveedor_id','tipo','parent_ap_id','numero_factura_proveedor','descripcion','fecha_factura','fecha_vencimiento','moneda','monto','status']
   when 'customer_payment' then array['invoice_id','applied_document_id','receipt_id','amount','currency','payment_date','status','reversed_at']
   when 'supplier_payment' then array['cuenta_pagar_id','monto','moneda','fecha_pago','status','reversed_at','withholding_document_id']
   else array['cliente_id','amount','currency','payment_date','status','reversed_at','origin_payment_id'] end;
  if not exists(select 1 from unnest(relevant) k where d->k is distinct from previous->k) then return new;end if;
 end if;
 v_tenant:=(d->>'tenant_id')::uuid;
 effective:=(clock_timestamp() at time zone 'America/Tegucigalpa')::date;
 if tg_op='INSERT' or (entity_name='invoice' and tg_op='UPDATE' and previous->>'status'='Borrador') then
  effective:=coalesce(nullif(d->>case entity_name when 'invoice' then 'issue_date' when 'payable' then 'fecha_factura' when 'supplier_payment' then 'fecha_pago' else 'payment_date' end,'')::date,
   (nullif(d->>'created_at','')::timestamptz at time zone 'America/Tegucigalpa')::date,effective);
  if entity_name='customer_payment' and nullif(d->>'receipt_id','') is not null then
   -- Applying a receipt today does not settle a document at the old cash date.
   effective:=greatest(effective,(nullif(d->>'created_at','')::timestamptz at time zone 'America/Tegucigalpa')::date,
     (select issue_date from public.invoices where id=(d->>'invoice_id')::uuid and tenant_id=v_tenant));
  end if;
 elsif d->>'status'='Reversado' and nullif(d->>'reversed_at','') is not null then
  effective:=( (d->>'reversed_at')::timestamptz at time zone 'America/Tegucigalpa')::date;
 end if;
 insert into public.finance_history_coverage(tenant_id,starts_on) values(v_tenant,(clock_timestamp() at time zone 'America/Tegucigalpa')::date) on conflict do nothing;
 insert into public.finance_history(tenant_id,entity,source_id,effective_on,data,actor_id)
 values(v_tenant,entity_name,(d->>'id')::uuid,effective,d,auth.uid());
 return case when tg_op='DELETE' then old else new end;
end $$;

do $$ declare r record; entity_name text;begin
 for r in select * from (values('invoices','invoice'),('cuentas_pagar','payable'),('invoice_payments','customer_payment'),('pagos_proveedor','supplier_payment'),('customer_receipts','receipt')) x(tab,entity) loop
  execute format('create trigger zz_finance_history after insert or update or delete on public.%I for each row execute function public.capture_finance_history(%L)',r.tab,r.entity);
  -- Existing state is a baseline, never fabricated earlier history.
  execute format('insert into public.finance_history(tenant_id,entity,source_id,effective_on,data,reconstructed)
   select tenant_id,%L,id,(clock_timestamp() at time zone ''America/Tegucigalpa'')::date,to_jsonb(t),true from public.%I t',r.entity,r.tab);
 end loop;
 insert into public.finance_history_coverage(tenant_id,starts_on,has_legacy)
 select id,(clock_timestamp() at time zone 'America/Tegucigalpa')::date,exists(select 1 from public.finance_history h where h.tenant_id=t.id and reconstructed) from public.tenants t
 on conflict(tenant_id) do update set has_legacy=excluded.has_legacy;
end $$;
create function public.guard_finance_history() returns trigger language plpgsql as $$begin raise exception 'El historial financiero es inmutable';end $$;
create trigger immutable_finance_history before update or delete on public.finance_history for each row execute function public.guard_finance_history();

create function public.assert_finance_cutoff(p_cutoff date) returns void language plpgsql stable security definer set search_path=public as $$begin
 if not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'Sin acceso financiero' using errcode='42501';end if;
 if p_cutoff is null or p_cutoff>(clock_timestamp() at time zone 'America/Tegucigalpa')::date then raise exception 'Selecciona una fecha de corte válida, hasta hoy';end if;
 if exists(select 1 from public.finance_history_coverage where tenant_id=public.current_tenant_id() and has_legacy and p_cutoff<starts_on) then
  raise exception 'No hay cobertura histórica certificada para este corte. Los registros anteriores requieren una apertura o reconstrucción revisada.';
 end if;
end $$;
create function public.finance_sources_at(p_entity text,p_cutoff date) returns setof public.finance_history
language sql stable security definer set search_path=public as $$
 select distinct on (source_id) h.* from public.finance_history h
 where tenant_id=public.current_tenant_id() and entity=p_entity and effective_on<=p_cutoff
 order by source_id,effective_on desc,id desc;
$$;

create function public.finance_documents_at(p_side text,p_cutoff date,p_party_id uuid default null)
returns table(id uuid,root_id uuid,party_id uuid,party_name text,currency text,document_type text,document_number text,
 created_on date,issue_date date,due_date date,original_amount numeric,credit_adjustment numeric,paid_amount numeric,
 withholding_amount numeric,balance numeric,days_overdue integer,status text,reconstructed boolean,needs_review boolean)
language plpgsql stable security definer set search_path=public as $$begin
 perform public.assert_finance_cutoff(p_cutoff);
 if p_side not in ('receivable','payable') or p_side is null then raise exception 'Auxiliar inválido';end if;
 return query
 with source as (
  select h.data d,h.reconstructed from public.finance_sources_at(case when p_side='receivable' then 'invoice' else 'payable' end,p_cutoff) h
 ), normalized as (
  select (d->>'id')::uuid doc_id,coalesce(nullif(d->>case when p_side='receivable' then 'parent_invoice_id' else 'parent_ap_id' end,'')::uuid,(d->>'id')::uuid) root,
   (d->>case when p_side='receivable' then 'cliente_id' else 'proveedor_id' end)::uuid party,
   case when p_side='receivable' then coalesce(d->>'cliente_nombre',(select nombre from public.clientes where clientes.id=(d->>'cliente_id')::uuid and tenant_id=public.current_tenant_id()))
    else (select nombre from public.proveedores where proveedores.id=(d->>'proveedor_id')::uuid and tenant_id=public.current_tenant_id()) end party_label,
   d->>case when p_side='receivable' then 'currency' else 'moneda' end curr,
   case when p_side='receivable' then d->>'invoice_type' else case d->>'tipo' when 'NC' then 'Nota de Crédito' when 'ND' then 'Nota de Débito' else 'Factura' end end kind,
   coalesce(nullif(d->>case when p_side='receivable' then 'invoice_number' else 'numero_factura_proveedor' end,''),d->>'descripcion','Sin referencia') reference,
   (nullif(d->>'created_at','')::timestamptz at time zone 'America/Tegucigalpa')::date created,
   coalesce(nullif(d->>case when p_side='receivable' then 'issue_date' else 'fecha_factura' end,'')::date,(nullif(d->>'created_at','')::timestamptz at time zone 'America/Tegucigalpa')::date) issued,
   nullif(d->>case when p_side='receivable' then 'due_date' else 'fecha_vencimiento' end,'')::date due,
   (d->>case when p_side='receivable' then 'total' else 'monto' end)::numeric amount,
   coalesce(d->>'status','') not in ('Borrador','Anulada') and nullif(d->>'deleted_at','') is null active,
   source.reconstructed legacy
  from source
 ), roots as (select * from normalized n where n.doc_id=n.root and n.kind='Factura' and n.active and n.issued<=p_cutoff),
 payments as (
  select n.root,coalesce(nullif(h.data->>'applied_document_id','')::uuid,n.doc_id) target,
   (h.data->>case when p_side='receivable' then 'amount' else 'monto' end)::numeric amount,
   h.data->>case when p_side='receivable' then 'currency' else 'moneda' end curr,
   p_side='payable' and nullif(h.data->>'withholding_document_id','') is not null withheld,h.reconstructed legacy
  from public.finance_sources_at(case when p_side='receivable' then 'customer_payment' else 'supplier_payment' end,p_cutoff) h
  join normalized n on n.doc_id=(h.data->>case when p_side='receivable' then 'invoice_id' else 'cuenta_pagar_id' end)::uuid
  where h.data->>'status'='Aplicado'
 ), pooled as (
  select r.doc_id root,r.party,r.party_label,r.curr,
   coalesce((select sum(n.amount) from normalized n where n.root=r.doc_id and n.doc_id<>n.root and n.kind='Nota de Crédito' and n.active and n.issued<=p_cutoff and n.curr=r.curr),0) cn,
   coalesce((select sum(p.amount) from payments p where p.root=r.doc_id and p.target=r.doc_id and p.curr=r.curr and not p.withheld),0) cash,
   coalesce((select sum(p.amount) from payments p where p.root=r.doc_id and p.target=r.doc_id and p.curr=r.curr and p.withheld),0) wh,
   exists(select 1 from payments p where p.root=r.doc_id and p.curr<>r.curr) or exists(select 1 from normalized n where n.root=r.doc_id and n.active and n.curr<>r.curr) bad,
   r.legacy or exists(select 1 from payments p where p.root=r.doc_id and p.legacy) or exists(select 1 from normalized n where n.root=r.doc_id and n.legacy) legacy
  from roots r where p_party_id is null or r.party=p_party_id
 ), docs as (
  select n.*,r.due root_due,p.cn,p.cash,p.wh,p.bad,p.legacy root_legacy,
   coalesce((select sum(x.amount) from payments x where x.root=n.root and x.target=n.doc_id and x.target<>x.root and x.curr=n.curr and not x.withheld),0) direct_cash,
   coalesce((select sum(x.amount) from payments x where x.root=n.root and x.target=n.doc_id and x.target<>x.root and x.curr=n.curr and x.withheld),0) direct_wh
  from normalized n join roots r on r.doc_id=n.root join pooled p on p.root=n.root
  where n.active and n.issued<=p_cutoff and n.kind in ('Factura','Nota de Débito')
 ), net as (select d.*,greatest(amount-direct_cash-direct_wh,0) net from docs d),
 c1 as (select n.*,least(net,greatest(cn-coalesce(sum(net) over(partition by root order by (doc_id<>root),issued,doc_id rows between unbounded preceding and 1 preceding),0),0)) cn_applied from net n),
 c2 as (select c1.*,least(net-cn_applied,greatest(cash-coalesce(sum(net-cn_applied) over(partition by root order by (doc_id<>root),issued,doc_id rows between unbounded preceding and 1 preceding),0),0)) cash_applied from c1),
 c3 as (select c2.*,least(net-cn_applied-cash_applied,greatest(wh-coalesce(sum(net-cn_applied-cash_applied) over(partition by root order by (doc_id<>root),issued,doc_id rows between unbounded preceding and 1 preceding),0),0)) wh_applied from c2),
 final as (select c3.*,round(net-cn_applied-cash_applied-wh_applied,2) pending,
  bad or amount<0 or direct_cash+direct_wh>amount or cn+cash+wh>(select sum(x.net) from net x where x.root=c3.root) bad_root from c3)
 select f.doc_id,f.root,f.party,coalesce(f.party_label,'Sin tercero'),f.curr,f.kind,f.reference,f.created,f.issued,
  case when f.doc_id<>f.root then f.root_due else f.due end,f.amount,f.cn_applied,f.direct_cash+f.cash_applied,
  f.direct_wh+f.wh_applied,f.pending,
  case when f.pending>0 then greatest(p_cutoff-coalesce(case when f.doc_id<>f.root then f.root_due else f.due end,p_cutoff),0) else 0 end,
  case when f.bad_root then 'Por revisar' when f.pending=0 and f.cn_applied=f.amount then 'Saldada por NC' when f.pending=0 then 'Pagada' when coalesce(case when f.doc_id<>f.root then f.root_due else f.due end,p_cutoff)<p_cutoff then 'Vencida'
    when f.direct_cash+f.cash_applied+f.direct_wh+f.wh_applied>0 then 'Parcialmente Pagada' else 'Pendiente' end,
  f.root_legacy,f.bad_root from final f order by f.party,f.curr,f.issued,f.doc_id;
end $$;

create function public.finance_movements_at(p_side text,p_cutoff date,p_party_id uuid default null)
returns table(id text,party_id uuid,party_name text,currency text,movement_date date,kind text,reference text,description text,debit numeric,credit numeric,reconstructed boolean)
language plpgsql stable security definer set search_path=public as $$begin
 perform public.assert_finance_cutoff(p_cutoff);
 if p_side is null or p_side not in ('receivable','payable') then raise exception 'Auxiliar inválido';end if;
 return query
 with all_history as (
  select h.*,lag(data) over(partition by entity,source_id order by effective_on,h.id) previous
  from public.finance_history h where tenant_id=public.current_tenant_id() and effective_on<=p_cutoff
   and entity in(case when p_side='receivable' then 'invoice' else 'payable' end,case when p_side='receivable' then 'customer_payment' else 'supplier_payment' end,case when p_side='receivable' then 'receipt' else 'supplier_payment' end)
 ), contributions as (
  select h.id::text||':'||v.suffix event_id,h.effective_on,h.entity,h.reconstructed,v.d,v.sign
  from all_history h cross join lateral(values(h.data,1,'new'),(h.previous,-1,'old')) v(d,sign,suffix) where v.d is not null
 ), classified as (
  select c.*,c.entity in ('invoice','payable') doc,
   case when c.entity in ('invoice','payable') then c.d else parent.data end doc_data,
   case when c.entity='invoice' then c.d->>'invoice_type' when c.entity='payable' then case c.d->>'tipo' when 'NC' then 'Nota de Crédito' when 'ND' then 'Nota de Débito' else 'Factura' end else 'Pago' end event_kind
  from contributions c left join lateral(select data from public.finance_sources_at(case when p_side='receivable' then 'invoice' else 'payable' end,p_cutoff) s
    where s.source_id=(c.d->>case when p_side='receivable' then 'invoice_id' else 'cuenta_pagar_id' end)::uuid limit 1) parent on c.entity in ('customer_payment','supplier_payment')
 ), amounts as (
  select c.*,(case when entity='receipt' then d->>'cliente_id' else doc_data->>case when p_side='receivable' then 'cliente_id' else 'proveedor_id' end end)::uuid party,
   d->>case when p_side='receivable' then 'currency' else 'moneda' end curr,
   (d->>case when doc then case when p_side='receivable' then 'total' else 'monto' end else case when p_side='receivable' then 'amount' else 'monto' end end)::numeric
   *case when doc then case when event_kind='Nota de Crédito' then -1 else 1 end else -1 end *sign amount
  from classified c where d->>'status' not in ('Borrador','Anulada','Reversado') and nullif(d->>'deleted_at','') is null
    and (p_side='payable' or not doc or coalesce(doc_data->>'invoice_type','')<>'Proforma')
    and (entity<>'receipt' or nullif(d->>'origin_payment_id','') is null)
    and (entity<>'customer_payment' or nullif(d->>'receipt_id','') is null or nullif(d->>'original_proforma_id','') is not null)
 ), grouped as (
  select split_part(event_id,':',1) event_id,a.party,a.curr,a.effective_on,a.event_kind,
   coalesce(max(d->>case when doc then case when p_side='receivable' then 'invoice_number' else 'numero_factura_proveedor' end else case when p_side='receivable' then 'reference' else 'referencia' end end),'Sin referencia') ref,
   sum(amount) amount,bool_or(a.reconstructed) legacy from amounts a
  where a.party is not null and (p_party_id is null or a.party=p_party_id) group by split_part(event_id,':',1),a.party,a.curr,a.effective_on,a.event_kind
 ) select g.event_id||':'||g.party||':'||g.curr||':'||g.event_kind,g.party,coalesce(case when p_side='receivable' then (select nombre from public.clientes where clientes.id=g.party and tenant_id=public.current_tenant_id()) else (select nombre from public.proveedores where proveedores.id=g.party and tenant_id=public.current_tenant_id()) end,'Sin tercero'),
  g.curr,g.effective_on,case when g.amount<0 and g.event_kind<>'Nota de Crédito' and g.event_kind<>'Pago' then 'Anulación / ajuste' when g.amount>0 and g.event_kind='Pago' then 'Reverso de pago' else g.event_kind end,
  g.ref,g.event_kind,greatest(g.amount,0),greatest(-g.amount,0),g.legacy from grouped g where g.amount<>0 order by g.effective_on,g.event_id;
end $$;
revoke all on function public.capture_finance_history(),public.guard_finance_history(),public.assert_finance_cutoff(date),public.finance_sources_at(text,date) from public,anon,authenticated;
revoke all on function public.finance_documents_at(text,date,uuid),public.finance_movements_at(text,date,uuid) from public,anon;
grant execute on function public.finance_documents_at(text,date,uuid),public.finance_movements_at(text,date,uuid) to authenticated;
notify pgrst,'reload schema';
