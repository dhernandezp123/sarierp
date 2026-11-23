-- FLOW-BL-RETURNING-01: INSERT ... RETURNING must authorize the new row directly.
-- The stable can_access_bill_of_lading(id) helper re-reads the table using the
-- statement snapshot and cannot see the row that is being inserted. This makes
-- PostgREST return=representation fail even for approved, active Admin users.
-- Preserve operational roles and tenant boundaries without a self-table lookup.
alter policy bills_of_lading_select_policy on public.bills_of_lading
  using (
    public.can_manage_operations()
    and tenant_id = public.current_tenant_id()
  );
