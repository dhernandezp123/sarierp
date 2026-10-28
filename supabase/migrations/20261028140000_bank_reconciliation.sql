-- FIN-BANK-02: import, matching and versioned reports. Signatures are printed only.
create table public.bank_statement_imports (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,account_id uuid not null,
 file_hash text not null check(length(file_hash) between 1 and 100),label text not null,duplicate_reason text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,account_id,file_hash),foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.bank_statement_lines (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,import_id uuid not null,account_id uuid not null,
 line_number integer not null,value_on date not null,reference text not null,description text not null,amount numeric(14,2) not null check(amount<>0),
 unique(tenant_id,id),unique(import_id,line_number),foreign key(tenant_id,import_id) references public.bank_statement_imports(tenant_id,id),foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.bank_opening_items (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,account_id uuid not null,request_id uuid not null,
 issued_on date not null,reference text not null,description text not null,amount numeric(14,2) not null check(amount<>0),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,request_id),foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.bank_match_groups (
 id uuid primary key,tenant_id uuid not null,account_id uuid not null,effective_on date not null,payload jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.bank_match_allocations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,group_id uuid not null,side text not null check(side in ('statement','movement','opening')),
 item_id uuid not null,amount numeric(14,2) not null check(amount<>0),unique(group_id,side,item_id),foreign key(tenant_id,group_id) references public.bank_match_groups(tenant_id,id)
);
create table public.bank_match_reversals (
 tenant_id uuid not null,group_id uuid primary key,effective_on date not null,reason text not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),foreign key(tenant_id,group_id) references public.bank_match_groups(tenant_id,id)
);
create table public.bank_reconciliation_reports (
 id uuid primary key,tenant_id uuid not null,account_id uuid not null,cutoff date not null,version integer not null,payload jsonb not null,snapshot jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(tenant_id,account_id,cutoff,version),
 foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
do $$declare t text;begin
 foreach t in array array['bank_statement_imports','bank_statement_lines','bank_opening_items','bank_match_groups','bank_match_allocations','bank_match_reversals','bank_reconciliation_reports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy treasury_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',t);
  execute format('create trigger immutable before update or delete on public.%I for each row execute function public.treasury_immutable()',t);
 end loop;
end $$;

create function public.bank_import_statement(p_account_id uuid,p_hash text,p_label text,p_lines jsonb,p_duplicate_reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();key uuid;line jsonb;position integer:=0;amount numeric;day date;currency text;previous jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select a.currency into currency from public.treasury_accounts a where a.tenant_id=tenant and a.id=p_account_id and kind='Banco';
 if not found then raise exception 'Cuenta bancaria no disponible';end if;
 if nullif(btrim(p_hash),'') is null or nullif(btrim(p_label),'') is null or length(p_label)>200 or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 2000 then raise exception 'El extracto debe tener de 1 a 2000 movimientos';end if;
 select id into key from public.bank_statement_imports where tenant_id=tenant and account_id=p_account_id and file_hash=p_hash;
 if found then
  select jsonb_agg(jsonb_build_object('date',s.value_on,'reference',s.reference,'description',s.description,'amount',s.amount,'currency',currency) order by s.line_number) into previous from public.bank_statement_lines s where s.tenant_id=tenant and s.import_id=key;
  if previous<>p_lines then raise exception 'El identificador del extracto ya existe con otros datos';end if;return key;
 end if;
 if length(p_duplicate_reason)>500 then raise exception 'El motivo de coincidencias admite hasta 500 caracteres';end if;
 insert into public.bank_statement_imports(tenant_id,account_id,file_hash,label,duplicate_reason,created_by) values(tenant,p_account_id,p_hash,btrim(p_label),nullif(btrim(p_duplicate_reason),''),auth.uid()) returning id into key;
 for line in select value from jsonb_array_elements(p_lines) loop
  position:=position+1;amount:=(line->>'amount')::numeric;day:=(line->>'date')::date;
  if amount is null or amount=0 or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) or day is null or day>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or extract(year from day)<1000 or line->>'currency' is distinct from currency or length(line->>'reference')>200 or length(line->>'description')>2000 then raise exception 'Revisa importe, moneda y fecha en la fila %',position;end if;
  if nullif(btrim(p_duplicate_reason),'') is null and exists(select 1 from public.bank_statement_lines s where s.tenant_id=tenant and s.account_id=p_account_id and s.import_id<>key and s.value_on=day and s.amount=(line->>'amount')::numeric and s.reference=coalesce(line->>'reference','') and s.description=coalesce(line->>'description','')) then raise exception 'La fila % coincide con un movimiento de otro extracto. Revisa duplicados; si son movimientos distintos, indica el motivo de coincidencia.',position;end if;
  insert into public.bank_statement_lines(tenant_id,import_id,account_id,line_number,value_on,reference,description,amount)
  values(tenant,key,p_account_id,position,day,coalesce(line->>'reference',''),coalesce(line->>'description',''),amount);
 end loop;
 return key;
end $$;
create function public.bank_add_opening_item(p_request_id uuid,p_account_id uuid,p_item jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;key uuid;amount numeric;d date;begin
 select * into a from public.treasury_accounts where tenant_id=tenant and id=p_account_id and kind='Banco' for update;
 if not found then raise exception 'Cuenta bancaria no disponible';end if;
 select id into key from public.bank_opening_items where tenant_id=tenant and request_id=p_request_id;
 if found then
  if not exists(select 1 from public.bank_opening_items s where s.id=key and s.account_id=p_account_id and s.issued_on=(p_item->>'date')::date and s.reference=p_item->>'reference' and s.description=coalesce(p_item->>'description','') and s.amount=(p_item->>'amount')::numeric) then raise exception 'La solicitud ya existe con otros valores iniciales';end if;return key;
 end if;
 amount:=(p_item->>'amount')::numeric;d:=(p_item->>'date')::date;
 if p_request_id is null or d is null or d>a.opening_date or amount is null or amount=0 or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) or nullif(btrim(p_item->>'reference'),'') is null then raise exception 'Los valores iniciales en circulación deben ser anteriores a la apertura, con referencia e importe';end if;
 if exists(select 1 from public.bank_reconciliation_reports where tenant_id=tenant and account_id=a.id) then raise exception 'Ya hay conciliaciones guardadas; no se altera su apertura';end if;
 insert into public.bank_opening_items(tenant_id,account_id,request_id,issued_on,reference,description,amount,created_by) values(tenant,a.id,p_request_id,d,p_item->>'reference',coalesce(p_item->>'description',''),amount,auth.uid()) returning id into key;
 return key;
end $$;

create function public.bank_matched_amount(p_side text,p_id uuid,p_cutoff date) returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(sum(a.amount),0) from public.bank_match_allocations a join public.bank_match_groups g on g.tenant_id=a.tenant_id and g.id=a.group_id
 where a.tenant_id=public.current_tenant_id() and a.side=p_side and a.item_id=p_id and g.effective_on<=p_cutoff
 and not exists(select 1 from public.bank_match_reversals r where r.tenant_id=g.tenant_id and r.group_id=g.id and r.effective_on<=p_cutoff)
$$;
create function public.bank_match(p_request_id uuid,p_account_id uuid,p_date date,p_items jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();item jsonb;amount numeric;available numeric;total_statement numeric:=0;total_cash numeric:=0;item_date date;previous public.bank_match_groups;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into previous from public.bank_match_groups where tenant_id=tenant and id=p_request_id;
 if found then if previous.account_id<>p_account_id or previous.effective_on<>p_date or previous.payload<>p_items then raise exception 'La solicitud ya existe con otras aplicaciones';end if;return previous.id;end if;
 if p_request_id is null or p_date is null or p_date>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or not exists(select 1 from public.treasury_accounts where tenant_id=tenant and id=p_account_id and kind='Banco') or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 2 and 500 then raise exception 'Revisa fecha, cuenta y movimientos para conciliar';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  amount:=(item->>'amount')::numeric;available:=null;item_date:=null;
  if item->>'side'='statement' then select s.amount,s.value_on into available,item_date from public.bank_statement_lines s where tenant_id=tenant and account_id=p_account_id and id=(item->>'id')::uuid;
  elsif item->>'side'='movement' then select s.amount,s.entry_date into available,item_date from public.treasury_ledger s where tenant_id=tenant and account_id=p_account_id and id=(item->>'id')::uuid and entry_id is not null and category<>'Apertura';
  elsif item->>'side'='opening' then select s.amount,s.issued_on into available,item_date from public.bank_opening_items s where tenant_id=tenant and account_id=p_account_id and id=(item->>'id')::uuid;
  else raise exception 'Origen inválido para conciliar';end if;
  if available is null or item_date is null or item_date>p_date or amount is null or amount=0 or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) or sign(amount)<>sign(available) then raise exception 'Movimiento, fecha o importe no disponible para conciliar';end if;
  -- Reserve against all active matches, including those dated after this cutoff.
  if abs(amount)+abs(public.bank_matched_amount(item->>'side',(item->>'id')::uuid,'9999-12-31'))>abs(available) then raise exception 'El importe supera el restante sin conciliar';end if;
  if item->>'side'='statement' then total_statement:=total_statement+amount;else total_cash:=total_cash+amount;end if;
 end loop;
 if total_statement<>total_cash or total_statement=0 then raise exception 'Los importes bancarios y contables seleccionados deben coincidir';end if;
 insert into public.bank_match_groups(id,tenant_id,account_id,effective_on,payload,created_by) values(p_request_id,tenant,p_account_id,p_date,p_items,auth.uid());
 for item in select value from jsonb_array_elements(p_items) loop
  insert into public.bank_match_allocations(tenant_id,group_id,side,item_id,amount) values(tenant,p_request_id,item->>'side',(item->>'id')::uuid,(item->>'amount')::numeric);
 end loop;
 return p_request_id;
end $$;
create function public.bank_unmatch(p_id uuid,p_date date,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 if not exists(select 1 from public.bank_match_groups where tenant_id=tenant and id=p_id and effective_on<=p_date) or p_date is null or p_date>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Revisa fecha, vínculo y motivo para deshacer la conciliación';end if;
 insert into public.bank_match_reversals(tenant_id,group_id,effective_on,reason,created_by) values(tenant,p_id,p_date,p_reason,auth.uid()) on conflict(group_id) do nothing;
end $$;

create function public.bank_reconciliation_data(p_account_id uuid,p_from date,p_cutoff date,p_bank_balance numeric) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;opening numeric;debit numeric;credit numeric;closing numeric;book_hnl numeric;linked_hnl numeric;checks numeric;deposits numeric;other_out numeric;pending integer;items jsonb;unmatched integer;begin
 select * into a from public.treasury_accounts where tenant_id=tenant and id=p_account_id and kind='Banco';
 if not found or p_from is null or p_cutoff is null or p_from>p_cutoff or p_cutoff>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or p_from<a.opening_date or p_bank_balance is null or p_bank_balance::text in ('NaN','Infinity','-Infinity') or p_bank_balance<>round(p_bank_balance,2) then raise exception 'Revisa cuenta, período y saldo final del extracto';end if;
 select coalesce(sum(amount) filter(where entry_date<p_from),0),coalesce(sum(amount) filter(where entry_date between p_from and p_cutoff and amount>0),0),coalesce(-sum(amount) filter(where entry_date between p_from and p_cutoff and amount<0),0)
 into opening,debit,credit from public.treasury_ledger where tenant_id=tenant and account_id=a.id and entry_date<=p_cutoff;
 closing:=opening+debit-credit;
 select coalesce(sum(l.debit-l.credit),0) into book_hnl from public.journal_lines l join public.journal_entries e on e.tenant_id=l.tenant_id and e.id=l.entry_id where l.tenant_id=tenant and l.account_id=a.gl_account_id and e.entry_date<=p_cutoff;
 select coalesce(sum(round(amount*exchange_rate,2)),0) into linked_hnl from public.treasury_ledger where tenant_id=tenant and account_id=a.id and entry_date<=p_cutoff;
 select count(*) into pending from public.treasury_ledger where tenant_id=tenant and account_id=a.id and occurred_on<=p_cutoff and (entry_id is null or entry_date>p_cutoff);
 with candidates as (
  select s.id,s.occurred_on item_date,s.reference,s.description,s.method,s.amount-public.bank_matched_amount('movement',s.id,p_cutoff) remaining
  from public.treasury_ledger s where tenant_id=tenant and account_id=a.id and entry_date<=p_cutoff and category<>'Apertura'
   and not exists(select 1 from public.treasury_movements r where r.tenant_id=tenant and r.reverse_of=s.id and r.occurred_on<=p_cutoff and public.bank_matched_amount('movement',s.id,p_cutoff)=0 and public.bank_matched_amount('movement',r.id,p_cutoff)=0)
   and not (s.reverse_of is not null and public.bank_matched_amount('movement',s.id,p_cutoff)=0 and public.bank_matched_amount('movement',s.reverse_of,p_cutoff)=0)
  union all select s.id,s.issued_on,s.reference,s.description,case when s.amount<0 then 'Cheque' else 'Depósito' end,s.amount-public.bank_matched_amount('opening',s.id,p_cutoff) from public.bank_opening_items s where tenant_id=tenant and account_id=a.id and issued_on<=p_cutoff
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'date',item_date,'reference',reference,'description',description,'method',method,'amount',remaining) order by item_date,id) filter(where remaining<>0),'[]'),coalesce(-sum(remaining) filter(where remaining<0 and method='Cheque'),0),coalesce(sum(remaining) filter(where remaining>0),0),coalesce(-sum(remaining) filter(where remaining<0 and method<>'Cheque'),0)
 into items,checks,deposits,other_out from candidates;
 select count(*) into unmatched from public.bank_statement_lines s where tenant_id=tenant and account_id=a.id and value_on<=p_cutoff and s.amount-public.bank_matched_amount('statement',s.id,p_cutoff)<>0;
 return jsonb_build_object('fx',(select to_jsonb(rate) from public.treasury_exchange_rates rate where tenant_id=tenant and account_id=a.id and effective_on<=p_cutoff order by effective_on desc,created_at desc,id desc limit 1),'account',to_jsonb(a),'from',p_from,'cutoff',p_cutoff,'opening',opening,'debit',debit,'credit',credit,'book_closing',case when a.gl_account_id is null then null else closing end,'book_hnl',case when a.gl_account_id is null then null else book_hnl end,
  'untracked_hnl',book_hnl-linked_hnl,'bank_closing',p_bank_balance,'initial_difference',closing-p_bank_balance,'checks',checks,'deposits',deposits,'other_out',other_out,'reconciled_bank',p_bank_balance-checks+deposits-other_out,'difference',case when a.gl_account_id is null then null else p_bank_balance-checks+deposits-other_out-closing end,'pending_postings',pending,'unmatched_statement',unmatched,'items',items);
