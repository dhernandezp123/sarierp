


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role" AS ENUM (
    'Admin',
    'Ventas',
    'Operaciones',
    'Pricing',
    'Contabilidad'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_match_pre_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_alert RECORD;
  v_wh    TEXT;
BEGIN
  -- Skip if already assigned or no tracking
  IF NEW.tracking_number IS NULL OR NEW.cliente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find oldest pending pre-alert with same tracking
  SELECT * INTO v_alert
  FROM miami_pre_alerts
  WHERE tracking_number = NEW.tracking_number
    AND status = 'Pendiente'
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Generate warehouse number
  v_wh := next_warehouse_number();

  -- Assign to client
  NEW.cliente_id       := v_alert.cliente_id;
  NEW.warehouse_number := v_wh;
  NEW.status           := 'Asignado';
  NEW.assigned_at      := now();

  -- Close the pre-alert
  UPDATE miami_pre_alerts
  SET status = 'Recibido', matched_package_id = NEW.id
  WHERE id = v_alert.id;

  -- In-app notification to client portal profile
  INSERT INTO client_notifications (profile_id, title, body, type, entity_type, entity_id)
  SELECT p.id,
    'Paquete recibido en bodega',
    'Tu paquete ' || NEW.tracking_number || ' llegó a bodega Miami. Número asignado: ' || v_wh || '.',
    'paquete',
    'miami_packages',
    NEW.id
  FROM profiles p
  WHERE p.cliente_id = v_alert.cliente_id
    AND p.rol = 'Cliente'
  LIMIT 1;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_match_pre_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_id_from_storage_object_name"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  first_segment text;
begin
  first_segment := nullif(split_part(coalesce(p_name, ''), '/', 1), '');

  if first_segment is null then
    return null;
  end if;

  begin
    return first_segment::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;


ALTER FUNCTION "public"."booking_id_from_storage_object_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_package_volume"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.length_in IS NOT NULL AND NEW.width_in IS NOT NULL AND NEW.height_in IS NOT NULL THEN
    NEW.ft3  := round((NEW.length_in * NEW.width_in * NEW.height_in) / 1728.0, 4);
    NEW.cbm  := round((NEW.length_in * NEW.width_in * NEW.height_in) * 0.000016387064, 6);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calc_package_volume"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_bill_of_lading"("p_bl_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.can_manage_operations()
    and exists (
      select 1
      from public.bills_of_lading bl
      where bl.id = p_bl_id
    )
$$;


ALTER FUNCTION "public"."can_access_bill_of_lading"("p_bl_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_invoice"("p_invoice_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.can_manage_finance()
    and exists (
      select 1
      from public.invoices i
      where i.id = p_invoice_id
        and i.deleted_at is null
    )
$$;


ALTER FUNCTION "public"."can_access_invoice"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_delete_cliente"("p_cliente_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_admin()
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
    )
$$;


ALTER FUNCTION "public"."can_delete_cliente"("p_cliente_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_delete_quotation"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_admin()
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
    )
$$;


ALTER FUNCTION "public"."can_delete_quotation"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_insert_cliente"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'Aprobado') = 'Aprobado'
      and p.rol in ('Admin', 'Ventas')
  );
$$;


ALTER FUNCTION "public"."can_insert_cliente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_insert_shipping_instruction"("p_quotation_id" "uuid", "p_created_by" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_quotation_id is null then false
      when p_created_by is distinct from auth.uid() then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_insert_shipping_instruction"("p_quotation_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_cost_validation"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
$$;


ALTER FUNCTION "public"."can_manage_cost_validation"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_finance"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_role(array['Admin', 'Finanzas', 'Contabilidad'])
$$;


ALTER FUNCTION "public"."can_manage_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_operations"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_role(array['Admin', 'Operaciones'])
$$;


ALTER FUNCTION "public"."can_manage_operations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_pricing_catalogs"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_role(array['Admin', 'Pricing'])
$$;


ALTER FUNCTION "public"."can_manage_pricing_catalogs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_provider_invoice_item"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
$$;


ALTER FUNCTION "public"."can_manage_provider_invoice_item"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_booking"("p_booking_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        public.is_admin_or_operations()
        or public.is_sales_owner_of_shipping_instruction(b.shipping_instruction_id)
      )
  )
$$;


