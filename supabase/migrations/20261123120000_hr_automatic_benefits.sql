-- HR-10: cálculo servidor, bases comprobadas y aplicación atómica a nómina.
create table public.hr_benefit_credits (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),employee_id uuid not null references public.hr_employees(id),
 request_id uuid not null,component text not null check(component in ('vacation','vacation_balance','notice','severance','bonus13','bonus14','fixed_term')),
 period_start date not null,leave_request_id uuid references public.hr_leave_requests(id),currency text not null check(currency in ('HNL','USD')),
 amount numeric(16,2) not null check(amount>0 and amount<100000000),paid_on date not null,reference text not null,source text not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),voided_at timestamptz,voided_by uuid references auth.users(id),void_reason text,
 unique(tenant_id,request_id),unique(tenant_id,employee_id,component,period_start,reference),check(length(btrim(reference)) between 3 and 160),check(length(btrim(source)) between 10 and 2000)
);
create table public.hr_benefit_calculations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),employee_id uuid not null references public.hr_employees(id),
 request_id uuid not null,input_hash text not null,inputs jsonb not null,snapshot jsonb not null,fingerprint text not null,
 payroll_run_id uuid unique references public.hr_payroll_runs(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(tenant_id,request_id)
);
alter table public.hr_benefit_credits enable row level security;
alter table public.hr_benefit_calculations enable row level security;
revoke all on public.hr_benefit_credits,public.hr_benefit_calculations from public,anon,authenticated;
grant select on public.hr_benefit_credits,public.hr_benefit_calculations to authenticated;
create policy hr_benefit_credit_admin on public.hr_benefit_credits for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_is_manager());
create policy hr_benefit_calculation_read on public.hr_benefit_calculations for select to authenticated using(tenant_id=public.current_tenant_id() and (public.hr_is_manager() or (public.hr_can_read_employee(employee_id) and exists(select 1 from public.hr_payroll_runs r where r.id=payroll_run_id and r.status in ('Aprobada','Contabilizada')))));

create function public.hr_labor_days(p_start date,p_end date) returns numeric language sql immutable set search_path=public as $$
 select case when p_end<p_start then 0 else extract(year from age(p_end+1,p_start))*360+extract(month from age(p_end+1,p_start))*30+least(30,extract(day from age(p_end+1,p_start))) end
$$;
revoke all on function public.hr_labor_days(date,date) from public,anon,authenticated;

-- Cada bloque debe cubrir exactamente su ventana. No prorratea salarios variables ni adivina días efectivamente trabajados.
create function public.hr_benefit_basis(p_start date,p_end date,p_rows jsonb,p_worked_required boolean) returns jsonb
language plpgsql immutable set search_path=public as $$
declare row jsonb;cursor_date date:=p_start;last_date date;ordinary numeric;kind numeric;extra numeric;days numeric;cash_sum numeric:=0;kind_sum numeric:=0;extra_sum numeric:=0;days_sum numeric:=0;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 400 then raise exception 'Completa el historial de la base salarial';end if;
 for row in select value from jsonb_array_elements(p_rows) order by value->>'start' loop
  last_date:=(row->>'end')::date;
  if (row->>'start')::date is distinct from cursor_date or last_date is null or last_date<cursor_date or last_date>p_end then raise exception 'La base salarial contiene huecos, solapamientos o fechas fuera de la ventana requerida';end if;
  ordinary:=(row->>'ordinary')::numeric;kind:=(row->>'in_kind')::numeric;extra:=(row->>'extraordinary')::numeric;days:=(row->>'worked_days')::numeric;
  if ordinary is null or kind is null or extra is null or days is null or ordinary::text in ('NaN','Infinity','-Infinity') or kind::text in ('NaN','Infinity','-Infinity') or extra::text in ('NaN','Infinity','-Infinity') or days::text in ('NaN','Infinity','-Infinity')
   or least(ordinary,kind,extra,days)<0 or greatest(ordinary,kind,extra)>100000000 or ordinary<>round(ordinary,2) or kind<>round(kind,2) or extra<>round(extra,2) or days<>round(days,2) or days>last_date-cursor_date+1 or length(btrim(coalesce(row->>'source','')))<10 then raise exception 'Revisa importes, días efectivamente trabajados y soporte de cada período';end if;
  cash_sum:=cash_sum+ordinary;kind_sum:=kind_sum+kind;extra_sum:=extra_sum+extra;days_sum:=days_sum+days;cursor_date:=last_date+1;
 end loop;
 if cursor_date<>p_end+1 or (p_worked_required and (days_sum<=0 or cash_sum+kind_sum<=0)) then raise exception 'La base debe cubrir toda la ventana y contener remuneración ordinaria y días trabajados comprobados';end if;
 return jsonb_build_object('start',p_start,'end',p_end,'ordinary',cash_sum,'in_kind',kind_sum,'extraordinary',extra_sum,'worked_days',days_sum,'rows',p_rows);
