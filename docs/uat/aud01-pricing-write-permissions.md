# AUD-01 — Permisos de escritura de pricing

Fecha: 13/10/2026. Estado: implementado y probado en base local aislada;
publicación SQL/frontend y UAT autenticado en el ambiente destino pendientes.

## Matriz aplicada

| Acción | Autorización |
| --- | --- |
| Consultar precios/tarifas | Se conservan las políticas de lectura y el tenant existentes. |
| Escribir cargos generales de una cotización | Admin/Pricing; Borrador, Pendiente de Fijar Precios o Pricing Aprobado. |
| Escribir cargos automáticos Miami | También Ventas para Miami LCL/Aéreo propios o de un cliente que tenga asignado, en los estados anteriores y Enviada al Cliente. Se conserva esta excepción del editor comercial; no modifica snapshots ofrecidos. |
| Editar/agregar tarifas de agentes y costos por contenedor | Admin/Pricing cuando la cotización está Pendiente de Fijar Precios. Se conserva la restricción existente de borrado físico a Admin. |
| Seleccionar una tarifa | RPC atómica existente; el flag `is_selected` no se cambia directamente. |
| Aceptar una opción comercial | RPC existente de Admin/Ventas; utiliza el snapshot congelado y puede cerrar la cotización Ganada. |
| Administrar tarifas de un cliente | Admin/Pricing/Ventas del tenant; cliente no archivado. Otros roles internos conservan lectura. |
| Procesar avisos internos de tarifas vencidas | RPC de Admin/Pricing del tenant; reserva y notifica en una transacción. No envía correo. |

Ganada y Perdida no permiten edición directa de cargos/tarifas. Repricing y
aceptación conservan sus RPC. La máquina completa de transiciones y los campos
financieros de la cabecera de cotización se revisarán en AUD-05; esta migración
protege las cuatro tablas de precios y sus entrypoints de reemplazo/creación.

## Evidencia técnica local

- Se creó `sarierp_aud01` con puertos 575xx y seed deshabilitado, usando una
  copia del historial versionado. No se reseteó el stack de trabajo `sarierp`.
- Antes de la nueva migración, la primera comprobación de la suite falló con
  `ASSERTION FAILED: Ventas no debe editar venta FCL por tener lectura`.
  El UPDATE había modificado la fila; la transacción del fixture se revirtió.
- Migración nueva:
  `supabase/migrations/20261013120000_pricing_write_authorization.sql`.
- Suite:
  `supabase/tests/aud01_pricing_write_permissions.sql`.
  Usa roles autenticados reales de Postgres, doce perfiles ficticios, dos
  tenants, INSERT/UPDATE/DELETE, RPC públicas y denegación de cores privados.
  Solo acepta errores de permiso o cero filas afectadas en las pruebas de
  denegación; errores de esquema/fixtures no cuentan como permiso comprobado.
- Casos positivos: editor Miami y reenvío a Pricing; creación Miami con cargos
  y FCL sin cargos; default Borrador; edición Admin/Pricing; selección atómica;
  snapshot ofrecido y aceptación por Ventas; avisos idempotentes y rollback
  ante fallo de notificación.
- Los fixtures terminan con rollback. Las verificaciones SQL no sustituyen el
  recorrido autenticado en navegador ni acreditan el esquema remoto.
- Instalación limpia de 107 migraciones y suites AUD-01, aislamiento comercial
  multiempresa y selección aérea aprobadas. Node 190/190, TypeScript y build
  82/82 aprobados. ESLint mantiene la deuda previa de Clientes sin incrementarla.
- DB lint no reportó problemas de funciones nuevas; sí reportó el diagnóstico
  existente de Outlook sobre una referencia dinámica opcional a
  `is_demo_environment()`. No se certifica un lint global limpio.

## Publicación

1. Revisar y aplicar la migración nueva en el ambiente autorizado. Los cuerpos
   originales de tres RPC se conservan como funciones internas sin EXECUTE para
   anon/authenticated/service_role. Los entrypoints públicos conservan firma,
   valores de retorno y transacción. La migración no reescribe datos históricos.
2. Verificar la versión aplicada, las doce policies restrictivas, los helpers,
   el trigger de selección directa y los grants de funciones públicas/internas.
3. Publicar el frontend del mismo cambio. El checker de vencimientos depende de
   `notify_expired_agent_quotes_for_current_tenant`; **SQL debe publicarse antes**.
4. Ejecutar los casos siguientes con cuentas autorizadas del ambiente de UAT.
   No ejecutar los fixtures SQL ni crear clientes ficticios en Production.
5. Registrar resultados, responsable, ambiente, commit y evidencia en
   HARDENING.md. No cerrar AUD-01 antes de RLS y UAT del ambiente destino.

No se deben deshabilitar guards ni restaurar permisos amplios como rollback
automático. Ante un fallo de integración, conservar la protección y preparar
un forward-fix revisado para el caso concreto.

## Recorrido manual pendiente

| Caso | Resultado esperado |
| --- | --- |
| Pricing: cotización pendiente, agregar tarifa, editar costo por contenedor, seleccionar | Se guarda y la selección actualiza pricing; recargar conserva el resultado. |
| Pricing: propuesta enviada/Ganada, intentar editar cargos | Bloqueo; reabrir por el flujo de repricing antes de editar. |
| Ventas: FCL visible | Consulta disponible; escritura directa de cargos/tarifa denegada. |
| Ventas: Miami propio/asignado, editar carga/cargos y reenviar | Guardado completo y transaccional; recargar conserva cabecera, hijos y precios. |
| Ventas: Miami ajeno, Ganada o Perdida | Escritura de cargos denegada sin alterar las filas. |
| Ventas: elegir opción ofrecida | Aceptación y Ganada mediante RPC; precios coinciden con snapshot y PDF comercial. |
| Operaciones: cotización con SI, consultar tarifas de cliente | Consulta disponible; campos deshabilitados y sin botón Guardar tarifas. |
| Operaciones/Contabilidad/Finanzas/Cliente: intentar escribir por API | Denegación; no basta ocultar el botón. |
| Perfil inactivo, pendiente o administrador exclusivo de plataforma | Sin autorización de escritura de pricing de un tenant. |
| Cuenta de otro tenant | Sin escritura sobre cotización, tarifa, costos por contenedor o tarifas del cliente. |
| Admin/Pricing: abrir Alertas con tarifa vencida | Un aviso por destinatario; una segunda consulta no duplica; fallo revierte marcador. |

Verificar también errores de red, foco/teclado y lectura de tarifas en móvil.
La modificación visual es acotada, pero aún no cuenta con inspección en navegador.
