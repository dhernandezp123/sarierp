-- Only the database trigger may produce canonical rate-audit events. Prevent
-- an API caller from fabricating an event in the general activity log or using
-- a forged transaction id to hide a real change in the grouped history reader.
create policy client_rate_audit_insert_guard on public.activity_logs
  as restrictive for insert to authenticated
  with check (
    action not in ('client_rate_insert','client_rate_update','client_rate_delete')
    and coalesce(metadata->>'source','')<>'client_rates_trigger'
  );