ALTER FUNCTION "public"."can_select_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_cliente"("p_cliente_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_cliente_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Ventas', 'Pricing']) then exists (
        select 1
        from public.clientes c
        where c.id = p_cliente_id
          and c.deleted_at is null
      )
      when public.is_role(array['Operaciones']) then exists (
        select 1
        from public.clientes c
        join public.quotations q on q.cliente_id = c.id
        join public.shipping_instructions si on si.quotation_id = q.id
        where c.id = p_cliente_id
          and c.deleted_at is null
          and q.deleted_at is null
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.clientes c
        join public.quotations q on q.cliente_id = c.id
        left join public.shipping_instructions si on si.quotation_id = q.id
        where c.id = p_cliente_id
          and c.deleted_at is null
          and q.deleted_at is null
          and (
            q.status = 'Ganada'
            or si.id is not null
          )
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_select_cliente"("p_cliente_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_provider_invoice_item"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
$$;


ALTER FUNCTION "public"."can_select_provider_invoice_item"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_quotation"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Operaciones']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and exists (
            select 1
            from public.shipping_instructions si
            where si.quotation_id = q.id
          )
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and (
            q.status = 'Ganada'
            or exists (
              select 1
              from public.shipping_instructions si
              where si.quotation_id = q.id
            )
          )
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_select_quotation"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_quotation_row"("p_quotation_id" "uuid", "p_status" "text", "p_deleted_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when p_deleted_at is not null then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then true
      when public.is_role(array['Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.quotation_id = p_quotation_id
      )
      when public.is_role(array['Contabilidad']) then (
        p_status = 'Ganada'
        or exists (
          select 1
          from public.shipping_instructions si
          where si.quotation_id = p_quotation_id
        )
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_select_quotation_row"("p_quotation_id" "uuid", "p_status" "text", "p_deleted_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_select_shipping_instruction"("p_shipping_instruction_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_shipping_instruction_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
      )
      when public.is_role(array['Pricing']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        left join public.clientes c on c.id = q.cliente_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and (
            si.created_by = auth.uid()
            or q.created_by = auth.uid()
            or c.vendedor_asignado = auth.uid()
          )
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_select_shipping_instruction"("p_shipping_instruction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_update_cliente"("p_cliente_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Ventas'])
    and exists (
      select 1
      from public.clientes c
      where c.id = p_cliente_id
        and c.deleted_at is null
    )
$$;


ALTER FUNCTION "public"."can_update_cliente"("p_cliente_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_update_quotation"("p_quotation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_update_quotation"("p_quotation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_update_shipping_instruction"("p_shipping_instruction_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_shipping_instruction_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      when public.is_role(array['Pricing']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
          and si.created_by = auth.uid()
          and si.sales_submitted_at is null
          and si.operational_status = 'Pendiente Validación'
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      else false
    end
$$;


ALTER FUNCTION "public"."can_update_shipping_instruction"("p_shipping_instruction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_cliente_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT cliente_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."current_user_cliente_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true) = true
    and coalesce(p.status, 'Aprobado') = 'Aprobado'
  limit 1
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_cliente_codigo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.codigo_cliente is null then
    new.codigo_cliente := 'CLI-' || lpad(nextval('clientes_codigo_seq')::text, 5, '0');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."generate_cliente_codigo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_quotation_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  seller_initials text;
begin
  select
    upper(
      left(coalesce(p.nombre, 'X'), 1) ||
      left(coalesce(p.apellido, 'X'), 1)
    )
  into seller_initials
  from public.profiles p
  where p.id = new.created_by;

  if seller_initials is null then
    seller_initials := 'XX';
  end if;

  if new.quotation_number is null then
    new.quotation_number :=
      'SARIHN-' ||
      to_char(now(), 'YYMM') ||
      '-' ||
      lpad(nextval('public.quotation_number_seq')::text, 4, '0') ||
      '-' ||
      seller_initials;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."generate_quotation_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_routing_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.routing_number is null or new.routing_number = '' then
    new.routing_number := 'RT' || lpad(nextval('routing_number_seq')::text, 4, '0');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."generate_routing_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select rol
  from profiles
  where id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_quotation_status_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.quotation_status_history (
    quotation_id,
    old_status,
    new_status,
    changed_by,
    notes
  )
  values (
    new.id,
    null,
    coalesce(new.status, 'Solicitud'),
    new.created_by,
    'Cotización creada'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_quotation_status_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, nombre, apellido, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    'Ventas'
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_role(array['Admin'])
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_operations"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(public.current_user_role() IN ('Admin', 'Operaciones'), false);
$$;


ALTER FUNCTION "public"."is_admin_or_operations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_active_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_user_role() is not null
$$;


ALTER FUNCTION "public"."is_approved_active_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_cliente"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(public.current_user_role() = 'Cliente', false);
$$;


ALTER FUNCTION "public"."is_cliente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_role"("p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(public.current_user_role() = any(p_roles), false)
$$;


ALTER FUNCTION "public"."is_role"("p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_sales_owner_of_shipping_instruction"("p_shipping_instruction_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.shipping_instructions si
    where si.id = p_shipping_instruction_id
      and si.created_by = auth.uid()
      and public.current_user_role() = 'Ventas'
  )
$$;


ALTER FUNCTION "public"."is_sales_owner_of_shipping_instruction"("p_shipping_instruction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_manifest_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  today    text := to_char(current_date, 'YYYYMMDD');
  day_count int;
BEGIN
  SELECT COUNT(*) INTO day_count
  FROM public.miami_manifests
  WHERE created_at::date = current_date;

  RETURN 'MAN-' || today || '-' || lpad((day_count + 1)::text, 3, '0');
END;
$$;


ALTER FUNCTION "public"."next_manifest_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_warehouse_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN 'SPS-' || lpad(nextval('public.miami_wh_seq')::text, 5, '0');
END;
$$;


ALTER FUNCTION "public"."next_warehouse_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_expired_selected_agent_quotes"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."notify_expired_selected_agent_quotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_change_by_non_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin

  -- Permitir INSERT libre del propio profile
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Solo validar cambios de rol en UPDATE
  if new.rol is distinct from old.rol then
    if not exists (
      select 1
      from profiles p
      where p.id = auth.uid()
      and p.rol = 'Admin'
    ) then
      raise exception 'No tienes permiso para cambiar roles';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_role_change_by_non_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_manifest_package_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.manifest_id IS NOT NULL THEN
    UPDATE public.miami_manifests
    SET total_packages = total_packages + 1
    WHERE id = NEW.manifest_id;

  ELSIF TG_OP = 'DELETE' AND OLD.manifest_id IS NOT NULL THEN
    UPDATE public.miami_manifests
    SET total_packages = GREATEST(total_packages - 1, 0)
    WHERE id = OLD.manifest_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Paquete movido de manifiesto
    IF OLD.manifest_id IS DISTINCT FROM NEW.manifest_id THEN
      IF OLD.manifest_id IS NOT NULL THEN
        UPDATE public.miami_manifests
        SET total_packages = GREATEST(total_packages - 1, 0)
        WHERE id = OLD.manifest_id;
      END IF;
      IF NEW.manifest_id IS NOT NULL THEN
        UPDATE public.miami_manifests
        SET total_packages = total_packages + 1
        WHERE id = NEW.manifest_id;
      END IF;
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_manifest_package_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."uuid_from_text"("p_value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if p_value is null then
    return null;
  end if;

  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;


ALTER FUNCTION "public"."uuid_from_text"("p_value" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "module" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "description" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_quote_container_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_quote_id" "uuid" NOT NULL,
    "quotation_container_id" "uuid",
    "container_type_name" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "ocean_freight" numeric DEFAULT 0 NOT NULL,
    "total_ocean_freight" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_quote_container_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid",
    "agente_nombre" "text",
    "costo" numeric,
    "moneda" "text" DEFAULT 'USD'::"text",
    "transit_time" "text",
    "is_selected" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "agent_id" "uuid",
    "ocean_freight" numeric DEFAULT 0,
    "exw_cost" numeric DEFAULT 0,
    "mbl_fee" numeric DEFAULT 0,
    "containers_qty" integer DEFAULT 1,
    "free_days_destination" integer DEFAULT 0,
    "carrier" "text",
    "profit_per_container" numeric DEFAULT 0,
    "suggested_sale" numeric DEFAULT 0,
    "transshipment" "text",
    "valid_until" "date",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "etd" "date",
    "rate_per_kg" numeric,
    "chargeable_weight_kg" numeric,
    "actual_weight_kg" numeric,
    "volumetric_weight_kg" numeric,
    "expiry_notified_at" timestamp with time zone
);


ALTER TABLE "public"."agent_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_route_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "origin" "text" NOT NULL,
    "destination" "text" NOT NULL,
    "carrier" "text",
    "service_type" "text" NOT NULL,
    "base_rate" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "transit_time" integer,
    "transshipment" "text",
    "free_days_destination" integer DEFAULT 14,
    "valid_from" "date",
    "valid_until" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_route_rates_service_type_check" CHECK (("service_type" = ANY (ARRAY['FCL 20'''::"text", 'FCL 40'''::"text", 'FCL 40HC'::"text", 'FCL 45HC'::"text", 'LCL'::"text", 'Aéreo'::"text", 'Aéreo Consolidado'::"text", 'Terrestre LTL'::"text", 'Terrestre FTL'::"text", 'Courier'::"text"])))
);


ALTER TABLE "public"."agent_route_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'Agente'::"text" NOT NULL,
    "country" "text",
    "city" "text",
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "profit_per_container" numeric DEFAULT 0,
    "mbl_fee" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "active" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bills_of_lading" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "shipping_instruction_id" "uuid",
    "bl_type" "text" NOT NULL,
    "parent_bl_id" "uuid",
    "bl_number" "text",
    "status" "text" DEFAULT 'MBL Draft'::"text" NOT NULL,
    "release_type" "text",
    "originals_count" integer DEFAULT 3,
    "copies_count" integer DEFAULT 3,
    "freight_terms" "text",
    "hbl_freight_visibility" "text",
    "bl_date" "date",
    "issue_date" "date",
    "release_date" "date",
    "client_approved_at" timestamp with time zone,
    "client_approved_by" "text",
    "shipper" "text",
    "shipper_address" "text",
    "consignee" "text",
    "consignee_address" "text",
    "consignee_tax_id" "text",
    "consignee_contact" "text",
    "consignee_email" "text",
    "notify_party" "text",
    "notify_party_address" "text",
    "notify_party_tax_id" "text",
    "notify_party_contact" "text",
    "notify_party_email" "text",
    "place_of_receipt" "text",
    "port_of_loading" "text",
    "port_of_discharge" "text",
    "place_of_delivery" "text",
    "carrier" "text",
    "vessel_name" "text",
    "voyage" "text",
    "etd" "date",
    "eta" "date",
    "description_of_goods" "text",
    "marks_and_numbers" "text",
    "number_of_packages" integer,
    "package_type" "text",
    "gross_weight_kg" numeric,
    "measurement_cbm" numeric,
    "special_instructions" "text",
    "printed_at_destination" boolean DEFAULT true,
    "draft_file_url" "text",
    "draft_file_name" "text",
    "created_by" "uuid",
    "issued_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "placa_camion" "text",
    "nombre_operador" "text",
    CONSTRAINT "bills_of_lading_bl_type_check" CHECK (("bl_type" = ANY (ARRAY['MBL'::"text", 'HBL'::"text"]))),
    CONSTRAINT "bills_of_lading_freight_terms_check" CHECK (("freight_terms" = ANY (ARRAY['Prepaid'::"text", 'Collect'::"text"]))),
    CONSTRAINT "bills_of_lading_hbl_freight_visibility_check" CHECK (("hbl_freight_visibility" = ANY (ARRAY['No Freight Charges'::"text", 'As Arranged'::"text", 'Freight Amount'::"text"]))),
    CONSTRAINT "bills_of_lading_release_type_check" CHECK (("release_type" = ANY (ARRAY['Express Release'::"text", 'Original BL'::"text"]))),
    CONSTRAINT "bills_of_lading_status_check" CHECK (("status" = ANY (ARRAY['MBL Draft'::"text", 'MBL Validado'::"text", 'HBL Draft'::"text", 'Pendiente Aprobación Cliente'::"text", 'Aprobado por Cliente'::"text", 'Emitido'::"text", 'Liberado'::"text", 'Archivado'::"text"])))
);


ALTER TABLE "public"."bills_of_lading" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bl_amendments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bl_id" "uuid" NOT NULL,
    "amendment_number" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "changed_fields" "jsonb",
    "status_before" "text",
    "status_after" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."bl_amendments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bl_containers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bl_id" "uuid" NOT NULL,
    "container_number" "text",
    "seal_number" "text",
    "container_type" "text",
    "quantity" integer DEFAULT 1,
    "gross_weight_kg" numeric,
    "measurement_cbm" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bl_containers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bl_draft_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bl_id" "uuid" NOT NULL,
    "sent_to" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."bl_draft_sends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_containers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "container_type" "text",
    "quantity" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."booking_containers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "notes" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."booking_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipping_instruction_id" "uuid" NOT NULL,
    "booking_number" "text",
    "carrier_booking" "text",
    "master_bl" "text",
    "house_bl" "text",
    "carrier" "text",
    "vessel_name" "text",
    "voyage" "text",
    "etd" "date",
    "eta" "date",
    "original_eta" "date",
    "actual_etd" "date",
    "actual_eta" "date",
    "tracking_url" "text",
    "shipment_status" "text" DEFAULT 'Booking Solicitado'::"text",
    "estimated_transit_days" integer,
    "real_transit_days" integer,
    "free_days" integer,
    "remaining_free_days" integer,
    "freight_terms" "text",
    "release_type" "text",
    "hbl_freight_visibility" "text",
    "printed_at_destination" boolean DEFAULT true,
    "operational_comments" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cai_ranges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cai" "text" NOT NULL,
    "rango_desde" "text" NOT NULL,
    "rango_hasta" "text" NOT NULL,
    "fecha_limite_emision" "date" NOT NULL,
    "lugar_emision" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."cai_ranges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "nombre_completo" "text",
    "company_name" "text",
    "address_line" "text",
    "suite" "text",
    "city" "text" DEFAULT 'Miami'::"text",
    "state" "text" DEFAULT 'FL'::"text",
    "zip" "text",
    "country" "text" DEFAULT 'USA'::"text",
    "phone" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'paquete'::"text", 'incidencia'::"text", 'sistema'::"text"])))
);


ALTER TABLE "public"."client_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_pickup_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "profile_id" "uuid",
    "pickup_address" "text" NOT NULL,
    "contact_name" "text",
    "contact_phone" "text",
    "scheduled_date" "date",
    "description" "text",
    "status" "text" DEFAULT 'Pendiente'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "client_pickup_requests_status_check" CHECK (("status" = ANY (ARRAY['Pendiente'::"text", 'Confirmado'::"text", 'Completado'::"text", 'Cancelado'::"text"])))
);


ALTER TABLE "public"."client_pickup_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "rate_code" "text" NOT NULL,
    "rate_label" "text" NOT NULL,
    "category" "text" NOT NULL,
    "unit" "text",
    "currency" "text" DEFAULT 'USD'::"text",
    "amount" numeric(12,2) DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "valid_from" "date",
    "valid_to" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "miami_rate_destination" "text",
    CONSTRAINT "client_rates_miami_rate_destination_check" CHECK ((("miami_rate_destination" = ANY (ARRAY['SPS'::"text", 'TGU'::"text"])) OR ("miami_rate_destination" IS NULL)))
);


ALTER TABLE "public"."client_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cliente_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "changed_by" "uuid",
    "action" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cliente_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "nit" "text",
    "direccion" "text",
    "origen_frecuente" "text",
    "asegura_carga" boolean DEFAULT false,
    "notas_tarifas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "codigo_cliente" "text",
    "telefono" "text",
    "ciudad" "text",
    "pais" "text",
    "email_1" "text",
    "email_2" "text",
    "email_3" "text",
    "observaciones" "text",
    "tipo_persona" "text" DEFAULT 'Corporativo'::"text",
    "condicion_pago" "text" DEFAULT 'Contado'::"text",
    "dias_credito" integer DEFAULT 0,
    "tipo_cliente" "text",
    "vendedor_asignado" "uuid",
    "seguro_porcentaje" numeric DEFAULT 1.00,
    "departamento_estado" "text",
    "rtn" "text",
    "contacto" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "preferred_miami_rate_destination" "text",
    "telefono_2" "text",
    "contacto_2" "text",
    "limite_credito" numeric(12,2),
    "moneda_credito" "text" DEFAULT 'USD'::"text",
    CONSTRAINT "clientes_preferred_miami_rate_destination_check" CHECK ((("preferred_miami_rate_destination" = ANY (ARRAY['SPS'::"text", 'TGU'::"text"])) OR ("preferred_miami_rate_destination" IS NULL)))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clientes_codigo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clientes_codigo_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "legal_name" "text",
    "trade_name" "text",
    "rtn" "text",
    "address" "text",
    "city" "text",
    "country" "text" DEFAULT 'Honduras'::"text",
    "zip_code" "text",
    "phone" "text",
    "phone_2" "text",
    "email" "text",
    "website" "text",
    "logo_url" "text",
    "default_currency" "text" DEFAULT 'USD'::"text",
    "default_tax_rate" numeric(5,2) DEFAULT 15,
    "invoice_footer_note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "lugar_emision_defecto" "text",
    "exchange_rate_usd_hnl" numeric(10,4) DEFAULT 25.30,
    "condiciones_bl" "text",
    "condiciones_awb" "text",
    "condiciones_carta_porte" "text",
    "plantilla_cotizacion" "text"
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."container_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."container_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid",
    "agent_quote_id" "uuid",
    "quoted_cost" numeric NOT NULL,
    "invoiced_cost" numeric NOT NULL,
    "difference" numeric NOT NULL,
    "status" "text" NOT NULL,
    "observations" "text",
    "validated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cost_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."countries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."countries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cuentas_pagar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proveedor_id" "uuid" NOT NULL,
    "quotation_id" "uuid",
    "booking_id" "uuid",
    "descripcion" "text" NOT NULL,
    "numero_factura_proveedor" "text",
    "monto" numeric(14,2) NOT NULL,
    "moneda" "text" DEFAULT 'USD'::"text" NOT NULL,
    "tipo_cambio" numeric(10,4),
    "fecha_factura" "date",
    "fecha_vencimiento" "date",
    "status" "text" DEFAULT 'Pendiente'::"text" NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "tipo" "text" DEFAULT 'AP'::"text" NOT NULL,
    "parent_ap_id" "uuid",
    "documento_url" "text",
    CONSTRAINT "cuentas_pagar_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "cuentas_pagar_status_check" CHECK (("status" = ANY (ARRAY['Pendiente'::"text", 'Parcialmente Pagada'::"text", 'Pagada'::"text", 'Vencida'::"text", 'Anulada'::"text"]))),
    CONSTRAINT "cuentas_pagar_tipo_check" CHECK (("tipo" = ANY (ARRAY['AP'::"text", 'NC'::"text", 'ND'::"text"])))
);


ALTER TABLE "public"."cuentas_pagar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garantias_navieras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "naviera" "text" NOT NULL,
    "contenedor" "text",
    "bl_number" "text",
    "monto" numeric(12,2) NOT NULL,
    "moneda" "text" DEFAULT 'USD'::"text" NOT NULL,
    "fecha_deposito" "date" NOT NULL,
    "fecha_vencimiento_libre" "date",
    "fecha_recuperacion" "date",
    "status" "text" DEFAULT 'Depositada'::"text" NOT NULL,
    "notas" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "garantias_navieras_status_check" CHECK (("status" = ANY (ARRAY['Depositada'::"text", 'Recuperada'::"text", 'Vencida'::"text"])))
);


ALTER TABLE "public"."garantias_navieras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(10,3) DEFAULT 1 NOT NULL,
    "unit_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "payment_method" "text",
    "reference" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text",
    "invoice_type" "text" NOT NULL,
    "status" "text" DEFAULT 'Borrador'::"text" NOT NULL,
    "quotation_id" "uuid",
    "cliente_id" "uuid",
    "cliente_nombre" "text",
    "cliente_rtn" "text",
    "cliente_direccion" "text",
    "cliente_email" "text",
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "paid_date" "date",
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 15 NOT NULL,
    "tax_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "exchange_rate" numeric(10,4) DEFAULT 1 NOT NULL,
    "total_lps" numeric(14,2),
    "payment_method" "text",
    "payment_reference" "text",
    "notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "cai" "text",
    "rango_desde" "text",
    "rango_hasta" "text",
    "fecha_limite_emision" "date",
    "lugar_emision" "text",
    "es_exonerado" boolean DEFAULT false NOT NULL,
    "orden_compra_exenta" "text",
    "no_constancia_exonerado" "text",
    "no_registro_sag" "text",
    "isv_18_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "isv_18_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "importe_exento" numeric(14,2) DEFAULT 0 NOT NULL,
    "importe_exonerado" numeric(14,2) DEFAULT 0 NOT NULL,
    "parent_invoice_id" "uuid",
    "motivo" "text",
    CONSTRAINT "invoices_invoice_type_check" CHECK (("invoice_type" = ANY (ARRAY['Proforma'::"text", 'Factura'::"text", 'Nota de Crédito'::"text", 'Nota de Débito'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['Borrador'::"text", 'Enviada'::"text", 'Aprobada'::"text", 'Pagada'::"text", 'Vencida'::"text", 'Anulada'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "empresa" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefono" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "country" "text",
    "type" "text" DEFAULT 'Puerto'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miami_incidencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid",
    "cliente_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "descripcion" "text",
    "fotos" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'Abierta'::"text" NOT NULL,
    "resolucion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "miami_incidencias_status_check" CHECK (("status" = ANY (ARRAY['Abierta'::"text", 'En revisión'::"text", 'Resuelta'::"text", 'Cerrada'::"text"]))),
    CONSTRAINT "miami_incidencias_tipo_check" CHECK (("tipo" = ANY (ARRAY['Dañado'::"text", 'Incompleto'::"text", 'No reconozco este paquete'::"text", 'Pérdida'::"text", 'Otro'::"text"])))
);


ALTER TABLE "public"."miami_incidencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miami_manifests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manifest_number" "text" NOT NULL,
    "status" "text" DEFAULT 'Abierto'::"text" NOT NULL,
    "notes" "text",
    "total_packages" integer DEFAULT 0 NOT NULL,
    "received_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "miami_manifests_status_check" CHECK (("status" = ANY (ARRAY['Abierto'::"text", 'Cerrado'::"text"])))
);


ALTER TABLE "public"."miami_manifests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miami_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracking_number" "text" NOT NULL,
    "carrier" "text",
    "weight_lbs" numeric(10,2),
    "weight_kg" numeric(10,2),
    "length_in" numeric(10,2),
    "width_in" numeric(10,2),
    "height_in" numeric(10,2),
    "ft3" numeric(10,4),
    "cbm" numeric(10,6),
    "description" "text",
    "photos" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'Sin asignar'::"text" NOT NULL,
    "warehouse_number" "text",
    "cliente_id" "uuid",
    "manifest_id" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_by" "uuid",
    "assigned_at" timestamp with time zone,
    "assigned_by" "uuid",
    "notes" "text",
    "cargo_status_updated_at" timestamp with time zone DEFAULT "now"(),
    "tipo_carga" "text" DEFAULT 'Paquetería'::"text" NOT NULL,
    "cargo_status" "text" DEFAULT 'Recibido en Miami'::"text" NOT NULL,
    CONSTRAINT "miami_packages_status_check" CHECK (("status" = ANY (ARRAY['Sin asignar'::"text", 'Asignado'::"text", 'Entregado'::"text", 'Con incidencia'::"text"])))
);


ALTER TABLE "public"."miami_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."miami_pre_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "tracking_number" "text" NOT NULL,
    "carrier" "text",
    "description" "text",
    "expected_date" "date",
    "status" "text" DEFAULT 'Pendiente'::"text" NOT NULL,
    "matched_package_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "miami_pre_alerts_status_check" CHECK (("status" = ANY (ARRAY['Pendiente'::"text", 'Recibido'::"text", 'Cancelado'::"text"])))
);


ALTER TABLE "public"."miami_pre_alerts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."miami_wh_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."miami_wh_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text",
    "type" "text" DEFAULT 'info'::"text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."package_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagos_proveedor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cuenta_pagar_id" "uuid" NOT NULL,
    "monto" numeric(14,2) NOT NULL,
    "moneda" "text" DEFAULT 'USD'::"text" NOT NULL,
    "fecha_pago" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metodo_pago" "text",
    "referencia" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "pagos_proveedor_metodo_pago_check" CHECK (("metodo_pago" = ANY (ARRAY['Transferencia'::"text", 'Cheque'::"text", 'Efectivo'::"text", 'Otro'::"text"]))),
    CONSTRAINT "pagos_proveedor_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."pagos_proveedor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "country_id" "uuid",
    "type" "text" DEFAULT 'Puerto'::"text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "cost_amount" numeric DEFAULT 0,
    "sale_amount" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "supplier" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantity" numeric DEFAULT 1,
    "taxable" boolean DEFAULT false,
    "tax_rate" numeric DEFAULT 15,
    "tax_amount" numeric DEFAULT 0,
    "total_amount" numeric DEFAULT 0,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "rate_code" "text"
);


ALTER TABLE "public"."pricing_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_role_change_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "old_role" "public"."user_role",
    "new_role" "public"."user_role",
    "changed_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profile_role_change_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text",
    "apellido" "text",
    "rol" "public"."user_role" DEFAULT 'Ventas'::"public"."user_role",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'Pendiente'::"text" NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "is_active" boolean DEFAULT true,
    "email" "text",
    "avatar_url" "text",
    "cliente_id" "uuid",
    "tutorial_completed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['Pendiente'::"text", 'Aprobado'::"text", 'Rechazado'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "rtn" "text",
    "email" "text",
    "telefono" "text",
    "contacto" "text",
    "pais" "text",
    "moneda" "text" DEFAULT 'USD'::"text" NOT NULL,
    "terminos_pago" integer DEFAULT 30 NOT NULL,
    "agente_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proveedores_tipo_check" CHECK (("tipo" = ANY (ARRAY['Agente'::"text", 'Carrier'::"text", 'Aduanal'::"text", 'Transporte'::"text", 'Almacen'::"text", 'Courier'::"text", 'Otro'::"text"])))
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "pricing_item_id" "uuid",
    "supplier" "text",
    "invoice_number" "text",
    "description" "text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "quantity" numeric DEFAULT 1,
    "unit_cost" numeric DEFAULT 0,
    "total_cost" numeric DEFAULT 0,
    "invoice_date" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_taxable" boolean DEFAULT false,
    "tax_rate_id" "uuid",
    "tax_percentage_snapshot" numeric DEFAULT 0,
    "tax_amount" numeric DEFAULT 0,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."provider_invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_cargo_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "quantity" numeric(12,2) DEFAULT 1 NOT NULL,
    "package_type" "text" NOT NULL,
    "length" numeric(12,2),
    "width" numeric(12,2),
    "height" numeric(12,2),
    "dimension_unit" "text" DEFAULT 'in'::"text" NOT NULL,
    "weight_lbs" numeric(12,2),
    "ft3" numeric(12,4),
    "cbm" numeric(12,4),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quotation_cargo_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_change_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "change_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quotation_change_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_containers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "container_type_id" "uuid",
    "container_type_name" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quotation_containers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."quotation_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."quotation_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "old_status" "text",
    "new_status" "text" NOT NULL,
    "changed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quotation_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'Solicitud'::"text",
    "incoterm" "text",
    "tipo_transporte" "text",
    "origen" "text",
    "destino" "text",
    "puerto_origen" "text",
    "puerto_destino" "text",
    "peso_kg" numeric,
    "volumen_cbm" numeric,
    "cantidad_bultos" integer,
    "largo_cm" numeric,
    "ancho_cm" numeric,
    "alto_cm" numeric,
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quotation_number" "text",
    "valid_until" "date",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "container_type" "text",
    "gross_weight" numeric,
    "commodity" "text",
    "quote_type" "text" DEFAULT 'Cotización Marítima FCL'::"text",
    "pickup_address" "text",
    "commercial_value" numeric,
    "requires_insurance" boolean DEFAULT false,
    "insurance_percentage" numeric,
    "insurance_cost" numeric,
    "fob_value" numeric,
    "freight_value" numeric,
    "insurance_markup_percentage" numeric DEFAULT 10,
    "insurance_rate" numeric DEFAULT 1.0,
    "preferred_carrier" "text",
    "target_rate" numeric,
    "total_cost" numeric DEFAULT 0,
    "total_sale" numeric DEFAULT 0,
    "profit_amount" numeric DEFAULT 0,
    "gp_percentage" numeric DEFAULT 0,
    "pricing_approved" boolean DEFAULT false,
    "pricing_approved_by" "uuid",
    "pricing_approved_at" timestamp with time zone,
    "transit_time" "text",
    "service_frequency" "text",
    "transshipment" "text",
    "target_sale" numeric,
    "target_gp" numeric,
    "delivery_address" "text",
    "container_qty" numeric,
    "package_type" "text",
    "package_details" "text",
    "financial_validation_status" "text" DEFAULT 'Pendiente'::"text",
    "pricing_notes" "text",
    "assigned_to" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "service_product" "text",
    "trade_direction" "text" DEFAULT 'import'::"text",
    "peso_lbs" numeric(12,2),
    "volumen_ft3" numeric(12,2),
    "duplicated_from" "uuid",
    "client_notes" "text",
    "miami_rate_destination" "text",
    CONSTRAINT "quotations_miami_rate_destination_check" CHECK ((("miami_rate_destination" = ANY (ARRAY['SPS'::"text", 'TGU'::"text"])) OR ("miami_rate_destination" IS NULL))),
    CONSTRAINT "quotations_service_product_check" CHECK ((("service_product" = ANY (ARRAY['miami_lcl'::"text", 'miami_air'::"text", 'other_origin_fcl'::"text", 'other_origin_lcl'::"text", 'usa_ltl_ftl'::"text", 'courier'::"text"])) OR ("service_product" IS NULL))),
    CONSTRAINT "quotations_trade_direction_check" CHECK (("trade_direction" = ANY (ARRAY['import'::"text", 'export'::"text"])))
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."routing_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."routing_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_instruction_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipping_instruction_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shipping_instruction_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_instructions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "routing_number" "text" NOT NULL,
    "quotation_id" "uuid",
    "client_id" "uuid",
    "status" "text" DEFAULT 'Borrador'::"text" NOT NULL,
    "vendor_id" "uuid",
    "operations_assigned_to" "uuid",
    "supplier_name" "text",
    "supplier_contact" "text",
    "supplier_email" "text",
    "supplier_phone" "text",
    "supplier_address" "text",
    "origin_address" "text",
    "destination_address" "text",
    "container_qty" numeric,
    "container_type" "text",
    "agent_name" "text",
    "agent_contact" "text",
    "agent_email" "text",
    "special_instructions" "text",
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "booking_number" "text",
    "carrier_booking" "text",
    "master_bl" "text",
    "house_bl" "text",
    "etd" "date",
    "eta" "date",
    "free_days" "text",
    "shipper" "text",
    "consignee" "text",
    "notify_party" "text",
    "shipment_status" "text" DEFAULT 'Pendiente Validación'::"text",
    "freight_terms" "text",
    "release_type" "text",
    "hbl_freight_visibility" "text",
    "printed_at_destination" boolean DEFAULT true,
    "consignee_tax_id" "text",
    "consignee_address" "text",
    "consignee_contact" "text",
    "consignee_email" "text",
    "consignee_phone" "text",
    "notify_party_tax_id" "text",
    "notify_party_address" "text",
    "notify_party_contact" "text",
    "notify_party_email" "text",
    "notify_party_phone" "text",
    "sales_observations" "text",
    "carrier" "text",
    "reference_number" "text",
    "vessel_name" "text",
    "voyage" "text",
    "tracking_url" "text",
    "original_eta" "date",
    "actual_etd" "date",
    "actual_eta" "date",
    "eir_date" "date",
    "estimated_transit_days" integer,
    "real_transit_days" integer,
    "remaining_free_days" integer,
    "operational_comments" "text",
    "operational_status" "text" DEFAULT 'Pendiente Validación'::"text",
    "sales_submitted_at" timestamp with time zone,
    CONSTRAINT "shipping_instructions_operational_status_check" CHECK ((("operational_status" IS NULL) OR ("operational_status" = ANY (ARRAY['Pendiente Validación'::"text", 'Validada'::"text", 'Asignado'::"text", 'Listo para Booking'::"text", 'En Booking'::"text", 'Booking Solicitado'::"text", 'Booking Confirmado'::"text", 'Documentación Pendiente'::"text", 'Listo para Embarque'::"text", 'Embarcado'::"text", 'En Tránsito'::"text", 'Arribado'::"text", 'Finalizado'::"text", 'Cancelada'::"text"])))),
    CONSTRAINT "shipping_instructions_shipment_status_check" CHECK (("shipment_status" = ANY (ARRAY['Pendiente Validación'::"text", 'Validada'::"text", 'Booking Solicitado'::"text", 'Booking Confirmado'::"text", 'Documentación Pendiente'::"text", 'Listo para Embarque'::"text", 'Embarcado'::"text", 'En Tránsito'::"text", 'Arribado'::"text", 'Finalizado'::"text", 'Cancelada'::"text"]))),
    CONSTRAINT "shipping_instructions_status_check" CHECK (("status" = ANY (ARRAY['Borrador'::"text", 'Enviada a Operaciones'::"text", 'En Revisión'::"text", 'Validada'::"text", 'Rechazada'::"text", 'Convertida a Embarque'::"text"])))
);


