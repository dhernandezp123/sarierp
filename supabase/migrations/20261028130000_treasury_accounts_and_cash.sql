-- FIN-BANK-01: dated native-currency cash ledger. No account or opening is seeded.
create table public.treasury_accounts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 request_id uuid not null,kind text not null check(kind in ('Banco','Caja')),name text not null check(length(name) between 1 and 160),
 bank text not null default '',account_number text not null default '',currency text not null check(currency in ('HNL','USD')),
 gl_account_id uuid,opening_date date not null,opening_amount numeric(14,2) not null,opening_rate numeric(18,6) not null check(opening_rate>0 and opening_rate<=1000000),
 opening_counter_id uuid,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,request_id),unique(tenant_id,gl_account_id),
 foreign key(tenant_id,gl_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,opening_counter_id) references public.accounting_accounts(tenant_id,id)
);
create table public.treasury_movements (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,account_id uuid not null,
 occurred_on date not null,value_on date not null,amount numeric(14,2) not null check(amount<>0),
 exchange_rate numeric(18,6) not null check(exchange_rate>0 and exchange_rate<=1000000),
 buy_rate numeric(18,6) check(buy_rate>0 and buy_rate<=1000000),sell_rate numeric(18,6) check(sell_rate>0 and sell_rate<=1000000),
 reference text not null default '',description text not null,method text not null,
 category text not null check(category in ('Operación','Inversión','Financiación','Transferencia','Apertura')),
 source_kind text not null,source_id uuid,source_key text not null,request_payload jsonb not null default '{}',
 counter_account_id uuid,transfer_id uuid,reverse_of uuid,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,source_key),unique(tenant_id,reverse_of),
 foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id),
 foreign key(tenant_id,counter_account_id) references public.accounting_accounts(tenant_id,id),
 foreign key(tenant_id,reverse_of) references public.treasury_movements(tenant_id,id)
);
create index treasury_cash_date on public.treasury_movements(tenant_id,account_id,occurred_on,id);
create table public.treasury_postings (
 tenant_id uuid not null,movement_id uuid primary key,entry_id uuid not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,movement_id) references public.treasury_movements(tenant_id,id),
 foreign key(tenant_id,entry_id) references public.journal_entries(tenant_id,id)
);
create table public.treasury_source_requests (
 tenant_id uuid not null references public.tenants(id),request_id uuid not null,kind text not null,account_id uuid not null,rate numeric not null,payload jsonb not null,result jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(tenant_id,request_id),
 foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.treasury_account_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,account_id uuid not null,snapshot jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create table public.treasury_exchange_rates (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,account_id uuid not null,request_id uuid not null,effective_on date not null,
 buy_rate numeric(18,6) not null check(buy_rate>0 and buy_rate<=1000000),sell_rate numeric(18,6) not null check(sell_rate>0 and sell_rate<=1000000),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),unique(tenant_id,request_id),foreign key(tenant_id,account_id) references public.treasury_accounts(tenant_id,id)
);
create function public.treasury_authorize() returns uuid language plpgsql stable security definer set search_path=public as $$begin
 if auth.uid() is null or not public.can_manage_finance() or public.current_tenant_id() is null then raise exception 'Sin acceso financiero' using errcode='42501';end if;
 return public.current_tenant_id();
