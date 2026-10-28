-- Etapa 4. Configuración vacía: no inventa catálogo, fecha de apertura ni saldos.
create table public.accounting_accounts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 code text not null check(code ~ '^[A-Za-z0-9][A-Za-z0-9.\-]{0,39}$'),name text not null check(length(btrim(name)) between 1 and 160),
 kind text not null check(kind in ('Activo','Pasivo','Patrimonio','Ingreso','Gasto')),
 parent_id uuid,postable boolean not null default true,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,code),foreign key(tenant_id,parent_id) references public.accounting_accounts(tenant_id,id),check(parent_id is distinct from id)
);
create table public.accounting_periods (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 starts_on date not null,ends_on date not null,closed boolean not null default false,
 closed_at timestamptz,closed_by uuid references auth.users(id),check(starts_on<=ends_on),unique(tenant_id,id),unique(tenant_id,starts_on)
);
create table public.accounting_settings (
 tenant_id uuid primary key default public.current_tenant_id() references public.tenants(id),
 automatic_posting boolean not null default false,starts_on date,
 updated_at timestamptz not null default now(),check(not automatic_posting or starts_on is not null)
);
create table public.accounting_mappings (
 tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 purpose text not null check(purpose in ('receivable','payable','cash','customer_advances','sales','purchases','sales_tax','purchase_tax','exchange_gain','exchange_loss')),
 account_id uuid not null,primary key(tenant_id,purpose),foreign key(tenant_id,account_id) references public.accounting_accounts(tenant_id,id)
);
create table public.journal_entries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 entry_number bigint not null,entry_date date not null,description text not null check(length(btrim(description)) between 1 and 2000),
 source_type text not null,source_id uuid,source_key text not null,
 source_currency text not null default 'HNL' check(source_currency in ('HNL','USD')),exchange_rate numeric(18,6) not null default 1 check(exchange_rate>0 and exchange_rate<=1000000),
 original_total numeric(14,2),reverses_id uuid,reversed_by_id uuid,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(tenant_id,id),unique(tenant_id,entry_number),unique(tenant_id,source_key),unique(reverses_id),
 foreign key(tenant_id,reverses_id) references public.journal_entries(tenant_id,id),foreign key(tenant_id,reversed_by_id) references public.journal_entries(tenant_id,id)
);
create table public.journal_lines (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
 entry_id uuid not null,account_id uuid not null,account_code text not null,account_name text not null,
 debit numeric(14,2) not null default 0,credit numeric(14,2) not null default 0,description text not null default '',sort_order integer not null,
 check(debit>=0 and credit>=0 and debit::text<>'NaN' and credit::text<>'NaN' and ((debit>0 and credit=0) or (credit>0 and debit=0))),
 unique(entry_id,sort_order),foreign key(tenant_id,entry_id) references public.journal_entries(tenant_id,id),foreign key(tenant_id,account_id) references public.accounting_accounts(tenant_id,id)
);
create index journal_lines_account_idx on public.journal_lines(tenant_id,account_id,entry_id);
create index journal_entries_date_idx on public.journal_entries(tenant_id,entry_date,id);

