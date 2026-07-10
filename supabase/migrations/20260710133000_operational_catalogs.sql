-- Catalogos operativos editables para evitar listas hardcodeadas en flujos de pricing.
-- Se siembran con los valores actuales del ERP para mantener compatibilidad.

CREATE TABLE IF NOT EXISTS "public"."service_products" (
  "value" text PRIMARY KEY,
  "label" text NOT NULL,
  "applies_client_rates" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."client_rate_catalog" (
  "code" text PRIMARY KEY,
  "label" text NOT NULL,
  "category" text NOT NULL,
  "unit" text,
  "is_destination_rate" boolean NOT NULL DEFAULT false,
  "is_optional_charge" boolean NOT NULL DEFAULT false,
  "optional_item_type" text,
  "taxable" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."service_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."client_rate_catalog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_products_select_internal" ON "public"."service_products";
DROP POLICY IF EXISTS "service_products_insert_pricing" ON "public"."service_products";
DROP POLICY IF EXISTS "service_products_update_pricing" ON "public"."service_products";
DROP POLICY IF EXISTS "client_rate_catalog_select_internal" ON "public"."client_rate_catalog";
DROP POLICY IF EXISTS "client_rate_catalog_insert_pricing" ON "public"."client_rate_catalog";
DROP POLICY IF EXISTS "client_rate_catalog_update_pricing" ON "public"."client_rate_catalog";

CREATE POLICY "service_products_select_internal" ON "public"."service_products"
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

CREATE POLICY "service_products_insert_pricing" ON "public"."service_products"
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pricing_catalogs());

CREATE POLICY "service_products_update_pricing" ON "public"."service_products"
  FOR UPDATE TO authenticated
  USING (public.can_manage_pricing_catalogs())
  WITH CHECK (public.can_manage_pricing_catalogs());

CREATE POLICY "client_rate_catalog_select_internal" ON "public"."client_rate_catalog"
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

CREATE POLICY "client_rate_catalog_insert_pricing" ON "public"."client_rate_catalog"
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pricing_catalogs());

CREATE POLICY "client_rate_catalog_update_pricing" ON "public"."client_rate_catalog"
  FOR UPDATE TO authenticated
  USING (public.can_manage_pricing_catalogs())
  WITH CHECK (public.can_manage_pricing_catalogs());

GRANT ALL ON TABLE "public"."service_products" TO authenticated;
GRANT ALL ON TABLE "public"."service_products" TO service_role;
GRANT ALL ON TABLE "public"."client_rate_catalog" TO authenticated;
GRANT ALL ON TABLE "public"."client_rate_catalog" TO service_role;

INSERT INTO "public"."service_products"
  ("value", "label", "applies_client_rates", "active", "sort_order")
VALUES
  ('miami_lcl', 'Miami Consolidado Marítimo LCL', true, true, 10),
  ('miami_air', 'Miami Consolidado Aéreo', true, true, 20),
  ('other_origin_fcl', 'FCL Otros Orígenes', false, true, 30),
  ('other_origin_lcl', 'LCL Otros Orígenes', false, true, 40),
  ('other_origin_air', 'Aéreo Consolidado', false, true, 50),
  ('usa_ltl_ftl', 'LTL / FTL USA', false, true, 60),
  ('courier', 'Courier', false, true, 70)
ON CONFLICT ("value") DO UPDATE SET
  "label" = EXCLUDED."label",
  "applies_client_rates" = EXCLUDED."applies_client_rates",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();

INSERT INTO "public"."client_rate_catalog"
  ("code", "label", "category", "unit", "is_destination_rate", "is_optional_charge", "optional_item_type", "taxable", "active", "sort_order")
VALUES
  ('small_maritimo_min_lcl_1000_lbs_45_ft3', 'Small Mínimo LCL 1000 lbs / 45 ft3', 'Small Marítimo', 'flat', true, false, null, false, true, 10),
  ('minimo_maritimo_2mil_lbs_90_ft3', 'Mínimo LCL 2 mil lbs / 90 ft3', 'Mínimo Marítimo', 'flat', true, false, null, false, true, 20),
  ('lcl_maritimo_sps_ft3', 'LCL Marítimo SPS - FT3', 'LCL Marítimo', 'FT3', true, false, null, false, true, 30),
  ('lcl_maritimo_sps_lbs', 'LCL Marítimo SPS - LBS', 'LCL Marítimo', 'LBS', true, false, null, false, true, 40),
  ('consolidado_aereo_kg', 'Consolidado Aéreo - KG', 'Consolidado Aéreo', 'KG', true, false, null, false, true, 50),
  ('delivery_miami', 'DELIVERY / Miami', 'Consolidado Aéreo', 'flat', false, false, null, false, true, 60),
  ('documentos_manejo', 'Documentos / Manejo', 'Otros Cargos', 'flat', false, false, null, false, true, 70),
  ('desconsolidar', 'Desconsolidación', 'Otros Cargos', 'flat', false, false, null, false, true, 80),
  ('bl', 'BL', 'Otros Cargos', 'flat', false, false, null, false, true, 90),
  ('guia', 'Guía', 'Otros Cargos', 'flat', false, false, null, false, true, 100),
  ('sed', 'SED', 'Otros Cargos', 'flat', false, false, null, false, true, 110),
  ('recolectas_internas', 'Recolectas Internas', 'Otros Cargos', 'flat', false, false, null, false, true, 120),
  ('fumigacion', 'Fumigación', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 130),
  ('pallet_embalaje', 'Pallet Embalaje', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 140),
  ('segregacion', 'Segregación', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 150),
  ('in_and_out', 'In and Out', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 160),
  ('equipo_especial', 'Equipo Especial', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 170),
  ('oversize', 'Oversize', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 180),
  ('embalaje_madera', 'Embalaje Madera', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 190),
  ('hazmat_imo_charge_line', 'Hazmat IMO Charge Line', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 200),
  ('declaracion_imo', 'Declaración IMO', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 210),
  ('certificado_imo', 'Certificado IMO', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 220),
  ('bonded_fcl_proveedor', 'Bonded FCL Proveedor', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 230),
  ('bonded_documentacion_7512', 'Bonded Documentación 7512', 'Otros Cargos', 'flat', false, true, 'origin_charge', false, true, 240)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit",
  "is_destination_rate" = EXCLUDED."is_destination_rate",
  "is_optional_charge" = EXCLUDED."is_optional_charge",
  "optional_item_type" = EXCLUDED."optional_item_type",
  "taxable" = EXCLUDED."taxable",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();
