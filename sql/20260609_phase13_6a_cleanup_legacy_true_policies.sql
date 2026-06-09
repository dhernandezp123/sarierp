-- =========================================================
-- FASE 13.6A
-- Limpieza defensiva de policies legacy permisivas superpuestas
-- =========================================================
--
-- Policies legacy identificadas con using(true) / with check(true):
-- - public.bookings: policies MVP de Fase 1
-- - public.booking_containers: policies MVP de Fase 1
-- - public.booking_documents: policies MVP de Fase 8
--
-- No se tocan en esta fase porque no tienen hardening superpuesto en el repo:
-- - public.surcharge_rules
-- - public.quotation_cargo_lines
-- - public.shipping_instruction_events
--
-- Esta migracion no cambia la logica de negocio vigente de Fase 13.3:
-- solo elimina una policy permisiva si para la misma tabla y comando ya existe
-- otra policy no permisiva. Si la policy legacy es la unica, se conserva.

drop policy if exists "pricing_items_select_authenticated" on public.pricing_items;

drop policy if exists "Authenticated access agent quotes" on public.agent_quotes;

drop policy if exists "clientes_update_authenticated" on public.clientes;

drop policy if exists "profiles_select_basic_authenticated" on public.profiles;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select
      legacy.schemaname,
      legacy.tablename,
      legacy.policyname,
      legacy.cmd
    from pg_policies legacy
    where legacy.schemaname = 'public'
      and legacy.tablename in (
        'bookings',
        'booking_containers',
        'booking_documents'
      )
      and (
        coalesce(legacy.qual, '') = 'true'
        or coalesce(legacy.with_check, '') = 'true'
      )
      and exists (
        select 1
        from pg_policies hardened
        where hardened.schemaname = legacy.schemaname
          and hardened.tablename = legacy.tablename
          and hardened.cmd = legacy.cmd
          and hardened.policyname <> legacy.policyname
          and coalesce(hardened.qual, '') <> 'true'
          and coalesce(hardened.with_check, '') <> 'true'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
