alter table public.quotations
  add column if not exists deleted_at timestamptz null;

alter table public.quotations
  add column if not exists deleted_by uuid null references auth.users(id);

create index if not exists idx_quotations_deleted_at
  on public.quotations (deleted_at);

create index if not exists idx_quotations_active_created_at
  on public.quotations (created_at desc)
  where deleted_at is null;