do $$ declare table_name text; begin
 foreach table_name in array array['accounting_accounts','accounting_periods','accounting_settings','accounting_mappings','journal_entries','journal_lines'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('create policy finance_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);
  execute format('grant select on public.%I to authenticated',table_name);
 end loop;
end $$;

create function public.save_accounting_account(p_account jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare account_id uuid:=nullif(p_account->>'id','')::uuid; parent uuid:=nullif(p_account->>'parent_id','')::uuid; previous public.accounting_accounts%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 if parent is not null and not exists(select 1 from public.accounting_accounts where id=parent and tenant_id=public.current_tenant_id() and not postable and kind=p_account->>'kind') then raise exception 'La cuenta padre debe ser agrupadora del mismo tipo y empresa'; end if;
 if account_id is not null then
  select * into previous from public.accounting_accounts where id=account_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Cuenta no disponible'; end if;
  if exists(select 1 from public.journal_lines l where l.account_id=previous.id) and
    (previous.code is distinct from p_account->>'code' or previous.kind is distinct from p_account->>'kind' or not coalesce((p_account->>'postable')::boolean,true)) then raise exception 'Una cuenta con movimientos conserva código, tipo y capacidad de movimiento'; end if;
  if exists(with recursive parents as(select id,parent_id from public.accounting_accounts where id=parent union all
    select a.id,a.parent_id from public.accounting_accounts a join parents p on a.id=p.parent_id) select 1 from parents where id=account_id) then raise exception 'Jerarquía circular'; end if;
  if exists(select 1 from public.accounting_accounts where parent_id=account_id) and
    (coalesce((p_account->>'postable')::boolean,true) or previous.kind is distinct from p_account->>'kind') then raise exception 'Una cuenta con hijas debe seguir siendo agrupadora del mismo tipo'; end if;
  update public.accounting_accounts set code=btrim(p_account->>'code'),name=btrim(p_account->>'name'),kind=p_account->>'kind',parent_id=parent,
    postable=coalesce((p_account->>'postable')::boolean,true),active=coalesce((p_account->>'active')::boolean,true),updated_at=now() where id=account_id;
 else
  insert into public.accounting_accounts(tenant_id,code,name,kind,parent_id,postable,active) values(public.current_tenant_id(),btrim(p_account->>'code'),btrim(p_account->>'name'),p_account->>'kind',parent,
    coalesce((p_account->>'postable')::boolean,true),coalesce((p_account->>'active')::boolean,true)) returning id into account_id;
 end if;
 return account_id;
end $$;

create function public.import_accounting_accounts(p_accounts jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare line jsonb; parent uuid; imported integer:=0;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_accounts) is distinct from 'array' or jsonb_array_length(p_accounts) not between 1 and 1000 then raise exception 'Importa entre 1 y 1000 cuentas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 for line in select value from jsonb_array_elements(p_accounts) loop
  parent:=null;
  if nullif(btrim(line->>'parent_code'),'') is not null then
   select id into parent from public.accounting_accounts where tenant_id=public.current_tenant_id() and code=btrim(line->>'parent_code');
   if not found then raise exception 'Importa la cuenta padre % antes de sus hijas',line->>'parent_code'; end if;
  end if;
  perform public.save_accounting_account((line-'id')||jsonb_build_object('parent_id',parent));imported:=imported+1;
 end loop;
 return imported;
end $$;

create function public.manage_accounting_period(p_start date,p_end date,p_closed boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare period public.accounting_periods%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_start>p_end then raise exception 'Fechas inválidas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 select * into period from public.accounting_periods where tenant_id=public.current_tenant_id() and starts_on=p_start for update;
 if found then
  if period.ends_on<>p_end then raise exception 'No cambies los límites de un período existente'; end if;
  if period.closed and not p_closed then raise exception 'Un período cerrado no se reabre; registra ajustes en un período abierto'; end if;
  update public.accounting_periods set closed=p_closed,closed_at=case when p_closed then now() end,closed_by=case when p_closed then auth.uid() end where id=period.id;
 else
  if exists(select 1 from public.accounting_periods where tenant_id=public.current_tenant_id() and starts_on<=p_end and ends_on>=p_start) then raise exception 'El período se solapa con otro'; end if;
  insert into public.accounting_periods(tenant_id,starts_on,ends_on,closed,closed_at,closed_by) values(public.current_tenant_id(),p_start,p_end,p_closed,case when p_closed then now() end,case when p_closed then auth.uid() end) returning * into period;
 end if;
 return period.id;
end $$;

create function public.save_accounting_settings(p_automatic boolean,p_start date,p_mappings jsonb) returns void language plpgsql security definer set search_path=public as $$
declare mapping record; expected_kind text;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_mappings) is distinct from 'object' then raise exception 'Asignaciones inválidas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 for mapping in select * from jsonb_each_text(p_mappings) loop
  if mapping.value is null or mapping.value='' then delete from public.accounting_mappings where tenant_id=public.current_tenant_id() and purpose=mapping.key;continue;end if;
  expected_kind:=case mapping.key when 'receivable' then 'Activo' when 'cash' then 'Activo' when 'purchase_tax' then 'Activo'
    when 'payable' then 'Pasivo' when 'customer_advances' then 'Pasivo' when 'sales_tax' then 'Pasivo'
    when 'sales' then 'Ingreso' when 'exchange_gain' then 'Ingreso' when 'purchases' then 'Gasto' when 'exchange_loss' then 'Gasto' end;
  if expected_kind is null or not exists(select 1 from public.accounting_accounts where id=mapping.value::uuid and tenant_id=public.current_tenant_id() and active and postable and kind=expected_kind) then raise exception 'Cuenta incompatible para %',mapping.key; end if;
  insert into public.accounting_mappings(tenant_id,purpose,account_id) values(public.current_tenant_id(),mapping.key,mapping.value::uuid)
    on conflict(tenant_id,purpose) do update set account_id=excluded.account_id;
 end loop;
 if p_automatic then
  if p_start is null or not exists(select 1 from public.accounting_periods where tenant_id=public.current_tenant_id() and p_start between starts_on and ends_on and not closed) then raise exception 'Selecciona una fecha de inicio dentro de un período abierto'; end if;
  if (select count(*) from public.accounting_mappings where tenant_id=public.current_tenant_id() and purpose in ('receivable','payable','cash','customer_advances','sales','purchases','sales_tax','purchase_tax'))<8 then raise exception 'Completa las ocho cuentas operativas antes de activar'; end if;
 end if;
 if exists(select 1 from public.journal_entries where tenant_id=public.current_tenant_id()) and exists(select 1 from public.accounting_settings where tenant_id=public.current_tenant_id() and starts_on is distinct from p_start) then raise exception 'La fecha de inicio con asientos existentes no se cambia'; end if;
 insert into public.accounting_settings(tenant_id,automatic_posting,starts_on) values(public.current_tenant_id(),coalesce(p_automatic,false),p_start)
   on conflict(tenant_id) do update set automatic_posting=excluded.automatic_posting,starts_on=excluded.starts_on,updated_at=now();
end $$;

create function public.post_journal_internal(p_date date,p_description text,p_source_type text,p_source_id uuid,p_source_key text,p_lines jsonb,
 p_currency text default 'HNL',p_rate numeric default 1,p_original_total numeric default null,p_reverses uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare entry_id uuid; line jsonb; account public.accounting_accounts%rowtype; debit numeric; credit numeric; total_debit numeric:=0;total_credit numeric:=0;seq bigint;position integer:=0;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 select id into entry_id from public.journal_entries where tenant_id=public.current_tenant_id() and source_key=p_source_key;
 if found then return entry_id; end if;
 if p_date is null or p_date>current_date or nullif(btrim(p_description),'') is null or length(p_description)>2000 then raise exception 'Revisa fecha y concepto del asiento'; end if;
 if not exists(select 1 from public.accounting_periods where tenant_id=public.current_tenant_id() and p_date between starts_on and ends_on and not closed) then raise exception 'La fecha no pertenece a un período contable abierto'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 2 and 500 then raise exception 'Un asiento requiere entre 2 y 500 líneas'; end if;
 select coalesce(max(entry_number),0)+1 into seq from public.journal_entries where tenant_id=public.current_tenant_id();
 insert into public.journal_entries(tenant_id,entry_number,entry_date,description,source_type,source_id,source_key,source_currency,exchange_rate,original_total,reverses_id,created_by)
 values(public.current_tenant_id(),seq,p_date,btrim(p_description),p_source_type,p_source_id,p_source_key,p_currency,p_rate,p_original_total,p_reverses,auth.uid()) returning id into entry_id;
 for line in select value from jsonb_array_elements(p_lines) loop
  debit:=coalesce((line->>'debit')::numeric,0);credit:=coalesce((line->>'credit')::numeric,0);
  if debit::text in ('NaN','Infinity','-Infinity') or credit::text in ('NaN','Infinity','-Infinity') or debit<0 or credit<0 or (debit>0)=(credit>0) or debit<>round(debit,2) or credit<>round(credit,2) then raise exception 'Cada línea requiere solo débito o crédito positivo con dos decimales'; end if;
  select * into account from public.accounting_accounts where id=(line->>'account_id')::uuid and tenant_id=public.current_tenant_id() and postable and (active or p_reverses is not null);
  if not found then raise exception 'Cuenta no disponible para contabilizar'; end if;
  position:=position+1;total_debit:=total_debit+debit;total_credit:=total_credit+credit;
  insert into public.journal_lines(tenant_id,entry_id,account_id,account_code,account_name,debit,credit,description,sort_order)
    values(public.current_tenant_id(),entry_id,account.id,account.code,account.name,debit,credit,left(coalesce(line->>'description',''),2000),position);
 end loop;
 if total_debit<>total_credit or total_debit<=0 then raise exception 'Asiento desbalanceado: debe %, haber %',total_debit,total_credit; end if;
 return entry_id;
end $$;
revoke all on function public.post_journal_internal(date,text,text,uuid,text,jsonb,text,numeric,numeric,uuid) from public,anon,authenticated;

create function public.create_manual_journal(p_request_id uuid,p_date date,p_description text,p_lines jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 if p_request_id is null then raise exception 'Identificador de solicitud requerido'; end if;
 return public.post_journal_internal(p_date,p_description,'Manual',p_request_id,'manual:'||p_request_id,p_lines);
end $$;

create function public.reverse_journal_internal(p_entry_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare original public.journal_entries%rowtype; lines jsonb; reversal uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('journal:'||public.current_tenant_id()::text,0));
 select * into original from public.journal_entries where id=p_entry_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Asiento no disponible'; end if;
 if original.reversed_by_id is not null then return original.reversed_by_id; end if;
 if original.reverses_id is not null then raise exception 'No se revierte un reverso'; end if;
 if p_date<original.entry_date or nullif(btrim(p_reason),'') is null then raise exception 'Revisa fecha y motivo del reverso'; end if;
 select jsonb_agg(jsonb_build_object('account_id',account_id,'debit',credit,'credit',debit,'description',description) order by sort_order) into lines from public.journal_lines where entry_id=original.id;
 reversal:=public.post_journal_internal(p_date,'Reverso #'||original.entry_number||': '||p_reason,'Reverso',original.id,'reverse:'||original.id,lines,original.source_currency,original.exchange_rate,original.original_total,original.id);
 update public.journal_entries set reversed_by_id=reversal where id=original.id;
 return reversal;
end $$;
revoke all on function public.reverse_journal_internal(uuid,date,text) from public,anon,authenticated;
create function public.reverse_journal(p_entry_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.journal_entries where id=p_entry_id and tenant_id=public.current_tenant_id() and source_type='Manual') then raise exception 'Revierte el documento de origen para corregir su asiento automático'; end if;
 return public.reverse_journal_internal(p_entry_id,p_date,p_reason);
end $$;

create function public.check_balanced_journal() returns trigger language plpgsql set search_path=public as $$
declare target uuid;debit numeric;credit numeric;line_count integer;
begin
 if tg_table_name='journal_entries' then target:=new.id;else target:=new.entry_id;end if;
 select sum(l.debit),sum(l.credit),count(*) into debit,credit,line_count from public.journal_lines l where l.entry_id=target;
 if line_count<2 or debit is distinct from credit then raise exception 'Integridad contable: asiento desbalanceado'; end if;
 return null;
end $$;
create constraint trigger journal_header_balanced after insert on public.journal_entries deferrable initially deferred for each row execute function public.check_balanced_journal();
create constraint trigger journal_lines_balanced after insert on public.journal_lines deferrable initially deferred for each row execute function public.check_balanced_journal();
create function public.guard_posted_journal() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and tg_table_name='journal_entries' and current_user not in ('authenticated','anon') then
  if (to_jsonb(new)-'reversed_by_id')=(to_jsonb(old)-'reversed_by_id') and old.reversed_by_id is null and new.reversed_by_id is not null then return new; end if;
 end if;
 raise exception 'Los asientos contabilizados son inmutables; utiliza un reverso';
end $$;
create trigger journal_entries_immutable before update or delete on public.journal_entries for each row execute function public.guard_posted_journal();
create trigger journal_lines_immutable before update or delete on public.journal_lines for each row execute function public.guard_posted_journal();

create function public.account_for(p_purpose text) returns uuid language plpgsql stable security definer set search_path=public as $$
declare account uuid;
begin
 select m.account_id into account from public.accounting_mappings m join public.accounting_accounts a on a.id=m.account_id
 where m.tenant_id=public.current_tenant_id() and m.purpose=p_purpose and a.active and a.postable;
 if account is null then raise exception 'Configura una cuenta activa para %',p_purpose; end if;
 return account;
end $$;

create function public.post_invoice_journal(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice public.invoices%rowtype; lines jsonb; gross numeric;tax numeric;net numeric;reversal boolean;result uuid;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into invoice from public.invoices where id=p_invoice_id and tenant_id=public.current_tenant_id() and deleted_at is null for update;
 if not found or invoice.invoice_type='Proforma' or invoice.status in ('Borrador','Anulada') then raise exception 'El documento no está emitido'; end if;
 if not exists(select 1 from public.accounting_settings where tenant_id=invoice.tenant_id and starts_on is not null and invoice.issue_date>=starts_on) then raise exception 'Configura la fecha de inicio contable antes de contabilizar documentos'; end if;
 gross:=case when invoice.currency='USD' then round(invoice.total*invoice.exchange_rate,2) else invoice.total end;
 tax:=round(invoice.tax_amount*case when invoice.currency='USD' then invoice.exchange_rate else 1 end,2);net:=gross-tax;
 if gross<=0 then raise exception 'Documento sin importe contable'; end if;
 reversal:=invoice.invoice_type='Nota de Crédito';
 lines:=jsonb_build_array(jsonb_build_object('account_id',public.account_for('receivable'),'debit',case when reversal then 0 else gross end,'credit',case when reversal then gross else 0 end));
 if net>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('sales'),'debit',case when reversal then net else 0 end,'credit',case when reversal then 0 else net end));end if;
 if tax>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for('sales_tax'),'debit',case when reversal then tax else 0 end,'credit',case when reversal then 0 else tax end));end if;
 result:=public.post_journal_internal(invoice.issue_date,invoice.invoice_type||' '||invoice.invoice_number,'Factura',invoice.id,'invoice:'||invoice.id,lines,invoice.currency,invoice.exchange_rate,invoice.total);
 return result;
end $$;

create function public.auto_invoice_journal() returns trigger language plpgsql security definer set search_path=public as $$
declare existing uuid;
begin
 if new.invoice_type='Proforma' then return new; end if;
 select id into existing from public.journal_entries where tenant_id=new.tenant_id and source_key='invoice:'||new.id;
 if new.status='Anulada' or new.deleted_at is not null then
  if existing is not null then perform public.reverse_journal_internal(existing,current_date,'Anulación del documento fiscal');end if;
 elsif new.status<>'Borrador' and exists(select 1 from public.accounting_settings where tenant_id=new.tenant_id and automatic_posting and new.issue_date>=starts_on) then
  perform public.post_invoice_journal(new.id);
 end if;
 return new;
end $$;
create trigger auto_invoice_journal after insert or update of status,deleted_at on public.invoices for each row execute function public.auto_invoice_journal();

revoke all on function public.check_balanced_journal(),public.guard_posted_journal(),public.account_for(text),public.auto_invoice_journal() from public,anon,authenticated;
revoke all on function public.save_accounting_account(jsonb),public.import_accounting_accounts(jsonb),public.manage_accounting_period(date,date,boolean),public.save_accounting_settings(boolean,date,jsonb),
 public.create_manual_journal(uuid,date,text,jsonb),public.reverse_journal(uuid,date,text),public.post_invoice_journal(uuid) from public,anon;
grant execute on function public.save_accounting_account(jsonb),public.import_accounting_accounts(jsonb),public.manage_accounting_period(date,date,boolean),public.save_accounting_settings(boolean,date,jsonb),
 public.create_manual_journal(uuid,date,text,jsonb),public.reverse_journal(uuid,date,text),public.post_invoice_journal(uuid) to authenticated;
notify pgrst,'reload schema';
