# Release HR — Production

## Ampliación HR-10 del 23/11/2026

Publicado: PR #2 / `58809cc`, migración HR-10 instalada y verificada y Vercel Production READY. [Evidencia del release](uat/hr-benefit-production-release-2026-11-23.json). El paquete siguiente queda para registro/recuperación; no reaplicarlo sobre HR-10 existente.

El cálculo de prestaciones añade exclusivamente `20261123120000_hr_automatic_benefits.sql` sobre HR-08 ya instalado. `node scripts/prepare-hr-benefit-release.mjs` genera SQL y manifiesto en `.ua/intermediate/`: valida ambiente/tenant, versión previa `20261120171000`, hash de HR-08, ausencia de instalación parcial y RLS/permisos; registra fuente y recarga PostgREST en la misma transacción. No conecta ni aplica. Revisar y ensayar con rollback antes de confirmar; si la respuesta se pierde, consultar historial/hash antes de reintentar. El paquete histórico de seis migraciones que sigue abajo no debe ejecutarse nuevamente.

Publicar desde la rama aislada `feat/hr-benefit-calculations-20261123`, con CI de aplicación/base de datos aprobado. Aplicar solo el paquete HR-10 después del respaldo revisado, comprobar huella instalada y conservación de datos/RPC previas, e integrar la aplicación para que Vercel reconstruya con sus variables de Production. No reutilizar `.next` UAT ni ejecutar `db push --include-all`. Smoke añade `/rrhh/calculos` y `/api/hr/benefits/:id`; ambos requieren sesión. La conciliación de un caso real y los datos salariales permanecen como activación operativa separada.

Publicado el 20/11/2026 desde a3d13c4. SQL de seis versiones aplicado y hashes/RLS/Storage comprobados; CI y smoke público exitosos. [Registro de publicación](uat/hr-production-release-2026-11-20.json). El procedimiento siguiente se conserva como registro y recuperación; no volver a ejecutar la instalación sobre HR ya aplicado. La configuración real y UAT operativa siguen pendientes.

Candidato aislado: `release/hr-module-20261120`, basado inicialmente en `origin/main` 2241df7 e integrado con compras 0d2184a mediante c305ffb. El árbol principal con trabajo concurrente de clientes/compras no forma parte del candidato. No ejecutar `git add .` ni un `supabase db push` general.

## Evidencia previa

- [Validación local final](uat/hr-phases-3-5-validation-2026-11-20.json), [cierre HR-01/02](uat/hr-release-validation-2026-11-20.json), [política configurable de nómina](hr-payroll-policy.md).
- TypeScript, ESLint enfocado, estándar financiero y 691 pruebas Node; build de producción local con postbuild OCR; siete suites SQL HR/compras en rollback; Auth/PostgREST/Storage reales locales y navegador 1280/768/390. Ver resultados y límites exactos en la evidencia.
- Production identificado: proyecto Supabase `fwspgdzvlbtbgiupvrzo`, dominio `sari.forwarders.app`. En el preflight no había tablas/migraciones HR ni bucket de firmas; última migración `20261120140000` (compras, publicada durante este trabajo). Repetir antes de aplicar.
- Variables de Production presentes: servicio Supabase, Resend, `OUTBOUND_EMAIL_ENABLED`, `CRON_SECRET`. Verificar vigencia sin mostrar sus valores. El ambiente verificado de la base es el control definitivo para correo; Demo siempre lo bloquea.

## Respaldo y recuperación

Se revisaron separadamente los jobs de BD y Storage del repositorio existente `dhernandezp123/sarierp-backups`: BD previo al cambio [44827716879](https://github.com/dhernandezp123/sarierp-backups/actions/runs/44827716879), Storage completo [43731317743](https://github.com/dhernandezp123/sarierp-backups/actions/runs/43731317743), salud posterior [44827887541](https://github.com/dhernandezp123/sarierp-backups/actions/runs/44827887541). El job de BD no equivale a un respaldo de Storage. El último restore verificado es [42292324814](https://github.com/dhernandezp123/sarierp-backups/actions/runs/42292324814), del 06/11/2026; no se ejecutó un restore nuevo en este trabajo.

El script existente enumera todos los buckets S3, de modo que incorpora `hr-signed-documents` en el siguiente snapshot sin añadirlo a una lista fija. La salud usa marcadores de finalización y comprueba archivo/checksum. No se inició una transferencia nueva de documentos reales a runners externos. Refrescar la verificación de salud y respaldar BD antes de aplicar según la ventana de cambio; un restore nuevo de documentos sensibles conserva su requisito de autorización.

Rollback de aplicación: volver al despliegue anterior y conservar tablas, ledger, nóminas y documentos HR. No eliminar tablas/bucket con registros de uso real ni borrar historia de migraciones. Si la transacción SQL falla, todo el paquete se revierte; si se pierde la respuesta, primero consultar catálogo e historial, no ejecutar ciegamente otra vez. Una reversión de nómina utiliza la RPC propia y conserva asiento y reverso.

## SQL previsto

Orden exclusivo, con versiones separadas del trabajo concurrente de compras:

1. `20261118120000_hr_employees_and_leave.sql`
2. `20261119120000_hr_vacation_periods.sql`
3. `20261120141000_hr_activity_and_calendar.sql`
4. `20261120151000_hr_certificates_and_private_documents.sql`
5. `20261120161000_hr_email_outbox.sql`
6. `20261120171000_hr_payroll.sql`

`node scripts/prepare-hr-release.mjs` genera SQL y manifiesto SHA-256 en `.ua/intermediate/`, sin conectar ni aplicar nada. Revisar ese resultado y su guardia de ambiente/tenant/historial. La transacción aplica solamente los seis archivos, registra sus fuentes en el historial estándar y verifica bucket privado y RPC exclusivas del servidor. No se usa `db push --include-all`, porque HR-01 tiene una versión anterior a una migración de clientes ya aplicada.

## Publicación y smoke

1. Commit solo del candidato HR; push de rama y Quality de ese head exacto. Resolver fallos antes de integrar.
2. Refrescar preflight y salud de respaldo; aplicar el SQL previsto al proyecto identificado y comprobar exactamente las seis versiones. Confirmar RLS en todas las tablas HR y que el bucket siga privado. No cargar filas sintéticas ni enviar correos de prueba a empleados reales.
3. Publicar la aplicación con variables de **Production**. El `.next` local contiene configuración de UAT sintética y no debe copiarse al despliegue. Vercel debe reconstruir desde fuente con sus variables propias.
4. Smoke público: login y redirecciones de `/rrhh`, rutas privadas sin sesión, cron sin secreto denegado, activos y ausencia de errores de servidor. Verificar el deployment y commit reales; un HTTP 200 de login no demuestra UAT autenticada.
5. Administración configura fichas, vínculos, jornada, feriados, anticipos, apertura de saldos y condiciones salariales/cuentas. No inventar datos faltantes. Conciliar el primer flujo real antes de aprobar remuneraciones. Correo aceptado por Resend no equivale a entregado al buzón.

La puesta en marcha con datos reales, la recepción efectiva del primer aviso y la primera nómina conciliada tienen evidencia propia; no se cierran con pruebas locales ni con el smoke público.
