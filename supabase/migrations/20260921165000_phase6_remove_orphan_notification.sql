-- The legacy schema allowed internal notifications without a recipient. Such a
-- row is unreachable by every user and cannot receive tenant ownership.

do $phase6_remove_orphan_notification$
declare
  v_orphan_count bigint;
begin
  select count(*)
  into v_orphan_count
  from public.notifications notification
  where notification.user_id is null;

  if v_orphan_count > 1 then
    raise exception
      'Se esperaban como maximo 1 notificacion legacy sin destinatario; se encontraron %',
      v_orphan_count;
  end if;

  delete from public.notifications notification
  where notification.user_id is null;

  raise notice 'Notificaciones legacy sin destinatario eliminadas: %', v_orphan_count;
end
$phase6_remove_orphan_notification$;