ALTER TABLE "public"."shipping_instructions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surcharge_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "service_product" "text" NOT NULL,
    "calculation_type" "text" NOT NULL,
    "rate_per_lbs" numeric(12,4) DEFAULT 0,
    "rate_per_ft3" numeric(12,4) DEFAULT 0,
    "fixed_amount" numeric(12,2) DEFAULT 0,
    "minimum_amount" numeric(12,2) DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "surcharge_rules_calculation_type_check" CHECK (("calculation_type" = ANY (ARRAY['max_formula'::"text", 'fixed'::"text", 'per_lbs'::"text", 'per_ft3'::"text"]))),
    CONSTRAINT "surcharge_rules_service_product_check" CHECK (("service_product" = ANY (ARRAY['miami_lcl'::"text", 'miami_air'::"text", 'other_origin_fcl'::"text", 'other_origin_lcl'::"text", 'usa_ltl_ftl'::"text", 'courier'::"text"])))
);


ALTER TABLE "public"."surcharge_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "country" "text" NOT NULL,
    "tax_name" "text" NOT NULL,
    "percentage" numeric DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid"
);


ALTER TABLE "public"."tax_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'Pendiente'::"text",
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "priority" "text" DEFAULT 'Media'::"text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "user_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['Baja'::"text", 'Media'::"text", 'Alta'::"text"])))
);