end $$;
create function public.treasury_immutable() returns trigger language plpgsql as $$begin raise exception 'El movimiento de tesorería es inmutable; registra un reverso';end $$;
do $$declare t text;begin
 foreach t in array array['treasury_accounts','treasury_movements','treasury_postings','treasury_source_requests','treasury_account_events','treasury_exchange_rates'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy treasury_read on public.%I for select to authenticated using(tenant_id=public.current_tenant_id() and public.can_manage_finance())',t);
 end loop;
 foreach t in array array['treasury_movements','treasury_postings','treasury_source_requests','treasury_account_events','treasury_exchange_rates'] loop
  execute format('create trigger immutable before update or delete on public.%I for each row execute function public.treasury_immutable()',t);
 end loop;
end $$;
create function public.treasury_account_audit() returns trigger language plpgsql security definer set search_path=public as $$begin
 if tg_op='UPDATE' and (new.currency,new.opening_date,new.opening_amount,new.opening_rate,new.tenant_id) is distinct from (old.currency,old.opening_date,old.opening_amount,old.opening_rate,old.tenant_id) then raise exception 'La apertura y moneda bancaria son inmutables';end if;
 insert into public.treasury_account_events(tenant_id,account_id,snapshot,created_by) values(new.tenant_id,new.id,to_jsonb(new),auth.uid());return new;
end $$;
create trigger treasury_account_audit after insert or update on public.treasury_accounts for each row execute function public.treasury_account_audit();
create function public.treasury_rate_snapshot() returns trigger language plpgsql security definer set search_path=public as $$
declare rate public.treasury_exchange_rates;begin
 select * into rate from public.treasury_exchange_rates where tenant_id=new.tenant_id and account_id=new.account_id and effective_on<=new.occurred_on order by effective_on desc,created_at desc,id desc limit 1;
 new.buy_rate:=coalesce(new.buy_rate,rate.buy_rate);new.sell_rate:=coalesce(new.sell_rate,rate.sell_rate);return new;
end $$;
create trigger treasury_rate_snapshot before insert on public.treasury_movements for each row execute function public.treasury_rate_snapshot();
create function public.treasury_save_rate(p_request_id uuid,p_account_id uuid,p_date date,p_buy numeric,p_sell numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();previous public.treasury_exchange_rates;key uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into previous from public.treasury_exchange_rates where tenant_id=tenant and request_id=p_request_id;
 if found then if (previous.account_id,previous.effective_on,previous.buy_rate,previous.sell_rate) is distinct from (p_account_id,p_date,p_buy,p_sell) then raise exception 'La solicitud ya existe con otra tasa';end if;return previous.id;end if;
 if p_request_id is null or p_date is null or p_date>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or p_buy is null or p_sell is null or not exists(select 1 from public.treasury_accounts where tenant_id=tenant and id=p_account_id) then raise exception 'Revisa cuenta, fecha y tasas';end if;
 insert into public.treasury_exchange_rates(tenant_id,account_id,request_id,effective_on,buy_rate,sell_rate,created_by) values(tenant,p_account_id,p_request_id,p_date,p_buy,p_sell,auth.uid()) returning id into key;return key;
end $$;

create function public.treasury_validate_account(p_id uuid,p_currency text,p_date date) returns public.treasury_accounts
language plpgsql security definer set search_path=public as $$declare a public.treasury_accounts;begin
 select * into a from public.treasury_accounts where id=p_id and tenant_id=public.treasury_authorize() for update;
 if not found then raise exception 'Cuenta bancaria/caja no disponible';end if;
 if a.currency is distinct from p_currency or p_date is null or p_date<a.opening_date or p_date>(clock_timestamp() at time zone 'America/Tegucigalpa')::date then raise exception 'Revisa moneda y fecha: la fecha debe ser desde la apertura y hasta hoy';end if;
 return a;
end $$;
create function public.treasury_cash_account(p_id uuid) returns uuid language plpgsql stable security definer set search_path=public as $$declare result uuid;begin
 if p_id is null then return public.account_for('cash');end if;
 select gl_account_id into result from public.treasury_accounts where id=p_id and tenant_id=public.current_tenant_id();
 if result is null then raise exception 'Asigna una cuenta contable a la cuenta bancaria/caja antes de contabilizar';end if;
 return result;
end $$;

create function public.treasury_create_account(p_request_id uuid,p_account jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;key uuid:=gen_random_uuid();amount numeric;rate numeric;gl uuid;counter uuid;d date;
begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into a from public.treasury_accounts where tenant_id=tenant and request_id=p_request_id;
 if found then
  if jsonb_build_object('kind',a.kind,'name',a.name,'bank',a.bank,'account_number',a.account_number,'currency',a.currency,'opening_date',a.opening_date,'opening_amount',a.opening_amount,'opening_rate',a.opening_rate,'gl_account_id',a.gl_account_id,'opening_counter_id',a.opening_counter_id)<>p_account then raise exception 'Esta solicitud ya registró otra configuración';end if;
  return a.id;
 end if;
 amount:=(p_account->>'opening_amount')::numeric;rate:=(p_account->>'opening_rate')::numeric;d:=(p_account->>'opening_date')::date;
 gl:=nullif(p_account->>'gl_account_id','')::uuid;counter:=nullif(p_account->>'opening_counter_id','')::uuid;
 if p_request_id is null or amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) or rate is null or rate::text in ('NaN','Infinity','-Infinity') or rate<=0 or rate>1000000 or d is null or d>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or extract(year from d)<1000
  or nullif(btrim(p_account->>'name'),'') is null or length(p_account->>'bank')>160 or length(p_account->>'account_number')>80 or (p_account->>'currency'='HNL' and rate<>1) then raise exception 'Completa cuenta, moneda, fecha, saldo y tasa de apertura';end if;
 if gl is not null and not exists(select 1 from public.accounting_accounts where tenant_id=tenant and id=gl and active and postable and kind='Activo') then raise exception 'La cuenta contable bancaria debe ser un Activo de movimiento';end if;
 if gl=counter then raise exception 'La contrapartida debe ser otra cuenta';end if;
 if exists(select 1 from public.treasury_accounts where tenant_id=tenant and gl_account_id=counter) then raise exception 'La contrapartida de apertura no puede ser otra cuenta bancaria/caja; utiliza Transferencia';end if;
 -- Pre-existing bank GL balances require a reviewed opening, not another posting.
 if gl is not null and exists(select 1 from public.journal_lines where tenant_id=tenant and account_id=gl) then raise exception 'La cuenta contable ya tiene movimientos; concilia la apertura antes de vincularla';end if;
 insert into public.treasury_accounts(id,tenant_id,request_id,kind,name,bank,account_number,currency,gl_account_id,opening_date,opening_amount,opening_rate,opening_counter_id,created_by)
 values(key,tenant,p_request_id,p_account->>'kind',btrim(p_account->>'name'),coalesce(p_account->>'bank',''),coalesce(p_account->>'account_number',''),p_account->>'currency',gl,d,amount,rate,counter,auth.uid());
 if amount<>0 then insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,description,method,category,source_kind,source_id,source_key,counter_account_id,created_by)
  values(tenant,key,d,d,amount,rate,'Saldo inicial declarado','Apertura','Apertura','Apertura',key,'opening:'||key,counter,auth.uid());end if;
 return key;
end $$;

create function public.treasury_configure_gl(p_account_id uuid,p_gl_account_id uuid,p_opening_counter_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;begin
 select * into a from public.treasury_accounts where tenant_id=tenant and id=p_account_id for update;
 if not found then raise exception 'Cuenta no disponible';end if;
 if a.gl_account_id is not null and a.gl_account_id is distinct from p_gl_account_id then raise exception 'La cuenta contable bancaria ya está asignada y no se sustituye';end if;
 if a.opening_counter_id is not null and a.opening_counter_id is distinct from p_opening_counter_id then raise exception 'La contrapartida inicial ya está asignada y no se sustituye';end if;
 if not exists(select 1 from public.accounting_accounts where tenant_id=tenant and id=p_gl_account_id and active and postable and kind='Activo') or p_gl_account_id=p_opening_counter_id then raise exception 'Selecciona una cuenta de Activo y otra contrapartida';end if;
 if exists(select 1 from public.treasury_accounts where tenant_id=tenant and gl_account_id=p_opening_counter_id) then raise exception 'La contrapartida de apertura no puede ser otra cuenta bancaria/caja';end if;
 if a.gl_account_id is null and exists(select 1 from public.journal_lines where tenant_id=tenant and account_id=p_gl_account_id) then raise exception 'La cuenta contable ya tiene movimientos; requiere apertura conciliada';end if;
 update public.treasury_accounts set gl_account_id=p_gl_account_id,opening_counter_id=p_opening_counter_id where id=a.id;
end $$;

create function public.treasury_register_movement(p_request_id uuid,p_movement jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;previous public.treasury_movements;key uuid;amount numeric;rate numeric;d date;v date;counter uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into previous from public.treasury_movements where tenant_id=tenant and source_key='manual:'||p_request_id;
 if found then if previous.request_payload<>p_movement then raise exception 'La solicitud ya existe con otros datos';end if;return previous.id;end if;
 amount:=(p_movement->>'amount')::numeric;rate:=(p_movement->>'exchange_rate')::numeric;d:=(p_movement->>'occurred_on')::date;v:=(p_movement->>'value_on')::date;counter:=nullif(p_movement->>'counter_account_id','')::uuid;
 a:=public.treasury_validate_account((p_movement->>'account_id')::uuid,p_movement->>'currency',d);
 if p_request_id is null or amount is null or amount=0 or amount::text in ('NaN','Infinity','-Infinity') or amount<>round(amount,2) or rate is null or rate::text in ('NaN','Infinity','-Infinity') or rate<=0 or rate>1000000 or (a.currency='HNL' and rate<>1)
  or v is null or nullif(btrim(p_movement->>'description'),'') is null or length(p_movement->>'description')>2000 or length(p_movement->>'reference')>200 or coalesce(p_movement->>'category','') not in ('Operación','Inversión','Financiación') or nullif(p_movement->>'method','') is null then raise exception 'Revisa monto, tasa, concepto, categoría y fechas';end if;
 if counter is not null and (counter=a.gl_account_id or exists(select 1 from public.treasury_accounts where tenant_id=tenant and gl_account_id=counter)) then raise exception 'Para mover efectivo entre cuentas utiliza Transferencia';end if;
 insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,buy_rate,sell_rate,reference,description,method,category,source_kind,source_key,request_payload,counter_account_id,created_by)
 values(tenant,a.id,d,v,amount,rate,nullif(p_movement->>'buy_rate','')::numeric,nullif(p_movement->>'sell_rate','')::numeric,coalesce(p_movement->>'reference',''),p_movement->>'description',p_movement->>'method',p_movement->>'category','Manual','manual:'||p_request_id,p_movement,counter,auth.uid()) returning id into key;
 if public.accounting_active_for(d) then perform public.treasury_post_movement(key);end if;
 return key;
end $$;

create function public.treasury_transfer(p_request_id uuid,p_transfer jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();a public.treasury_accounts;b public.treasury_accounts;d date;out_amount numeric;in_amount numeric;out_rate numeric;in_rate numeric;previous jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select request_payload into previous from public.treasury_movements where tenant_id=tenant and source_key='transfer:'||p_request_id||':out';
 if found then if previous<>p_transfer then raise exception 'Transferencia registrada con otros datos';end if;return p_request_id;end if;
 d:=(p_transfer->>'date')::date;out_amount:=(p_transfer->>'out_amount')::numeric;in_amount:=(p_transfer->>'in_amount')::numeric;out_rate:=(p_transfer->>'out_rate')::numeric;in_rate:=(p_transfer->>'in_rate')::numeric;
 a:=public.treasury_validate_account((p_transfer->>'from_id')::uuid,p_transfer->>'from_currency',d);b:=public.treasury_validate_account((p_transfer->>'to_id')::uuid,p_transfer->>'to_currency',d);
 if p_request_id is null or a.id=b.id or out_amount is null or in_amount is null or out_amount<=0 or in_amount<=0 or out_amount::text in ('NaN','Infinity') or in_amount::text in ('NaN','Infinity') or out_amount<>round(out_amount,2) or in_amount<>round(in_amount,2)
  or out_rate is null or in_rate is null or out_rate::text in ('NaN','Infinity') or in_rate::text in ('NaN','Infinity') or out_rate<=0 or in_rate<=0 or out_rate>1000000 or in_rate>1000000 or (a.currency='HNL' and out_rate<>1) or (b.currency='HNL' and in_rate<>1)
  or (a.currency=b.currency and out_amount<>in_amount) or nullif(btrim(p_transfer->>'description'),'') is null then raise exception 'Revisa cuentas, importes, monedas y tasas de la transferencia';end if;
 insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,description,reference,method,category,source_kind,source_key,request_payload,transfer_id,created_by)
 values(tenant,a.id,d,d,-out_amount,out_rate,p_transfer->>'description',coalesce(p_transfer->>'reference',''),'Transferencia','Transferencia','Transferencia','transfer:'||p_request_id||':out',p_transfer,p_request_id,auth.uid()),
 (tenant,b.id,d,d,in_amount,in_rate,p_transfer->>'description',coalesce(p_transfer->>'reference',''),'Transferencia','Transferencia','Transferencia','transfer:'||p_request_id||':in',p_transfer,p_request_id,auth.uid());
 if public.accounting_active_for(d) then perform public.treasury_post_movement((select id from public.treasury_movements where tenant_id=tenant and source_key='transfer:'||p_request_id||':out'));end if;
 return p_request_id;
end $$;

create function public.treasury_post_movement(p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();m public.treasury_movements;a public.treasury_accounts;other public.treasury_movements;other_account public.treasury_accounts;entry uuid;counter uuid;base numeric;other_base numeric;lines jsonb;reversal_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into m from public.treasury_movements where tenant_id=tenant and id=p_id for update;
 if not found then raise exception 'Movimiento no disponible';end if;
 select entry_id into entry from public.treasury_postings where movement_id=m.id;if found then return entry;end if;
 select * into a from public.treasury_accounts where tenant_id=tenant and id=m.account_id;
 if m.reverse_of is not null then
  select entry_id into entry from public.treasury_postings where movement_id=m.reverse_of;
  if entry is null then raise exception 'Contabiliza primero el movimiento original';end if;
  entry:=public.reverse_journal_internal(entry,m.occurred_on,m.description);
 elsif m.source_kind='Recibo' then entry:=public.post_receipt_cash(m.source_id);
 elsif m.source_kind='Pago recibido' then entry:=public.post_customer_payment_journal(m.source_id);
 elsif m.source_kind='Pago realizado' then entry:=public.post_supplier_payment_journal(m.source_id);
 elsif m.transfer_id is not null then
  select * into other from public.treasury_movements where tenant_id=tenant and transfer_id=m.transfer_id and id<>m.id;
  select * into other_account from public.treasury_accounts where tenant_id=tenant and id=other.account_id;
  base:=round(abs(m.amount)*m.exchange_rate,2);other_base:=round(abs(other.amount)*other.exchange_rate,2);
  lines:=jsonb_build_array(jsonb_build_object('account_id',public.treasury_cash_account(a.id),'debit',case when m.amount>0 then base else 0 end,'credit',case when m.amount<0 then base else 0 end),jsonb_build_object('account_id',public.treasury_cash_account(other_account.id),'debit',case when other.amount>0 then other_base else 0 end,'credit',case when other.amount<0 then other_base else 0 end));
  base:=(case when m.amount>0 then base else -base end)+(case when other.amount>0 then other_base else -other_base end);
  if base<>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for(case when base>0 then 'exchange_gain' else 'exchange_loss' end),'debit',greatest(-base,0),'credit',greatest(base,0)));end if;
  entry:=public.post_journal_internal(m.occurred_on,m.description,'Transferencia bancaria',m.transfer_id,'treasury-transfer:'||m.transfer_id,lines);
  insert into public.treasury_postings(tenant_id,movement_id,entry_id) values(tenant,other.id,entry);
 else
  counter:=case when m.source_kind='Apertura' then a.opening_counter_id else m.counter_account_id end;
  if counter is null then raise exception 'Selecciona la contrapartida contable antes de contabilizar';end if;
  if exists(select 1 from public.treasury_accounts where tenant_id=tenant and gl_account_id=counter) then raise exception 'Para mover efectivo entre cuentas utiliza Transferencia';end if;
  base:=round(abs(m.amount)*m.exchange_rate,2);
  entry:=public.post_journal_internal(m.occurred_on,m.description,'Tesorería',m.id,'treasury:'||m.id,jsonb_build_array(
   jsonb_build_object('account_id',public.treasury_cash_account(a.id),'debit',case when m.amount>0 then base else 0 end,'credit',case when m.amount<0 then base else 0 end),
   jsonb_build_object('account_id',counter,'debit',case when m.amount<0 then base else 0 end,'credit',case when m.amount>0 then base else 0 end)),a.currency,m.exchange_rate,abs(m.amount));
 end if;
 if entry is null then raise exception 'No se generó asiento para este movimiento';end if;
 insert into public.treasury_postings(tenant_id,movement_id,entry_id) values(tenant,m.id,entry);
 -- A cash source may have been reversed while automatic posting was off.
 -- Post the recorded original and its recorded reversal atomically, never leave
 -- the cancelled cash entry standing alone in the books.
 for reversal_id in select r.id from public.treasury_movements r join public.treasury_movements original on original.tenant_id=r.tenant_id and original.id=r.reverse_of
  where r.tenant_id=tenant and (original.id=m.id or (m.transfer_id is not null and original.transfer_id=m.transfer_id))
   and not exists(select 1 from public.treasury_postings p where p.movement_id=r.id) loop
  perform public.treasury_post_movement(reversal_id);
 end loop;
 return entry;
end $$;

-- Cash sources keep the original atomic register/reverse RPCs. Context is only
-- routing information; role, tenant, account, currency and date are revalidated.
do $$declare t text;begin
 foreach t in array array['customer_receipts','invoice_payments','pagos_proveedor'] loop
  execute format('alter table public.%I add column treasury_account_id uuid,add column treasury_exchange_rate numeric(18,6),add constraint treasury_account_fk foreign key(tenant_id,treasury_account_id) references public.treasury_accounts(tenant_id,id)',t);
 end loop;
end $$;
create function public.treasury_route_cash() returns trigger language plpgsql security definer set search_path=public as $$
declare d jsonb:=to_jsonb(new);account_id uuid;rate numeric;currency text;day date;a public.treasury_accounts;begin
 if tg_table_name='pagos_proveedor' and d->>'withholding_document_id' is not null then return new;end if;
 if tg_table_name='invoice_payments' and (d->>'receipt_id' is not null or d->>'original_proforma_id' is not null) then return new;end if;
 if tg_table_name='customer_receipts' and d->>'origin_payment_id' is not null then return new;end if;
 account_id:=nullif(current_setting('sari.treasury_account',true),'')::uuid;rate:=nullif(current_setting('sari.treasury_rate',true),'')::numeric;
 if account_id is null then
  if exists(select 1 from public.treasury_accounts where tenant_id=new.tenant_id) then raise exception 'Selecciona la cuenta bancaria/caja del cobro o pago';end if;return new;
 end if;
 currency:=coalesce(d->>'currency',d->>'moneda');day:=coalesce(d->>'payment_date',d->>'fecha_pago')::date;
 a:=public.treasury_validate_account(account_id,currency,day);
 if rate is null or rate::text in ('NaN','Infinity','-Infinity') or rate<=0 or rate>1000000 or (currency='HNL' and rate<>1) then raise exception 'Indica la tasa HNL por moneda del movimiento';end if;
 new.treasury_account_id:=a.id;new.treasury_exchange_rate:=rate;
 return new;
end $$;
create function public.treasury_capture_cash() returns trigger language plpgsql security definer set search_path=public as $$
declare d jsonb:=to_jsonb(new);kind text;cash_key text;date_value date;amount numeric;key uuid;entry uuid;original public.treasury_movements;begin
 if new.treasury_account_id is null then return new;end if;
 kind:=case tg_table_name when 'customer_receipts' then 'Recibo' when 'invoice_payments' then 'Pago recibido' else 'Pago realizado' end;
 cash_key:=case tg_table_name when 'customer_receipts' then 'receipt:'||new.id||':cash' when 'invoice_payments' then 'payment:'||new.id||':cash' else 'supplier-payment:'||new.id end;
 if tg_op='UPDATE' then
  if old.status<>'Aplicado' or new.status<>'Reversado' then return new;end if;
  select * into original from public.treasury_movements where tenant_id=new.tenant_id and treasury_movements.source_key=cash_key;
  if not found then return new;end if;
  insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,description,reference,method,category,source_kind,source_id,source_key,reverse_of,created_by)
   values(new.tenant_id,original.account_id,(new.reversed_at at time zone 'America/Tegucigalpa')::date,(new.reversed_at at time zone 'America/Tegucigalpa')::date,-original.amount,original.exchange_rate,'Reverso: '||new.reversal_reason,original.reference,original.method,original.category,kind,new.id,'reverse:'||cash_key,original.id,auth.uid()) returning id into key;
  select e.reversed_by_id into entry from public.journal_entries e where e.tenant_id=new.tenant_id and e.source_key=cash_key;
 else
  if new.status<>'Aplicado' then return new;end if;
  date_value:=coalesce(d->>'payment_date',d->>'fecha_pago')::date;amount:=coalesce(d->>'amount',d->>'monto')::numeric*case when tg_table_name='pagos_proveedor' then -1 else 1 end;
  insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,reference,description,method,category,source_kind,source_id,source_key,created_by)
  values(new.tenant_id,new.treasury_account_id,date_value,date_value,amount,new.treasury_exchange_rate,coalesce(d->>'reference',d->>'referencia',''),kind,coalesce(d->>'payment_method',d->>'metodo_pago','Otro'),'Operación',kind,new.id,cash_key,auth.uid()) returning id into key;
  select e.id into entry from public.journal_entries e where e.tenant_id=new.tenant_id and e.source_key=cash_key;
 end if;
 if entry is not null then insert into public.treasury_postings(tenant_id,movement_id,entry_id) values(new.tenant_id,key,entry);end if;
 return new;
