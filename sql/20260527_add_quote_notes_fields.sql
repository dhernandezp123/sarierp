alter table public.quotations
add column if not exists pricing_notes text,
add column if not exists client_notes text;