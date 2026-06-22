-- Fase 2: validar datos auditados y cerrar carreras de unicidad.

alter table public.miami_packages
  validate constraint miami_packages_tipo_carga_check;

alter table public.miami_packages
  validate constraint miami_packages_cargo_status_check;

alter table public.miami_packages
  validate constraint miami_packages_nonnegative_measurements_check;

alter table public.miami_manifests
  validate constraint miami_manifests_total_packages_nonnegative_check;

-- Una cotización solo puede tener una tarifa activa seleccionada.
create unique index if not exists agent_quotes_one_selected_per_quotation_idx
  on public.agent_quotes (quotation_id)
  where is_selected is true
    and deleted_at is null;

-- El flujo actual crea y consume una única SI activa por cotización.
create unique index if not exists shipping_instructions_one_active_per_quotation_idx
  on public.shipping_instructions (quotation_id)
  where quotation_id is not null
    and deleted_at is null;

-- Evita registrar dos veces la misma factura AP para el mismo proveedor.
-- Las anuladas no reservan el número y NC/ND mantienen su propio tratamiento.
create unique index if not exists cuentas_pagar_supplier_invoice_unique_idx
  on public.cuentas_pagar (
    proveedor_id,
    lower(btrim(numero_factura_proveedor))
  )
  where tipo = 'AP'
    and status <> 'Anulada'
    and numero_factura_proveedor is not null
    and btrim(numero_factura_proveedor) <> '';
