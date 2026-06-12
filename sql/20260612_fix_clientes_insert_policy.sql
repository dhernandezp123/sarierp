create or replace function public.can_insert_cliente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'Aprobado') = 'Aprobado'
      and p.rol in ('Admin', 'Ventas')
  );
$$;

drop policy if exists "clientes_insert_policy" on public.clientes;

create policy "clientes_insert_policy"
on public.clientes
for insert
to authenticated
with check (
  public.can_insert_cliente()
);

notify pgrst, 'reload schema';