end $$;
do $$declare t text;begin
 foreach t in array array['customer_receipts','invoice_payments','pagos_proveedor'] loop
  execute format('create trigger a_treasury_route before insert on public.%I for each row execute function public.treasury_route_cash()',t);
  execute format('create trigger zz_treasury_cash after insert or update of status on public.%I for each row execute function public.treasury_capture_cash()',t);
 end loop;
end $$;

-- Reviewed replacements preserve the existing accounting algorithms/rounding.
do $$declare body text;begin
 body:=pg_get_functiondef('public.post_receipt_cash(uuid)'::regprocedure);
 if position('public.account_for(''cash'')' in body)=0 then raise exception 'Unexpected receipt accounting definition';end if;
 body:=replace(body,'receipt.status<>''Aplicado''','receipt.status not in (''Aplicado'',''Reversado'')');
 execute replace(body,'public.account_for(''cash'')','public.treasury_cash_account(receipt.treasury_account_id)');
 body:=pg_get_functiondef('public.post_customer_payment_journal(uuid)'::regprocedure);
 if position('public.account_for(purpose)' in body)=0 then raise exception 'Unexpected customer accounting definition';end if;
 body:=replace(body,'public.account_for(purpose)','case when purpose=''cash'' then public.treasury_cash_account(payment.treasury_account_id) else public.account_for(purpose) end');
 body:=replace(body,'else invoice.exchange_rate end;purpose:=''cash''','else coalesce(payment.treasury_exchange_rate,invoice.exchange_rate) end;purpose:=''cash''');
 body:=replace(body,'payment.status<>''Aplicado''','payment.status not in (''Aplicado'',''Reversado'')');
 execute body;