end $$;
revoke all on function public.hr_benefit_basis(date,date,jsonb,boolean) from public,anon,authenticated;

create function public.hr_compute_benefits_internal(p_employee uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id();e public.hr_employees%rowtype;t public.hr_compensation%rowtype;r public.hr_leave_requests%rowtype;
 cutoff date:=(p_input->>'as_of')::date;kind text:=p_input->>'kind';cause text:=p_input->>'cause';benefit_currency text:=p_input->>'currency';
 start6 date;start13 date;start14 date;basis6 jsonb;basis13 jsonb;basis14 jsonb;ordinary numeric;integrated numeric;daily_vac numeric;daily_indemnity numeric;
 tenure numeric;years integer;notice_days numeric:=0;severance_days numeric:=0;vac_days numeric:=0;fraction_days numeric:=0;advance_excess numeric:=0;periods jsonb:='[]';cap integer;multiplier numeric:=0;raw jsonb;item jsonb;lines jsonb:='[]';credits jsonb:='[]';credited numeric;gross numeric;net numeric;total numeric:=0;p record;current_period integer;anniversary date;entitlement integer;employer_cause boolean;exempt boolean;micro boolean;future_end date;future_amount numeric;result jsonb;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into e from public.hr_employees where id=p_employee and tenant_id=tenant;
 if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if kind is null or kind not in ('Vacaciones','Liquidación') or benefit_currency is null or benefit_currency not in ('HNL','USD') or cutoff is null or cutoff<e.hire_date or cutoff>current_date then raise exception 'Revisa tipo, moneda y fecha de corte (no futura)';end if;
 if p_input->>'regime' is distinct from 'general_time' or (p_input->>'review_confirmed')::boolean is distinct from true then raise exception 'Confirma régimen general por unidad de tiempo, revisión de bases, pagos previos y situaciones especiales';end if;
 if e.contract_type='Practicante' then raise exception 'El régimen de aprendizaje requiere revisión específica; no se aplica la fórmula general';end if;
 select * into t from public.hr_compensation where employee_id=e.id and effective_from<=cutoff order by effective_from desc limit 1;
 if not found or t.currency<>benefit_currency then raise exception 'Registra condiciones salariales vigentes en la moneda del historial';end if;
 start6:=greatest(e.hire_date,(cutoff+1-interval '6 months')::date);
 basis6:=public.hr_benefit_basis(start6,cutoff,p_input->'average_rows',true);
 -- Prorrata de ambos décimos en las bases laborales (D.112-82 art.3; Ac.02-95 art.5; D.117-2021 art.2).
 ordinary:=(basis6->>'ordinary')::numeric+(basis6->>'in_kind')::numeric;
 daily_vac:=(ordinary+ordinary/12+ordinary/12)/(basis6->>'worked_days')::numeric;
 daily_indemnity:=(ordinary+ordinary/12+ordinary/12+(basis6->>'extraordinary')::numeric)/(basis6->>'worked_days')::numeric;
 if kind='Vacaciones' then
  select * into r from public.hr_leave_requests where id=nullif(p_input->>'leave_request_id','')::uuid and tenant_id=tenant and employee_id=e.id and leave_type='Vacaciones' and status='Aprobada';
  if not found or cutoff>=r.start_date or r.start_date-cutoff>31 then raise exception 'Selecciona vacaciones aprobadas con corte anterior al inicio y dentro de los 31 días previos';end if;
  raw:=jsonb_build_array(jsonb_build_object('component','vacation','name','Pago de vacaciones','units',r.business_days,'unit_amount',daily_vac,'gross',round(r.business_days*daily_vac,2),'period_start',r.start_date,'legal_basis','CT 348,352; D.112-82 art.3; Ac.02-95 art.5'));
 else
  if e.termination_date is not null and e.termination_date<>cutoff then raise exception 'La fecha de corte debe coincidir con la terminación registrada';end if;
  if cause is null or cause not in ('despido_injustificado','despido_indirecto','renuncia','despido_justificado','mutuo_acuerdo','fallecimiento_natural','fin_contrato') then raise exception 'Selecciona causal de terminación';end if;
  if jsonb_typeof(p_input->'microenterprise') is distinct from 'boolean' or jsonb_typeof(p_input->'article120_excluded') is distinct from 'boolean' or length(btrim(coalesce(p_input->>'legal_source','')))<20 then raise exception 'Confirma tamaño real de empresa, exclusiones del art.120 y soporte de causal/protecciones';end if;
  micro:=(p_input->>'microenterprise')::boolean;exempt:=(p_input->>'article120_excluded')::boolean;cap:=case when micro then 15 else 25 end;
  employer_cause:=cause in ('despido_injustificado','despido_indirecto');
  if e.contract_type='Indefinido' and cause='fin_contrato' then raise exception 'Un contrato indefinido no termina por vencimiento de plazo';end if;
  if exists(select 1 from public.hr_leave_requests where employee_id=e.id and (status='Pendiente' or (status='Aprobada' and end_date>cutoff))) then raise exception 'Resuelve solicitudes pendientes y ausencias aprobadas posteriores al corte antes de liquidar';end if;
  tenure:=public.hr_labor_days(e.hire_date,cutoff);years:=extract(year from age(cutoff,e.hire_date))::integer;current_period:=years+1;anniversary:=(e.hire_date+make_interval(years=>years))::date;
  entitlement:=public.hr_period_entitlement(current_period,(select m.days from public.hr_vacation_minimums m where m.employee_id=e.id and m.effective_from<=cutoff order by m.effective_from desc limit 1));
  if employer_cause or (p_input->>'favorable_proportional')::boolean is true then fraction_days:=least(entitlement,entitlement*public.hr_labor_days(anniversary,cutoff)/360);end if;
  for p in select * from public.hr_vacation_periods_internal(e.id,cutoff) loop
   periods:=periods||jsonb_build_array(to_jsonb(p));
   if p.is_earned then vac_days:=vac_days+greatest(0,p.available);
   else advance_excess:=greatest(0,p.approved-p.adjustments-fraction_days);fraction_days:=greatest(0,fraction_days+p.adjustments-p.approved);end if;
  end loop;
  vac_days:=vac_days+fraction_days;
  if e.contract_type='Indefinido' then
   if employer_cause then notice_days:=case when cutoff+1<(e.hire_date+interval '3 months')::date then 1 when cutoff+1<=(e.hire_date+interval '6 months')::date then 7 when cutoff+1<=(e.hire_date+interval '1 year')::date then 14 when cutoff+1<=(e.hire_date+interval '2 years')::date then 30 else 60 end;
    if (p_input->>'notice_served_days')::numeric is null or (p_input->>'notice_served_days')::numeric<0 or (p_input->>'notice_served_days')::numeric>notice_days or (p_input->>'notice_served_days')::numeric<>trunc((p_input->>'notice_served_days')::numeric) then raise exception 'Confirma los días de preaviso efectivamente cumplidos';end if;
    notice_days:=notice_days-(p_input->>'notice_served_days')::numeric;multiplier:=1;
   elsif cause='renuncia' and not micro and cutoff+1>=(e.hire_date+interval '15 years')::date then multiplier:=0.35;
   elsif cause='fallecimiento_natural' and not micro and cutoff+1>(e.hire_date+interval '6 months')::date then multiplier:=0.75;end if;
   if exempt then multiplier:=0;end if;
   severance_days:=case when cutoff+1<(e.hire_date+interval '3 months')::date then 0 when cutoff+1<=(e.hire_date+interval '6 months')::date then 10 when cutoff+1<(e.hire_date+interval '1 year')::date then 20 else least(cap*30,tenure/12) end*multiplier;
  elsif employer_cause then
   future_end:=(p_input->>'contract_end')::date;
   if t.salary_mode<>'Fijo' or future_end is null or future_end<=cutoff or future_end-cutoff>3660 then raise exception 'Art.121: confirma fin del contrato y salario fijo; obra sin plazo o variable requiere revisión específica';end if;
   if exists(select 1 from public.hr_compensation where employee_id=e.id and effective_from>cutoff and effective_from<=future_end) then raise exception 'Art.121: existen cambios salariales futuros; requiere revisión específica del plazo restante';end if;
   future_amount:=round(t.monthly_salary*7/6/30*public.hr_labor_days(cutoff+1,future_end),2);
   severance_days:=case when cutoff+1<(e.hire_date+interval '3 months')::date then 0 when cutoff+1<=(e.hire_date+interval '6 months')::date then 10 when cutoff+1<(e.hire_date+interval '1 year')::date then 20 else least(cap*30,tenure/12) end;
   future_amount:=least(future_amount,round(severance_days*daily_indemnity,2));severance_days:=0;
  end if;
  start13:=make_date(extract(year from cutoff)::integer,1,1);start14:=make_date(extract(year from cutoff)::integer-case when extract(month from cutoff)<7 then 1 else 0 end,7,1);
  basis13:=public.hr_benefit_basis(greatest(e.hire_date,start13),cutoff,p_input->'bonus13_rows',false);
  basis14:=public.hr_benefit_basis(greatest(e.hire_date,start14),cutoff,p_input->'bonus14_rows',false);
  raw:=jsonb_build_array(
   jsonb_build_object('component','vacation_balance','name','Vacaciones pendientes y proporcionales','units',vac_days,'unit_amount',daily_vac,'gross',round(vac_days*daily_vac,2),'period_start',e.hire_date,'legal_basis','CT 345,346,349,352'),
   jsonb_build_object('component','notice','name','Preaviso','units',notice_days,'unit_amount',daily_indemnity,'gross',round(notice_days*daily_indemnity,2),'period_start',e.hire_date,'legal_basis','CT 116,118,123'),
   jsonb_build_object('component','severance','name','Auxilio de cesantía','units',severance_days,'unit_amount',daily_indemnity,'gross',round(severance_days*daily_indemnity,2),'period_start',e.hire_date,'legal_basis','CT 120,120-A,123'),
   jsonb_build_object('component','bonus13','name','Décimo tercer mes proporcional','units',1,'unit_amount',((basis13->>'ordinary')::numeric+(basis13->>'in_kind')::numeric)/12,'gross',round(((basis13->>'ordinary')::numeric+(basis13->>'in_kind')::numeric)/12,2),'period_start',start13,'legal_basis','D.112-82 arts.10,12,13'),
   jsonb_build_object('component','bonus14','name','Décimo cuarto mes proporcional','units',1,'unit_amount',((basis14->>'ordinary')::numeric+(basis14->>'in_kind')::numeric)/12,'gross',round(((basis14->>'ordinary')::numeric+(basis14->>'in_kind')::numeric)/12,2),'period_start',start14,'legal_basis','Ac.02-95 arts.2,6,7,9,10'));
  if future_amount is not null then raw:=raw||jsonb_build_array(jsonb_build_object('component','fixed_term','name','Indemnización por plazo restante','units',1,'unit_amount',future_amount,'gross',future_amount,'period_start',e.hire_date,'legal_basis','CT 121,123'));end if;
 end if;
 for item in select value from jsonb_array_elements(raw) loop
  if exists(select 1 from public.hr_benefit_credits c where c.tenant_id=tenant and c.employee_id=e.id and c.component=item->>'component' and c.period_start=(item->>'period_start')::date and c.currency<>benefit_currency and c.voided_at is null and c.leave_request_id is not distinct from (case when kind='Vacaciones' then r.id else null end)) then raise exception 'Existen pagos previos en otra moneda: concilia y documenta la conversión antes de calcular';end if;
  select coalesce(sum(c.amount),0),coalesce(jsonb_agg(jsonb_build_object('id',c.id,'amount',c.amount,'reference',c.reference) order by c.id),'[]') into credited,credits from public.hr_benefit_credits c
   where c.tenant_id=tenant and c.employee_id=e.id and c.component=item->>'component' and c.period_start=(item->>'period_start')::date and c.currency=benefit_currency and c.voided_at is null and c.leave_request_id is not distinct from (case when kind='Vacaciones' then r.id else null end);
  gross:=(item->>'gross')::numeric;net:=greatest(0,gross-credited);total:=total+net;
  lines:=lines||jsonb_build_array(item||jsonb_build_object('credited',credited,'credits',credits,'net',net,'excess_credit',greatest(0,credited-gross)));
 end loop;
 result:=jsonb_build_object('version','HN-GENERAL-2026-1','kind',kind,'employee_id',e.id,'employee_revision',e.revision,'employee_name',btrim(e.first_name||' '||e.last_name),'employee_code',e.employee_code,'hire_date',e.hire_date,'as_of',cutoff,'currency',benefit_currency,'contract',to_jsonb(t),'cause',cause,'microenterprise',micro,'cap_months',cap,'article120_excluded',exempt,'tenure_360',tenure,'ordinary_daily',daily_vac,'indemnity_daily',daily_indemnity,'basis6',basis6,'basis13',basis13,'basis14',basis14,'leave',case when kind='Vacaciones' then jsonb_build_object('id',r.id,'start_date',r.start_date,'end_date',r.end_date,'days',r.business_days) else null end,'lines',lines,'total',total,'proportional_by_policy',(p_input->>'favorable_proportional')::boolean is true);
 result:=result||jsonb_build_object('vacation_periods',periods,'vacation_partial_days',fraction_days,'vacation_advance_excess',advance_excess);
 return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;
revoke all on function public.hr_compute_benefits_internal(uuid,jsonb) from public,anon,authenticated;
create function public.hr_preview_benefits(p_employee uuid,p_input jsonb) returns jsonb language sql stable security definer set search_path=public as $$ select public.hr_compute_benefits_internal(p_employee,p_input) $$;
revoke all on function public.hr_preview_benefits(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hr_preview_benefits(uuid,jsonb) to authenticated;

create function public.hr_record_benefit_credit(p_request_id uuid,p_employee uuid,p_credit jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id();e public.hr_employees%rowtype;c public.hr_benefit_credits%rowtype;component text:=p_credit->>'component';period date:=(p_credit->>'period_start')::date;leave_id uuid:=nullif(p_credit->>'leave_request_id','')::uuid;amount numeric:=(p_credit->>'amount')::numeric;paid date:=(p_credit->>'paid_on')::date;result uuid;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Identificador requerido';end if;
 select * into e from public.hr_employees where id=p_employee and tenant_id=tenant for update;
 if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
 select * into c from public.hr_benefit_credits where tenant_id=tenant and request_id=p_request_id;
 if found then
  if c.employee_id<>e.id or c.component is distinct from component or c.period_start is distinct from period or c.leave_request_id is distinct from leave_id or c.amount is distinct from amount or c.currency is distinct from p_credit->>'currency' or c.reference is distinct from btrim(p_credit->>'reference') or c.source is distinct from btrim(p_credit->>'source') or c.paid_on is distinct from paid then raise exception 'El identificador pertenece a otro pago previo';end if;
  return c.id;
 end if;
 if paid is null or paid<e.hire_date or paid>current_date or amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<=0 or amount<>round(amount,2) then raise exception 'Revisa fecha e importe del pago previo efectivo';end if;
 if component in ('notice','severance','fixed_term','vacation_balance') and period is distinct from e.hire_date then raise exception 'El período de ese concepto comienza en el ingreso';end if;
 if component='bonus13' and (period is null or period<>date_trunc('year',period)::date or extract(year from period)<extract(year from e.hire_date) or period>paid) then raise exception 'El aguinaldo se identifica por el 1 de enero de su año';end if;
 if component='bonus14' and (period is null or extract(month from period)<>7 or extract(day from period)<>1 or period>paid or period<make_date(extract(year from e.hire_date)::integer-1,7,1)) then raise exception 'El décimo cuarto se identifica por el 1 de julio de su período';end if;
 if component='vacation' then
  if not exists(select 1 from public.hr_leave_requests where id=leave_id and employee_id=e.id and tenant_id=tenant and leave_type='Vacaciones' and start_date=period) then raise exception 'Vincula el pago previo a la solicitud de vacaciones';end if;
 elsif leave_id is not null then raise exception 'Ese concepto no se vincula a una solicitud de vacaciones';end if;
 insert into public.hr_benefit_credits(tenant_id,employee_id,request_id,component,period_start,leave_request_id,currency,amount,paid_on,reference,source,created_by)
 values(tenant,e.id,p_request_id,component,period,leave_id,p_credit->>'currency',amount,paid,btrim(p_credit->>'reference'),btrim(p_credit->>'source'),auth.uid()) returning id into result;
 return result;
end $$;

create function public.hr_void_benefit_credit(p_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.hr_benefit_credits%rowtype;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into c from public.hr_benefit_credits where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Pago previo no disponible' using errcode='42501';end if;
 perform 1 from public.hr_employees where id=c.employee_id for update;
 select * into c from public.hr_benefit_credits where id=p_id for update;
 if c.voided_at is not null then return c.id;end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Documenta el motivo de anulación del registro';end if;
 if exists(select 1 from public.hr_benefit_calculations b join public.hr_payroll_runs r on r.id=b.payroll_run_id where b.employee_id=c.employee_id and r.status<>'Anulada' and b.snapshot::text like '%'||c.id::text||'%') then raise exception 'El pago previo está aplicado a una nómina vigente; anula o revierte primero esa nómina';end if;
 update public.hr_benefit_credits set voided_at=now(),voided_by=auth.uid(),void_reason=left(btrim(p_reason),2000) where id=c.id;
 return c.id;
end $$;
revoke all on function public.hr_record_benefit_credit(uuid,uuid,jsonb),public.hr_void_benefit_credit(uuid,text) from public,anon,authenticated;
grant execute on function public.hr_record_benefit_credit(uuid,uuid,jsonb),public.hr_void_benefit_credit(uuid,text) to authenticated;

create function public.hr_create_benefit_payroll(p_request_id uuid,p_employee uuid,p_input jsonb,p_expected text,p_accounts jsonb,p_concepts jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id();existing public.hr_benefit_calculations%rowtype;snapshot jsonb;line jsonb;items jsonb:='[]';concept uuid;run uuid;calculation uuid:=gen_random_uuid();signature text:=md5(jsonb_build_array(p_employee,p_input,p_accounts,p_concepts)::text);doc jsonb;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Identificador requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-auto-benefit:'||tenant||':'||p_request_id,0));
 select * into existing from public.hr_benefit_calculations where tenant_id=tenant and request_id=p_request_id;
 if found then if existing.input_hash<>signature then raise exception 'El identificador pertenece a otro cálculo';end if;return existing.payroll_run_id;end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_employee,0));
 perform 1 from public.hr_employees where id=p_employee and tenant_id=tenant for update;
 if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
 snapshot:=public.hr_compute_benefits_internal(p_employee,p_input);
 if snapshot->>'fingerprint' is distinct from p_expected then raise exception 'Las bases, saldos o pagos previos cambiaron: vuelve a calcular y revisar';end if;
 if (snapshot->>'total')::numeric<=0 then raise exception 'El cálculo no genera un importe pendiente de pago';end if;
 if p_input->>'kind'='Liquidación' and exists(select 1 from public.hr_payroll_runs r join public.hr_payroll_entries e on e.run_id=r.id where e.employee_id=p_employee and r.kind='Liquidación' and r.status<>'Anulada') then raise exception 'El empleado ya tiene una liquidación vigente; revisa, anula o revierte antes de generar otra';end if;
 for line in select value from jsonb_array_elements(snapshot->'lines') loop
  if (line->>'net')::numeric>0 then
   concept:=nullif(p_concepts->>(line->>'component'),'')::uuid;
   if not exists(select 1 from public.hr_payroll_concepts c where c.id=concept and c.tenant_id=tenant and c.active and c.kind='Ingreso' and c.code<>'SALARIO_BASE') then raise exception 'Asigna un concepto de ingreso activo a cada importe calculado';end if;
   items:=items||jsonb_build_array(jsonb_build_object('concept_id',concept,'amount',(line->>'net')::numeric,'source','Cálculo automático '||calculation||' · '||(line->>'legal_basis')||' · Unidades '||(line->>'units')||' × base '||(line->>'unit_amount')||' · Reconocido antes '||(line->>'credited')));
  end if;
 end loop;
 -- Un concepto puede reunir varias prestaciones; conserva cada fórmula y evita líneas repetidas.
 select jsonb_agg(jsonb_build_object('concept_id',concept_id,'amount',amount,'source',source) order by concept_id) into items
 from (select value->>'concept_id' concept_id,sum((value->>'amount')::numeric) amount,string_agg(value->>'source',E'\n' order by value->>'source') source from jsonb_array_elements(items) group by value->>'concept_id') grouped;
 doc:=p_accounts||jsonb_build_object('kind',p_input->>'kind','currency',snapshot->>'currency','starts_on',case when p_input->>'kind'='Vacaciones' then snapshot->'leave'->>'start_date' else snapshot->>'as_of' end,
 'ends_on',case when p_input->>'kind'='Vacaciones' then snapshot->'leave'->>'end_date' else snapshot->>'as_of' end,'leave_request_id',p_input->>'leave_request_id','settlement_cause',coalesce(p_input->>'cause','')||' · '||coalesce(p_input->>'legal_source',''),
 'review_confirmed',true,'review_source','Cálculo automático '||calculation||' · Versión '||(snapshot->>'version')||' · Huella '||(snapshot->>'fingerprint')||' · Bases documentadas, régimen y pagos previos revisados. '||coalesce(p_input->>'legal_source','Vacaciones aprobadas con base comprobada'));
 run:=public.hr_create_payroll(p_request_id,doc,jsonb_build_array(jsonb_build_object('employee_id',p_employee,'paid_days',0,'items',items)));
 insert into public.hr_benefit_calculations(id,tenant_id,employee_id,request_id,input_hash,inputs,snapshot,fingerprint,payroll_run_id,created_by)
 values(calculation,tenant,p_employee,p_request_id,signature,p_input,snapshot,snapshot->>'fingerprint',run,auth.uid());
 return run;
end $$;
revoke all on function public.hr_create_benefit_payroll(uuid,uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hr_create_benefit_payroll(uuid,uuid,jsonb,text,jsonb,jsonb) to authenticated;

create function public.hr_validate_benefit_payroll_internal() returns trigger
language plpgsql security definer set search_path=public as $$
declare b public.hr_benefit_calculations%rowtype;snapshot jsonb;
begin
 if new.status=old.status or new.status not in ('Aprobada','Contabilizada') then return new;end if;
 select * into b from public.hr_benefit_calculations where payroll_run_id=new.id;
 if not found then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||b.tenant_id||':'||b.employee_id,0));
 perform 1 from public.hr_employees where id=b.employee_id for update;
 snapshot:=public.hr_compute_benefits_internal(b.employee_id,b.inputs);
 if snapshot->>'fingerprint' is distinct from b.fingerprint then raise exception 'El cálculo de prestaciones cambió; anula el borrador y vuelve a calcular antes de aprobar o contabilizar';end if;
 return new;
end $$;
revoke all on function public.hr_validate_benefit_payroll_internal() from public,anon,authenticated;
create trigger hr_validate_benefit_payroll before update of status on public.hr_payroll_runs for each row execute function public.hr_validate_benefit_payroll_internal();

create function public.hr_can_read_benefit_calculation(p_employee uuid,p_run uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.hr_is_internal_user() and public.hr_can_read_employee(p_employee) and exists(select 1 from public.hr_payroll_runs where id=p_run and tenant_id=public.current_tenant_id() and status in ('Aprobada','Contabilizada'))
$$;
revoke all on function public.hr_can_read_benefit_calculation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hr_can_read_benefit_calculation(uuid,uuid) to authenticated;
alter policy hr_benefit_calculation_read on public.hr_benefit_calculations using(tenant_id=public.current_tenant_id() and (public.hr_is_manager() or public.hr_can_read_benefit_calculation(employee_id,payroll_run_id)));

-- El comprobante propio enlaza únicamente su cálculo congelado; no revela otros contratos.
create or replace function public.hr_payslips(p_id uuid default null) returns setof jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',e.id,'run_id',r.id,'kind',r.kind,'starts_on',r.starts_on,'ends_on',r.ends_on,'pay_date',r.pay_date,'currency',r.currency,'status',r.status,
 'company',r.company_snapshot,'employee',e.employee_snapshot,'gross',e.gross,'deductions',e.deductions,'employer',e.employer,'net',e.net,
 'benefit_calculation_id',(select b.id from public.hr_benefit_calculations b where b.payroll_run_id=r.id and b.employee_id=e.employee_id),
 'items',(select jsonb_agg(jsonb_build_object('name',i->'concept'->>'name','kind',i->'concept'->>'kind','amount',i->'amount','source',i->>'source')) from jsonb_array_elements(e.items)i))
 from public.hr_payroll_entries e join public.hr_payroll_runs r on r.id=e.run_id
 where e.tenant_id=public.current_tenant_id() and public.hr_can_read_employee(e.employee_id)
 and (public.hr_is_manager() or r.status in ('Aprobada','Contabilizada')) and (p_id is null or e.id=p_id)
 order by r.pay_date desc,e.id limit 200
$$;
