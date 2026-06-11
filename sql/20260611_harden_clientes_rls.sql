create or replace function public.can_select_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_cliente_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Ventas', 'Pricing']) then exists (
        select 1
        from public.clientes c
        where c.id = p_cliente_id
          and c.deleted_at is null
      )
      when public.is_role(array['Operaciones']) then exists (
        select 1
        from public.clientes c
        join public.quotations q on q.cliente_id = c.id
        join public.shipping_instructions si on si.quotation_id = q.id
        where c.id = p_cliente_id
          and c.deleted_at is null
          and q.deleted_at is null
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.clientes c
        join public.quotations q on q.cliente_id = c.id
        left join public.shipping_instructions si on si.quotation_id = q.id
        where c.id = p_cliente_id
          and c.deleted_at is null
          and q.deleted_at is null
          and (
            q.status = 'Ganada'
            or si.id is not null
          )
      )
      else false
    end
$$;

create or replace function public.can_update_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
        and c.deleted_at is null
    )
$$;

create or replace function public.can_delete_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
    )
$$;

alter table public.clientes enable row level security;

drop policy if exists "clientes_select_policy" on public.clientes;
drop policy if exists "clientes_insert_policy" on public.clientes;
drop policy if exists "clientes_update_policy" on public.clientes;
drop policy if exists "clientes_delete_policy" on public.clientes;

drop policy if exists "clientes_select_authenticated" on public.clientes;
drop policy if exists "clientes_insert_authenticated" on public.clientes;
drop policy if exists "clientes_update_authenticated" on public.clientes;
drop policy if exists "clientes_delete_authenticated" on public.clientes;

drop policy if exists "Allow read clientes" on public.clientes;
drop policy if exists "Allow manage clientes" on public.clientes;

create policy "clientes_select_policy"
on public.clientes
for select
to authenticated
using (
  public.can_select_cliente(id)
);

create policy "clientes_insert_policy"
on public.clientes
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Ventas'])
);

create policy "clientes_update_policy"
on public.clientes
for update
to authenticated
using (
  public.can_update_cliente(id)
)
with check (
  public.is_approved_active_user()
  and (
    public.is_admin()
    or (
      public.is_role(array['Ventas'])
      and deleted_at is null
    )
  )
);

create policy "clientes_delete_policy"
on public.clientes
for delete
to authenticated
using (
  public.can_delete_cliente(id)
);

notify pgrst, 'reload schema';
