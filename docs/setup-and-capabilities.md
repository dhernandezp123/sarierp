# Puesta en marcha y capacidades

Esta guía describe el código versionado, no certifica configuración remota.
Usar la [matriz de release](release/audit-release-matrix.md) para el estado de
despliegue/UAT. Nunca copiar secretos ni datos de producción al repositorio.

## Desarrollo local reproducible

1. Instalar Node 22, npm y Docker Desktop. Ejecutar `npm ci` en la raíz.
2. Crear un stack Supabase local desechable mediante `npx supabase start`.
   Configuración: project_id sarierp, API 54321, PostgreSQL 54322. Para mantener
   otro stack existente, preparar una copia de configuración con project_id y
   puertos distintos; no resetear ni detener un proyecto ajeno a la prueba.
3. Copiar `config/development.env.example` a `.env.local`. Consultar las claves
   locales con `npx supabase status`; reemplazar placeholders sin publicarlos.
   No mezclar URL remota con claves del stack local.
4. Confirmar que el tenant Sari está activo y tiene dominio activo
   sari.forwarders.app. Las migraciones multiempresa incluyen el contexto Sari;
   seed.sql está vacío y no crea usuarios de negocio ni credenciales.
5. Iniciar `npm run dev`; el hook predev sincroniza los assets OCR instalados.
   Abrir http://sari.localhost:3000. LOCAL_TENANT_HOSTNAME permite usar
   localhost:3000; no configura DNS ni crea tenant_domains automáticamente.
6. Registrar únicamente cuentas sintéticas. El acceso requiere perfil con rol,
   estado Aprobado e is_active. Un administrador autorizado del ambiente de
   pruebas debe aprobar/vincular la cuenta. Para una base sin administrador,
   provisionar el primer perfil exclusivamente desde la consola local con el
   propietario de la base, identificando usuario y tenant; no agregar un bypass
   de login/RLS ni convertir registros en administradores automáticamente.
7. Ejecutar TypeScript, tests, lint:ci y build. Para pruebas SQL aisladas seguir
   el workflow y scripts de auditoría. No usar service_role en el navegador.

## Variables y límites

| Grupo | Variables | Alcance y valor inicial |
| --- | --- | --- |
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Público, misma base; RLS y sesión obligatorios |
| Servidor | SUPABASE_SERVICE_ROLE_KEY | Solo API/servidor; nunca NEXT_PUBLIC ni cliente |
| Tenant/callback | LOCAL_TENANT_HOSTNAME, NEXT_PUBLIC_SITE_URL | Dominio del tenant local y URL de callbacks permitida en Auth; no reemplazan tenant_domains |
| Demo/Trial | APP_ENV, NEXT_PUBLIC_APP_ENV | demo bloquea correo; producción no se acredita con estas variables |
| Correo | OUTBOUND_EMAIL_ENABLED, RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_REPLY_TO | Desactivado localmente; exige ambiente verificado en platform_environment y dominio del tenant |
| OCR externo opcional | MANUAL_INVOICE_OCR_ENABLED, OPENAI_API_KEY, MANUAL_INVOICE_OCR_MODEL | Desactivado por defecto; OCR gratuito del navegador no requiere estas claves |
| Outlook | SARI_OUTLOOK_DIRECTORY_ID, SARI_OUTLOOK_CLIENT_ID, SARI_OUTLOOK_CLIENT_SECRET, SARI_OUTLOOK_RUN_SECRET | Sin configurar mientras OUTLOOK_INTAKE_STANDBY sea true |

Cambiar NEXT_PUBLIC requiere reconstruir/publicar. Para producción verificar
hostname HTTPS, dominios tenant activos, callbacks de Auth, buckets privados,
migraciones/RLS y claves aisladas. No sustituir un fallo de entorno de correo
por una clave administrativa o una variable production. [Guard y UAT](uat/aud07-email-environment.md).

## Mapa de capacidades

| Capacidad | Situación versionada | Criterio de habilitación |
| --- | --- | --- |
| Cotización, pricing, opciones y PDF | Flujos internos; snapshot de opción y notas comerciales | Roles/RLS, SQL del candidato y UAT comercial |
| SI, booking, BL y cierre | Documentos y estados operativos | Expediente integral y permisos por rol |
| Facturación ERP, cobros y AP | Flujo financiero separado | CAI/configuración fiscal aplicable, SQL y UAT de Finanzas |
| Miami/portal | Ingreso, WH, prealertas, transporte e incidencias | Tenant/cliente vinculado y UAT de portal |
| Scanner / factura manual SARI USA | Documentos independientes; historial paginado/buscable | No emite factura fiscal, no contabiliza ni crea CxC/AP |
| OCR en dispositivo | Assets propios sincronizados desde dependencias instaladas | Probar PDF/imagen sintética y cancelación; sin proveedor externo |
| OCR externo | Alternativa opcional con API del servidor | Activación explícita, clave y revisión de datos/costos |
| Correo transaccional | Guards de ambiente e idempotencia/conciliación | Proveedor simulado en pruebas; activación real autorizada |
| Outlook | Standby por decisión vigente | Cambio revisado, permisos Microsoft/UAT; no configurar scheduler ahora |

Procedimientos: [facturas manuales](manual-sari-usa-invoices.md),
[Outlook](outlook-intake-runbook.md), [soporte](support-ticketing-runbook.md),
[recuperación de avisos](uat/aud08-email-recovery.md).

## Diagnóstico habitual

- 404 “Empresa no encontrada”: revisar hostname, alias local, dominio activo y
  tenant en esa misma base. 503 indica que no se pudo verificar ese contexto.
- Login sin acceso: revisar aprobación/actividad/rol y tenant/cliente del perfil;
  no relajar RLS para solucionarlo.
- Correo bloqueado: comportamiento esperado en demo, standby, ambiente no
  verificable o salida desactivada. No probar con destinatarios reales.
- Lint completo rojo: consultar baseline y reducir deuda por módulo; el gate de
  CI debe seguir verde sin agregar excepciones para ocultar regresiones.