end $$;

create function public.treasury_register_source(p_kind text,p_account_id uuid,p_rate numeric,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();result jsonb;key uuid;stored uuid;old_account text:=current_setting('sari.treasury_account',true);old_rate text:=current_setting('sari.treasury_rate',true);request uuid:=(p_payload->>'request_id')::uuid;previous public.treasury_source_requests;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 if request is null then raise exception 'Falta el identificador de solicitud';end if;
 select * into previous from public.treasury_source_requests where tenant_id=tenant and request_id=request;
 if found then if (previous.kind,previous.account_id,previous.rate,previous.payload) is distinct from (p_kind,p_account_id,p_rate,p_payload) then raise exception 'La solicitud ya existe con otros datos';end if;return previous.result;end if;
 perform set_config('sari.treasury_account',coalesce(p_account_id::text,''),true);perform set_config('sari.treasury_rate',coalesce(p_rate::text,''),true);
 if p_kind='Recibo' then
  key:=public.register_customer_receipt((p_payload->>'request_id')::uuid,(p_payload->>'cliente_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'currency',(p_payload->>'date')::date,p_payload->>'method',p_payload->>'reference',p_payload->>'notes',coalesce(p_payload->'allocations','[]'),p_rate);
  select treasury_account_id into stored from public.customer_receipts where tenant_id=tenant and id=key;result:=jsonb_build_object('id',key);
 elsif p_kind='Pago realizado' then
  result:=public.register_supplier_payment((p_payload->>'payable_id')::uuid,(p_payload->>'request_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'currency',(p_payload->>'date')::date,p_payload->>'method',p_payload->>'reference',p_payload->>'notes');
  key:=(result->>'payment_id')::uuid;select treasury_account_id into stored from public.pagos_proveedor where id=key and tenant_id=tenant;
 elsif p_kind='Pago recibido' then
  select to_jsonb(r) into result from public.register_invoice_payment_v2((p_payload->>'invoice_id')::uuid,(p_payload->>'amount')::numeric,p_payload->>'currency',(p_payload->>'date')::date,p_payload->>'fiscal_type',p_payload->>'point_of_sale',p_payload->>'method',p_payload->>'reference',p_payload->>'notes',coalesce(p_payload->'splits','[]')) r;
  key:=(result->>'payment_id')::uuid;select treasury_account_id into stored from public.invoice_payments where id=key and tenant_id=tenant;
 else raise exception 'Origen de efectivo inválido';end if;
 if stored is distinct from p_account_id then raise exception 'El registro ya existe en otra cuenta; revisa antes de reintentar';end if;
 perform set_config('sari.treasury_account',coalesce(old_account,''),true);perform set_config('sari.treasury_rate',coalesce(old_rate,''),true);
 insert into public.treasury_source_requests(tenant_id,request_id,kind,account_id,rate,payload,result,created_by) values(tenant,request,p_kind,p_account_id,p_rate,p_payload,result,auth.uid());
 return result;
end $$;

create function public.treasury_reverse_movement(p_id uuid,p_date date,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.treasury_authorize();m public.treasury_movements;r uuid;original_entry uuid;entry uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('treasury:'||tenant,0));
 select * into m from public.treasury_movements where id=p_id and tenant_id=tenant for update;
 if not found or m.reverse_of is not null then raise exception 'Movimiento no disponible para reversar';end if;
 if m.source_kind not in ('Manual','Transferencia') then raise exception 'Revierte el recibo o pago desde su documento de origen';end if;
 if p_date is null or p_date<m.occurred_on or p_date>(clock_timestamp() at time zone 'America/Tegucigalpa')::date or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Revisa fecha y motivo del reverso';end if;
 select id into r from public.treasury_movements where tenant_id=tenant and reverse_of=m.id;if found then return r;end if;
 if m.transfer_id is not null then
  for m in select * from public.treasury_movements where tenant_id=tenant and transfer_id=m.transfer_id order by id loop
   insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,description,reference,method,category,source_kind,source_key,reverse_of,created_by)
   values(tenant,m.account_id,p_date,p_date,-m.amount,m.exchange_rate,p_reason,m.reference,m.method,m.category,'Reverso','reverse:'||m.source_key,m.id,auth.uid()) returning id into r;
   select entry_id into original_entry from public.treasury_postings where movement_id=m.id;
   if original_entry is not null then entry:=public.reverse_journal_internal(original_entry,p_date,p_reason);insert into public.treasury_postings(tenant_id,movement_id,entry_id) values(tenant,r,entry);end if;
  end loop;
 else
  insert into public.treasury_movements(tenant_id,account_id,occurred_on,value_on,amount,exchange_rate,description,reference,method,category,source_kind,source_key,reverse_of,created_by)
  values(tenant,m.account_id,p_date,p_date,-m.amount,m.exchange_rate,p_reason,m.reference,m.method,m.category,'Reverso','reverse:'||m.source_key,m.id,auth.uid()) returning id into r;
  select entry_id into original_entry from public.treasury_postings where movement_id=m.id;
  if original_entry is not null then entry:=public.reverse_journal_internal(original_entry,p_date,p_reason);insert into public.treasury_postings(tenant_id,movement_id,entry_id) values(tenant,r,entry);end if;
 end if;
 return r;
end $$;

create or replace function public.post_supplier_payment_journal(p_payment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare payment public.pagos_proveedor%rowtype;payable public.cuentas_pagar%rowtype;amount numeric;rate numeric;previous_amount numeric;previous_base numeric;adjusted numeric;cash numeric;cash_rate numeric;lines jsonb;difference numeric;
begin
 perform public.treasury_authorize();
 select * into payment from public.pagos_proveedor where id=p_payment_id and tenant_id=public.current_tenant_id();
 if not found or payment.status not in ('Aplicado','Reversado') then raise exception 'Pago no disponible';end if;
 select * into payable from public.cuentas_pagar where id=payment.cuenta_pagar_id;
 rate:=case when payment.moneda='HNL' then 1 else payable.tipo_cambio end;
 if rate is null or rate<=0 or rate>1000000 then raise exception 'Configura el tipo de cambio de la compra';end if;
 amount:=round(payment.monto*rate,2);
 select coalesce(sum(p.monto),0),coalesce(sum((select sum(l.debit) from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id and l.account_id=public.account_for('payable'))),0) into previous_amount,previous_base from public.pagos_proveedor p
 where p.cuenta_pagar_id=payable.id and p.id<>payment.id and p.status='Aplicado' and exists(select 1 from public.journal_entries e where e.tenant_id=p.tenant_id and e.source_key='supplier-payment:'||p.id);
 adjusted:=(public.supplier_payable_balance_internal(payable.id)->>'total_adjusted')::numeric;
 if previous_amount+payment.monto=adjusted then amount:=round(adjusted*rate,2)-previous_base;end if;
 cash_rate:=case when payment.withholding_document_id is not null then rate else coalesce(payment.treasury_exchange_rate,rate) end;
 cash:=case when payment.treasury_account_id is null or payment.withholding_document_id is not null then amount else round(payment.monto*cash_rate,2) end;
 lines:=jsonb_build_array(jsonb_build_object('account_id',public.account_for('payable'),'debit',amount),jsonb_build_object('account_id',case when payment.withholding_document_id is not null then public.account_for('withholding_payable') else public.treasury_cash_account(payment.treasury_account_id) end,'credit',cash));
 difference:=cash-amount;
 if difference<>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account_id',public.account_for(case when difference>0 then 'exchange_loss' else 'exchange_gain' end),'debit',greatest(difference,0),'credit',greatest(-difference,0)));end if;
 return public.post_journal_internal(payment.fecha_pago,'Pago a proveedor: '||coalesce(payment.referencia,payable.descripcion),'Pago realizado',payment.id,'supplier-payment:'||payment.id,lines,payment.moneda,cash_rate,payment.monto);
end $$;

create view public.treasury_ledger with(security_invoker=true) as
 select m.*,a.currency,a.name account_name,a.bank,a.account_number,p.entry_id,e.entry_date,e.entry_number
 from public.treasury_movements m join public.treasury_accounts a on a.tenant_id=m.tenant_id and a.id=m.account_id
 left join public.treasury_postings p on p.tenant_id=m.tenant_id and p.movement_id=m.id
 left join public.journal_entries e on e.tenant_id=p.tenant_id and e.id=p.entry_id;
revoke all on public.treasury_ledger from public,anon;grant select on public.treasury_ledger to authenticated;

create or replace function public.create_manual_journal(p_request_id uuid,p_date date,p_description text,p_lines jsonb) returns uuid language plpgsql security definer set search_path=public as $$begin
 perform public.treasury_authorize();
 if exists(select 1 from jsonb_array_elements(p_lines) line join public.treasury_accounts a on a.tenant_id=public.current_tenant_id() and a.gl_account_id=(line->>'account_id')::uuid) then raise exception 'Registra los movimientos de estas cuentas desde Caja/Bancos para conservar su moneda y conciliación';end if;
 if p_request_id is null then raise exception 'Identificador de solicitud requerido';end if;
 return public.post_journal_internal(p_date,p_description,'Manual',p_request_id,'manual:'||p_request_id,p_lines);
end $$;

revoke all on function public.treasury_authorize(),public.treasury_immutable(),public.treasury_account_audit(),public.treasury_rate_snapshot(),public.treasury_validate_account(uuid,text,date),public.treasury_cash_account(uuid),public.treasury_route_cash(),public.treasury_capture_cash() from public,anon,authenticated;
revoke all on function public.treasury_create_account(uuid,jsonb),public.treasury_configure_gl(uuid,uuid,uuid),public.treasury_register_movement(uuid,jsonb),public.treasury_transfer(uuid,jsonb),public.treasury_post_movement(uuid),public.treasury_register_source(text,uuid,numeric,jsonb),public.treasury_reverse_movement(uuid,date,text) from public,anon;
grant execute on function public.treasury_create_account(uuid,jsonb),public.treasury_configure_gl(uuid,uuid,uuid),public.treasury_register_movement(uuid,jsonb),public.treasury_transfer(uuid,jsonb),public.treasury_post_movement(uuid),public.treasury_register_source(text,uuid,numeric,jsonb),public.treasury_reverse_movement(uuid,date,text) to authenticated;
revoke all on function public.treasury_save_rate(uuid,uuid,date,numeric,numeric) from public,anon;grant execute on function public.treasury_save_rate(uuid,uuid,date,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
