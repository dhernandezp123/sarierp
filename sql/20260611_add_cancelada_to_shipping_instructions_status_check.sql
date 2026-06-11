alter table public.shipping_instructions
drop constraint if exists shipping_instructions_shipment_status_check;

alter table public.shipping_instructions
add constraint shipping_instructions_shipment_status_check
check (
  shipment_status in (
    'Pendiente Validación',
    'Validada',
    'Booking Solicitado',
    'Booking Confirmado',
    'Documentación Pendiente',
    'Listo para Embarque',
    'Embarcado',
    'En Tránsito',
    'Arribado',
    'Finalizado',
    'Cancelada'
  )
);

alter table public.shipping_instructions
drop constraint if exists shipping_instructions_operational_status_check;

alter table public.shipping_instructions
add constraint shipping_instructions_operational_status_check
check (
  operational_status is null
  or operational_status in (
    'Pendiente Validación',
    'Validada',
    'Asignado',
    'Listo para Booking',
    'En Booking',
    'Booking Solicitado',
    'Booking Confirmado',
    'Documentación Pendiente',
    'Listo para Embarque',
    'Embarcado',
    'En Tránsito',
    'Arribado',
    'Finalizado',
    'Cancelada'
  )
);

notify pgrst, 'reload schema';
