-- HR-08: nómina y liquidaciones con importes legales revisados, snapshots y asiento atómico.
-- No se precargan salarios, tasas fiscales, cuentas ni exenciones de Sari.
create table public.hr_compensation (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),employee_id uuid not null references public.hr_employees(id),
 effective_from date not null,currency text not null check(currency in ('HNL','USD')),salary_mode text not null check(salary_mode in ('Fijo','Variable','Mixto')),
 monthly_salary numeric(16,2) not null check(monthly_salary>=0 and monthly_salary<100000000),
 frequency text not null check(frequency in ('Semanal','Catorcenal','Quincenal','Mensual')),
 source text not null check(length(btrim(source)) between 10 and 2000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(employee_id,effective_from),check((salary_mode='Variable' and monthly_salary=0) or (salary_mode<>'Variable' and monthly_salary>0))
);
create table public.hr_payroll_concepts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),code text not null,name text not null,
 kind text not null check(kind in ('Ingreso','Deducción','Aporte patronal')),debit_account_id uuid references public.accounting_accounts(id),credit_account_id uuid references public.accounting_accounts(id),
 active boolean not null default true,revision integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(tenant_id,code),check(length(code) between 1 and 30),check(length(btrim(name)) between 1 and 120),
 check((kind='Ingreso' and debit_account_id is not null and credit_account_id is null) or (kind='Deducción' and debit_account_id is null and credit_account_id is not null) or (kind='Aporte patronal' and debit_account_id is not null and credit_account_id is not null))
);
create table public.hr_payroll_runs (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),request_id uuid not null,input_hash text not null,
 kind text not null check(kind in ('Nómina','Vacaciones','Liquidación')),starts_on date not null,ends_on date not null,pay_date date not null,
 currency text not null check(currency in ('HNL','USD')),exchange_rate numeric(18,6) not null check(exchange_rate>0),
 payable_account_id uuid not null references public.accounting_accounts(id),status text not null default 'Borrador' check(status in ('Borrador','Aprobada','Contabilizada','Anulada')),
 leave_request_id uuid references public.hr_leave_requests(id),settlement_cause text,
 rounding_account_id uuid references public.accounting_accounts(id),exchange_rounding numeric(16,2) not null default 0,
 review_source text not null,company_snapshot jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),approved_at timestamptz,cancel_reason text,cancelled_by uuid references auth.users(id),cancelled_at timestamptz,journal_entry_id uuid references public.journal_entries(id),reversal_entry_id uuid references public.journal_entries(id),
 gross numeric(16,2) not null default 0,deductions numeric(16,2) not null default 0,employer numeric(16,2) not null default 0,net numeric(16,2) not null default 0,
 unique(tenant_id,request_id),check(ends_on>=starts_on and ends_on-starts_on<=366)
);
create table public.hr_payroll_entries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),run_id uuid not null references public.hr_payroll_runs(id),
 employee_id uuid not null references public.hr_employees(id),compensation_id uuid not null references public.hr_compensation(id),
 employee_snapshot jsonb not null,compensation_snapshot jsonb not null,paid_days numeric(6,2) not null,
 items jsonb not null,gross numeric(16,2) not null,deductions numeric(16,2) not null,employer numeric(16,2) not null,net numeric(16,2) not null,
 unique(run_id,employee_id),check(gross>=0 and deductions>=0 and employer>=0 and net>=0 and net=gross-deductions)
);
do $$declare t text;begin
 foreach t in array array['hr_compensation','hr_payroll_concepts','hr_payroll_runs','hr_payroll_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy hr_payroll_admin on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_is_manager())',t);
 end loop;
end $$;

create function public.hr_payroll_account(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.accounting_accounts where id=p_id and tenant_id=public.current_tenant_id() and active and postable and kind<>'Orden')
$$;
revoke all on function public.hr_payroll_account(uuid) from public,anon,authenticated;