ALTER TABLE "public"."user_tasks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_quote_container_rates"
    ADD CONSTRAINT "agent_quote_container_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_quotes"
    ADD CONSTRAINT "agent_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_route_rates"
    ADD CONSTRAINT "agent_route_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bl_amendments"
    ADD CONSTRAINT "bl_amendments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bl_containers"
    ADD CONSTRAINT "bl_containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bl_draft_sends"
    ADD CONSTRAINT "bl_draft_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_containers"
    ADD CONSTRAINT "booking_containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_documents"
    ADD CONSTRAINT "booking_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cai_ranges"
    ADD CONSTRAINT "cai_ranges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_addresses"
    ADD CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_notifications"
    ADD CONSTRAINT "client_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_pickup_requests"
    ADD CONSTRAINT "client_pickup_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_rates"
    ADD CONSTRAINT "client_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cliente_history"
    ADD CONSTRAINT "cliente_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_codigo_cliente_key" UNIQUE ("codigo_cliente");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."container_types"
    ADD CONSTRAINT "container_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_validations"
    ADD CONSTRAINT "cost_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garantias_navieras"
    ADD CONSTRAINT "garantias_navieras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations_catalog"
    ADD CONSTRAINT "locations_catalog_name_country_type_key" UNIQUE ("name", "country", "type");



ALTER TABLE ONLY "public"."locations_catalog"
    ADD CONSTRAINT "locations_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miami_incidencias"
    ADD CONSTRAINT "miami_incidencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miami_manifests"
    ADD CONSTRAINT "miami_manifests_manifest_number_key" UNIQUE ("manifest_number");



ALTER TABLE ONLY "public"."miami_manifests"
    ADD CONSTRAINT "miami_manifests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_warehouse_number_key" UNIQUE ("warehouse_number");



ALTER TABLE ONLY "public"."miami_pre_alerts"
    ADD CONSTRAINT "miami_pre_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_types"
    ADD CONSTRAINT "package_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ports"
    ADD CONSTRAINT "ports_name_country_id_key" UNIQUE ("name", "country_id");



ALTER TABLE ONLY "public"."ports"
    ADD CONSTRAINT "ports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_items"
    ADD CONSTRAINT "pricing_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_role_change_logs"
    ADD CONSTRAINT "profile_role_change_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_profile_id_token_key" UNIQUE ("profile_id", "token");



ALTER TABLE ONLY "public"."quotation_cargo_lines"
    ADD CONSTRAINT "quotation_cargo_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_change_logs"
    ADD CONSTRAINT "quotation_change_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_containers"
    ADD CONSTRAINT "quotation_containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_status_history"
    ADD CONSTRAINT "quotation_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_quotation_number_key" UNIQUE ("quotation_number");



ALTER TABLE ONLY "public"."shipping_instruction_events"
    ADD CONSTRAINT "shipping_instruction_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_routing_number_key" UNIQUE ("routing_number");



ALTER TABLE ONLY "public"."surcharge_rules"
    ADD CONSTRAINT "surcharge_rules_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."surcharge_rules"
    ADD CONSTRAINT "surcharge_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tasks"
    ADD CONSTRAINT "user_tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_route_rates_agent_id_idx" ON "public"."agent_route_rates" USING "btree" ("agent_id");



CREATE INDEX "agent_route_rates_origin_destination_idx" ON "public"."agent_route_rates" USING "btree" ("origin", "destination");



CREATE INDEX "agent_route_rates_valid_until_idx" ON "public"."agent_route_rates" USING "btree" ("valid_until");



CREATE INDEX "bills_of_lading_booking_id_idx" ON "public"."bills_of_lading" USING "btree" ("booking_id");



CREATE INDEX "bills_of_lading_parent_bl_id_idx" ON "public"."bills_of_lading" USING "btree" ("parent_bl_id");



CREATE INDEX "bills_of_lading_shipping_instruction_id_idx" ON "public"."bills_of_lading" USING "btree" ("shipping_instruction_id");



CREATE INDEX "bills_of_lading_status_idx" ON "public"."bills_of_lading" USING "btree" ("status");



CREATE INDEX "bl_amendments_bl_id_idx" ON "public"."bl_amendments" USING "btree" ("bl_id");



CREATE INDEX "bl_containers_bl_id_idx" ON "public"."bl_containers" USING "btree" ("bl_id");



CREATE INDEX "bl_draft_sends_bl_id_idx" ON "public"."bl_draft_sends" USING "btree" ("bl_id");



CREATE INDEX "cai_ranges_is_active_idx" ON "public"."cai_ranges" USING "btree" ("is_active");



CREATE UNIQUE INDEX "client_rates_cliente_rate_code_destination_unique" ON "public"."client_rates" USING "btree" ("cliente_id", "rate_code", "miami_rate_destination") WHERE ("miami_rate_destination" IS NOT NULL);



CREATE UNIQUE INDEX "client_rates_cliente_rate_code_global_unique" ON "public"."client_rates" USING "btree" ("cliente_id", "rate_code") WHERE ("miami_rate_destination" IS NULL);



CREATE INDEX "cuentas_pagar_booking_idx" ON "public"."cuentas_pagar" USING "btree" ("booking_id");



CREATE INDEX "cuentas_pagar_parent_ap_idx" ON "public"."cuentas_pagar" USING "btree" ("parent_ap_id");



CREATE INDEX "cuentas_pagar_proveedor_idx" ON "public"."cuentas_pagar" USING "btree" ("proveedor_id");



CREATE INDEX "cuentas_pagar_quotation_idx" ON "public"."cuentas_pagar" USING "btree" ("quotation_id");



CREATE INDEX "cuentas_pagar_status_idx" ON "public"."cuentas_pagar" USING "btree" ("status");



CREATE INDEX "cuentas_pagar_vencimiento_idx" ON "public"."cuentas_pagar" USING "btree" ("fecha_vencimiento");



CREATE INDEX "idx_booking_containers_booking_id" ON "public"."booking_containers" USING "btree" ("booking_id");



CREATE INDEX "idx_booking_documents_booking_id" ON "public"."booking_documents" USING "btree" ("booking_id");



CREATE INDEX "idx_booking_documents_created_at" ON "public"."booking_documents" USING "btree" ("created_at");



CREATE INDEX "idx_bookings_booking_number" ON "public"."bookings" USING "btree" ("booking_number");



CREATE INDEX "idx_bookings_shipment_status" ON "public"."bookings" USING "btree" ("shipment_status");



CREATE INDEX "idx_bookings_shipping_instruction_id" ON "public"."bookings" USING "btree" ("shipping_instruction_id");



CREATE INDEX "idx_client_addresses_cliente" ON "public"."client_addresses" USING "btree" ("cliente_id");



CREATE INDEX "idx_client_notifications_profile" ON "public"."client_notifications" USING "btree" ("profile_id");



CREATE INDEX "idx_client_notifications_read" ON "public"."client_notifications" USING "btree" ("read_at");



