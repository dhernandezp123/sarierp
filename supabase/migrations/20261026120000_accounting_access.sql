-- ACC-01: Contabilidad consulta clientes/cotizaciones del tenant y edita
-- perfiles y configuración corporativa. No amplía escritura de pricing.

create or replace function public.can_select_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_cliente_id is null then false
    when not public.is_approved_active_user() then false
    when public.current_tenant_id() is null then false
    when public.is_role(array['Admin', 'Ventas', 'Pricing', 'Contabilidad']) then exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
    )
    when public.is_role(array['Operaciones']) then exists (
      select 1 from public.clientes c
      join public.quotations q on q.cliente_id = c.id and q.tenant_id = c.tenant_id
      join public.shipping_instructions si on si.quotation_id = q.id
      where c.id = p_cliente_id and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null and q.deleted_at is null
    )
    else false
  end
$$;

create or replace function public.can_update_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas', 'Contabilidad'])
    and exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.tenant_id = public.current_tenant_id()
        and c.deleted_at is null
    )
$$;

alter policy clientes_update_policy on public.clientes
  using (tenant_id = public.current_tenant_id() and public.can_update_cliente(id))
  with check (
    tenant_id = public.current_tenant_id() and public.is_approved_active_user()
    and (public.is_admin() or (public.is_role(array['Ventas', 'Contabilidad']) and deleted_at is null))
  );

alter policy cliente_history_select_sales on public.cliente_history
  using (
    tenant_id = public.current_tenant_id() and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas', 'Contabilidad'])
  );
alter policy cliente_history_insert_sales on public.cliente_history
  with check (
    tenant_id = public.current_tenant_id() and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas', 'Contabilidad'])
    and changed_by = auth.uid()
  );

create or replace function public.can_select_quotation(p_quotation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_quotation_id is null then false
    when not public.is_approved_active_user() then false
    when public.current_tenant_id() is null then false
    when public.is_role(array['Admin', 'Pricing', 'Ventas', 'Contabilidad']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
    )
    when public.is_role(array['Operaciones']) then exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id and q.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
        and exists (select 1 from public.shipping_instructions si where si.quotation_id = q.id)
    )
    else false
  end
$$;

create or replace function public.can_select_quotation_row(
  p_quotation_id uuid, p_status text, p_deleted_at timestamptz
)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_quotation_id is null or p_deleted_at is not null then false
    when not public.is_approved_active_user() then false
    when not exists (
      select 1 from public.quotations q
      where q.id = p_quotation_id and q.tenant_id = public.current_tenant_id()
    ) then false
    when public.is_role(array['Admin', 'Pricing', 'Ventas', 'Contabilidad']) then true
    when public.is_role(array['Operaciones']) then exists (
      select 1 from public.shipping_instructions si where si.quotation_id = p_quotation_id
    )
    else false
  end
$$;

alter policy company_settings_insert_tenant_admin on public.company_settings
  with check (
    public.is_approved_active_user() and public.is_role(array['Admin', 'Contabilidad'])
    and tenant_id = public.current_tenant_id()
  );
alter policy company_settings_update_tenant_admin on public.company_settings
  using (
    public.is_approved_active_user() and public.is_role(array['Admin', 'Contabilidad'])
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_approved_active_user() and public.is_role(array['Admin', 'Contabilidad'])
    and tenant_id = public.current_tenant_id()
  );

-- El editor de empresa guarda también Bunker. Permitir exclusivamente esa
-- regla a Contabilidad; el resto del catálogo conserva sus permisos vigentes.
create policy surcharge_rules_accounting_company_insert on public.surcharge_rules
  for insert to authenticated
  with check (
    public.is_approved_active_user() and public.is_role(array['Contabilidad'])
    and tenant_id = public.current_tenant_id() and code = 'bunker_emergency_surcharge'
  );
create policy surcharge_rules_accounting_company_update on public.surcharge_rules
  for update to authenticated
  using (
    public.is_approved_active_user() and public.is_role(array['Contabilidad'])
    and tenant_id = public.current_tenant_id() and code = 'bunker_emergency_surcharge'
  )
  with check (
    public.is_approved_active_user() and public.is_role(array['Contabilidad'])
    and tenant_id = public.current_tenant_id() and code = 'bunker_emergency_surcharge'
  );

-- CAI ya usa can_manage_finance() para INSERT/UPDATE y activación atómica;
-- Scanner/Factura manual ya autoriza Contabilidad en servidor y RLS.
