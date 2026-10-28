-- Fase 4 SaaS: ownership e integridad de tenant para operaciones y documentos.
-- Las filas historicas pertenecen a Sari salvo que un padre canonico o perfil
-- ya determine otro tenant. Ningun tenant recibido desde el cliente es confiable.

do $phase4_add_tenant_columns$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipments', 'operational_events', 'shipping_instructions',
    'shipping_instruction_events', 'bookings', 'booking_containers',
    'booking_cutoffs', 'booking_documents', 'booking_readiness_evaluations',
    'booking_readiness_exceptions', 'booking_readiness_requirements',
    'booking_schedule_revisions', 'bills_of_lading', 'bl_amendments',
    'bl_containers', 'bl_draft_sends', 'bl_validation_exceptions',
    'container_vgm_records', 'garantias_navieras', 'miami_packages',
    'miami_package_events', 'miami_package_documents', 'miami_pre_alerts',
    'miami_incidencias', 'miami_manifests', 'miami_shipments',
    'miami_shipment_packages'
  ] loop
    execute format(
      'alter table public.%I add column tenant_id uuid references public.tenants(id) on delete restrict',
      v_table
    );
  end loop;
end
$phase4_add_tenant_columns$;

-- El esquema operativo contiene historiales append-only y guardas que bloquean
-- cualquier UPDATE directo. El backfill de ownership es una migracion unica,
-- transaccional y se valida antes de hacer tenant_id obligatorio; por eso se
-- suspenden solo los triggers de usuario de estas tablas durante el backfill.
do $phase4_disable_backfill_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipments', 'operational_events', 'shipping_instructions',
    'shipping_instruction_events', 'bookings', 'booking_containers',
    'booking_cutoffs', 'booking_documents', 'booking_readiness_evaluations',
    'booking_readiness_exceptions', 'booking_readiness_requirements',
    'booking_schedule_revisions', 'bills_of_lading', 'bl_amendments',
    'bl_containers', 'bl_draft_sends', 'bl_validation_exceptions',
    'container_vgm_records', 'garantias_navieras', 'miami_packages',
    'miami_package_events', 'miami_package_documents', 'miami_pre_alerts',
    'miami_incidencias', 'miami_manifests', 'miami_shipments',
    'miami_shipment_packages'
  ] loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;
end
$phase4_disable_backfill_triggers$;

