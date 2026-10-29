-- Tenant catalog: stable codes preserve existing supplier references.
create table public.supplier_types (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 code text not null check (length(btrim(code)) between 1 and 80),
 label text not null check (length(btrim(label)) between 1 and 100),
 active boolean not null default true,
 sort_order integer not null default 100 check(sort_order between 0 and 100000),
 revision integer not null default 1,
 unique(tenant_id,code)
);
create unique index supplier_types_label_unique on public.supplier_types(tenant_id,lower(btrim(label)));
create table public.supplier_type_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 type_id uuid not null references public.supplier_types(id),
 actor_id uuid not null references public.profiles(id),
 occurred_at timestamptz not null default now(),
 before_value jsonb, after_value jsonb not null
);
create function public.seed_supplier_types_internal(p_tenant uuid) returns void
language sql security definer set search_path=public as $$
 insert into public.supplier_types(tenant_id,code,label,sort_order)
 select p_tenant,code,label,ordering from (values
 ('Agente','Agente',10),('Carrier','Carrier',20),('Aduanal','Aduanal',30),
 ('Transporte','Transporte',40),('Almacen','Almacén',50),('Courier','Courier',60),('Otro','Otro',70)
 ) seed(code,label,ordering) on conflict(tenant_id,code) do nothing;
$$;
select public.seed_supplier_types_internal(id) from public.tenants;
create function public.seed_new_tenant_supplier_types() returns trigger
language plpgsql security definer set search_path=public as $$begin
 perform public.seed_supplier_types_internal(new.id);return new;
end $$;
create trigger seed_supplier_types after insert on public.tenants
 for each row execute function public.seed_new_tenant_supplier_types();
revoke all on function public.seed_supplier_types_internal(uuid),public.seed_new_tenant_supplier_types() from public,anon,authenticated;

alter table public.proveedores drop constraint proveedores_tipo_check;
alter table public.proveedores add constraint proveedores_type_catalog_fkey
 foreign key(tenant_id,tipo) references public.supplier_types(tenant_id,code);
create function public.check_supplier_type_active() returns trigger
language plpgsql security definer set search_path=public as $$begin
 if tg_op='UPDATE' then
  if new.tipo is not distinct from old.tipo and new.tenant_id=old.tenant_id then return new;end if;
 end if;
 perform 1 from public.supplier_types where tenant_id=new.tenant_id and code=new.tipo and active for share;
 if not found then raise exception 'Selecciona un tipo de proveedor activo de esta empresa' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.check_supplier_type_active() from public,anon,authenticated;
-- Run after the existing tenant-assignment trigger used by browser inserts.
create trigger zz_check_supplier_type_active before insert or update of tipo,tenant_id on public.proveedores
 for each row execute function public.check_supplier_type_active();

alter table public.supplier_types enable row level security;
alter table public.supplier_type_events enable row level security;
revoke all on public.supplier_types,public.supplier_type_events from public,anon,authenticated;
grant select on public.supplier_types,public.supplier_type_events to authenticated;
create policy supplier_type_read on public.supplier_types for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.is_approved_active_user() and public.can_manage_finance());
create policy supplier_type_history_read on public.supplier_type_events for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.is_invoice_master());

create function public.save_supplier_type(p_id uuid,p_revision integer,p_code text,p_label text,p_active boolean,p_sort_order integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous public.supplier_types; result public.supplier_types;
begin
 if not public.is_invoice_master() then raise exception 'Solo Admin o el master de Contabilidad puede administrar tipos de proveedores' using errcode='42501';end if;
 if p_code is null or btrim(p_code)='' or length(btrim(p_code))>80 or p_label is null or btrim(p_label)='' or length(btrim(p_label))>100 or p_active is null or p_sort_order is null or p_sort_order not between 0 and 100000 then raise exception 'Completa los datos del tipo de proveedor';end if;
 if p_id is null then
  if p_revision is distinct from 0 then raise exception 'Version inicial invalida';end if;
  insert into public.supplier_types(tenant_id,code,label,active,sort_order)
   values(public.current_tenant_id(),btrim(p_code),btrim(p_label),p_active,p_sort_order) returning * into result;
 else
  select * into previous from public.supplier_types where id=p_id and tenant_id=public.current_tenant_id() for update;
  if not found then raise exception 'Tipo de proveedor no disponible' using errcode='42501';end if;
  if previous.revision is distinct from p_revision then raise exception 'El tipo cambio; recarga antes de guardar';end if;
  if previous.code is distinct from btrim(p_code) then raise exception 'El codigo es permanente para conservar las referencias';end if;
  update public.supplier_types set label=btrim(p_label),active=p_active,sort_order=p_sort_order,revision=revision+1
   where id=p_id returning * into result;
 end if;
 insert into public.supplier_type_events(tenant_id,type_id,actor_id,before_value,after_value)
  values(result.tenant_id,result.id,auth.uid(),case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(result));
 return to_jsonb(result);
end $$;
revoke all on function public.save_supplier_type(uuid,integer,text,text,boolean,integer) from public,anon;
grant execute on function public.save_supplier_type(uuid,integer,text,text,boolean,integer) to authenticated;
