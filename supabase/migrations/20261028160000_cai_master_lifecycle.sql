-- CAI-MASTER-01: corrections and retirement preserve fiscal history.
alter table public.cai_ranges
 add column revision integer not null default 1 check(revision>0),
 add column ever_used boolean not null default false,
 add column archived_at timestamptz,
 add column archived_by uuid references public.profiles(id),
 add constraint cai_archived_inactive check(archived_at is null or not is_active);

update public.cai_ranges c set ever_used=true where next_number>range_start
 or exists(select 1 from public.invoices i where i.tenant_id=c.tenant_id and i.cai=c.cai)
 or exists(select 1 from public.purchase_documents p where p.tenant_id=c.tenant_id and p.fiscal_snapshot->>'cai'=c.cai)
 or exists(select 1 from public.withholding_documents w where w.tenant_id=c.tenant_id and w.fiscal_snapshot->>'cai'=c.cai);

create table public.cai_range_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 range_id uuid not null references public.cai_ranges(id),
 actor_id uuid references public.profiles(id), actor_name text not null,
 action text not null, reason text not null, before_values jsonb, after_values jsonb not null,
 created_at timestamptz not null default now()
);
create index cai_range_events_history on public.cai_range_events(tenant_id,range_id,created_at desc,id);
alter table public.cai_range_events enable row level security;
revoke all on public.cai_range_events from public,anon,authenticated;
grant select on public.cai_range_events to authenticated;
create policy cai_history_read on public.cai_range_events for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.can_manage_finance());

-- An Admin/accounting role alone no longer grants CAI configuration writes.
do $$declare p record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='cai_ranges' and cmd in ('INSERT','UPDATE','DELETE') and permissive='PERMISSIVE' loop
  execute format('drop policy %I on public.cai_ranges',p.policyname);
 end loop;
end $$;
create policy cai_master_insert on public.cai_ranges for insert to authenticated
 with check(tenant_id=public.current_tenant_id() and public.is_invoice_master());
create policy cai_master_update on public.cai_ranges for update to authenticated
 using(tenant_id=public.current_tenant_id() and public.is_invoice_master())
 with check(tenant_id=public.current_tenant_id() and public.is_invoice_master());
revoke delete on public.cai_ranges from authenticated,anon;
-- Application configuration cannot write consumption, archive actors or revisions.
-- Existing SECURITY DEFINER issuers still increment counters atomically.
revoke update on public.cai_ranges from authenticated;
grant update(cai,rango_desde,rango_hasta,fecha_limite_emision,lugar_emision,is_active) on public.cai_ranges to authenticated;

create function public.guard_cai_history() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'El historial CAI se conserva; utiliza la eliminación con registro';end if;
 if tg_op='UPDATE' then
  if old.archived_at is not null then raise exception 'Un CAI eliminado permanece como historial de solo lectura';end if;
  if new.point_of_sale is distinct from old.point_of_sale or new.document_type is distinct from old.document_type then
   raise exception 'La oficina y el tipo de un CAI registrado no se cambian';
  end if;
  if new.next_number<old.next_number and (old.ever_used or old.next_number>old.range_start) then raise exception 'No se puede retroceder un correlativo utilizado';end if;
  if old.ever_used and (new.cai is distinct from old.cai or new.number_prefix is distinct from old.number_prefix
   or new.range_start is distinct from old.range_start or new.range_end<old.next_number-1) then
   raise exception 'Conserva el CAI, prefijo y números utilizados al corregir el rango';
  end if;
  new.ever_used:=old.ever_used or new.next_number>new.range_start;
  new.revision:=old.revision+1;
 else
  new.ever_used:=new.next_number>new.range_start;
  new.revision:=1;
  if new.archived_at is not null then raise exception 'Un CAI nuevo no puede estar eliminado';end if;
 end if;
 if new.archived_at is not null and new.is_active then raise exception 'Desactiva el CAI antes de eliminarlo';end if;
 if new.is_active and (tg_op='INSERT' or not old.is_active or new.fecha_limite_emision is distinct from old.fecha_limite_emision
  or new.rango_desde is distinct from old.rango_desde or new.rango_hasta is distinct from old.rango_hasta) then
  if new.fecha_limite_emision<current_date then raise exception 'No se puede activar un rango CAI vencido';end if;
  if new.next_number>new.range_end then raise exception 'No se puede activar un rango CAI agotado';end if;
 end if;
 return new;
end $$;
create trigger zz_cai_history_guard before insert or update or delete on public.cai_ranges
 for each row execute function public.guard_cai_history();