CREATE INDEX "idx_clientes_active" ON "public"."clientes" USING "btree" ("id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clientes_active_nombre" ON "public"."clientes" USING "btree" ("nombre") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clientes_deleted_at" ON "public"."clientes" USING "btree" ("deleted_at");



CREATE INDEX "idx_clientes_nombre_active" ON "public"."clientes" USING "btree" ("nombre") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_miami_incidencias_cliente" ON "public"."miami_incidencias" USING "btree" ("cliente_id");



CREATE INDEX "idx_miami_incidencias_package" ON "public"."miami_incidencias" USING "btree" ("package_id");



CREATE INDEX "idx_miami_incidencias_status" ON "public"."miami_incidencias" USING "btree" ("status");



CREATE INDEX "idx_miami_packages_cargo_status" ON "public"."miami_packages" USING "btree" ("cargo_status");



CREATE INDEX "idx_miami_packages_cliente" ON "public"."miami_packages" USING "btree" ("cliente_id");



CREATE INDEX "idx_miami_packages_manifest" ON "public"."miami_packages" USING "btree" ("manifest_id");



CREATE INDEX "idx_miami_packages_status" ON "public"."miami_packages" USING "btree" ("status");



CREATE INDEX "idx_miami_packages_tracking" ON "public"."miami_packages" USING "btree" ("tracking_number");



CREATE INDEX "idx_miami_packages_warehouse" ON "public"."miami_packages" USING "btree" ("warehouse_number");



CREATE INDEX "idx_miami_pre_alerts_cliente" ON "public"."miami_pre_alerts" USING "btree" ("cliente_id");



CREATE INDEX "idx_miami_pre_alerts_status" ON "public"."miami_pre_alerts" USING "btree" ("status");



CREATE INDEX "idx_miami_pre_alerts_tracking" ON "public"."miami_pre_alerts" USING "btree" ("tracking_number");



CREATE INDEX "idx_quotation_cargo_lines_quotation_id" ON "public"."quotation_cargo_lines" USING "btree" ("quotation_id");



CREATE INDEX "idx_shipping_instruction_events_date" ON "public"."shipping_instruction_events" USING "btree" ("event_date");



CREATE INDEX "idx_shipping_instruction_events_si" ON "public"."shipping_instruction_events" USING "btree" ("shipping_instruction_id");



CREATE INDEX "idx_shipping_instructions_eta" ON "public"."shipping_instructions" USING "btree" ("eta");



CREATE INDEX "idx_shipping_instructions_etd" ON "public"."shipping_instructions" USING "btree" ("etd");



CREATE INDEX "idx_shipping_instructions_shipment_status" ON "public"."shipping_instructions" USING "btree" ("shipment_status");



CREATE INDEX "idx_surcharge_rules_service_product" ON "public"."surcharge_rules" USING "btree" ("service_product");



CREATE INDEX "invoice_items_invoice_id_idx" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "invoice_payments_invoice_id_idx" ON "public"."invoice_payments" USING "btree" ("invoice_id");



CREATE INDEX "invoices_cliente_id_idx" ON "public"."invoices" USING "btree" ("cliente_id");



CREATE INDEX "invoices_issue_date_idx" ON "public"."invoices" USING "btree" ("issue_date");



CREATE INDEX "invoices_parent_invoice_id_idx" ON "public"."invoices" USING "btree" ("parent_invoice_id");



CREATE INDEX "invoices_quotation_id_idx" ON "public"."invoices" USING "btree" ("quotation_id");



CREATE INDEX "invoices_status_idx" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "pagos_proveedor_cuenta_idx" ON "public"."pagos_proveedor" USING "btree" ("cuenta_pagar_id");



CREATE INDEX "pagos_proveedor_fecha_idx" ON "public"."pagos_proveedor" USING "btree" ("fecha_pago");



CREATE INDEX "proveedores_agente_id_idx" ON "public"."proveedores" USING "btree" ("agente_id");



CREATE INDEX "proveedores_tipo_idx" ON "public"."proveedores" USING "btree" ("tipo");



CREATE OR REPLACE TRIGGER "on_quotation_created_status_history" AFTER INSERT ON "public"."quotations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_quotation_status_history"();



CREATE OR REPLACE TRIGGER "prevent_role_change_by_non_admin_trigger" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_change_by_non_admin"();



CREATE OR REPLACE TRIGGER "set_cliente_codigo" BEFORE INSERT ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "public"."generate_cliente_codigo"();



CREATE OR REPLACE TRIGGER "set_quotation_number" BEFORE INSERT ON "public"."quotations" FOR EACH ROW EXECUTE FUNCTION "public"."generate_quotation_number"();



CREATE OR REPLACE TRIGGER "trg_auto_match_pre_alert" BEFORE INSERT ON "public"."miami_packages" FOR EACH ROW EXECUTE FUNCTION "public"."auto_match_pre_alert"();



CREATE OR REPLACE TRIGGER "trg_calc_package_volume" BEFORE INSERT OR UPDATE OF "length_in", "width_in", "height_in" ON "public"."miami_packages" FOR EACH ROW EXECUTE FUNCTION "public"."calc_package_volume"();



CREATE OR REPLACE TRIGGER "trg_generate_routing_number" BEFORE INSERT ON "public"."shipping_instructions" FOR EACH ROW EXECUTE FUNCTION "public"."generate_routing_number"();



CREATE OR REPLACE TRIGGER "trg_manifest_package_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."miami_packages" FOR EACH ROW EXECUTE FUNCTION "public"."update_manifest_package_count"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_quote_container_rates"
    ADD CONSTRAINT "agent_quote_container_rates_agent_quote_id_fkey" FOREIGN KEY ("agent_quote_id") REFERENCES "public"."agent_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_quote_container_rates"
    ADD CONSTRAINT "agent_quote_container_rates_quotation_container_id_fkey" FOREIGN KEY ("quotation_container_id") REFERENCES "public"."quotation_containers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_quotes"
    ADD CONSTRAINT "agent_quotes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."agent_quotes"
    ADD CONSTRAINT "agent_quotes_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_quotes"
    ADD CONSTRAINT "agent_quotes_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_route_rates"
    ADD CONSTRAINT "agent_route_rates_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_parent_bl_id_fkey" FOREIGN KEY ("parent_bl_id") REFERENCES "public"."bills_of_lading"("id");



ALTER TABLE ONLY "public"."bills_of_lading"
    ADD CONSTRAINT "bills_of_lading_shipping_instruction_id_fkey" FOREIGN KEY ("shipping_instruction_id") REFERENCES "public"."shipping_instructions"("id");



ALTER TABLE ONLY "public"."bl_amendments"
    ADD CONSTRAINT "bl_amendments_bl_id_fkey" FOREIGN KEY ("bl_id") REFERENCES "public"."bills_of_lading"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bl_amendments"
    ADD CONSTRAINT "bl_amendments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bl_containers"
    ADD CONSTRAINT "bl_containers_bl_id_fkey" FOREIGN KEY ("bl_id") REFERENCES "public"."bills_of_lading"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bl_draft_sends"
    ADD CONSTRAINT "bl_draft_sends_bl_id_fkey" FOREIGN KEY ("bl_id") REFERENCES "public"."bills_of_lading"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bl_draft_sends"
    ADD CONSTRAINT "bl_draft_sends_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_containers"
    ADD CONSTRAINT "booking_containers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_documents"
    ADD CONSTRAINT "booking_documents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_shipping_instruction_id_fkey" FOREIGN KEY ("shipping_instruction_id") REFERENCES "public"."shipping_instructions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cai_ranges"
    ADD CONSTRAINT "cai_ranges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_addresses"
    ADD CONSTRAINT "client_addresses_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_notifications"
    ADD CONSTRAINT "client_notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_pickup_requests"
    ADD CONSTRAINT "client_pickup_requests_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_pickup_requests"
    ADD CONSTRAINT "client_pickup_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_rates"
    ADD CONSTRAINT "client_rates_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cliente_history"
    ADD CONSTRAINT "cliente_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cliente_history"
    ADD CONSTRAINT "cliente_history_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_vendedor_asignado_fkey" FOREIGN KEY ("vendedor_asignado") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cost_validations"
    ADD CONSTRAINT "cost_validations_agent_quote_id_fkey" FOREIGN KEY ("agent_quote_id") REFERENCES "public"."agent_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_validations"
    ADD CONSTRAINT "cost_validations_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_validations"
    ADD CONSTRAINT "cost_validations_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_parent_ap_id_fkey" FOREIGN KEY ("parent_ap_id") REFERENCES "public"."cuentas_pagar"("id");



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cuentas_pagar"
    ADD CONSTRAINT "cuentas_pagar_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."garantias_navieras"
    ADD CONSTRAINT "garantias_navieras_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."garantias_navieras"
    ADD CONSTRAINT "garantias_navieras_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_parent_invoice_id_fkey" FOREIGN KEY ("parent_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_incidencias"
    ADD CONSTRAINT "miami_incidencias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."miami_incidencias"
    ADD CONSTRAINT "miami_incidencias_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."miami_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_incidencias"
    ADD CONSTRAINT "miami_incidencias_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_manifests"
    ADD CONSTRAINT "miami_manifests_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "public"."miami_manifests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_packages"
    ADD CONSTRAINT "miami_packages_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."miami_pre_alerts"
    ADD CONSTRAINT "miami_pre_alerts_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."miami_pre_alerts"
    ADD CONSTRAINT "miami_pre_alerts_matched_package_id_fkey" FOREIGN KEY ("matched_package_id") REFERENCES "public"."miami_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_cuenta_pagar_id_fkey" FOREIGN KEY ("cuenta_pagar_id") REFERENCES "public"."cuentas_pagar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ports"
    ADD CONSTRAINT "ports_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id");



ALTER TABLE ONLY "public"."pricing_items"
    ADD CONSTRAINT "pricing_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pricing_items"
    ADD CONSTRAINT "pricing_items_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pricing_items"
    ADD CONSTRAINT "pricing_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_role_change_logs"
    ADD CONSTRAINT "profile_role_change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profile_role_change_logs"
    ADD CONSTRAINT "profile_role_change_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_pricing_item_id_fkey" FOREIGN KEY ("pricing_item_id") REFERENCES "public"."pricing_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_invoice_items"
    ADD CONSTRAINT "provider_invoice_items_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_cargo_lines"
    ADD CONSTRAINT "quotation_cargo_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_change_logs"
    ADD CONSTRAINT "quotation_change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_change_logs"
    ADD CONSTRAINT "quotation_change_logs_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_containers"
    ADD CONSTRAINT "quotation_containers_container_type_id_fkey" FOREIGN KEY ("container_type_id") REFERENCES "public"."container_types"("id");



ALTER TABLE ONLY "public"."quotation_containers"
    ADD CONSTRAINT "quotation_containers_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_status_history"
    ADD CONSTRAINT "quotation_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."quotation_status_history"
    ADD CONSTRAINT "quotation_status_history_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_duplicated_from_fkey" FOREIGN KEY ("duplicated_from") REFERENCES "public"."quotations"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pricing_approved_by_fkey" FOREIGN KEY ("pricing_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shipping_instruction_events"
    ADD CONSTRAINT "shipping_instruction_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shipping_instruction_events"
    ADD CONSTRAINT "shipping_instruction_events_shipping_instruction_id_fkey" FOREIGN KEY ("shipping_instruction_id") REFERENCES "public"."shipping_instructions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clientes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_operations_assigned_to_fkey" FOREIGN KEY ("operations_assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shipping_instructions"
    ADD CONSTRAINT "shipping_instructions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_tasks"
    ADD CONSTRAINT "user_tasks_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_tasks"
    ADD CONSTRAINT "user_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can insert profile role logs" ON "public"."profile_role_change_logs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_current_user_role"() = 'Admin'::"public"."user_role") AND ("changed_by" = "auth"."uid"())));



