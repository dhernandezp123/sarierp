alter table public.shipping_instructions
add column if not exists operational_status text default 'Pendiente Validación';

update public.shipping_instructions
set operational_status = coalesce(operational_status, shipment_status, 'Pendiente Validación');

notify pgrst, 'reload schema';