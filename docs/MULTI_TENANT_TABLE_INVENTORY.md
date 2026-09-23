# Inventario inicial de tablas multiempresa

Fecha de corte: 21/09/2026.

Estado: clasificación inicial completa. Las Fases 1, 2, 3, 4, 5 y 6 fueron aplicadas y
validadas únicamente en Supabase local; no se han aplicado al proyecto vinculado
ni a producción. `company_settings` y el núcleo comercial de 19 tablas ya tienen
ownership obligatorio, igual que las 27 tablas operativas de Fase 4 y las 20
tablas financieras/configurables de Fase 5. Las 13 tablas tenant-scoped de
auditoría, portal y soporte de Fase 6 también quedaron aisladas. El resto
conserva la clasificación para fases posteriores.

Este inventario se obtuvo del historial en `supabase/migrations`. Es la primera
salida de la Fase 0 y clasifica las 88 tablas creadas por migraciones. Todavía se
deben cruzar vistas, funciones, triggers, políticas, claves foráneas e índices
antes de convertir esta clasificación en SQL.

## Convenciones

- **Directo**: la fila recibirá `tenant_id` propio.
- **Heredado**: el backfill se obtiene de un registro padre y se debe impedir una
  relación cruzada entre tenants.
- **Global**: catálogo compartido, sin datos privados de una empresa.
- **Plataforma**: pertenece a Hernova/Forwarders ERP, con acceso transversal
  explícito y limitado.
- **Revisar**: no se decide hasta verificar consumidores y reglas vigentes.

## Identidad, configuración y auditoría — 7 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `profiles` | Directo | Tenant Sari en backfill; futuro desde invitación/dominio |
| `company_settings` | Directo; Fase 2 local completada | Tenant autenticado; único por `tenant_id` |
| `profile_role_change_logs` | Heredado; Fase 6 local completada | `profile_id` |
| `activity_logs` | Heredado/directo; Fase 6 local completada | Perfil actor; fallback Sari solo para auditoría histórica huérfana |
| `notifications` | Heredado; Fase 6 local completada | Perfil destinatario |
| `push_tokens` | Heredado; Fase 6 local completada | Perfil propietario |
| `user_tasks` | Heredado; Fase 6 local completada | Perfil propietario |

## CRM, comercial y pricing — 29 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `clientes` | Directo; Fase 3 local completada | Perfil activo; Sari en backfill histórico |
| `client_addresses` | Heredado; Fase 3 local completada | Cliente |
| `client_email_deliveries` | Heredado; Fase 6 local completada | Paquete Miami y correo |
| `client_notes` | Heredado; Fase 3 local completada | Cliente |
| `client_notifications` | Heredado; Fase 6 local completada | Perfil destinatario |
| `client_pickup_requests` | Directo/referenciado; Fase 3 local completada | Sesión, cliente y perfil |
| `client_rate_catalog` | Directo/configurable; Fase 5 local completada | Tenant del catálogo |
| `client_rates` | Heredado; Fase 3 local completada | Cliente |
| `cliente_history` | Heredado; Fase 3 local completada | Cliente |
| `leads` | Plataforma/revisar; diferido a Fases 6/7 | Landing y dominio de origen |
| `sales_activities` | Directo/referenciado; Fase 3 local completada | Sesión y cliente opcional |
| `quotations` | Directo; Fase 3 local completada | Perfil activo y cliente |
| `quotation_containers` | Heredado; Fase 3 local completada | Cotización |
| `quotation_cargo_lines` | Heredado; Fase 3 local completada | Cotización |
| `quotation_status_history` | Heredado; Fase 3 local completada | Cotización |
| `quotation_change_logs` | Heredado; Fase 3 local completada | Cotización |
| `quotation_options` | Heredado; Fase 3 local completada | Cotización |
| `quotation_option_items` | Heredado; Fase 3 local completada | Opción comercial |
| `pricing_items` | Heredado; Fase 3 local completada | Cotización/opción |
| `agent_quotes` | Heredado/referenciado; Fase 3 local completada | Cotización y agente |
| `agent_quote_container_rates` | Heredado; Fase 3 local completada | Tarifa de agente |
| `agents` | Directo; Fase 3 local completada | Perfil activo; Sari en backfill histórico |
| `agent_route_rates` | Heredado; Fase 3 local completada | Agente |
| `carrier_catalog` | Directo; Fase 5 local completada | Configuración de tenant; evaluar base global futura |
| `locations_catalog` | Directo; Fase 5 local completada | Configuración de tenant; evaluar base global futura |
| `service_products` | Directo; Fase 5 local completada | Configuración de tenant |
| `surcharge_rules` | Directo; Fase 5 local completada | Configuración de tenant |
| `tax_rates` | Directo; Fase 5 local completada | Configuración fiscal de tenant |
| `email_templates` | Directo; Fase 5 local completada | Configuración de tenant |