CREATE POLICY "Admin can update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."rol" = 'Admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."rol" = 'Admin'::"public"."user_role")))));



CREATE POLICY "Admin can view profile role logs" ON "public"."profile_role_change_logs" FOR SELECT TO "authenticated" USING (("public"."get_current_user_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "Allow authenticated users to delete agents" ON "public"."agents" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert agents" ON "public"."agents" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert countries" ON "public"."countries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert ports" ON "public"."ports" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to read agents" ON "public"."agents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read countries" ON "public"."countries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read ports" ON "public"."ports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update agents" ON "public"."agents" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update countries" ON "public"."countries" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update ports" ON "public"."ports" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow insert from anon" ON "public"."leads" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow manage container types" ON "public"."container_types" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow manage package types" ON "public"."package_types" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow read container types" ON "public"."container_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow read package types" ON "public"."package_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can access cliente history" ON "public"."cliente_history" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can access cost validations" ON "public"."cost_validations" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can access locations catalog" ON "public"."locations_catalog" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Profiles select policy" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."get_current_user_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Pricing'::"public"."user_role", 'Contabilidad'::"public"."user_role"]))));



CREATE POLICY "User can update own basic profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can create own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can manage own notifications" ON "public"."notifications" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own tasks" ON "public"."user_tasks" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_logs_insert_policy" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "activity_logs_select_policy" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (("public"."is_role"(ARRAY['Admin'::"text"]) OR ("user_id" = "auth"."uid"()) OR (("entity_type" = 'quotation'::"text") AND "public"."can_select_quotation"("entity_id")) OR "public"."can_select_quotation"("public"."uuid_from_text"(("metadata" ->> 'quotation_id'::"text")))));



CREATE POLICY "admin_write" ON "public"."company_settings" TO "authenticated" USING (("public"."current_user_role"() = 'Admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'Admin'::"text"));



ALTER TABLE "public"."agent_quote_container_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_quote_container_rates_delete_policy" ON "public"."agent_quote_container_rates" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."agent_quotes" "aq"
  WHERE (("aq"."id" = "agent_quote_container_rates"."agent_quote_id") AND "public"."can_select_quotation"("aq"."quotation_id"))))));



CREATE POLICY "agent_quote_container_rates_insert_policy" ON "public"."agent_quote_container_rates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_quotes" "aq"
  WHERE (("aq"."id" = "agent_quote_container_rates"."agent_quote_id") AND "public"."can_select_quotation"("aq"."quotation_id")))));



CREATE POLICY "agent_quote_container_rates_select_policy" ON "public"."agent_quote_container_rates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_quotes" "aq"
  WHERE (("aq"."id" = "agent_quote_container_rates"."agent_quote_id") AND "public"."can_select_quotation"("aq"."quotation_id")))));



CREATE POLICY "agent_quote_container_rates_update_policy" ON "public"."agent_quote_container_rates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_quotes" "aq"
  WHERE (("aq"."id" = "agent_quote_container_rates"."agent_quote_id") AND "public"."can_select_quotation"("aq"."quotation_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_quotes" "aq"
  WHERE (("aq"."id" = "agent_quote_container_rates"."agent_quote_id") AND "public"."can_select_quotation"("aq"."quotation_id")))));



ALTER TABLE "public"."agent_quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_quotes_delete_policy" ON "public"."agent_quotes" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "agent_quotes_insert_policy" ON "public"."agent_quotes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved_active_user"());



CREATE POLICY "agent_quotes_select_policy" ON "public"."agent_quotes" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "agent_quotes_update_policy" ON "public"."agent_quotes" FOR UPDATE TO "authenticated" USING ("public"."is_approved_active_user"()) WITH CHECK ("public"."is_approved_active_user"());



ALTER TABLE "public"."agent_route_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_route_rates_delete_policy" ON "public"."agent_route_rates" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "agent_route_rates_insert_policy" ON "public"."agent_route_rates" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_pricing_catalogs"());



CREATE POLICY "agent_route_rates_select_policy" ON "public"."agent_route_rates" FOR SELECT TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Pricing'::"text"]));



CREATE POLICY "agent_route_rates_update_policy" ON "public"."agent_route_rates" FOR UPDATE TO "authenticated" USING ("public"."can_manage_pricing_catalogs"()) WITH CHECK ("public"."can_manage_pricing_catalogs"());



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_full_access" ON "public"."bl_amendments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_full_access" ON "public"."bl_draft_sends" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_read" ON "public"."company_settings" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."bills_of_lading" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bills_of_lading_delete_policy" ON "public"."bills_of_lading" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "bills_of_lading_insert_policy" ON "public"."bills_of_lading" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_operations"());



CREATE POLICY "bills_of_lading_select_policy" ON "public"."bills_of_lading" FOR SELECT TO "authenticated" USING ("public"."can_access_bill_of_lading"("id"));



CREATE POLICY "bills_of_lading_update_policy" ON "public"."bills_of_lading" FOR UPDATE TO "authenticated" USING ("public"."can_manage_operations"()) WITH CHECK ("public"."can_manage_operations"());



ALTER TABLE "public"."bl_amendments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bl_containers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bl_containers_delete_policy" ON "public"."bl_containers" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "bl_containers_insert_policy" ON "public"."bl_containers" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_operations"() AND (EXISTS ( SELECT 1
   FROM "public"."bills_of_lading" "bl"
  WHERE ("bl"."id" = "bl_containers"."bl_id")))));



CREATE POLICY "bl_containers_select_policy" ON "public"."bl_containers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bills_of_lading" "bl"
  WHERE (("bl"."id" = "bl_containers"."bl_id") AND "public"."can_access_bill_of_lading"("bl"."id")))));



CREATE POLICY "bl_containers_update_policy" ON "public"."bl_containers" FOR UPDATE TO "authenticated" USING ("public"."can_manage_operations"()) WITH CHECK ("public"."can_manage_operations"());



ALTER TABLE "public"."bl_draft_sends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_containers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_containers_delete_policy" ON "public"."booking_containers" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND "public"."can_select_booking"("booking_id")));



CREATE POLICY "booking_containers_insert_policy" ON "public"."booking_containers" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id")));



CREATE POLICY "booking_containers_select_policy" ON "public"."booking_containers" FOR SELECT TO "authenticated" USING ("public"."can_select_booking"("booking_id"));



CREATE POLICY "booking_containers_update_policy" ON "public"."booking_containers" FOR UPDATE TO "authenticated" USING (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id"))) WITH CHECK (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id")));



ALTER TABLE "public"."booking_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_documents_delete_policy" ON "public"."booking_documents" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND "public"."can_select_booking"("booking_id")));



CREATE POLICY "booking_documents_insert_policy" ON "public"."booking_documents" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id") AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "booking_documents_select_policy" ON "public"."booking_documents" FOR SELECT TO "authenticated" USING ("public"."can_select_booking"("booking_id"));



CREATE POLICY "booking_documents_update_policy" ON "public"."booking_documents" FOR UPDATE TO "authenticated" USING (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id"))) WITH CHECK (("public"."can_manage_operations"() AND "public"."can_select_booking"("booking_id")));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_delete_policy" ON "public"."bookings" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "bookings_insert_policy" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_operations"());



CREATE POLICY "bookings_select_policy" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("public"."can_manage_operations"() OR "public"."is_sales_owner_of_shipping_instruction"("shipping_instruction_id")));



CREATE POLICY "bookings_update_policy" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ("public"."can_manage_operations"()) WITH CHECK ("public"."can_manage_operations"());



ALTER TABLE "public"."cai_ranges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cai_ranges_delete_policy" ON "public"."cai_ranges" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "cai_ranges_insert_policy" ON "public"."cai_ranges" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_finance"());



CREATE POLICY "cai_ranges_select_policy" ON "public"."cai_ranges" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "cai_ranges_update_policy" ON "public"."cai_ranges" FOR UPDATE TO "authenticated" USING ("public"."can_manage_finance"()) WITH CHECK ("public"."can_manage_finance"());



ALTER TABLE "public"."client_addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_addresses_admin_all" ON "public"."client_addresses" TO "authenticated" USING (("public"."current_user_role"() = 'Admin'::"text")) WITH CHECK (("public"."current_user_role"() = 'Admin'::"text"));



CREATE POLICY "client_addresses_cliente_all" ON "public"."client_addresses" TO "authenticated" USING (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"()))) WITH CHECK (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"())));



ALTER TABLE "public"."client_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_notes_delete_policy" ON "public"."client_notes" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "client_notes_insert_policy" ON "public"."client_notes" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_select_cliente"("cliente_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "client_notes_select_policy" ON "public"."client_notes" FOR SELECT TO "authenticated" USING ("public"."can_select_cliente"("cliente_id"));



CREATE POLICY "client_notes_update_policy" ON "public"."client_notes" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."client_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_notifications_admin_insert" ON "public"."client_notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."current_user_role"() = 'Admin'::"text"));



CREATE POLICY "client_notifications_cliente_select" ON "public"."client_notifications" FOR SELECT TO "authenticated" USING (("public"."is_cliente"() AND ("profile_id" = "auth"."uid"())));



CREATE POLICY "client_notifications_cliente_update" ON "public"."client_notifications" FOR UPDATE TO "authenticated" USING (("public"."is_cliente"() AND ("profile_id" = "auth"."uid"()))) WITH CHECK (("public"."is_cliente"() AND ("profile_id" = "auth"."uid"())));



ALTER TABLE "public"."client_pickup_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_rates_delete_policy" ON "public"."client_rates" FOR DELETE TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "client_rates_insert_policy" ON "public"."client_rates" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved_active_user"());



CREATE POLICY "client_rates_select_policy" ON "public"."client_rates" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "client_rates_update_policy" ON "public"."client_rates" FOR UPDATE TO "authenticated" USING ("public"."is_approved_active_user"()) WITH CHECK ("public"."is_approved_active_user"());



ALTER TABLE "public"."cliente_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cliente_insert_pickup" ON "public"."client_pickup_requests" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "cliente_select_pickup" ON "public"."client_pickup_requests" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin_or_operations"()));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_delete_policy" ON "public"."clientes" FOR DELETE TO "authenticated" USING ("public"."can_delete_cliente"("id"));



CREATE POLICY "clientes_insert_policy" ON "public"."clientes" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_insert_cliente"());



CREATE POLICY "clientes_select_policy" ON "public"."clientes" FOR SELECT TO "authenticated" USING ("public"."can_select_cliente"("id"));



CREATE POLICY "clientes_update_policy" ON "public"."clientes" FOR UPDATE TO "authenticated" USING ("public"."can_update_cliente"("id")) WITH CHECK (("public"."is_approved_active_user"() AND ("public"."is_admin"() OR ("public"."is_role"(ARRAY['Ventas'::"text"]) AND ("deleted_at" IS NULL)))));



ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."container_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cost_validations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_validations_delete_policy" ON "public"."cost_validations" FOR DELETE TO "authenticated" USING ("public"."can_manage_cost_validation"("quotation_id"));



CREATE POLICY "cost_validations_insert_policy" ON "public"."cost_validations" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_cost_validation"("quotation_id"));



CREATE POLICY "cost_validations_select_policy" ON "public"."cost_validations" FOR SELECT TO "authenticated" USING ("public"."can_manage_cost_validation"("quotation_id"));



