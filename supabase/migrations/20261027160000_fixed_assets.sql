-- Etapa 6. Depreciación contable lineal mensual; criterios fiscales separados.
-- Un alta auxiliar no crea una apertura ni vuelve a contabilizar la compra.
create table public.fixed_assets (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),request_id uuid not null,
 code text not null,name text not null,category text not null check(category in ('Equipo','Mobiliario','Vehículo','Otro')),
 acquisition_date date not null,available_date date not null,start_month date not null,
 cost numeric(14,2) not null check(cost>0 and cost::text<>'NaN'),residual numeric(14,2) not null default 0 check(residual>=0 and residual::text<>'NaN'),
 useful_months integer not null check(useful_months between 1 and 1200),
 asset_account_id uuid not null,depreciation_account_id uuid not null,accumulated_account_id uuid not null,acquisition_line_id uuid,
 tax_useful_months integer check(tax_useful_months between 1 and 1200),tax_rule_reference text not null default '',
 location text not null default '',notes text not null default '',status text not null check(status in ('Preparación','Activo','Depreciado','Baja')),
 disposal_date date,disposal_reason text,disposal_entry_id uuid,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,code),unique(tenant_id,request_id),check(residual<=cost),check(acquisition_date<=available_date),
 check(start_month=date_trunc('month',start_month)::date and start_month>=date_trunc('month',available_date)::date),
 foreign key(tenant_id,asset_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,depreciation_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,accumulated_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,disposal_entry_id) references public.journal_entries(tenant_id,id)
);
alter table public.journal_lines add constraint journal_lines_tenant_id_id_key unique(tenant_id,id);
alter table public.fixed_assets add constraint fixed_asset_acquisition_fk foreign key(tenant_id,acquisition_line_id) references public.journal_lines(tenant_id,id);
create table public.asset_depreciations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),asset_id uuid not null,
 period_month date not null,amount numeric(14,2) not null check(amount>=0 and amount::text<>'NaN'),entry_id uuid,
 status text not null default 'Contabilizada' check(status in ('Contabilizada','Reversada')),reversal_reason text,reversed_at timestamptz,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(tenant_id,id),foreign key(tenant_id,asset_id) references public.fixed_assets(tenant_id,id),foreign key(tenant_id,entry_id) references public.journal_entries(tenant_id,id)
);
create unique index asset_depreciation_month on public.asset_depreciations(asset_id,period_month) where status='Contabilizada';
do $$ declare table_name text;begin
 foreach table_name in array array['fixed_assets','asset_depreciations'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);execute format('grant select on public.%I to authenticated',table_name);
 end loop;
end $$;
create view public.fixed_asset_balances with(security_invoker=true) as
select a.*,coalesce(d.accumulated,0) accumulated_depreciation,a.cost-coalesce(d.accumulated,0) net_book_value,coalesce(d.months,0) depreciated_months,
 (a.start_month+coalesce(d.months,0)*interval '1 month')::date next_month,d.last_month
from public.fixed_assets a left join lateral(select sum(amount) accumulated,count(*) months,max(period_month) last_month from public.asset_depreciations d where d.asset_id=a.id and d.tenant_id=a.tenant_id and d.status='Contabilizada') d on true;
revoke all on public.fixed_asset_balances from public,anon;grant select on public.fixed_asset_balances to authenticated;