## Operaciones y documentos — 19 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `shipments` | Heredado; Fase 4 local completada | Cotización |
| `operational_events` | Heredado; Fase 4 local completada | Shipping Instruction; valida shipment/booking/contenedor |
| `shipping_instructions` | Heredado/directo; Fase 4 local completada | Cotización/cliente; sesión para legacy sin padre |
| `shipping_instruction_events` | Heredado; Fase 4 local completada | Shipping Instruction |
| `bookings` | Heredado; Fase 4 local completada | Shipping Instruction |
| `booking_containers` | Heredado; Fase 4 local completada | Booking |
| `booking_cutoffs` | Heredado; Fase 4 local completada | Booking |
| `booking_documents` | Heredado; Fase 4 local completada | Booking |
| `booking_readiness_evaluations` | Heredado; Fase 4 local completada | Booking |
| `booking_readiness_exceptions` | Heredado; Fase 4 local completada | Booking |
| `booking_readiness_requirements` | Heredado; Fase 4 local completada | Booking |
| `booking_schedule_revisions` | Heredado; Fase 4 local completada | Booking |
| `bills_of_lading` | Heredado; Fase 4 local completada | Booking/BL padre |
| `bl_amendments` | Heredado; Fase 4 local completada | BL |
| `bl_containers` | Heredado; Fase 4 local completada | BL |
| `bl_draft_sends` | Heredado; Fase 4 local completada | BL |
| `bl_validation_exceptions` | Heredado; Fase 4 local completada | BL |
| `container_vgm_records` | Heredado; Fase 4 local completada | Booking; valida contenedor/documento |
| `garantias_navieras` | Heredado/directo; Fase 4 local completada | Booking o sesión para legacy sin vínculo |

## Operación Miami — 9 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `miami_carriers` | Directo; Fase 5 local completada | Configuración de tenant |
| `miami_packages` | Heredado/directo; Fase 4 local completada | Cliente/manifiesto o sesión para recepción sin asignar |
| `miami_package_events` | Heredado; Fase 4 local completada | Paquete |
| `miami_package_documents` | Heredado; Fase 4 local completada | Paquete; Storage se cierra en Fase 6 |
| `miami_pre_alerts` | Heredado; Fase 4 local completada | Cliente |
| `miami_incidencias` | Heredado; Fase 4 local completada | Cliente; valida paquete opcional |
| `miami_manifests` | Directo; Fase 4 local completada | Perfil activo; Sari en backfill histórico |
| `miami_shipments` | Directo; Fase 4 local completada | Perfil activo; Sari en backfill histórico |
| `miami_shipment_packages` | Heredado; Fase 4 local completada | Embarque y paquete; ambos deben coincidir |