CREATE POLICY "cost_validations_update_policy" ON "public"."cost_validations" FOR UPDATE TO "authenticated" USING ("public"."can_manage_cost_validation"("quotation_id")) WITH CHECK ("public"."can_manage_cost_validation"("quotation_id"));



ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuentas_pagar" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cuentas_pagar_finance_read" ON "public"."cuentas_pagar" FOR SELECT TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



CREATE POLICY "cuentas_pagar_finance_write" ON "public"."cuentas_pagar" TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"])) WITH CHECK ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



ALTER TABLE "public"."garantias_navieras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_delete_policy" ON "public"."invoice_items" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND "public"."can_access_invoice"("invoice_id")));



CREATE POLICY "invoice_items_insert_policy" ON "public"."invoice_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id")));



CREATE POLICY "invoice_items_select_policy" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ("public"."can_access_invoice"("invoice_id"));



CREATE POLICY "invoice_items_update_policy" ON "public"."invoice_items" FOR UPDATE TO "authenticated" USING (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id"))) WITH CHECK (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id")));



ALTER TABLE "public"."invoice_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_payments_delete_policy" ON "public"."invoice_payments" FOR DELETE TO "authenticated" USING (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id")));



CREATE POLICY "invoice_payments_insert_policy" ON "public"."invoice_payments" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id")));



CREATE POLICY "invoice_payments_select_policy" ON "public"."invoice_payments" FOR SELECT TO "authenticated" USING ("public"."can_access_invoice"("invoice_id"));



CREATE POLICY "invoice_payments_update_policy" ON "public"."invoice_payments" FOR UPDATE TO "authenticated" USING (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id"))) WITH CHECK (("public"."can_manage_finance"() AND "public"."can_access_invoice"("invoice_id")));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete_policy" ON "public"."invoices" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "invoices_insert_policy" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_finance"());



CREATE POLICY "invoices_select_policy" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("public"."can_manage_finance"() AND ("deleted_at" IS NULL)));



CREATE POLICY "invoices_update_policy" ON "public"."invoices" FOR UPDATE TO "authenticated" USING ("public"."can_manage_finance"()) WITH CHECK ("public"."can_manage_finance"());



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_auth_read" ON "public"."leads" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "leads_public_insert" ON "public"."leads" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."locations_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."miami_incidencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miami_incidencias_admin_ops_all" ON "public"."miami_incidencias" TO "authenticated" USING ("public"."is_admin_or_operations"()) WITH CHECK ("public"."is_admin_or_operations"());



CREATE POLICY "miami_incidencias_cliente_insert" ON "public"."miami_incidencias" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"())));



CREATE POLICY "miami_incidencias_cliente_select" ON "public"."miami_incidencias" FOR SELECT TO "authenticated" USING (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"())));



ALTER TABLE "public"."miami_manifests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miami_manifests_admin_ops_all" ON "public"."miami_manifests" TO "authenticated" USING ("public"."is_admin_or_operations"()) WITH CHECK ("public"."is_admin_or_operations"());



ALTER TABLE "public"."miami_packages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miami_packages_admin_ops_all" ON "public"."miami_packages" TO "authenticated" USING ("public"."is_admin_or_operations"()) WITH CHECK ("public"."is_admin_or_operations"());



CREATE POLICY "miami_packages_cliente_select" ON "public"."miami_packages" FOR SELECT TO "authenticated" USING (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"())));



ALTER TABLE "public"."miami_pre_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "miami_pre_alerts_admin_ops_select" ON "public"."miami_pre_alerts" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_operations"());



CREATE POLICY "miami_pre_alerts_cliente_all" ON "public"."miami_pre_alerts" TO "authenticated" USING (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"()))) WITH CHECK (("public"."is_cliente"() AND ("cliente_id" = "public"."current_user_cliente_id"())));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."package_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos_proveedor" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pagos_proveedor_finance_read" ON "public"."pagos_proveedor" FOR SELECT TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



CREATE POLICY "pagos_proveedor_finance_write" ON "public"."pagos_proveedor" TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"])) WITH CHECK ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



ALTER TABLE "public"."ports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_items_delete_policy" ON "public"."pricing_items" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "pricing_items_insert_policy" ON "public"."pricing_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_approved_active_user"());



CREATE POLICY "pricing_items_select_policy" ON "public"."pricing_items" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "pricing_items_update_policy" ON "public"."pricing_items" FOR UPDATE TO "authenticated" USING ("public"."is_approved_active_user"()) WITH CHECK ("public"."is_approved_active_user"());



ALTER TABLE "public"."profile_role_change_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proveedores_finance_read" ON "public"."proveedores" FOR SELECT TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



CREATE POLICY "proveedores_finance_write" ON "public"."proveedores" TO "authenticated" USING ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"])) WITH CHECK ("public"."is_role"(ARRAY['Admin'::"text", 'Finanzas'::"text", 'Contabilidad'::"text"]));



ALTER TABLE "public"."provider_invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_invoice_items_delete_policy" ON "public"."provider_invoice_items" FOR DELETE TO "authenticated" USING ("public"."can_manage_provider_invoice_item"("quotation_id"));



CREATE POLICY "provider_invoice_items_insert_policy" ON "public"."provider_invoice_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_provider_invoice_item"("quotation_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "provider_invoice_items_select_policy" ON "public"."provider_invoice_items" FOR SELECT TO "authenticated" USING ("public"."can_select_provider_invoice_item"("quotation_id"));



CREATE POLICY "provider_invoice_items_update_policy" ON "public"."provider_invoice_items" FOR UPDATE TO "authenticated" USING ("public"."can_manage_provider_invoice_item"("quotation_id")) WITH CHECK ("public"."can_manage_provider_invoice_item"("quotation_id"));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens_cliente_all" ON "public"."push_tokens" TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."quotation_cargo_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_cargo_lines_delete_policy" ON "public"."quotation_cargo_lines" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR "public"."can_select_quotation"("quotation_id")));



CREATE POLICY "quotation_cargo_lines_insert_policy" ON "public"."quotation_cargo_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_select_quotation"("quotation_id"));



CREATE POLICY "quotation_cargo_lines_select_policy" ON "public"."quotation_cargo_lines" FOR SELECT TO "authenticated" USING ("public"."can_select_quotation"("quotation_id"));



CREATE POLICY "quotation_cargo_lines_update_policy" ON "public"."quotation_cargo_lines" FOR UPDATE TO "authenticated" USING ("public"."can_select_quotation"("quotation_id")) WITH CHECK ("public"."can_select_quotation"("quotation_id"));



ALTER TABLE "public"."quotation_change_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_change_logs_insert_policy" ON "public"."quotation_change_logs" FOR INSERT TO "authenticated" WITH CHECK ((("changed_by" = "auth"."uid"()) AND "public"."can_select_quotation"("quotation_id")));



CREATE POLICY "quotation_change_logs_select_policy" ON "public"."quotation_change_logs" FOR SELECT TO "authenticated" USING (("public"."is_role"(ARRAY['Admin'::"text"]) OR ("changed_by" = "auth"."uid"()) OR "public"."can_select_quotation"("quotation_id")));



ALTER TABLE "public"."quotation_containers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_containers_delete_policy" ON "public"."quotation_containers" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR "public"."can_select_quotation"("quotation_id")));



CREATE POLICY "quotation_containers_insert_policy" ON "public"."quotation_containers" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_select_quotation"("quotation_id"));



CREATE POLICY "quotation_containers_select_policy" ON "public"."quotation_containers" FOR SELECT TO "authenticated" USING ("public"."can_select_quotation"("quotation_id"));



CREATE POLICY "quotation_containers_update_policy" ON "public"."quotation_containers" FOR UPDATE TO "authenticated" USING ("public"."can_select_quotation"("quotation_id")) WITH CHECK ("public"."can_select_quotation"("quotation_id"));



ALTER TABLE "public"."quotation_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_status_history_insert_policy" ON "public"."quotation_status_history" FOR INSERT TO "authenticated" WITH CHECK ((("changed_by" = "auth"."uid"()) AND "public"."can_select_quotation"("quotation_id")));



CREATE POLICY "quotation_status_history_select_policy" ON "public"."quotation_status_history" FOR SELECT TO "authenticated" USING (("public"."is_role"(ARRAY['Admin'::"text"]) OR ("changed_by" = "auth"."uid"()) OR "public"."can_select_quotation"("quotation_id")));



ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotations_delete_policy" ON "public"."quotations" FOR DELETE TO "authenticated" USING ("public"."can_delete_quotation"("id"));



CREATE POLICY "quotations_insert_policy" ON "public"."quotations" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_approved_active_user"() AND ("created_by" = "auth"."uid"()) AND "public"."is_role"(ARRAY['Admin'::"text", 'Ventas'::"text"])));



CREATE POLICY "quotations_select_policy" ON "public"."quotations" FOR SELECT TO "authenticated" USING ("public"."can_select_quotation_row"("id", "status", "deleted_at"));



CREATE POLICY "quotations_update_policy" ON "public"."quotations" FOR UPDATE TO "authenticated" USING ("public"."can_update_quotation"("id")) WITH CHECK ("public"."is_approved_active_user"());



ALTER TABLE "public"."shipping_instruction_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shipping_instruction_events_delete_policy" ON "public"."shipping_instruction_events" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shipping_instruction_events_insert_policy" ON "public"."shipping_instruction_events" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."can_update_shipping_instruction"("shipping_instruction_id")));



CREATE POLICY "shipping_instruction_events_select_policy" ON "public"."shipping_instruction_events" FOR SELECT TO "authenticated" USING ("public"."can_select_shipping_instruction"("shipping_instruction_id"));



CREATE POLICY "shipping_instruction_events_update_policy" ON "public"."shipping_instruction_events" FOR UPDATE TO "authenticated" USING ("public"."can_manage_operations"()) WITH CHECK ("public"."can_manage_operations"());



ALTER TABLE "public"."shipping_instructions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shipping_instructions_delete_policy" ON "public"."shipping_instructions" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shipping_instructions_insert_policy" ON "public"."shipping_instructions" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_insert_shipping_instruction"("quotation_id", "created_by"));



CREATE POLICY "shipping_instructions_select_policy" ON "public"."shipping_instructions" FOR SELECT TO "authenticated" USING ("public"."can_select_shipping_instruction"("id"));



CREATE POLICY "shipping_instructions_update_policy" ON "public"."shipping_instructions" FOR UPDATE TO "authenticated" USING ("public"."can_update_shipping_instruction"("id")) WITH CHECK ("public"."is_approved_active_user"());



CREATE POLICY "staff_update_pickup" ON "public"."client_pickup_requests" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_operations"());



ALTER TABLE "public"."surcharge_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "surcharge_rules_delete_policy" ON "public"."surcharge_rules" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "surcharge_rules_insert_policy" ON "public"."surcharge_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_pricing_catalogs"());



CREATE POLICY "surcharge_rules_select_policy" ON "public"."surcharge_rules" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "surcharge_rules_update_policy" ON "public"."surcharge_rules" FOR UPDATE TO "authenticated" USING ("public"."can_manage_pricing_catalogs"()) WITH CHECK ("public"."can_manage_pricing_catalogs"());



ALTER TABLE "public"."tax_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_rates_delete_policy" ON "public"."tax_rates" FOR DELETE TO "authenticated" USING (("public"."is_approved_active_user"() AND "public"."is_role"(ARRAY['Admin'::"text", 'Contabilidad'::"text"])));



CREATE POLICY "tax_rates_insert_policy" ON "public"."tax_rates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_approved_active_user"() AND "public"."is_role"(ARRAY['Admin'::"text", 'Contabilidad'::"text"])));



