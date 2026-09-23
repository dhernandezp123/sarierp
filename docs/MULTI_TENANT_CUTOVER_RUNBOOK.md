# Runbook de corte multiempresa

Estado: preparado, no autorizado para ejecución.
Objetivo inicial: habilitar Sari en `sari.forwarders.app` sin crear todavía un
tenant real para MYA.

## Condiciones de entrada

No iniciar la ventana si falta cualquiera de estas condiciones:

- autorización explícita del responsable del sistema;
- UAT manual firmado sobre una copia reciente de Production;
- respaldo completo y restauración ensayada;
- cero cotizaciones, facturas, bookings o archivos en escritura durante el
  corte;
- acceso confirmado a Supabase, hosting, DNS y proveedor de identidad;
- operador de rollback y canal de comunicación disponibles;
- mismo commit de aplicación, migraciones y documentación aprobado para el
  corte.

## Paquete SQL y orden

Aplicar estrictamente por versión:

1. `20260921120000_phase1_multitenant_foundation.sql`
2. `20260921130000_phase2_tenant_company_settings.sql`
3. `20260921140000_phase3_commercial_tenant_isolation.sql`
4. `20260921141000_fix_phase3_parent_tenant_guard.sql`
5. `20260921142000_phase3_profile_reference_integrity.sql`
6. `20260921143000_phase3_tenant_delete_guards.sql`
7. `20260921150000_phase4_operations_tenant_isolation.sql`
8. `20260921151000_phase4_operations_tenant_helpers.sql`
9. `20260921160000_phase5_finance_catalog_tenant_isolation.sql`
10. `20260921161000_phase5_finance_tenant_helpers.sql`
11. `20260921162000_phase5_invoice_entrypoint.sql`
12. `20260921163000_phase5_freight_payable_conflict.sql`
13. `20260921164000_phase5_internal_function_privileges.sql`
14. `20260921170000_phase6_portal_support_tenant_isolation.sql`
15. `20260921171000_phase6_tenant_storage_policies.sql`
16. `20260921180000_phase7_tenant_hostname_resolution.sql`
17. `20260921181000_phase7_sari_branding_bootstrap.sql`
18. `20260921190000_phase8_main_platform_admin.sql`

No ejecutar archivos de `supabase/tests/` contra Production.

## Duración de referencia

Reservar inicialmente una ventana de 90 minutos:

- 15 minutos: congelamiento, comunicaciones y preflight final;
- 15 minutos: respaldo y verificación de restaurabilidad;
- 20 minutos: aplicación de migraciones;
- 25 minutos: postflight técnico y smoke test autenticado;
- 15 minutos: margen de decisión o rollback.

La ejecución SQL fue rápida localmente, pero esa medición no representa el
volumen ni los locks de Production. Ajustar la ventana solo después del ensayo
con una copia reciente.

## Respaldo

1. Activar modo mantenimiento o congelar escritores.
2. Crear un backup gestionado/PITR de Supabase con timestamp y retención
   confirmada.
3. Generar adicionalmente un dump lógico de esquema y datos con la CLI aprobada
   para el proyecto vinculado.
4. Registrar tamaño, checksum, hora, responsable y ubicación protegida.
5. Restaurar el backup en un proyecto aislado y comprobar que abre antes de
   ejecutar el corte.

Nunca incluir secretos ni dumps con datos reales en Git.

## Preflight

Registrar evidencia de:

- versión máxima y lista completa de `supabase_migrations.schema_migrations`;
- conteo por cada tabla que recibirá `tenant_id`;
- filas huérfanas en cliente, cotización, SI, Shipment, Booking, BL, invoice,
  proveedor, soporte y Storage;
- duplicados que pasarán de unicidad global a unicidad por tenant;
- perfiles sin tenant resoluble o con combinaciones inválidas de rol, estado y
  `is_active`;
- objetos de Storage sin registro padre o con una ruta no reconocible;
- hostname `sari.forwarders.app` libre de duplicados;
- ausencia de transacciones largas, migraciones pendientes no incluidas y
  sesiones de escritura de usuarios.

Abortar si aparece una fila sin propietario, una relación cross-tenant, un
objeto privado sin padre, una función `SECURITY DEFINER` inválida o un resultado
distinto al ensayo aprobado.

## Ejecución futura

1. Confirmar el congelamiento y tomar la huella de conteos.
2. Aplicar las 18 migraciones mediante el mecanismo aprobado de Supabase.
3. No continuar con hosting ni DNS si una migración falla.
4. Ejecutar postflight SQL antes de desplegar la aplicación.
5. Desplegar exactamente el build certificado.
6. Configurar variables y redirects autorizados del hostname Sari.
7. Habilitar DNS/TLS para Sari únicamente después del smoke test por URL
   temporal o preview controlado.
8. Mantener MYA deshabilitada.

## Postflight

Debe cumplirse todo lo siguiente:

- historial en `20260921190000` sin versiones faltantes;
- un único tenant Sari activo y un dominio principal
  `sari.forwarders.app` activo;
- todos los `tenant_id` obligatorios, sin nulos ni referencias a un tenant
  inexistente;
- conteos de negocio iguales a la huella preflight, salvo filas de bootstrap
  documentadas (`tenants`, `tenant_domains` y configuración Sari);
- RLS habilitado, guards instalados y funciones críticas con permisos mínimos;
- `db lint` sin errores;
- login, dashboard, cotización, PDF, Pricing, SI, Booking, facturación, portal,
  soporte y archivos funcionan para Sari;
- dominio raíz, desconocido e inactivo fallan según diseño;
- ningún correo, enlace o archivo genera un hostname ajeno.

La observación mínima posterior al corte será de 30 minutos sin levantar el
congelamiento completo hasta validar creación y lectura de una cotización de
control.

## Rollback

No existen migraciones `down` seguras para revertir ownership, claves y RLS.

- Si falla SQL antes de completar una migración, detenerse: cada archivo es
  transaccional y debe revertirse por PostgreSQL.
- Si SQL termina pero falla el postflight de integridad, mantener escrituras
  congeladas y restaurar el backup completo en el mismo punto temporal.
- Si la base pasa y solo falla la aplicación, preferir roll-forward. El rollback
  de aplicación requiere comprobar primero compatibilidad con las nuevas RLS.
- Si falla DNS/TLS, retirar únicamente el registro nuevo y conservar la URL
  anterior mientras se corrige; no restaurar la base por un fallo de DNS.
- Si hubo escrituras después del corte, no restaurar un backup sin un plan de
  reconciliación aprobado: se perderían datos posteriores.

Documentar decisión, hora, responsable, evidencia y efecto para usuarios. No
habilitar MYA como parte de un rollback o contingencia.
