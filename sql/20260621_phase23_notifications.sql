-- Phase 23: Notificaciones operacionales automáticas
-- Tracks whether an expired agent_quote has already triggered a notification
-- to avoid sending duplicates on every page load

ALTER TABLE public.agent_quotes
  ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ;
