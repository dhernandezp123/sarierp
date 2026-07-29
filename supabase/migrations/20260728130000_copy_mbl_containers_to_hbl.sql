create or replace function public.copy_parent_bl_containers_to_hbl()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bills_of_lading parent_bl
    where parent_bl.id = new.parent_bl_id
      and parent_bl.bl_type = 'MBL'
      and parent_bl.booking_id = new.booking_id
  ) then
    raise exception
      'El HBL debe pertenecer a un MBL del mismo booking'
      using errcode = '23514';
  end if;

  insert into public.bl_containers (
    bl_id,
    container_number,
    seal_number,
    container_type,
    quantity,
    gross_weight_kg,
    measurement_cbm,
    notes
  )
  select
    new.id,
    parent_container.container_number,
    parent_container.seal_number,
    parent_container.container_type,
    parent_container.quantity,
    parent_container.gross_weight_kg,
    parent_container.measurement_cbm,
    parent_container.notes
  from public.bl_containers parent_container
  where parent_container.bl_id = new.parent_bl_id
  order by parent_container.created_at, parent_container.id;

  return new;
end;
$$;

revoke all on function public.copy_parent_bl_containers_to_hbl() from public;

drop trigger if exists copy_parent_bl_containers_to_hbl
on public.bills_of_lading;

create trigger copy_parent_bl_containers_to_hbl
after insert on public.bills_of_lading
for each row
when (new.bl_type = 'HBL' and new.parent_bl_id is not null)
execute function public.copy_parent_bl_containers_to_hbl();

comment on function public.copy_parent_bl_containers_to_hbl() is
  'Copia atomically los contenedores del MBL padre cuando se crea un HBL del mismo booking.';
