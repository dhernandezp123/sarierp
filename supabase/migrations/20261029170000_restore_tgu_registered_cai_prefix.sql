-- CAI-CONFIRM-03: owner explicitly restores TGU 000-001 on 29/10/2026.
-- Keep the applied 180000 migration and all CAI history unchanged.
-- Only repair the office binding; the accounting master chooses reactivation.
do $$
declare office public.billing_offices;
begin
 perform set_config('lock_timeout','5s',true);
 lock table public.billing_offices,public.cai_ranges,public.invoices,
  public.purchase_documents,public.withholding_documents in share row exclusive mode;
 select * into office from public.billing_offices
 where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa'
 for update;
 -- Empty installations / Trial receive no real office or fiscal data.
 if not found or not exists(select 1 from public.cai_ranges c
  where c.tenant_id=office.tenant_id and c.point_of_sale=office.name) then return;end if;
 if office.establishment_code='000' and office.emission_point_code='001' then return;end if;
 if (office.establishment_code,office.emission_point_code) is distinct from ('000','000') then
  raise exception 'La configuración TGU cambió; revisa antes de restaurar 000-001';
 end if;
 if exists(select 1 from public.cai_ranges c where c.tenant_id=office.tenant_id and c.point_of_sale=office.name
  and (left(c.rango_desde,7) is distinct from '000-001' or left(c.rango_hasta,7) is distinct from '000-001')) then
  raise exception 'Los rangos TGU no coinciden con 000-001; requiere revisión';
 end if;
 if exists(select 1 from public.invoices i where i.tenant_id=office.tenant_id
  and (i.billing_office_id=office.id or i.point_of_sale=office.name) and i.cai is not null)
  or exists(select 1 from public.purchase_documents p where p.tenant_id=office.tenant_id
   and p.office_id=office.id and p.fiscal_snapshot is not null)
  or exists(select 1 from public.withholding_documents w where w.tenant_id=office.tenant_id and w.office_id=office.id) then
  raise exception 'TGU tiene documentos fiscales emitidos; revisa antes de restaurar su oficina';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.billing_offices'::regclass
  and tgname='zz_fiscal_office_codes' and tgenabled='O' and not tgisinternal) then
  raise exception 'La protección de códigos fiscales cambió; requiere revisión';
 end if;
 -- Normal trigger checks stay enabled: every preserved CAI must match 000-001.
 update public.billing_offices set emission_point_code='001'
 where id=office.id and tenant_id=office.tenant_id;
 insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values(office.tenant_id,null,'Facturación','Restauración de códigos SAR','billing_office',office.id,
  'TGU 000-001 restaurado por confirmación del propietario; el máster decide la reactivación de sus CAI',
  jsonb_build_object('source_migration','20261029170000','actor_source','Mantenimiento autorizado por el propietario',
   'database_role',current_user,'before',jsonb_build_object('establishment_code',office.establishment_code,'emission_point_code',office.emission_point_code),
   'after',jsonb_build_object('establishment_code','000','emission_point_code','001'),
   'automatic_reactivation',false,'cai_rows_unchanged',true));
end $$;
