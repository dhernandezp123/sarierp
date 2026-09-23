-- Reconcile legacy dual-use accounts before profile/tenant composite keys are
-- installed. A platform-only administrator cannot also own Sari business
-- history; operational accounts keep that history and become Sari-scoped.

do $phase3_reclassify_operational_platform_admins$
declare
  v_sari_tenant_id uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_updated integer := 0;
begin
  if not exists (
    select 1
    from public.tenants tenant
    where tenant.id = v_sari_tenant_id
      and tenant.slug = 'sari'
  ) then
    raise exception 'No existe el tenant canonico de Sari para reconciliar perfiles';
  end if;

  if exists (
    select 1
    from (
      select tenant_id, vendedor_asignado as profile_id from public.clientes
      union all select tenant_id, deleted_by from public.clientes
      union all select tenant_id, created_by from public.client_notes
      union all select tenant_id, changed_by from public.cliente_history
      union all select tenant_id, created_by from public.sales_activities
      union all select tenant_id, created_by from public.quotations
      union all select tenant_id, pricing_approved_by from public.quotations
      union all select tenant_id, assigned_to from public.quotations
      union all select tenant_id, deleted_by from public.quotations
      union all select tenant_id, changed_by from public.quotation_status_history
      union all select tenant_id, changed_by from public.quotation_change_logs
      union all select tenant_id, created_by from public.pricing_items
      union all select tenant_id, deleted_by from public.pricing_items
      union all select tenant_id, deleted_by from public.agents
      union all select tenant_id, deleted_by from public.agent_quotes
      union all select tenant_id, created_by from public.quotation_options
      union all select tenant_id, published_by from public.quotation_options
      union all select tenant_id, accepted_by from public.quotation_options
    ) refs
    join public.profiles profile on profile.id = refs.profile_id
    where profile.is_platform_admin is true
      and profile.tenant_id is null
      and refs.tenant_id is distinct from v_sari_tenant_id
  ) then
    raise exception 'Un administrador de plataforma conserva referencias fuera de Sari';
  end if;

  with referenced_profiles as (
    select vendedor_asignado as profile_id from public.clientes
    union select deleted_by from public.clientes
    union select created_by from public.client_notes
    union select changed_by from public.cliente_history
    union select created_by from public.sales_activities
    union select created_by from public.quotations
    union select pricing_approved_by from public.quotations
    union select assigned_to from public.quotations
    union select deleted_by from public.quotations
    union select changed_by from public.quotation_status_history
    union select changed_by from public.quotation_change_logs
    union select created_by from public.pricing_items
    union select deleted_by from public.pricing_items
    union select deleted_by from public.agents
    union select deleted_by from public.agent_quotes
    union select created_by from public.quotation_options
    union select published_by from public.quotation_options
    union select accepted_by from public.quotation_options
  )
  update public.profiles profile
  set tenant_id = v_sari_tenant_id,
      is_platform_admin = false
  where profile.is_platform_admin is true
    and profile.tenant_id is null
    and exists (
      select 1
      from referenced_profiles refs
      where refs.profile_id = profile.id
    );

  get diagnostics v_updated = row_count;
  raise notice 'Perfiles operativos reclasificados como Sari: %', v_updated;
end
$phase3_reclassify_operational_platform_admins$;
