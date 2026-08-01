-- Los enlaces de tracking se comparten con clientes y deben usar un esquema
-- navegable seguro. Se normalizan filas legacy antes de activar la constraint
-- para no dejar URLs peligrosas ni bloquear futuras ediciones del booking.

update public.bookings
set tracking_url = case
  when btrim(tracking_url)
    ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'
    then btrim(tracking_url)
  else null
end
where tracking_url is not null
  and tracking_url is distinct from case
    when btrim(tracking_url)
      ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'
      then btrim(tracking_url)
    else null
  end;

alter table public.bookings
  drop constraint if exists bookings_tracking_url_http_check;

alter table public.bookings
  add constraint bookings_tracking_url_http_check
  check (
    tracking_url is null
    or (
      tracking_url = btrim(tracking_url)
      and tracking_url ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'
    )
  );

create or replace function public.prevent_demo_booking_tracking_url_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Migraciones, reset y tareas de backend confiables no tienen UID de usuario.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_restricted_demo_context()
    and (
      (tg_op = 'INSERT' and new.tracking_url is not null)
      or (
        tg_op = 'UPDATE'
        and new.tracking_url is distinct from old.tracking_url
      )
    )
  then
    raise exception 'Los enlaces externos de tracking estan bloqueados en el ambiente demo'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_demo_booking_tracking_url_change_trigger
  on public.bookings;
create trigger prevent_demo_booking_tracking_url_change_trigger
before insert or update of tracking_url on public.bookings
for each row execute function public.prevent_demo_booking_tracking_url_change();

revoke all on function public.prevent_demo_booking_tracking_url_change()
  from public, anon, authenticated;
