-- AUD-08: replay must not cross provider credentials/accounts after key rotation.
begin;
alter table public.client_email_deliveries add column provider_credential_hash text;
alter table public.support_notification_outbox add column provider_credential_hash text;
create index support_notification_outbox_recovery_idx
  on public.support_notification_outbox (status, updated_at)
  where status in ('processing', 'uncertain');
-- Metadata-only grants from the preceding migration do not expose this hash.
notify pgrst, 'reload schema';
commit;
