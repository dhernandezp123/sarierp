-- Automatiza las notificaciones de tarifas seleccionadas vencidas.
-- Horario: 06:00 America/Guatemala (12:00 UTC), todos los dias.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.notify_expired_selected_agent_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('notify_expired_selected_agent_quotes')) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE rol = 'Pricing'
      AND is_active = true
      AND status = 'Aprobado'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT
    p.id,
    'Tarifa vencida en cotizacion activa',
    'La tarifa seleccionada de la cotizacion '
      || COALESCE(q.quotation_number, q.id::text)
      || ' vencio el '
      || to_char(aq.valid_until, 'DD/MM/YYYY')
      || '. Actualizar antes de aprobar.',
    'warning'
  FROM public.agent_quotes aq
  JOIN public.quotations q ON q.id = aq.quotation_id
  CROSS JOIN public.profiles p
  WHERE aq.valid_until < current_date
    AND aq.is_selected = true
    AND aq.expiry_notified_at IS NULL
    AND q.status = 'Cotizada'
    AND p.rol = 'Pricing'
    AND p.is_active = true
    AND p.status = 'Aprobado';

  UPDATE public.agent_quotes aq
  SET expiry_notified_at = now()
  FROM public.quotations q
  WHERE q.id = aq.quotation_id
    AND aq.valid_until < current_date
    AND aq.is_selected = true
    AND aq.expiry_notified_at IS NULL
    AND q.status = 'Cotizada';
END;
$$;

REVOKE ALL ON FUNCTION public.notify_expired_selected_agent_quotes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_expired_selected_agent_quotes() TO service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'notify-expired-selected-agent-quotes'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'notify-expired-selected-agent-quotes',
    '0 12 * * *',
    'SELECT public.notify_expired_selected_agent_quotes();'
  );
END;
$$;
