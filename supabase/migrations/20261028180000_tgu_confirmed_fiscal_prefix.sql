-- CAI-CONFIRM-02: latest owner confirmation is SPS 001-001 / TGU 000-000.
-- One-time setup correction. Never rewrite the applied 150000 migration or
-- change a registered CAI, its serials, or an issued fiscal document.
do $$
declare
 office public.billing_offices;
 previous_reason text;
 disabled_ranges jsonb;
begin
 perform set_config('lock_timeout','5s',true);
 lock table public.billing_offices,public.cai_ranges in share row exclusive mode;
 select * into office from public.billing_offices
 where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa'
 for update;
 -- Do not seed real fiscal configuration into an empty installation or Trial.
 if not found or not exists(select 1 from public.cai_ranges c
  where c.tenant_id=office.tenant_id and c.point_of_sale=office.name) then return;end if;
 if office.establishment_code||'-'||office.emission_point_code not in ('000-001','000-000') then
  raise exception 'La oficina TGU cambió; concilia su configuración antes de aplicar CAI-CONFIRM-02';
 end if;
 if exists(select 1 from public.cai_ranges c where c.tenant_id=office.tenant_id and c.point_of_sale=office.name
  and (left(c.rango_desde,7) not in ('000-001','000-000') or left(c.rango_hasta,7) not in ('000-001','000-000'))) then
  raise exception 'Los rangos TGU cambiaron; concilia sus prefijos antes de aplicar CAI-CONFIRM-02';
 end if;
 if exists(select 1 from public.billing_offices o where o.tenant_id=office.tenant_id and o.name='San Pedro Sula'
  and (o.establishment_code||'-'||o.emission_point_code) is distinct from '001-001') then
  raise exception 'El prefijo SPS no coincide con 001-001; requiere revisión';
 end if;
 if exists(select 1 from public.billing_offices o where o.tenant_id=office.tenant_id and o.id<>office.id
  and o.establishment_code='000' and o.emission_point_code='000') then
  raise exception 'El prefijo TGU 000-000 pertenece a otra oficina; requiere revisión';
 end if;
 select coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) into disabled_ranges
 from public.cai_ranges c where c.tenant_id=office.tenant_id and c.point_of_sale=office.name
  and c.is_active and left(c.rango_desde,7)<>'000-000';
 if office.emission_point_code='000' and disabled_ranges='[]'::jsonb then return;end if;
 -- This setup repair is deliberately refused if real documents have appeared.
 if exists(select 1 from public.invoices i where i.tenant_id=office.tenant_id
  and (i.billing_office_id=office.id or i.point_of_sale=office.name) and i.cai is not null)
  or exists(select 1 from public.purchase_documents p where p.tenant_id=office.tenant_id
   and p.office_id=office.id and p.fiscal_snapshot is not null)
  or exists(select 1 from public.withholding_documents w where w.tenant_id=office.tenant_id and w.office_id=office.id) then
  raise exception 'TGU ya tiene documentos fiscales emitidos; concilia el historial antes de corregir su oficina';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.billing_offices'::regclass
  and tgname='zz_fiscal_office_codes' and tgenabled='O' and not tgisinternal) then
  raise exception 'La protección de códigos fiscales cambió; requiere revisión';
 end if;
 previous_reason:=current_setting('app.cai_change_reason',true);
 perform set_config('app.cai_change_reason','CAI-CONFIRM-02: TGU 000-000 confirmado por el propietario; serie incompatible conservada sin cambiar numeración',true);
 -- Existing CAI audit/history triggers remain enabled and record deactivation.
 update public.cai_ranges set is_active=false
 where tenant_id=office.tenant_id and point_of_sale=office.name and is_active
  and left(rango_desde,7)<>'000-000';
 if office.emission_point_code<>'000' then
  -- A table lock excludes concurrent office writes. Bypass only the legacy-code
  -- check for this single setup row, and restore it in the same transaction.
  alter table public.billing_offices disable trigger zz_fiscal_office_codes;
  update public.billing_offices set emission_point_code='000'
  where id=office.id and tenant_id=office.tenant_id;
  alter table public.billing_offices enable trigger zz_fiscal_office_codes;
 end if;
 insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values(office.tenant_id,null,'Facturación','Confirmación fiscal rectificada','billing_office',office.id,
  'TGU 000-000 confirmado por el propietario; rangos incompatibles desactivados con historial',
  jsonb_build_object('source_migration','20261028180000','actor_source','Despliegue autorizado','database_role',current_user,
   'before',jsonb_build_object('establishment_code',office.establishment_code,'emission_point_code',office.emission_point_code),
   'after',jsonb_build_object('establishment_code','000','emission_point_code','000'),'deactivated_range_ids',disabled_ranges));
 perform set_config('app.cai_change_reason',coalesce(previous_reason,''),true);
end $$;