create function public.audit_cai_change() returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb;action_name text;begin
 if tg_op='UPDATE' then previous:=to_jsonb(old);end if;
 action_name:=case when tg_op='INSERT' then 'Registro' when new.archived_at is not null then 'Eliminación con registro'
  when new.is_active is distinct from old.is_active then case when new.is_active then 'Activación' else 'Desactivación' end
  when (to_jsonb(new)-array['revision','ever_used','next_number'])=(to_jsonb(old)-array['revision','ever_used','next_number']) then 'Correlativo consumido'
  else 'Edición' end;
 insert into public.cai_range_events(tenant_id,range_id,actor_id,actor_name,action,reason,before_values,after_values)
 values(new.tenant_id,new.id,auth.uid(),coalesce((select nullif(btrim(nombre),'') from public.profiles where id=auth.uid()),'Sistema'),
  action_name,coalesce(nullif(current_setting('app.cai_change_reason',true),''),case when action_name='Correlativo consumido' then 'Emisión fiscal' else 'Configuración fiscal' end),previous,to_jsonb(new));
 return new;
end $$;
create trigger cai_change_audit after insert or update on public.cai_ranges for each row execute function public.audit_cai_change();

-- Legacy inactive rows can always be retired, even with incomplete office data.
create or replace function public.guard_cai_office_binding() returns trigger language plpgsql security definer set search_path=public as $$
declare office public.billing_offices;prefix text;begin
 if tg_op='UPDATE' and not new.is_active and new.point_of_sale=old.point_of_sale and new.document_type=old.document_type
  and new.rango_desde=old.rango_desde and new.rango_hasta=old.rango_hasta and new.next_number=old.next_number then return new;end if;
 select * into office from public.billing_offices where tenant_id=new.tenant_id and name=new.point_of_sale for share;
 if not found then raise exception 'Configura la oficina de facturación antes de registrar su rango CAI';end if;
 if office.establishment_code='' or office.emission_point_code='' then raise exception 'Completa los códigos SAR de la oficina antes de registrar o activar un rango CAI';end if;
 if exists(select 1 from public.billing_offices o where o.tenant_id=office.tenant_id and o.id<>office.id and o.establishment_code=office.establishment_code and o.emission_point_code=office.emission_point_code) then raise exception 'El prefijo SAR ya pertenece a otra oficina';end if;
 prefix:=office.establishment_code||'-'||office.emission_point_code;
 if left(new.rango_desde,7) is distinct from prefix or left(new.rango_hasta,7) is distinct from prefix then raise exception 'El prefijo SAR del rango CAI no corresponde a la oficina seleccionada (%)',office.name;end if;
 if new.is_active and not office.is_active then raise exception 'Activa la oficina antes de activar su rango CAI';end if;
 return new;
end $$;