-- Raices operativas y referencias circulares se resuelven primero.
update public.shipping_instructions si
set tenant_id = coalesce(
  (select q.tenant_id from public.quotations q where q.id = si.quotation_id),
  (select c.tenant_id from public.clientes c where c.id = si.client_id),
  (select qo.tenant_id from public.quotation_options qo where qo.id = si.quotation_option_id),
  (select p.tenant_id from public.profiles p where p.id = si.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.shipments shipment
set tenant_id = coalesce(
  (select q.tenant_id from public.quotations q where q.id = shipment.quotation_id),
  (select c.tenant_id from public.clientes c where c.id = shipment.client_id),
  (select si.tenant_id from public.shipping_instructions si where si.id = shipment.shipping_instruction_id),
  (select p.tenant_id from public.profiles p where p.id = shipment.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.bookings child
set tenant_id = parent.tenant_id
from public.shipping_instructions parent
where parent.id = child.shipping_instruction_id;

update public.garantias_navieras guarantee
set tenant_id = coalesce(
  (select b.tenant_id from public.bookings b where b.id = guarantee.booking_id),
  (select p.tenant_id from public.profiles p where p.id = guarantee.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

-- Hijos del expediente operativo.
update public.shipping_instruction_events child
set tenant_id = parent.tenant_id
from public.shipping_instructions parent
where parent.id = child.shipping_instruction_id;

update public.operational_events child
set tenant_id = parent.tenant_id
from public.shipping_instructions parent
where parent.id = child.shipping_instruction_id;

update public.booking_containers child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_cutoffs child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_documents child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_readiness_evaluations child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_readiness_exceptions child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_readiness_requirements child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.booking_schedule_revisions child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.bills_of_lading child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

update public.bl_amendments child
set tenant_id = parent.tenant_id
from public.bills_of_lading parent
where parent.id = child.bl_id;

update public.bl_containers child
set tenant_id = parent.tenant_id
from public.bills_of_lading parent
where parent.id = child.bl_id;

update public.bl_draft_sends child
set tenant_id = parent.tenant_id
from public.bills_of_lading parent
where parent.id = child.bl_id;

update public.bl_validation_exceptions child
set tenant_id = parent.tenant_id
from public.bills_of_lading parent
where parent.id = child.bl_id;

update public.container_vgm_records child
set tenant_id = parent.tenant_id
from public.bookings parent
where parent.id = child.booking_id;

-- Miami: manifiestos y embarques son raices; los demas registros heredan.
update public.miami_manifests manifest
set tenant_id = coalesce(
  (select p.tenant_id from public.profiles p where p.id = manifest.received_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.miami_shipments shipment
set tenant_id = coalesce(
  (select p.tenant_id from public.profiles p where p.id = shipment.created_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.miami_packages package
set tenant_id = coalesce(
  (select c.tenant_id from public.clientes c where c.id = package.cliente_id),
  (select m.tenant_id from public.miami_manifests m where m.id = package.manifest_id),
  (select p.tenant_id from public.profiles p where p.id = package.received_by),
  '00000000-0000-4000-8000-000000000001'::uuid
);

update public.miami_package_events child
set tenant_id = parent.tenant_id
from public.miami_packages parent
where parent.id = child.package_id;

update public.miami_package_documents child
set tenant_id = parent.tenant_id
from public.miami_packages parent
where parent.id = child.package_id;

update public.miami_pre_alerts child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

update public.miami_incidencias child
set tenant_id = parent.tenant_id
from public.clientes parent
where parent.id = child.cliente_id;

update public.miami_shipment_packages child
set tenant_id = parent.tenant_id
from public.miami_shipments parent
where parent.id = child.shipment_id;

do $phase4_enable_backfill_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipments', 'operational_events', 'shipping_instructions',
    'shipping_instruction_events', 'bookings', 'booking_containers',
    'booking_cutoffs', 'booking_documents', 'booking_readiness_evaluations',
    'booking_readiness_exceptions', 'booking_readiness_requirements',
    'booking_schedule_revisions', 'bills_of_lading', 'bl_amendments',
    'bl_containers', 'bl_draft_sends', 'bl_validation_exceptions',
    'container_vgm_records', 'garantias_navieras', 'miami_packages',
    'miami_package_events', 'miami_package_documents', 'miami_pre_alerts',
    'miami_incidencias', 'miami_manifests', 'miami_shipments',
    'miami_shipment_packages'
  ] loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;
end
$phase4_enable_backfill_triggers$;

do $phase4_preflight$
declare
  v_record record;
  v_mismatch boolean;
begin
  if exists (
    select 1 from (
      select tenant_id from public.shipments
      union all select tenant_id from public.operational_events
      union all select tenant_id from public.shipping_instructions
      union all select tenant_id from public.shipping_instruction_events
      union all select tenant_id from public.bookings
      union all select tenant_id from public.booking_containers
      union all select tenant_id from public.booking_cutoffs
      union all select tenant_id from public.booking_documents
      union all select tenant_id from public.booking_readiness_evaluations
      union all select tenant_id from public.booking_readiness_exceptions
      union all select tenant_id from public.booking_readiness_requirements
      union all select tenant_id from public.booking_schedule_revisions
      union all select tenant_id from public.bills_of_lading
      union all select tenant_id from public.bl_amendments
      union all select tenant_id from public.bl_containers
      union all select tenant_id from public.bl_draft_sends
      union all select tenant_id from public.bl_validation_exceptions
      union all select tenant_id from public.container_vgm_records
      union all select tenant_id from public.garantias_navieras
      union all select tenant_id from public.miami_packages
      union all select tenant_id from public.miami_package_events
      union all select tenant_id from public.miami_package_documents
      union all select tenant_id from public.miami_pre_alerts
      union all select tenant_id from public.miami_incidencias
      union all select tenant_id from public.miami_manifests
      union all select tenant_id from public.miami_shipments
      union all select tenant_id from public.miami_shipment_packages
    ) rows_without_owner
    where tenant_id is null
  ) then
    raise exception 'El backfill operativo dejo filas sin tenant';
  end if;

  for v_record in
    select * from (values
      ('shipping_instructions', 'quotations', 'quotation_id'),
      ('shipping_instructions', 'clientes', 'client_id'),
      ('shipping_instructions', 'quotation_options', 'quotation_option_id'),
      ('shipments', 'quotations', 'quotation_id'),
      ('shipments', 'clientes', 'client_id'),
      ('shipments', 'shipping_instructions', 'shipping_instruction_id'),
      ('bookings', 'shipping_instructions', 'shipping_instruction_id'),
      ('bookings', 'shipments', 'shipment_id'),
      ('operational_events', 'shipping_instructions', 'shipping_instruction_id'),
      ('operational_events', 'bookings', 'booking_id'),
      ('operational_events', 'booking_containers', 'booking_container_id'),
      ('operational_events', 'shipments', 'shipment_id'),
      ('booking_cutoffs', 'shipments', 'shipment_id'),
      ('booking_cutoffs', 'booking_containers', 'booking_container_id'),
      ('booking_cutoffs', 'booking_schedule_revisions', 'booking_schedule_revision_id'),
      ('booking_readiness_exceptions', 'booking_containers', 'booking_container_id'),
      ('booking_readiness_exceptions', 'booking_readiness_requirements', 'booking_readiness_requirement_id'),
      ('booking_readiness_exceptions', 'booking_cutoffs', 'booking_cutoff_id'),
      ('bills_of_lading', 'shipping_instructions', 'shipping_instruction_id'),
      ('bills_of_lading', 'bills_of_lading', 'parent_bl_id'),
      ('container_vgm_records', 'booking_containers', 'booking_container_id'),
      ('container_vgm_records', 'booking_documents', 'document_id'),
      ('container_vgm_records', 'container_vgm_records', 'supersedes_vgm_id'),
      ('garantias_navieras', 'bookings', 'booking_id'),
      ('miami_packages', 'clientes', 'cliente_id'),
      ('miami_packages', 'miami_manifests', 'manifest_id'),
      ('miami_package_events', 'miami_shipments', 'shipment_id'),
      ('miami_pre_alerts', 'miami_packages', 'matched_package_id'),
      ('miami_incidencias', 'miami_packages', 'package_id'),
      ('miami_shipment_packages', 'miami_packages', 'package_id')
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
$phase4_preflight$;

do $phase4_require_tenant$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipments', 'operational_events', 'shipping_instructions',
    'shipping_instruction_events', 'bookings', 'booking_containers',
    'booking_cutoffs', 'booking_documents', 'booking_readiness_evaluations',
    'booking_readiness_exceptions', 'booking_readiness_requirements',
    'booking_schedule_revisions', 'bills_of_lading', 'bl_amendments',
    'bl_containers', 'bl_draft_sends', 'bl_validation_exceptions',
    'container_vgm_records', 'garantias_navieras', 'miami_packages',
    'miami_package_events', 'miami_package_documents', 'miami_pre_alerts',
    'miami_incidencias', 'miami_manifests', 'miami_shipments',
    'miami_shipment_packages'
  ] loop
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'create index %I on public.%I (tenant_id)',
      'idx_' || v_table || '_tenant_id',
      v_table
    );
  end loop;
end
$phase4_require_tenant$;

-- Claves de ownership para relaciones compuestas.
alter table public.shipping_instructions add constraint shipping_instructions_tenant_id_id_key unique (tenant_id, id);
alter table public.shipments add constraint shipments_tenant_id_id_key unique (tenant_id, id);
alter table public.bookings add constraint bookings_tenant_id_id_key unique (tenant_id, id);
alter table public.booking_containers add constraint booking_containers_tenant_id_id_key unique (tenant_id, id);
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_id_id_key unique (tenant_id, id);
alter table public.booking_documents add constraint booking_documents_tenant_id_id_key unique (tenant_id, id);
alter table public.booking_readiness_requirements add constraint booking_readiness_requirements_tenant_id_id_key unique (tenant_id, id);
alter table public.booking_schedule_revisions add constraint booking_schedule_revisions_tenant_id_id_key unique (tenant_id, id);
alter table public.bills_of_lading add constraint bills_of_lading_tenant_id_id_key unique (tenant_id, id);
alter table public.container_vgm_records add constraint container_vgm_records_tenant_id_id_key unique (tenant_id, id);
alter table public.miami_manifests add constraint miami_manifests_tenant_id_id_key unique (tenant_id, id);
alter table public.miami_packages add constraint miami_packages_tenant_id_id_key unique (tenant_id, id);
alter table public.miami_shipments add constraint miami_shipments_tenant_id_id_key unique (tenant_id, id);

-- Relaciones principales y opcionales del flujo operativo.
alter table public.shipping_instructions add constraint si_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete restrict;
alter table public.shipping_instructions add constraint si_tenant_client_fkey
  foreign key (tenant_id, client_id) references public.clientes (tenant_id, id) on delete restrict;
alter table public.shipping_instructions add constraint si_tenant_option_fkey
  foreign key (tenant_id, quotation_option_id) references public.quotation_options (tenant_id, id) on delete restrict;

alter table public.shipments add constraint shipments_tenant_quotation_fkey
  foreign key (tenant_id, quotation_id) references public.quotations (tenant_id, id) on delete set null (quotation_id);
alter table public.shipments add constraint shipments_tenant_client_fkey
  foreign key (tenant_id, client_id) references public.clientes (tenant_id, id) on delete restrict;
alter table public.shipments add constraint shipments_tenant_si_fkey
  foreign key (tenant_id, shipping_instruction_id) references public.shipping_instructions (tenant_id, id) on delete restrict;

alter table public.bookings add constraint bookings_tenant_si_fkey
  foreign key (tenant_id, shipping_instruction_id) references public.shipping_instructions (tenant_id, id) on delete cascade;
alter table public.bookings add constraint bookings_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.bookings add constraint bookings_tenant_supersedes_fkey
  foreign key (tenant_id, supersedes_booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.bookings add constraint bookings_tenant_replaced_by_fkey
  foreign key (tenant_id, replaced_by_booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.shipping_instructions add constraint si_tenant_primary_booking_fkey
  foreign key (tenant_id, primary_booking_id) references public.bookings (tenant_id, id) on delete set null (primary_booking_id);

alter table public.shipping_instruction_events add constraint si_events_tenant_si_fkey
  foreign key (tenant_id, shipping_instruction_id) references public.shipping_instructions (tenant_id, id) on delete cascade;
alter table public.operational_events add constraint operational_events_tenant_si_fkey
  foreign key (tenant_id, shipping_instruction_id) references public.shipping_instructions (tenant_id, id) on delete restrict;
alter table public.operational_events add constraint operational_events_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete set null (booking_id);
alter table public.operational_events add constraint operational_events_tenant_container_fkey
  foreign key (tenant_id, booking_container_id) references public.booking_containers (tenant_id, id) on delete set null (booking_container_id);
alter table public.operational_events add constraint operational_events_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;

alter table public.booking_containers add constraint booking_containers_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete cascade;
alter table public.booking_documents add constraint booking_documents_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete cascade;
alter table public.booking_schedule_revisions add constraint schedule_revisions_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.booking_schedule_revisions add constraint schedule_revisions_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;

alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_container_fkey
  foreign key (tenant_id, booking_container_id) references public.booking_containers (tenant_id, id) on delete restrict;
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_revision_fkey
  foreign key (tenant_id, booking_schedule_revision_id) references public.booking_schedule_revisions (tenant_id, id) on delete restrict;
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_supersedes_fkey
  foreign key (tenant_id, supersedes_cutoff_id) references public.booking_cutoffs (tenant_id, id) on delete restrict;
alter table public.booking_cutoffs add constraint booking_cutoffs_tenant_superseded_by_fkey
  foreign key (tenant_id, superseded_by_cutoff_id) references public.booking_cutoffs (tenant_id, id) on delete restrict;

alter table public.booking_readiness_evaluations add constraint readiness_evaluations_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.booking_readiness_evaluations add constraint readiness_evaluations_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.booking_readiness_requirements add constraint readiness_requirements_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.booking_readiness_requirements add constraint readiness_requirements_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.booking_readiness_requirements add constraint readiness_requirements_tenant_container_fkey
  foreign key (tenant_id, booking_container_id) references public.booking_containers (tenant_id, id) on delete restrict;
alter table public.booking_readiness_exceptions add constraint readiness_exceptions_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.booking_readiness_exceptions add constraint readiness_exceptions_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.booking_readiness_exceptions add constraint readiness_exceptions_tenant_container_fkey
  foreign key (tenant_id, booking_container_id) references public.booking_containers (tenant_id, id) on delete restrict;
alter table public.booking_readiness_exceptions add constraint readiness_exceptions_tenant_requirement_fkey
  foreign key (tenant_id, booking_readiness_requirement_id) references public.booking_readiness_requirements (tenant_id, id) on delete restrict;
alter table public.booking_readiness_exceptions add constraint readiness_exceptions_tenant_cutoff_fkey
  foreign key (tenant_id, booking_cutoff_id) references public.booking_cutoffs (tenant_id, id) on delete restrict;

alter table public.bills_of_lading add constraint bl_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete cascade;
alter table public.bills_of_lading add constraint bl_tenant_si_fkey
  foreign key (tenant_id, shipping_instruction_id) references public.shipping_instructions (tenant_id, id);
alter table public.bills_of_lading add constraint bl_tenant_parent_fkey
  foreign key (tenant_id, parent_bl_id) references public.bills_of_lading (tenant_id, id);
alter table public.bl_amendments add constraint bl_amendments_tenant_bl_fkey
  foreign key (tenant_id, bl_id) references public.bills_of_lading (tenant_id, id) on delete cascade;
alter table public.bl_containers add constraint bl_containers_tenant_bl_fkey
  foreign key (tenant_id, bl_id) references public.bills_of_lading (tenant_id, id) on delete cascade;
alter table public.bl_draft_sends add constraint bl_draft_sends_tenant_bl_fkey
  foreign key (tenant_id, bl_id) references public.bills_of_lading (tenant_id, id) on delete cascade;
alter table public.bl_validation_exceptions add constraint bl_exceptions_tenant_bl_fkey
  foreign key (tenant_id, bl_id) references public.bills_of_lading (tenant_id, id) on delete cascade;

alter table public.container_vgm_records add constraint vgm_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete restrict;
alter table public.container_vgm_records add constraint vgm_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.shipments (tenant_id, id) on delete restrict;
alter table public.container_vgm_records add constraint vgm_tenant_container_fkey
  foreign key (tenant_id, booking_container_id) references public.booking_containers (tenant_id, id) on delete restrict;
alter table public.container_vgm_records add constraint vgm_tenant_document_fkey
  foreign key (tenant_id, document_id) references public.booking_documents (tenant_id, id) on delete restrict;
alter table public.container_vgm_records add constraint vgm_tenant_supersedes_fkey
  foreign key (tenant_id, supersedes_vgm_id) references public.container_vgm_records (tenant_id, id) on delete restrict;
alter table public.garantias_navieras add constraint guarantees_tenant_booking_fkey
  foreign key (tenant_id, booking_id) references public.bookings (tenant_id, id) on delete set null (booking_id);

-- Relaciones Miami.
alter table public.miami_packages add constraint miami_packages_tenant_client_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete set null (cliente_id);
alter table public.miami_packages add constraint miami_packages_tenant_manifest_fkey
  foreign key (tenant_id, manifest_id) references public.miami_manifests (tenant_id, id) on delete set null (manifest_id);
alter table public.miami_package_events add constraint miami_events_tenant_package_fkey
  foreign key (tenant_id, package_id) references public.miami_packages (tenant_id, id) on delete cascade;
alter table public.miami_package_events add constraint miami_events_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.miami_shipments (tenant_id, id) on delete set null (shipment_id);
alter table public.miami_package_documents add constraint miami_docs_tenant_package_fkey
  foreign key (tenant_id, package_id) references public.miami_packages (tenant_id, id) on delete cascade;
alter table public.miami_pre_alerts add constraint miami_prealerts_tenant_client_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.miami_pre_alerts add constraint miami_prealerts_tenant_package_fkey
  foreign key (tenant_id, matched_package_id) references public.miami_packages (tenant_id, id) on delete set null (matched_package_id);
alter table public.miami_incidencias add constraint miami_incidencias_tenant_client_fkey
  foreign key (tenant_id, cliente_id) references public.clientes (tenant_id, id) on delete cascade;
alter table public.miami_incidencias add constraint miami_incidencias_tenant_package_fkey
  foreign key (tenant_id, package_id) references public.miami_packages (tenant_id, id) on delete set null (package_id);
alter table public.miami_shipment_packages add constraint miami_shipment_packages_tenant_shipment_fkey
  foreign key (tenant_id, shipment_id) references public.miami_shipments (tenant_id, id) on delete cascade;
alter table public.miami_shipment_packages add constraint miami_shipment_packages_tenant_package_fkey
  foreign key (tenant_id, package_id) references public.miami_packages (tenant_id, id) on delete restrict;

-- Los actores tambien deben pertenecer a la empresa del expediente.
do $phase4_actor_constraints$
declare
  v_record record;
  v_mismatch boolean;
begin
  for v_record in
    select * from (values
      ('shipping_instructions', 'vendor_id'),
      ('shipping_instructions', 'operations_assigned_to'),
      ('shipping_instructions', 'validated_by'),
      ('shipping_instructions', 'created_by'),
      ('shipping_instructions', 'deleted_by'),
      ('shipping_instructions', 'operations_accepted_by'),
      ('shipments', 'assigned_to'), ('shipments', 'created_by'),
      ('shipping_instruction_events', 'created_by'),
      ('bookings', 'created_by'), ('bookings', 'cancelled_by'),
      ('operational_events', 'created_by'),
      ('booking_cutoffs', 'completed_by'), ('booking_cutoffs', 'waived_by'),
      ('booking_cutoffs', 'cancelled_by'), ('booking_cutoffs', 'created_by'),
      ('booking_documents', 'uploaded_by'),
      ('booking_readiness_evaluations', 'evaluated_by'),
      ('booking_readiness_exceptions', 'approved_by'),
      ('booking_readiness_exceptions', 'revoked_by'),
      ('booking_readiness_requirements', 'completed_by'),
      ('booking_readiness_requirements', 'waived_by'),
      ('booking_schedule_revisions', 'created_by'),
      ('bills_of_lading', 'created_by'), ('bills_of_lading', 'issued_by'),
      ('bl_amendments', 'created_by'), ('bl_draft_sends', 'sent_by'),
      ('bl_validation_exceptions', 'created_by'),
      ('bl_validation_exceptions', 'closed_by'),
      ('container_vgm_records', 'verified_by_user_id'),
      ('container_vgm_records', 'submitted_by'),
      ('container_vgm_records', 'accepted_by'),
      ('container_vgm_records', 'rejected_by'),
      ('container_vgm_records', 'created_by'),
      ('garantias_navieras', 'created_by'),
      ('miami_manifests', 'received_by'),
      ('miami_packages', 'received_by'), ('miami_packages', 'assigned_by'),
      ('miami_packages', 'location_updated_by'),
      ('miami_package_events', 'created_by'),
      ('miami_package_documents', 'uploaded_by'),
      ('miami_package_documents', 'reviewed_by'),
      ('miami_incidencias', 'resolved_by'),
      ('miami_shipments', 'created_by'),
      ('miami_shipment_packages', 'added_by')
    ) as mappings(table_name, profile_column)
  loop
    execute format(
      'select exists ('
      'select 1 from public.%I row '
      'join public.profiles profile on profile.id = row.%I '
      'where row.tenant_id is distinct from profile.tenant_id'
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
      left('p4_' || v_record.table_name || '_' || v_record.profile_column || '_fkey', 63),
      v_record.profile_column
    );
  end loop;
end
$phase4_actor_constraints$;

-- Numeros operativos iguales pueden existir entre tenants. Los generadores y
-- contadores independientes se migraran junto con numeraciones en Fase 5.
drop index public.uq_shipments_shipment_number;
create unique index shipments_tenant_shipment_number_key
  on public.shipments (tenant_id, shipment_number);

alter table public.shipping_instructions drop constraint shipping_instructions_routing_number_key;
alter table public.shipping_instructions add constraint si_tenant_routing_number_key
  unique (tenant_id, routing_number);

drop index public.bills_of_lading_hbl_number_unique_idx;
create unique index bills_of_lading_tenant_hbl_number_unique_idx
  on public.bills_of_lading (tenant_id, upper(btrim(bl_number)))
  where bl_type = 'HBL' and nullif(btrim(bl_number), '') is not null;

alter table public.miami_manifests drop constraint miami_manifests_manifest_number_key;
alter table public.miami_manifests add constraint miami_manifests_tenant_number_key
  unique (tenant_id, manifest_number);

alter table public.miami_packages drop constraint miami_packages_warehouse_number_key;
create unique index miami_packages_tenant_warehouse_number_key
  on public.miami_packages (tenant_id, warehouse_number)
  where warehouse_number is not null;

alter table public.miami_shipments drop constraint miami_shipments_shipment_number_key;
alter table public.miami_shipments add constraint miami_shipments_tenant_number_key
  unique (tenant_id, shipment_number);

-- Los guards cubren INSERT, UPDATE y DELETE incluso dentro de RPC SECURITY DEFINER.
do $phase4_direct_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipping_instructions', 'shipments', 'garantias_navieras',
    'miami_manifests', 'miami_packages', 'miami_shipments'
  ] loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_current_tenant_row()',
      v_table
    );
  end loop;
end
$phase4_direct_guards$;

do $phase4_parent_guards$
declare
  v_record record;
begin
  for v_record in
    select * from (values
      ('shipping_instruction_events', 'shipping_instructions', 'shipping_instruction_id'),
      ('bookings', 'shipping_instructions', 'shipping_instruction_id'),
      ('operational_events', 'shipping_instructions', 'shipping_instruction_id'),
      ('booking_containers', 'bookings', 'booking_id'),
      ('booking_cutoffs', 'bookings', 'booking_id'),
      ('booking_documents', 'bookings', 'booking_id'),
      ('booking_readiness_evaluations', 'bookings', 'booking_id'),
      ('booking_readiness_exceptions', 'bookings', 'booking_id'),
      ('booking_readiness_requirements', 'bookings', 'booking_id'),
      ('booking_schedule_revisions', 'bookings', 'booking_id'),
      ('bills_of_lading', 'bookings', 'booking_id'),
      ('bl_amendments', 'bills_of_lading', 'bl_id'),
      ('bl_containers', 'bills_of_lading', 'bl_id'),
      ('bl_draft_sends', 'bills_of_lading', 'bl_id'),
      ('bl_validation_exceptions', 'bills_of_lading', 'bl_id'),
      ('container_vgm_records', 'bookings', 'booking_id'),
      ('miami_package_events', 'miami_packages', 'package_id'),
      ('miami_package_documents', 'miami_packages', 'package_id'),
      ('miami_pre_alerts', 'clientes', 'cliente_id'),
      ('miami_incidencias', 'clientes', 'cliente_id'),
      ('miami_shipment_packages', 'miami_shipments', 'shipment_id')
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
$phase4_parent_guards$;

-- Un guard restrictivo se combina con las policies funcionales existentes y
-- conserva sus roles, estados, demo guards y permisos de portal.
do $phase4_rls_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shipments', 'operational_events', 'shipping_instructions',
    'shipping_instruction_events', 'bookings', 'booking_containers',
    'booking_cutoffs', 'booking_documents', 'booking_readiness_evaluations',
    'booking_readiness_exceptions', 'booking_readiness_requirements',
    'booking_schedule_revisions', 'bills_of_lading', 'bl_amendments',
    'bl_containers', 'bl_draft_sends', 'bl_validation_exceptions',
    'container_vgm_records', 'garantias_navieras', 'miami_packages',
    'miami_package_events', 'miami_package_documents', 'miami_pre_alerts',
    'miami_incidencias', 'miami_manifests', 'miami_shipments',
    'miami_shipment_packages'
  ] loop
    execute format('drop policy if exists tenant_isolation_guard on public.%I', v_table);
    execute format(
      'create policy tenant_isolation_guard on public.%I as restrictive '
      'for all to authenticated '
      'using (tenant_id = public.current_tenant_id()) '
      'with check (tenant_id = public.current_tenant_id())',
      v_table
    );
  end loop;
end
$phase4_rls_guards$;

comment on column public.shipments.tenant_id is
  'Empresa propietaria del expediente operativo.';
comment on column public.shipping_instructions.tenant_id is
  'Empresa propietaria de la Shipping Instruction y sus handoffs.';
comment on column public.bookings.tenant_id is
  'Empresa propietaria del booking y sus documentos operativos.';
comment on column public.miami_packages.tenant_id is
  'Empresa propietaria del paquete Miami.';