create function public.save_fixed_asset(p_asset jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid:=nullif(p_asset->>'id','')::uuid;previous public.fixed_assets%rowtype;source public.journal_lines%rowtype;entry public.journal_entries%rowtype;
 request uuid:=nullif(p_asset->>'request_id','')::uuid;v_cost numeric:=(p_asset->>'cost')::numeric;v_residual numeric:=(p_asset->>'residual')::numeric;
 source_id uuid:=nullif(p_asset->>'acquisition_line_id','')::uuid;asset_account uuid:=(p_asset->>'asset_account_id')::uuid;
 expense_account uuid:=(p_asset->>'depreciation_account_id')::uuid;accumulated_account uuid:=(p_asset->>'accumulated_account_id')::uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('assets:'||public.current_tenant_id()::text,0));
 if target is null then
  if request is null then raise exception 'Falta identificador de alta';end if;
  select id into target from public.fixed_assets where tenant_id=public.current_tenant_id() and request_id=request;if found then return target;end if;
 else
  select * into previous from public.fixed_assets where id=target and tenant_id=public.current_tenant_id() for update;
  if not found or previous.status='Baja' then raise exception 'Activo no disponible para editar';end if;
  if exists(select 1 from public.asset_depreciations where asset_id=target) and
   (previous.cost,previous.residual,previous.useful_months,previous.start_month,previous.acquisition_line_id,previous.asset_account_id,previous.depreciation_account_id,previous.accumulated_account_id,previous.acquisition_date,previous.available_date)
   is distinct from (v_cost,v_residual,(p_asset->>'useful_months')::integer,(p_asset->>'start_month')::date,source_id,asset_account,expense_account,accumulated_account,(p_asset->>'acquisition_date')::date,(p_asset->>'available_date')::date) then
    raise exception 'El activo con depreciaciones conserva su base, fechas y cuentas; registra un ajuste contable separado';end if;
 end if;
 if v_cost is null or v_cost<=0 or v_cost>999999999999.99 or v_residual is null or v_residual<0 or v_residual>v_cost or v_cost<>round(v_cost,2) or v_residual<>round(v_residual,2)
  or nullif(btrim(p_asset->>'code'),'') is null or length(p_asset->>'code')>60 or nullif(btrim(p_asset->>'name'),'') is null or length(p_asset->>'name')>200 then raise exception 'Revisa código, nombre, costo y residual';end if;
 if not exists(select 1 from public.accounting_accounts where id=asset_account and tenant_id=public.current_tenant_id() and kind='Activo' and active and postable)
  or not exists(select 1 from public.accounting_accounts where id=accumulated_account and tenant_id=public.current_tenant_id() and kind='Activo' and active and postable)
  or not exists(select 1 from public.accounting_accounts where id=expense_account and tenant_id=public.current_tenant_id() and kind='Gasto' and active and postable)
  or asset_account=accumulated_account then raise exception 'Selecciona cuentas distintas de activo, depreciación acumulada y gasto';end if;
 if nullif(p_asset->>'tax_useful_months','') is not null and nullif(btrim(p_asset->>'tax_rule_reference'),'') is null then raise exception 'Indica el respaldo del criterio fiscal; no se presume una tasa SAR';end if;
 if source_id is not null then
  select * into source from public.journal_lines where id=source_id and tenant_id=public.current_tenant_id() and account_id=asset_account and debit>0;
  if not found then raise exception 'Selecciona una línea de adquisición de esta cuenta de activo';end if;
  select * into entry from public.journal_entries where id=source.entry_id;
  if entry.reversed_by_id is not null or entry.reverses_id is not null or entry.entry_date>(p_asset->>'available_date')::date then raise exception 'La adquisición debe estar contabilizada y vigente antes de la puesta en uso';end if;
  if v_cost+coalesce((select sum(a.cost) from public.fixed_assets a where a.acquisition_line_id=source_id and a.id is distinct from target),0)>source.debit then raise exception 'El costo asignado supera el valor de la adquisición';end if;
 end if;
 if previous.id is null then
  insert into public.fixed_assets(tenant_id,request_id,code,name,category,acquisition_date,available_date,start_month,cost,residual,useful_months,asset_account_id,depreciation_account_id,accumulated_account_id,acquisition_line_id,tax_useful_months,tax_rule_reference,location,notes,status,created_by)
  values(public.current_tenant_id(),request,btrim(p_asset->>'code'),btrim(p_asset->>'name'),p_asset->>'category',(p_asset->>'acquisition_date')::date,(p_asset->>'available_date')::date,(p_asset->>'start_month')::date,
   v_cost,v_residual,(p_asset->>'useful_months')::integer,asset_account,expense_account,accumulated_account,source_id,nullif(p_asset->>'tax_useful_months','')::integer,coalesce(p_asset->>'tax_rule_reference',''),
   left(coalesce(p_asset->>'location',''),300),left(coalesce(p_asset->>'notes',''),2000),case when source_id is null then 'Preparación' else 'Activo' end,auth.uid()) returning id into target;
 else
  update public.fixed_assets set code=btrim(p_asset->>'code'),name=btrim(p_asset->>'name'),category=p_asset->>'category',acquisition_date=(p_asset->>'acquisition_date')::date,available_date=(p_asset->>'available_date')::date,
   start_month=(p_asset->>'start_month')::date,cost=v_cost,residual=v_residual,useful_months=(p_asset->>'useful_months')::integer,asset_account_id=asset_account,depreciation_account_id=expense_account,accumulated_account_id=accumulated_account,acquisition_line_id=source_id,
   tax_useful_months=nullif(p_asset->>'tax_useful_months','')::integer,tax_rule_reference=coalesce(p_asset->>'tax_rule_reference',''),location=left(coalesce(p_asset->>'location',''),300),notes=left(coalesce(p_asset->>'notes',''),2000),
   status=case when source_id is null then 'Preparación' when previous.status='Depreciado' then 'Depreciado' else 'Activo' end,updated_at=now() where id=target;
 end if;
 return target;
end $$;