create function public.hr_add_compensation(p_employee uuid,p_terms jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare e public.hr_employees%rowtype;d date:=(p_terms->>'effective_from')::date;amount numeric:=(p_terms->>'monthly_salary')::numeric;result uuid;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into e from public.hr_employees where id=p_employee and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if d is null or d<e.hire_date or amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) then raise exception 'Revisa vigencia e importe salarial';end if;
 select id into result from public.hr_compensation where employee_id=e.id and effective_from=d and currency=p_terms->>'currency' and salary_mode=p_terms->>'salary_mode' and monthly_salary=amount and frequency=p_terms->>'frequency' and source=btrim(p_terms->>'source');
 if found then return result;end if;
 if exists(select 1 from public.hr_compensation where employee_id=e.id and effective_from=d) then raise exception 'La vigencia ya está registrada; los contratos históricos no se sobrescriben';end if;
 if exists(select 1 from public.hr_payroll_entries l join public.hr_payroll_runs r on r.id=l.run_id where l.employee_id=e.id and r.status<>'Anulada' and r.ends_on>=d) then raise exception 'La vigencia se cruza con una nómina existente; anula el borrador o usa una vigencia posterior';end if;
 insert into public.hr_compensation(tenant_id,employee_id,effective_from,currency,salary_mode,monthly_salary,frequency,source,created_by)
 values(e.tenant_id,e.id,d,p_terms->>'currency',p_terms->>'salary_mode',amount,p_terms->>'frequency',btrim(p_terms->>'source'),auth.uid()) returning id into result;
 return result;
end $$;

