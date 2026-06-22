-- Fase 1: endurecimiento inicial de roles, perfiles, RLS y grants.

alter type public.user_role add value if not exists 'Finanzas';
alter type public.user_role add value if not exists 'Cliente';

-- SECURITY DEFINER debe resolver objetos únicamente en esquemas confiables.
alter function public.auto_match_pre_alert() set search_path = public;
alter function public.generate_quotation_number() set search_path = public;
alter function public.handle_new_quotation_status_history() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.prevent_role_change_by_non_admin() set search_path = public;

-- Un cliente aprobado no es un usuario interno del ERP.
create or replace function public.is_approved_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role() = any (
      array['Admin', 'Ventas', 'Operaciones', 'Pricing', 'Contabilidad', 'Finanzas']
    ),
    false
  )
$$;

create or replace function public.can_manage_cost_validation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing'])
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
$$;

-- Los usuarios solo pueden editar campos básicos de su propio perfil.
create or replace function public.prevent_role_change_by_non_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Operaciones confiables del backend/SQL no tienen un JWT de usuario.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() and (
    new.rol is distinct from old.rol
    or new.status is distinct from old.status
    or new.is_active is distinct from old.is_active
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.cliente_id is distinct from old.cliente_id
  ) then
    raise exception 'No tienes permiso para modificar campos administrativos del perfil';
  end if;

  return new;
end;
$$;

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own pending profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and rol = 'Ventas'::public.user_role
  and status = 'Pendiente'
  and is_active = true
  and approved_at is null
  and approved_by is null
  and cliente_id is null
);

-- Agentes: Admin/Pricing administran; Operaciones/Ventas consultan.
drop policy if exists "Allow authenticated users to delete agents" on public.agents;
drop policy if exists "Allow authenticated users to insert agents" on public.agents;
drop policy if exists "Allow authenticated users to read agents" on public.agents;
drop policy if exists "Allow authenticated users to update agents" on public.agents;

create policy "agents_select_internal"
on public.agents for select to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
);
create policy "agents_insert_pricing"
on public.agents for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "agents_update_pricing"
on public.agents for update to authenticated
using (public.can_manage_pricing_catalogs())
with check (public.can_manage_pricing_catalogs());
create policy "agents_delete_pricing"
on public.agents for delete to authenticated
using (public.can_manage_pricing_catalogs());

-- Catálogos: lectura interna; escritura de Admin/Pricing.
drop policy if exists "Allow authenticated users to insert countries" on public.countries;
drop policy if exists "Allow authenticated users to read countries" on public.countries;
drop policy if exists "Allow authenticated users to update countries" on public.countries;
create policy "countries_select_internal" on public.countries for select to authenticated
using (public.is_approved_active_user());
create policy "countries_insert_pricing" on public.countries for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "countries_update_pricing" on public.countries for update to authenticated
using (public.can_manage_pricing_catalogs()) with check (public.can_manage_pricing_catalogs());
create policy "countries_delete_pricing" on public.countries for delete to authenticated
using (public.can_manage_pricing_catalogs());

drop policy if exists "Allow authenticated users to insert ports" on public.ports;
drop policy if exists "Allow authenticated users to read ports" on public.ports;
drop policy if exists "Allow authenticated users to update ports" on public.ports;
create policy "ports_select_internal" on public.ports for select to authenticated
using (public.is_approved_active_user());
create policy "ports_insert_pricing" on public.ports for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "ports_update_pricing" on public.ports for update to authenticated
using (public.can_manage_pricing_catalogs()) with check (public.can_manage_pricing_catalogs());
create policy "ports_delete_pricing" on public.ports for delete to authenticated
using (public.can_manage_pricing_catalogs());

drop policy if exists "Allow manage container types" on public.container_types;
drop policy if exists "Allow read container types" on public.container_types;
create policy "container_types_select_internal" on public.container_types for select to authenticated
using (public.is_approved_active_user());
create policy "container_types_insert_pricing" on public.container_types for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "container_types_update_pricing" on public.container_types for update to authenticated
using (public.can_manage_pricing_catalogs()) with check (public.can_manage_pricing_catalogs());
create policy "container_types_delete_pricing" on public.container_types for delete to authenticated
using (public.can_manage_pricing_catalogs());

