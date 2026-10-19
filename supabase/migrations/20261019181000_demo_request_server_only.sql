-- Phase 2: apply after the frontend uses /api/demo-request in Production.
-- Sales continues to read leads; public writes must pass through the server.
revoke insert on public.leads from public, anon, authenticated;
drop policy if exists leads_insert_public on public.leads;
