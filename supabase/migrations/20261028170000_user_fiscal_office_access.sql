-- CAI-ACCESS-01: office authorization belongs to the user, not their location.
-- No office is inferred or granted to existing non-master users. Configure
-- permissions before issuing after this migration. The master manages all offices.
create table public.billing_user_office_access (
 tenant_id uuid not null references public.tenants(id), profile_id uuid not null,
 office_ids uuid[] not null default '{}', revision integer not null check(revision>0),
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 primary key(tenant_id,profile_id), foreign key(tenant_id,profile_id) references public.profiles(tenant_id,id)
);
create table public.billing_office_access_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 profile_id uuid not null references public.profiles(id),actor_id uuid not null references public.profiles(id),
 previous_office_ids uuid[] not null,office_ids uuid[] not null,reason text not null,created_at timestamptz not null default now()
);
alter table public.billing_user_office_access enable row level security;
alter table public.billing_office_access_events enable row level security;
revoke all on public.billing_user_office_access,public.billing_office_access_events from public,anon,authenticated;
grant select on public.billing_user_office_access,public.billing_office_access_events to authenticated;
create policy office_access_read on public.billing_user_office_access for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.can_manage_finance() and (profile_id=auth.uid() or public.is_invoice_master()));
create policy office_access_audit_read on public.billing_office_access_events for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.is_invoice_master());

create function public.can_issue_from_office(p_office_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.can_manage_finance() and exists(select 1 from public.billing_offices o
  where o.id=p_office_id and o.tenant_id=public.current_tenant_id() and o.is_active
  and (public.is_invoice_master() or exists(select 1 from public.billing_user_office_access a
   where a.tenant_id=o.tenant_id and a.profile_id=auth.uid() and o.id=any(a.office_ids))));
$$;
create function public.get_my_billing_office_access() returns table(id uuid,name text,allowed boolean)
language sql stable security definer set search_path=public as $$
 select o.id,o.name,public.can_issue_from_office(o.id) from public.billing_offices o
 where public.can_manage_finance() and o.tenant_id=public.current_tenant_id() and o.is_active order by o.name,o.id;
$$;
create function public.save_billing_user_office_access(p_profile_id uuid,p_revision integer,p_office_ids uuid[],p_reason text) returns integer
language plpgsql security definer set search_path=public as $$
declare access public.billing_user_office_access;ids uuid[];new_revision integer;begin
 if not public.is_invoice_master() then raise exception 'Solo el usuario máster puede autorizar oficinas' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo de la autorización';end if;
 if not exists(select 1 from public.profiles where id=p_profile_id and tenant_id=public.current_tenant_id() and rol in ('Admin','Contabilidad','Finanzas') and status='Aprobado' and is_active) then raise exception 'Selecciona un usuario financiero activo de esta empresa';end if;
 if p_office_ids is null or cardinality(p_office_ids)>1000 or array_position(p_office_ids,null) is not null then raise exception 'Lista de oficinas inválida';end if;
 select coalesce(array_agg(distinct x order by x),'{}') into ids from unnest(p_office_ids) x;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.billing_offices o where o.id=x and o.tenant_id=public.current_tenant_id() and o.is_active)) then raise exception 'La oficina no pertenece a esta empresa o está inactiva';end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-office-access:'||public.current_tenant_id()||':'||p_profile_id,0));
 select * into access from public.billing_user_office_access where tenant_id=public.current_tenant_id() and profile_id=p_profile_id for update;
 if p_revision is distinct from coalesce(access.revision,0) then raise exception 'Los permisos cambiaron; recarga antes de guardar';end if;
 new_revision:=coalesce(access.revision,0)+1;
 insert into public.billing_user_office_access(tenant_id,profile_id,office_ids,revision,updated_by)
 values(public.current_tenant_id(),p_profile_id,ids,new_revision,auth.uid())
 on conflict(tenant_id,profile_id) do update set office_ids=excluded.office_ids,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into public.billing_office_access_events(tenant_id,profile_id,actor_id,previous_office_ids,office_ids,reason)
 values(public.current_tenant_id(),p_profile_id,auth.uid(),coalesce(access.office_ids,'{}'),ids,btrim(p_reason));
 return new_revision;
end $$;

create function public.require_fiscal_office_access() returns trigger language plpgsql security definer set search_path=public as $$
declare office uuid;begin
 -- Administrative imports run as the database owner; every application issuance
 -- has an authenticated actor and must pass the individual authorization.
 if auth.uid() is null then return new;end if;
 if tg_table_name='invoices' then
  if new.cai is null then return new;end if;
  office:=new.billing_office_id;
 elsif tg_table_name='purchase_documents' then
  if new.document_type<>'Boleta de Compra' then return new;end if;
  office:=new.office_id;
 else office:=new.office_id;
 end if;
 if not public.can_issue_from_office(office) then raise exception 'No tienes autorización para emitir desde esta oficina. Solicita acceso al usuario máster.' using errcode='42501';end if;
 return new;
end $$;
-- AFTER validates the office already resolved by the existing fiscal snapshots.
-- An exception rolls back the document, its counter and financial side effects.
create trigger invoice_office_access after insert on public.invoices for each row execute function public.require_fiscal_office_access();
create trigger purchase_office_access after insert on public.purchase_documents for each row execute function public.require_fiscal_office_access();
create trigger withholding_office_access after insert on public.withholding_documents for each row execute function public.require_fiscal_office_access();
revoke all on function public.require_fiscal_office_access() from public,anon,authenticated;
revoke all on function public.can_issue_from_office(uuid),public.get_my_billing_office_access(),public.save_billing_user_office_access(uuid,integer,uuid[],text) from public,anon;
grant execute on function public.can_issue_from_office(uuid),public.get_my_billing_office_access(),public.save_billing_user_office_access(uuid,integer,uuid[],text) to authenticated;
notify pgrst,'reload schema';
