-- =========================================================
-- AUDIT RLS HARDENING - fases 1 a 17
-- Ejecutar despues de las migraciones de fases 1 a 17.
-- Corrige policies legacy permisivas usando roles del ERP.
-- =========================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true) = true
    and coalesce(p.status, 'Aprobado') = 'Aprobado'
  limit 1
$$;

create or replace function public.is_approved_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() is not null
$$;

create or replace function public.is_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(p_roles), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_role(array['Admin'])
$$;

create or replace function public.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_role(array['Admin', 'Finanzas', 'Contabilidad'])
$$;

create or replace function public.can_manage_pricing_catalogs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_role(array['Admin', 'Pricing'])
$$;

create or replace function public.can_manage_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_role(array['Admin', 'Operaciones'])
$$;

create or replace function public.can_access_invoice(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_finance()
    and exists (
      select 1
      from public.invoices i
      where i.id = p_invoice_id
        and i.deleted_at is null
    )
$$;

create or replace function public.can_access_bill_of_lading(p_bl_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_operations()
    and exists (
      select 1
      from public.bills_of_lading bl
      where bl.id = p_bl_id
    )
$$;

-- =========================================================
-- surcharge_rules: catalogo de pricing/Miami
-- =========================================================

alter table public.surcharge_rules enable row level security;

drop policy if exists "surcharge_rules_select" on public.surcharge_rules;
drop policy if exists "surcharge_rules_insert" on public.surcharge_rules;
drop policy if exists "surcharge_rules_update" on public.surcharge_rules;
drop policy if exists "surcharge_rules_delete" on public.surcharge_rules;
drop policy if exists "surcharge_rules_select_policy" on public.surcharge_rules;
drop policy if exists "surcharge_rules_insert_policy" on public.surcharge_rules;
drop policy if exists "surcharge_rules_update_policy" on public.surcharge_rules;
drop policy if exists "surcharge_rules_delete_policy" on public.surcharge_rules;

create policy "surcharge_rules_select_policy"
on public.surcharge_rules
for select
to authenticated
using (public.is_approved_active_user());

create policy "surcharge_rules_insert_policy"
on public.surcharge_rules
for insert
to authenticated
with check (public.can_manage_pricing_catalogs());

create policy "surcharge_rules_update_policy"
on public.surcharge_rules
for update
to authenticated
using (public.can_manage_pricing_catalogs())
with check (public.can_manage_pricing_catalogs());

create policy "surcharge_rules_delete_policy"
on public.surcharge_rules
for delete
to authenticated
using (public.is_admin());

-- =========================================================
-- shipping_instruction_events
-- =========================================================

alter table public.shipping_instruction_events enable row level security;

drop policy if exists "shipping_instruction_events_select_policy" on public.shipping_instruction_events;
drop policy if exists "shipping_instruction_events_insert_policy" on public.shipping_instruction_events;
drop policy if exists "shipping_instruction_events_update_policy" on public.shipping_instruction_events;
drop policy if exists "shipping_instruction_events_delete_policy" on public.shipping_instruction_events;

create policy "shipping_instruction_events_select_policy"
on public.shipping_instruction_events
for select
to authenticated
using (public.can_select_shipping_instruction(shipping_instruction_id));

create policy "shipping_instruction_events_insert_policy"
on public.shipping_instruction_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_update_shipping_instruction(shipping_instruction_id)
);

create policy "shipping_instruction_events_update_policy"
on public.shipping_instruction_events
for update
to authenticated
using (public.can_manage_operations())
with check (public.can_manage_operations());

create policy "shipping_instruction_events_delete_policy"
on public.shipping_instruction_events
for delete
to authenticated
using (public.is_admin());

-- =========================================================
-- bookings / booking_containers / booking_documents
-- Reaplica hardening si una migracion posterior reintrodujo policies true.
-- =========================================================

alter table public.bookings enable row level security;
alter table public.booking_containers enable row level security;
alter table public.booking_documents enable row level security;

drop policy if exists "authenticated_full_access" on public.bookings;
drop policy if exists "Allow authenticated users full access" on public.bookings;
drop policy if exists "authenticated_read" on public.bookings;
drop policy if exists "authenticated_insert" on public.bookings;
drop policy if exists "authenticated_update" on public.bookings;
drop policy if exists "authenticated_delete" on public.bookings;
drop policy if exists "bookings_select_policy" on public.bookings;
drop policy if exists "bookings_insert_policy" on public.bookings;
drop policy if exists "bookings_update_policy" on public.bookings;
drop policy if exists "bookings_delete_policy" on public.bookings;

create policy "bookings_select_policy"
on public.bookings
for select
to authenticated
using (
  public.can_manage_operations()
  or public.is_sales_owner_of_shipping_instruction(shipping_instruction_id)
);

create policy "bookings_insert_policy"
on public.bookings
for insert
to authenticated
with check (public.can_manage_operations());

create policy "bookings_update_policy"
on public.bookings
for update
to authenticated
using (public.can_manage_operations())
with check (public.can_manage_operations());

create policy "bookings_delete_policy"
on public.bookings
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated_full_access" on public.booking_containers;
drop policy if exists "booking_containers_select_policy" on public.booking_containers;
drop policy if exists "booking_containers_insert_policy" on public.booking_containers;
drop policy if exists "booking_containers_update_policy" on public.booking_containers;
drop policy if exists "booking_containers_delete_policy" on public.booking_containers;

create policy "booking_containers_select_policy"
on public.booking_containers
for select
to authenticated
using (public.can_select_booking(booking_id));

create policy "booking_containers_insert_policy"
on public.booking_containers
for insert
to authenticated
with check (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
);

create policy "booking_containers_update_policy"
on public.booking_containers
for update
to authenticated
using (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
)
with check (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
);

create policy "booking_containers_delete_policy"
on public.booking_containers
for delete
to authenticated
using (
  public.is_admin()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_documents_select_policy" on public.booking_documents;
drop policy if exists "booking_documents_insert_policy" on public.booking_documents;
drop policy if exists "booking_documents_update_policy" on public.booking_documents;
drop policy if exists "booking_documents_delete_policy" on public.booking_documents;

create policy "booking_documents_select_policy"
on public.booking_documents
for select
to authenticated
using (public.can_select_booking(booking_id));

create policy "booking_documents_insert_policy"
on public.booking_documents
for insert
to authenticated
with check (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
  and uploaded_by = auth.uid()
);

create policy "booking_documents_update_policy"
on public.booking_documents
for update
to authenticated
using (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
)
with check (
  public.can_manage_operations()
  and public.can_select_booking(booking_id)
);

create policy "booking_documents_delete_policy"
on public.booking_documents
for delete
to authenticated
using (
  public.is_admin()
  and public.can_select_booking(booking_id)
);

-- =========================================================
-- bills_of_lading / bl_containers
-- =========================================================

alter table public.bills_of_lading enable row level security;
alter table public.bl_containers enable row level security;

drop policy if exists "authenticated_full_access" on public.bills_of_lading;
drop policy if exists "authenticated_read" on public.bills_of_lading;
drop policy if exists "authenticated_insert" on public.bills_of_lading;
drop policy if exists "authenticated_update" on public.bills_of_lading;
drop policy if exists "authenticated_delete" on public.bills_of_lading;
drop policy if exists "bills_of_lading_select_policy" on public.bills_of_lading;
drop policy if exists "bills_of_lading_insert_policy" on public.bills_of_lading;
drop policy if exists "bills_of_lading_update_policy" on public.bills_of_lading;
drop policy if exists "bills_of_lading_delete_policy" on public.bills_of_lading;

create policy "bills_of_lading_select_policy"
on public.bills_of_lading
for select
to authenticated
using (public.can_access_bill_of_lading(id));

create policy "bills_of_lading_insert_policy"
on public.bills_of_lading
for insert
to authenticated
with check (public.can_manage_operations());

create policy "bills_of_lading_update_policy"
on public.bills_of_lading
for update
to authenticated
using (public.can_manage_operations())
with check (public.can_manage_operations());

create policy "bills_of_lading_delete_policy"
on public.bills_of_lading
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated_full_access" on public.bl_containers;
drop policy if exists "bl_containers_select_policy" on public.bl_containers;
drop policy if exists "bl_containers_insert_policy" on public.bl_containers;
drop policy if exists "bl_containers_update_policy" on public.bl_containers;
drop policy if exists "bl_containers_delete_policy" on public.bl_containers;

create policy "bl_containers_select_policy"
on public.bl_containers
for select
to authenticated
using (
  exists (
    select 1
    from public.bills_of_lading bl
    where bl.id = bl_containers.bl_id
      and public.can_access_bill_of_lading(bl.id)
  )
);

create policy "bl_containers_insert_policy"
on public.bl_containers
for insert
to authenticated
with check (
  public.can_manage_operations()
  and exists (
    select 1
    from public.bills_of_lading bl
    where bl.id = bl_containers.bl_id
  )
);

create policy "bl_containers_update_policy"
on public.bl_containers
for update
to authenticated
using (public.can_manage_operations())
with check (public.can_manage_operations());

create policy "bl_containers_delete_policy"
on public.bl_containers
for delete
to authenticated
using (public.is_admin());

-- =========================================================
-- agent_route_rates
-- =========================================================

alter table public.agent_route_rates enable row level security;

drop policy if exists "authenticated_full_access" on public.agent_route_rates;
drop policy if exists "agent_route_rates_select_policy" on public.agent_route_rates;
drop policy if exists "agent_route_rates_insert_policy" on public.agent_route_rates;
drop policy if exists "agent_route_rates_update_policy" on public.agent_route_rates;
drop policy if exists "agent_route_rates_delete_policy" on public.agent_route_rates;

create policy "agent_route_rates_select_policy"
on public.agent_route_rates
for select
to authenticated
using (public.is_role(array['Admin', 'Pricing']));

create policy "agent_route_rates_insert_policy"
on public.agent_route_rates
for insert
to authenticated
with check (public.can_manage_pricing_catalogs());

create policy "agent_route_rates_update_policy"
on public.agent_route_rates
for update
to authenticated
using (public.can_manage_pricing_catalogs())
with check (public.can_manage_pricing_catalogs());

create policy "agent_route_rates_delete_policy"
on public.agent_route_rates
for delete
to authenticated
using (public.is_admin());

-- =========================================================
-- invoices / invoice_items / invoice_payments
-- =========================================================

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;

drop policy if exists "authenticated_full_access" on public.invoices;
drop policy if exists "invoices_select_policy" on public.invoices;
drop policy if exists "invoices_insert_policy" on public.invoices;
drop policy if exists "invoices_update_policy" on public.invoices;
drop policy if exists "invoices_delete_policy" on public.invoices;

create policy "invoices_select_policy"
on public.invoices
for select
to authenticated
using (public.can_manage_finance() and deleted_at is null);

create policy "invoices_insert_policy"
on public.invoices
for insert
to authenticated
with check (public.can_manage_finance());

create policy "invoices_update_policy"
on public.invoices
for update
to authenticated
using (public.can_manage_finance())
with check (public.can_manage_finance());

create policy "invoices_delete_policy"
on public.invoices
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated_full_access" on public.invoice_items;
drop policy if exists "invoice_items_select_policy" on public.invoice_items;
drop policy if exists "invoice_items_insert_policy" on public.invoice_items;
drop policy if exists "invoice_items_update_policy" on public.invoice_items;
drop policy if exists "invoice_items_delete_policy" on public.invoice_items;

create policy "invoice_items_select_policy"
on public.invoice_items
for select
to authenticated
using (public.can_access_invoice(invoice_id));

create policy "invoice_items_insert_policy"
on public.invoice_items
for insert
to authenticated
with check (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
);

create policy "invoice_items_update_policy"
on public.invoice_items
for update
to authenticated
using (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
)
with check (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
);

create policy "invoice_items_delete_policy"
on public.invoice_items
for delete
to authenticated
using (
  public.is_admin()
  and public.can_access_invoice(invoice_id)
);

drop policy if exists "authenticated_full_access" on public.invoice_payments;
drop policy if exists "invoice_payments_select_policy" on public.invoice_payments;
drop policy if exists "invoice_payments_insert_policy" on public.invoice_payments;
drop policy if exists "invoice_payments_update_policy" on public.invoice_payments;
drop policy if exists "invoice_payments_delete_policy" on public.invoice_payments;

create policy "invoice_payments_select_policy"
on public.invoice_payments
for select
to authenticated
using (public.can_access_invoice(invoice_id));

create policy "invoice_payments_insert_policy"
on public.invoice_payments
for insert
to authenticated
with check (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
);

create policy "invoice_payments_update_policy"
on public.invoice_payments
for update
to authenticated
using (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
)
with check (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
);

create policy "invoice_payments_delete_policy"
on public.invoice_payments
for delete
to authenticated
using (
  public.can_manage_finance()
  and public.can_access_invoice(invoice_id)
);

-- =========================================================
-- cai_ranges
-- =========================================================

alter table public.cai_ranges enable row level security;

drop policy if exists "authenticated_full_access" on public.cai_ranges;
drop policy if exists "cai_ranges_select_policy" on public.cai_ranges;
drop policy if exists "cai_ranges_insert_policy" on public.cai_ranges;
drop policy if exists "cai_ranges_update_policy" on public.cai_ranges;
drop policy if exists "cai_ranges_delete_policy" on public.cai_ranges;

create policy "cai_ranges_select_policy"
on public.cai_ranges
for select
to authenticated
using (public.is_approved_active_user());

create policy "cai_ranges_insert_policy"
on public.cai_ranges
for insert
to authenticated
with check (public.can_manage_finance());

create policy "cai_ranges_update_policy"
on public.cai_ranges
for update
to authenticated
using (public.can_manage_finance())
with check (public.can_manage_finance());

create policy "cai_ranges_delete_policy"
on public.cai_ranges
for delete
to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
