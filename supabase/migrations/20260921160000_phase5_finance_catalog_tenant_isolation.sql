-- Fase 5 SaaS: ownership e integridad de tenant para finanzas, proveedores,
-- catalogos configurables y contadores. Los documentos historicos conservan
-- sus importes, snapshots fiscales y numeros emitidos.

do $phase5_add_tenant_columns$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoices', 'invoice_items', 'invoice_payments',
    'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
    'pagos_proveedor', 'proveedores', 'provider_invoice_items', 'cai_ranges',
    'document_sequences', 'hbl_number_counters', 'client_rate_catalog',
    'carrier_catalog', 'locations_catalog', 'service_products',
    'surcharge_rules', 'tax_rates', 'email_templates', 'miami_carriers'
  ] loop
    execute format(
      'alter table public.%I add column tenant_id uuid references public.tenants(id) on delete restrict',
      v_table
    );
  end loop;
end
$phase5_add_tenant_columns$;

-- Raices financieras y configuracion historica pertenecen a Sari cuando no
-- existe una referencia canonica que determine el tenant.
update public.proveedores row_data
set tenant_id = coalesce(
  (select agent.tenant_id from public.agents agent where agent.id = row_data.agente_id),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.invoices row_data
set tenant_id = coalesce(
  (select quotation.tenant_id from public.quotations quotation where quotation.id = row_data.quotation_id),
  (select client.tenant_id from public.clientes client where client.id = row_data.cliente_id),
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.cost_validations row_data
set tenant_id = coalesce(
  (select quotation.tenant_id from public.quotations quotation where quotation.id = row_data.quotation_id),
  (select quote.tenant_id from public.agent_quotes quote where quote.id = row_data.agent_quote_id),
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.validated_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.cuentas_pagar row_data
set tenant_id = coalesce(
  (select provider.tenant_id from public.proveedores provider where provider.id = row_data.proveedor_id),
  (select quotation.tenant_id from public.quotations quotation where quotation.id = row_data.quotation_id),
  (select booking.tenant_id from public.bookings booking where booking.id = row_data.booking_id),
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.cai_ranges row_data
set tenant_id = coalesce(
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.provider_invoice_items row_data
set tenant_id = coalesce(
  (select quotation.tenant_id from public.quotations quotation where quotation.id = row_data.quotation_id),
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.tax_rates row_data
set tenant_id = coalesce(
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.deleted_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.email_templates row_data
set tenant_id = coalesce(
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.updated_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.miami_carriers row_data
set tenant_id = coalesce(
  (select profile.tenant_id from public.profiles profile where profile.id = row_data.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.client_rate_catalog set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.carrier_catalog set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.locations_catalog set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.service_products set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.surcharge_rules set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.document_sequences set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;
update public.hbl_number_counters set tenant_id = '00000000-0000-4000-8000-000000000001'::uuid;

-- Hijos financieros heredan el tenant del documento canonico.
update public.invoice_items child
set tenant_id = parent.tenant_id
from public.invoices parent
where parent.id = child.invoice_id;

update public.invoice_payments child
set tenant_id = parent.tenant_id
from public.invoices parent
where parent.id = child.invoice_id;

update public.invoice_payment_splits child
set tenant_id = parent.tenant_id
from public.invoice_payments parent
where parent.id = child.payment_id;

update public.pagos_proveedor child
set tenant_id = parent.tenant_id
from public.cuentas_pagar parent
where parent.id = child.cuenta_pagar_id;

-- Semillas para reemplazar las secuencias globales sin reutilizar numeros ya
-- consumidos. Sari conserva como piso tanto los datos como el estado legacy.
insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'CLIENT', greatest(
  coalesce(max(substring(cliente.codigo_cliente from '^CLI-([0-9]+)$')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.clientes_codigo_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.clientes cliente
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'QUOTATION', greatest(
  coalesce(max(substring(quotation.quotation_number from '^[^-]+-[0-9]{4}-([0-9]+)-')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.quotation_number_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.quotations quotation
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'ROUTING', greatest(
  coalesce(max(substring(instruction.routing_number from '^RT([0-9]+)$')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.routing_number_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.shipping_instructions instruction
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'MIAMI_MANIFEST', greatest(
  coalesce(max(substring(manifest.manifest_number from '-([0-9]+)$')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.miami_manifest_number_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.miami_manifests manifest
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'MIAMI_SHIPMENT', greatest(
  coalesce(max(substring(shipment.shipment_number from '-([0-9]+)$')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.miami_shipment_number_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.miami_shipments shipment
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.document_sequences (sequence_key, next_value, tenant_id)
select 'MIAMI_WAREHOUSE', greatest(
  coalesce(max(substring(package.warehouse_number from '^SPS-([0-9]+)$')::bigint) + 1, 1),
  (select case when is_called then last_value + 1 else last_value end from public.miami_wh_seq)
), '00000000-0000-4000-8000-000000000001'::uuid
from public.miami_packages package
on conflict (sequence_key) do update
set next_value = greatest(public.document_sequences.next_value, excluded.next_value);

insert into public.hbl_number_counters (number_date, last_value, tenant_id)
select
  parsed.number_date,
  max(parsed.number_value),
  '00000000-0000-4000-8000-000000000001'::uuid
from (
  select
    to_date(substring(bl.bl_number from '^SARI-HBL-([0-9]{8})-'), 'YYYYMMDD') as number_date,
    substring(bl.bl_number from '-([0-9]+)$')::integer as number_value
  from public.bills_of_lading bl
  where bl.bl_type = 'HBL'
    and bl.bl_number ~ '^SARI-HBL-[0-9]{8}-[0-9]+$'
) parsed
group by parsed.number_date
on conflict (number_date) do update
set last_value = greatest(public.hbl_number_counters.last_value, excluded.last_value),
    updated_at = clock_timestamp();

do $phase5_preflight$
declare
  v_record record;
  v_mismatch boolean;
begin
  if exists (
    select 1 from (
      select tenant_id from public.invoices
      union all select tenant_id from public.invoice_items
      union all select tenant_id from public.invoice_payments
      union all select tenant_id from public.invoice_payment_splits
      union all select tenant_id from public.cost_validations
      union all select tenant_id from public.cuentas_pagar
      union all select tenant_id from public.pagos_proveedor
      union all select tenant_id from public.proveedores
      union all select tenant_id from public.provider_invoice_items
      union all select tenant_id from public.cai_ranges
      union all select tenant_id from public.document_sequences
      union all select tenant_id from public.hbl_number_counters
      union all select tenant_id from public.client_rate_catalog
      union all select tenant_id from public.carrier_catalog
      union all select tenant_id from public.locations_catalog
      union all select tenant_id from public.service_products
      union all select tenant_id from public.surcharge_rules
      union all select tenant_id from public.tax_rates
      union all select tenant_id from public.email_templates
      union all select tenant_id from public.miami_carriers
    ) rows_without_owner
    where tenant_id is null
  ) then
    raise exception 'El backfill financiero dejo filas sin tenant';
  end if;

  for v_record in
    select * from (values
      ('invoices', 'quotations', 'quotation_id'),
      ('invoices', 'clientes', 'cliente_id'),
      ('invoices', 'invoices', 'parent_invoice_id'),
      ('invoice_items', 'invoices', 'invoice_id'),
      ('invoice_items', 'pricing_items', 'source_pricing_item_id'),
      ('invoice_payments', 'invoices', 'invoice_id'),
      ('invoice_payment_splits', 'invoice_payments', 'payment_id'),
      ('cost_validations', 'quotations', 'quotation_id'),
      ('cost_validations', 'agent_quotes', 'agent_quote_id'),
      ('proveedores', 'agents', 'agente_id'),
      ('cuentas_pagar', 'proveedores', 'proveedor_id'),
      ('cuentas_pagar', 'quotations', 'quotation_id'),
      ('cuentas_pagar', 'bookings', 'booking_id'),
      ('cuentas_pagar', 'cuentas_pagar', 'parent_ap_id'),
      ('pagos_proveedor', 'cuentas_pagar', 'cuenta_pagar_id'),
      ('provider_invoice_items', 'quotations', 'quotation_id'),
      ('provider_invoice_items', 'pricing_items', 'pricing_item_id'),
      ('provider_invoice_items', 'tax_rates', 'tax_rate_id')
    ) as mappings(child_table, parent_table, parent_column)
  loop
    execute format(
      'select exists ('
      'select 1 from public.%I child '
      'join public.%I parent on parent.id = child.%I '
      'where child.tenant_id is distinct from parent.tenant_id'
      ')',
      v_record.child_table,
      v_record.parent_table,
      v_record.parent_column
    ) into v_mismatch;

    if v_mismatch then
      raise exception 'Referencia cross-tenant en %.%',
        v_record.child_table,
        v_record.parent_column;
    end if;
  end loop;
end
$phase5_preflight$;

do $phase5_require_tenant$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoices', 'invoice_items', 'invoice_payments',
    'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
    'pagos_proveedor', 'proveedores', 'provider_invoice_items', 'cai_ranges',
    'document_sequences', 'hbl_number_counters', 'client_rate_catalog',
    'carrier_catalog', 'locations_catalog', 'service_products',
    'surcharge_rules', 'tax_rates', 'email_templates', 'miami_carriers'
  ] loop
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'create index %I on public.%I (tenant_id)',
      'idx_' || v_table || '_tenant_id',
      v_table
    );
  end loop;
end
$phase5_require_tenant$;

-- Claves de ownership para referencias compuestas.
alter table public.invoices add constraint invoices_tenant_id_id_key unique (tenant_id, id);
alter table public.invoice_payments add constraint invoice_payments_tenant_id_id_key unique (tenant_id, id);
alter table public.proveedores add constraint proveedores_tenant_id_id_key unique (tenant_id, id);
alter table public.cuentas_pagar add constraint cuentas_pagar_tenant_id_id_key unique (tenant_id, id);
alter table public.tax_rates add constraint tax_rates_tenant_id_id_key unique (tenant_id, id);

alter table public.invoices add constraint invoices_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete set null (quotation_id);
alter table public.invoices add constraint invoices_tenant_client_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete set null (cliente_id);
alter table public.invoices add constraint invoices_tenant_parent_fkey
  foreign key (tenant_id, parent_invoice_id) references public.invoices (tenant_id, id) on delete restrict;

alter table public.invoice_items add constraint invoice_items_tenant_invoice_fkey
  foreign key (tenant_id, invoice_id) references public.invoices (tenant_id, id) on delete cascade;
alter table public.invoice_items add constraint invoice_items_tenant_pricing_fkey
  foreign key (tenant_id, source_pricing_item_id) references public.pricing_items (tenant_id, id) on delete set null (source_pricing_item_id);
alter table public.invoice_payments add constraint invoice_payments_tenant_invoice_fkey
  foreign key (tenant_id, invoice_id) references public.invoices (tenant_id, id) on delete cascade;
alter table public.invoice_payment_splits add constraint payment_splits_tenant_payment_fkey
  foreign key (tenant_id, payment_id) references public.invoice_payments (tenant_id, id) on delete cascade;

alter table public.cost_validations add constraint cost_validations_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.cost_validations add constraint cost_validations_tenant_agent_quote_fkey
  foreign key (tenant_id, agent_quote_id) references public.agent_quotes (tenant_id, id) on delete cascade;
alter table public.proveedores add constraint proveedores_tenant_agent_fkey
  foreign key (tenant_id, agente_id) references public.agents (tenant_id, id) on delete set null (agente_id);

alter table public.cuentas_pagar add constraint cuentas_pagar_tenant_provider_fkey
  foreign key (tenant_id, proveedor_id) references public.proveedores (tenant_id, id) on delete restrict;
alter table public.cuentas_pagar add constraint cuentas_pagar_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete set null (quotation_id);
alter table public.cuentas_pagar add constraint cuentas_pagar_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete set null (booking_id);
alter table public.cuentas_pagar add constraint cuentas_pagar_tenant_parent_fkey
  foreign key (tenant_id, parent_ap_id) references public.cuentas_pagar (tenant_id, id) on delete restrict;
alter table public.pagos_proveedor add constraint pagos_proveedor_tenant_account_fkey
  foreign key (tenant_id, cuenta_pagar_id) references public.cuentas_pagar (tenant_id, id) on delete cascade;

alter table public.provider_invoice_items add constraint provider_items_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete cascade;
alter table public.provider_invoice_items add constraint provider_items_tenant_pricing_fkey
  foreign key (tenant_id, pricing_item_id) references public.pricing_items (tenant_id, id) on delete set null (pricing_item_id);
alter table public.provider_invoice_items add constraint provider_items_tenant_tax_fkey
  foreign key (tenant_id, tax_rate_id) references public.tax_rates (tenant_id, id) on delete set null (tax_rate_id);

-- Referencias de actores internos tambien quedan ligadas a su empresa.
do $phase5_actor_constraints$
declare
  v_record record;
  v_mismatch boolean;
begin
  for v_record in
    select * from (values
      ('invoices', 'created_by'), ('invoices', 'updated_by'),
      ('invoice_payments', 'created_by'), ('invoice_payments', 'reversed_by'),
      ('cost_validations', 'validated_by'), ('cuentas_pagar', 'created_by'),
      ('pagos_proveedor', 'created_by'),
      ('provider_invoice_items', 'created_by'),
      ('provider_invoice_items', 'deleted_by'),
      ('cai_ranges', 'created_by'), ('tax_rates', 'deleted_by'),
      ('email_templates', 'updated_by'), ('miami_carriers', 'created_by')
    ) as mappings(table_name, profile_column)
  loop
    execute format(
      'select exists ('
      'select 1 from public.%I row_data '
      'join public.profiles profile on profile.id = row_data.%I '
      'where row_data.tenant_id is distinct from profile.tenant_id'
      ')',
      v_record.table_name,
      v_record.profile_column
    ) into v_mismatch;

    if v_mismatch then
      raise exception 'Referencia de perfil cross-tenant en %.%',
        v_record.table_name,
        v_record.profile_column;
    end if;

    execute format(
      'alter table public.%I add constraint %I '
      'foreign key (tenant_id, %I) references public.profiles (tenant_id, id)',
      v_record.table_name,
      left('p5_' || v_record.table_name || '_' || v_record.profile_column || '_fkey', 63),
      v_record.profile_column
    );
  end loop;
end
$phase5_actor_constraints$;

-- Unicidad de documentos y configuracion acotada al tenant.
alter table public.invoices drop constraint invoices_invoice_number_key;
create unique index invoices_tenant_invoice_number_key
  on public.invoices (tenant_id, invoice_number)
  where invoice_number is not null;

drop index public.cai_ranges_one_active_per_document_type_idx;
create unique index cai_ranges_one_active_per_tenant_document_type_idx
  on public.cai_ranges (tenant_id, document_type)
  where is_active is true;

drop index public.cuentas_pagar_generation_key_unique_idx;
create unique index cuentas_pagar_tenant_generation_key_unique_idx
  on public.cuentas_pagar (tenant_id, generation_source, generation_key)
  where generation_source is not null and generation_key is not null;

drop index public.cuentas_pagar_supplier_invoice_unique_idx;
create unique index cuentas_pagar_tenant_supplier_invoice_unique_idx
  on public.cuentas_pagar (
    tenant_id, proveedor_id, lower(btrim(numero_factura_proveedor))
  )
  where tipo = 'AP'
    and status <> 'Anulada'
    and numero_factura_proveedor is not null
    and btrim(numero_factura_proveedor) <> '';

alter table public.document_sequences drop constraint document_sequences_pkey;
alter table public.document_sequences add constraint document_sequences_pkey
  primary key (tenant_id, sequence_key);

alter table public.hbl_number_counters drop constraint hbl_number_counters_pkey;
alter table public.hbl_number_counters add constraint hbl_number_counters_pkey
  primary key (tenant_id, number_date);

alter table public.client_rate_catalog drop constraint client_rate_catalog_pkey;
alter table public.client_rate_catalog add constraint client_rate_catalog_pkey
  primary key (tenant_id, code);

alter table public.carrier_catalog drop constraint carrier_catalog_pkey;
alter table public.carrier_catalog add constraint carrier_catalog_pkey
  primary key (tenant_id, code);

alter table public.service_products drop constraint service_products_pkey;
alter table public.service_products add constraint service_products_pkey
  primary key (tenant_id, value);

alter table public.locations_catalog drop constraint locations_catalog_name_country_type_key;
alter table public.locations_catalog add constraint locations_catalog_tenant_name_key
  unique (tenant_id, name, country, type);

alter table public.surcharge_rules drop constraint surcharge_rules_code_key;
alter table public.surcharge_rules add constraint surcharge_rules_tenant_code_key
  unique (tenant_id, code);
alter table public.surcharge_rules add constraint surcharge_rules_tenant_product_fkey
  foreign key (tenant_id, service_product)
  references public.service_products (tenant_id, value) on delete restrict;

alter table public.email_templates drop constraint email_templates_template_key_key;
alter table public.email_templates add constraint email_templates_tenant_key
  unique (tenant_id, template_key);

drop index public.miami_carriers_name_unique_idx;
create unique index miami_carriers_tenant_name_unique_idx
  on public.miami_carriers (tenant_id, lower(name));

-- Guards de ownership. Los hijos derivan tenant del padre requerido; las
-- raices lo derivan de la sesion y rechazan cambios o borrados cross-tenant.
do $phase5_direct_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoices', 'cost_validations', 'proveedores', 'cai_ranges',
    'document_sequences', 'hbl_number_counters', 'client_rate_catalog',
    'carrier_catalog', 'locations_catalog', 'service_products',
    'surcharge_rules', 'tax_rates', 'email_templates', 'miami_carriers'
  ] loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_current_tenant_row()',
      v_table
    );
  end loop;
end
$phase5_direct_guards$;

do $phase5_parent_guards$
declare
  v_record record;
begin
  for v_record in
    select * from (values
      ('invoice_items', 'invoices', 'invoice_id'),
      ('invoice_payments', 'invoices', 'invoice_id'),
      ('invoice_payment_splits', 'invoice_payments', 'payment_id'),
      ('cuentas_pagar', 'proveedores', 'proveedor_id'),
      ('pagos_proveedor', 'cuentas_pagar', 'cuenta_pagar_id'),
      ('provider_invoice_items', 'quotations', 'quotation_id')
    ) as mappings(child_table, parent_table, parent_column)
  loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_record.child_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_parent_tenant(%L, %L)',
      v_record.child_table,
      v_record.parent_table,
      v_record.parent_column
    );
  end loop;
end
$phase5_parent_guards$;

-- El guard restrictivo se combina con las policies funcionales existentes.
do $phase5_rls_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoices', 'invoice_items', 'invoice_payments',
    'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
    'pagos_proveedor', 'proveedores', 'provider_invoice_items', 'cai_ranges',
    'document_sequences', 'hbl_number_counters', 'client_rate_catalog',
    'carrier_catalog', 'locations_catalog', 'service_products',
    'surcharge_rules', 'tax_rates', 'email_templates', 'miami_carriers'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists tenant_isolation_guard on public.%I', v_table);
    execute format(
      'create policy tenant_isolation_guard on public.%I as restrictive '
      'for all to authenticated using (tenant_id = public.current_tenant_id()) '
      'with check (tenant_id = public.current_tenant_id())',
      v_table
    );
  end loop;
end
$phase5_rls_guards$;

-- Numerador interno atomico. Solo funciones/triggers confiables pueden llamar
-- esta variante con tenant explicito.
create or replace function public.allocate_tenant_document_sequence(
  p_tenant_id uuid,
  p_sequence_key text,
  p_initial_value bigint default 1
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_tenant uuid := public.current_tenant_id();
  v_value bigint;
begin
  if p_tenant_id is null or nullif(btrim(p_sequence_key), '') is null then
    raise exception 'Tenant y clave de secuencia son obligatorios';
  end if;

  if auth.uid() is not null and (
    v_current_tenant is null or p_tenant_id is distinct from v_current_tenant
  ) then
    raise exception 'No se puede consumir una secuencia de otra empresa'
      using errcode = '42501';
  end if;

  insert into public.document_sequences as sequence_row (
    tenant_id, sequence_key, next_value
  ) values (
    p_tenant_id, btrim(p_sequence_key), greatest(coalesce(p_initial_value, 1), 1) + 1
  )
  on conflict (tenant_id, sequence_key) do update
  set next_value = sequence_row.next_value + 1
  returning next_value - 1 into v_value;

  return v_value;
end;
$$;

revoke all on function public.allocate_tenant_document_sequence(uuid, text, bigint)
  from public, anon, authenticated;

-- Los formatos visibles se conservan; solo cambia el contador subyacente.
create or replace function public.generate_cliente_codigo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, public.current_tenant_id());
  v_sequence bigint;
begin
  if new.codigo_cliente is null then
    if v_tenant_id is null then
      raise exception 'No se pudo resolver la empresa para numerar el cliente';
    end if;
    v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'CLIENT', 1);
    new.codigo_cliente := 'CLI-' || lpad(v_sequence::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace function public.generate_quotation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, public.current_tenant_id());
  v_seller_initials text;
  v_sequence bigint;
begin
  select upper(
    left(coalesce(profile.nombre, 'X'), 1)
    || left(coalesce(profile.apellido, 'X'), 1)
  ) into v_seller_initials
  from public.profiles profile
  where profile.id = new.created_by
    and profile.tenant_id = v_tenant_id;

  v_seller_initials := coalesce(v_seller_initials, 'XX');

  if new.quotation_number is null then
    if v_tenant_id is null then
      raise exception 'No se pudo resolver la empresa para numerar la cotizacion';
    end if;
    v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'QUOTATION', 1);
    new.quotation_number := 'SARIHN-'
      || to_char(now(), 'YYMM') || '-'
      || lpad(v_sequence::text, 4, '0') || '-'
      || v_seller_initials;
  end if;
  return new;
end;
$$;

create or replace function public.generate_routing_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, public.current_tenant_id());
  v_sequence bigint;
begin
  if nullif(btrim(coalesce(new.routing_number, '')), '') is null then
    if v_tenant_id is null then
      raise exception 'No se pudo resolver la empresa para numerar el routing';
    end if;
    v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'ROUTING', 1);
    new.routing_number := 'RT' || lpad(v_sequence::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.next_manifest_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_sequence bigint;
begin
  if auth.uid() is null or v_tenant_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para generar manifiestos' using errcode = '42501';
  end if;
  v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'MIAMI_MANIFEST', 1);
  return 'MAN-' || to_char(current_date, 'YYYYMMDD') || '-'
    || lpad(v_sequence::text, 6, '0');
end;
$$;

create or replace function public.next_miami_shipment_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_sequence bigint;
begin
  if auth.uid() is null or v_tenant_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para generar embarques Miami' using errcode = '42501';
  end if;
  v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'MIAMI_SHIPMENT', 1);
  return 'MIA-' || to_char(current_date, 'YYYYMMDD') || '-'
    || lpad(v_sequence::text, 6, '0');
end;
$$;

create or replace function public.next_warehouse_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_sequence bigint;
begin
  if auth.uid() is null or v_tenant_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para generar numeros de bodega'
      using errcode = '42501';
  end if;
  v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'MIAMI_WAREHOUSE', 1);
  return 'SPS-' || lpad(v_sequence::text, 5, '0');
end;
$$;

create or replace function public.allocate_internal_hbl_number(p_number_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_date date := coalesce(
    p_number_date,
    timezone('America/Tegucigalpa', clock_timestamp())::date
  );
  v_prefix text := 'SARI-HBL-' || to_char(v_date, 'YYYYMMDD') || '-';
  v_existing_max integer;
  v_next integer;
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'No autorizado para generar HBL' using errcode = '42501';
  end if;

  select coalesce(max(
    case
      when substring(bl.bl_number from char_length(v_prefix) + 1) ~ '^[0-9]+$'
        then substring(bl.bl_number from char_length(v_prefix) + 1)::integer
      else null
    end
  ), 0)
  into v_existing_max
  from public.bills_of_lading bl
  where bl.tenant_id = v_tenant_id
    and bl.bl_type = 'HBL'
    and bl.bl_number like v_prefix || '%';

  insert into public.hbl_number_counters as counter (
    tenant_id, number_date, last_value, updated_at
  ) values (
    v_tenant_id, v_date, v_existing_max + 1, clock_timestamp()
  )
  on conflict (tenant_id, number_date) do update
  set last_value = greatest(counter.last_value, excluded.last_value - 1) + 1,
      updated_at = clock_timestamp()
  returning last_value into v_next;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.generate_cliente_codigo() from public, anon, authenticated;
revoke all on function public.generate_quotation_number() from public, anon, authenticated;
revoke all on function public.generate_routing_number() from public, anon, authenticated;
revoke all on function public.allocate_internal_hbl_number(date) from public, anon, authenticated;

notify pgrst, 'reload schema';
