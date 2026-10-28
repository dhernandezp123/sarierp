\set ON_ERROR_STOP on

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000981',
  'authenticated',
  'authenticated',
  'phase8-upgrade@test.local',
  '{}'::jsonb
);

update public.profiles
set
  nombre = 'Usuario',
  apellido = 'Upgrade',
  rol = 'Admin',
  status = 'Aprobado',
  is_active = true,
  email = 'phase8-upgrade@test.local'
where id = '00000000-0000-0000-0000-000000000981';

insert into public.clientes (id, codigo_cliente, nombre, vendedor_asignado)
values (
  '00000000-0000-4000-8000-000000000981',
  'PHASE8-UPGRADE',
  'Cliente ficticio upgrade',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.quotations (
  id, quotation_number, cliente_id, created_by, status, service_product,
  origen, destino
)
values (
  '00000000-0000-4000-8000-000000000982',
  'Q-PHASE8-UPGRADE',
  '00000000-0000-4000-8000-000000000981',
  '00000000-0000-0000-0000-000000000981',
  'Borrador',
  'other_origin_fcl',
  'Miami',
  'San Pedro Sula'
);

insert into public.quotation_containers (
  id, quotation_id, container_type_name, quantity
)
values (
  '00000000-0000-4000-8000-000000000983',
  '00000000-0000-4000-8000-000000000982',
  '40HC',
  1
);

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, carrier, costo, moneda, is_selected
)
values (
  '00000000-0000-4000-8000-000000000984',
  '00000000-0000-4000-8000-000000000982',
  'Agente ficticio',
  'Carrier ficticio',
  800,
  'USD',
  true
);

insert into public.pricing_items (
  id, quotation_id, item_type, description, created_by
)
values (
  '00000000-0000-4000-8000-000000000985',
  '00000000-0000-4000-8000-000000000982',
  'Flete',
  'Flete ficticio upgrade',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, status, shipment_status,
  operational_status, created_by
)
values (
  '00000000-0000-4000-8000-000000000986',
  'RT-PHASE8-UPGRADE',
  '00000000-0000-4000-8000-000000000982',
  '00000000-0000-4000-8000-000000000981',
  'Borrador',
  'Pendiente Validación',
  'Pendiente Validación',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.bookings (
  id, shipping_instruction_id, shipment_id, booking_number,
  shipment_status, created_by
)
values (
  '00000000-0000-4000-8000-000000000988',
  '00000000-0000-4000-8000-000000000986',
  '00000000-0000-4000-8000-000000000986',
  'BK-PHASE8-UPGRADE',
  'Booking Solicitado',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.operational_events (
  id, shipping_instruction_id, booking_id, shipment_id, event_code,
  event_label, occurred_at, source_system, created_by
)
values (
  '00000000-0000-4000-8000-000000000989',
  '00000000-0000-4000-8000-000000000986',
  '00000000-0000-4000-8000-000000000988',
  '00000000-0000-4000-8000-000000000986',
  'OPERATIONAL_NOTE',
  'Evento ficticio upgrade',
  now(),
  'manual',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.proveedores (id, nombre, tipo)
values (
  '00000000-0000-4000-8000-000000000990',
  'Proveedor ficticio upgrade',
  'Agente'
);

insert into public.cuentas_pagar (
  id, proveedor_id, quotation_id, booking_id, descripcion, monto,
  status, created_by
)
values (
  '00000000-0000-4000-8000-000000000991',
  '00000000-0000-4000-8000-000000000990',
  '00000000-0000-4000-8000-000000000982',
  '00000000-0000-4000-8000-000000000988',
  'Costo ficticio upgrade',
  800,
  'Pendiente',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.invoices (
  id, invoice_number, invoice_type, status, quotation_id, cliente_id,
  cliente_nombre, issue_date, due_date, subtotal, tax_amount, total,
  currency, created_by
)
values (
  '00000000-0000-4000-8000-000000000992',
  'PF-PHASE8-UPGRADE',
  'Proforma',
  'Borrador',
  '00000000-0000-4000-8000-000000000982',
  '00000000-0000-4000-8000-000000000981',
  'Cliente ficticio upgrade',
  current_date,
  current_date + 15,
  1000,
  150,
  1150,
  'USD',
  '00000000-0000-0000-0000-000000000981'
);

insert into public.invoice_items (
  id, invoice_id, description, quantity, unit_price, amount, isv_rate,
  tax_amount
)
values (
  '00000000-0000-4000-8000-000000000993',
  '00000000-0000-4000-8000-000000000992',
  'Servicio ficticio upgrade',
  1,
  1000,
  1000,
  15,
  150
);

insert into public.support_tickets (
  id, ticket_number, subject, category, priority, status, created_by
)
values (
  '00000000-0000-4000-8000-000000000994',
  'SUP-PHASE8-UPGRADE',
  'Ticket ficticio de upgrade',
  'Consulta',
  'Normal',
  'Nuevo',
  '00000000-0000-0000-0000-000000000981'
);

create schema if not exists phase8_certification;
create table phase8_certification.pre_upgrade_counts (
  table_name text primary key,
  row_count bigint not null
);

do $$
declare
  table_name text;
  row_count bigint;
begin
  foreach table_name in array array[
    'profiles', 'clientes', 'quotations', 'quotation_containers',
    'agent_quotes', 'pricing_items', 'shipping_instructions', 'shipments',
    'bookings', 'operational_events', 'proveedores', 'cuentas_pagar',
    'invoices', 'invoice_items', 'support_tickets'
  ] loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    insert into phase8_certification.pre_upgrade_counts
      values (table_name, row_count);
  end loop;
end;
$$;

commit;

\echo 'phase8_upgrade_fixture.sql: OK'
