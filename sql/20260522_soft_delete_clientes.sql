alter table public.clientes
  add column if not exists deleted_at timestamptz null;

alter table public.clientes
  add column if not exists deleted_by uuid null references auth.users(id);

create index if not exists idx_clientes_deleted_at
  on public.clientes (deleted_at);

create index if not exists idx_clientes_active_nombre
  on public.clientes (nombre)
  where deleted_at is null;