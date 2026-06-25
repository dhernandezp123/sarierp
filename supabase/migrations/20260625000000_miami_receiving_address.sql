-- Add Miami receiving address template to company_settings
-- These fields define the warehouse address shown to clients in the portal.
-- The client's codigo_cliente is appended after miami_suite_prefix to form the suite line.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS miami_consignee      text,
  ADD COLUMN IF NOT EXISTS miami_address_line   text,
  ADD COLUMN IF NOT EXISTS miami_suite_prefix   text,
  ADD COLUMN IF NOT EXISTS miami_city           text DEFAULT 'Miami',
  ADD COLUMN IF NOT EXISTS miami_state          text DEFAULT 'FL',
  ADD COLUMN IF NOT EXISTS miami_zip            text,
  ADD COLUMN IF NOT EXISTS miami_country        text DEFAULT 'USA',
  ADD COLUMN IF NOT EXISTS miami_phone          text;
