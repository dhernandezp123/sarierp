-- =========================================================
-- Hardening RLS para public.shipping_instruction_events
-- =========================================================

alter table public.shipping_instruction_events enable row level security;

drop policy if exists "Allow read shipping instruction events"
on public.shipping_instruction_events;

drop policy if exists "Allow manage shipping instruction events"
on public.shipping_instruction_events;

drop policy if exists "shipping_instruction_events_select_policy"
on public.shipping_instruction_events;

drop policy if exists "shipping_instruction_events_insert_policy"
on public.shipping_instruction_events;

drop policy if exists "shipping_instruction_events_update_policy"
on public.shipping_instruction_events;

drop policy if exists "shipping_instruction_events_delete_policy"
on public.shipping_instruction_events;

create policy "shipping_instruction_events_select_policy"
on public.shipping_instruction_events
for select
to authenticated
using (
  public.can_select_shipping_instruction(shipping_instruction_id)
);

create policy "shipping_instruction_events_insert_policy"
on public.shipping_instruction_events
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and created_by = auth.uid()
  and public.can_select_shipping_instruction(shipping_instruction_id)
);

create policy "shipping_instruction_events_update_policy"
on public.shipping_instruction_events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "shipping_instruction_events_delete_policy"
on public.shipping_instruction_events
for delete
to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
