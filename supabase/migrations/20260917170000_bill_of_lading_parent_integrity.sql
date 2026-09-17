-- Enforce the MBL -> HBL hierarchy without restricting legitimate document overrides.

create or replace function public.validate_bill_of_lading_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.bills_of_lading%rowtype;
begin
  if tg_op = 'UPDATE'
     and new.parent_bl_id is not distinct from old.parent_bl_id
     and new.booking_id is not distinct from old.booking_id
     and new.bl_type is not distinct from old.bl_type
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.bl_type = 'MBL' then
    if new.parent_bl_id is not null then
      raise exception 'Un MBL no puede pertenecer a otro BL'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.parent_bl_id is null then
    raise exception 'El HBL debe pertenecer a un MBL del mismo booking'
      using errcode = '23514';
  end if;

  select parent_bl.*
  into v_parent
  from public.bills_of_lading parent_bl
  where parent_bl.id = new.parent_bl_id;

  if not found
     or v_parent.bl_type <> 'MBL'
     or v_parent.booking_id <> new.booking_id then
    raise exception 'El HBL debe pertenecer a un MBL del mismo booking'
      using errcode = '23514';
  end if;

  if new.status <> 'HBL Draft' and v_parent.status <> 'MBL Validado' then
    raise exception 'El MBL padre debe estar validado antes de avanzar el HBL'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_bill_of_lading_parent()
from public, anon, authenticated;

drop trigger if exists validate_bill_of_lading_parent
on public.bills_of_lading;

create trigger validate_bill_of_lading_parent
before insert or update on public.bills_of_lading
for each row
execute function public.validate_bill_of_lading_parent();

comment on function public.validate_bill_of_lading_parent() is
  'Garantiza que cada HBL pertenezca a un MBL del mismo booking y que el MBL este validado antes de avanzar el HBL.';
