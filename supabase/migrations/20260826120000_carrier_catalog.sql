-- Navieras y carriers editables, incluidos sus colores de badge.
CREATE TABLE IF NOT EXISTS public.carrier_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('ocean', 'air', 'ground')),
  bg_color text NOT NULL CHECK (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text NOT NULL CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier_catalog_select_internal" ON public.carrier_catalog
  FOR SELECT TO authenticated USING (public.is_approved_active_user());
CREATE POLICY "carrier_catalog_insert_pricing" ON public.carrier_catalog
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_pricing_catalogs());
CREATE POLICY "carrier_catalog_update_pricing" ON public.carrier_catalog
  FOR UPDATE TO authenticated USING (public.can_manage_pricing_catalogs())
  WITH CHECK (public.can_manage_pricing_catalogs());

GRANT ALL ON TABLE public.carrier_catalog TO authenticated;
GRANT ALL ON TABLE public.carrier_catalog TO service_role;

INSERT INTO public.carrier_catalog (code, name, type, bg_color, text_color, sort_order) VALUES
('HPL','Hapag-Lloyd','ocean','#F47920','#FFFFFF',10), ('MSC','MSC','ocean','#D1A700','#000000',20),
('MSK','Maersk','ocean','#42B0D5','#FFFFFF',30), ('CMA','CMA CGM','ocean','#E30613','#FFFFFF',40),
('EVG','Evergreen','ocean','#007A3D','#FFFFFF',50), ('COSCO','COSCO','ocean','#00508F','#FFFFFF',60),
('OOCL','OOCL','ocean','#E30613','#FFFFFF',70), ('ONE','Ocean Network Express','ocean','#E5007E','#FFFFFF',80),
('YML','Yang Ming','ocean','#003087','#FFFFFF',90), ('HMM','HMM','ocean','#0057A8','#FFFFFF',100),
('ZIM','ZIM','ocean','#00205B','#FFFFFF',110), ('PIL','Pacific International Lines','ocean','#E87722','#FFFFFF',120),
('WHL','Wan Hai Lines','ocean','#C41230','#FFFFFF',130), ('SVL','ServiPort Marine','ocean','#FFB500','#FFFFFF',140),
('LH','Lufthansa Cargo','air','#05164D','#F9BA00',210), ('AA','American Airlines Cargo','air','#B11116','#FFFFFF',220),
('UA','United Cargo','air','#002244','#FFFFFF',230), ('EK','Emirates SkyCargo','air','#D71921','#FFFFFF',240),
('QR','Qatar Airways Cargo','air','#5C0631','#FFFFFF',250), ('CX','Cathay Pacific Cargo','air','#006564','#FFFFFF',260),
('FX','FedEx','air','#4D148C','#FF6600',270), ('5X','UPS Airlines','air','#351C15','#FFB500',280),
('DHL','DHL Express','ground','#FFCC00','#D40511',310), ('KING','King Logistics','ground','#1E3A5F','#FFFFFF',320)
ON CONFLICT (code) DO NOTHING;
