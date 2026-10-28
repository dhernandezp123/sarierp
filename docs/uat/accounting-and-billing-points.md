# Contabilidad y facturación por oficina — ACC-01 / BILL-POS-01

SQL y frontend publicados el 26/10/2026. RLS de Contabilidad comprobado en sesión
SQL de solo lectura; falta guardar/reabrir con sesión de navegador. Production
no tenía rangos CAI ni facturas fiscales en el preflight: hay que registrar los
datos reales de San Pedro Sula y Tegucigalpa antes de emitir.

## Publicación

1. Inventariar en la base destino los rangos activos/inactivos de Sari: CAI,
   tipo, prefijo, límites, `next_number`, vigencia y lugar de emisión. Confirmar
   que pertenecen a SPS, como indicó el usuario. Guardar los valores y conteos
   para compararlos después; no imprimirlos en logs públicos.
2. Aplicar únicamente `20261026120000_accounting_access.sql` y después
   `20261026130000_billing_points_of_sale.sql`. Revisar el dry-run para evitar
   aplicar otras migraciones pendientes sin evaluación.
3. Comprobar que los rangos anteriores ahora indican San Pedro Sula y conservan
   CAI, límites, vigencia, actividad y siguiente correlativo. Comprobar que los
   números y snapshots/importes de facturas anteriores no cambiaron.
4. Publicar el frontend correspondiente después de ambas migraciones. Verificar
   la actualización del esquema de PostgREST (la migración incluye NOTIFY).
5. Contabilidad registra el CAI, rango completo, fecha límite y próximo número
   disponible de cada oficina en Configuración → Rangos CAI, seleccionando esa
   oficina. Si deja correlativo vacío se toma el inicio del rango autorizado.
   Activar el rango correspondiente a cada tipo documental que vaya a utilizar.

## Matriz de aceptación

| Sesión/acción | Resultado esperado |
| --- | --- |
| Contabilidad aprobada y activa → Clientes | Ver perfiles activos, incluso sin cotizaciones |
| Editar contacto/RTN/condiciones de un cliente y reabrir | Datos e historial persistidos |
| Contabilidad → crear cliente/eliminarlo | Sin acceso/acción; RLS rechaza escritura |
| Empresa y facturación → guardar y reabrir | Se permite crear/editar; ISV cero se conserva |
| Acciones rápidas → Ver / Editar Cliente | Acción disponible, puede abrir y guardar el perfil |
| Scanner / Factura manual | Acceso al módulo SARI USA ya existente en Sari |
| Cotización en cada estado | Detalle, utilidades y costos disponibles; no puede gestionar precios ni enviar al cliente |
| Reportes → Comercial/Finanzas | Carga completa y exportación CSV/PDF |
| Rangos CAI → SPS/TGU | Estado e historial filtrados por oficina |
| Registrar/activar CAI TGU | No desactiva SPS ni reinicia ninguno de sus correlativos |
| Nueva factura → elegir oficina | Muestra exclusivamente el CAI de esa oficina |
| TGU sin CAI, vencido o agotado | Rechaza emitir; SPS sigue disponible |
| Emitir documento ficticio en ambiente de pruebas por oficina y reabrir | CAI, prefijo, secuencia y oficina correctos en detalle/PDF/listado |
| NC/ND de factura TGU | Conserva oficina TGU y exige su rango del tipo de nota |
| Documento numerado → cambiar oficina directamente por API | Rechazado |
| Reporte Facturación → filtrar oficina, exportar CSV/PDF | Solo documentos del filtro; los históricos conservan el lugar registrado |
| Usuario de otra empresa, inactivo, pendiente o Cliente | Sin acceso a datos internos/operaciones ajenas |
| Admin, Ventas, Pricing, Operaciones y Finanzas | Conservan sus permisos previos |

No emitir documentos fiscales reales para realizar UAT. La validación local
utilizó fixtures aislados y no acredita la sesión ni el despliegue de Production.

## Evidencia local y deuda previa

Ver `HARDENING.md` para los resultados de Node, TypeScript, lint, build y SQL/RLS.
Se probaron veinte emisiones simultáneas de fixtures, diez por oficina, sin
números repetidos y con ambos siguientes correlativos en 11.

La suite histórica adicional `phase3_commercial_tenant_isolation.sql` falla por
actualización directa de estados en `guard_quotation_transition`, también en la
copia previa a los cambios. La matriz SQL/RLS de CI y las dos regresiones nuevas
se verifican por separado; ese fallo previo no se ha declarado resuelto.
