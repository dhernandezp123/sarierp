-- ============================================================
-- FASE 17: Proveedores + Cuentas por Pagar
-- ============================================================

-- Helpers reused by RLS policies. Kept here so this migration is safe to run
-- even in environments that have not executed the earlier hardening scripts.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.is_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(p_roles), false)
$$;

-- Proveedores: agentes, carriers, aduanales, transportes, etc.
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  rtn text,
  email text,
  telefono text,
  contacto text,
  pais text,
  moneda text not null default 'USD',
  terminos_pago integer not null default 30,
  agente_id uuid references public.agents(id) on delete set null,
  is_active boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proveedores
  drop constraint if exists proveedores_tipo_check;

alter table public.proveedores
  add constraint proveedores_tipo_check
  check (tipo in ('Agente', 'Carrier', 'Aduanal', 'Transporte', 'Almacen', 'Courier', 'Otro'));

create index if not exists proveedores_tipo_idx on public.proveedores(tipo);
create index if not exists proveedores_agente_id_idx on public.proveedores(agente_id);

alter table public.proveedores enable row level security;

drop policy if exists "authenticated_full_access" on public.proveedores;
drop policy if exists proveedores_finance_read on public.proveedores;
drop policy if exists proveedores_finance_write on public.proveedores;

create policy proveedores_finance_read on public.proveedores
  for select to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));

create policy proveedores_finance_write on public.proveedores
  for all to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']))
  with check (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));

-- Cuentas por pagar
create table if not exists public.cuentas_pagar (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  descripcion text not null,
  numero_factura_proveedor text,
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'USD',
  tipo_cambio numeric(10,4),
  fecha_factura date,
  fecha_vencimiento date,
  status text not null default 'Pendiente'
    check (status in ('Pendiente', 'Parcialmente Pagada', 'Pagada', 'Vencida', 'Anulada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists cuentas_pagar_proveedor_idx on public.cuentas_pagar(proveedor_id);
create index if not exists cuentas_pagar_quotation_idx on public.cuentas_pagar(quotation_id);
create index if not exists cuentas_pagar_booking_idx on public.cuentas_pagar(booking_id);
create index if not exists cuentas_pagar_status_idx on public.cuentas_pagar(status);
create index if not exists cuentas_pagar_vencimiento_idx on public.cuentas_pagar(fecha_vencimiento);

alter table public.cuentas_pagar enable row level security;

drop policy if exists "authenticated_full_access" on public.cuentas_pagar;
drop policy if exists cuentas_pagar_finance_read on public.cuentas_pagar;
drop policy if exists cuentas_pagar_finance_write on public.cuentas_pagar;

create policy cuentas_pagar_finance_read on public.cuentas_pagar
  for select to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));

create policy cuentas_pagar_finance_write on public.cuentas_pagar
  for all to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']))
  with check (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));

-- Pagos a proveedores
create table if not exists public.pagos_proveedor (
  id uuid primary key default gen_random_uuid(),
  cuenta_pagar_id uuid not null references public.cuentas_pagar(id) on delete cascade,
  monto numeric(14,2) not null check (monto > 0),
  moneda text not null default 'USD',
  fecha_pago date not null default current_date,
  metodo_pago text check (metodo_pago in ('Transferencia', 'Cheque', 'Efectivo', 'Otro')),
  referencia text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists pagos_proveedor_cuenta_idx on public.pagos_proveedor(cuenta_pagar_id);
create index if not exists pagos_proveedor_fecha_idx on public.pagos_proveedor(fecha_pago);

alter table public.pagos_proveedor enable row level security;

drop policy if exists "authenticated_full_access" on public.pagos_proveedor;
drop policy if exists pagos_proveedor_finance_read on public.pagos_proveedor;
drop policy if exists pagos_proveedor_finance_write on public.pagos_proveedor;

create policy pagos_proveedor_finance_read on public.pagos_proveedor
  for select to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));

create policy pagos_proveedor_finance_write on public.pagos_proveedor
  for all to authenticated
  using (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']))
  with check (public.is_role(array['Admin', 'Finanzas', 'Contabilidad']));
