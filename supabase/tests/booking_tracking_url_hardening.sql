\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'bookings'
      and c.conname = 'bookings_tracking_url_http_check'
      and c.contype = 'c'
  ),
  'bookings debe tener el check de tracking URL'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_trigger trigger_definition
    where trigger_definition.tgrelid = 'public.bookings'::regclass
      and trigger_definition.tgname = 'prevent_demo_booking_tracking_url_change_trigger'
      and not trigger_definition.tgisinternal
  ),
  'bookings debe bloquear cambios de tracking realizados por usuarios demo'
);

select pg_temp.assert_true(
  'https://tracking.example.test/container/ABC?lang=es'
    ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$',
  'Una URL HTTPS normal debe ser aceptada'
);

select pg_temp.assert_true(
  not ('javascript:alert(1)'
    ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'),
  'javascript: debe ser rechazado'
);

select pg_temp.assert_true(
  not ('https://usuario:secreto@example.test/path'
    ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'),
  'Las URLs con credenciales deben ser rechazadas'
);

select pg_temp.assert_true(
  not ('https://example.test/ruta con espacio'
    ~* '^https?://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'),
  'Los espacios y caracteres de control deben ser rechazados'
);

rollback;

\echo 'booking_tracking_url_hardening.sql: OK'