## Finanzas, proveedores y numeración — 12 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `invoices` | Heredado/directo; Fase 5 local completada | Cotización/cliente; Sari si no tiene vínculo legacy |
| `invoice_items` | Heredado; Fase 5 local completada | Invoice |
| `invoice_payments` | Heredado; Fase 5 local completada | Invoice |
| `invoice_payment_splits` | Heredado; Fase 5 local completada | Pago e invoice destino; validar ambos |
| `cost_validations` | Heredado; Fase 5 local completada | Cotización/tarifa de agente |
| `cuentas_pagar` | Heredado; Fase 5 local completada | Booking/proveedor |
| `pagos_proveedor` | Heredado; Fase 5 local completada | Cuenta por pagar/proveedor |
| `proveedores` | Directo; Fase 5 local completada | Tenant Sari en backfill |
| `provider_invoice_items` | Heredado; Fase 5 local completada | Documento/cuenta de proveedor |
| `cai_ranges` | Directo; Fase 5 local completada | Configuración fiscal de tenant |
| `document_sequences` | Directo; Fase 5 local completada | Contador independiente por tenant y tipo |
| `hbl_number_counters` | Directo; Fase 5 local completada | Contador independiente por tenant y período |

## Catálogos candidatos a globales — 4 tablas

| Tabla | Clasificación inicial | Acción |
| --- | --- | --- |
| `countries` | Global | Mantener compartido si no contiene personalización |
| `ports` | Global | Mantener compartido; evaluar extensiones privadas futuras |
| `container_types` | Global/revisar | Confirmar si cada tenant puede desactivar o extender |
| `package_types` | Global/revisar | Confirmar si cada tenant puede desactivar o extender |

Los catálogos globales no deben contener tarifas, márgenes, proveedores ni otras
configuraciones comerciales. Si requieren personalización se usará un catálogo
base más una tabla de extensiones por tenant, no duplicación silenciosa.

## Legal y alta — 2 tablas

| Tabla | Clasificación inicial | Acción |
| --- | --- | --- |
| `legal_document_versions` | Plataforma/revisar | Separar términos de plataforma de condiciones del forwarder |
| `signup_legal_acceptances` | Heredado; Fase 6 local completada | Tenant del perfil; dominio de alta se completa con el resolver de Fase 7 |

## Soporte de plataforma — 6 tablas

| Tabla | Clasificación inicial | Fuente propuesta |
| --- | --- | --- |
| `support_settings` | Plataforma | Configuración singleton de Hernova |
| `support_tickets` | Plataforma + tenant solicitante; Fase 6 local completada | Tenant del creador, sin acceso general al negocio |
| `support_ticket_messages` | Heredado; Fase 6 local completada | Ticket |
| `support_ticket_attachments` | Heredado; Fase 6 local completada | Ticket |
| `support_ticket_events` | Heredado; Fase 6 local completada | Ticket |
| `support_notification_outbox` | Heredado; Fase 6 local completada | Ticket/evento |

## Orden inicial de backfill

```text
tenants
  -> profiles / company_settings
  -> clientes / agents / proveedores / catálogos configurables
  -> quotations
     -> carga / pricing / opciones / historial
     -> shipments
        -> shipping_instructions
           -> bookings
              -> BL / documentos / readiness / VGM
  -> invoices / cuentas por pagar / pagos
  -> Miami
  -> auditoría / notificaciones / soporte
```

Este orden se ajustará después de extraer todas las claves foráneas y detectar
relaciones opcionales o legacy.

## Verificaciones pendientes de Fase 0

- Enumerar vistas y materialized views que proyectan datos de más de una tabla.
- Identificar la definición vigente de cada función reemplazada por migraciones.
- Clasificar funciones `security definer` por nivel de riesgo.
- Enumerar policies efectivas, no solo las definidas en el baseline.
- Revisar índices únicos que hoy son globales.
- Detectar tablas sin RLS y grants efectivos para `anon`/`authenticated`.
- Detectar filas sin padre canónico en una copia local de datos; no consultar ni
  modificar producción durante esta etapa.
- Confirmar si los catálogos candidatos a globales admiten personalización.
