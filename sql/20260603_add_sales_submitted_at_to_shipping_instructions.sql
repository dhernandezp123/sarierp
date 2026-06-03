alter table public.shipping_instructions
add column if not exists sales_submitted_at timestamptz null;

notify pgrst, 'reload schema';
