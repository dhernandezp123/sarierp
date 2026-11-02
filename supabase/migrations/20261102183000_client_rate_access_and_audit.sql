-- RATE-ACCESS-01: individually delegated accountants may manage client rates.
-- All rate writes, including direct DML and the atomic replacement RPC, are audited.
create table public.client_rate_editors (
  tenant_id uuid not null references public.tenants(id),
  profile_id uuid not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  primary key(tenant_id,profile_id),
  foreign key(tenant_id,profile_id) references public.profiles(tenant_id,id) on delete cascade
);
alter table public.client_rate_editors enable row level security;
revoke all on public.client_rate_editors from anon,authenticated,service_role;
grant select on public.client_rate_editors to authenticated;
create policy client_rate_editors_read on public.client_rate_editors for select to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_approved_active_user()
    and (profile_id=auth.uid() or public.is_admin()));

create or replace function public.can_manage_client_rates(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_approved_active_user()
    and (public.is_role(array['Admin','Pricing','Ventas'])
      or (public.is_role(array['Contabilidad']) and exists (
        select 1 from public.client_rate_editors e
        where e.tenant_id=public.current_tenant_id() and e.profile_id=auth.uid())))
    and exists (
      select 1 from public.clientes c where c.id=p_cliente_id
        and c.tenant_id=public.current_tenant_id() and c.deleted_at is null
    )
$$;

create function public.audit_client_rate_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  previous jsonb;
  next_value jsonb;
  rate_row public.client_rates%rowtype;
  actor_name text;
begin
  if tg_op='UPDATE' and
    (to_jsonb(old)-array['updated_at','created_at']) = (to_jsonb(new)-array['updated_at','created_at']) then
    return new;
  end if;
  if tg_op<>'INSERT' then previous:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then next_value:=to_jsonb(new); rate_row:=new;
  else rate_row:=old; end if;
  select nullif(btrim(concat_ws(' ',p.nombre,p.apellido)),'') into actor_name
    from public.profiles p where p.id=auth.uid() and p.tenant_id=rate_row.tenant_id;
  insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata,created_at)
  values(rate_row.tenant_id,auth.uid(),'clientes','client_rate_'||lower(tg_op),'cliente',rate_row.cliente_id,
    'Cambio de tarifa: '||rate_row.rate_label,
    jsonb_build_object('source','client_rates_trigger','transaction_id',txid_current()::text,
      'rate_code',rate_row.rate_code,'destination',rate_row.miami_rate_destination,
      'actor_name',coalesce(actor_name,'Sistema'),'before',previous,'after',next_value),clock_timestamp());
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.audit_client_rate_change() from public,anon,authenticated;
create trigger client_rate_change_audit after insert or update or delete on public.client_rates
  for each row execute function public.audit_client_rate_change();

create index activity_logs_client_rates_history_idx
  on public.activity_logs(tenant_id,entity_id,created_at desc)
  where entity_type='cliente' and action in ('client_rate_insert','client_rate_update','client_rate_delete');

-- Security-definer reader exposes only the requested, accessible client's audit.
-- Replacement deletes/inserts are grouped by transaction and business key, so an
-- unchanged saved rate does not appear as a false price change. Raw events remain.
create function public.get_client_rate_history(p_cliente_id uuid,p_limit integer default 25,p_offset integer default 0)
returns table(event_id text,changed_at timestamptz,actor_id uuid,actor_name text,
  rate_code text,destination text,before_values jsonb,after_values jsonb,total_count bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_approved_active_user() or not public.can_select_cliente(p_cliente_id) then
    raise exception 'No tienes permiso para consultar el historial de tarifas' using errcode='42501';
  end if;
  return query
  with batches as (
    select coalesce(a.metadata->>'transaction_id',a.id::text) as batch_id,a.user_id,
      a.metadata->>'rate_code' as code,a.metadata->>'destination' as destination_code,
      max(a.created_at) as happened_at,
      jsonb_agg(a.metadata order by a.created_at,a.id) as events
    from public.activity_logs a
    where a.tenant_id=public.current_tenant_id() and a.entity_type='cliente' and a.entity_id=p_cliente_id
      and a.action in ('client_rate_insert','client_rate_update','client_rate_delete')
      and a.metadata->>'source'='client_rates_trigger'
    group by coalesce(a.metadata->>'transaction_id',a.id::text),a.user_id,
      a.metadata->>'rate_code',a.metadata->>'destination'
  ), snapshots as (
    select b.*,nullif(b.events->0->'before','null'::jsonb) as old_value,
      nullif(b.events->-1->'after','null'::jsonb) as new_value
    from batches b
  ), changes as (
    select s.* from snapshots s
    where (coalesce(s.old_value,'{}'::jsonb)-array['id','created_at','updated_at'])
      is distinct from (coalesce(s.new_value,'{}'::jsonb)-array['id','created_at','updated_at'])
  )
  select md5(c.batch_id||coalesce(c.user_id::text,'system')||c.code||coalesce(c.destination_code,'global')),
    c.happened_at,c.user_id,coalesce(nullif(btrim(concat_ws(' ',p.nombre,p.apellido)),''),c.events->0->>'actor_name','Sistema'),
    c.code,c.destination_code,c.old_value,c.new_value,count(*) over()
  from changes c left join public.profiles p on p.id=c.user_id and p.tenant_id=public.current_tenant_id()
  order by c.happened_at desc,c.batch_id desc,c.code,c.destination_code nulls first
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.get_client_rate_history(uuid,integer,integer) from public,anon;
grant execute on function public.get_client_rate_history(uuid,integer,integer) to authenticated;
comment on function public.can_manage_client_rates(uuid) is
  'Admin/Pricing/Ventas or individually delegated Contabilidad; active approved tenant users only.';
notify pgrst,'reload schema';
