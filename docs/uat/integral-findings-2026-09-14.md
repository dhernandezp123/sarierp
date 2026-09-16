# Hallazgos integrales — 14/09/2026

Estado: SQL y frontend publicados y verificados el 16/09/2026; UAT autenticado pendiente.

## Cambios y aceptación

| ID | Corrección | Prueba de aceptación en ambiente desplegado |
| --- | --- | --- |
| INT-01 | Shipment sin tarifa de agente únicamente para `miami_lcl` y `miami_air`; cotización Ganada, permisos y clave de creación conservados. | Con Admin y Operaciones, crear SI desde Miami LCL/Aéreo ganadas. Repetir acción: mismo shipment. Otros productos requieren agente; una cotización no ganada no crea uno nuevo. Revisar carrier/días libres pendientes de completar, sin inventar valores. |
| INT-02 | Fecha CAI válida con año de cuatro dígitos en UI y triggers SQL. Bloqueo de emisión desde un rango histórico corrupto, sin consumir correlativo. | Teclear/pegar año de cinco dígitos, fecha imposible y fecha válida. Recargar y contrastar la fecha con el documento original. Auditar rangos existentes antes de cerrar. |
| INT-03 | Garantías consulta routing mediante la relación explícita de SI; errores de lectura recuperables, lectura paginada, acceso según rol, creación y recuperación con confirmación de resultado. | Abrir con Admin/Operaciones, registrar garantía con booking y sin booking, recargar, recuperar y recargar. Simular error de lectura/escritura. Cliente no accede. |
| INT-04 | `save_quotation_edit` guarda cabecera, hijos, pricing Miami y envío/historial en una transacción, con permisos invocador y estado esperado. | Editar contacto, descripción, notas, cantidad/peso y precios Miami. Enviar directamente a Pricing y recargar. Provocar fallo en hijos: nada cambia. Repetir con FCL y carga suelta no Miami. Ganada requiere el flujo de repricing existente. |
| INT-05 | Abrir CAI/Garantías no alterna cierre; mueve foco y desplaza al formulario. | Un clic abre y enfoca. Un segundo clic mantiene abierto. Cerrar/Cancelar funciona; repetir en móvil y teclado. |
| INT-06 | Contacto de cotización desde `clientes.contacto` en creación/edición. | Cambiar de cliente con contacto distinto de razón social. Sin contacto: campo vacío editable. Recargar tras guardar. |
| INT-07 | Cantidad/peso/dimensiones Miami visibles aunque falten tarifas; cálculo de precios condicionado a tarifas disponibles. | Cliente sin tarifas: permite capturar carga y explica requisito de tarifas; no muestra un precio listo ni permite guardar pricing incompleto. |
| INT-08 | Depósitos activos separados por moneda. | USD 100.25 y HNL 500.00 producen dos totales, nunca USD 600.25. |

## Publicación y datos históricos

1. Revisar y aplicar `supabase/migrations/20260914233000_integral_ux_flow_fixes.sql` antes de desplegar el frontend: el editor depende de `save_quotation_edit`. No incluye actualizaciones de fechas históricas ni documentos emitidos.
2. Auditar fechas con `docs/uat/integral-cai-audit.sql` usando acceso autorizado de solo lectura a producción. La inspección local no acredita el estado del esquema o datos remotos.
3. Las fechas anómalas requieren contraste con la autorización original. Registrar ID, valor anterior, valor correcto, evidencia y responsable antes de corregir. No truncar años automáticamente ni reescribir snapshots de facturas.
4. Ejecutar el guion por rol y registrar resultados. No marcar los hallazgos cerrados hasta completar publicación y UAT.

## Validación local

- Las pruebas SQL ejecutan la migración en la misma transacción que los fixtures y hacen rollback. Incluyen persistencia completa, rollback de cabecera/carga/pricing, estado obsoleto, campos no autorizados, shipments Miami/idempotencia/rechazos, CAI y permisos de Garantías.
- La API REST local acepta ambas consultas corregidas de Garantías (HTTP 200). Esta comprobación de estructura usa acceso administrativo local; los permisos se comprueban por separado en SQL con roles autenticados.
- La base local contenía `agent_quotes.mbl_quantity` sin registrar la migración correspondiente. El push local se detuvo en esa migración; no se reparó su historial por inferencia. La migración de aceptación legal anterior sí se aplicó localmente. La nueva migración se comprobó transaccionalmente, sin dejarla aplicada ni tocar producción.
- TypeScript y pruebas Node ejecutados; detalles finales de navegador, ESLint y build en `HARDENING.md`.
- ESLint compara contra HEAD: los formularios de cotizaciones y el componente Miami conservan deuda previa, sin nuevas infracciones en esta entrega. CAI y Garantías quedan sin infracciones.

## Publicación SQL — 16/09/2026

Migración `20260914233000` aplicada al proyecto utilizado por `forwarders.app`.
Se verificaron el registro de migración, los cuatro cuerpos de función, los dos
triggers y los permisos de ejecución de la nueva RPC. La auditoría de solo lectura
como `postgres`, sin restricciones RLS, encontró 0 rangos CAI y 0 documentos con
fecha CAI no representable; no se corrigieron datos por inferencia. Para conciliar
el hallazgo original hace falta identificar el registro/ambiente de aquella prueba.

Frontend publicado en el commit `7b4eff5`, deployment GitHub `6484076735` y Vercel
`A3WabPMXwFi1qRThLXht3Meycdea`, ambos con resultado `success`. En `forwarders.app`,
los accesos ERP/portal responden 200 y CAI/Garantías/nueva cotización redirigen al
login conservando destino. El harness temporal responde 404.

El UAT autenticado, la persistencia por rol y los avisos reales siguen pendientes;
no hubo emisiones ni registros de prueba en producción.