create function public.hr_save_payroll_concept(p_id uuid,p_revision integer,p_concept jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.hr_payroll_concepts%rowtype;debit uuid:=nullif(p_concept->>'debit_account_id','')::uuid;credit uuid:=nullif(p_concept->>'credit_account_id','')::uuid;result uuid;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if upper(btrim(p_concept->>'code'))='SALARIO_BASE' and p_concept->>'kind' is distinct from 'Ingreso' then raise exception 'SALARIO_BASE debe ser un concepto de ingreso';end if;
 if (debit is not null and not public.hr_payroll_account(debit)) or (credit is not null and not public.hr_payroll_account(credit)) then raise exception 'Cuenta contable no disponible';end if;
 if debit is not null and not exists(select 1 from public.accounting_accounts where id=debit and kind='Gasto') then raise exception 'La cuenta de débito debe ser un gasto';end if;
 if credit is not null and not exists(select 1 from public.accounting_accounts where id=credit and kind in ('Pasivo','Activo')) then raise exception 'La cuenta de crédito debe ser obligación o recuperación de anticipo';end if;
 if p_id is null then
  insert into public.hr_payroll_concepts(tenant_id,code,name,kind,debit_account_id,credit_account_id,updated_by)
  values(public.current_tenant_id(),upper(btrim(p_concept->>'code')),btrim(p_concept->>'name'),p_concept->>'kind',debit,credit,auth.uid()) returning id into result;
 else
  select * into c from public.hr_payroll_concepts where id=p_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Concepto no disponible' using errcode='42501';end if;
  if c.revision is distinct from p_revision then raise exception 'El concepto cambió; recarga antes de guardar';end if;
  update public.hr_payroll_concepts set name=btrim(p_concept->>'name'),debit_account_id=debit,credit_account_id=credit,active=coalesce((p_concept->>'active')::boolean,true),revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
  result:=c.id;
 end if;
 return result;
end $$;

create function public.hr_create_payroll(p_request_id uuid,p_run jsonb,p_employees jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id();result uuid;existing public.hr_payroll_runs%rowtype;run public.hr_payroll_runs%rowtype;
 e public.hr_employees%rowtype;t public.hr_compensation%rowtype;c public.hr_payroll_concepts%rowtype;
 person jsonb;item jsonb;items jsonb;amount numeric;days numeric;gross numeric;deductions numeric;employer numeric;fingerprint text:=md5(jsonb_build_array(p_run,p_employees)::text);base numeric;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Identificador requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-payroll:'||tenant||':'||p_request_id,0));
 select * into existing from public.hr_payroll_runs where tenant_id=tenant and request_id=p_request_id;
 if found then
  if existing.input_hash<>fingerprint then raise exception 'El identificador pertenece a otro contenido';end if;
  return existing.id;
 end if;
 if jsonb_typeof(p_employees) is distinct from 'array' or jsonb_array_length(p_employees) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 empleados';end if;
 if length(btrim(coalesce(p_run->>'review_source',''))) not between 20 and 4000 then raise exception 'Documenta revisión de IHSS, RAP, ISR, pagos previos, vacaciones y prestaciones, incluso cuando no aplican';end if;
 if (p_run->>'review_confirmed')::boolean is distinct from true then raise exception 'Confirma la revisión de obligaciones y prestaciones';end if;
 if not public.hr_payroll_account((p_run->>'payable_account_id')::uuid) then raise exception 'Configura la cuenta de remuneraciones por pagar';end if;
 if not exists(select 1 from public.accounting_accounts where id=(p_run->>'payable_account_id')::uuid and kind='Pasivo') then raise exception 'Remuneraciones por pagar debe ser una cuenta de pasivo';end if;
 if (p_run->>'currency'<>'HNL' or nullif(p_run->>'rounding_account_id','') is not null) and not exists(select 1 from public.accounting_accounts where id=nullif(p_run->>'rounding_account_id','')::uuid and tenant_id=tenant and active and postable and kind in ('Gasto','Ingreso')) then raise exception 'Configura la cuenta de ajuste por redondeo cambiario';end if;
 insert into public.hr_payroll_runs(tenant_id,request_id,input_hash,kind,starts_on,ends_on,pay_date,currency,exchange_rate,payable_account_id,leave_request_id,settlement_cause,review_source,company_snapshot,created_by)
 values(tenant,p_request_id,fingerprint,p_run->>'kind',(p_run->>'starts_on')::date,(p_run->>'ends_on')::date,(p_run->>'pay_date')::date,p_run->>'currency',(p_run->>'exchange_rate')::numeric,(p_run->>'payable_account_id')::uuid,nullif(p_run->>'leave_request_id','')::uuid,nullif(btrim(p_run->>'settlement_cause'),''),btrim(p_run->>'review_source'),
 (select jsonb_build_object('name',coalesce(nullif(btrim(s.legal_name),''),company_tenant.name),'rtn',s.rtn,'address',s.address) from public.tenants company_tenant left join public.company_settings s on s.tenant_id=company_tenant.id where company_tenant.id=tenant),auth.uid()) returning * into run;
 update public.hr_payroll_runs set rounding_account_id=nullif(p_run->>'rounding_account_id','')::uuid where id=run.id;
 if run.currency='HNL' and run.exchange_rate<>1 or run.exchange_rate::text in ('NaN','Infinity','-Infinity') or run.exchange_rate>1000000 or (run.kind<>'Vacaciones' and run.pay_date<run.ends_on) then raise exception 'Revisa moneda, tipo de cambio y fecha de pago';end if;
 if run.kind='Vacaciones' and (jsonb_array_length(p_employees)<>1 or run.leave_request_id is null or run.pay_date>run.starts_on-3) then raise exception 'Vincula vacaciones aprobadas para un empleado y paga al menos tres días antes del inicio (art. 348)';end if;
 if run.kind='Liquidación' and length(coalesce(run.settlement_cause,''))<10 then raise exception 'Documenta la causal y procedencia de la liquidación';end if;
 for person in select value from jsonb_array_elements(p_employees) order by value->>'employee_id' loop
  select * into e from public.hr_employees where id=(person->>'employee_id')::uuid and tenant_id=tenant for update;
  if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
  if run.kind='Vacaciones' and not exists(select 1 from public.hr_leave_requests where id=run.leave_request_id and tenant_id=tenant and employee_id=e.id and leave_type='Vacaciones' and status='Aprobada' and start_date=run.starts_on and end_date=run.ends_on) then raise exception 'Las fechas deben coincidir con vacaciones aprobadas del empleado';end if;
  if run.starts_on<e.hire_date or (e.termination_date is not null and run.ends_on>e.termination_date) then raise exception 'El período se encuentra fuera de la relación laboral';end if;
  if exists(select 1 from public.hr_payroll_entries l join public.hr_payroll_runs r on r.id=l.run_id where l.employee_id=e.id and r.kind=run.kind and r.status<>'Anulada' and r.starts_on<=run.ends_on and r.ends_on>=run.starts_on) then raise exception 'Ya existe una nómina o liquidación de este tipo en el período';end if;
  select * into t from public.hr_compensation where employee_id=e.id and effective_from<=run.starts_on order by effective_from desc limit 1;
  if not found or t.currency<>run.currency then raise exception 'Faltan condiciones salariales vigentes en la moneda elegida';end if;
  if exists(select 1 from public.hr_compensation where employee_id=e.id and effective_from>run.starts_on and effective_from<=run.ends_on) then raise exception 'Divide el período por el cambio de salario';end if;
  if run.kind='Nómina' and run.ends_on-run.starts_on+1>(case t.frequency when 'Semanal' then 7 when 'Catorcenal' then 14 when 'Quincenal' then 16 else 31 end) then raise exception 'El rango supera la frecuencia del contrato';end if;
  days:=(person->>'paid_days')::numeric;
  if days is null or days::text in ('NaN','Infinity','-Infinity') or days<0 or days>30 or days<>round(days,2) or (run.kind<>'Nómina' and days<>0) then raise exception 'Revisa los días pagables (0 a 30); vacaciones y liquidación no incluyen salario base automático';end if;
  if days>(case when run.starts_on=date_trunc('month',run.starts_on)::date and run.ends_on=(date_trunc('month',run.starts_on)+interval '1 month' - interval '1 day')::date then 30 else least(30,run.ends_on-run.starts_on+1) end) then raise exception 'Los días pagables exceden el período';end if;
  base:=round(t.monthly_salary*days/30,2);items:='[]';gross:=0;deductions:=0;employer:=0;
  if base>0 then
   select * into c from public.hr_payroll_concepts where tenant_id=tenant and code='SALARIO_BASE' and kind='Ingreso' and active;
   if not found then raise exception 'Configura SALARIO_BASE como ingreso';end if;
   items:=items||jsonb_build_array(jsonb_build_object('concept',to_jsonb(c),'amount',base,'source','Salario mensual contractual / 30 × días pagables confirmados'));gross:=base;
  end if;
  if jsonb_typeof(person->'items') is distinct from 'array' or jsonb_array_length(person->'items')>50 then raise exception 'Revisa conceptos adicionales';end if;
  for item in select value from jsonb_array_elements(person->'items') loop
   select * into c from public.hr_payroll_concepts where tenant_id=tenant and id=(item->>'concept_id')::uuid and active and code<>'SALARIO_BASE';
   if not found then raise exception 'Concepto no disponible';end if;
   if exists(select 1 from jsonb_array_elements(items)x where x->'concept'->>'id'=c.id::text) then raise exception 'No repitas conceptos en el empleado';end if;
   amount:=(item->>'amount')::numeric;
   if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<0 or amount>100000000 or amount<>round(amount,2) or length(btrim(coalesce(item->>'source','')))<10 then raise exception 'Cada concepto requiere importe válido y soporte de cálculo, incluso si es cero';end if;
   items:=items||jsonb_build_array(jsonb_build_object('concept',to_jsonb(c),'amount',amount,'source',left(btrim(item->>'source'),2000)));
   if c.kind='Ingreso' then gross:=gross+amount;elsif c.kind='Deducción' then deductions:=deductions+amount;else employer:=employer+amount;end if;
  end loop;
  if gross<=0 or deductions>gross then raise exception 'El bruto debe ser positivo y las deducciones no pueden superar el ingreso';end if;
  insert into public.hr_payroll_entries(tenant_id,run_id,employee_id,compensation_id,employee_snapshot,compensation_snapshot,paid_days,items,gross,deductions,employer,net)
  values(tenant,run.id,e.id,t.id,jsonb_build_object('code',e.employee_code,'name',btrim(e.first_name||' '||e.last_name),'hire_date',e.hire_date,'termination_date',e.termination_date),to_jsonb(t),days,items,gross,deductions,employer,gross-deductions);
 end loop;
 update public.hr_payroll_runs r set gross=x.gross,deductions=x.deductions,employer=x.employer,net=x.net from (select sum(l.gross)gross,sum(l.deductions)deductions,sum(l.employer)employer,sum(l.net)net from public.hr_payroll_entries l where l.run_id=run.id)x where r.id=run.id;
 return run.id;
end $$;

create function public.hr_review_payroll(p_id uuid,p_action text,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.hr_payroll_runs%rowtype;lines jsonb;entry uuid;difference numeric;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into r from public.hr_payroll_runs where id=p_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Nómina no disponible' using errcode='42501';end if;
 if r.kind='Vacaciones' and r.status in ('Borrador','Aprobada') and p_action in ('Aprobar','Contabilizar') then
  perform 1 from public.hr_leave_requests where id=r.leave_request_id and tenant_id=r.tenant_id and status='Aprobada' and start_date=r.starts_on and end_date=r.ends_on for share;
  if not found then raise exception 'Las vacaciones cambiaron; anula el borrador y revisa el pago';end if;
 end if;
 if p_action='Aprobar' then
  if r.status in ('Aprobada','Contabilizada') then return r.id;end if;
  if r.status<>'Borrador' then raise exception 'La nómina no es un borrador';end if;
  update public.hr_payroll_runs set status='Aprobada',approved_by=auth.uid(),approved_at=now() where id=r.id;
 elsif p_action='Anular' then
  if r.status='Anulada' then return r.id;end if;
  if r.status='Contabilizada' then raise exception 'Una nómina contabilizada requiere reversión contable; no puede anularse aquí';end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Documenta el motivo de anulación';end if;
  update public.hr_payroll_runs set status='Anulada',cancel_reason=btrim(p_reason),cancelled_by=auth.uid(),cancelled_at=now() where id=r.id;
 elsif p_action='Revertir' then
  if r.status='Anulada' and r.reversal_entry_id is not null then return r.reversal_entry_id;end if;
  if r.status<>'Contabilizada' or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Selecciona una nómina contabilizada e indica motivo de reversión';end if;
  entry:=public.reverse_journal_internal(r.journal_entry_id,current_date,btrim(p_reason));
  update public.hr_payroll_runs set status='Anulada',cancel_reason=btrim(p_reason),cancelled_by=auth.uid(),cancelled_at=now(),reversal_entry_id=entry where id=r.id;
  return entry;
 elsif p_action='Contabilizar' then
  if r.status='Contabilizada' then return r.journal_entry_id;end if;
  if r.status<>'Aprobada' then raise exception 'Aprueba la nómina antes de contabilizar';end if;
  if not exists(select 1 from public.accounting_accounts a where a.id=r.payable_account_id and a.tenant_id=r.tenant_id and a.kind='Pasivo' and a.active and a.postable)
   or exists(select 1 from public.hr_payroll_entries e cross join lateral jsonb_array_elements(e.items)i where e.run_id=r.id and (
    (i->'concept'->>'debit_account_id' is not null and not exists(select 1 from public.accounting_accounts a where a.id=(i->'concept'->>'debit_account_id')::uuid and a.tenant_id=r.tenant_id and a.kind='Gasto' and a.active and a.postable))
    or (i->'concept'->>'credit_account_id' is not null and not exists(select 1 from public.accounting_accounts a where a.id=(i->'concept'->>'credit_account_id')::uuid and a.tenant_id=r.tenant_id and a.kind in ('Pasivo','Activo') and a.active and a.postable))
   )) then raise exception 'Las cuentas del borrador cambiaron o ya no están disponibles; revisa la nómina';end if;
  -- Agrupar por cuenta antes de convertir moneda evita residuos por empleado.
  select jsonb_agg(jsonb_build_object('account_id',a.account_id,'debit',round(a.debit*r.exchange_rate,2),'credit',round(a.credit*r.exchange_rate,2),'description',r.kind||' de RRHH')) into lines from (
   select account_id,sum(debit)debit,sum(credit)credit from (
    select (i->'concept'->>'debit_account_id')::uuid account_id,(i->>'amount')::numeric debit,0::numeric credit from public.hr_payroll_entries e cross join lateral jsonb_array_elements(e.items)i where e.run_id=r.id and i->'concept'->>'debit_account_id' is not null and (i->>'amount')::numeric>0
    union all select (i->'concept'->>'credit_account_id')::uuid,0,(i->>'amount')::numeric from public.hr_payroll_entries e cross join lateral jsonb_array_elements(e.items)i where e.run_id=r.id and i->'concept'->>'credit_account_id' is not null and (i->>'amount')::numeric>0
    union all select r.payable_account_id,0,r.net where r.net>0
   )raw group by account_id
  )a;
  select coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric),0) into difference from jsonb_array_elements(lines)l;
  if difference<>0 then
   if not exists(select 1 from public.accounting_accounts a where a.id=r.rounding_account_id and a.tenant_id=r.tenant_id and a.kind in ('Gasto','Ingreso') and a.active and a.postable) or abs(difference)>jsonb_array_length(lines)*0.01 then raise exception 'Revisa la cuenta de redondeo y el balance cambiario';end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('account_id',r.rounding_account_id,'debit',greatest(-difference,0),'credit',greatest(difference,0),'description','Redondeo de conversión de nómina a HNL'));
  end if;
  select jsonb_agg(l) into lines from jsonb_array_elements(lines)l where (l->>'debit')::numeric>0 or (l->>'credit')::numeric>0;
  entry:=public.post_journal_internal(r.pay_date,r.kind||' de RRHH '||to_char(r.starts_on,'DD/MM/YYYY')||' - '||to_char(r.ends_on,'DD/MM/YYYY'),'hr_payroll',r.id,'hr-payroll:'||r.id,lines,r.currency,r.exchange_rate,r.gross+r.employer);
  update public.hr_payroll_runs set status='Contabilizada',journal_entry_id=entry,exchange_rounding=difference where id=r.id;
  return entry;
 else raise exception 'Acción no disponible';end if;
 return r.id;