drop policy if exists "Allow manage package types" on public.package_types;
drop policy if exists "Allow read package types" on public.package_types;
create policy "package_types_select_internal" on public.package_types for select to authenticated
using (public.is_approved_active_user());
create policy "package_types_insert_pricing" on public.package_types for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "package_types_update_pricing" on public.package_types for update to authenticated
using (public.can_manage_pricing_catalogs()) with check (public.can_manage_pricing_catalogs());
create policy "package_types_delete_pricing" on public.package_types for delete to authenticated
using (public.can_manage_pricing_catalogs());

drop policy if exists "Authenticated users can access locations catalog" on public.locations_catalog;
create policy "locations_catalog_select_internal" on public.locations_catalog for select to authenticated
using (public.is_approved_active_user());
create policy "locations_catalog_insert_pricing" on public.locations_catalog for insert to authenticated
with check (public.can_manage_pricing_catalogs());
create policy "locations_catalog_update_pricing" on public.locations_catalog for update to authenticated
using (public.can_manage_pricing_catalogs()) with check (public.can_manage_pricing_catalogs());
create policy "locations_catalog_delete_pricing" on public.locations_catalog for delete to authenticated
using (public.can_manage_pricing_catalogs());

-- Validación de costos: elimina la política legacy que anulaba las específicas.
drop policy if exists "Authenticated users can access cost validations" on public.cost_validations;

-- Historial de clientes: Admin/Ventas, append-only.
drop policy if exists "Authenticated users can access cliente history" on public.cliente_history;
create policy "cliente_history_select_sales" on public.cliente_history for select to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Ventas'])
);
create policy "cliente_history_insert_sales" on public.cliente_history for insert to authenticated
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Ventas'])
  and changed_by = auth.uid()
);

-- Bitácoras BL: Admin/Operaciones consultan y agregan; no se editan ni eliminan.
drop policy if exists "authenticated_full_access" on public.bl_amendments;
create policy "bl_amendments_select_operations" on public.bl_amendments for select to authenticated
using (
  exists (
    select 1 from public.bills_of_lading bl
    where bl.id = bl_amendments.bl_id
      and public.can_access_bill_of_lading(bl.id)
  )
);
create policy "bl_amendments_insert_operations" on public.bl_amendments for insert to authenticated
with check (
  public.can_manage_operations()
  and created_by = auth.uid()
  and exists (select 1 from public.bills_of_lading bl where bl.id = bl_amendments.bl_id)
);

drop policy if exists "authenticated_full_access" on public.bl_draft_sends;
create policy "bl_draft_sends_select_operations" on public.bl_draft_sends for select to authenticated
using (
  exists (
    select 1 from public.bills_of_lading bl
    where bl.id = bl_draft_sends.bl_id
      and public.can_access_bill_of_lading(bl.id)
  )
);
create policy "bl_draft_sends_insert_operations" on public.bl_draft_sends for insert to authenticated
with check (
  public.can_manage_operations()
  and sent_by = auth.uid()
  and exists (select 1 from public.bills_of_lading bl where bl.id = bl_draft_sends.bl_id)
);

-- Garantías navieras: desbloquea el flujo solo para Operaciones/Admin.
create policy "garantias_navieras_select_operations"
on public.garantias_navieras for select to authenticated
using (public.can_manage_operations());
create policy "garantias_navieras_insert_operations"
on public.garantias_navieras for insert to authenticated
with check (public.can_manage_operations());
create policy "garantias_navieras_update_operations"
on public.garantias_navieras for update to authenticated
using (public.can_manage_operations()) with check (public.can_manage_operations());
create policy "garantias_navieras_delete_admin"
on public.garantias_navieras for delete to authenticated
using (public.is_admin());

-- Configuración corporativa visible solo dentro del ERP.
drop policy if exists "authenticated_read" on public.company_settings;
create policy "company_settings_select_internal"
on public.company_settings for select to authenticated
using (public.is_approved_active_user());

-- Una sola política explícita para formularios públicos/autenticados de leads.
drop policy if exists "Allow insert from anon" on public.leads;
drop policy if exists "leads_public_insert" on public.leads;
create policy "leads_insert_public"
on public.leads for insert to anon, authenticated
with check (true);

-- Reducir superficie anónima. La landing solo necesita crear leads.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant insert on table public.leads to anon;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
