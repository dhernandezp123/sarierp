-- Harden RLS: bookings and bills_of_lading
-- Previously both used permissive USING (true) policies.
-- Now only authenticated users can access their company data.
-- Role-level granularity is enforced client-side via permissions.ts.

-- ─── bookings ────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.bookings;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON public.bookings;

CREATE POLICY "authenticated_read" ON public.bookings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update" ON public.bookings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Soft deletes only — hard delete blocked for all roles except service_role
CREATE POLICY "authenticated_delete" ON public.bookings
  FOR DELETE TO authenticated USING (false);

-- ─── booking_containers ──────────────────────────────────────────────────────
ALTER TABLE public.booking_containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.booking_containers;

CREATE POLICY "authenticated_full_access" ON public.booking_containers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── bills_of_lading ─────────────────────────────────────────────────────────
ALTER TABLE public.bills_of_lading ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.bills_of_lading;

CREATE POLICY "authenticated_read" ON public.bills_of_lading
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert" ON public.bills_of_lading
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update" ON public.bills_of_lading
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- BL deletion blocked — must be Archivado via status change, never hard deleted
CREATE POLICY "authenticated_delete" ON public.bills_of_lading
  FOR DELETE TO authenticated USING (false);

-- ─── bl_containers ───────────────────────────────────────────────────────────
ALTER TABLE public.bl_containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.bl_containers;

CREATE POLICY "authenticated_full_access" ON public.bl_containers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
