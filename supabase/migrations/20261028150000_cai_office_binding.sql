-- CAI-OFFICE-01: each tenant / office / document retains its own CAI counter.
-- The owner confirmed the two Sari prefixes on 28/10/2026. Complete empty
-- office codes and the verified TGU 000-000 typo only when registered ranges
-- agree with the confirmed prefix. Record the configuration repair.
-- Never change a CAI, authorized range, next serial or issued document here.
do $$declare expected record;office public.billing_offices;confirmed_tgu_typo boolean;begin
 for expected in select * from (values('San Pedro Sula','001','001'),('Tegucigalpa','000','001')) v(name,establishment,point) loop
  select * into office from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name=expected.name for update;
  if not found then continue;end if;
  if not exists(select 1 from public.cai_ranges where tenant_id=office.tenant_id and point_of_sale=office.name) then continue;end if;
  if exists(select 1 from public.cai_ranges where tenant_id=office.tenant_id and point_of_sale=office.name and
    (left(rango_desde,7)<>expected.establishment||'-'||expected.point or left(rango_hasta,7)<>expected.establishment||'-'||expected.point)) then
   raise exception 'La configuración CAI de % cambió; revisa los prefijos confirmados antes de completar la oficina',office.name;
  end if;
  confirmed_tgu_typo:=office.name='Tegucigalpa' and office.establishment_code='000' and office.emission_point_code='000';
  if not confirmed_tgu_typo and (office.establishment_code not in ('',expected.establishment) or office.emission_point_code not in ('',expected.point)) then raise exception 'Los códigos SAR de % cambiaron; requiere revisión',office.name;end if;
  if office.establishment_code='' or office.emission_point_code='' or confirmed_tgu_typo then
   if exists(select 1 from public.billing_offices o where o.tenant_id=office.tenant_id and o.id<>office.id and o.establishment_code=expected.establishment and o.emission_point_code=expected.point) then raise exception 'El prefijo confirmado de % pertenece a otra oficina',office.name;end if;
   if exists(select 1 from public.invoices i where i.tenant_id=office.tenant_id and (i.billing_office_id=office.id or i.point_of_sale=office.name) and i.cai is not null and left(i.invoice_number,7) is distinct from expected.establishment||'-'||expected.point)
    or exists(select 1 from public.purchase_documents p where p.tenant_id=office.tenant_id and p.office_id=office.id and p.fiscal_snapshot is not null and left(p.document_number,7) is distinct from expected.establishment||'-'||expected.point)
    or exists(select 1 from public.withholding_documents w where w.tenant_id=office.tenant_id and w.office_id=office.id and left(w.document_number,7) is distinct from expected.establishment||'-'||expected.point) then raise exception 'El prefijo confirmado de % no coincide con documentos emitidos; requiere revisión',office.name;end if;
   update public.billing_offices set establishment_code=expected.establishment,emission_point_code=expected.point where id=office.id and tenant_id=office.tenant_id;
   insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
    values(office.tenant_id,null,'Facturación','Códigos SAR confirmados','billing_office',office.id,'Configuración corregida según prefijos confirmados por el propietario',
     jsonb_build_object('source_migration','20261028150000','actor_source','Despliegue autorizado','database_role',current_user,'before',jsonb_build_object('establishment_code',office.establishment_code,'emission_point_code',office.emission_point_code),'after',jsonb_build_object('establishment_code',expected.establishment,'emission_point_code',expected.point)));
  end if;
 end loop;
end $$;

create function public.guard_cai_office_binding() returns trigger language plpgsql security definer set search_path=public as $$
declare office public.billing_offices;prefix text;begin
 -- zz_cai_point_of_sale and tenant_guard have already normalized this row.
 select * into office from public.billing_offices where tenant_id=new.tenant_id and name=new.point_of_sale for share;
 if not found then raise exception 'Configura la oficina de facturación antes de registrar su rango CAI';end if;
 if office.establishment_code='' or office.emission_point_code='' then raise exception 'Completa los códigos SAR de la oficina antes de registrar o activar un rango CAI';end if;
 if exists(select 1 from public.billing_offices o where o.tenant_id=office.tenant_id and o.id<>office.id and o.establishment_code=office.establishment_code and o.emission_point_code=office.emission_point_code) then raise exception 'El prefijo SAR ya pertenece a otra oficina; revisa la configuración antes de utilizar este CAI';end if;
 prefix:=office.establishment_code||'-'||office.emission_point_code;
 if left(new.rango_desde,7) is distinct from prefix or left(new.rango_hasta,7) is distinct from prefix then
  raise exception 'El prefijo SAR del rango CAI no corresponde a la oficina seleccionada (%)',office.name;
 end if;
 if new.is_active and not office.is_active then raise exception 'Activa la oficina antes de activar su rango CAI';end if;
 return new;
end $$;
create trigger zzz_cai_office_binding before insert or update on public.cai_ranges for each row execute function public.guard_cai_office_binding();

create function public.guard_fiscal_office_codes() returns trigger language plpgsql security definer set search_path=public as $$
declare prefix text;begin
 perform pg_advisory_xact_lock(hashtextextended('fiscal-office-codes:'||new.tenant_id,0));
 prefix:=new.establishment_code||'-'||new.emission_point_code;
 if new.establishment_code<>'' and new.emission_point_code<>'' and exists(select 1 from public.billing_offices o
  where o.tenant_id=new.tenant_id and o.id<>new.id and o.establishment_code=new.establishment_code and o.emission_point_code=new.emission_point_code) then
  raise exception 'El establecimiento y punto de emisión SAR ya pertenece a otra oficina de esta empresa';
 end if;
 if tg_op='UPDATE' and (new.establishment_code,new.emission_point_code) is distinct from (old.establishment_code,old.emission_point_code) then
  if exists(select 1 from public.cai_ranges c where c.tenant_id=old.tenant_id and c.point_of_sale=old.name and (left(c.rango_desde,7) is distinct from prefix or left(c.rango_hasta,7) is distinct from prefix)) then
   raise exception 'Los códigos de la oficina deben conservar los prefijos de sus rangos CAI registrados';
  end if;
  if exists(select 1 from public.invoices i where i.tenant_id=old.tenant_id and i.billing_office_id=old.id and i.cai is not null and left(i.invoice_number,7) is distinct from prefix)
   or exists(select 1 from public.purchase_documents p where p.tenant_id=old.tenant_id and p.office_id=old.id and p.fiscal_snapshot is not null and left(p.document_number,7) is distinct from prefix)
   or exists(select 1 from public.withholding_documents w where w.tenant_id=old.tenant_id and w.office_id=old.id and left(w.document_number,7) is distinct from prefix) then
   raise exception 'Los códigos SAR de una oficina con documentos emitidos no se sustituyen';
  end if;
 end if;
 return new;
end $$;
create trigger zz_fiscal_office_codes before insert or update of establishment_code,emission_point_code on public.billing_offices for each row execute function public.guard_fiscal_office_codes();
revoke all on function public.guard_cai_office_binding(),public.guard_fiscal_office_codes() from public,anon,authenticated;
notify pgrst,'reload schema';
