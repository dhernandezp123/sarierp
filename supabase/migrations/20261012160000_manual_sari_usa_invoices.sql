-- Independent SARI USA documents. No postings, CAI, receivables or invoice transitions.
create or replace function public.can_use_manual_invoices()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_approved_active_user()
    and public.is_role(array['Admin', 'Operaciones', 'Finanzas', 'Contabilidad'])
    and exists (select 1 from public.tenant_domains d join public.tenants t on t.id = d.tenant_id
      where d.tenant_id = public.current_tenant_id() and d.hostname = 'sari.forwarders.app'
        and d.is_active and t.status = 'Activo')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not coalesce(p.is_platform_admin, false));
$$;
revoke all on function public.can_use_manual_invoices() from public, anon;
grant execute on function public.can_use_manual_invoices() to authenticated;

create table public.manual_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  invoice_number text not null,
  client_name text not null,
  total numeric(14,2) not null check (total >= 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 131072),
  created_at timestamptz not null default now()
);
create index manual_invoices_tenant_created_idx on public.manual_invoices(tenant_id, created_at desc);
alter table public.manual_invoices enable row level security;
create policy manual_invoices_read on public.manual_invoices for select to authenticated
using (tenant_id = public.current_tenant_id() and public.can_use_manual_invoices());
create policy manual_invoices_create on public.manual_invoices for insert to authenticated
with check (tenant_id = public.current_tenant_id() and created_by = auth.uid() and public.can_use_manual_invoices());
revoke all on public.manual_invoices from anon, authenticated;
grant select, insert on public.manual_invoices to authenticated;
grant all on public.manual_invoices to service_role;

create or replace function public.validate_manual_invoice_insert()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  f record;
  item jsonb;
  wr jsonb;
  amount_text text;
  calculated_total numeric := 0;
begin
  -- Validate even direct REST inserts; never trust client-provided summary totals.
  for f in select * from (values
    ('invoice_number',40),('issue_date',10),('due_date',10),('bill_to_name',100),('bill_to_address',180),
    ('bill_to_city',100),('file_number',40),('customer_reference',60),('shipper',100),('consignee',100),
    ('carrier',100),('goods_description',120),('hbl',50),('mbl',50),('origin',80),('destination',80),
    ('charges_term',30),('pieces',20),('weight_lb',30),('booking_number',40),('container_size',30),
    ('container_number',60),('consol_number',40)
  ) as fields(key,max_length) loop
    if jsonb_typeof(new.data->f.key) is distinct from 'string'
      or length(new.data->>f.key) > f.max_length or (new.data->>f.key) ~ '[[:cntrl:]]' then
      raise exception 'Invalid manual invoice field: %', f.key using errcode = '23514';
    end if;
    new.data := jsonb_set(new.data, array[f.key], to_jsonb(btrim(new.data->>f.key)));
  end loop;
  if new.data->>'invoice_number' = '' or new.data->>'bill_to_name' = '' then
    raise exception 'Invoice number and client are required' using errcode = '23514';
  end if;
  for f in select key from (values ('issue_date'),('due_date')) dates(key) loop
    if (new.data->>f.key) !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid manual invoice date' using errcode = '23514';
    end if;
    perform (new.data->>f.key)::date;
  end loop;
  if jsonb_typeof(new.data->'items') is distinct from 'array' then
    raise exception 'Invalid charges' using errcode = '23514';
  end if;
  if jsonb_array_length(new.data->'items') not between 1 and 100 then
    raise exception 'Invalid number of charges' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(new.data->'items') loop
    if jsonb_typeof(item->'description') is distinct from 'string' or length(btrim(item->>'description')) = 0
      or length(item->>'description') > 180 or (item->>'description') ~ '[[:cntrl:]]'
      or jsonb_typeof(item->'amount') is distinct from 'string' then
      raise exception 'Invalid charge' using errcode = '23514';
    end if;
    amount_text := regexp_replace(btrim(item->>'amount'), '^(USD\s*|\$\s*)', '', 'i');
    if amount_text !~ '^(\d{1,9}|\d{1,3}(,\d{3}){1,2})(\.\d{1,2})?$' then
      raise exception 'Invalid charge amount' using errcode = '23514';
    end if;
    calculated_total := calculated_total + replace(amount_text, ',', '')::numeric;
  end loop;
  if jsonb_typeof(new.data->'warehouse_receipts') is distinct from 'array' then
    raise exception 'Invalid WR list' using errcode = '23514';
  end if;
  if jsonb_array_length(new.data->'warehouse_receipts') > 200 then
    raise exception 'Too many WR references' using errcode = '23514';
  end if;
  for wr in select value from jsonb_array_elements(new.data->'warehouse_receipts') loop
    if jsonb_typeof(wr) is distinct from 'string' or length(wr #>> '{}') > 40 or (wr #>> '{}') ~ '[[:cntrl:]]' then
      raise exception 'Invalid WR reference' using errcode = '23514';
    end if;
  end loop;
  new.invoice_number := new.data->>'invoice_number';
  new.client_name := new.data->>'bill_to_name';
  new.total := calculated_total;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.validate_manual_invoice_insert() from public, anon;
create trigger manual_invoice_validate before insert on public.manual_invoices
for each row execute function public.validate_manual_invoice_insert();

-- Private, atomic OCR budget. Denied/failed provider calls also consume a slot.
create table public.manual_invoice_ocr_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null,
  attempts integer not null check (attempts between 1 and 20),
  primary key(user_id, usage_day)
);
alter table public.manual_invoice_ocr_usage enable row level security;
revoke all on public.manual_invoice_ocr_usage from anon, authenticated;
grant all on public.manual_invoice_ocr_usage to service_role;

create or replace function public.claim_manual_invoice_ocr()
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean := false;
begin
  if not public.can_use_manual_invoices() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.manual_invoice_ocr_usage(user_id, usage_day, attempts)
  values (auth.uid(), timezone('America/New_York', now())::date, 1)
  on conflict (user_id, usage_day) do update set attempts = manual_invoice_ocr_usage.attempts + 1
    where manual_invoice_ocr_usage.attempts < 20
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_manual_invoice_ocr() from public, anon;
grant execute on function public.claim_manual_invoice_ocr() to authenticated;
comment on table public.manual_invoices is 'Immutable standalone SARI USA invoice versions, excluded from accounting and receivables.';
notify pgrst, 'reload schema';