create function public.post_asset_depreciation(p_asset_id uuid,p_month date) returns uuid language plpgsql security definer set search_path=public as $$
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
 amount:=round((asset.cost-asset.residual)*(months+1)/asset.useful_months,2)-round((asset.cost-asset.residual)*months/asset.useful_months,2);
 if amount>0 then
  entry_id:=public.post_journal_internal(ending,'Depreciación mensual '||asset.code||' · '||asset.name,'Depreciación',asset.id,'depreciation:'||record_id,
   jsonb_build_array(jsonb_build_object('account_id',asset.depreciation_account_id,'debit',amount),jsonb_build_object('account_id',asset.accumulated_account_id,'credit',amount)));
 end if;
 insert into public.asset_depreciations(id,tenant_id,asset_id,period_month,amount,entry_id,created_by) values(record_id,asset.tenant_id,asset.id,p_month,amount,entry_id,auth.uid());
 if months+1=asset.useful_months then update public.fixed_assets set status='Depreciado',updated_at=now() where id=asset.id;end if;
 return record_id;
end $$;

create function public.reverse_asset_depreciation(p_depreciation_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
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
 if depreciation.entry_id is not null then perform public.reverse_journal_internal(depreciation.entry_id,p_date,p_reason);end if;
 update public.asset_depreciations set status='Reversada',reversal_reason=p_reason,reversed_at=now() where id=depreciation.id;
 update public.fixed_assets set status='Activo',updated_at=now() where id=asset.id;
 return depreciation.id;
end $$;

create function public.dispose_fixed_asset(p_asset_id uuid,p_date date,p_loss_account_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare asset public.fixed_assets%rowtype;accumulated numeric;net numeric;months integer;due_months integer;lines jsonb:='[]';entry_id uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into asset from public.fixed_assets where id=p_asset_id and tenant_id=public.current_tenant_id() for update;
 if not found or asset.status='Preparación' then raise exception 'Activo no disponible para baja';end if;
 if asset.status='Baja' then return asset.disposal_entry_id;end if;
 if p_date is null or p_date>current_date or p_date<asset.available_date or nullif(btrim(p_reason),'') is null then raise exception 'Revisa fecha y motivo de baja';end if;
 if not exists(select 1 from public.accounting_accounts where id=p_loss_account_id and tenant_id=asset.tenant_id and kind='Gasto' and active and postable) then raise exception 'Selecciona cuenta de gasto por baja';end if;
 if exists(select 1 from public.asset_depreciations where asset_id=asset.id and status='Contabilizada' and (period_month+interval '1 month'-interval '1 day')::date>p_date) then raise exception 'Revierte las depreciaciones posteriores a la baja';end if;
 select coalesce(sum(amount),0),count(*) into accumulated,months from public.asset_depreciations where asset_id=asset.id and status='Contabilizada';
 due_months:=least(asset.useful_months,greatest(0,(extract(year from p_date)::integer-extract(year from asset.start_month)::integer)*12+extract(month from p_date)::integer-extract(month from asset.start_month)::integer+
   case when p_date=(date_trunc('month',p_date)+interval '1 month'-interval '1 day')::date then 1 else 0 end));
 if months<due_months then raise exception 'Completa las depreciaciones de meses terminados antes de la baja';end if;
 net:=asset.cost-accumulated;
 if accumulated>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',asset.accumulated_account_id,'debit',accumulated));end if;
 if net>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',p_loss_account_id,'debit',net));end if;
 lines:=lines||jsonb_build_array(jsonb_build_object('account_id',asset.asset_account_id,'credit',asset.cost));
 entry_id:=public.post_journal_internal(p_date,'Baja sin venta '||asset.code||': '||p_reason,'Baja de activo',asset.id,'asset-disposal:'||asset.id,lines);
 update public.fixed_assets set status='Baja',disposal_date=p_date,disposal_reason=p_reason,disposal_entry_id=entry_id,updated_at=now() where id=asset.id;
 return entry_id;
end $$;

-- La compra capitalizada no puede anularse por fuera del auxiliar de activos.
alter function public.reverse_journal_internal(uuid,date,text) rename to reverse_journal_before_assets;
revoke all on function public.reverse_journal_before_assets(uuid,date,text) from public,anon,authenticated;
create function public.reverse_journal_internal(p_entry_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.fixed_assets a join public.journal_lines l on l.id=a.acquisition_line_id where l.entry_id=p_entry_id and a.tenant_id=public.current_tenant_id()) then
  raise exception 'La adquisición respalda un activo: conserva el documento y registra la corrección contable correspondiente';end if;
 return public.reverse_journal_before_assets(p_entry_id,p_date,p_reason);
end $$;
revoke all on function public.reverse_journal_internal(uuid,date,text) from public,anon,authenticated;
revoke all on function public.save_fixed_asset(jsonb),public.post_asset_depreciation(uuid,date),public.reverse_asset_depreciation(uuid,date,text),public.dispose_fixed_asset(uuid,date,uuid,text) from public,anon;
grant execute on function public.save_fixed_asset(jsonb),public.post_asset_depreciation(uuid,date),public.reverse_asset_depreciation(uuid,date,text),public.dispose_fixed_asset(uuid,date,uuid,text) to authenticated;
notify pgrst,'reload schema';
