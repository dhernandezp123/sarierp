-- =========================================================
-- FASE 15.5A
-- Destino tarifario Miami SPS/TGU
-- =========================================================

alter table public.clientes
add column if not exists preferred_miami_rate_destination text;

alter table public.quotations
add column if not exists miami_rate_destination text;

alter table public.client_rates
add column if not exists miami_rate_destination text;

update public.clientes
set preferred_miami_rate_destination = 'SPS'
where preferred_miami_rate_destination is null;

update public.quotations
set miami_rate_destination = 'SPS'
where miami_rate_destination is null;

update public.client_rates
set miami_rate_destination = 'SPS'
where miami_rate_destination is null
  and rate_code in (
    'lcl_maritimo_sps_ft3',
    'lcl_maritimo_sps_lbs',
    'small_maritimo_min_lcl_1000_lbs_45_ft3',
    'minimo_maritimo_2mil_lbs_90_ft3',
    'consolidado_aereo_kg'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clientes_preferred_miami_rate_destination_check'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
    add constraint clientes_preferred_miami_rate_destination_check
    check (
      preferred_miami_rate_destination in ('SPS', 'TGU')
      or preferred_miami_rate_destination is null
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotations_miami_rate_destination_check'
      and conrelid = 'public.quotations'::regclass
  ) then
    alter table public.quotations
    add constraint quotations_miami_rate_destination_check
    check (
      miami_rate_destination in ('SPS', 'TGU')
      or miami_rate_destination is null
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_rates_miami_rate_destination_check'
      and conrelid = 'public.client_rates'::regclass
  ) then
    alter table public.client_rates
    add constraint client_rates_miami_rate_destination_check
    check (
      miami_rate_destination in ('SPS', 'TGU')
      or miami_rate_destination is null
    );
  end if;
end $$;

alter table public.client_rates
drop constraint if exists client_rates_cliente_id_rate_code_key;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.client_rates'::regclass
      and contype = 'u'
      and conkey = (
        select array_agg(attnum order by attnum)
        from pg_attribute
        where attrelid = 'public.client_rates'::regclass
          and attname in ('cliente_id', 'rate_code')
      )
  loop
    execute format(
      'alter table public.client_rates drop constraint %I',
      constraint_record.conname
    );
  end loop;
end $$;

drop index if exists public.client_rates_cliente_id_rate_code_key;
drop index if exists public.client_rates_cliente_id_rate_code_idx;
drop index if exists public.client_rates_cliente_id_rate_code_unique;
drop index if exists public.idx_client_rates_cliente_id_rate_code;
drop index if exists public.idx_client_rates_cliente_rate_code;
drop index if exists public.idx_client_rates_cliente_rate_code_unique;
drop index if exists public.client_rates_unique_cliente_rate_code;

do $$
declare
  index_record record;
begin
  for index_record in
    select indexrelid::regclass::text as index_name
    from pg_index
    where indrelid = 'public.client_rates'::regclass
      and indisunique
      and indpred is null
      and indkey::int2[] = (
        select array_agg(attnum order by attnum)::int2[]
        from pg_attribute
        where attrelid = 'public.client_rates'::regclass
          and attname in ('cliente_id', 'rate_code')
      )
      and not exists (
        select 1
        from pg_depend
        where objid = indexrelid
          and deptype = 'i'
      )
  loop
    execute format('drop index if exists %s', index_record.index_name);
  end loop;
end $$;

create unique index if not exists client_rates_cliente_rate_code_global_unique
on public.client_rates (cliente_id, rate_code)
where miami_rate_destination is null;

create unique index if not exists client_rates_cliente_rate_code_destination_unique
on public.client_rates (cliente_id, rate_code, miami_rate_destination)
where miami_rate_destination is not null;

notify pgrst, 'reload schema';