end $$;
create function public.bank_save_reconciliation(p_request_id uuid,p_account_id uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();report jsonb;previous public.bank_reconciliation_reports;version_no integer;company jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into previous from public.bank_reconciliation_reports where tenant_id=tenant and id=p_request_id;
 if found then if previous.account_id<>p_account_id or previous.payload<>p_payload then raise exception 'La versión ya existe con otros datos';end if;return previous.id;end if;
 if p_request_id is null or nullif(btrim(p_payload->>'prepared_by'),'') is null or nullif(btrim(p_payload->>'reviewed_by'),'') is null or length(p_payload->>'prepared_by')>160 or length(p_payload->>'reviewed_by')>160 then raise exception 'Indica los nombres para las líneas de firma';end if;
 report:=public.bank_reconciliation_data(p_account_id,(p_payload->>'from')::date,(p_payload->>'cutoff')::date,(p_payload->>'bank_balance')::numeric);
 if report->>'book_closing' is null or (report->>'pending_postings')::integer>0 then raise exception 'Asigna la cuenta contable y contabiliza los movimientos al corte antes de guardar la conciliación';end if;
 if (report->>'untracked_hnl')::numeric<>0 then raise exception 'La cuenta contable tiene movimientos sin respaldo en Caja/Bancos; revisa la diferencia antes de guardar';end if;
 select to_jsonb(c) into company from public.company_settings c where tenant_id=tenant;
 select coalesce(max(version),0)+1 into version_no from public.bank_reconciliation_reports where tenant_id=tenant and account_id=p_account_id and cutoff=(p_payload->>'cutoff')::date;
 insert into public.bank_reconciliation_reports(id,tenant_id,account_id,cutoff,version,payload,snapshot,created_by) values(p_request_id,tenant,p_account_id,(p_payload->>'cutoff')::date,version_no,p_payload,report||jsonb_build_object('company',company,'prepared_by',p_payload->>'prepared_by','reviewed_by',p_payload->>'reviewed_by','version',version_no),auth.uid());
 return p_request_id;
end $$;
revoke all on function public.bank_matched_amount(text,uuid,date) from public,anon,authenticated;
revoke all on function public.bank_import_statement(uuid,text,text,jsonb,text),public.bank_add_opening_item(uuid,uuid,jsonb),public.bank_match(uuid,uuid,date,jsonb),public.bank_unmatch(uuid,date,text),public.bank_reconciliation_data(uuid,date,date,numeric),public.bank_save_reconciliation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.bank_import_statement(uuid,text,text,jsonb,text),public.bank_add_opening_item(uuid,uuid,jsonb),public.bank_match(uuid,uuid,date,jsonb),public.bank_unmatch(uuid,date,text),public.bank_reconciliation_data(uuid,date,date,numeric),public.bank_save_reconciliation(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
