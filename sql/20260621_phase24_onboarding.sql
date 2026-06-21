-- Phase 24: Tutorial de onboarding por perfil + plantilla de correo

-- Track whether each user has completed the onboarding tutorial
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT false;

-- Email template for sending quotations to clients
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS plantilla_cotizacion TEXT;