CREATE POLICY "tax_rates_select_policy" ON "public"."tax_rates" FOR SELECT TO "authenticated" USING ("public"."is_approved_active_user"());



CREATE POLICY "tax_rates_update_policy" ON "public"."tax_rates" FOR UPDATE TO "authenticated" USING (("public"."is_approved_active_user"() AND "public"."is_role"(ARRAY['Admin'::"text", 'Contabilidad'::"text"]))) WITH CHECK (("public"."is_approved_active_user"() AND "public"."is_role"(ARRAY['Admin'::"text", 'Contabilidad'::"text"])));



ALTER TABLE "public"."user_tasks" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."auto_match_pre_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_match_pre_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_match_pre_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."booking_id_from_storage_object_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_id_from_storage_object_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_id_from_storage_object_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_package_volume"() TO "anon";
GRANT ALL ON FUNCTION "public"."calc_package_volume"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_package_volume"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_bill_of_lading"("p_bl_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_bill_of_lading"("p_bl_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_bill_of_lading"("p_bl_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_invoice"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_invoice"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_invoice"("p_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_delete_cliente"("p_cliente_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_delete_cliente"("p_cliente_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_delete_cliente"("p_cliente_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_delete_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_delete_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_delete_quotation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_insert_cliente"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_insert_cliente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_insert_cliente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_insert_shipping_instruction"("p_quotation_id" "uuid", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_insert_shipping_instruction"("p_quotation_id" "uuid", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_insert_shipping_instruction"("p_quotation_id" "uuid", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_cost_validation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_cost_validation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_cost_validation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_finance"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_finance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_operations"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_operations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_operations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_pricing_catalogs"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_pricing_catalogs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_pricing_catalogs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_provider_invoice_item"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_provider_invoice_item"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_provider_invoice_item"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_booking"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_booking"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_cliente"("p_cliente_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_cliente"("p_cliente_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_cliente"("p_cliente_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_provider_invoice_item"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_provider_invoice_item"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_provider_invoice_item"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_quotation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_quotation_row"("p_quotation_id" "uuid", "p_status" "text", "p_deleted_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_quotation_row"("p_quotation_id" "uuid", "p_status" "text", "p_deleted_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_quotation_row"("p_quotation_id" "uuid", "p_status" "text", "p_deleted_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_select_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_select_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_select_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_update_cliente"("p_cliente_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_update_cliente"("p_cliente_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_update_cliente"("p_cliente_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_update_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_update_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_update_quotation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_update_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_update_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_update_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_cliente_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_cliente_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_cliente_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_cliente_codigo"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_cliente_codigo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_cliente_codigo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_quotation_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_quotation_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_quotation_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_routing_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_routing_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_routing_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_quotation_status_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_quotation_status_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_quotation_status_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_operations"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_operations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_operations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_active_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_active_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_active_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_cliente"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_cliente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_cliente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_role"("p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_role"("p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_role"("p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_sales_owner_of_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_sales_owner_of_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_sales_owner_of_shipping_instruction"("p_shipping_instruction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."next_manifest_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_manifest_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_manifest_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_warehouse_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_warehouse_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_warehouse_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_expired_selected_agent_quotes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_expired_selected_agent_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_expired_selected_agent_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_expired_selected_agent_quotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_change_by_non_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_change_by_non_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_change_by_non_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_manifest_package_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_manifest_package_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_manifest_package_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."uuid_from_text"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."uuid_from_text"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."uuid_from_text"("p_value" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_quote_container_rates" TO "anon";
GRANT ALL ON TABLE "public"."agent_quote_container_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_quote_container_rates" TO "service_role";



GRANT ALL ON TABLE "public"."agent_quotes" TO "anon";
GRANT ALL ON TABLE "public"."agent_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."agent_route_rates" TO "anon";
GRANT ALL ON TABLE "public"."agent_route_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_route_rates" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."bills_of_lading" TO "anon";
GRANT ALL ON TABLE "public"."bills_of_lading" TO "authenticated";
GRANT ALL ON TABLE "public"."bills_of_lading" TO "service_role";



GRANT ALL ON TABLE "public"."bl_amendments" TO "anon";
GRANT ALL ON TABLE "public"."bl_amendments" TO "authenticated";
GRANT ALL ON TABLE "public"."bl_amendments" TO "service_role";



GRANT ALL ON TABLE "public"."bl_containers" TO "anon";
GRANT ALL ON TABLE "public"."bl_containers" TO "authenticated";
GRANT ALL ON TABLE "public"."bl_containers" TO "service_role";



GRANT ALL ON TABLE "public"."bl_draft_sends" TO "anon";
GRANT ALL ON TABLE "public"."bl_draft_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."bl_draft_sends" TO "service_role";



GRANT ALL ON TABLE "public"."booking_containers" TO "anon";
GRANT ALL ON TABLE "public"."booking_containers" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_containers" TO "service_role";



GRANT ALL ON TABLE "public"."booking_documents" TO "anon";
GRANT ALL ON TABLE "public"."booking_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_documents" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."cai_ranges" TO "anon";
GRANT ALL ON TABLE "public"."cai_ranges" TO "authenticated";
GRANT ALL ON TABLE "public"."cai_ranges" TO "service_role";



GRANT ALL ON TABLE "public"."client_addresses" TO "anon";
GRANT ALL ON TABLE "public"."client_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."client_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."client_notes" TO "anon";
GRANT ALL ON TABLE "public"."client_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."client_notes" TO "service_role";



GRANT ALL ON TABLE "public"."client_notifications" TO "anon";
GRANT ALL ON TABLE "public"."client_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."client_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."client_pickup_requests" TO "anon";
GRANT ALL ON TABLE "public"."client_pickup_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."client_pickup_requests" TO "service_role";



GRANT ALL ON TABLE "public"."client_rates" TO "anon";
GRANT ALL ON TABLE "public"."client_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."client_rates" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_history" TO "anon";
GRANT ALL ON TABLE "public"."cliente_history" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_history" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clientes_codigo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clientes_codigo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clientes_codigo_seq" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."container_types" TO "anon";
GRANT ALL ON TABLE "public"."container_types" TO "authenticated";
GRANT ALL ON TABLE "public"."container_types" TO "service_role";



GRANT ALL ON TABLE "public"."cost_validations" TO "anon";
GRANT ALL ON TABLE "public"."cost_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_validations" TO "service_role";



GRANT ALL ON TABLE "public"."countries" TO "anon";
GRANT ALL ON TABLE "public"."countries" TO "authenticated";
GRANT ALL ON TABLE "public"."countries" TO "service_role";



GRANT ALL ON TABLE "public"."cuentas_pagar" TO "anon";
GRANT ALL ON TABLE "public"."cuentas_pagar" TO "authenticated";
GRANT ALL ON TABLE "public"."cuentas_pagar" TO "service_role";



GRANT ALL ON TABLE "public"."garantias_navieras" TO "anon";
GRANT ALL ON TABLE "public"."garantias_navieras" TO "authenticated";
GRANT ALL ON TABLE "public"."garantias_navieras" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_payments" TO "anon";
GRANT ALL ON TABLE "public"."invoice_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_payments" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."locations_catalog" TO "anon";
GRANT ALL ON TABLE "public"."locations_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."locations_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."miami_incidencias" TO "anon";
GRANT ALL ON TABLE "public"."miami_incidencias" TO "authenticated";
GRANT ALL ON TABLE "public"."miami_incidencias" TO "service_role";



GRANT ALL ON TABLE "public"."miami_manifests" TO "anon";
GRANT ALL ON TABLE "public"."miami_manifests" TO "authenticated";
GRANT ALL ON TABLE "public"."miami_manifests" TO "service_role";



GRANT ALL ON TABLE "public"."miami_packages" TO "anon";
GRANT ALL ON TABLE "public"."miami_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."miami_packages" TO "service_role";



GRANT ALL ON TABLE "public"."miami_pre_alerts" TO "anon";
GRANT ALL ON TABLE "public"."miami_pre_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."miami_pre_alerts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."miami_wh_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."miami_wh_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."miami_wh_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."package_types" TO "anon";
GRANT ALL ON TABLE "public"."package_types" TO "authenticated";
GRANT ALL ON TABLE "public"."package_types" TO "service_role";



GRANT ALL ON TABLE "public"."pagos_proveedor" TO "anon";
GRANT ALL ON TABLE "public"."pagos_proveedor" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos_proveedor" TO "service_role";



GRANT ALL ON TABLE "public"."ports" TO "anon";
GRANT ALL ON TABLE "public"."ports" TO "authenticated";
GRANT ALL ON TABLE "public"."ports" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_items" TO "anon";
GRANT ALL ON TABLE "public"."pricing_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_items" TO "service_role";



GRANT ALL ON TABLE "public"."profile_role_change_logs" TO "anon";
GRANT ALL ON TABLE "public"."profile_role_change_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_role_change_logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON TABLE "public"."provider_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."provider_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_cargo_lines" TO "anon";
GRANT ALL ON TABLE "public"."quotation_cargo_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_cargo_lines" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_change_logs" TO "anon";
GRANT ALL ON TABLE "public"."quotation_change_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_change_logs" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_containers" TO "anon";
GRANT ALL ON TABLE "public"."quotation_containers" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_containers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."quotation_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."quotation_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."quotation_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_status_history" TO "anon";
GRANT ALL ON TABLE "public"."quotation_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."routing_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."routing_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."routing_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_instruction_events" TO "anon";
GRANT ALL ON TABLE "public"."shipping_instruction_events" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_instruction_events" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_instructions" TO "anon";
GRANT ALL ON TABLE "public"."shipping_instructions" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_instructions" TO "service_role";



GRANT ALL ON TABLE "public"."surcharge_rules" TO "anon";
GRANT ALL ON TABLE "public"."surcharge_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."surcharge_rules" TO "service_role";



GRANT ALL ON TABLE "public"."tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."tax_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_rates" TO "service_role";



GRANT ALL ON TABLE "public"."user_tasks" TO "anon";
GRANT ALL ON TABLE "public"."user_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tasks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "authenticated-select 1jwhfh0_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'miami-package-photos'::text));



  create policy "booking_documents_storage_delete_policy"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'booking-documents'::text) AND public.is_admin_or_operations() AND public.can_select_booking(public.booking_id_from_storage_object_name(name))));



  create policy "booking_documents_storage_insert_policy"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'booking-documents'::text) AND public.is_admin_or_operations() AND public.can_select_booking(public.booking_id_from_storage_object_name(name))));



  create policy "booking_documents_storage_select_policy"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'booking-documents'::text) AND public.can_select_booking(public.booking_id_from_storage_object_name(name))));



  create policy "booking_documents_storage_update_policy"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'booking-documents'::text) AND public.is_admin_or_operations() AND public.can_select_booking(public.booking_id_from_storage_object_name(name))))
with check (((bucket_id = 'booking-documents'::text) AND public.is_admin_or_operations() AND public.can_select_booking(public.booking_id_from_storage_object_name(name))));



  create policy "proveedor_docs_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'proveedor-docs'::text) AND (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Finanzas'::text, 'Contabilidad'::text]))));



  create policy "proveedor_docs_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'proveedor-docs'::text) AND (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Finanzas'::text, 'Contabilidad'::text]))));



  create policy "proveedor_docs_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'proveedor-docs'::text) AND (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Finanzas'::text, 'Contabilidad'::text]))));



  create policy "proveedor_docs_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'proveedor-docs'::text) AND (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Finanzas'::text, 'Contabilidad'::text]))))
with check (((bucket_id = 'proveedor-docs'::text) AND (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Finanzas'::text, 'Contabilidad'::text]))));



  create policy "staff-upload 1jwhfh0_0"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'miami-package-photos'::text));



