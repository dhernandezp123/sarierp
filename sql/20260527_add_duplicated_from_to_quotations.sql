alter table public.quotations
add column if not exists duplicated_from uuid references public.quotations(id);