alter table public.surcharge_rules enable row level security;

drop policy if exists surcharge_rules_select on public.surcharge_rules;
drop policy if exists surcharge_rules_insert on public.surcharge_rules;
drop policy if exists surcharge_rules_update on public.surcharge_rules;
drop policy if exists surcharge_rules_delete on public.surcharge_rules;

drop policy if exists surcharge_rules_select_policy on public.surcharge_rules;
drop policy if exists surcharge_rules_insert_policy on public.surcharge_rules;
drop policy if exists surcharge_rules_update_policy on public.surcharge_rules;
drop policy if exists surcharge_rules_delete_policy on public.surcharge_rules;

create policy "surcharge_rules_select_policy"
on public.surcharge_rules
for select
to authenticated
using (
  public.is_approved_active_user()
);

create policy "surcharge_rules_insert_policy"
on public.surcharge_rules
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Pricing'])
);

create policy "surcharge_rules_update_policy"
on public.surcharge_rules
for update
to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Pricing'])
)
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Pricing'])
);

create policy "surcharge_rules_delete_policy"
on public.surcharge_rules
for delete
to authenticated
using (
  public.is_admin()
);

notify pgrst, 'reload schema';
