-- Opciones comerciales múltiples por cotización.
-- Son snapshots de trabajo/comerciales; pricing_items continúa siendo la fuente
-- canónica para la opción finalmente aceptada y para todos los flujos legacy.

create table if not exists public.quotation_options (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  agent_quote_id uuid not null references public.agent_quotes(id) on delete restrict,
  option_code text not null,
  label text not null,
  status text not null default 'Borrador'
    check (status in ('Borrador', 'Ofrecida', 'Aceptada', 'No seleccionada', 'Retirada')),
  is_recommended boolean not null default false,
  sort_order integer not null default 0,
  agent_id uuid references public.agents(id) on delete set null,
  agent_name text,
  carrier text,
  etd date,
  transit_time text,
  free_days_destination integer,
  transshipment text,
  valid_until date,
  currency text not null default 'USD',
  cost_total numeric not null default 0,
  sale_subtotal numeric not null default 0,
  tax_total numeric not null default 0,
  grand_total numeric not null default 0,
  profit_amount numeric not null default 0,
  gp_percentage numeric not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  offered_at timestamptz,
  accepted_at timestamptz,
  unique (quotation_id, option_code)
);

create table if not exists public.quotation_option_items (
  id uuid primary key default gen_random_uuid(),
  quotation_option_id uuid not null references public.quotation_options(id) on delete cascade,
  source_pricing_item_id uuid references public.pricing_items(id) on delete set null,
  item_type text not null,
  description text not null,
  cost_amount numeric not null default 0,
  sale_amount numeric not null default 0,
  currency text not null default 'USD',
  supplier text,
  notes text,
  quantity numeric not null default 1,
  taxable boolean not null default false,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  rate_code text,
  insurance_coverage_override boolean,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pricing_items
  add column if not exists source_option_item_id uuid
    references public.quotation_option_items(id) on delete set null;

alter table public.shipping_instructions
  add column if not exists quotation_option_id uuid
    references public.quotation_options(id) on delete restrict;

create index if not exists quotation_options_quotation_idx
  on public.quotation_options (quotation_id, sort_order, created_at);
create index if not exists quotation_option_items_option_idx
  on public.quotation_option_items (quotation_option_id, sort_order, created_at);
create unique index if not exists quotation_options_one_recommended_idx
  on public.quotation_options (quotation_id)
  where is_recommended is true
    and status not in ('No seleccionada', 'Retirada');
create unique index if not exists quotation_options_one_accepted_idx
  on public.quotation_options (quotation_id)
  where status = 'Aceptada';

alter table public.quotation_options enable row level security;
alter table public.quotation_option_items enable row level security;

drop policy if exists quotation_options_select_policy on public.quotation_options;
create policy quotation_options_select_policy
on public.quotation_options for select to authenticated
using (public.can_select_quotation(quotation_id));

drop policy if exists quotation_option_items_select_policy on public.quotation_option_items;
create policy quotation_option_items_select_policy
on public.quotation_option_items for select to authenticated
using (
  exists (
    select 1
    from public.quotation_options qo
    where qo.id = quotation_option_items.quotation_option_id
      and public.can_select_quotation(qo.quotation_id)
  )
);

-- No se crean políticas de escritura. Todas las mutaciones pasan por RPCs
-- SECURITY DEFINER para conservar atomicidad, permisos e inmutabilidad.
revoke all on table public.quotation_options from anon, authenticated;
revoke all on table public.quotation_option_items from anon, authenticated;
grant select on table public.quotation_options to authenticated;
grant select on table public.quotation_option_items to authenticated;
grant all on table public.quotation_options to service_role;
grant all on table public.quotation_option_items to service_role;

create or replace function public.save_current_pricing_as_option(
  p_quotation_id uuid,
  p_label text default null,
  p_is_recommended boolean default false,
  p_option_id uuid default null
)
returns table (option_id uuid, option_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.quotations%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_option public.quotation_options%rowtype;
  v_option_count integer;
  v_sort_order integer;
  v_code text;
  v_label text;
  v_currency text;
  v_currency_count integer;
  v_cost numeric;
  v_sale numeric;
  v_tax numeric;
  v_total numeric;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para guardar opciones comerciales'
      using errcode = '42501';
  end if;

  select q.* into v_quote
  from public.quotations q
  where q.id = p_quotation_id and q.deleted_at is null
  for update;

  if not found then
    raise exception 'La cotización no existe o fue eliminada' using errcode = 'P0002';
  end if;

  if v_quote.status in ('Enviada al Cliente', 'Ganada', 'Perdida') then
    raise exception 'La cotización está bloqueada; reábrela antes de modificar opciones';
  end if;

  select aq.* into v_agent
  from public.agent_quotes aq
  where aq.quotation_id = p_quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null
  order by aq.created_at desc
  limit 1;

  if not found then
    raise exception 'Selecciona una tarifa de agente antes de guardar la opción';
  end if;

  if not exists (
    select 1 from public.pricing_items pi
    where pi.quotation_id = p_quotation_id and pi.deleted_at is null
  ) then
    raise exception 'La opción debe tener al menos una línea de pricing';
  end if;

  if exists (
    select 1 from public.pricing_items pi
    where pi.quotation_id = p_quotation_id
      and pi.deleted_at is null
      and (
        nullif(btrim(pi.description), '') is null
        or coalesce(pi.quantity, 0) <= 0
        or coalesce(pi.cost_amount, -1) < 0
        or coalesce(pi.sale_amount, -1) < 0
        or coalesce(pi.tax_amount, -1) < 0
      )
  ) then
    raise exception 'El pricing contiene líneas incompletas o importes inválidos';
  end if;

  select
    count(distinct coalesce(nullif(pi.currency, ''), 'USD')),
    min(coalesce(nullif(pi.currency, ''), 'USD')),
    coalesce(sum(coalesce(pi.cost_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)), 0),
    coalesce(sum(coalesce(pi.sale_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)), 0),
    coalesce(sum(coalesce(pi.tax_amount, 0)), 0),
    coalesce(sum(
      case
        when coalesce(pi.total_amount, 0) > 0 then pi.total_amount
        else coalesce(pi.sale_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)
          + coalesce(pi.tax_amount, 0)
      end
    ), 0)
  into v_currency_count, v_currency, v_cost, v_sale, v_tax, v_total
  from public.pricing_items pi
  where pi.quotation_id = p_quotation_id and pi.deleted_at is null;

  if v_currency_count <> 1 then
    raise exception 'Todas las líneas de una opción deben usar la misma moneda';
  end if;

  if p_is_recommended then
    update public.quotation_options
    set is_recommended = false, updated_at = now()
    where quotation_id = p_quotation_id
      and id is distinct from p_option_id
      and is_recommended is true;
  end if;

  if p_option_id is null then
    select count(*)::integer into v_option_count
    from public.quotation_options qo
    where qo.quotation_id = p_quotation_id;

    if v_option_count >= 26 then
      raise exception 'La cotización alcanzó el máximo de 26 opciones';
    end if;

    select chr(candidate.codepoint) into v_code
    from generate_series(65, 90) as candidate(codepoint)
    where not exists (
      select 1 from public.quotation_options existing
      where existing.quotation_id = p_quotation_id
        and existing.option_code = chr(candidate.codepoint)
    )
    order by candidate.codepoint
    limit 1;

    select coalesce(max(qo.sort_order) + 1, 0) into v_sort_order
    from public.quotation_options qo
    where qo.quotation_id = p_quotation_id;

    v_label := coalesce(nullif(btrim(p_label), ''), 'Opción ' || v_code);

    insert into public.quotation_options (
      quotation_id, agent_quote_id, option_code, label, status,
      is_recommended, sort_order, agent_id, agent_name, carrier, etd,
      transit_time, free_days_destination, transshipment, valid_until,
      currency, cost_total, sale_subtotal, tax_total, grand_total,
      profit_amount, gp_percentage, created_by
    ) values (
      p_quotation_id, v_agent.id, v_code, v_label, 'Borrador',
      p_is_recommended, v_sort_order, v_agent.agent_id, v_agent.agente_nombre,
      v_agent.carrier, v_agent.etd, v_agent.transit_time,
      v_agent.free_days_destination, v_agent.transshipment, v_agent.valid_until,
      v_currency, v_cost, v_sale, v_tax, v_total, v_sale - v_cost,
      case when v_sale > 0 then ((v_sale - v_cost) / v_sale) * 100 else 0 end,
      v_user_id
    ) returning * into v_option;
  else
    select qo.* into v_option
    from public.quotation_options qo
    where qo.id = p_option_id and qo.quotation_id = p_quotation_id
    for update;

    if not found then
      raise exception 'La opción no pertenece a la cotización';
    end if;
    if v_option.status <> 'Borrador' then
      raise exception 'Solo las opciones en borrador pueden actualizarse';
    end if;

    v_label := coalesce(nullif(btrim(p_label), ''), v_option.label);

    update public.quotation_options
    set agent_quote_id = v_agent.id,
        label = v_label,
        is_recommended = p_is_recommended,
        agent_id = v_agent.agent_id,
        agent_name = v_agent.agente_nombre,
        carrier = v_agent.carrier,
        etd = v_agent.etd,
        transit_time = v_agent.transit_time,
        free_days_destination = v_agent.free_days_destination,
        transshipment = v_agent.transshipment,
        valid_until = v_agent.valid_until,
        currency = v_currency,
        cost_total = v_cost,
        sale_subtotal = v_sale,
        tax_total = v_tax,
        grand_total = v_total,
        profit_amount = v_sale - v_cost,
        gp_percentage = case when v_sale > 0 then ((v_sale - v_cost) / v_sale) * 100 else 0 end,
        updated_at = now()
    where id = v_option.id
    returning * into v_option;

    delete from public.quotation_option_items
    where quotation_option_id = v_option.id;
  end if;

  insert into public.quotation_option_items (
    quotation_option_id, source_pricing_item_id, item_type, description,
    cost_amount, sale_amount, currency, supplier, notes, quantity, taxable,
    tax_rate, tax_amount, total_amount, rate_code,
    insurance_coverage_override, sort_order
  )
  select
    v_option.id, pi.id, pi.item_type, pi.description,
    coalesce(pi.cost_amount, 0), coalesce(pi.sale_amount, 0),
    coalesce(nullif(pi.currency, ''), 'USD'), pi.supplier, pi.notes,
    coalesce(nullif(pi.quantity, 0), 1), coalesce(pi.taxable, false),
    coalesce(pi.tax_rate, 0), coalesce(pi.tax_amount, 0),
    case
      when coalesce(pi.total_amount, 0) > 0 then pi.total_amount
      else coalesce(pi.sale_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)
        + coalesce(pi.tax_amount, 0)
    end,
    pi.rate_code, pi.insurance_coverage_override,
    row_number() over (order by pi.created_at, pi.id)::integer - 1
  from public.pricing_items pi
  where pi.quotation_id = p_quotation_id and pi.deleted_at is null
  order by pi.created_at, pi.id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'pricing',
    case when p_option_id is null then 'quotation_option_created' else 'quotation_option_updated' end,
    'quotation', p_quotation_id,
    case when p_option_id is null then 'Opción comercial creada' else 'Opción comercial actualizada' end
      || ': ' || v_option.option_code || ' - ' || v_option.label,
    jsonb_build_object(
      'quotation_option_id', v_option.id,
      'option_code', v_option.option_code,
      'agent_quote_id', v_agent.id,
      'carrier', v_agent.carrier,
      'grand_total', v_total,
      'currency', v_currency
    )
  );

  return query select v_option.id, v_option.option_code;
end;
$$;

create or replace function public.delete_draft_quotation_option(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_option public.quotation_options%rowtype;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para eliminar opciones comerciales'
      using errcode = '42501';
  end if;

  select * into v_option
  from public.quotation_options
  where id = p_option_id
  for update;

  if not found then raise exception 'La opción no existe' using errcode = 'P0002'; end if;
  if v_option.status <> 'Borrador' then
    raise exception 'Solo se pueden eliminar opciones en borrador';
  end if;

  delete from public.quotation_options where id = p_option_id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'pricing', 'quotation_option_deleted', 'quotation',
    v_option.quotation_id, 'Opción comercial eliminada: ' || v_option.option_code,
    jsonb_build_object('quotation_option_id', v_option.id, 'option_code', v_option.option_code)
  );
end;
$$;

create or replace function public.publish_quotation_options(p_quotation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para publicar opciones comerciales'
      using errcode = '42501';
  end if;

  perform 1 from public.quotations q
  where q.id = p_quotation_id and q.deleted_at is null
  for update;
  if not found then raise exception 'La cotización no existe' using errcode = 'P0002'; end if;

  if exists (
    select 1
    from public.quotation_options qo
    where qo.quotation_id = p_quotation_id
      and qo.status = 'Borrador'
      and not exists (
        select 1 from public.quotation_option_items qoi
        where qoi.quotation_option_id = qo.id
      )
  ) then
    raise exception 'Todas las opciones deben tener líneas comerciales';
  end if;

  update public.quotation_options
  set status = 'Ofrecida', published_by = v_user_id,
      offered_at = coalesce(offered_at, now()), updated_at = now()
  where quotation_id = p_quotation_id and status = 'Borrador';

  get diagnostics v_count = row_count;

  if not exists (
    select 1 from public.quotation_options
    where quotation_id = p_quotation_id and status = 'Ofrecida'
  ) then
    raise exception 'Guarda al menos una opción comercial antes de enviar';
  end if;

  if v_count > 0 then
    insert into public.activity_logs (
      user_id, module, action, entity_type, entity_id, description, metadata
    ) values (
      v_user_id, 'pricing', 'quotation_options_published', 'quotation',
      p_quotation_id, 'Opciones comerciales publicadas para el cliente',
      jsonb_build_object('published_options', v_count)
    );
  end if;

  return v_count;
end;
$$;

create or replace function public.send_quotation_with_options(p_quotation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.quotations%rowtype;
  v_count integer;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para enviar opciones comerciales'
      using errcode = '42501';
  end if;

  select q.* into v_quote
  from public.quotations q
  where q.id = p_quotation_id and q.deleted_at is null
  for update;

  if not found then raise exception 'La cotización no existe' using errcode = 'P0002'; end if;

  if v_quote.status <> 'Pricing Aprobado' then
    raise exception 'La cotización debe tener Pricing Aprobado antes de enviarse';
  end if;

  if exists (
    select 1
    from public.quotation_options qo
    where qo.quotation_id = p_quotation_id
      and qo.status = 'Borrador'
      and not exists (
        select 1 from public.quotation_option_items qoi
        where qoi.quotation_option_id = qo.id
      )
  ) then
    raise exception 'Todas las opciones deben tener líneas comerciales';
  end if;

  update public.quotation_options
  set status = 'Ofrecida', published_by = v_user_id,
      offered_at = coalesce(offered_at, now()), updated_at = now()
  where quotation_id = p_quotation_id and status = 'Borrador';

  get diagnostics v_count = row_count;

  if not exists (
    select 1 from public.quotation_options
    where quotation_id = p_quotation_id and status = 'Ofrecida'
  ) then
    raise exception 'Guarda al menos una opción comercial antes de enviar';
  end if;

  update public.quotations
  set status = 'Enviada al Cliente'
  where id = p_quotation_id;

  insert into public.quotation_status_history (
    quotation_id, old_status, new_status, changed_by
  ) values (
    p_quotation_id, v_quote.status, 'Enviada al Cliente', v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'pricing', 'quotation_options_sent', 'quotation',
    p_quotation_id, 'Cotización enviada al cliente con opciones comerciales',
    jsonb_build_object('published_options', v_count)
  );

  return v_count;
end;
$$;

create or replace function public.accept_quotation_option(p_option_id uuid)
returns table (
  quotation_id uuid,
  option_id uuid,
  option_code text,
  agent_quote_id uuid,
  grand_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quotation_id uuid;
  v_option public.quotation_options%rowtype;
  v_quote public.quotations%rowtype;
begin
  if v_user_id is null
    or not public.is_approved_active_user()
    or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para registrar la opción elegida'
      using errcode = '42501';
  end if;

  select qo.quotation_id into v_quotation_id
  from public.quotation_options qo
  where qo.id = p_option_id;

  if not found then raise exception 'La opción no existe' using errcode = 'P0002'; end if;

  select q.* into v_quote
  from public.quotations q
  where q.id = v_quotation_id and q.deleted_at is null
  for update;

  if not found or not public.can_select_quotation(v_quotation_id) then
    raise exception 'No tienes acceso a la cotización' using errcode = '42501';
  end if;

  select qo.* into v_option
  from public.quotation_options qo
  where qo.id = p_option_id and qo.quotation_id = v_quotation_id
  for update;

  if not found then raise exception 'La opción no existe' using errcode = 'P0002'; end if;

  if v_option.status = 'Aceptada' then
    return query select v_option.quotation_id, v_option.id, v_option.option_code,
      v_option.agent_quote_id, v_option.grand_total;
    return;
  end if;

  if v_quote.status <> 'Enviada al Cliente' then
    raise exception 'La cotización debe estar Enviada al Cliente antes de registrar la elección';
  end if;
  if v_option.status <> 'Ofrecida' then
    raise exception 'Solo se puede aceptar una opción ofrecida al cliente';
  end if;
  if v_option.valid_until is not null and v_option.valid_until < current_date then
    raise exception 'La opción seleccionada está vencida';
  end if;

  delete from public.pricing_items
  where public.pricing_items.quotation_id = v_option.quotation_id;

  insert into public.pricing_items (
    quotation_id, item_type, description, cost_amount, sale_amount,
    currency, supplier, notes, quantity, taxable, tax_rate, tax_amount,
    total_amount, rate_code, insurance_coverage_override,
    source_option_item_id, created_by
  )
  select
    v_option.quotation_id, qoi.item_type, qoi.description,
    qoi.cost_amount, qoi.sale_amount, qoi.currency, qoi.supplier, qoi.notes,
    qoi.quantity, qoi.taxable, qoi.tax_rate, qoi.tax_amount,
    qoi.total_amount, qoi.rate_code, qoi.insurance_coverage_override,
    qoi.id, v_user_id
  from public.quotation_option_items qoi
  where qoi.quotation_option_id = v_option.id
  order by qoi.sort_order, qoi.created_at, qoi.id;

  if not found then raise exception 'La opción no tiene líneas comerciales'; end if;

  update public.agent_quotes
  set is_selected = false
  where public.agent_quotes.quotation_id = v_option.quotation_id
    and is_selected is true;

  update public.agent_quotes
  set is_selected = true
  where id = v_option.agent_quote_id
    and public.agent_quotes.quotation_id = v_option.quotation_id
    and deleted_at is null;

  if not found then raise exception 'La tarifa asociada ya no está disponible'; end if;

  update public.quotation_options
  set status = 'No seleccionada', is_recommended = false, updated_at = now()
  where public.quotation_options.quotation_id = v_option.quotation_id
    and id <> v_option.id
    and status in ('Borrador', 'Ofrecida');

  update public.quotation_options
  set status = 'Aceptada', accepted_by = v_user_id,
      accepted_at = now(), updated_at = now()
  where id = v_option.id;

  update public.quotations
  set preferred_carrier = v_option.carrier,
      transit_time = v_option.transit_time,
      transshipment = v_option.transshipment,
      valid_until = v_option.valid_until,
      total_cost = v_option.cost_total,
      total_sale = v_option.sale_subtotal,
      profit_amount = v_option.profit_amount,
      gp_percentage = v_option.gp_percentage
  where id = v_option.quotation_id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'quotations', 'quotation_option_accepted', 'quotation',
    v_option.quotation_id,
    'Cliente seleccionó la opción ' || v_option.option_code || ' - ' || v_option.label,
    jsonb_build_object(
      'quotation_option_id', v_option.id,
      'option_code', v_option.option_code,
      'agent_quote_id', v_option.agent_quote_id,
      'carrier', v_option.carrier,
      'grand_total', v_option.grand_total,
      'currency', v_option.currency
    )
  );

  return query select v_option.quotation_id, v_option.id, v_option.option_code,
    v_option.agent_quote_id, v_option.grand_total;
end;
$$;

create or replace function public.guard_shipping_instruction_commercial_option()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_option_id uuid;
begin
  if new.quotation_id is null then return new; end if;

  if exists (
    select 1 from public.quotation_options qo
    where qo.quotation_id = new.quotation_id
  ) then
    select qo.id into v_option_id
    from public.quotation_options qo
    where qo.quotation_id = new.quotation_id and qo.status = 'Aceptada'
    limit 1;

    if v_option_id is null then
      raise exception 'Registra la opción elegida por el cliente antes de crear el shipment';
    end if;

    if new.quotation_option_id is not null and new.quotation_option_id <> v_option_id then
      raise exception 'La opción comercial no coincide con la opción aceptada';
    end if;

    new.quotation_option_id := v_option_id;
  end if;

  return new;
end;
$$;

create or replace function public.guard_quotation_won_commercial_option()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Ganada'
    and old.status is distinct from 'Ganada'
    and exists (
      select 1 from public.quotation_options qo
      where qo.quotation_id = new.id
    )
    and not exists (
      select 1 from public.quotation_options qo
      where qo.quotation_id = new.id and qo.status = 'Aceptada'
    ) then
    raise exception 'Selecciona la opción elegida por el cliente antes de marcar la cotización como Ganada';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shipping_instruction_commercial_option_trigger
  on public.shipping_instructions;
create trigger guard_shipping_instruction_commercial_option_trigger
before insert or update of quotation_id on public.shipping_instructions
for each row execute function public.guard_shipping_instruction_commercial_option();

drop trigger if exists guard_quotation_won_commercial_option_trigger
  on public.quotations;
create trigger guard_quotation_won_commercial_option_trigger
before update of status on public.quotations
for each row execute function public.guard_quotation_won_commercial_option();

revoke all on function public.save_current_pricing_as_option(uuid, text, boolean, uuid)
  from public, anon;
revoke all on function public.delete_draft_quotation_option(uuid)
  from public, anon;
revoke all on function public.publish_quotation_options(uuid)
  from public, anon, authenticated;
revoke all on function public.send_quotation_with_options(uuid)
  from public, anon;
revoke all on function public.accept_quotation_option(uuid)
  from public, anon;

grant execute on function public.save_current_pricing_as_option(uuid, text, boolean, uuid)
  to authenticated;
grant execute on function public.delete_draft_quotation_option(uuid)
  to authenticated;
grant execute on function public.send_quotation_with_options(uuid)
  to authenticated;
grant execute on function public.accept_quotation_option(uuid)
  to authenticated;

comment on table public.quotation_options is
  'Snapshots comerciales alternativos de una cotización; solo una opción puede ser aceptada.';
comment on table public.quotation_option_items is
  'Líneas comerciales congeladas por opción. No alimentan operación ni facturación hasta ser aceptadas.';
comment on column public.pricing_items.source_option_item_id is
  'Trazabilidad hacia la línea de la opción comercial aceptada.';
comment on column public.shipping_instructions.quotation_option_id is
  'Opción comercial aceptada que originó la instrucción y el shipment.';