create function public.save_cai_range(p_id uuid,p_revision integer,p_values jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.cai_ranges;target uuid:=coalesce(p_id,gen_random_uuid());used_next bigint;previous_reason text;begin
 if not public.is_invoice_master() then raise exception 'Solo el usuario máster puede administrar CAI' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo del cambio (hasta 1000 caracteres)';end if;
 if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Configuración CAI inválida';end if;
 previous_reason:=current_setting('app.cai_change_reason',true);perform set_config('app.cai_change_reason',btrim(p_reason),true);
 if p_id is null then
  if p_revision<>0 then raise exception 'Versión inicial inválida';end if;
  insert into public.cai_ranges(id,tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,lugar_emision,next_number,is_active)
   values(target,public.current_tenant_id(),nullif(btrim(p_values->>'cai'),''),btrim(p_values->>'point_of_sale'),p_values->>'document_type',
    btrim(p_values->>'rango_desde'),btrim(p_values->>'rango_hasta'),(p_values->>'fecha_limite_emision')::date,nullif(btrim(p_values->>'lugar_emision'),''),nullif(p_values->>'next_number','')::bigint,false);
 else
  select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id();
  if not found then raise exception 'El rango CAI no existe';end if;
  perform pg_advisory_xact_lock(hashtextextended('cai:'||c.tenant_id||':'||c.point_of_sale||':'||c.document_type,0));
  select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id() for update;
  if p_revision is distinct from c.revision then raise exception 'El CAI cambió; recarga antes de guardar';end if;
  if c.archived_at is not null then raise exception 'El CAI está eliminado y conserva su historial';end if;
  if p_values->>'point_of_sale' is distinct from c.point_of_sale or p_values->>'document_type' is distinct from c.document_type then raise exception 'La oficina y tipo del CAI no se cambian';end if;
  used_next:=case when c.ever_used then c.next_number else substring(btrim(p_values->>'rango_desde') from '([0-9]+)$')::bigint end;
  update public.cai_ranges set cai=nullif(btrim(p_values->>'cai'),''),rango_desde=btrim(p_values->>'rango_desde'),rango_hasta=btrim(p_values->>'rango_hasta'),
   fecha_limite_emision=(p_values->>'fecha_limite_emision')::date,lugar_emision=nullif(btrim(p_values->>'lugar_emision'),''),next_number=used_next,
   is_active=c.is_active and (p_values->>'fecha_limite_emision')::date>=current_date and used_next<=substring(btrim(p_values->>'rango_hasta') from '([0-9]+)$')::bigint
   where id=p_id and tenant_id=public.current_tenant_id();
 end if;
 perform set_config('app.cai_change_reason',coalesce(previous_reason,''),true);return target;
end $$;

create function public.set_cai_range_active(p_id uuid,p_revision integer,p_active boolean,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.cai_ranges;previous_reason text;begin
 if not public.is_invoice_master() then raise exception 'Solo el usuario máster puede administrar CAI' using errcode='42501';end if;
 if p_active is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el estado y motivo del cambio';end if;
 select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'El rango CAI no existe';end if;
 perform pg_advisory_xact_lock(hashtextextended('cai:'||c.tenant_id||':'||c.point_of_sale||':'||c.document_type,0));
 select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id() for update;
 if p_revision is distinct from c.revision then raise exception 'El CAI cambió; recarga antes de guardar';end if;
 if c.archived_at is not null then raise exception 'El CAI está eliminado';end if;
 if c.is_active=p_active then return;end if;
 if p_active then
  if not isfinite(c.fecha_limite_emision) or c.fecha_limite_emision not between date '0001-01-01' and date '9999-12-31' then raise exception 'Fecha límite CAI inválida' using errcode='23514';end if;
  if c.fecha_limite_emision<current_date then raise exception 'No se puede activar un rango CAI vencido';end if;
  if c.next_number>c.range_end then raise exception 'No se puede activar un rango CAI agotado';end if;
 end if;
 previous_reason:=current_setting('app.cai_change_reason',true);perform set_config('app.cai_change_reason',btrim(p_reason),true);
 if p_active then update public.cai_ranges set is_active=false where tenant_id=c.tenant_id and point_of_sale=c.point_of_sale and document_type=c.document_type and is_active and id<>c.id;end if;
 update public.cai_ranges set is_active=p_active where id=c.id and tenant_id=c.tenant_id;
 perform set_config('app.cai_change_reason',coalesce(previous_reason,''),true);
end $$;

create function public.archive_cai_range(p_id uuid,p_revision integer,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.cai_ranges;previous_reason text;begin
 if not public.is_invoice_master() then raise exception 'Solo el usuario máster puede administrar CAI' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de eliminación';end if;
 select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'El rango CAI no existe';end if;
 perform pg_advisory_xact_lock(hashtextextended('cai:'||c.tenant_id||':'||c.point_of_sale||':'||c.document_type,0));
 select * into c from public.cai_ranges where id=p_id and tenant_id=public.current_tenant_id() for update;
 if p_revision is distinct from c.revision then raise exception 'El CAI cambió; recarga antes de guardar';end if;
 if c.is_active then raise exception 'Desactiva el CAI antes de eliminarlo';end if;
 if c.archived_at is not null then raise exception 'El CAI ya está eliminado';end if;
 previous_reason:=current_setting('app.cai_change_reason',true);perform set_config('app.cai_change_reason',btrim(p_reason),true);
 update public.cai_ranges set archived_at=now(),archived_by=auth.uid() where id=c.id and tenant_id=c.tenant_id;
 perform set_config('app.cai_change_reason',coalesce(previous_reason,''),true);
end $$;

-- Compatibility entry points also enforce the individual master designation.
create or replace function public.activate_cai_range_trusted(p_range_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare version integer;begin
 if not public.is_invoice_master() then raise exception 'Solo el usuario máster puede administrar CAI' using errcode='42501';end if;
 select revision into version from public.cai_ranges where id=p_range_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'El rango CAI no existe';end if;
 perform public.set_cai_range_active(p_range_id,version,true,'Activación por función compatible');return p_range_id;
end $$;
revoke all on function public.guard_cai_history(),public.audit_cai_change(),public.activate_cai_range_trusted(uuid) from public,anon,authenticated;
revoke all on function public.save_cai_range(uuid,integer,jsonb,text),public.set_cai_range_active(uuid,integer,boolean,text),public.archive_cai_range(uuid,integer,text) from public,anon;
grant execute on function public.save_cai_range(uuid,integer,jsonb,text),public.set_cai_range_active(uuid,integer,boolean,text),public.archive_cai_range(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
