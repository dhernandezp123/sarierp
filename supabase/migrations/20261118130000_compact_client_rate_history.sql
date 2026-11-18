-- Paginate complete saves while preserving the immutable raw audit.
create function public.get_client_rate_history_batches(
  p_cliente_id uuid,p_limit integer default 25,p_offset integer default 0,
  p_from date default null,p_to date default null,p_actor text default null,p_rate text default null
) returns table(event_id text,changed_at timestamptz,actor_id uuid,actor_name text,changes jsonb,total_count bigint)
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
  , named as (
    select c.*,coalesce(nullif(btrim(concat_ws(' ',p.nombre,p.apellido)),''),c.events->0->>'actor_name','Sistema') as author
    from changes c left join public.profiles p on p.id=c.user_id and p.tenant_id=public.current_tenant_id()
  ), grouped as (
    select n.batch_id,n.user_id,n.author,max(n.happened_at) as happened_at,
      jsonb_agg(jsonb_build_object(
        'event_id',md5(n.batch_id||coalesce(n.user_id::text,'system')||n.code||coalesce(n.destination_code,'global')),
        'rate_code',n.code,'destination',n.destination_code,'before_values',n.old_value,'after_values',n.new_value
      ) order by n.code,n.destination_code nulls first) as rate_changes
    from named n group by n.batch_id,n.user_id,n.author
  ), filtered as (
    select g.* from grouped g
    where (p_from is null or (g.happened_at at time zone 'America/Tegucigalpa')::date >= p_from)
      and (p_to is null or (g.happened_at at time zone 'America/Tegucigalpa')::date <= p_to)
      and (nullif(btrim(p_actor),'') is null or strpos(lower(g.author),lower(btrim(p_actor)))>0)
      and (nullif(btrim(p_rate),'') is null or exists (
        select 1 from jsonb_array_elements(g.rate_changes) r
        where strpos(lower(concat_ws(' ',r->>'rate_code',r->'before_values'->>'rate_label',r->'after_values'->>'rate_label')),lower(btrim(p_rate)))>0
      ))
  )
  select md5(f.batch_id||coalesce(f.user_id::text,'system')),f.happened_at,f.user_id,f.author,f.rate_changes,count(*) over()
  from filtered f order by f.happened_at desc,f.batch_id desc,f.user_id nulls first
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.get_client_rate_history_batches(uuid,integer,integer,date,date,text,text) from public,anon;
grant execute on function public.get_client_rate_history_batches(uuid,integer,integer,date,date,text,text) to authenticated;