end $$;
revoke all on function public.hr_add_compensation(uuid,jsonb),public.hr_save_payroll_concept(uuid,integer,jsonb),public.hr_create_payroll(uuid,jsonb,jsonb),public.hr_review_payroll(uuid,text,text) from public,anon,authenticated;
grant execute on function public.hr_add_compensation(uuid,jsonb),public.hr_save_payroll_concept(uuid,integer,jsonb),public.hr_create_payroll(uuid,jsonb,jsonb),public.hr_review_payroll(uuid,text,text) to authenticated;

create function public.hr_payslips(p_id uuid default null) returns setof jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',e.id,'run_id',r.id,'kind',r.kind,'starts_on',r.starts_on,'ends_on',r.ends_on,'pay_date',r.pay_date,'currency',r.currency,'status',r.status,
 'company',r.company_snapshot,'employee',e.employee_snapshot,'gross',e.gross,'deductions',e.deductions,'employer',e.employer,'net',e.net,
 'items',(select jsonb_agg(jsonb_build_object('name',i->'concept'->>'name','kind',i->'concept'->>'kind','amount',i->'amount','source',i->>'source')) from jsonb_array_elements(e.items)i))
 from public.hr_payroll_entries e join public.hr_payroll_runs r on r.id=e.run_id
 where e.tenant_id=public.current_tenant_id() and public.hr_can_read_employee(e.employee_id)
 and (public.hr_is_manager() or r.status in ('Aprobada','Contabilizada')) and (p_id is null or e.id=p_id)
 order by r.pay_date desc,e.id limit 200
$$;
revoke all on function public.hr_payslips(uuid) from public,anon,authenticated;
grant execute on function public.hr_payslips(uuid) to authenticated;
