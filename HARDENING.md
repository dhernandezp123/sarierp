# Sari Express ERP — Hardening, Demo y Pilot

Este archivo es el registro versionado del plan de correcciones del ERP.
Debe actualizarse en el mismo commit de cada fix para que el estado viaje con
Git entre computadoras y ambientes.

### 2026-07-28 - CALC-005 - Retiro de Bank Transfer Fee del comparativo FCL

- Estado: En validación manual.
- Hallazgo: CALC-005.
- Código:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: No aplica.
- Cambio:
  - Se elimina la fila Bank Transfer Fee de la tabla comparativa FCL.
  - El cargo deja de participar en el total ajustado y en la determinación de
    la tarifa de mejor costo.
  - Se retira la lectura y el prop que conectaban `bank_transfer_fee` desde
    `surcharge_rules` con la tabla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Búsqueda dirigida de `bankTransferFee`, `Bank Transfer Fee` y
    `bank_transfer_fee` en los componentes del comparativo: sin resultados.
- Verificación manual pendiente:
  - Abrir el comparativo FCL, confirmar que no exista la fila Bank Transfer Fee
    y que el total disminuya por el importe anteriormente configurado.
- Riesgos o trabajo pendiente: Ninguno identificado.
- Commit: Pendiente.

### 2026-07-28 - CALC-004 - MBL y Profit Share consolidados en Ocean Freight

- Estado: En validación manual.
- Hallazgo: CALC-004.
- Código: `src/app/(protected)/pricing-comparison/page.tsx`.
- SQL: No aplica.
- Causa raíz: La tabla FCL permite ajustar MBL y Profit Share por agente, pero
  la selección de tarifa regeneraba Pricing usando únicamente los valores
  persistidos en `agent_quotes`, ignorando los importes visibles ajustados en
  el comparativo.
- Cambio:
  - MBL y Profit Share permanecen consolidados dentro de la línea de Ocean
    Freight; no se generan como líneas independientes.
  - MBL se interpreta como total por BL y se divide entre la cantidad real de
    contenedores antes de sumarlo al costo y venta unitarios del flete.
  - Profit Share se interpreta como importe por contenedor y se suma a la venta
    unitaria de Ocean Freight.
  - Al seleccionar desde el comparativo FCL se usan los valores visibles de
    MBL y Profit Share, con fallback a `agent_quotes` cuando no existe ajuste.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente aviso de conversión LF/CRLF.
- Verificación manual pendiente:
  - Con un contenedor, Ocean Freight USD 6,300.00, MBL USD 50.00 y Profit
    Share USD 50.00 deben generar costo unitario USD 6,350.00 y venta base USD
    6,400.00 antes de margen comercial adicional.
  - Con dos contenedores, un MBL total USD 50.00 debe aportar USD 25.00 por
    contenedor; Profit Share debe conservar su importe completo por cada
    contenedor.
- Riesgos o trabajo pendiente:
  - Bank Transfer Fee fue retirado del comparativo bajo CALC-005.
- Commit: Pendiente.

### 2026-07-22 - REP-009 - Cierre mensual histórico de Pricing

- Estado: En validación.
- Código: `src/app/(protected)/reports/page.tsx`.
- SQL: No aplica; utiliza `quotation_status_history` y las relaciones existentes.
- Cambio: agrega una reportería de Pricing exportable a CSV/PDF que reconstruye ciclos desde `Pendiente de Fijar Precios` hasta `Pricing Aprobado` o `Perdida`, con entradas y aprobaciones del período, pendientes a la fecha de cierre, responsable, tiempo calendario de respuesta, valores comerciales y motivo de pérdida. Las métricas se identifican como `Cotizaciones recibidas`, `Aprobadas Pricing` y `Pendientes en Pricing al cierre` para evitar confusiones con la creación y el resultado comercial.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  verificar
  RLS con un usuario Pricing y conciliar manualmente un mes con reingresos a
  Pricing.
- Commit: Pendiente.

### 2026-07-22 - UX-042 - Cierre exterior del selector de estado

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`.
- SQL: No aplica.
- Cambio: el desplegable de estado se cierra al hacer clic fuera de su botón o menú.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: verificación visual manual en escritorio y móvil.
- Commit: Pendiente.

### 2026-07-22 - QTN-028 - Reactivar cotización perdida como nueva

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`, `src/app/(protected)/quotations/new/page.tsx`.
- SQL: No aplica; reutiliza `quotations.duplicated_from` y `activity_logs`.
- Cambio: una cotización `Perdida` conserva su estado y puede reactivarse como una cotización nueva vinculada, con nuevo número, datos editables y motivo obligatorio. La relación queda registrada en ambas cotizaciones mediante el log de actividad.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: validar manualmente una reactivación FCL/FTL y una de carga suelta; confirmar notificación a Pricing al enviarla.
- Commit: Pendiente.

### 2026-07-22 - QTN-027 - Razón obligatoria al perder cotización

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`, `src/lib/quotation-loss-reasons.ts`.
- SQL: `supabase/migrations/20260722143000_quotation_loss_reason.sql`.
- Cambio: al pasar una cotización a `Perdida`, abre un modal con razones categorizadas. `Otra` exige una explicación; la selección se guarda en la cotización, el historial y el log de actividad.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  validar
  manualmente una transición real. Los registros históricos permanecen sin
  razón.
- Commit: Pendiente.

### 2026-07-22 - INS-026 - Flete terrestre y aéreo en seguro

- Estado: En validación.
- Código: `src/lib/insurance-coverage.ts`, `src/app/(protected)/pricing-comparison/page.tsx`, `src/app/(protected)/settings/company/page.tsx`.
- SQL: `supabase/migrations/20260722120000_include_ground_and_air_freight_in_insurance.sql`.
- Cambio: incluye `Flete Terrestre`, `Air Freight` y `Aéreo Consolidado` en la regla general Full Cover. Entrega Local permanece fuera salvo inclusión excepcional.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  recalcular
  seguros existentes y validar manualmente LTL, aéreo y la exclusión de
  Entrega Local.
- Commit: Pendiente.

### 2026-07-21 - UX-041 - Acceso a cotizacion desde toast de creacion

- Estado: En validacion.
- Hallazgo: UX-041.
- Codigo: `src/app/(protected)/quotations/new/page.tsx`.
- SQL: No aplica.
- Cambio: El toast de creacion incluye la accion `Ir a Cotizacion`, que navega
  al detalle de la cotizacion recien creada. El toast se muestra despues de
  marcar el formulario como guardado para no activar el guard de salida y
  permite cerrarlo manualmente mediante su boton `X`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Crear una cotizacion, pulsar la accion del
  toast y confirmar que abre el detalle correcto sin advertencia de cambios.
- Riesgos o trabajo pendiente: Ninguno identificado.
- Commit: Pendiente.

### 2026-07-21 - CALC-003 - ISV opcional en Redestino del comparativo FCL

- Estado: En validacion.
- Hallazgo: CALC-003.
- Codigo: `src/components/pricing/FclAgentComparisonTable.tsx`.
- SQL: No aplica.
- Cambio: Redestino permite indicar por agente si aplica ISV. El impuesto usa
  la tasa configurada en Empresa, se acumula con el ISV opcional de Entrega
  Local y se refleja en la fila ISV y el total ajustado.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Probar Redestino con y sin ISV, incluyendo un
  caso donde Entrega Local y Redestino sean gravables simultaneamente.
- Riesgos o trabajo pendiente: La seleccion mantiene la persistencia local ya
  existente para la tabla comparativa.
- Commit: Pendiente.

### 2026-07-21 - CALC-002 - ISV opcional en Entrega Local del comparativo FCL

- Estado: En validacion.
- Hallazgo: CALC-002.
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: No aplica.
- Cambio: Entrega Local permite indicar por agente si aplica ISV, usando la
  tasa configurada en Empresa. El impuesto se refleja en la fila ISV y en el
  total ajustado, y la seleccion se conserva al guardar la tabla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Comparar tarifas con y sin ISV en Entrega
  Local y confirmar persistencia, fila ISV y total ajustado.
- Riesgos o trabajo pendiente: La tabla se guarda localmente en el navegador,
  conforme al comportamiento existente del comparativo FCL.
- Commit: Pendiente.

### 2026-07-21 - CALC-001 - MBL por BL en tabla comparativa FCL

- Estado: En validacion.
- Hallazgo: CALC-001.
- Codigo: `src/components/pricing/FclAgentComparisonTable.tsx`.
- SQL: No aplica.
- Cambio: El MBL se suma una sola vez por BL (uno por defecto) y su ayuda
  visual distribuye el importe entre los contenedores. PS continua siendo un
  cargo multiplicado por contenedor.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Probar una cotizacion FCL de varios
  contenedores y confirmar el total y el MBL unitario mostrado.
- Riesgos o trabajo pendiente: Si el agente emite varios BL, se debe ingresar
  el importe total de los BL emitidos.
- Commit: Pendiente.

### 2026-07-20 - INS-025 - Cobertura general minima y excepciones por cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-coverage.ts`
- SQL:
  - `supabase/migrations/20260720153000_insurance_default_coverage_and_quote_overrides.sql`
- Cambios:
  - Invierte la politica anterior de incluir todo: por defecto solo se incluyen
    Ocean Freight y cargos clasificados como origen, ademas del FOB obligatorio.
  - Configuracion > Empresa permite administrar los textos que identifican los
    servicios incluidos por defecto; las exclusiones se conservan como regla
    adicional.
  - Antes de aplicar el seguro, Pricing muestra un modal con los servicios de
    regla general y casillas para incluir excepcionalmente DTHC, redestino,
    entrega local u otros cargos. Tambien permite incluir todos de una vez.
  - La excepcion queda guardada en la propia linea de `pricing_items`, por lo que
    el detalle operativo y el PDF reproducen la misma base utilizada al calcular.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Recalcular sin excepciones y confirmar que DTHC, redestino y entrega local
    no formen parte de las bases de costo ni venta.
  - Recalcular marcando uno y luego todos los cargos adicionales; confirmar el
    importe guardado, el detalle para Operaciones y el PDF.
  - Cambiar las inclusiones generales desde Configuracion > Empresa y confirmar
    que las nuevas cotizaciones respeten la regla.
- Riesgos pendientes:
  - Las lineas de seguro existentes conservan el calculo historico hasta que se
    vuelvan a aplicar con la nueva seleccion.
  - La actualizacion de overrides y de la linea de seguro usa operaciones
    consecutivas; si la red falla entre ambas, el modal de detalle advertira la
    diferencia y Pricing debera volver a aplicar el seguro.
- Commit: pendiente.

### 2026-07-31 - UX-048 - Combobox de clientes interactivo dentro del modal

- Estado: En validación manual.
- Hallazgo: UX-048.
- Causa raíz:
  - `ClienteCombobox` renderizaba su buscador y lista mediante un portal en
    `document.body`.
  - En el modal de perfil rápido, el bloqueo de foco y eventos del diálogo
    impedía escribir en el buscador y desplazar la lista portaleada.
- Código:
  - `src/components/ui/ClienteCombobox.tsx`
  - `src/components/clientes/ClientProfileDialog.tsx`
- SQL: ninguno.
- Cambios:
  - Se agregó el modo reutilizable `renderInline` para montar la lista dentro
    del árbol del diálogo y conservar el portal como comportamiento por defecto
    en los demás formularios.
  - La acción rápida activa este modo, permitiendo enfocar el buscador, escribir,
    navegar con teclado y usar scroll en la lista de clientes.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npx eslint src/components/ui/ClienteCombobox.tsx src/components/clientes/ClientProfileDialog.tsx`:
    OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Abrir `Ver / Editar Cliente`, escribir nombre y código en el buscador,
    recorrer la lista con scroll y seleccionar un resultado.
- Riesgos pendientes:
  - La verificación funcional requiere una sesión autenticada con clientes
    visibles.
- Commit: pendiente.


### 2026-07-31 - UX-047 - Cargos manuales y catálogo completo en Miami Aéreo

- Estado: En validación manual.
- Hallazgo: UX-047.
- Causa raíz:
  - Los cargos adicionales en origen exigían una tarifa activa con monto mayor
    que cero y categoría literal `Otros Cargos`.
  - Los conceptos reservados para automatismos de Miami LCL también se
    excluían en Consolidado Aéreo, aunque no tuvieran un control automático en
    ese flujo.
  - No existía una alternativa para cargos no incluidos en el tarifario.
- Código:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/lib/miami-pricing-items.ts`
- SQL: ninguno.
- Cambios:
  - Consolidado Aéreo carga las tarifas de origen configuradas en el catálogo
    activo y conserva compatibilidad con las tarifas de `Otros Cargos`.
  - Las líneas activas con monto `0.00` también aparecen para poder asignar un
    monto específico en la cotización sin crear un concepto manual duplicado.
  - Las exclusiones automáticas ahora dependen del producto: BL, SED,
    Desconsolidación y cargos IMO pueden seleccionarse en Aéreo si el perfil
    del cliente tiene un monto activo; en LCL conservan sus controles actuales.
  - Se agregó `Otro cargo (manual)` para capturar concepto, monto e ISV y
    persistirlo como cargo de origen incluso si no existe en el tarifario.
  - Los cargos manuales existentes se reconocen al reabrir una cotización.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido sobre la lógica nueva: OK. La ejecución con todas las
    reglas conserva hallazgos preexistentes del hook y del componente.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - En una cotización Miami Aéreo, confirmar que aparezcan todas las tarifas de
    origen del catálogo activo, incluyendo las configuradas en `0.00`.
  - Agregar `Otro cargo (manual)`, guardar, reabrir y confirmar concepto, monto
    e ISV tanto en la cotización como en el PDF comercial.
- Riesgos pendientes:
  - La verificación funcional requiere una sesión autenticada y un cliente con
    tarifario Miami configurado.
- Commit: pendiente.


### 2026-07-30 - UX-044 - Confirmación antes de duplicar una cotización

- Estado: En validación.
- Hallazgo: UX-044.
- Archivos modificados:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `HARDENING.md`
- SQL: No aplica.
- Cambios:
  - Los accesos para duplicar una cotización o reactivar una cotización perdida
    abren el `ConfirmDialog` existente antes de navegar al formulario nuevo.
  - El modal identifica la cotización origen y aclara que los datos podrán
    revisarse antes de guardar la copia.
  - Ambos accesos comparten el mismo flujo y conservan el bloqueo de la acción
    mientras inicia la navegación.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Validación manual pendiente:
  - Desde `/quotations/[id]`, cancelar el modal y confirmar que no se abra el
    formulario de duplicación.
  - Confirmar la acción y verificar que abra
    `/quotations/new?duplicateFrom=...` con los datos precargados.
  - Repetir con una cotización `Perdida` y confirmar el texto de reactivación.
- Riesgos pendientes:
  - Falta UAT autenticada de ambos accesos.
- Commit: pendiente.

### 2026-07-30 - UX-045 - Branding del footer de inicio de sesión

- Estado: En validación.
- Hallazgo: UX-045.
- Archivos modificados:
  - `src/app/login/page.tsx`
  - `HARDENING.md`
- SQL: No aplica.
- Cambios:
  - El footer de `/login` muestra `Forwarders ERP` en lugar de
    `© 2026 Sari Express ERP`.
  - La atribución de la plataforma ahora identifica a `Hernova Systems`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Validación manual pendiente:
  - Abrir `/login` en escritorio y móvil y confirmar que ambas líneas del
    footer sean legibles y no se superpongan con el formulario.
- Riesgos pendientes:
  - Falta validación visual autenticada en el deployment de Preview o Production.
- Commit: pendiente.

### 2026-07-29 - REL-004 - Postdeploy remoto 4A–5C

- Estado: SQL aplicado y validado en producción; frontend pendiente por destino
  de hosting no identificado.
- Hallazgo: REL-004.
- Alcance:
  - Verificación final del historial remoto.
  - Gate estructural, conteos, seguridad/permisos y 15 diagnósticos.
  - Conciliación del único conflicto legacy/canónico.
- Validaciones remotas:
  - `npx supabase migration list --linked`: seis versiones
    `20260729120000`–`20260729170000` alineadas.
  - `POSTDEPLOY_GATE_OK`.
  - 15 diagnósticos ejecutados sentencia por sentencia mediante
    `supabase db query --linked`: cero filas en todas las consultas de
    integridad.
  - 12 Shipping Instructions, 12 shipments, 4 bookings, 4 revisiones, 6 filas
    físicas de contenedor, 48 requisitos y cero cut-offs/VGM/excepciones.
  - Cero SI, bookings o eventos sin shipment y cero diferencias de
    clasificación de backfill.
  - 27 RPC `SECURITY DEFINER`: todas ejecutables por `authenticated`, ninguna
    por `anon`.
  - Cero permisos directos de escritura para `anon/authenticated` en tablas 5C.
  - Las cuatro evaluaciones FCL ejecutaron sin error y quedaron bloqueadas por
    readiness incompleto, estado preoperativo esperado; no se forzó transición.
- Conciliación manual:
  - `RT0020` reportó diferencia de `master_bl`.
  - `bills_of_lading` contiene el MBL canónico `APS20260700173`, estado
    `MBL Validado`, igual al cache del booking.
  - `COSU6506723360` permanece solo en el campo legacy de la SI; no se modificó
    ningún dato.
- Riesgos o trabajo pendiente:
  - El repositorio no tiene `.vercel/project.json`, `.openai/hosting.json` ni
    workflow de deploy.
  - La única cuenta Vercel disponible no contiene un proyecto Sari ERP.
  - No desplegar frontend hasta recibir el proyecto o procedimiento de hosting
    correcto. Desplegar el árbol frontend exacto de `856e2a4d...`.
  - Completar UAT autenticada crítica después del despliegue.
- Commit: `a1b569c`.

### 2026-07-29 - REL-003 - Backfill 5C compatible con triggers diferidos

- Estado: Aplicada y validada en producción.
- Hallazgo: REL-003.
- Causa raíz:
  - Con bookings reales, el backfill de requisitos generó eventos de los
    constraint triggers `DEFERRABLE INITIALLY DEFERRED`.
  - La migración intentaba ejecutar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
    antes de resolverlos y PostgreSQL respondió SQLSTATE `55006`.
- SQL y documentación:
  - `supabase/migrations/20260729170000_booking_cutoffs_and_readiness.sql`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/release-readiness-4a-5c.md`
- Corrección:
  - Se agregó `SET CONSTRAINTS ALL IMMEDIATE` inmediatamente después del
    backfill y antes de habilitar RLS.
  - La instrucción ejecuta y valida todos los eventos diferidos; no omite ni
    deshabilita controles de relación.
  - No se añadió ninguna migración y 5C todavía no figuraba en el historial
    remoto.
- Validaciones:
  - `migration list --linked`: 4A–5B aplicadas y 5C pendiente.
  - Dump de esquema remoto: objetos 4A–5B presentes y tablas 5C ausentes.
  - Ensayo local con un booking FCL y contenedor existentes dentro de una sola
    transacción: 12 requisitos creados, `SET CONSTRAINTS`, RLS y `COMMIT`.
  - `POSTDEPLOY_GATE_OK`.
  - Conteos: 1 quotation, SI, shipment, booking, contenedor y revisión; 12
    requisitos; cero cut-offs, VGM, excepciones y evaluaciones.
  - Seguridad: ninguna RPC expuesta a `anon` y ninguna escritura directa
    concedida a `authenticated`.
  - Suite SQL 5C: OK.
  - Diagnósticos de cut-offs, VGM, readiness y pre-shipment: cero hallazgos.
  - Rehearsal acumulado 4A–5C posterior: `LOCAL_REHEARSAL_OK`.
  - `npx next typegen` y `npx tsc --noEmit`: OK.
  - SHA-256 corregido de 5C:
    `8A9BB9F793FF419593D9A1646F889568B30035B16B3600EEA297561B3BFB3925`.
- Riesgos o trabajo pendiente:
  - SQL y postdeploy remoto completados.
  - Mantener frontend sin desplegar hasta identificar el hosting y completar
    la UAT autenticada.
- Commit: `618d3dd`.

### 2026-07-29 - REL-002 - Backfill 4A compatible con rol de migración

- Estado: Aplicada en producción; postdeploy acumulado pendiente de 5C.
- Hallazgo: REL-002.
- Causa raíz:
  - El backfill final de 4A llamaba
    `select_primary_booking_if_single`, una RPC diseñada para sesiones
    autenticadas.
  - Supabase ejecuta las migraciones remotas con un rol técnico que no aporta
    `auth.uid()` y no necesariamente tiene `session_user = 'postgres'`.
- SQL y documentación:
  - `supabase/migrations/20260729120000_booking_canonical_foundation.sql`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/release-readiness-4a-5c.md`
- Corrección:
  - El backfill hace directamente el `UPDATE` de
    `shipping_instructions.primary_booking_id` y crea el mismo
    `activity_logs` de auditoría con fuente `foundation_migration`.
  - Las RPC interactivas conservan sus controles de autenticación y permisos.
  - No se añadió ninguna migración; 4A aún no figuraba en el historial remoto.
- Validaciones:
  - El primer `npx supabase db push` remoto falló con SQLSTATE `42501` y
    PostgreSQL revirtió la migración completa.
  - `npx supabase migration list --linked` confirmó que el remoto continuó en
    `20260728130000`.
  - Un dump de esquema remoto posterior no encontró
    `primary_booking_id`, RPC ni trigger parciales de 4A.
  - Rehearsal local completo corregido: `LOCAL_REHEARSAL_OK`.
  - Gates predeploy/postdeploy/seguridad, seis suites SQL, quince diagnósticos
    y DB lint: OK.
  - SHA-256 corregido de 4A:
    `2E21D65AD37C3BBA53B7433D09894FACCCF8746E5D798E257E6E4319898E95B3`.
- Riesgos o trabajo pendiente:
  - Repetir `migration list` y `db push --dry-run` antes de reaplicar.
  - No desplegar frontend hasta que el SQL remoto y todos los gates
    postdeploy estén aprobados.
- Commit: `229d07b9ecbe148b6342ae9ae7153bc561e63017`.

### 2026-07-29 - REL-001 - Release Readiness acumulado 4A–5C

- Estado: Release candidate preparado; `NO-GO` para producción hasta aprobar
  rehearsal representativo y UAT autenticada.
- Hallazgo: REL-001.
- Alcance:
  - Congelamiento de las seis migraciones 4A–5C.
  - Gates reproducibles de predeploy, postdeploy, conteos y seguridad.
  - Rehearsal local exacto desde el baseline remoto.
  - Checklist UAT unificado, criterios GO/NO-GO y rollback.
- SQL y scripts:
  - `supabase/release/phase_4a_5c/00_predeploy_gate.sql`
  - `supabase/release/phase_4a_5c/01_predeploy_counts.sql`
  - `supabase/release/phase_4a_5c/02_postdeploy_gate.sql`
  - `supabase/release/phase_4a_5c/03_postdeploy_counts.sql`
  - `supabase/release/phase_4a_5c/04_security_gate.sql`
  - `scripts/release/rehearse-phase-4a-5c.ps1`
- Documentación:
  - `docs/release/release-readiness-4a-5c.md`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/rollback-runbook-4a-5c.md`
  - `docs/uat/release-4a-5c-authenticated.md`
- Verificaciones:
  - `npx supabase migration list --linked`: remoto termina en
    `20260728130000`; 4A–5C no aplicadas.
  - `npx supabase db push --linked --dry-run`: propone únicamente las seis
    migraciones `20260729120000`–`20260729170000`; no aplicó cambios.
  - Rehearsal local desde `20260728130000`: `LOCAL_REHEARSAL_OK`.
  - Gates predeploy, postdeploy y seguridad: OK.
  - Suites SQL 4A, 4B, 4C, 5A, 5B y 5C: OK con rollback.
  - Quince diagnósticos: cero hallazgos sobre base local vacía.
  - DB lint: sin errores ni warnings.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 66/66 páginas.
  - ESLint dirigido a componentes/helpers nuevos: OK.
  - `npm run lint`: conserva deuda global preexistente de 384 hallazgos
    (312 errores y 72 warnings); no se amplió el alcance a módulos ajenos.
- Corrección imprescindible encontrada:
  - El primer runner enviaba SQL UTF-8 mediante el pipeline de texto de
    Windows PowerShell y corrompía estados con acentos.
  - Se cambió únicamente el transporte hacia Docker para preservar bytes
    UTF-8; el rehearsal completo posterior aprobó.
- Gates pendientes:
  - Restaurar una copia representativa anonimizada.
  - Conciliar conteos y clasificaciones reales.
  - Medir locks/duración con volumen representativo.
  - Completar y firmar UAT autenticada.
- Riesgos:
  - La evidencia actual es sintética y la base local estaba vacía.
  - Los logs representativos pueden contener identificadores; por ello
    `release-evidence/` está excluido de Git.
  - Cualquier cambio de hash invalida las aprobaciones y obliga a repetir el
    proceso.
  - La deuda ESLint global requiere aceptación formal o remediación separada;
    TypeScript y el build de producción sí están aprobados.
- Producción: no se aplicó SQL ni frontend.
- Commit: `856e2a4d347d9a27954786e0bb18c2febeb53e37`.

### 2026-07-29 - FLOW-020 - Cut-offs, VGM y readiness previo al embarque

- Estado: Implementado y validado en Supabase local; rehearsal representativo,
  UAT autenticada y SQL remoto pendientes.
- Hallazgo: FLOW-020.
- Causa raíz:
  - El paso a `Listo para Embarque` usaba validaciones marítimas fijas y no
    distinguía FCL, LCL, aéreo ni terrestre.
  - No existía evidencia canónica, versionada ni auditable de cut-offs o VGM
    por contenedor físico.
  - Los documentos se evaluaban por presencia y no existía un snapshot
    inmutable que explicara por qué una transición fue aprobada o bloqueada.
- SQL:
  - `supabase/migrations/20260729170000_booking_cutoffs_and_readiness.sql`
  - `supabase/tests/booking_cutoffs_and_readiness.sql`
  - `supabase/diagnostics/booking_cutoff_integrity.sql`
  - `supabase/diagnostics/container_vgm_integrity.sql`
  - `supabase/diagnostics/booking_readiness_consistency.sql`
  - `supabase/diagnostics/pre_shipment_post_validation.sql`
- Código y documentación:
  - `src/components/operations/BookingReadinessPanel.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5c-booking-readiness.md`
  - `docs/release/phase-5c-deployment-and-rollback.md`
  - `docs/release/phase-4a-5b-release-rehearsal.md`
  - `supabase/rehearsal/phase_4a_5b_pre_snapshot.sql`
  - `supabase/rehearsal/phase_4a_5b_post_reconciliation.sql`
  - `supabase/rehearsal/phase_4a_5b_security_validation.sql`
- Cambios:
  - Se agregaron cut-offs versionados con fecha/hora, zona horaria IANA,
    fuente, estado, cumplimiento, cancelación y excepción administrativa.
  - Se agregó VGM versionado por contenedor físico, masa positiva KG/LB,
    método, documento y estados borrador/verificado/enviado/aceptado/rechazado.
  - El checklist canónico se deriva por modalidad y conserva requisitos no
    aplicables fuera de los bloqueadores.
  - La evaluación de readiness es de solo lectura; las transiciones a
    `Listo para Embarque` y `Embarcado` la aplican transaccionalmente y guardan
    un snapshot inmutable.
  - Los bloqueos retornan requisitos, cut-offs y contenedores concretos, crean
    evento/alerta y no cambian silenciosamente el estado.
  - Rollover conserva únicamente VGM del mismo contenedor, versiona cut-offs
    provistos e invalida dependencias de itinerario. Un reemplazo comienza con
    checklist independiente y no hereda evidencia 5C.
  - Dashboard, alertas, reportes y portal consumen proyecciones específicas; el
    portal no expone excepciones, aprobadores ni razones internas.
  - El backfill crea solamente requisitos faltantes, es idempotente y no
    inventa cut-offs/VGM ni cambia estados.
  - Se corrigieron cadenas mal codificadas de estados en la migración 5B que
    impedían un rollover válido desde `Listo para Embarque`.
- Validaciones ejecutadas:
  - Replay completo `npx supabase db reset --local`: OK.
  - `supabase/tests/booking_cutoffs_and_readiness.sql`: OK con rollback.
  - Regresiones 4A, 4B, 4C, 5A y 5B: OK con rollback.
  - Cuatro diagnósticos 5C: cero hallazgos en la base local vacía.
  - `npx supabase db lint --local --level warning`: sin errores ni warnings.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a los siete consumidores 5C: OK, sin errores ni warnings.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Verificación manual pendiente:
  - Ejecutar el rehearsal acumulado 4A–5B sobre una copia representativa.
  - Ejecutar la matriz UAT 5C con Admin, Operaciones y Cliente.
  - Conciliar FCL, LCL, aéreo y terrestre, incluyendo rollover y reemplazo.
  - Ejecutar smoke visual antes del despliegue.
- Riesgos pendientes:
  - La base local no contiene historia productiva ni contenedores físicos
    reales; las pruebas sintéticas no reemplazan el rehearsal.
  - Un registro `booking_containers` con cantidad mayor a uno no puede
    certificar VGM por unidad y debe normalizarse antes de usar readiness FCL.
  - No existe integración automática con navieras/básculas; la evidencia es
    capturada por usuarios autorizados.
  - La migración 5C no puede desplegarse hasta que 4A–5B estén aplicadas y
    reconciliadas en remoto.
- Rollback:
  - Revertir consumidores y wrappers mediante migración compensatoria.
  - Revocar escrituras 5C y conservar tablas/historia en modo lectura.
  - No borrar cut-offs, VGM, excepciones, eventos ni snapshots.
- Commit: pendiente.

### 2026-07-29 - FLOW-019 - Revisiones y rollover de Booking

- Estado: En validación; SQL aplicado únicamente en Supabase local y UAT
  autenticada pendiente.
- Hallazgo: FLOW-019.
- Causa raíz:
  - El guardado genérico de booking permitía sobrescribir identidad,
    vessel/voyage, ETD/ETA, fechas originales y fechas reales sin distinguir
    revisión, rollover, reemplazo o corrección.
  - `Cancelada` no diferenciaba cancelación definitiva de reserva reemplazada.
- SQL:
  - `supabase/migrations/20260729160000_booking_schedule_revisions.sql`
  - `supabase/tests/booking_schedule_revisions.sql`
  - `supabase/diagnostics/booking_schedule_revision_coverage.sql`
  - `supabase/diagnostics/booking_replacement_consistency.sql`
  - `supabase/diagnostics/booking_original_schedule_integrity.sql`
  - `supabase/diagnostics/booking_rollover_post_validation.sql`
- Código y documentación:
  - `src/components/operations/BookingScheduleManager.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5b-booking-schedule-revisions.md`
- Cambios:
  - Historial inmutable y secuencial en `booking_schedule_revisions`, con
    backfill `INITIAL` idempotente y metadata de inferencia.
  - `original_etd` y `original_eta` quedan fijadas por la primera evidencia;
    el schedule vigente permanece en `bookings`.
  - Ciclo de vida explícito `ACTIVE/CANCELLED/REPLACED`, relaciones de
    sustitución consistentes, sin ciclos y dentro del mismo shipment.
  - RPC transaccionales para revisión, rollover, reemplazo, cancelación,
    reactivación y corrección administrativa, con control optimista, locking,
    eventos y activity logs.
  - El guardado común ya no acepta identidad, schedule, originales ni actuals.
  - Reemplazo no copia BL, documentos, fechas reales, tracking ni eventos.
    Contenedores físicos no se mueven automáticamente.
  - Portal muestra solo bookings activos e itinerario vigente; reportes y
    alertas distinguen históricos y cambios de itinerario.
- Validaciones:
  - Replay completo `npx supabase db reset --local`: OK.
  - `supabase/tests/booking_schedule_revisions.sql`: OK con rollback.
  - Regresiones 4A, 4B, 4C y 5A: OK con rollback.
  - Cuatro diagnósticos 5B: 0 hallazgos en la base local vacía.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: conserva baseline global de 392 problemas
    (318 errores y 74 warnings); el componente nuevo no agrega hallazgos.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- UAT autenticada:
  - Pendiente; matriz preparada en
    `docs/uat/phase-5b-booking-schedule-revisions.md`.
- Riesgos pendientes:
  - La base local no contiene datos productivos; ejecutar los cuatro
    diagnósticos sobre una copia representativa antes de desplegar.
  - La excepción Admin de reemplazo con BL emitido exige revisión documental
    humana y queda auditada.
  - La notificación al cliente es un registro manual; no existe integración
    automática con navieras ni tareas persistentes en esta fase.
- Rollback:
  - Revertir frontend y consumidores.
  - Deshabilitar/revocar los nuevos RPC mediante migración compensatoria.
  - Conservar tabla de revisiones, relaciones, bookings y todo historial
    generado; no borrar datos.
- Commit: pendiente.

### 2026-07-29 - FLOW-018 - Fundación de Shipment canónico

- Estado: En validación manual; migración aplicada únicamente en Supabase local.
- Hallazgo: FLOW-018.
- Causa raíz:
  - `shipping_instructions` funcionaba simultáneamente como documento y raíz
    operativa, mientras bookings y eventos no tenían una FK estable hacia un
    agregado shipment.
  - Portal, reportes, alertas y Cost Validation usaban SI como fila operativa
    y algunos consumidores asumían una sola SI por cotización.
- SQL:
  - `supabase/migrations/20260729150000_shipments_foundation.sql`
  - `supabase/diagnostics/shipment_backfill_classification.sql`
  - `supabase/diagnostics/shipment_relationship_consistency.sql`
  - `supabase/diagnostics/shipment_status_comparison.sql`
  - `supabase/diagnostics/shipment_post_foundation_validation.sql`
  - `supabase/tests/shipment_foundation.sql`
- Código y documentación:
  - `src/lib/shipment-service.ts`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/cost-validation/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5a-shipment-foundation.md`
- Cambios:
  - Se creó `shipments` con FK conservadoras, RLS y backfill idempotente
    SI→shipment conservando el UUID.
  - `bookings` y `operational_events` recibieron `shipment_id`; triggers
    impiden relaciones inconsistentes o mover registros históricos.
  - Los RPC canónicos de booking, eventos, timeline y finalización validan y
    retornan el shipment.
  - La creación desde cotización es transaccional, auditable e idempotente.
  - Una guardia de compatibilidad crea shipment para escritores legacy de SI;
    la RPC canónica desactiva esa guardia localmente y no existe doble
    escritura desde frontend.
  - Portal v2, reportes, alertas y Cost Validation leen shipment como raíz.
  - Las rutas y relaciones legacy se conservan.
- Validaciones:
  - Replay completo con `npx supabase db reset --local`: OK.
  - `supabase/tests/shipment_foundation.sql`: OK con rollback; incluye
    backfill de booking/evento y preservación de `updated_at` histórico.
  - Regresiones `booking_canonical_foundation.sql`,
    `booking_canonical_consumers.sql` y
    `canonical_operational_events.sql`: OK con rollback.
  - Cuatro diagnósticos 5A: OK; base local vacía con 0 inconsistencias.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: conserva baseline global de 392 problemas
    (318 errores y 74 warnings); no agrega deuda.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
  - UAT autenticada: pendiente.
- Verificación manual pendiente:
  - Ejecutar toda la matriz de
    `docs/uat/phase-5a-shipment-foundation.md`.
  - Validar conteos y excepciones sobre una copia representativa antes de
    aplicar SQL remoto.
- Riesgos pendientes:
  - La base local estaba vacía; no valida peculiaridades de datos productivos.
  - Las URLs y documentos aún conservan SI como contexto por compatibilidad.
  - `operational_status` legacy puede diferir del derivado; el diagnóstico lo
    reporta y no se corrige destructivamente en 5A.
- Rollback:
  - Revertir consumidores a SI y revocar RPC mediante migración
    compensatoria.
  - Conservar tabla, columnas y relaciones nuevas sin uso; no borrar
    shipments ni reescribir históricos.
- Commit: pendiente.

### 2026-07-29 - FLOW-017 - Timeline y transiciones canónicas de Booking

- Estado: En validación manual; migración aplicada únicamente en Supabase
  local.
- Hallazgo: FLOW-017.
- Causa raíz:
  - El detalle del booking permitía seleccionar cualquier
    `bookings.shipment_status` y enviarlo dentro de
    `update_booking_canonical`, sin matriz de transición ni validaciones por
    etapa.
  - El historial operativo dependía de `shipping_instruction_events`, sin
    asociación estructurada a booking/contenedor.
  - La finalización de SI se validaba y ejecutaba desde el frontend mediante
    actualización directa.
- SQL:
  - `supabase/migrations/20260729140000_canonical_operational_events.sql`
  - `supabase/tests/canonical_operational_events.sql`
  - Ajustes de regresión en las suites 4A y 4B.
- Código:
  - `src/components/operations/BookingTimeline.tsx`
  - `src/lib/booking-status.ts`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `docs/uat/phase-4c-operational-timeline.md`
- Cambios:
  - Tabla `operational_events` con RLS, vínculos validados, fechas de
    ocurrencia/registro separadas y origen auditado.
  - Backfill idempotente desde eventos legacy, sin actualizar estados y sin
    asociar silenciosamente eventos ambiguos a `primary_booking_id`.
  - RPC `record_operational_event`, `transition_booking_status`,
    `reopen_booking`, `get_booking_operational_timeline` y
    `finalize_shipping_instruction_canonical`.
  - `update_booking_canonical` rechaza `shipment_status` y hace inmutable un
    booking finalizado.
  - Selector libre sustituido por acción contextual y modal con concurrencia,
    campos de ocurrencia y errores accionables.
  - Timeline reutilizable con orden alternable y notas operativas.
  - Estado agregado centralizado con confirmación/arribo parcial y cancelados
    explícitos.
  - Las nuevas escrituras de eventos del detalle de SI usan el RPC canónico;
    la tabla legacy permanece solo como lectura histórica.
- Validaciones:
  - `npx supabase migration up --local`: OK.
  - Reconciliación local: 0 eventos legacy, 0 reconciliados, 0 inserciones al
    repetir el backfill.
  - Suite SQL 4C: OK con rollback.
  - Regresiones SQL 4A y 4B: OK con rollback.
  - `npx supabase db lint --local --level warning`: sin hallazgos.
  - `npx tsc --noEmit`: OK final.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; solo avisos esperados LF/CRLF.
  - Lint global before: 401 problemas (326 errores, 75 warnings).
  - Lint global after: 392 problemas (318 errores, 74 warnings); continúa
    fallando por deuda preexistente.
  - Lint focalizado: archivos nuevos sin hallazgos; detalle de booking conserva
    3 errores y 2 warnings preexistentes.
- Verificación manual pendiente:
  - UAT autenticada completa descrita en
    `docs/uat/phase-4c-operational-timeline.md`.
  - Validar el backfill en un ambiente con eventos históricos reales antes de
    producción.
  - Aplicar la migración remota solo tras aprobar UAT y reconciliación.
- Riesgos pendientes:
  - El detalle de SI aún lee `shipping_instruction_events` como histórico y
    `activity_logs`; queda pendiente migrarlo a una vista canónica completa.
  - Las columnas de estado legacy de SI continúan coexistiendo y no deben
    considerarse autoridad del booking.
  - Booking Confirmation usa warning al confirmar y se vuelve obligatoria al
    marcar Listo para Embarque.
- Rollback:
  - Revertir la UI y revocar RPC mediante migración compensatoria.
  - Conservar ambas tablas de eventos en solo lectura; no borrar historia.
  - No se eliminaron columnas, eventos ni datos.
- Commit: pendiente.

### 2026-07-29 - FLOW-016 - Consumidores de Booking canónico Fase 4B

- Estado: En validación; SQL aplicado únicamente en Supabase local y UAT
  autenticada pendiente.
- Hallazgo: FLOW-016.
- Causa raíz:
  - Portal, Cost Validation, reportes, alertas/dashboard y repricing todavía
    consumían o escribían semántica de booking desde campos legacy de
    `shipping_instructions`.
  - Reportes mezclaba una fila SI legacy con filas canónicas de `bookings`.
  - Repricing podía modificar SI legacy y bookings con criterios basados solo
    en identificadores vacíos.
- SQL:
  - `supabase/migrations/20260729130000_booking_canonical_consumers.sql`
  - `supabase/tests/booking_canonical_consumers.sql`
- Código y documentación:
  - `src/lib/booking-status.ts`
  - `src/lib/booking-document-summary.ts`
  - `src/app/portal/page.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/app/(protected)/cost-validation/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/lib/alerts.ts`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `docs/uat/phase-4b-booking-canonical-consumers.md`
- Cambios:
  - Portal v2 valida `auth.uid()`, pertenencia del cliente y devuelve una
    operación por SI más todos sus bookings en detalle, sin comentarios,
    costos, márgenes ni contactos internos.
  - Se conserva Portal v1 como rollback; los tres consumidores activos llaman
    exclusivamente a v2.
  - Cost Validation muestra 0/1/N referencias operativas y mantiene costos a
    nivel de cotización sin multiplicarlos.
  - Reportes separa explícitamente vista Operaciones y vista Bookings. La
    primera agrega fechas, estado y contenedores; la segunda muestra un booking
    por fila con MBL/HBL canónicos.
  - Alertas y dashboard calculan semántica operativa desde bookings. Las
    alertas SI se limitan a ausencia de bookings, validación, preparación y
    brechas de asignación.
  - `sync_shipping_instruction_from_selected_agent_quote_v2` actualiza solo
    defaults de bookings sin confirmar; omite bookings confirmados, con datos
    operativos o BL estructurado y audita IDs/motivos.
  - Repricing v2 solo actualiza en SI datos propios del contacto del agente.
    No escribe booking, carrier, itinerario, estado ni BL legacy en SI.
  - El rol `authenticated` perdió acceso al RPC v1 de repricing; la función se
    conserva para rollback administrativo.
  - `booking-document-summary` prioriza `bills_of_lading`, usa caché de booking
    solo si falta el BL estructurado y no acepta campos legacy de SI.
  - La revisión PDF confirmó que el PDF activo es una instrucción prevista y
    que el PDF alterno no tiene consumidor activo.
  - No se eliminaron columnas ni se creó `shipments`.
- Validaciones ejecutadas:
  - Migración `20260729130000`: aplicada correctamente en Supabase local.
  - `supabase/tests/booking_canonical_consumers.sql`: OK con rollback.
  - Regresión `supabase/tests/booking_canonical_foundation.sql`: OK con
    rollback sobre el esquema local que ya incluye Fase 4B.
  - Portal probado por SQL con 0/1/N bookings, aislamiento entre dos clientes y
    exclusión de comentarios operativos.
  - Repricing probado con SI sin bookings, booking no confirmado, confirmado,
    mezcla de estados, cambio de carrier/ETD/free days y BL estructurado.
  - Evidencia SQL: los ocho campos booking legacy de SI permanecen iguales
    después de repricing v2.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Prueba directa de helpers con Node 24: estado agregado conservador, BL
    estructurado preferido y fallback de caché de booking, OK.
  - `npm run lint`: ejecutado, no aprobado por deuda global previa del
    repositorio (401 hallazgos: 326 errores y 75 warnings, principalmente
    reglas React Hooks y `no-explicit-any` en módulos fuera de esta fase).
- Verificación manual pendiente:
  - Checklist autenticado completo en
    `docs/uat/phase-4b-booking-canonical-consumers.md`.
- Riesgos y trabajo pendiente:
  - UAT visual/autenticada no ejecutada.
  - Las columnas legacy permanecen y otros consumidores fuera del alcance de
    Fase 4B todavía pueden leerlas.
  - `shipping-instruction-pdf.tsx` se conserva aunque no tenga consumidor
    activo; retirarlo requiere una fase explícita.
  - La migración 4B no se aplicó en Supabase remoto.
- Rollback:
  - Revertir consumidores frontend a Portal v1 y consultas anteriores.
  - Rehabilitar `EXECUTE` de repricing v1 solo mediante migración
    compensatoria y aceptando temporalmente su doble semántica legacy.
  - Mantener intactas las columnas permite la reversión sin pérdida de datos.
- Commit: pendiente.

### 2026-07-20 - INS-024 - Politica configurable de servicios asegurables

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-coverage.ts`
- SQL:
  - `supabase/migrations/20260720100000_company_insurance_coverage_rules.sql`
- Cambios:
  - Agrega a Configuracion > Empresa una lista editable de servicios excluidos
    de la base Full Cover; todo servicio no excluido permanece incluido.
  - La coincidencia parcial revisa `pricing_items.rate_code`, `description` e
    `item_type` sin distinguir mayusculas ni tildes.
  - La migracion inicializa la politica con `DTHC` excluido, sin introducir una
    condicion especial de DTHC en el codigo del calculo.
  - Pricing, el detalle operativo y el PDF comparten el mismo helper de
    inclusion/exclusion y muestran las lineas descartadas junto con la regla
    aplicada.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada y registrada; confirmar que Configuracion > Empresa
    muestre `DTHC` como exclusion inicial.
  - Recalcular una cotizacion con DTHC y verificar que su costo y venta no
    formen parte de ninguna base asegurada.
  - Retirar DTHC de la configuracion, recalcular y confirmar que vuelva a
    incluirse; agregar otra exclusion y repetir.
- Riesgos pendientes:
  - Las lineas historicas sin `rate_code` se evalúan por descripcion o tipo; una
    descripcion demasiado generica puede coincidir con mas servicios de los
    previstos, por lo que el modal y PDF muestran cada coincidencia.
- Commit: pendiente.

### 2026-07-17 - INS-023 - PDF con trazabilidad completa del calculo de seguro

- Estado: En validacion
- Codigo:
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
- SQL: ninguno.
- Cambios:
  - El documento imprimible agrega el detalle de todos los servicios Full Cover
    con cantidad, costo total y venta total, excluyendo seguro e ISV.
  - Separa el recorrido de costo y venta: FOB, servicios, subtotal, gastos
    adicionales, gastos operacionales, base asegurada, porcentaje y prima.
  - La venta muestra tambien el ISV configurado en la linea y el total final
    cobrado al cliente para conciliar con `pricing_items.total_amount`.
  - Mantiene al final los valores resumidos que Operaciones debe trasladar al
    formato de la aseguradora.
  - Si el valor de servicios declarado fue ajustado manualmente, el PDF muestra
    la diferencia contra la suma comercial y aclara cual valor usa la venta.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Imprimir una cotizacion con varios servicios y confirmar que la suma del
    detalle concilia con ambas bases aseguradas y con las primas guardadas.
  - Probar un ajuste manual del valor declarado y confirmar la advertencia en
    el documento.
- Riesgos pendientes:
  - Cotizaciones con muchas lineas pueden extender el documento a una segunda
    pagina; las secciones de calculo se mantienen juntas al imprimir.
- Commit: pendiente.

### 2026-07-17 - PRC-022 - Confirmacion de borrado y resumen FCL compacto

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Limita el ancho de cada tarjeta del resumen por contenedor FCL para evitar
    que una sola tarjeta se extienda por toda la pantalla.
  - Reemplaza el borrado inmediato de lineas de cotizacion por un modal de
    confirmacion que identifica descripcion, tipo y total de la linea.
  - Bloquea acciones duplicadas mientras se elimina y conserva la solicitud de
    motivo para cotizaciones que ya requieren trazabilidad post-aprobacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir una cotizacion FCL con uno y varios tipos de contenedor y validar el
    ancho responsivo del resumen.
  - Presionar Eliminar, cancelar y confirmar que la linea permanece.
  - Confirmar el borrado y validar que la tabla y el resumen se recalculan.
  - Repetir en una cotizacion enviada al cliente y validar el modal adicional
    de motivo de cambio.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-17 - PRC-021 - Resumen comercial FCL por contenedor

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega al Resumen Comercial de cotizaciones FCL un desglose unitario por
    cada tipo de contenedor incluido en `quotation_containers`.
  - Muestra costo base Sari, venta al cliente con ISV y profit sin ISV por
    contenedor, junto con la cantidad cotizada de cada tipo.
  - Asigna las lineas de flete al tipo de contenedor indicado en su descripcion
    y prorratea los cargos generales entre el total de unidades, conservando la
    conciliacion con los totales generales de la cotizacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Probar una cotizacion FCL con un solo tipo y varias unidades.
  - Probar una cotizacion FCL con dos tipos de contenedor y confirmar que costo,
    venta y profit unitarios multiplicados por sus cantidades concilian con el
    resumen general.
- Riesgos pendientes:
  - Las lineas generales no tienen relacion directa con un tipo de contenedor;
    por eso se distribuyen uniformemente entre todas las unidades.
- Commit: pendiente.

### 2026-07-17 - INS-020 - Tasa de costo de seguro configurable por empresa

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-calculator.ts`
- SQL:
  - `supabase/migrations/20260717140000_company_insurance_cost_rate.sql`
- Cambios:
  - Agrega `insurance_cost_rate_percent` a `company_settings`, con valor
    inicial `0.28` y restriccion de rango mayor que 0% y hasta 5%.
  - Permite al Admin modificar la tasa desde Configuracion > Empresa usando
    notacion porcentual (`0.28` representa `0.28%`).
  - Pricing utiliza la tasa configurada al crear o actualizar la linea de
    seguro, y el calculo operativo para la aseguradora muestra la misma tasa.
  - Conserva `0.28%` como fallback de aplicacion si la configuracion no esta
    disponible.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada y registrada.
  - Cambiar la tasa como Admin, recargar Pricing y recalcular una linea de
    seguro; confirmar importe, formula guardada y detalle para aseguradora.
  - Confirmar que usuarios no Admin solo ven el campo en modo lectura.
- Riesgos pendientes:
  - Las lineas de seguro ya guardadas mantienen su costo historico hasta que
    se vuelvan a calcular.
- Commit: pendiente.

### 2026-07-17 - INS-019 - Calculo operativo para aseguradora

- Estado: En validacion
- Codigo:
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/lib/insurance-calculator.ts`
- SQL: ninguno.
- Cambios:
  - Habilita `Calculo para Aseguradora` en el detalle de cotizaciones que ya
    contienen una linea de seguro, visible para Admin, Pricing, Ventas y
    Operaciones.
  - Presenta por separado factura/FOB y todos los servicios full cover,
    excluyendo seguro e ISV, con los recargos de 10% aplicables.
  - Permite corregir temporalmente los servicios declarados, calcula costo al
    0.28% sobre FOB + costos y venta con el porcentaje del cliente sobre FOB +
    ventas, y advierte diferencias contra la linea comercial guardada.
  - Genera una hoja horizontal imprimible o guardable como PDF para apoyar el
    llenado del formato de la aseguradora.
  - Agrega un detalle desplegable de todos los servicios incluidos en la linea
    comercial, mostrando costo y venta por item, las bases FOB + servicios y
    sus diferencias contra el valor declarado a la aseguradora.
  - Conserva la regla full cover comercial: costo basado en FOB + costos de
    todos los servicios y venta basada en FOB + ventas de todos los servicios,
    excluyendo en ambos casos el seguro y el ISV.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir una cotizacion con seguro como Operaciones, validar FOB y todos los
    servicios full cover precargados, comparar contra la cotizacion y guardar
    PDF.
- Riesgos pendientes:
  - Los ajustes manuales de servicios en el modal son temporales y no modifican
    la cotizacion; deben verificarse contra la solicitud enviada a la
    aseguradora.
- Commit: pendiente.

### 2026-07-17 - PRC-018 - Correccion de tasa de costo del seguro

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Corrige la tasa utilizada para calcular el costo del seguro de carga de
    `0.27%` a `0.28%`.
  - El detalle persistido de la formula toma la misma constante del calculo
    para evitar discrepancias futuras entre el importe y su explicacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Reaplicar el seguro en una cotizacion y confirmar costo, margen y tooltip.
- Riesgos pendientes:
  - Las lineas de seguro creadas anteriormente conservan el costo historico
    hasta que se vuelva a ejecutar `Aplicar seguro de carga`.
- Commit: pendiente.

### 2026-07-13 - REP-008 - Costo en reporte comercial exportable

- Estado: Completado
- Codigo: `src/app/(protected)/reports/page.tsx`
- SQL: ninguno.
- Cambios: agrega `Costo` desde `quotations.total_cost` a tabla, CSV y PDF,
  incluyendo el total agrupado por moneda.
- Validaciones: `npx tsc --noEmit`: OK.
- Verificacion manual: OK con `CLI-00001 - Inversiones Dennis`; se confirmo
  Costo en pantalla, CSV y PDF, con valores y totales correctos.
- Riesgos pendientes: conserva fecha de creacion y filtros actuales.
- Commit: pendiente.

### 2026-07-16 - PDF-017 - Pesos en libras y kilogramos en detalle de carga

- Estado: En validacion
- Codigo:
  - `src/components/pdf/quotation-pdf.tsx`
- SQL: ninguno.
- Cambios:
  - El detalle de carga comercial muestra peso unitario y peso total de cada
    linea en libras y kilogramos.
  - El resumen inferior muestra siempre `Total lbs` y `Total KG` juntos.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Generar una cotizacion con carga suelta y confirmar los valores por linea y
    totales en el PDF principal y en el anexo de cargas extensas.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-16 - QUO-016 - Cambio de cliente al editar cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega el selector reutilizable de clientes a la edicion de cotizaciones.
  - Guarda `cliente_id` en la cotizacion y autocompleta nombre, correo y
    telefono de contacto al seleccionar un cliente diferente.
  - Registra en `activity_logs` el cliente anterior y el nuevo cuando cambia.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Editar una cotizacion, cambiar el cliente, guardar y confirmar el nuevo
    cliente, los datos de contacto y el registro `change_client`.
- Riesgos pendientes:
  - Las entidades operativas ya creadas conservan su cliente propio; la edicion
    cambia la cotizacion y notifica a Operaciones si existe una SI activa.
- Commit: pendiente.

### 2026-07-15 - UX-014 - Desglose visible del Costo Base Sari

- Estado: En validacion.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - La seccion Construccion de Tarifa muestra dentro de Costo Base Sari el
    desglose en tiempo real de flete, EXW, MBL/documentacion y profit del
    agente.
  - Para Aereo Consolidado muestra peso real, peso volumetrico con divisor
    IATA 6000 (`largo * ancho * alto / 6000`, equivalente a
    `CBM * 166.6667`), peso cobrable (`MAX(real, volumetrico)`) y la
    multiplicacion por tarifa/KG.
  - El desglose usa exactamente los mismos valores que forman
    `agentTotalCost`, evitando costos cargados silenciosamente por el catalogo
    del agente.
  - La tarjeta limita su ancho en escritorio para facilitar la lectura de cada
    concepto junto a su monto, manteniendo ancho completo en pantallas
    pequenas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir Pricing Comparison con una cotizacion Aereo Consolidado y confirmar
    que los componentes del desglose suman el Costo Base Sari.
  - Revisar el comportamiento responsive de la tabla en movil.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-16 - PRC-015 - Impresion horizontal de costos de agentes FCL

- Estado: En validacion
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega la accion `Imprimir Costos Agentes` al comparativo en tabla FCL.
  - Genera una vista exclusiva de impresion en A4 horizontal, conserva los
    indicadores de mejor costo y menor transito y convierte los campos
    editables a importes legibles.
  - Fuerza la impresion de fondos y colores para distinguir visualmente mejor
    costo, menor transito y tarifa seleccionada aun sin graficos de fondo.
  - Evita repetir el nombre cuando el codigo y el nombre comercial de la
    naviera son iguales (por ejemplo, `MSC MSC`).
  - Abre el documento imprimible en una pestaña nueva y la mantiene disponible
    despues del dialogo para volver a imprimirlo o guardarlo como PDF.
  - Limita y centra la previsualizacion en pantalla para aproximarla al ancho
    de una hoja A4 horizontal, sin reducir el espacio disponible al imprimir.
  - Resalta toda la fila `TOTAL` con fondo azul, bordes reforzados y tipografia
    uniforme en negrita para todas las tarifas.
  - Alinea a la derecha el encabezado y todas las etiquetas de la columna
    `Concepto` para mejorar su separacion visual de los importes.
  - Unifica el carrier impreso en una sola etiqueta con el nombre comercial y
    su color de marca, evitando combinaciones visuales como `CMA CMA CGM` o
    `MSK Maersk`.
  - Muestra junto a la linea de seguro un tooltip temporal con el detalle
    persistido de su formula al pasar el cursor o enfocar el indicador.
  - Al editar tarifas FCL reconcilia las lineas historicas del agente con los
    contenedores vigentes por ID o tipo, evitando que el nuevo flete se agregue
    al anterior en lugar de reemplazarlo.
  - En Aereo Consolidado permite alternar entre tarifa por KG y costo `All In`;
    calcula automaticamente el equivalente por KG facturable y conserva el
    costo total normalizado para tarjetas, margenes y seleccion de tarifa.
  - El detalle del calculo aereo respeta la moneda de la tarifa del agente en
    lugar de rotular siempre los importes como USD.
  - Excluye de la impresion los controles de seleccion de tarifa.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir un comparativo FCL con varias tarifas, imprimir/guardar como PDF y
    confirmar legibilidad, orientacion horizontal e importes ajustados.
- Riesgos pendientes:
  - El escalado final puede variar segun el navegador y la cantidad de agentes.
- Commit: pendiente.

### 2026-07-15 - UX-015 - Cargos opcionales del cliente desplegables

- Estado: En validacion.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - La seccion Cargos opcionales del cliente incorpora un control accesible
    para mostrar u ocultar su contenido.
  - En cotizaciones `other_origin_air` inicia cerrada; para los demas
    productos permanece abierta por defecto.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Confirmar que Aereo Consolidado de otros origenes inicia cerrado y que el
    boton Mostrar/Ocultar conserva disponibles las acciones Agregar.
  - Revisar el encabezado y el control en pantalla movil.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-13 - ENV-001 - Ambiente tecnico Supabase staging aislado

- Estado: Disponible, no conectado a la aplicacion local
- Proyecto: `sarierp-staging` (`wlssekvxpfxhwedsjhpz`), region `us-east-1`.
- SQL: las 38 migraciones versionadas de `supabase/migrations` fueron aplicadas
  exitosamente al proyecto staging; Produccion no fue modificada.
- Validaciones:
  - `npx supabase db push --linked --dry-run`: base remota al dia.
  - Staging quedo sincronizado y disponible para uso futuro.
- Verificacion pendiente:
  - Configurar la aplicacion local con URL y anon key de staging.
  - Crear usuarios de prueba por rol y `CLI-00001 - Inversiones Dennis`.
- Decision operativa 2026-07-13:
  - Por solicitud del titular, `.env.local` y Supabase CLI fueron restaurados
    a Produccion (`fwspgdzvlbtbgiupvrzo`).
  - Las pruebas manuales continuaran exclusivamente con
    `CLI-00001 - Inversiones Dennis`.
- Riesgos pendientes:
  - Antes de cada prueba se debe confirmar cliente, usuario y alcance. Los
    movimientos financieros se revierten mediante el flujo auditado; no se
    eliminan fisicamente para ocultar pruebas.
- Commit: pendiente.

## Reglas del registro

- No eliminar hallazgos completados; conservarlos como historial.
- No marcar `Completado` si falta SQL, RLS, pruebas o una acción manual.
- Registrar por separado código desplegado y SQL ejecutado.
- Todo SQL nuevo debe ser una migración versionada e idempotente.
- Toda corrección debe ejecutar, como mínimo:
  - `npx tsc --noEmit`
  - `npm run lint`
  - pruebas relacionadas
  - `npm run build` antes de cerrar una fase
- Estados permitidos: `Pendiente`, `En progreso`, `Bloqueado`, `En validación`,
  `Completado`.

## Baseline de auditoría

Fecha: 22/06/2026

| Validación | Resultado inicial |
|---|---|
| TypeScript | Correcto |
| Build de producción | Correcto |
| ESLint | 277 errores, 94 advertencias en baseline; 95 en validación de Fase 0 |
| Pruebas automatizadas | 0 archivos |
| npm audit | 2 vulnerabilidades moderadas |
| Migraciones | 64 SQL manuales, sin runner formal |
| Esquema real vs registro | Se detectó deriva en Fase 21 |

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Baseline, backup y auditoría real de esquema/RLS | Completado |
| 1 | Seguridad, RLS y escalamiento de usuarios | Completado |
| 2 | Migraciones y constraints de integridad | Completado |
| 3 | Autenticación SSR, sesión y permisos | Completado |
| 4 | Facturación, CAI, CxC, CxP y pagos | En progreso |
| 5 | Transacciones de cotización, pricing y operaciones | En progreso |
| 6 | Miami: embarques persistentes e historial | En progreso |
| 7 | Estados, alertas y notificaciones | Pendiente |
| 8 | Reportes, dashboards, monedas, GP y fechas | Pendiente |
| 9 | UX, responsive y protección de formularios | Pendiente |
| 10 | Calidad, modularización, documentación y CI | Pendiente |
| 11 | Ambiente Demo compartido y Pilot aislado | En progreso |
| 12 | E2E, UAT freight-forwarding y release | Pendiente |

## Hallazgos

### Seguridad y acceso

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| SEC-001 | RLS de `agent_quotes` y `pricing_items` permite acceso a cualquier usuario aprobado, incluido Cliente | Crítica | Completado |
| SEC-002 | RLS de `client_rates` puede exponer o permitir modificar tarifas privadas | Crítica | Completado |
| SEC-003 | `garantias_navieras` tiene RLS activo pero ninguna política; queda bloqueada para usuarios autenticados | Alta | Completado |
| SEC-004 | Verificar posible escalamiento mediante onboarding, metadata y escritura de `profiles` | Crítica | Completado |
| SEC-005 | Protección de rutas solo del lado cliente; proxy no usa sesión SSR real | Alta | Completado |
| SEC-006 | Cliente puede intentar acceder a Settings/CAI por excepción global de permisos | Alta | Completado |
| SEC-007 | Políticas de `notifications` y `profiles` no están completamente versionadas | Alta | Completado |
| SEC-008 | Auditar funciones `SECURITY DEFINER`, grants y `search_path` | Alta | Completado |
| SEC-009 | Políticas `USING/WITH CHECK (true)` permiten acceso total autenticado en agentes, catálogos, historial, validación de costos y borradores BL | Crítica | Completado |
| SEC-010 | Las 55 tablas y funciones públicas conservan grants `ALL` para `anon`; RLS reduce el impacto pero amplía innecesariamente la superficie | Alta | Completado |
| SEC-011 | Cinco funciones `SECURITY DEFINER` no fijan `search_path`: `auto_match_pre_alert`, `generate_quotation_number`, `handle_new_quotation_status_history`, `handle_new_user` y `prevent_role_change_by_non_admin` | Crítica | Completado |
| SEC-012 | Invitaciones ignoran el rol elegido y onboarding intenta autoaprobar/cambiar rol contra RLS | Crítica | Completado |
| SEC-013 | Portal no permite solicitar Cliente y el alta pública no distingue acceso interno de acceso cliente | Alta | Completado |
| SEC-014 | Invitado aprobado no puede iniciar sesión porque onboarding no establece contraseña | Alta | Completado |
| SEC-015 | Portal no ofrece recuperación segura de contraseña ni callback PKCE | Alta | Completado |
| SEC-016 | Portal de envíos abre tablas internas y puede exponer notas/contactos operativos | Crítica | En validación |
| SEC-017 | Cualquier usuario autenticado podía leer los datos personales de solicitudes comerciales en `leads` | Crítica | En validación |
| SEC-018 | Un slot Demo reutilizado podía conservar access/refresh tokens y términos de una entrega anterior | Crítica | En validación |
| SEC-019 | Storage y URLs de tracking podían exponer contenido externo o permitir cargas dentro del sandbox compartido | Alta | En validación |

### Integridad y finanzas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FIN-001 | Se permiten documentos fiscales sin CAI activo | Crítica | Completado |
| FIN-002 | Numeración CAI se calcula en cliente y es vulnerable a concurrencia | Crítica | Completado |
| FIN-003 | Activación de CAI no es atómica y no garantiza uno solo | Crítica | Completado |
| FIN-004 | Pago y cambio de estado se guardan en operaciones separadas | Alta | En validación |
| FIN-005 | Pagos pueden eliminarse físicamente sin reverso ni auditoría suficiente | Alta | En validación |
| FIN-006 | Cuentas por cobrar ignora pagos parciales, NC y ND en reportes | Alta | En validación |
| FIN-007 | Facturas vencidas no actualizan estado automáticamente | Alta | En validación |
| FIN-008 | CxP puede generarse varias veces desde la misma cotización | Alta | Completado |
| FIN-009 | Falta segregación creador/aprobador/pagador | Media | Pendiente |
| FIN-010 | Validar tratamiento de ISV en costo real y GP con Contabilidad | Media | Pendiente |
| FIN-011 | Implementar fase pendiente de retenciones ISV después del hardening | Media | Pendiente |

### Flujos y datos

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FLOW-001 | Estados legacy y actuales de cotización no coinciden | Crítica | En validación |
| FLOW-002 | Selección de tarifa y regeneración de pricing no son atómicas | Crítica | En validación |
| FLOW-003 | Operaciones `delete + insert` pueden perder contenedores, carga, BL o pricing | Crítica | En validación |
| FLOW-004 | Creación de cotización y tablas hijas no tiene rollback | Alta | En validación |
| FLOW-005 | Repricing puede actualizar SI y bookings parcialmente | Alta | En validación |
| FLOW-006 | No existe constraint de una tarifa seleccionada por cotización | Alta | Completado |
| FLOW-007 | No existe protección suficiente contra SI/CxP/proveedor duplicados | Alta | Completado |
| FLOW-008 | Numeración de manifiestos basada en `COUNT` es concurrente | Alta | Completado |
| FLOW-009 | Código muerto en duplicación de cotización | Baja | En validación |
| FLOW-010 | `pricing_items_delete_policy` solo permite Admin; DELETE silencioso acumula pricing Miami en cada guardado | Crítica | En validación |

### Miami y tracking

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| MIA-001 | Lista de embarque no crea un embarque/consolidación persistente | Alta | En validación |
| MIA-002 | Paquetes no conservan historial completo de milestones | Alta | En validación |
| MIA-003 | Falta vincular paquetes con vuelo, camión, contenedor o despacho | Alta | En validación |
| MIA-004 | Falta POD, reversos controlados y auditoría por evento | Media | En validación |
| MIA-005 | Agregar CHECK de `tipo_carga` y `cargo_status` al esquema real | Alta | Completado |
| MIA-006 | Revisar unicidad y tratamiento de tracking duplicado | Media | Completado |

### Bugs funcionales

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| BUG-001 | Reporte Pagos a Proveedores tiene código inalcanzable | Alta | En validación |
| BUG-002 | Notificaciones de tarifa vencida filtran estado legacy `Cotizada` | Alta | En validación |
| BUG-003 | Proveedores busca cotizaciones legacy `Aprobada` | Alta | En validación |
| BUG-004 | `/profile` no está autorizado para roles no Admin | Alta | Completado |
| BUG-005 | Tutorial Admin enlaza `/users` en vez de `/admin/users` | Media | Completado |
| BUG-006 | Sidebar cuenta notificaciones que nunca se marcan como leídas | Alta | En validación |
| BUG-007 | Tres sistemas de notificación están desconectados | Alta | Pendiente |

### Reportes y fechas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| REP-001 | Reportes pueden sumar USD y HNL y etiquetar con una sola moneda | Crítica | En validación |
| REP-002 | Dashboard financiero llama Revenue a venta cotizada, no facturada | Alta | En validación |
| REP-003 | GP real mezcla operaciones con y sin costos reales completos | Alta | En validación |
| REP-004 | Filtros usan fecha de creación en lugar de fecha de negocio | Media | Pendiente |
| REP-005 | Uso de UTC puede adelantar fechas un día en Guatemala | Alta | En progreso |
| REP-006 | Fechas `DATE` pueden mostrarse como el día anterior | Alta | En progreso |
| REP-007 | Crear helper único de fecha, moneda y tipo de cambio | Alta | En progreso |

### UX y documentación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| UX-001 | ERP interno no tiene sidebar/navegación móvil | Alta | En validación |
| UX-002 | Eliminaciones sensibles no piden confirmación | Alta | En validación |
| UX-003 | Formularios largos no tienen autosave ni guard de cambios | Alta | En validación |
| UX-004 | Filtros activos mantienen estilos inconsistentes | Media | Completado |
| UX-005 | Branding del sidebar difiere de configuraciones anteriores | Baja | Pendiente |
| UX-006 | Documento raíz usa `lang="en"` en una aplicación española | Baja | Completado |
| UX-007 | Revisar campos operativos del PDF por modalidad | Alta | Pendiente |
| UX-008 | Mejorar errores, loaders, navegación y accesibilidad | Media | Pendiente |

### Calidad y operación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| QA-001 | ESLint inicia con 277 errores y 94 advertencias | Alta | Pendiente |
| QA-002 | No existen pruebas automatizadas | Crítica | Pendiente |
| QA-003 | No existe CI como puerta de calidad | Alta | Pendiente |
| QA-004 | Páginas críticas superan 1,000–4,900 líneas | Alta | Pendiente |
| QA-005 | Uso extendido de `any` y casts inseguros | Alta | Pendiente |
| QA-006 | README continúa siendo el de `create-next-app` | Media | Completado |
| QA-007 | No existe un runner formal de migraciones | Crítica | Pendiente |
| QA-008 | `AGENTS.md`, `PHASES.md`, estados y código están desalineados | Alta | Pendiente |
| QA-009 | Auditoría npm mantiene dos vulnerabilidades moderadas sin fix | Media | Completado |

### Legal y privacidad

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| LEG-001 | Se incorporaron denominación legal y ubicación comercial de Hernova; falta RTN/ID y revisión contractual | Alta | En validación |
| LEG-002 | SLA, respaldos, retención, exportación y eliminación deben reflejar capacidades y planes realmente ofrecidos | Alta | Pendiente de definición comercial |
| LEG-003 | Términos, privacidad, tratamiento de datos y limitación de responsabilidad requieren revisión de abogado hondureño | Alta | En validación jurídica |
| LEG-004 | Demo registra aceptación versionada por usuario; falta aceptación por organización/usuario en instalaciones de clientes | Alta | En progreso |

## Ambiente Demo y Pilot

Se separan dos productos comerciales con objetivos distintos.

### Demo compartida

- Deployment Preview de la rama `demo` y proyecto Supabase staging separados de
  producción.
- Dominio previsto: `demo.forwarders.app`.
- Base compartida con datos exclusivamente ficticios y aviso explícito de que
  otros evaluadores pueden ver o modificar esos datos.
- Cinco pares de cuentas `Admin`/`Cliente`, creados manualmente y con vigencia
  de 72 horas; no hay registro autónomo ni recuperación de contraseña.
- Banner persistente, aceptación versionada, marca de agua en impresión/PDF,
  expiración automática y bitácora de sesiones.
- Configuración sensible, usuarios, CAI, catálogos maestros, leads privados y
  eliminaciones raíz quedan bloqueados para evaluadores.
- La bandeja de solicitudes comerciales pertenece únicamente a un Admin de
  plataforma de Hernova; el rol `Admin` del ERP no concede ese privilegio.
- Los cambios de una sesión pueden afectar a las demás porque este producto no
  crea un workspace por prospecto.

### Pilot pagado

- Instancia independiente para un solo prospecto, con Supabase, deployment,
  dominio y datos separados.
- Vigencia comercial prevista de 14 días.
- Puede incluir datos ficticios adaptados al prospecto y configuración propia.
- El pago de onboarding se descuenta de la contratación si el prospecto
  continúa.
- Un Pilot no se implementa como usuario adicional dentro de la Demo compartida.

### Decisión Supabase Pro

Estado: `Proyecto staging existente seleccionado; plan Pro pendiente de uso real`.

La Demo utiliza el proyecto staging `wlssekvxpfxhwedsjhpz`. No se adquiere un
plan únicamente por anticipación. Antes de escalar se evaluará:

- Cantidad real de evaluadores simultáneos.
- Necesidad de branching, PITR, backups y retención de logs.
- Uso estimado de base de datos, Storage, Realtime y funciones.
- Necesidad de cron y límites de ejecución.
- Costo y retención requeridos por Pilots o clientes independientes.

La Demo no se habilita para terceros hasta aplicar y probar sus migraciones,
desactivar el signup directo en Supabase Auth, cargar el dataset ficticio,
verificar Storage, configurar las variables Preview por rama y completar UAT.
Estado de release: `BLOQUEADO` hasta verificar y conservar evidencia de que
`Allow new users to sign up` está desactivado en el proyecto demo. Ocultar o
bloquear `/register` y `/portal/register` no sustituye este control, porque el
endpoint público de Supabase Auth puede invocarse directamente y el trigger
`handle_new_user` crea el perfil pendiente con `SECURITY DEFINER`.

## Bitácora de cambios

Agregar una entrada por fix:

```md
### YYYY-MM-DD — ID — Título

- Estado: En validación | Completado
- Código:
  - `ruta/archivo.ts`
- SQL:
  - `sql/YYYYMMDD_descripcion.sql`
- Validaciones:
  - `npx tsc --noEmit`: OK
  - `npm run lint`: OK / deuda restante documentada
  - Tests: descripción
  - Build: OK
- Verificación manual/RLS: descripción
- Riesgos pendientes: ninguno / detalle
- Commit: hash pendiente
```

### 2026-06-22 — BASELINE — Registro inicial

- Estado: Completado
- Se creó el plan maestro de hardening y ambiente Trial.
- Se registraron los hallazgos iniciales de la auditoría integral.
- Se añadió a `AGENTS.md` la obligación de mantener esta bitácora.
- Supabase Pro queda pendiente de evaluación en Fase 11.
- Commit: `f591015`

### 2026-06-22 — LEGAL — Términos de uso y privacidad

- Estado: En validación jurídica; no marcar como versión contractual final.
- Código:
  - `src/app/politicas/page.tsx`
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - ESLint: cero errores; una advertencia previa de `<img>` en la landing.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se separaron alcance contractual, privacidad, subprocesadores, cookies,
    retención, documentos logísticos, propiedad intelectual, confidencialidad,
    responsabilidad, terminación, Trial y ley aplicable.
  - Se eliminaron promesas absolutas de disponibilidad, seguridad, retención y
    respuesta que no estaban ligadas a un SLA o contrato.
- Pendiente del titular:
  - Denominación legal, RTN/identificación y domicilio de DHer.
  - Jurisdicción/ciudad o cláusula arbitral, política real de backups/retención,
    SLA ofrecido y confirmación de correos/dominio.
  - Revisión y aprobación por abogado hondureño.
- Commit: `5f263b9`

### 2026-06-22 — FASE-1 — Settings, perfiles y notificaciones

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/lib/permissions.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/lib/notifications.ts`
- SQL:
  - `supabase/migrations/20260622210000_phase1_notifications_profiles.sql`
- Pruebas:
  - `supabase/tests/phase1_notifications_profiles.sql`
  - `supabase db reset --local`: OK.
  - Suites RLS de Fase 1: OK, con rollback.
  - `supabase db lint --local --level error`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos TypeScript modificados: OK.
- Cambios:
  - Settings Empresa queda disponible al personal interno; CAI solo a
    Admin/Contabilidad/Finanzas; Cliente vuelve al portal sin bucle.
  - Matching de rutas exige segmento completo y evita prefijos accidentales.
  - Directorio de perfiles excluye Cliente y pendientes para roles no Admin.
  - Notificaciones internas se crean mediante RPC autorizada y el usuario solo
    puede cambiar `is_read`.
  - Notificaciones de portal permiten inserción de Admin/Operaciones y Cliente
    solo puede cambiar `read_at`.
- Producción:
  - Migración aplicada y registrada como `20260622210000`.
  - Historial local/remoto alineado y `db push --dry-run` sin pendientes.
- Commit: `f8e209e`

### 2026-06-22 — UI — Filtros, navegación y alertas

- Estado: Completado
- Código:
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/topbar.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
- Cambios:
  - Presets activos azules y estado personalizado en ambos dashboards.
  - Match exacto de Dashboard Bodega para no activarlo en Manifiestos.
  - Badge superior basado en alertas altas nuevas, persistido por usuario.
- Commit: `0a0038d`

### 2026-06-22 — NEXT-001 — Convención Proxy

- Estado: Completado
- Código:
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; Next reconoce `Proxy (Middleware)`.
- Cambio:
  - Se migró `middleware.ts` a la convención `proxy.ts` de Next.js 16.
- Riesgo pendiente:
  - SEC-005: todavía requiere migrar la sesión a SSR real.
- Commit: `4d3a5c7`

### 2026-06-22 — UX — Landing de freight forwarders

- Estado: Completado
- Código:
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - ESLint del archivo: cero errores, una advertencia por imagen externa.
- Commit: `897a1d0`

### 2026-06-22 — UX — Paginación y filtros reutilizables

- Estado: Completado
- Código:
  - `src/components/ui/Pagination.tsx`
  - `src/lib/ui-classes.ts`
  - Listados de CxP, clientes, histórico, facturación, inventario y operaciones.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - Reinicio de página movido a eventos de filtro para evitar renders en cascada.
- Commit: `b995bd9`

### 2026-06-22 — FASE-0 — Baseline reproducible y auditoría real

- Estado: Completado
- Código/configuración:
  - `package.json`: Supabase CLI 2.107.0 agregado como devDependency.
  - `package-lock.json`: dependencia bloqueada.
  - `supabase/config.toml`: configuración local inicial creada.
  - `supabase/seed.sql`: seed local vacío para evitar datos reales.
  - `.gitignore`: carpeta `/backups/` excluida de Git.
- Verificaciones:
  - CLI ejecutable con `npx supabase --version`: 2.107.0.
  - Proyecto vinculado coincide con `NEXT_PUBLIC_SUPABASE_URL`.
  - Metadata local `.temp` correctamente ignorada por Git.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK (solo avisos esperados de CRLF en Windows).
  - Docker Desktop y WSL 2 instalados; Docker Engine verificado.
  - Backup remoto de roles, esquema y datos completado en `/backups/`.
  - Migración baseline creada: `supabase/migrations/20260622175445_baseline.sql`.
  - Historial local y remoto alineado en `20260622175445`.
  - `supabase start`: stack local iniciado correctamente.
  - `supabase db reset --local`: reconstrucción desde cero completada.
  - Diff `migrations -> linked` para `public`: sin diferencias.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK (Next.js 16.2.6, 57 páginas estáticas).
  - `npm run lint`: deuda existente, 277 errores y 95 advertencias.
- Riesgos observados:
  - El dump de datos advierte relaciones circulares en `profiles`,
    `quotations`, `bills_of_lading`, `invoices`, `cuentas_pagar` y
    `clientes`; la restauración local debe validarse con constraints/triggers.
  - 55/55 tablas tienen RLS habilitado; `garantias_navieras` no tiene políticas.
  - Se detectaron 22 políticas con expresiones permisivas `true`.
  - Se detectaron grants `ALL` a `anon` en las 55 tablas públicas.
  - 38 funciones son `SECURITY DEFINER`; cinco no fijan `search_path`.
- Próximo paso:
  - Fase 1: corregir RLS, funciones privilegiadas, grants y escalamiento de rol.
- Commit: `f591015`

### 2026-06-22 — FASE-1 — Hardening inicial de RLS y perfiles

- Estado: Completado y aplicado en remoto; SEC-005 continúa en Fase 3 (SSR).
- SQL:
  - `supabase/migrations/20260622190000_phase1_rls_hardening.sql`
- Pruebas:
  - `supabase/tests/phase1_rls.sql`
  - Matriz validada para Admin, Pricing, Ventas, Operaciones, Contabilidad,
    Finanzas, Cliente y anon.
  - `supabase db reset --local`: OK.
  - Prueba RLS transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
- Cambios principales:
  - Se agregaron los roles de esquema `Finanzas` y `Cliente` ya usados por UI.
  - Cliente dejó de calificarse como usuario interno aprobado.
  - Se bloqueó la edición propia de rol, aprobación, actividad y vínculo cliente.
  - Agentes, catálogos, costos, historial, BL y garantías usan la matriz aprobada.
  - Funciones privilegiadas fijan `search_path` y `anon` solo puede crear leads.
- Producción:
  - Migración aplicada y registrada como `20260622190000`.
  - `supabase db push --dry-run`: base remota al día.
  - Dump remoto posterior: 36 políticas nuevas, cero políticas legacy abiertas.
  - `anon`: únicamente `USAGE` del esquema e `INSERT` sobre `leads`.
  - El warning posterior de caché `pg-delta` no afectó la migración; se desactivó
    el motor experimental local para usar `migra` de forma estable.
- Commit: `f591015`

### 2026-06-22 — FASE-2 — Integridad inicial de Miami

- Estado: En validación; aplicado en remoto, pendiente de auditar y limpiar datos legacy.
- SQL:
  - `supabase/migrations/20260622223000_phase2_miami_integrity.sql`
  - `supabase/preflight/phase2_integrity_audit.sql`
- Pruebas:
  - `supabase/tests/phase2_miami_integrity.sql`
  - `supabase db reset --local`: OK.
  - Prueba transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: deuda global preexistente, 277 errores y 93 advertencias;
    los archivos de esta entrega son SQL y documentación.
- Cambios:
  - La numeración de manifiestos deja de depender de `COUNT` y usa una secuencia
    global protegida, segura ante solicitudes concurrentes.
  - El RPC de numeración queda restringido a Admin y Operaciones.
  - Se agregan constraints `NOT VALID` para tipo de carga, estado, medidas no
    negativas y total de paquetes no negativo; protegen escrituras nuevas sin
    bloquear todavía por datos legacy.
  - El preflight audita duplicados y valores inválidos antes de imponer o validar
    constraints adicionales sobre pricing, SI, CxP, tracking y Miami.
- Riesgos pendientes:
  - Ejecutar el preflight contra remoto y limpiar cualquier fila reportada.
  - Validar los constraints después de la limpieza.
  - Los números de secuencia pueden tener saltos; esto es esperado y evita
    reutilizar identificadores tras errores o transacciones revertidas.
- Producción:
  - Migración aplicada y registrada como `20260622223000`.
  - `supabase db push --linked --dry-run`: remoto al día.
- Commit: `c1cb17a`

### 2026-06-22 — FASE-2 — Constraints validados y unicidad operativa

- Estado: Completado para FLOW-006, FLOW-008 y MIA-005; FLOW-007 continúa
  en progreso por la generación idempotente de CxP pendiente.
- SQL:
  - `supabase/migrations/20260622231500_phase2_validate_integrity.sql`
- Pruebas:
  - Preflight remoto: ocho verificaciones con cero grupos en conflicto.
  - `supabase/tests/phase2_validated_integrity.sql`: OK, con rollback.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se validaron los cuatro constraints de tipo, estado y cantidades de Miami.
  - Solo puede existir una tarifa activa seleccionada por cotización.
  - Solo puede existir una Shipping Instruction activa por cotización.
  - Una factura AP no anulada no puede repetir su número para el mismo proveedor;
    la comparación ignora mayúsculas y espacios exteriores.
- Decisiones de dominio:
  - No se hizo único el tracking: varias piezas pueden compartir referencia.
  - No se hizo única la combinación proveedor/factura en líneas de costo real:
    una factura puede contener varios conceptos legítimos.
- Producción:
  - Migración aplicada y registrada como `20260622231500`.
- Riesgo pendiente:
  - La creación automática de CxP desde una cotización necesita una clave de
    idempotencia/RPC transaccional para distinguir duplicados de costos legítimos.
- Commit: `0d114b2`

### 2026-06-22 — FASE-2 — CxP de flete idempotente

- Estado: Completado; cierra FIN-008 y FLOW-007 y completa la Fase 2.
- Código:
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260622234500_phase2_idempotent_freight_payable.sql`
- Pruebas:
  - `supabase/tests/phase2_idempotent_freight_payable.sql`: OK, con rollback.
  - Dos llamadas consecutivas retornan el mismo ID y solo una crea la CxP.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - ESLint del archivo modificado conserva deuda previa: 10 errores y 11
    advertencias; el bloque nuevo no introduce `any` ni efectos adicionales.
- Cambios:
  - La CxP automática se crea mediante un RPC transaccional autorizado solo para
    Admin, Finanzas y Contabilidad.
  - Una clave de generación por cotización evita duplicados por doble clic,
    reintentos o solicitudes concurrentes sin bloquear otros costos legítimos.
  - El RPC valida cotización Ganada, tarifa seleccionada, costo positivo y un
    único proveedor activo vinculado al agente.
  - La UI informa si creó la CxP o si ya existía.
- Producción:
  - Migración aplicada y registrada como `20260622234500`.
- Riesgos pendientes:
  - Si un agente tiene más de un proveedor activo vinculado, el RPC lo bloquea
    con un error explícito hasta corregir el catálogo.
- Commit: `5bc4e71`

### 2026-06-22 — FASE-3 — Sesión SSR y protección de rutas

- Estado: En validación; protección anónima comprobada, pendiente de prueba manual
  con sesiones reales de personal y Cliente antes de cerrar SEC-005.
- Código:
  - `src/proxy.ts`
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/hooks/useUser.tsx`
  - `src/app/portal/layout.tsx`
  - Páginas del portal ajustadas para identidad nullable segura.
  - `src/lib/permissions.ts`
  - `src/components/onboarding/OnboardingTutorial.tsx`
- Dependencias:
  - Se agregó `@supabase/ssr` 0.12.0.
  - Se eliminó `@supabase/auth-helpers-nextjs`.
  - `@supabase/supabase-js` resolvió a 2.108.2, compatible con el peer de SSR.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 rutas; las rutas ERP ahora son dinámicas por sesión.
  - ESLint de los archivos modificados: cero errores, siete advertencias legacy.
  - `npm run lint`: deuda global reducida a 268 errores y 89 advertencias.
  - `npm audit --omit=dev`: dos vulnerabilidades moderadas heredadas de PostCSS
    dentro de Next; no se ejecutó `--force` porque propone un downgrade rompedor.
  - HTTP local sin sesión:
    - `/login`, `/portal/login` y `/politicas`: 200.
    - `/dashboard` y `/miami/inventario`: 307 a `/login`.
    - `/portal`: 307 a `/portal/login`.
- Cambios:
  - Las sesiones pasan de `localStorage` a cookies gestionadas por Supabase SSR.
  - Proxy valida claims, refresca cookies y bloquea rutas privadas antes del render.
  - El layout ERP vuelve a comprobar usuario y perfil aprobado/activo en servidor.
  - Cliente no puede renderizar el ERP interno y se redirige a `/portal`.
  - `useUser` comparte una sola carga de identidad por árbol, evitando decenas de
    consultas duplicadas por página.
  - `/portal/login` deja de quedar bloqueado por el layout autenticado del portal.
  - Perfil queda disponible para todos los roles internos y el tutorial Admin usa
    `/admin/users`.
- Riesgos pendientes:
  - Los usuarios con una sesión legacy en `localStorage` deberán iniciar sesión de
    nuevo para crear la cookie SSR.
  - Probar login/logout y expiración con Admin, rol interno y Cliente reales.
  - La autorización fina de rutas sigue complementada por RLS y el guard de rol;
    se revisará la estrategia de permisos de servidor antes de cerrar la fase.
- Commit: `b833e8f`

### 2026-06-22 — SEC-012 — Invitaciones y onboarding autorizados

- Estado: Completado en código; el envío real de correo depende de la
  configuración SMTP/redirect URL de Supabase.
- Código:
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores y cero advertencias.
  - `npm run build`: OK, 58 rutas.
- Cambios:
  - El backend Admin asigna y aprueba el rol seleccionado después de invitar.
  - Las invitaciones ahora admiten también Cliente, coherente con el selector UI.
  - Onboarding solo actualiza nombre, apellido y correo; ya no intenta escalar rol,
    estado ni actividad desde una sesión no administrativa.
- Riesgos pendientes:
  - Probar entrega de invitación y callback con `NEXT_PUBLIC_SITE_URL` del ambiente.
  - Un Cliente invitado debe vincularse a un registro de cliente para ver datos.
- Commit: `80e7e5f`

### 2026-06-22 — SEC-013 — Registro e invitación de clientes

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/portal/register/page.tsx`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/app/(protected)/admin/users/page.tsx`
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
  - `src/proxy.ts`
- SQL:
  - `supabase/migrations/20260622235900_phase3_client_registration.sql`
- Pruebas:
  - `supabase/tests/phase3_client_registration.sql`: OK, con rollback.
  - Solicitud Cliente crea perfil `Cliente/Pendiente`, sin aprobación ni vínculo.
  - Metadata que solicita Admin se degrada a `Ventas/Pendiente`.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Portal Login ofrece “Solicitar cuenta” y `/portal/register` recopila persona,
    empresa, teléfono, correo y contraseña.
  - El registro público solo puede pedir Cliente y siempre queda Pendiente.
  - Admin ve empresa/teléfono, vincula el perfil a `clientes` y solo entonces
    puede aprobarlo.
  - “Invitar usuario” incluye Cliente; las invitaciones Cliente también quedan
    pendientes de vínculo, mientras los roles internos conservan alta directa.
  - Onboarding respeta rol/estado asignados por Admin y nunca se autoaprueba.
- Producción:
  - Migración aplicada y registrada como `20260622235900`.
- Riesgos pendientes:
  - Verificar política real de confirmación de correo y SMTP en Supabase Auth.
  - Probar manualmente solicitud, vínculo, aprobación y primer login Cliente.
- Commit: `1f7531f`

### 2026-06-23 — SEC-014 — Contraseña de invitado y caché de perfiles

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/onboarding/page.tsx`
- SQL:
  - `supabase/migrations/20260623001500_phase3_profile_schema_cache.sql`
- Validaciones:
  - Migración local: OK; columnas ya existentes confirmadas.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de onboarding: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Onboarding exige crear y confirmar una contraseña de al menos 8 caracteres
    antes de completar el perfil invitado.
  - Se fuerza `pgrst reload schema` para que la API reconozca inmediatamente
    `registration_company` y `registration_phone`.
- Producción:
  - Migración aplicada como `20260623001500`; ambas columnas ya existían, lo que
    confirmó que el error observado era caché de PostgREST.
- Acción manual:
  - El invitado existente debe abrir su correo de invitación y completar
    onboarding para establecer contraseña; aprobarlo no genera una contraseña.
- Commit: `37da8d4`

### 2026-06-23 — SEC-015 — Recuperación de contraseña Cliente

- Estado: Completado en código; pendiente verificar entrega real del correo.
- Código:
  - `src/app/portal/forgot-password/page.tsx`
  - `src/app/portal/reset-password/page.tsx`
  - `src/app/auth/callback/route.ts`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 62 rutas.
  - Se corrigió el requisito Next 16 de `Suspense` para `useSearchParams`.
- Cambios:
  - Portal Login incorpora “¿Olvidaste tu contraseña?”.
  - El formulario envía un correo sin revelar si la cuenta existe.
  - `/auth/callback` intercambia el código PKCE por una sesión SSR y solo acepta
    destinos internos bajo `/portal/`.
  - La sesión temporal permite establecer y confirmar una contraseña nueva;
    después se cierra y vuelve al login.
- Acción manual:
  - Autorizar `/auth/callback` para localhost y producción en Supabase Auth URL
    Configuration y probar un correo real.
- Commit: `7d87b1f`

### 2026-06-23 — FASE-3 — Cierre de autenticación y portal Cliente

- Estado: Completado con validación manual del titular.
- Validación manual:
  - Admin inicia sesión y accede a Dashboard/Profile.
  - Logout invalida acceso y `/dashboard` redirige a `/login`.
  - Registro, vínculo, aprobación y acceso Cliente funcionan correctamente.
  - Recuperación de contraseña Cliente envía enlace y permite restablecer acceso.
- Resultado:
  - SEC-005 queda cerrado; sesión SSR, cookies, proxy, perfil activo, permisos y
    portal Cliente fueron comprobados de extremo a extremo.
- Próximo paso:
  - Fase 4: CAI, numeración fiscal, facturación, CxC, CxP y pagos.
- Commit: `aee39c9`

### 2026-06-23 — FASE-4 — Preflight financiero y fiscal

- Estado: Completado; auditoría local y remota sin conflictos.
- SQL:
  - `supabase/preflight/phase4_finance_audit.sql`
- Validaciones:
  - Ejecución contra base local reconstruida: OK, 11 verificaciones.
  - Ejecución manual contra Supabase remoto: OK, 11/11 conteos en cero.
  - El script es de solo lectura y devuelve únicamente conteos agregados.
- Alcance:
  - Rangos CAI activos, formato, orden y vencimiento.
  - Documentos fiscales sin CAI o fuera del rango estampado.
  - Facturas sin líneas o con subtotal inconsistente.
  - Pagos en moneda distinta, sobrepagos y pagos sobre facturas anuladas.
- Próximo paso:
  - Con los conteos remotos, implementar activación CAI atómica, correlativo fiscal
    transaccional y creación conjunta de factura/líneas.
- Commit: `839df3e`

### 2026-06-23 — FASE-4 — CAI y creación fiscal atómica

- Estado: Completado; código y migración aplicados en remoto.
- Hallazgos: FIN-001, FIN-002 y FIN-003.
- Archivos:
  - `supabase/migrations/20260623010000_phase4_cai_atomic.sql`
  - `supabase/tests/phase4_cai_atomic.sql`
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/invoicing/new/page.tsx`
- Cambios:
  - Rangos CAI separados por Factura, Nota de Crédito y Nota de Débito.
  - Activación transaccional con un solo rango activo por tipo documental.
  - Correlativo CAI persistente y bloqueado en base de datos para evitar
    duplicados concurrentes.
  - Factura, líneas, impuestos y avance del correlativo se guardan en una sola
    transacción mediante `create_invoice_with_items`.
  - Proformas usan una secuencia independiente y segura ante concurrencia.
  - La UI ya no calcula números fiscales ni guarda encabezado y líneas por
    separado.
- Validaciones ejecutadas:
  - Preflight remoto: 11/11 verificaciones con cero conflictos.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_cai_atomic.sql`: OK; correlativos consecutivos,
    impuestos, atomicidad, permisos y rollback verificados.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `supabase db push --linked --dry-run`: remoto al día después del despliegue.
- Incidencias detectadas durante pruebas:
  - La primera prueba local detectó una referencia inválida a `clientes.email`;
    se corrigió a `clientes.email_1`. La transacción abortó antes de insertar
    documentos. La segunda ejecución confirmó los correlativos `00000101` y
    `00000102`, y detectó una columna ambigua únicamente en la aserción del test;
    se calificó como `invoice_items.tax_amount`; la tercera ejecución pasó.
- Producción:
  - Migración aplicada y registrada como `20260623010000`.
  - No quedan migraciones locales pendientes contra remoto.
- Riesgo residual:
  - Los tipos y rangos reales deben coincidir con la autorización vigente de SAR
    y ser confirmados por Contabilidad; este hardening no sustituye revisión
    fiscal/legal.
- Commit: `0b5b7e3`

### 2026-06-23 — FASE-4 — Pagos atómicos y reversos auditables

- Estado: En validación manual; migración aplicada en remoto y pruebas
  automatizadas completadas.
- Hallazgos: FIN-004 y FIN-005.
- Archivos:
  - `supabase/migrations/20260623014500_phase4_payment_atomic.sql`
  - `supabase/tests/phase4_payment_atomic.sql`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
- Cambios:
  - Registro de pago, cálculo de saldo, estado y fecha de pago se ejecutan en una
    sola transacción mediante `register_invoice_payment`.
  - Se incorpora el estado `Parcialmente Pagada` para representar cobros reales.
  - Los pagos dejan de eliminarse: `reverse_invoice_payment` conserva el
    movimiento, usuario, fecha y motivo del reverso.
  - Escrituras directas sobre `invoice_payments` quedan revocadas para usuarios
    autenticados; solo los RPC autorizados pueden registrar o revertir.
  - Se bloquean sobrepagos, monedas distintas, fechas futuras, pagos por Ventas,
    anulación con pagos aplicados y estado Pagada con saldo pendiente.
  - CxC, cierre mensual y estado de cuenta excluyen pagos reversados.
  - Registro y reverso generan eventos en `activity_logs`.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_payment_atomic.sql`: OK; pago parcial/total, bloqueo
    de sobrepago/anulación/DELETE, reverso, permisos, auditoría y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - Migración remota aplicada como `20260623014500`.
- Validación manual pendiente:
  - Registrar un pago parcial y completar el saldo desde una factura aprobada.
  - Reversar uno de los pagos indicando motivo y confirmar que permanece visible,
    deja de sumar y recalcula estado/saldo.
  - Confirmar que no se puede anular una factura con pagos aplicados.
- Riesgo residual:
  - Los constraints de monto positivo y moneda válida protegen escrituras nuevas
    como `NOT VALID`; su validación histórica se hará junto al cierre de CxC.
- Commit: `c0c89a6`

---

### 2026-06-23 — FLOW-010 — Fix acumulación de pricing items en flujo Miami

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: FLOW-010.
- Causa raíz: `pricing_items_delete_policy` solo permitía `is_admin()` para DELETE.
  El flujo de guardado Miami en `quotations/[id]/edit` ejecuta DELETE + INSERT para
  reemplazar los pricing items. El DELETE devolvía éxito sin error (Supabase no
  retorna error cuando RLS filtra todas las filas), pero no borraba nada. Cada
  guardado acumulaba un set adicional de items en lugar de reemplazarlos.
- Archivos SQL:
  - `supabase/migrations/20260623030000_fix_pricing_items_delete_rls.sql`
- Cambio:
  - Se reemplaza la política exclusiva de Admin por una matriz explícita para
    Admin, Pricing, Ventas y Operaciones con acceso a la cotización.
  - Contabilidad y Cliente permanecen sin permiso de eliminación.
  - Sigue el mismo patrón de `quotation_cargo_lines_delete_policy` y
    `quotation_containers_delete_policy`.
  - No hay cambios de código TypeScript; el error era exclusivamente de RLS.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - `supabase/tests/phase5_pricing_delete_rls.sql`: OK con cinco roles y rollback.
  - Migración remota aplicada y registrada como `20260623030000`.
- Validación manual pendiente:
  - Abrir una cotización Miami LCL con pricing existente.
  - Guardar desde `/edit` con un monto de pickup distinto.
  - Verificar que el "Detalle de Servicios" en el PDF muestra exactamente un set
    de items (no acumulación).
  - Guardar por segunda vez y confirmar que el set se reemplaza, no se duplica.
- Riesgo residual:
  - La auditoría `supabase/tests/cleanup_duplicate_pricing_items.sql` es de solo
    lectura. No se eliminarán supuestos duplicados sin revisión y respaldo por
    Pricing/Contabilidad.
- Commit: `2f44573`

### 2026-06-23 — FASE-4 — CxC ajustada y vencimientos automáticos

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FIN-006 y FIN-007.
- Archivos:
  - `supabase/migrations/20260623021500_phase4_receivables.sql`
  - `supabase/tests/phase4_receivables.sql`
  - `src/app/(protected)/invoicing/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
- Cambios:
  - `invoice_receivables` centraliza factura menos NC, más ND, menos pagos
    aplicados y excluye pagos reversados.
  - Facturación, detalle, CxC, vencidas y estado de cuenta consumen el saldo
    ajustado en lugar del total bruto.
  - Se agrega estado `Saldada` para facturas compensadas totalmente por NC.
  - Notas nuevas deben pertenecer al mismo cliente y moneda de la factura.
  - Registro/reverso de pagos usa el total ajustado para bloquear sobrepagos.
  - `refresh_invoice_receivable_statuses` y una tarea diaria `pg_cron` a las
    00:05 UTC sincronizan estados vencidos.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones locales presentes.
  - `supabase/tests/phase4_receivables.sql`: OK; NC/ND, pago parcial/final,
    sobrepago, moneda, vencimiento, cron y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las tres páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623021500`.
- Riesgos o trabajo pendiente:
  - Validar manualmente Reportes > Cuentas por cobrar y Vencidas con datos reales.
- Commit: `546fbb2`

### 2026-06-23 — PORTAL — Envíos freight con exposición segura

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: SEC-016.
- Archivos:
  - `supabase/migrations/20260623020000_phase5_portal_shipments.sql`
  - `supabase/tests/phase5_portal_shipments.sql`
  - `src/app/portal/layout.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
- Cambios:
  - El portal incorpora listado, detalle, ruta, hitos, fechas, transporte y
    referencias documentales de los envíos freight del cliente.
  - Se descartaron políticas SELECT directas sobre `quotations` y
    `shipping_instructions`; RLS de filas no protege columnas internas.
  - `get_client_shipments` verifica rol Cliente y vínculo `cliente_id`, y devuelve
    únicamente campos comerciales permitidos.
  - Los contadores usan conteos reales y las fechas evitan desfase UTC/Honduras.
- Validaciones ejecutadas:
  - `supabase/tests/phase5_portal_shipments.sql`: OK; aislamiento entre dos
    clientes, acceso directo bloqueado, columnas internas ausentes y rollback.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a Portal, Facturación y Reportes: OK, sin advertencias.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623020000`.
- Validación manual pendiente:
  - Confirmar listado y detalle con un Cliente que tenga una SI vinculada.
- Commit: `ec786fc`

### 2026-06-24 — Sincronización del historial remoto

- Estado: Completado.
- Acción manual:
  - Se registraron como aplicadas las migraciones `20260623020000`,
    `20260623021500`, `20260623030000` y `20260623040000` después de su ejecución
    satisfactoria en Supabase SQL Editor.
- Validación:
  - `supabase migration list --linked`: Local y Remote coinciden en todas las
    versiones hasta `20260623040000`.
- Riesgos pendientes:
  - Mantener SEC-016, FIN-006/007 y FLOW-010 en validación hasta probar sus flujos
    de interfaz con datos reales.
- Commit: `5c6196a`

### 2026-06-24 — FASE-5 — Selección atómica de tarifa de agente

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FLOW-001 y FLOW-002.
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql`
  - `supabase/tests/phase5_atomic_agent_selection.sql`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/lib/tarifa-expiry-check.ts`
- Cambios:
  - La selección de tarifa, deselección anterior, reemplazo de pricing y
    sincronización comercial se ejecutan en una sola transacción mediante RPC.
  - El RPC valida rol Pricing/Admin, pertenencia de la tarifa, motivo y valores
    no negativos antes de modificar datos, y registra el evento en
    `activity_logs`.
  - Las alertas de vencimiento usan los estados vigentes del flujo en lugar del
    estado legacy `Cotizada`.
  - El proceso global de vencimientos deja de ser ejecutable por `anon` y
    `authenticated`; queda reservado a `service_role` y tareas internas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
  - `supabase db reset --local --yes`: OK desde baseline hasta
    `20260624010000`.
  - `supabase/tests/phase5_atomic_agent_selection.sql`: OK; selección única,
    reemplazo total, sincronización, rollback ante línea inválida y permisos.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260624010000`.
  - `supabase migration list --linked`: historial local/remoto alineado.
  - `supabase db push --linked --dry-run`: remoto actualizado, sin pendientes.
  - ESLint dirigido: conserva 31 errores y 5 advertencias preexistentes del
    archivo histórico de Pricing; el cambio no agrega nuevos usos de `any`.
- Riesgos o trabajo pendiente:
  - Probar manualmente el cambio de tarifa en Pricing Comparison con dos
    alternativas y confirmar el motivo, totales y refresco visual.
- Commit: `8c30148`

### 2026-06-24 — FASE-5 — Corrección: Race condition en selección de tarifa

- Estado: Completado
- Hallazgos: FLOW-002 (race condition)
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql` (modificado)
  - `supabase/migrations/20260624020000_fix_phase5_atomic_selection_race_condition.sql` (migración de corrección)
- Cambios:
  - Se reemplazó el UPDATE combinado `is_selected = (id = p_agent_quote_id)` por dos UPDATEs secuenciales:
    1. Deseleccionar todas las tarifas de la cotización donde `is_selected = true`
    2. Seleccionar solo la nueva tarifa mediante `UPDATE WHERE id = p_agent_quote_id SET is_selected = true`
  - Esto elimina la race condition donde PostgreSQL detectaba `duplicate key value violates unique constraint "agent_quotes_one_selected_per_quotation_idx"` durante cambios de tarifa.
  - La causa raíz era que el UPDATE combinado permitía que PostgreSQL viera temporalmente dos registros con `is_selected = true` en el mismo `quotation_id` durante el apply del índice único.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - Nueva migración `20260624020000` creada y aplicada exitosamente.
  - `supabase migration list --linked`: confirmado sincronización local/remoto en ambas migraciones.
  - Cambio es idempotente y refuerza la integridad del constraint único.
- Riesgos o trabajo pendiente:
  - Ninguno; ya puede seleccionar tarifas sin error de constraint.
- Commit: [en progreso]

### 2026-06-27 — FASE-5 — Sincronización operacional tras cambio de tarifa aceptada

- Estado: En validación manual.
- Hallazgos: FLOW-002, FLOW-003, FLOW-004, FLOW-005 y FLOW-009.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/suppliers/[id]/page.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
- SQL:
  - `supabase/migrations/20260627010000_phase5_atomic_operational_repricing.sql`
    agrega RPC transaccional para sincronizar Shipping Instruction y bookings
    editables desde la tarifa seleccionada.
  - `supabase/migrations/20260627020000_phase5_atomic_quotation_children_replace.sql`
    agrega RPC transaccional para reemplazar contenedores, carga suelta y cargos
    Miami sin riesgo de `delete + insert` parcial.
  - `supabase/migrations/20260627030000_phase5_atomic_quotation_create.sql`
    agrega RPC transaccional para crear cotización con contenedores, carga suelta
    y cargos Miami en una sola operación.
  - `supabase/migrations/20260627040000_phase5_atomic_operations_container_replace.sql`
    agrega RPCs transaccionales para reemplazar contenedores de Booking y BL.
  - `supabase/migrations/20260624030000_sales_activities.sql` ajustada para
    recrear policies de forma idempotente si el remoto quedó parcialmente aplicado.
  - Sin migración nueva para selección de tarifa; depende de `20260624010000_phase5_atomic_agent_selection.sql`
    y `20260624020000_fix_phase5_atomic_selection_race_condition.sql`.
- Cambios:
  - Pricing Comparison prepara y sincroniza agente, contacto, email, carrier, ETD,
    tránsito y días libres hacia la Shipping Instruction afectada.
  - Shipping Instruction permite actualizar datos operativos desde la tarifa
    seleccionada en Pricing cuando una tarifa aceptada debe reemplazarse por
    cancelación o falta de espacio del agente.
  - El Routing Order PDF toma `transshipment` desde la cotización cuando no está
    presente en la ruta.
  - La sincronización operacional desde Pricing/Shipping Instruction deja de hacer
    updates secuenciales desde el cliente y pasa por
    `sync_shipping_instruction_from_selected_agent_quote`.
  - La edición de cotizaciones reemplaza tablas hijas mediante
    `replace_quotation_child_lines`, evitando que una falla de insert deje
    contenedores, carga o pricing eliminados.
  - La creación de cotizaciones usa `create_quotation_with_child_lines` para
    evitar encabezados creados sin contenedores, carga o pricing automático.
  - Operaciones reemplaza contenedores de Booking/BL mediante
    `replace_booking_containers` y `replace_bl_containers`, evitando deletes
    silenciosos bloqueados por RLS y reemplazos parciales.
  - La acción de duplicar cotización usa únicamente
    `/quotations/new?duplicateFrom=...`; el flujo viejo de inserción directa
    queda fuera de ejecución.
  - Proveedores lista cotizaciones `Ganada` para asociar CxP manual, en lugar
    del estado legacy `Aprobada`.
  - Las notificaciones de tarifa vencida ya usan estados vigentes del flujo en
    código y SQL de Fase 5.
  - La migración de actividades comerciales ahora elimina policies existentes
    antes de recrearlas para permitir reintentar `supabase db push`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - Con una cotización ya aprobada, seleccionar una nueva tarifa de agente con
    motivo documentado.
  - Confirmar que queda una sola tarifa `is_selected = true`.
  - Confirmar que la Shipping Instruction y bookings no confirmados reflejan el
    nuevo agente/carrier/ETD/tránsito/días libres.
  - Confirmar que bookings con número confirmado, carrier booking o MBL no se
    sobrescriben silenciosamente.
  - Editar una cotización FCL cambiando contenedores y confirmar reemplazo
    correcto.
  - Editar una cotización LCL/Miami cambiando líneas de carga y confirmar que no
    se pierden líneas si una validación falla.
  - Crear una cotización FCL con múltiples contenedores y confirmar encabezado e
    hijos.
  - Crear una cotización Miami/LCL con líneas de carga y confirmar pricing
    automático.
  - Guardar contenedores de un Booking con rol Operaciones y confirmar reemplazo.
  - Guardar contenedores de un BL con rol Operaciones y confirmar reemplazo.
  - En Proveedores, confirmar que el selector de cotización muestra cotizaciones
    `Ganada`.
  - Ejecutar o verificar la notificación de tarifas vencidas con estados vigentes.
- Riesgos o trabajo pendiente:
  - Si la migración `20260624020000` no está aplicada en Supabase remoto, el cambio
    de tarifa puede seguir fallando por el índice único de tarifa seleccionada.
- Commit: pendiente.

### 2026-07-01 — UX-004 — Estilo unificado de filtros activos

- Estado: Completado.
- Hallazgo: UX-004.
- Causa raíz: los chips de filtro de Alertas y Manifiestos usaban un estilo
  activo gris (`bg-slate-800`), distinto del pill azul estándar que ya usan
  Dashboard, Dashboard Financiero, Reportes, Histórico, Inventario, Embarques,
  Ingreso y Garantías.
- Código:
  - `src/app/(protected)/alerts/page.tsx`
  - `src/app/(protected)/miami/manifiestos/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Los tres grupos de chips adoptan el patrón estándar: activo
    `border-blue-600 bg-blue-600 text-white` (variante dark incluida) e
    inactivo con borde slate sobre fondo blanco.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK (cambio solo de clases CSS).
- Riesgos pendientes:
  - Ninguno.
- Commit: `ef00647`

### 2026-07-01 — UX-003 — Guard de cambios sin guardar en formularios críticos

- Estado: En validación manual; cubre el guard de navegación. El autosave
  queda como mejora posterior.
- Hallazgo: UX-003.
- Causa raíz: los formularios largos (cotización nueva de 2,300+ líneas,
  edición, factura fiscal, clientes, proveedores) perdían todo lo capturado al
  refrescar, cerrar la pestaña o tocar cualquier link del sidebar.
- Código:
  - `src/components/ui/UnsavedChangesGuard.tsx` (nuevo): componente
    auto-contenido que detecta edición vía eventos `input`/`change` del
    documento; muestra el aviso nativo en refresh/cierre (`beforeunload`) e
    intercepta clics en links internos con el `ConfirmDialog` existente
    (sin `window.confirm`, prohibido por AGENTS.md). Exporta `markFormSaved()`
    para páginas que guardan sin navegar.
  - Montado en:
    - `src/app/(protected)/quotations/new/page.tsx` (con `markFormSaved()`
      tras crear, porque la página permanece y resetea el formulario)
    - `src/app/(protected)/quotations/[id]/edit/page.tsx`
    - `src/app/(protected)/invoicing/new/page.tsx`
    - `src/app/(protected)/clientes/nuevo/page.tsx`
    - `src/app/(protected)/clientes/[id]/edit/page.tsx`
    - `src/app/(protected)/suppliers/new/page.tsx`
- SQL:
  - No aplica.
- Decisiones de diseño:
  - La navegación programática (`router.push` tras guardar o al cancelar) no
    se intercepta a propósito: los flujos de guardado/cancelación existentes
    siguen funcionando sin cambios.
  - La carga inicial de datos (setState) no dispara eventos DOM, por lo que
    abrir un formulario de edición no lo marca sucio; solo la escritura real
    del usuario.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del componente nuevo: cero errores; las páginas montadas conservan
    deuda previa documentada en QA-001.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - En `/quotations/new`, escribir en un campo y hacer clic en un link del
    sidebar: debe aparecer el modal "Cambios sin guardar".
  - "Seguir editando" debe conservar el formulario; "Salir sin guardar" debe
    navegar.
  - Refrescar la pestaña con cambios debe mostrar el aviso del navegador.
  - Crear una cotización y verificar que después del guardado exitoso ya no
    aparece el aviso al navegar.
- Riesgos pendientes:
  - Controles custom que no emiten eventos `input`/`change` (botones de
    combobox) no marcan el formulario sucio por sí solos; la mayoría de la
    captura es tipeo y selects nativos, que sí lo hacen.
  - El autosave (borradores) sigue pendiente dentro de UX-003.
- Commit: `f7eb997`

### 2026-07-01 — UX-001 — Navegación móvil del ERP interno

- Estado: En validación manual.
- Hallazgo: UX-001.
- Causa raíz: el layout protegido renderizaba el sidebar fijo de 256 px en
  todas las resoluciones; en móvil ocupaba la pantalla o quedaba inutilizable
  y no existía otra forma de navegar.
- Código:
  - `src/components/layout/protected-shell.tsx`
  - `src/components/layout/topbar.tsx`
- SQL:
  - No aplica.
- Cambio:
  - En pantallas menores a `lg` el sidebar se oculta y el Topbar muestra un
    botón hamburguesa que abre el mismo Sidebar como drawer con backdrop.
  - El drawer se cierra al navegar (patrón de ajuste de estado en render,
    compatible con la regla `react-hooks/set-state-in-effect`) o al tocar el
    fondo.
  - El título del Topbar se oculta en pantallas muy pequeñas y el padding del
    contenido baja a `p-4` en móvil.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Abrir el ERP en un viewport móvil (DevTools o teléfono), navegar con el
    drawer y confirmar que se cierra al elegir una sección.
- Riesgos pendientes:
  - Las tablas anchas de algunos módulos siguen requiriendo scroll horizontal
    en móvil; eso queda dentro de UX-008.
- Commit: `46a36e3`

### 2026-07-01 — QA-009 — npm audit sin vulnerabilidades

- Estado: Completado.
- Hallazgo: QA-009.
- Causa raíz: Next.js 16.2.6 fija PostCSS 8.4.31, afectado por
  GHSA-qx2v-qp2m-jg93 (XSS en salida de stringify). El `npm audit fix --force`
  oficial proponía degradar Next a 9.3.3, lo cual es inviable.
- Código/configuración:
  - `package.json`: override `next > postcss: ^8.5.10`.
  - `package-lock.json`: PostCSS de Next resuelto a 8.5.14 (deduplicado con la
    versión que ya usaba Tailwind).
- Validaciones ejecutadas:
  - `npm audit`: 0 vulnerabilidades.
  - `npm run build`: OK, 65 páginas, sin cambios de comportamiento CSS.
  - `npx tsc --noEmit`: OK.
- Riesgos pendientes:
  - Al actualizar Next en el futuro, revisar si ya incluye PostCSS >= 8.5.10 y
    retirar el override para volver a la versión que Next fija oficialmente.
- Commit: `46a36e3`

### 2026-07-01 — REP-001 — Totales de reportes agrupados por moneda

- Estado: En validación manual.
- Hallazgo: REP-001.
- Causa raíz: `totalAmount` sumaba `__amount` de todas las filas sin importar
  `__currency`, y el total se etiquetaba con la moneda de la primera fila o el
  filtro. Un reporte con facturas USD y HNL mostraba una suma sin sentido.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Los totales (tfoot, métricas y PDF) se agrupan por moneda y se muestran
    como `USD 5,000.00 · HNL 12,000.00` cuando hay más de una.
  - El margen promedio solo se calcula cuando hay una sola moneda; con mezcla
    muestra `-` en lugar de un porcentaje engañoso.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Reportes > Facturación/CxC con documentos en USD y HNL: confirmar totales
    separados por moneda en pantalla y PDF.
- Riesgos pendientes:
  - No hay conversión por tipo de cambio (parte de REP-007); los totales se
    presentan por moneda, no consolidados.
- Commit: `55c0761`

### 2026-07-01 — REP-002/REP-003 — Venta cotizada y GP real comparable

- Estado: En validación manual.
- Hallazgos: REP-002 y REP-003.
- Causa raíz:
  - El dashboard financiero llamaba "Revenue" al `total_sale` de cotizaciones
    Ganadas, que es venta cotizada y no facturación.
  - "GP real" restaba los costos reales de algunas operaciones al revenue de
    todas, inflando el resultado; la varianza comparaba costo real parcial
    contra costo cotizado total.
- Código:
  - `src/app/(protected)/financial-dashboard/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - KPI y charts renombrados a "Venta cotizada (Ganadas)" / "Venta", con
    subtítulo "No es facturación" y descripción que remite a Facturación.
  - GP real ahora es `venta de operaciones con costos reales - costos reales`
    y muestra la cobertura (`X de Y ops con costos reales`).
  - La varianza compara costo real contra costo cotizado solo de esas mismas
    operaciones.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos (deuda previa de hoisting documentada en QA-001).
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Con una operación con costos reales y otra sin ellos, confirmar que GP real
    solo considera la primera y que la cobertura se muestra en el KPI.
- Riesgos pendientes:
  - El cierre definitivo de REP-002 (KPI de facturación real emitida) queda
    para cuando Reportes consuma `invoices` en este dashboard.
- Commit: `55c0761`

### 2026-07-01 — UX-002 — Confirmación en eliminaciones sensibles

- Estado: En validación manual.
- Hallazgo: UX-002.
- Causa raíz: los botones de eliminar rango CAI y tarifa de agente ejecutaban
  el DELETE con un solo clic. El resto de eliminaciones sensibles auditadas
  (tarifas de agente en Pricing Comparison, items de costo real, documentos de
  booking, tareas del dashboard) ya usaban modal o motivo obligatorio.
- Código:
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/agents/[id]/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Ambas eliminaciones pasan por el `ConfirmDialog` existente con acción
    destructiva marcada en rojo; el rango CAI muestra CAI y rango a eliminar.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Intentar eliminar un rango CAI inactivo y una tarifa de agente: debe
    aparecer el modal y solo borrar al confirmar.
- Riesgos pendientes:
  - Los deletes tipo replace dentro de flujos de guardado (client_rates,
    cargo lines) no piden confirmación porque son parte del guardado; su
    atomicidad se maneja en FLOW-003/FLOW-004.
- Commit: `55c0761`

### 2026-07-01 — BUG-001 — Reporte Pagos a Proveedores inalcanzable

- Estado: En validación manual.
- Hallazgo: BUG-001.
- Causa raíz: en `reports/page.tsx` el `return` del reporte de vencidas
  (`overdue`) no estaba condicionado por `activeReport`, por lo que los bloques
  de filas y columnas de `supplier_payments` eran código inalcanzable. El
  reporte Pagos a Proveedores mostraba siempre los datos de Vencidas. La
  consulta a `pagos_proveedor` sí se ejecutaba correctamente.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - El branch de vencidas queda dentro de `if (activeReport === 'overdue')`
    tanto en `baseRows` como en `columns`, habilitando los bloques de
    `supplier_payments` ya existentes.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Con rol Admin/Finanzas/Contabilidad, abrir Reportes > Pagos a Proveedores y
    confirmar columnas de proveedor, período, método y monto.
  - Confirmar que Reportes > Vencidas sigue mostrando CxC y CxP vencidas.
- Riesgos pendientes:
  - Ninguno adicional; el fix no cambia consultas ni permisos.
- Commit: `3c1c535`

### 2026-07-01 — BUG-006 — Notificaciones del sidebar se marcan leídas

- Estado: En validación manual.
- Hallazgo: BUG-006.
- Causa raíz: el helper `markCurrentUserNotificationsAsRead` existía pero
  ningún componente lo llamaba, y el sidebar contaba `is_read = false` una sola
  vez al montar. El badge de Alertas crecía indefinidamente.
- Código:
  - `src/lib/notifications.ts`
  - `src/app/(protected)/alerts/page.tsx`
  - `src/components/layout/sidebar.tsx`
- SQL:
  - No aplica; la política RLS de Fase 1 ya permite al usuario actualizar
    `is_read` de sus propias notificaciones.
- Cambio:
  - Al abrir `/alerts`, las notificaciones del usuario se marcan leídas y se
    emite el evento `sari:notifications-read`.
  - El sidebar recalcula el conteo en cada cambio de ruta y escucha el evento
    para poner el badge en cero de inmediato.
  - El update de lectura filtra `is_read = false` para no reescribir filas ya
    leídas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos en los archivos tocados.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Generar una notificación interna, confirmar el badge, entrar a `/alerts` y
    confirmar que el badge desaparece y no reaparece al navegar.
- Riesgos pendientes:
  - BUG-007 (tres sistemas de notificación desconectados) sigue pendiente; este
    fix solo cubre `notifications` internas del badge de Alertas.
- Commit: `3c1c535`

### 2026-07-01 — REP-005/REP-006/REP-007 — Helper de formato y fechas locales

- Estado: En progreso; corregidos los casos detectados en reportes, dashboards
  y portal. Queda auditoría del resto de módulos y el tipo de cambio.
- Hallazgos: REP-005, REP-006 y REP-007.
- Causa raíz:
  - `new Date('YYYY-MM-DD')` interpreta columnas `DATE` como medianoche UTC y
    en Honduras (UTC-6) muestra el día anterior.
  - `new Date(año, mes, 1).toISOString().slice(0, 10)` devuelve siempre el
    último día del mes anterior, por lo que el preset "Este mes" de dashboards
    y reportes incluía datos del mes previo; `toISOString()` para "hoy"
    devuelve mañana después de las 18:00 hora local.
- Código:
  - `src/lib/format.ts` (nuevo): `parseDateValue`, `formatDate`,
    `formatDateShort`, `formatDateTime`, `toDateInputValue` y `formatMoney`.
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/pre-alertas/page.tsx`
  - `src/app/portal/pickup/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Presets e iniciales de rango de fecha usan `toDateInputValue` (zona local).
  - `expected_date` y `scheduled_date` del portal se formatean sin desfase.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de los archivos nuevos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Confirmar el preset "Este mes" en Dashboard, Dashboard Financiero y
    Reportes: `from` debe ser el día 1 del mes actual.
- Riesgos o trabajo pendiente:
  - Quedan usos de `toISOString().slice(0, 10)` en facturación, CAI, agentes,
    pricing-comparison y operaciones por auditar caso por caso.
  - REP-007 queda parcial: falta centralizar tipo de cambio y migrar los
    formateadores locales duplicados al helper.
- Commit: `3c1c535`

### 2026-07-01 — UX-006 — Idioma del documento raíz

- Estado: Completado.
- Hallazgo: UX-006.
- Código:
  - `src/app/layout.tsx`
- Cambio:
  - `<html lang="en">` pasa a `lang="es"`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 65 páginas.
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 — QA-006 — README del proyecto

- Estado: Completado.
- Hallazgo: QA-006.
- Código:
  - `README.md`
- Cambio:
  - Se reemplazó el README de `create-next-app` por documentación real: stack,
    variables de entorno, comandos de desarrollo y validación, flujo de
    migraciones Supabase, estructura de carpetas y convenciones del ERP.
- Validaciones ejecutadas:
  - `npm run build`: OK (sin impacto en código).
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 - UX-012 - Vista tabla FCL en comparativo de pricing

- Estado: En validacion.
- Hallazgo: UX-012.
- Causa raiz: El comparativo de tarifas FCL solo tenia vista de cards, lo que
  dificultaba comparar agentes horizontalmente por concepto.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego un switch `Cards` / `Tabla` para cotizaciones FCL.
  - `Cards` permanece como vista por defecto y conserva la UI existente.
  - La nueva tabla reutiliza las tarifas ya cargadas y el mismo handler de
    seleccion de tarifa mediante confirmacion existente.
  - La tabla resalta mejor costo, tarifa mas rapida y tarifa seleccionada.
  - PS se toma como cargo por contenedor y se multiplica por la cantidad real
    de contenedores de la cotizacion. El MBL se toma como cargo por BL (uno por
    defecto) y se distribuye entre los contenedores solo para mostrar su costo
    unitario, sin multiplicarlo en el total.
  - Bank Transfer Fee queda fijo en USD 25.
  - DTHC queda editable por naviera; Entrega Local y Redestino se comparten
    entre columnas para comparar con el mismo valor.
  - Los cargos alimentan un total ajustado local en la tabla.
  - Se retiraron filas no usadas de WR and Stuffing, Demurrage / Dia y
    Cancellation Fee.
  - Se agrego `Guardar tabla` para persistir los ajustes FCL en `localStorage`
    por cotizacion; al alternar Cards/Tabla los valores ya no se pierden.
  - Se elimino la fila duplicada `Agente`, porque el agente ya aparece como
    encabezado de cada columna.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Probar `/pricing-comparison` con cotizacion FCL y alternar Cards/Tabla.
  - Seleccionar una tarifa desde la tabla y confirmar que usa el flujo actual.
- Riesgos pendientes:
  - Algunos cargos opcionales solo apareceran si existen como campos en
    `agent_quotes`; no se agregaron queries ni estructura nueva.
  - Los cargos editados son comparativos locales de la tabla y se guardan solo
    en el navegador; no se persisten en Supabase ni cambian la seleccion
    guardada.
- Commit: 2a5f74a

### 2026-07-01 - UX-013 - OOCL en catalogo de navieras

- Estado: En validacion.
- Hallazgo: UX-013.
- Causa raiz: OOCL no estaba disponible en el catalogo compartido de carriers,
  por lo que no aparecia en comboboxes ni badges de navieras.
- Codigo:
  - `src/lib/constants/carriers.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego OOCL como carrier tipo `ocean`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Confirmar que OOCL aparece en los selectores de carrier/naviera maritima.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-07-06 - UX-018 - Plantillas de correo en Acciones Rapidas (copiar sin navegar)

- Estado: En validacion.
- Hallazgo: UX-018 (mejora solicitada por el titular; extiende UX-017).
- Causa raiz: Para copiar una plantilla de correo fuera del detalle de una
  cotizacion habia que navegar a Settings, que ademas es solo de Admin.
- Codigo:
  - `src/components/email/EmailTemplatesDialog.tsx` (nuevo): modal que lista
    las plantillas activas (chips), muestra asunto y cuerpo, y permite
    "Copiar mensaje" / "Copiar asunto". Fuera de una cotizacion no hay datos
    para las variables, asi que se renderizan como campos a llenar en
    corchetes ([CLIENTE], [NUMERO_COTIZACION]) sin omitir lineas. Link
    "Administrar plantillas" visible solo para Admin.
  - `src/lib/email-templates.ts`: `renderEmailTemplateSkeleton` convierte
    `{{variable}}` en `[VARIABLE]` conservando todas las lineas.
  - `src/components/layout/topbar.tsx`: accion rapida "Plantillas de Correo"
    para todos los roles internos (la RLS de lectura ya lo permite); abre el
    modal sin cambiar de pagina.
- SQL:
  - No aplica; reutiliza `email_templates` y sus policies de UX-017.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Abrir la accion rapida desde cualquier pagina, alternar plantillas y
    copiar mensaje y asunto; confirmar los campos [EN_CORCHETES].
  - Confirmar que el link "Administrar plantillas" solo aparece a Admin.
  - Confirmar que un rol interno no-Admin puede ver y copiar plantillas.
  - Confirmar que una plantilla desactivada en Settings no aparece en el
    modal de la accion rapida.
- Riesgos pendientes:
  - Ninguno; solo lectura sobre datos ya expuestos por RLS.
- Commit: hash pendiente

### 2026-07-06 - UX-017 - Plantillas de correo editables (fin del cuerpo hardcodeado)

- Estado: En validacion; migraciones aplicadas en remoto el 2026-07-06 via
  `supabase db push` y SQL Editor. El historial de `20260706220000` se
  registro el 2026-07-28 tras auditar esquema, policies y semillas.
- Hallazgo: UX-017 (mejora solicitada por el titular).
- Causa raiz: El cuerpo del correo de cotizacion estaba hardcodeado (~35
  lineas) en `quotations/[id]/page.tsx`; solo el texto de cierre era
  configurable en `company_settings.plantilla_cotizacion`.
- SQL:
  - `supabase/migrations/20260706200000_email_templates.sql`: tabla
    `email_templates` (template_key unico, nombre, descripcion, asunto,
    cuerpo, is_active, updated_by/updated_at). RLS: SELECT para roles
    internos aprobados mediante `public.is_approved_active_user()`;
    INSERT/UPDATE/DELETE solo Admin mediante `public.is_admin()`. Semilla
    `cotizacion_cliente` equivalente al texto que estaba hardcodeado.
  - `supabase/migrations/20260706210000_email_template_seguimiento.sql`:
    semilla `seguimiento_cotizacion` (correo de seguimiento de tarifa
    ofertada que Ventas copia desde el detalle de la cotizacion).
  - `supabase/migrations/20260706220000_fix_email_templates_encoding_rls.sql`:
    corrige semillas ya aplicadas con `ON CONFLICT DO UPDATE` para normalizar
    textos UTF-8 y reemplaza politicas RLS por helpers versionados.
- Codigo:
  - `src/lib/email-templates.ts` (nuevo): renderizador de variables
    `{{...}}` (las lineas cuyos placeholders resuelven todos vacios se
    eliminan, lo que reemplaza los bloques condicionales del codigo),
    catalogo de variables por plantilla y respaldo local identico a la
    semilla para que el correo nunca salga vacio si falta la fila.
  - `src/app/(protected)/settings/email-templates/page.tsx` (nuevo):
    seccion "Plantillas de Correo" con editor de asunto/cuerpo, chips de
    variables disponibles, vista previa con datos de ejemplo, boton
    "Restaurar original" y guard de cambios sin guardar. Solo Admin edita;
    otros roles con acceso ven solo lectura.
  - `src/components/layout/sidebar.tsx`: entrada "Plantillas de Correo" en
    la seccion admin.
  - `src/app/(protected)/quotations/[id]/page.tsx`: el modal de correo
    carga todas las plantillas activas y muestra un selector (chips) para
    alternar entre ellas (cotizacion, seguimiento y las personalizadas);
    asunto y cuerpo se renderizan con el mismo mapa de variables.
    `{{cierre}}` sigue leyendo `company_settings.plantilla_cotizacion` para
    compatibilidad.
  - Settings permite a Admin crear plantillas nuevas desde la UI (boton
    "Nueva"); quedan disponibles en el selector del modal sin tocar codigo
    ni migraciones. "Restaurar original" solo aparece en plantillas con
    semilla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - Migraciones `20260706200000` y `20260706210000` aplicadas en remoto y
    semilla insertada antes de esta correccion.
  - Intento manual de `20260706220000` en SQL Editor: fallido por deadlock
    `40P01`, transaccion abortada.
  - Reintento manual de `20260706220000` en SQL Editor: OK, "Success. No rows
    returned".
- Verificacion manual/RLS pendiente:
  - Con Admin, editar la plantilla en `/settings/email-templates`, guardar y
    confirmar que el modal de correo de una cotizacion refleja el cambio.
  - Confirmar que la vista previa coincide con el correo generado.
  - Confirmar el correo de una cotizacion SIN tarifa seleccionada: el bloque
    de tarifa no debe aparecer (lineas con variables vacias omitidas).
  - Confirmar el correo de una cotizacion Miami sin tarifa seleccionada pero
    con total comercial: debe mostrar bloque "TARIFA".
  - Con un rol no-Admin que acceda a la pagina, confirmar solo lectura, y
    que un update directo es bloqueado por RLS.
  - "Restaurar original" recupera la semilla y requiere guardar.
  - En el modal de correo, alternar entre "Cotizacion al cliente" y
    "Seguimiento de cotizacion" y confirmar que asunto y cuerpo cambian.
  - Crear una plantilla nueva desde Settings, guardarla y confirmar que
    aparece en el selector del modal de la cotizacion.
- Riesgos pendientes:
  - Solo existe la plantilla `cotizacion_cliente`; otros correos del sistema
    (mailto de BL/facturacion) siguen como estan y pueden migrarse al mismo
    esquema despues.
  - Un placeholder mal escrito hace que su linea se omita; la vista previa
    del editor lo hace visible antes de guardar.
- Commit: hash pendiente

### 2026-07-06 - UX-019 - Acceso directo, confirmaciones y supresion en plantillas de correo

- Estado: En validacion.
- Hallazgo: UX-002 / UX-017 (mejora solicitada por el titular).
- Causa raiz: Aunque ya existia el editor de plantillas, el modal de correo de
  cotizacion no daba acceso directo para modificar la plantilla activa. Ademas,
  cambiar de plantilla, restaurar la original o crear una nueva podia descartar
  cambios del editor sin una decision explicita.
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/settings/email-templates/page.tsx`
- SQL:
  - No aplica; usa la tabla `email_templates` y RLS existente.
- Cambios:
  - El modal de correo agrega un boton de edicion visible para Admin que abre
    `/settings/email-templates` con la plantilla activa seleccionada.
  - Settings lee `?template=` para abrir directamente la plantilla solicitada.
  - Settings detecta cambios sin guardar y muestra modales de decision antes de
    cambiar de plantilla o crear una nueva.
  - "Restaurar original" ahora pide confirmacion antes de reemplazar el asunto y
    cuerpo actuales del editor.
  - Settings agrega "Suprimir" para plantillas personalizadas: marca
    `is_active = false`, las oculta del editor y del selector de correos, y
    exige confirmacion antes de aplicar la baja logica.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Desde una cotizacion, abrir el modal de correo y confirmar que Admin ve el
    boton de editar plantilla.
  - Confirmar que el boton abre Settings con la plantilla activa seleccionada.
  - Editar una plantilla sin guardar e intentar cambiar de plantilla, crear una
    nueva y restaurar original: debe aparecer el modal de decision.
  - Crear una plantilla personalizada, suprimirla y confirmar que desaparece de
    Settings y del selector de correos.
  - Confirmar que usuarios no Admin no ven el acceso directo de edicion.
- Riesgos pendientes:
  - No aplica SQL nuevo; queda la verificacion manual de UI.
- Commit: hash pendiente

### 2026-07-06 - UX-016 - Accion rapida "Nuevo Cliente" con modal de alta rapida

- Estado: En validacion.
- Hallazgo: UX-016 (mejora solicitada por el titular; mismo patron de UX-015).
- Causa raiz: La accion rapida "Nuevo Cliente" navegaba a `/clientes/nuevo`,
  interrumpiendo el flujo en curso. El formulario completo (6 secciones) no es
  apto para modal, pero el alta durante una llamada solo necesita los datos
  esenciales.
- Codigo:
  - `src/lib/clientes.ts` (nuevo): `createClienteRecord` extrae la logica de
    creacion (insert, fallback de vendedor al usuario autenticado, registro en
    `cliente_history`, retorno del codigo generado) para reutilizarla.
  - `src/components/clientes/NewClientDialog.tsx` (nuevo): modal de alta
    rapida con campos esenciales (nombre, RTN, contacto, telefono, email,
    pais, tipo de empresa, condicion de pago con dias de credito, segmento,
    vendedor). El toast de exito incluye accion "Completar perfil" que lleva a
    `/clientes/[id]/edit`.
  - `src/app/(protected)/clientes/nuevo/page.tsx`: consume el helper
    compartido; formulario completo sin cambios visuales.
  - `src/components/layout/topbar.tsx`: "Nuevo Cliente" abre el modal en
    lugar de navegar (roles Admin y Ventas, sin cambio de roles).
- SQL:
  - No aplica; usa inserts existentes sobre `clientes` y `cliente_history`
    (RLS vigente).
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Crear cliente desde el modal y confirmar toast con codigo generado y
    registro en el historial del cliente.
  - Probar la accion "Completar perfil" del toast.
  - Confirmar que `/clientes/nuevo` sigue creando con todos los campos y
    redirige al detalle.
  - Confirmar condicion de pago a credito: el campo dias de credito aparece y
    persiste.
- Riesgos pendientes:
  - El modal no captura direccion, correos adicionales, seguro ni notas; el
    perfil queda incompleto hasta editarlo (por diseno, se comunica en el
    propio modal).
- Commit: hash pendiente

### 2026-07-06 - UX-015 - Accion rapida "Agregar Agente" con modal

- Estado: En validacion.
- Hallazgo: UX-015 (mejora solicitada por el titular).
- Causa raiz: Crear un agente requeria navegar a `/agents`, interrumpiendo el
  flujo de pricing cuando llega una tarifa de un agente nuevo.
- Codigo:
  - `src/components/agents/AgentForm.tsx` (nuevo): formulario de alta de
    agente extraido de `/agents` para reutilizarse sin duplicar logica.
  - `src/components/agents/NewAgentDialog.tsx` (nuevo): modal custom (Radix
    Dialog existente, sin alert/confirm) que envuelve el formulario.
  - `src/components/layout/topbar.tsx`: accion rapida "Agregar Agente" para
    roles Admin y Pricing; abre el modal sin cambiar de pagina.
  - `src/app/(protected)/agents/page.tsx`: consume `AgentForm` compartido.
- SQL:
  - No aplica; usa el insert existente sobre `agents` (RLS vigente).
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Confirmar que Admin y Pricing ven "Agregar Agente" y que Ventas,
    Operaciones, Finanzas y Contabilidad no.
  - Crear un agente desde el modal en cualquier pagina y confirmar toast de
    exito y cierre del modal.
  - Confirmar que el formulario de `/agents` sigue creando y refrescando la
    tabla.
- Riesgos pendientes:
  - Si el modal se usa estando en `/agents`, la tabla no se refresca sola;
    el formulario lateral de la pagina si lo hace.
- Commit: hash pendiente

### 2026-07-07 - INV-006 - Fallback legal de factura desde branding

- Estado: En validacion manual.
- Hallazgo: INV-006 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/(protected)/invoicing/[id]/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - El PDF de factura deja de tener razon social fallback duplicada y usa
    `normalizeCompanyBranding`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de fallback legal duplicado en `invoicing/[id]/page.tsx`: OK.
- Verificacion manual pendiente:
  - Descargar factura/proforma y verificar encabezado con Config. Empresa.
- Riesgos pendientes:
  - Los calculos fiscales `ISV 15`/`ISV 18` se mantienen por normativa SAR y
    requieren revision fiscal separada antes de parametrizarlos.
- Commit: hash pendiente

### 2026-07-07 - FIN-013 - Etiqueta fiscal neutral en validacion de costos

- Estado: En validacion manual.
- Hallazgo: FIN-013 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
- SQL:
  - No aplica.
- Cambios:
  - La etiqueta de costo real deja de decir `Gravable ISV 15%` y ahora refiere
    al impuesto seleccionado desde `tax_rates`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `ISV 15` en `cost-validation/[id]/page.tsx`: OK.
- Verificacion manual pendiente:
  - Crear costo real con impuesto seleccionado y confirmar que el calculo sigue
    usando `tax_percentage_snapshot`.
- Riesgos pendientes:
  - Ninguno identificado; no se cambio la logica de calculo.
- Commit: hash pendiente

### 2026-07-07 - FIN-012 - Etiquetas Miami usan ISV configurable

- Estado: En validacion manual.
- Hallazgo: FIN-012 (auditoria de valores hardcodeados).
- Codigo:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/quotations/MiamiQuotationSection.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings.default_tax_rate`.
- Cambios:
  - El hook de Miami expone `taxRatePercent`.
  - Las etiquetas de cargos gravables en Miami muestran el porcentaje
    configurado en lugar de `ISV 15%`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `ISV 15` en `MiamiQuotationSection` y `useMiamiQuotation`: OK.
- Verificacion manual pendiente:
  - Cambiar `default_tax_rate` y revisar etiquetas de cargos estandar,
    origen y destino en cotizacion Miami.
- Riesgos pendientes:
  - Ninguno identificado; cambio visual alineado con el calculo ya corregido.
- Commit: hash pendiente

### 2026-07-07 - UX-023 - Branding configurable en documentos operativos restantes

- Estado: En validacion manual.
- Hallazgo: UX-023 (auditoria de valores hardcodeados).
- Codigo:
  - `src/lib/company-branding.ts`
  - `src/lib/miami-pricing-items.ts`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/booking/page.tsx`
  - `src/app/(protected)/miami/embarques/page.tsx`
  - `src/components/pdf/shipping-instruction-pdf.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Notify Party de Booking se genera desde Config. Empresa.
  - Print de Miami / Embarques usa razon social y nombre comercial configurados.
  - Routing / Shipping Instruction PDF usa logo, razon social, direccion, RTN y
    contacto configurados.
  - Cost Detail PDF usa la razon social configurada en el footer.
  - Items automaticos y opcionales de Miami usan el nombre comercial configurado
    como proveedor por defecto.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda acotada de hardcodes anteriores en archivos corregidos: OK.
- Verificacion manual pendiente:
  - Imprimir lista Miami, generar Routing PDF, crear Booking sin Notify Party y
    generar Cost Detail PDF con una empresa de prueba en Config. Empresa.
- Riesgos pendientes:
  - Textos legales generales de la cotizacion siguen mencionando Sari Express
    por marca; cambiar eso requiere decision comercial/legal.
- Commit: hash pendiente

### 2026-07-07 - FIN-011 - ISV configurable en pricing comercial

- Estado: En validacion manual.
- Hallazgo: FIN-011 (auditoria de valores hardcodeados).
- Codigo:
  - `src/lib/tax.ts`
  - `src/lib/miami-pricing-items.ts`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings.default_tax_rate`.
- Cambios:
  - Se centraliza calculo de impuesto en `src/lib/tax.ts`.
  - Miami pricing items, cargos manuales/opcionales, seguro de carga,
    totales de cotizacion y detalle interno de costos usan
    `default_tax_rate` de Config. Empresa.
  - Etiquetas de ISV en Pricing Comparison muestran el porcentaje
    configurado.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `0.15`, `tax_rate: 15` e `ISV 15` en los archivos corregidos:
    OK, sin apariciones.
- Verificacion manual pendiente:
  - Cambiar `default_tax_rate` en Config. Empresa y validar cargo gravable
    manual, cargo Miami gravable, seguro y PDF interno de costos.
- Riesgos pendientes:
  - Facturacion conserva calculos fiscales especificos de factura/ISV 15; debe
    revisarse en un paquete separado para no romper reportes fiscales.
- Commit: c93092d

### 2026-07-07 - PRC-010 - Reglas de negocio de Miami Air y FCL desde catalogo

- Estado: En validacion manual; migracion aplicada previamente y registrada el
  2026-07-28.
- Hallazgo: PRC-010 (auditoria de valores hardcodeados).
- Codigo:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL:
  - `supabase/migrations/20260707090000_seed_business_surcharge_rules.sql`
- Cambios:
  - Minimos Miami Air (`miami_air_min_small`, `miami_air_min_large`) salen de
    `surcharge_rules` en vez de constantes React.
  - Bank Transfer Fee FCL (`bank_transfer_fee`) sale de `surcharge_rules` y se
    pasa al comparativo FCL como prop.
  - La migracion inserta defaults actuales: USD 270 hasta 22 KG, USD 375 de
    22 a 40 KG y Bank Transfer Fee USD 25.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Crear/previsualizar cotizacion Miami Air y confirmar minimos.
  - Abrir comparativo FCL y confirmar Bank Transfer Fee.
- Riesgos pendientes:
  - Validar manualmente los minimos/fee configurados en los flujos indicados.
- Commit: hash pendiente

### 2026-07-07 - UX-022 - Branding configurable en PDFs operativos y reportes

- Estado: En validacion manual.
- Hallazgo: UX-022 (continuacion auditoria de valores hardcodeados).
- Codigo:
  - `src/components/pdf/arrival-notice-pdf.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
  - `src/components/pdf/report-pdf.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Arrival Notice, Shipping Instruction Order, BL Instructions y Reportes usan
    el branding normalizado de Config. Empresa.
  - Se eliminan constantes locales de razon social, direccion, RTN, telefono y
    correo en esos PDFs.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de constantes hardcodeadas en los archivos corregidos: OK; solo
    queda `/logo/sari-logo.png` como fallback local.
- Verificacion manual pendiente:
  - Generar Arrival Notice, SI PDF y reportes para validar encabezado/footer.
- Riesgos pendientes:
  - Si `company_settings` no esta completo, se usan fallbacks normalizados.
- Commit: hash pendiente

### 2026-07-07 - UX-021 - Datos de empresa configurables en contacto y PDF comercial

- Estado: En validacion manual.
- Hallazgo: UX-021 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/portal/contacto/page.tsx`
  - `src/components/pdf/quotation-pdf.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/components/pdf/house-bl-pdf.tsx`
  - `src/components/pdf/awb-pdf.tsx`
  - `src/components/pdf/carta-porte-pdf.tsx`
  - `src/lib/company-branding.ts`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Portal "Contactanos" deja de mostrar telefonos, correos y direcciones
    placeholder. Lee oficina Honduras y bodega Miami desde Config. Empresa.
  - PDF comercial de cotizacion usa nombre legal/comercial, RTN, direccion,
    telefono, correo y logo desde Config. Empresa, con fallback unico.
  - Nueva utilidad compartida `company-branding` para normalizar branding y
    evitar fallbacks divergentes.
  - Config. Empresa expone `logo_url` como "Logo para documentos".
  - HBL, AWB y Carta Porte usan el mismo branding configurable al descargarse
    desde la pantalla de BL.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de placeholders criticos (`miami@example`, `info@example`,
    `Edificio XYZ`, `8350 NW 52nd`, `Casa #1225`): OK, sin apariciones en
    portal contacto ni PDF comercial.
- Verificacion manual pendiente:
  - Actualizar Config. Empresa con direccion, telefono, correo, Miami y logo.
  - Abrir Portal > Contactanos y confirmar que solo muestra datos reales.
  - Generar PDF de cotizacion desde Nueva Cotizacion, Detalle y Pricing
    Comparison para confirmar encabezado/logo.
  - Generar HBL, AWB y Carta Porte desde Booking/BL para confirmar
    encabezado/logo.
- Riesgos pendientes:
  - Falta extender el mismo helper a Arrival Notice, Shipping Instruction y
    reportes en un cambio posterior.
  - Si `logo_url` apunta a un recurso remoto no accesible por React PDF, el
    fallback local debe usarse manualmente.
- Commit: hash pendiente

### 2026-07-07 - UX-020 - Bunker Emergency Surcharge editable desde Config. Empresa

- Estado: En validacion manual.
- Hallazgo: UX-020 (mejora solicitada por el titular).
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL:
  - No aplica; la regla ya vive en `surcharge_rules` (fila
    `bunker_emergency_surcharge`, insertada manualmente, sin seed en el repo).
    Sus policies RLS existentes cubren la edicion
    (`can_manage_pricing_catalogs` = Admin/Pricing).
- Cambios:
  - Nueva seccion "Bunker Emergency Surcharge — Miami LCL" en Config. Empresa:
    edita etiqueta (nombre en PDF), tarifa por LBS, tarifa por FT3, minimo y
    estado activo/inactivo.
  - Guarda con `upsert` sobre `code`, por lo que crea la fila si no existiera
    en un ambiente nuevo (service_product `miami_lcl`, calculation_type
    `max_formula`).
  - Vista previa en vivo de la formula MAX(lbs x tarifa, ft3 x tarifa, minimo)
    con un ejemplo de 1,000 lbs / 45 ft3.
  - El calculo en cotizaciones ya leia de `surcharge_rules`
    (`useMiamiQuotation.ts`, `pricing-comparison`); no requirio cambios.
  - Correccion posterior: el guardado de Config. Empresa no pisa la regla con
    valores por defecto si falla la carga, y no crea una fila en cero en
    ambientes sin regla hasta que el usuario edite el bloque.
  - Correccion posterior: el recalculo Miami LCL actualiza el bunker por
    `rate_code` estable y elimina la linea automatica si el recargo esta
    desactivado.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Como Admin, editar tarifas del Bunker en Config. Empresa y guardar.
  - Crear una cotizacion Miami LCL nueva y confirmar que usa las tarifas
    nuevas.
  - Desactivar el recargo y confirmar que no se agrega a una cotizacion nueva.
- Riesgos pendientes:
  - Verificacion manual pendiente en ambiente con datos reales y policies RLS
    activas.
- Commit: hash pendiente

### 2026-07-06 - PDF-002 - Seguro en Shipping Instruction no debe marcarse si no fue solicitado

- Estado: En validacion.
- Hallazgo: PDF-002.
- Causa raiz: El PDF de Shipping Instruction podia caer en campos legacy de
  seguro cuando `requires_insurance` no llegaba de forma explicita, mostrando
  "Insurance: Yes" aunque la cotizacion no incluyera seguro.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
- SQL:
  - `supabase/migrations/20260706170000_shipping_instruction_insurance_and_sync_rpc.sql`
- Cambio:
  - Se agrega `shipping_instructions.insurance_requested` como instruccion
    operativa independiente de la cotizacion comercial.
  - Se agrega selector `Insurance` Yes/No en Instrucciones BL de la SI.
  - El PDF de SI ahora toma "Insurance" desde la SI y solo cae a la cotizacion
    como compatibilidad si el campo aun no existe en datos antiguos.
  - Se deja de usar `insurance_cost` como senal de seguro porque puede quedar
    calculado desde el valor FOB aunque no se haya aplicado seguro de carga.
  - Se reemplaza el RPC `sync_shipping_instruction_from_selected_agent_quote`
    calificando columnas con aliases para evitar `quotation_id is ambiguous`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Migracion aplicada en remoto el 2026-07-06 via `supabase db push`
    (registrada como `20260706170000`).
  - Generar SI PDF de una cotizacion sin seguro y confirmar "Insurance: No".
  - Generar SI PDF de una cotizacion con seguro y confirmar "Insurance: Yes".
  - Cambiar selector Insurance en SI y confirmar que el PDF respeta el valor.
  - Ejecutar "Actualizar desde Pricing" y confirmar que no aparece
    `quotation_id is ambiguous`.
- Riesgos pendientes:
  - Ninguno de SQL; queda la verificacion manual del flujo listada arriba.
- Commit: hash pendiente

### 2026-07-06 - PDF-001 - Detalle interno de costos PDF endurecido

- Estado: En validacion.
- Hallazgo: PDF-001.
- Causa raiz: El detalle interno de costos podia imprimirse desde roles de
  edicion comercial/operativa y el PDF consolidaba totales como USD aunque las
  lineas tuvieran moneda propia.
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
- SQL:
  - No aplica.
- Cambio:
  - La accion "Imprimir Detalle de Costos" queda limitada a Admin/Pricing.
  - El PDF agrupa subtotales y resumen final por moneda.
  - El calculo del PDF respeta `tax_amount` y `total_amount` persistidos cuando
    estan disponibles.
  - La generacion del PDF maneja errores con Sonner.
  - El PDF se compacto en formato carta vertical para mantenerse imprimible en
    una pagina y muestra agente, ETD, puertos, fecha de cotizacion, fecha
    Ganada, validez y usuario/fecha de generacion.
  - La tabla de costos incluye columna ISV por linea y subtotal para evitar
    confusiones entre venta sin impuesto y venta total.
  - Se retiro la informacion legal/contacto debajo del logo para reducir ruido
    visual y ahorrar altura en impresion.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica SQL ni RLS nuevo.
  - Confirmar que Ventas y Operaciones no ven la accion del PDF interno.
  - Confirmar que Admin/Pricing pueden generar el PDF.
  - Confirmar PDF con lineas en mas de una moneda: no debe mostrar un total USD
    mezclado; debe separar subtotales/resumen por moneda.
  - Confirmar que el PDF del detalle de costos se mantiene en una sola pagina
    carta vertical para una cotizacion con el volumen normal de lineas.
- Riesgos pendientes:
  - La pantalla de resumen de cotizacion sigue mostrando tarjetas financieras en
    USD como comportamiento previo; este fix solo endurece el PDF interno.
- Commit: hash pendiente

### 2026-07-03 - UX-014 - POL/POD usan puertos en tabla FCL

- Estado: En validacion.
- Hallazgo: UX-014.
- Causa raiz: La vista Tabla del comparativo FCL no consideraba
  `puerto_origen` ni `puerto_destino` de la cotizacion y terminaba mostrando
  `origen`/`destino`, que representan paises.
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Las filas POL y POD ahora priorizan campos de puerto (`pol`,
    `port_of_loading`, `puerto_origen`, `pod`, `port_of_discharge`,
    `puerto_destino`) y muestran `N/A` si no hay puerto disponible.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Abrir `/pricing-comparison` en una cotizacion FCL con puertos cargados y
    confirmar que POL/POD muestran puerto de origen y puerto de destino, no
    paises.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - FLOW-003 - RPC de hijos de cotizacion sin ambiguedad

- Estado: En validacion manual; SQL aplicado en remoto (el 2026-07-06 se
  registro `20260629090000` en el historial de migraciones via
  `supabase db push`, que no habia quedado registrado).
- Hallazgo: FLOW-003.
- Causa raiz: `replace_quotation_child_lines` retorna una columna llamada
  `quotation_id` y dentro del cuerpo usaba `where quotation_id = p_quotation_id`
  sin alias de tabla. En PL/pgSQL eso vuelve ambigua la referencia entre columna
  real y variable de salida, provocando el error al guardar desde
  `/quotations/[id]/edit`.
- SQL:
  - `supabase/migrations/20260629090000_fix_replace_quotation_child_lines_ambiguous_id.sql`
- Codigo:
  - Sin cambios TypeScript; el formulario ya llama al RPC correcto.
- Cambio:
  - Se recrea el RPC calificando los deletes como `qc.quotation_id`,
    `qcl.quotation_id` y `pi.quotation_id`.
  - El `return query` ahora expone aliases explicitos para evitar nuevas
    colisiones con variables de salida.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Editar una cotizacion FCL/LCL/Miami desde `/quotations/[id]/edit` y guardar.
  - Confirmar que contenedores, carga suelta y pricing Miami se reemplazan sin
    error y sin duplicados.
- Riesgos pendientes:
  - No marcar como completado hasta aplicar SQL remoto y probar el flujo.
- Commit: hash pendiente

### 2026-06-29 - UX-009 - Compatibilidad de scroll suave en Next 16

- Estado: Completado.
- Hallazgo: UX-009.
- Causa raiz: Next.js 16 ya no sobrescribe por defecto `scroll-behavior: smooth`
  durante transiciones SPA. Como `globals.css` define smooth scrolling en
  `html`, Next mostraba el aviso `missing-data-scroll-behavior`.
- Codigo:
  - `src/app/layout.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego `data-scroll-behavior="smooth"` al elemento raiz `<html>` para que
    Next desactive temporalmente el smooth scroll durante cambios de ruta.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Verificar navegacion entre rutas sin warning en consola.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - UX-010 - Cargos adicionales de origen en Miami automatico

- Estado: En validacion manual.
- Hallazgo: UX-010.
- Causa raiz: El flujo rapido Miami Consolidado permitia agregar cargos
  adicionales de destino, pero no cargos de origen seleccionados desde las
  tarifas activas del perfil del cliente.
- Codigo:
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/lib/miami-pricing-items.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego la seccion `Cargos adicionales en origen` para Miami LCL y Miami
    Aereo.
  - El selector usa tarifas activas del cliente en categoria `Otros Cargos`,
    excluyendo fletes, minimos, pickup y cargos automaticos ya controlados por el
    flujo Miami.
  - Al seleccionar una tarifa se precargan descripcion y monto; el monto e ISV
    quedan editables para la cotizacion puntual.
  - Los cargos seleccionados se guardan como `pricing_items` con
    `item_type = origin_charge`.
  - Miami Aereo permite marcar `Agregar Documentos/Manejo`; el monto se toma de
    la tarifa activa `documentos_manejo` del perfil del cliente y se guarda como
    cargo de origen.
  - Se normalizaron valores de inputs y checkboxes nuevos para evitar cambios de
    uncontrolled a controlled durante hidratacion/Fast Refresh.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - En `/quotations/new`, seleccionar cliente con tarifas Miami activas.
  - Probar Miami Consolidado Aereo y Miami Consolidado Maritimo LCL.
  - En Miami Aereo, marcar `Agregar Documentos/Manejo` y confirmar que precarga
    la tarifa del cliente.
  - Agregar un cargo adicional de origen, crear/previsualizar la cotizacion y
    confirmar que aparece en el PDF y en pricing items como cargo de origen.
- Riesgos pendientes:
  - Confirmar con datos reales si algun cargo del catalogo de cliente debe
    mostrarse tambien como destino o mantenerse reservado para reglas
    automaticas.
- Commit: hash pendiente

### 2026-06-29 - UX-011 - Sidebar sin encogimiento en paginas anchas

- Estado: Completado.
- Hallazgo: UX-011.
- Causa raiz: El layout protegido usa flex horizontal y el sidebar no tenia
  `shrink-0`. En paginas con tablas/filtros anchos, como Historico/Cotizaciones,
  el contenido principal podia forzar que el sidebar se encogiera.
- Codigo:
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/protected-shell.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se fijo el sidebar como columna no encogible con `shrink-0`.
  - Se agrego `min-w-0` a la columna principal y al `main` para que el overflow
    se maneje dentro del area de contenido.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Revisar `/historico` y paginas con tablas anchas.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-27 — FASE-6 — Embarques Miami persistentes e historial inicial

- Estado: En validación manual; migraciones aplicadas en Supabase remoto.
- Hallazgos: MIA-001, MIA-002, MIA-003 y MIA-004.
- Código:
  - `src/app/(protected)/miami/embarques/page.tsx`
- SQL:
  - `supabase/migrations/20260627050000_phase6_miami_persistent_shipments.sql`
  - `supabase/migrations/20260627060000_phase6_miami_status_events.sql`
  - `supabase/migrations/20260627070000_phase6_miami_status_reversals.sql`
- Cambios:
  - Agrega `miami_shipments` para conservar cada lista de embarque/despacho Miami
    como entidad persistente.
  - Agrega `miami_shipment_packages` para vincular paquetes a un despacho único.
  - Agrega `miami_package_events` para registrar el primer milestone de despacho
    por paquete y permitir historial posterior.
  - Agrega `next_miami_shipment_number()` y `create_miami_shipment(...)` con RLS
    y validación de rol Operaciones/Admin.
  - La pantalla de Lista de Embarque deja de actualizar paquetes directamente y
    pasa por el RPC transaccional; también muestra embarques recientes.
  - La Lista de Embarque captura modo de transporte (`Aereo`, `Maritimo`,
    `Terrestre` o `Courier`) y lo persiste en el despacho.
  - Inventario avanza estados de paquetes mediante
    `advance_miami_package_status`, dejando evento y cambio de estado en una
    sola transacción.
  - Inventario permite consultar el historial operativo de movimientos por
    paquete desde la misma tabla.
  - Inventario permite reversar un estado Miami con motivo obligatorio mediante
    `reverse_miami_package_status`, conservando auditoría en eventos y
    `activity_logs`.
  - El portal del cliente muestra el historial real de movimientos desde
    `miami_package_events`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - En `/miami/embarques`, seleccionar paquetes en bodega y crear despacho.
  - Confirmar que se crea un registro en `miami_shipments`.
  - Confirmar que cada paquete queda vinculado en `miami_shipment_packages`.
  - Confirmar que cada paquete recibe evento `dispatch` en `miami_package_events`.
  - Confirmar que paquetes ya despachados no pueden volver a entrar en otro
    embarque.
  - Confirmar que el modo de transporte seleccionado queda guardado en
    `miami_shipments.transport_mode`.
  - Desde Inventario, avanzar un paquete y confirmar que aparece un evento
    `status_change` en `miami_package_events`.
  - Desde Inventario, abrir `Historial` en ese paquete y confirmar que lista los
    eventos.
  - `20260627070000_phase6_miami_status_reversals.sql` confirmada en remoto
    (verificado con `supabase migration list --linked` el 2026-07-06).
  - Desde Inventario, reversar un estado con motivo y confirmar evento
    `status_reverse`.
  - Desde el portal cliente, abrir el paquete y confirmar que el historial de
    movimientos muestra despacho y cambios de estado.
- Riesgos o trabajo pendiente:
  - MIA-002 queda parcial: ya existe tabla de eventos para despacho, avance y
    reverso, pero faltan eventos específicos de incidencias.
  - MIA-003 queda parcial: ya existe vínculo con despacho y modo de transporte,
    pero faltan campos específicos para vuelo, camión o contenedor.
  - MIA-004 queda parcial: reversos y auditoría quedan cubiertos; POD/documento
    de entrega queda pendiente de estructura de archivos.
- Commit: pendiente.

### 2026-07-07 — MIA-005 — Ubicación por rack e inventario físico en bodega Miami

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/inventario/page.tsx`
- SQL:
  - `supabase/migrations/20260707110000_miami_rack_locations.sql`
- Cambios:
  - Agrega `rack_location`, `location_updated_at` y `location_updated_by` a
    `miami_packages`, con índice parcial por rack.
  - Agrega RPC `set_miami_package_location(p_tracking, p_rack)` (security
    definer, rol Operaciones/Admin): busca por tracking o WH#, exige que el
    paquete siga en bodega (`Recibido en Miami` / `En Consolidación`), ante
    trackings duplicados toma el ingreso más reciente en bodega, actualiza la
    ubicación y registra evento `location_change` en `miami_package_events` y
    entrada en `activity_logs` en la misma transacción.
  - Inventario muestra columna `Rack`, incluye rack en la búsqueda y agrega
    KPI/filtro `Sin rack (en bodega)` para medir avance del conteo físico.
  - Nuevo modo `Conteo por rack`: se escanea primero el rack y luego los
    trackings uno a uno con input auto-enfocado (mismo patrón de escaneo de
    manifiestos); cada escaneo persiste la ubicación vía RPC y lista lo
    ubicado en la sesión.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual/RLS pendiente:
  - Migración aplicada previamente y registrada en Supabase remoto el
    2026-07-28.
  - Confirmar que un usuario Cliente no puede ejecutar
    `set_miami_package_location` (debe fallar con 42501).
  - En `/miami/inventario`, iniciar `Conteo por rack`, escanear un tracking en
    bodega y confirmar toast, rack en la tabla y evento `location_change` en
    el historial del paquete.
  - Escanear un tracking ya despachado y confirmar error claro con el estado.
  - Confirmar KPI `Sin rack (en bodega)` disminuye al ubicar paquetes.
- Riesgos o trabajo pendiente:
  - Rack es texto libre normalizado (mayúsculas); si se requiere validar
    contra un layout fijo de bodega, agregar catálogo `miami_racks` después.
  - Fase 2 sugerida: reporte de conteo (escaneado vs esperado por rack) para
    detectar faltantes/sobrantes.
- Commit: pendiente.

### 2026-07-07 — MIA-006 — Selector de unidad de peso (lbs/kg) en ingreso Miami

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/ingreso/page.tsx`
- SQL: ninguno (usa columnas existentes `weight_lbs` y `weight_kg`).
- Cambios:
  - El campo de peso ahora tiene toggle `lbs`/`kg`; el valor se captura en la
    unidad elegida y se persisten ambas columnas convertidas (factor 0.453592
    / 2.20462, redondeo a 2 decimales).
  - Muestra la conversión aproximada en vivo bajo el campo.
  - La unidad elegida se conserva entre ingresos consecutivos (igual que el
    carrier).
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Ingresar un paquete en kg y confirmar que `weight_lbs` y `weight_kg`
    quedan correctos en `miami_packages`.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-10 - UX-030 - Catalogo administrable de tipos de contenedor/transporte

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/catalogs/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - Convierte `/catalogs` en pantalla operativa para Pricing/Admin con
    gestion de tipos de contenedor/transporte desde `container_types`.
  - Agrega alta y edicion de nombre/categoria, y selector de encendido/apagado
    sobre `active`.
  - Los tipos apagados se ocultan de nuevas cotizaciones porque los flujos de
    cotizacion leen `container_types` con `active = true`.
  - Mantiene los catalogos existentes de paises y puertos con estilos
    consistentes con el ERP.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Crear un tipo nuevo en `/catalogs`, confirmar que aparece en
    `/quotations/new` para carga FCL/FTL.
  - Apagar el tipo y confirmar que deja de aparecer como nueva opcion.
  - Confirmar con rol Pricing que RLS permite insertar/actualizar el catalogo.
- Riesgos pendientes:
  - No se agrega borrado fisico por seguridad historica; desactivar es la via
    operativa para ocultar opciones.
- Commit: pendiente.

### 2026-07-10 - UX-031 - Catalogos editables para productos y tarifas Miami

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/catalogs/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/clientes/[id]/page.tsx`
  - `src/lib/pricing-catalogs.ts`
  - `src/lib/quotation-products.ts`
- SQL:
  - `supabase/migrations/20260710133000_operational_catalogs.sql`
- Cambios:
  - Agrega tablas `service_products` y `client_rate_catalog` con RLS para
    usuarios internos y gestion por Pricing/Admin.
  - Siembra los productos y cargos actuales para preservar comportamiento.
  - `/catalogs` permite crear, editar y activar/desactivar productos de
    cotizacion y cargos/tarifas Miami por cliente.
  - `quotations/new`, `quotations/[id]/edit`, `clientes/[id]` y
    `pricing-comparison` leen catalogos activos con fallback local para no
    romper si la migracion aun no esta aplicada.
  - Los PDFs no cambian: siguen consumiendo datos guardados en cotizaciones,
    pricing items y client rates.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Apagar un producto en `/catalogs` y confirmar que no aparece en nueva
    cotizacion.
  - Apagar un cargo de `client_rate_catalog` y confirmar que desaparece del
    tab Tarifas del Cliente, sin afectar `client_rates` historicos.
  - Confirmar que una cotizacion/PDF historica sigue mostrando sus datos
    guardados.
- Riesgos pendientes:
  - Los productos Miami con logica especial siguen siendo `miami_lcl` y
    `miami_air`; agregar un producto nuevo con comportamiento Miami requiere
    implementar su logica operativa antes de usarlo en produccion.
- Commit: pendiente.

### 2026-07-10 - UX-025 - Breakbulk en catalogo de tipos de contenedor / unidad

- Estado: Aplicado
- Codigo: ninguno (cambio de datos).
- SQL:
  - `supabase/migrations/20260710120000_add_breakbulk_container_type.sql`
  - INSERT idempotente de la fila `Breakbulk` en `public.container_types`
    (name='Breakbulk', category=NULL, active=true).
- Cambios:
  - El dropdown "Tipo de contenedor / unidad" de la seccion Carga en
    cotizaciones FCL/FTL (`quotations/new` y `quotations/[id]/edit`) se alimenta
    de `container_types` (`where active = true order by name`), no de opciones
    hardcodeadas. Al agregar "Breakbulk" como fila del catalogo aparece
    automaticamente en ambas pantallas, ordenado alfabeticamente.
- Validaciones:
  - SQL ejecutado en Supabase (Success, no rows returned).
  - Verificacion REST: `container_types?name=eq.Breakbulk` devuelve
    `[{"name":"Breakbulk","active":true,"category":null}]`.
- Riesgos pendientes:
  - Ninguno de SQL; la ejecucion manual fue auditada y la version
    `20260710120000` quedo registrada en remoto el 2026-07-28.
- Commit: pendiente.

### 2026-07-10 - UX-026 - Correcciones UX en login del portal cliente

- Estado: En validacion
- Codigo:
  - `src/app/portal/login/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega identidad visible en mobile para que el login no pierda contexto de
    Portal de clientes cuando el panel lateral se oculta.
  - Cambia el toggle textual de contrasena por iconos `Eye`/`EyeOff`, evitando
    overflow dentro del input y manteniendo `aria-label`.
  - Asocia labels con inputs mediante `htmlFor`/`id`.
  - Restaura estilos `dark:*` para mantener consistencia con register,
    forgot-password y reset-password.
  - Marca el preview lateral como ejemplo/demo para no confundir datos
    ilustrativos con tracking real.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Abrir `/portal/login` en mobile y desktop, modo claro/oscuro, y confirmar
    identidad visible, foco accesible y toggle de contrasena sin overflow.
  - No aplica RLS ni SQL.
- Riesgos pendientes:
  - No se ejecuto prueba visual automatizada porque no hay herramienta de
    navegador disponible en esta sesion.
- Commit: pendiente.

### 2026-07-10 - UX-027 - Sistema visual base para portal de clientes forwarder

- Estado: En validacion
- Codigo:
  - `src/components/portal/PortalUI.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/paquetes/page.tsx`
  - `src/app/portal/pre-alertas/page.tsx`
  - `src/app/portal/notificaciones/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega componentes compartidos del portal para headers, cards, secciones,
    buscador, filtros, estados vacios, badges, botones y links de texto.
  - Migra listas principales del portal a un patron visual consistente,
    orientado a clientes de freight forwarders: tracking, envios, paquetes,
    pre-alertas y avisos.
  - Unifica filtros activos con acento azul de marca, headers con
    `font-display`, estados vacios y cards `rounded-2xl`.
  - El selector legacy `container_type` en la seccion Carga de
    `quotations/new` deja de tener opciones hardcodeadas y usa el catalogo
    `container_types` ya cargado desde Supabase.
- Validaciones:
  - `npx tsc --noEmit`: OK
  - `rg "Contenedor 20FR|Contenedor 20DR|Contenedor 20OT|Contenedor 40DR|Contenedor 40HC|Camion 8 tons|Contenedor 48' FTL" src -S`: sin resultados.
- Verificacion manual/RLS pendiente:
  - Abrir `/portal`, `/portal/envios`, `/portal/paquetes`,
    `/portal/pre-alertas` y `/portal/notificaciones` en mobile/desktop y
    confirmar consistencia visual.
  - Crear cotizacion FCL en `/quotations/new`, abrir seccion Carga y confirmar
    que "Tipo de contenedor / unidad" refleja el catalogo `container_types`
    incluyendo `Breakbulk`.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes:
  - Faltan por migrar pantallas secundarias del portal: detalles, perfil,
    herramientas, contacto, info y flujos auth restantes.
- Commit: pendiente.

### 2026-07-10 - UX-028 - Consistencia visual en carga LCL/LTL de cotizacion nueva

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - El bloque `Detalle de carga` para LCL/LTL/Consolidado/Courier de otros
    origenes adopta el mismo lenguaje visual del bloque Miami: cabecera por
    linea, borde/fondo segun completitud, labels compactos, campos `h-10` y
    resumen por linea.
  - Se elimina del formulario visible el selector `Caja/Pallet/Pieza` para
    que LCL Otros Origenes y LTL/FTL USA pidan directamente cantidad, volumen,
    unidad, peso y dimensiones/CBM. Internamente se conserva `packageType:
    'Caja'` para no romper persistencia ni PDF.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - En `/quotations/new`, seleccionar `LCL Otros Origenes` y confirmar que
    pide detalle de carga sin selector de tipo de empaque por linea.
  - Seleccionar `LTL / FTL USA` con modalidad `LTL` y confirmar el mismo
    comportamiento.
  - Confirmar que Miami LCL/Aereo conserva su flujo y que guardar cotizacion
    persiste `quotation_cargo_lines`.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes:
  - El tipo de paquete queda fijo como `Caja` en datos heredados para estas
    lineas; si despues se requiere clasificacion real de empaque, debe
    definirse un catalogo/UX separado.
- Commit: pendiente.

### 2026-07-10 - UX-029 - Reset visual despues de enviar cotizacion a Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - Corrige que despues de `Enviar a Pricing` el formulario quedara limpio
    pero con `submitted=true`, provocando bordes rojos en campos requeridos
    vacios.
  - Agrega helper `createEmptyCargoLine()` para reiniciar las lineas de carga
    con un estado inicial consistente tras guardar/enviar.
  - Al crear correctamente una cotizacion se resetean `formData`,
    `submitted`, lineas de carga, lineas de contenedor, duplicacion y formulario
    de contenedor.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Crear cotizacion con `Enviar a Pricing` y confirmar que el formulario queda
    en blanco sin bordes rojos residuales.
  - Crear borrador y confirmar el mismo reset visual.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-10 - UX-024 - Parpadeo en portal por bucle de re-render en useUser

- Estado: En validacion
- Codigo:
  - `src/hooks/useUser.tsx`
- SQL: ninguno.
- Cambios:
  - El efecto de `UserProvider` tenia `profile` y `user?.id` en sus
    dependencias mientras el mismo efecto reescribia `profile`/`user` con
    objetos nuevos en cada fetch. Sin sesion inicial (portal de clientes) esto
    generaba un bucle: cada `setProfile`/`setUser` re-ejecutaba el efecto,
    volvia a llamar `getUser()` y re-fetch, emitiendo un objeto `user` nuevo en
    cada vuelta.
  - Cada objeto `user` nuevo disparaba los efectos de las paginas hijas
    (`[user]` / `[profile?.cliente_id]`), que ponian `loading = true` y
    recargaban, produciendo el parpadeo "aparece y desaparece" reportado en
    `/portal/notificaciones`.
  - El efecto ahora se suscribe una sola vez (dependencia unica
    `hasInitialSession`) y la guardia de "mismo usuario" usa un `ref`
    (`loadedUserIdRef`) en lugar de `user`/`profile`. Elimina el bucle y de
    paso el doble fetch inicial.
  - El lado `(protected)` no estaba afectado porque monta el provider con
    `initialUser`/`initialProfile`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Con sesion de Cliente, abrir `/portal/notificaciones` y confirmar que la
    lista carga una sola vez y no parpadea.
  - Navegar entre paginas del portal y confirmar que no hay recargas repetidas.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-08 - PRC-014 - Aviso de estado requerido para modificar tarifas

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega una validacion especifica para editar/agregar tarifas de agente:
    la cotizacion debe estar en `Pendiente de Fijar Precios`.
  - Cuando la cotizacion esta en otro estado, Pricing muestra Sonner:
    `Cotización debe estar en "Pendiente de Fijar Precios" para modificar/agregar tarifas`.
  - Se evita reabrir automaticamente cotizaciones enviadas/aprobadas desde el
    guardado de tarifas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - En una cotizacion `Aereo Consolidado` con tarifa seleccionada y estado
    distinto de `Pendiente de Fijar Precios`, intentar editar/guardar tarifa y
    confirmar el Sonner de estado requerido.
  - Cambiar la cotizacion a `Pendiente de Fijar Precios` y confirmar que
    editar/agregar tarifa funciona normalmente.
- Riesgos pendientes:
  - El usuario debe cambiar el estado de la cotizacion antes de modificar o
    agregar tarifas.
- Commit: pendiente.

### 2026-07-07 — MIA-007 — Escaneo de manifiesto: unidad de peso, duplicados y eliminación segura

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL: ninguno (el trigger existente de `total_packages` cubre el DELETE).
- Cambios:
  - Selector `lbs`/`kg` en el formulario de escaneo; se persisten `weight_lbs`
    y `weight_kg` convertidos (mismos factores que MIA-006).
  - Escaneo duplicado dentro del mismo manifiesto ya no inserta: muestra
    toast de advertencia, limpia el campo y re-enfoca el escáner.
  - Botón rojo (ícono basurero) por fila para eliminar un tracking escaneado
    por accidente; visible solo con manifiesto `Abierto` y paquete
    `Sin asignar`.
  - La eliminación pasa por `ConfirmDialog` (danger) con el tracking en el
    mensaje; el DELETE filtra además por `status = 'Sin asignar'` en servidor
    y verifica filas afectadas para no reportar éxito falso si el paquete fue
    asignado en paralelo.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Escanear en kg y confirmar ambos pesos en `miami_packages`.
  - Escanear dos veces el mismo tracking y confirmar advertencia sin fila
    duplicada.
  - Eliminar un tracking con confirmación y verificar que `total_packages`
    del manifiesto disminuye (trigger).
  - Confirmar por RLS que un usuario Cliente no puede borrar
    `miami_packages`.
- Riesgos pendientes:
  - Paquetes ya asignados no se pueden eliminar desde la UI por diseño
    (tienen WH# y notificación al cliente); si se requiere, definir flujo de
    reverso de asignación aparte.
- Commit: pendiente.

### 2026-07-07 — MIA-008 — Catálogo de transportistas Miami administrable

- Estado: En validación
- Código:
  - `src/hooks/useMiamiCarriers.ts` (nuevo)
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/ingreso/page.tsx`
- SQL:
  - `supabase/migrations/20260707120000_miami_carriers_catalog.sql`
- Cambios:
  - Nueva tabla `miami_carriers` (nombre único case-insensitive, `is_active`,
    auditoría de creador) sembrada con los 8 valores que estaban hardcodeados.
  - RLS: lectura para `authenticated`; insert/update solo Admin/Operaciones.
  - Hook `useMiamiCarriers` comparte el catálogo (alfabético, `Otro` al
    final) con fallback a la lista anterior si la tabla aún no existe.
  - Botón `Nuevo transportista` junto a `Cerrar manifiesto` con modal custom;
    valida nombre vacío y duplicados (cliente + índice único 23505) y
    auto-selecciona el nuevo carrier en el formulario de escaneo.
  - `Ingreso Individual` y el detalle de manifiesto leen del catálogo; se
    eliminaron las constantes hardcodeadas (el portal de pre-alertas conserva
    su lista propia, pendiente de unificar).
- Decisión de diseño:
  - NO se guardan en `proveedores`: su RLS es exclusiva de
    Admin/Finanzas/Contabilidad (bodega no puede leer ni escribir) y los
    couriers de ingreso (USPS, Amazon Logistics, `Otro`) contaminarían el
    catálogo de cuentas por pagar. Si un transportista se vuelve proveedor
    real, Finanzas lo crea en su módulo como hasta ahora.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; seed confirmado
    con 8 filas.
  - Crear un transportista desde el manifiesto y verlo en ambos selects.
  - Intentar crear un duplicado (debe rechazarse con mensaje claro).
  - Confirmar que un usuario Cliente no puede insertar en `miami_carriers`.
- Riesgos pendientes:
  - Lista del portal de pre-alertas sigue hardcodeada; unificarla requiere
    revisar UX del portal (RLS ya permite el select).
- Commit: pendiente.

### 2026-07-07 — MIA-009 — Transportista a nivel de manifiesto (un lote = un carrier)

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/nuevo/page.tsx`
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/manifiestos/page.tsx`
- SQL:
  - `supabase/migrations/20260707130000_miami_manifest_carrier.sql`
- Cambios:
  - Columna `carrier` en `miami_manifests`; UX corregida: el transportista se
    define una vez por manifiesto en lugar de seleccionarse en cada escaneo.
  - Crear manifiesto exige transportista (validación + botón deshabilitado).
  - En el detalle, el select por escaneo se elimina; los paquetes heredan
    `manifest.carrier` al insertarse. Sin transportista definido (manifiestos
    previos) el escaneo queda bloqueado con aviso.
  - Cambiar el transportista de un manifiesto abierto propaga el cambio a los
    paquetes ya escaneados del manifiesto para no mezclar carriers.
  - Crear un transportista desde el modal lo asigna directo al manifiesto
    abierto; la lista de manifiestos muestra columna `Transportista`.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; crear
    manifiesto nuevo eligiendo transportista y
    confirmar que cada paquete escaneado hereda el carrier.
  - En un manifiesto viejo sin carrier, confirmar aviso y bloqueo de escaneo
    hasta seleccionarlo.
  - Cambiar el transportista con paquetes escaneados y confirmar que las
    filas existentes se actualizan.
- Riesgos pendientes:
  - Manifiestos históricos quedan con `carrier` null (solo lectura si están
    cerrados); no se hace backfill porque el dato real no se conoce.
- Commit: pendiente.

### 2026-07-07 — MIA-010 — "Otro" abre alta de transportista; modal reutilizable

- Estado: En validación
- Código:
  - `src/components/miami/NewCarrierModal.tsx` (nuevo)
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/manifiestos/nuevo/page.tsx`
- SQL: ninguno.
- Cambios:
  - El modal de nuevo transportista se extrae a `NewCarrierModal`
    (validación de vacío/duplicado, 23505 amigable, callback `onCreated`).
  - En los selects de transportista del manifiesto (crear y detalle),
    seleccionar `Otro` ya no asigna el valor literal: abre el modal para
    agregar el transportista real; la opción se rotula
    `Otro (agregar nuevo...)`. Al guardarlo queda auto-seleccionado (en
    detalle, propagado al manifiesto y sus paquetes vía MIA-009).
  - Cancelar el modal conserva la selección anterior (selects controlados).
  - El select de carrier de Ingreso Individual conserva `Otro` como valor
    válido (paquete suelto con courier desconocido).
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Elegir `Otro` en crear manifiesto y en detalle: debe abrir el modal y,
    al guardar, quedar seleccionado el nuevo transportista.
  - Cancelar el modal y confirmar que el select regresa al valor previo.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-07 — MIA-011 — Eliminación de manifiestos solo Admin con auditoría

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260707140000_miami_manifest_delete.sql`
- Cambios:
  - RPC `delete_miami_manifest(p_manifest_id, p_reason)` (security definer):
    exige `is_admin()` y motivo obligatorio; bloquea si algún paquete del
    manifiesto está asignado/procesado (status distinto de `Sin asignar`,
    `cliente_id` o `warehouse_number` presentes) o vinculado a un despacho
    (`miami_shipment_packages`).
  - Antes de borrar registra en `activity_logs` (permanente): número,
    estado, carrier, motivo, conteo y lista de trackings eliminados — los
    `miami_package_events` se van en cascada, por eso el log vive fuera.
  - Borra paquetes y manifiesto en una sola transacción.
  - UI: botón rojo `Eliminar manifiesto` visible solo para rol Admin
    (abierto o cerrado), con modal custom de motivo obligatorio; al eliminar
    redirige a la lista.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; eliminar el
    manifiesto de prueba del usuario con
    motivo; confirmar registro en `activity_logs` con trackings.
  - Confirmar que un usuario Operaciones no ve el botón y que la RPC le
    devuelve 42501 si la invoca directo.
  - Intentar eliminar un manifiesto con paquete asignado (debe bloquear).
- Riesgos pendientes:
  - La eliminación es física (no soft-delete); el registro de auditoría en
    `activity_logs` es el único rastro. Aceptado por diseño para lotes de
    prueba/error.
- Commit: pendiente.

### 2026-07-07 - MIA-012 - Hardening de escaneo y edicion de manifiestos Miami

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260707150000_miami_manifest_scan_hardening.sql`
- Cambios:
  - Agrega indice unico parcial `miami_packages_manifest_tracking_unique_idx`
    para impedir trackings duplicados dentro de un mismo manifiesto, incluso
    si dos usuarios escanean al mismo tiempo o si alguien inserta directo.
  - Agrega RPC `scan_miami_manifest_package(...)`: bloquea la fila del
    manifiesto, valida rol Operaciones/Admin, manifiesto abierto, carrier
    definido y duplicados antes de insertar el paquete.
  - Agrega RPC `update_miami_manifest_carrier(...)`: cambia el carrier solo
    en manifiestos abiertos sin paquetes asignados/procesados, propaga el
    carrier a los paquetes aun sin asignar y registra `activity_logs`.
  - Agrega RPC `delete_miami_manifest_package(...)`: elimina paquetes
    escaneados por error solo si el manifiesto sigue abierto y el paquete no
    fue asignado/procesado ni vinculado a despacho; registra auditoria antes
    del DELETE.
  - La UI del detalle de manifiesto deja de hacer insert/update/delete directo
    para esas operaciones y llama las RPC auditadas.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Migracion aplicada previamente y registrada en Supabase remoto el
    2026-07-28.
  - Probar dos escaneos concurrentes del mismo tracking en el mismo manifiesto:
    uno debe insertar y el otro debe fallar con mensaje de duplicado.
  - Intentar cambiar carrier con paquetes ya asignados/procesados: debe
    bloquear.
  - Eliminar un paquete sin asignar y confirmar registro
    `delete_miami_manifest_package` en `activity_logs`.
  - Confirmar que un usuario Cliente no puede ejecutar las nuevas RPC.
- Riesgos pendientes:
  - Si existen duplicados historicos por `(manifest_id, tracking_number)`, el
    indice unico fallara al aplicar la migracion; limpiar esos duplicados antes
    de desplegar.
- Commit: pendiente.

### 2026-07-07 - QUO-013 - Guardado de cotizaciones Miami conserva estado

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - El boton `Guardar cotizacion` en creacion respeta el estado `Borrador`.
    En flujo Miami solo se marca `Pricing Aprobado` cuando se usa el boton de
    crear/aprobar cotizacion, no al guardar draft.
  - En edicion, `Guardar Cambios` de una cotizacion Miami recalcula totales y
    cargos, pero ya no cambia `status` ni marca `pricing_approved`.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Crear cotizacion Miami con `Guardar cotizacion` y confirmar estado
    `Borrador`.
  - Editar una cotizacion Miami en `Borrador` y confirmar que `Guardar Cambios`
    no la cambia a `Pricing Aprobado`.
  - Crear cotizacion Miami con el boton de aprobacion y confirmar que sigue
    quedando en `Pricing Aprobado`.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-18 - QUO-014 - Cierre externo del menu de acciones de cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL: ninguno.
- Cambios:
  - El menu de los tres puntos en el detalle de cotizacion se cierra al hacer
    clic fuera del boton o de sus opciones.
  - Los clics dentro del menu conservan el comportamiento de cada accion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir el menu, hacer clic fuera y confirmar que se cierre.
  - Confirmar que las opciones del menu continuen ejecutando su accion.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-20 - PRI-015 - Revision de cantidades FCL antes de aprobar Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - `Aprobar Pricing` abre una revision previa con todas las lineas, cantidades,
    costos unitarios y totales antes de continuar con las validaciones existentes.
  - En FCL se compara la cantidad de las lineas DTHC y Entrega Local presentes
    contra el total de `quotation_containers`.
  - La confirmacion queda bloqueada si uno de esos cargos no tiene una unidad
    por contenedor; el usuario debe volver y corregir la cantidad.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Probar una cotizacion FCL de 2 contenedores con DTHC o Entrega Local en
    cantidad 1 y confirmar que la aprobacion se bloquee.
  - Corregir ambas cantidades a 2 y confirmar que continúe el flujo normal,
    incluidas las validaciones de margen y de impacto operativo.
  - Confirmar que una cotizacion no FCL solo muestre la revision informativa.
- Riesgos pendientes:
  - La deteccion depende de que la descripcion incluya DTHC, Destination THC,
    THC Destino, Entrega Local o Local Delivery.
- Commit: pendiente.

### 2026-07-23 - UX-043 - Calculadora referencial de seguro en acciones rapidas

- Estado: En validacion
- Codigo:
  - `src/components/layout/topbar.tsx`
  - `src/components/quotations/ReferenceInsuranceCalculatorDialog.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega `Calculadora de Seguro` al menu global de acciones rapidas para los
    roles internos.
  - El modal permite ingresar mercancía/FOB, flete y servicios, impuestos
    nacionales y tarifa porcentual, además de activar los recargos adicionales
    y operacionales.
  - Muestra subtotal, valor asegurado y prima estimada en formato USD.
  - El cálculo es local, no guarda información y se identifica como referencia
    no vinculante.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir la calculadora desde acciones rapidas en escritorio y movil.
  - Confirmar el cálculo con y sin cada recargo del 10%.
  - Confirmar que `Limpiar`, `Cerrar` y el cierre exterior del modal funcionen.
- Riesgos pendientes:
  - La tarifa predeterminada es 0.28%; el usuario debe ajustarla a la póliza o
    condición comercial aplicable antes de usar el resultado como referencia.
- Commit: pendiente.

### 2026-07-23 - PRI-016 - Comparacion contra target incluye ISV

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - `Vs Target` compara la venta total con ISV contra el target del cliente,
    que tambien se registra con ISV.
  - Las tarjetas de venta y target indican explicitamente que incluyen ISV.
  - Profit y GP conservan su calculo sin ISV.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Para venta con ISV USD 8,507.50 y target USD 8,122.00, confirmar que
    `Vs Target` muestre `+ USD 385.50` y `4.75% arriba`.
  - Confirmar que Profit permanezca en USD 700.00 y GP en 8.34%.
- Riesgos pendientes:
  - Las cotizaciones historicas cuyo target se haya ingresado sin ISV deben
    corregir ese dato antes de interpretar la comparacion.
- Commit: pendiente.

### 2026-07-24 - PRI-017 - Edicion de ISV en lineas de Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Al modificar una linea de pricing, el formulario carga su indicador gravable
    y permite activarlo o desactivarlo desde la columna ISV.
  - La vista previa de ISV y venta total se recalcula inmediatamente con el
    monto, cantidad y seleccion gravable editados.
  - Al guardar se persisten `taxable`, `tax_rate`, `tax_amount` y `total_amount`
    de forma consistente.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - En una cotizacion FCL, modificar una linea inicialmente exenta, cambiar el
    monto, activar ISV y confirmar que el impuesto y total se actualicen.
  - Guardar, volver a abrir la linea y confirmar que el indicador ISV permanezca
    activo.
  - Desactivar ISV y confirmar que el impuesto quede en cero y el total sea el
    subtotal.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-28 - PRI-018 - Fecha y hora de ingreso de tarifas de agentes

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL: ninguno.
- Cambios:
  - Cada tarjeta de tarifa de agente muestra la fecha y hora en que fue
    ingresada al comparativo, tanto para LCL maritimo, aereo consolidado y los
    demas servicios que utilizan la vista de tarjetas.
  - La tabla comparativa FCL incorpora una fila de fecha y hora de ingreso por
    agente, incluida en su impresion interna.
  - Se reutiliza `agent_quotes.created_at` y el helper central
    `formatDateTime`; no se modifica la fecha original al editar una tarifa.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Agregar dos tarifas de agentes en momentos distintos para FCL y confirmar
    que sus fechas y horas sean visibles y comparables en cards y tabla.
  - Repetir en LCL maritimo y aereo consolidado y confirmar el formato
    `DD/MM/YYYY HH:mm`.
  - Editar una tarifa existente y confirmar que conserve la fecha y hora de
    ingreso original.
- Riesgos pendientes:
  - Las tarifas historicas sin `created_at` mostraran `N/A`.
- Commit: `d719cb2`.

### 2026-07-28 - FLOW-011 - RPC de contenedores Booking y BL sin ambiguedad

- Estado: En validacion; SQL aplicado en remoto.
- Hallazgo: FLOW-011.
- Causa raiz:
  - `replace_booking_containers` retorna una columna llamada `booking_id` y
    utilizaba `where booking_id = p_booking_id` sin alias de tabla. PL/pgSQL no
    podia distinguir la columna real de la variable de salida.
  - `replace_bl_containers` repetia el mismo patron con `bl_id`, por lo que
    conservaba el mismo fallo latente al guardar contenedores de un BL.
- SQL:
  - `supabase/migrations/20260728110000_fix_booking_container_rpc_ambiguous_ids.sql`
- Codigo:
  - Sin cambios TypeScript; los formularios ya llaman las RPC correctas.
- Cambios:
  - Los deletes califican las columnas como `bc.booking_id` y `blc.bl_id`.
  - Los recorridos JSON usan alias explicitos y los `return query` nombran sus
    columnas de salida para evitar nuevas colisiones.
  - Se conservan las validaciones de permisos, bloqueos transaccionales,
    validacion de datos y grants existentes.
- Validaciones:
  - `npx supabase db push --dry-run`: OK; incluyo exclusivamente
    `20260728110000_fix_booking_container_rpc_ambiguous_ids.sql`.
  - `npx supabase db push --yes`: OK; migracion aplicada en remoto el
    2026-07-28.
  - `npx supabase migration list`: OK; version local y remota
    `20260728110000`.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Guardar varios contenedores en un Booking, confirmando que reemplace las
    filas sin el error `booking_id is ambiguous`.
  - Editar los contenedores nuevamente y confirmar que no se dupliquen.
  - Guardar contenedores en un BL y confirmar que no aparezca
    `bl_id is ambiguous`.
- Riesgos pendientes:
  - No marcar como completado hasta probar los flujos de Booking y BL con un
    usuario autenticado de Operaciones/Admin.
- Commit: `d719cb2`.

### 2026-07-28 - ENV-002 - Historial remoto de migraciones manuales alineado

- Estado: Completado.
- Hallazgo: ENV-002.
- Causa:
  - Doce migraciones ejecutadas manualmente en Supabase tenian sus cambios
    presentes en la base, pero no estaban registradas en
    `supabase_migrations.schema_migrations`.
- Versiones auditadas:
  - `20260706220000`, `20260707090000`, `20260707110000`,
    `20260707120000`, `20260707130000`, `20260707140000`,
    `20260707150000`, `20260710120000`, `20260710133000`,
    `20260720153000`, `20260722120000` y `20260722143000`.
- Verificaciones remotas:
  - El volcado de esquema confirmo tablas, columnas, indices, funciones,
    policies, grants, defaults y comentarios esperados.
  - Plantillas de correo: 2/2 y sin texto UTF-8 corrupto.
  - Recargos de negocio: 3/3 con sus importes esperados.
  - Carriers Miami: 8/8; Breakbulk: 1/1.
  - Catalogos operativos: 7/7 productos y 24/24 tarifas.
  - Configuracion de seguro: patrones base, terrestre y aereo presentes en
    todas las configuraciones revisadas.
  - Columnas de rack, carrier de manifiesto, excepcion de seguro y razones de
    perdida consultables mediante PostgREST.
- Accion:
  - `npx supabase migration repair --linked --status applied ...`: OK para las
    doce versiones, sin volver a ejecutar su SQL.
- Validaciones:
  - `npx supabase migration list`: todas las versiones Local/Remote alineadas.
  - `npx supabase db push --dry-run`: `Remote database is up to date`.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Riesgos pendientes:
  - Ninguno en el historial de migraciones. Las pruebas funcionales/RLS
    pendientes de cada modulo permanecen documentadas en sus hallazgos.
- Commit: `d719cb2`.

### 2026-07-28 - FLOW-012 - Draft MBL respeta la ruta RLS del booking

- Estado: En validacion.
- Hallazgo: FLOW-012.
- Causa raiz:
  - La carga del Draft MBL usaba `bl-drafts/...` como ruta dentro del bucket
    `booking-documents`.
  - La policy de Storage obtiene el booking desde el primer segmento del
    objeto; `bl-drafts` no es un UUID, por lo que
    `booking_id_from_storage_object_name(name)` devolvia `null` y el insert era
    rechazado por RLS.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno.
- Cambios:
  - La ruta ahora comienza con `bookingId` y conserva la jerarquia
    `bl-drafts/{new|blId}/{timestamp}-{archivo}`.
  - No se relajan policies ni permisos; la carga utiliza el contrato de ruta
    ya aplicado a los documentos generales del booking.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Crear un MBL, subir el Draft MBL del agente y confirmar que Storage no
    devuelve `new row violates row-level security policy`.
  - Guardar el MBL y abrir el enlace del archivo cargado.
  - Repetir la carga al editar un MBL existente.
- Riesgos pendientes:
  - Si el usuario abandona un MBL nuevo despues de subir el archivo, el objeto
    queda bajo `bl-drafts/new`; la limpieza de borradores huerfanos sigue
    pendiente de una politica de retencion.
- Commit: pendiente.

### 2026-07-28 - FLOW-013 - Creacion de BL compatible con RLS

- Estado: En validacion.
- Hallazgo: FLOW-013.
- Causa raiz:
  - La creacion ejecutaba `.insert(...).select('id').single()`, por lo que
    PostgREST solicitaba `INSERT ... RETURNING`.
  - La policy SELECT de `bills_of_lading` usa
    `can_access_bill_of_lading(id)`, que vuelve a consultar la fila. Durante
    el mismo statement de insercion esa comprobacion no encuentra la nueva
    fila y rechaza el `RETURNING`, aunque `can_manage_operations()` sea true.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno; no se relajan ni modifican policies RLS.
- Cambios:
  - El cliente genera el UUID del BL antes de insertarlo.
  - El insert incluye ese UUID y no solicita representacion de retorno.
  - El mismo UUID se utiliza en el log de actividad y en la redireccion al BL.
- Validaciones:
  - Reproduccion SQL local con rol `Admin`: `current_user_role() = Admin` y
    `can_manage_operations() = true`; `INSERT ... RETURNING` reproduce el
    rechazo RLS.
  - Transaccion local con rollback: el mismo insert sin `RETURNING` se crea y
    puede consultarse despues del statement.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente avisos de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Pulsar `Crear Master BL` con el Draft MBL cargado y confirmar que se crea,
    registra la actividad y abre el detalle del nuevo MBL.
- Riesgos pendientes:
  - La verificacion funcional requiere la sesion autenticada y los datos del
    booking del ambiente remoto.
- Commit: pendiente.

### 2026-07-28 - FLOW-014 - HBL hereda contenedores del MBL

- Estado: En validacion; SQL aplicado en remoto.
- Hallazgo: FLOW-014.
- Causa raiz:
  - Al crear un HBL se heredaban los datos generales del MBL padre, pero no sus
    filas de `bl_containers`.
  - El HBL se abria sin contenedores y exigia volver a ingresarlos manualmente.
- SQL:
  - `supabase/migrations/20260728130000_copy_mbl_containers_to_hbl.sql`
- Codigo TypeScript: ninguno.
- Cambios:
  - Un trigger copia los contenedores del MBL padre dentro de la misma
    transaccion que crea el HBL.
  - Se copian numero, precinto, tipo, cantidad, peso, volumen y notas.
  - El trigger valida que el padre sea un MBL del mismo booking.
  - La copia es inicial: despues de crear el HBL, Operaciones puede ajustar sus
    contenedores sin modificar el MBL ni otros HBL.
- Validaciones:
  - `npx supabase migration up`: OK.
  - Prueba SQL transaccional con rollback: 2/2 contenedores copiados y todos
    sus campos coinciden con el MBL padre.
  - Prueba negativa local: un MBL de otro booking es rechazado.
  - `npx supabase db push --linked --dry-run`: incluyo unicamente
    `20260728130000_copy_mbl_containers_to_hbl.sql`.
  - `npx supabase db push --linked --yes`: OK; migracion aplicada en remoto.
  - `npx supabase migration list --linked`: version local/remota
    `20260728130000` alineada.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente aviso de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Crear un HBL desde un MBL con varios contenedores y confirmar que todos
    aparezcan al abrir el nuevo HBL.
  - Modificar el HBL y confirmar que el MBL padre conserve sus datos.
- Riesgos pendientes:
  - Los HBL creados antes de esta migracion no se rellenan automaticamente.
- Commit: pendiente.

### 2026-07-29 - CALC-006 - Profit del agente incluido en costo FCL

- Estado: En validacion manual.
- Hallazgo: CALC-006.
- Causa raiz:
  - La tabla comparativa FCL trataba Flete, MBL y Profit del agente como costo,
    pero al seleccionar la tarifa `pricing_items` excluia el Profit del costo
    y lo convertia en margen entre costo y venta.
  - Los ajustes locales de MBL y Profit podian seguir afectando una seleccion
    desde Cards aunque la tabla no estuviera visible.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - En FCL, el costo unitario de la linea Flete suma el flete del contenedor,
    el MBL prorrateado y el Profit del agente por contenedor.
  - La venta inicial se iguala al costo proveedor, sin crear margen comercial
    automatico; Pricing conserva la edicion manual de la venta para alcanzar
    el target del cliente.
  - Los overrides visibles de la tabla solo se usan al seleccionar desde la
    vista Tabla. Cards utiliza los valores persistidos de la tarifa.
  - Al editar MBL o Profit en una tarifa, se eliminan sus overrides locales
    anteriores para evitar que valores obsoletos prevalezcan.
- Caso validado:
  - 1 contenedor, Flete USD 6,700.00, MBL USD 65.00 y Profit del agente
    USD 50.00 deben generar costo y venta inicial unitarios de USD 6,815.00.
  - Una venta modificada manualmente, por ejemplo USD 7,160.00, conserva un
    margen comercial de USD 345.00 sobre el costo correcto.
- Validaciones:
  - Auditoria remota de solo lectura sobre `SARIHN-2607-0167-AP`: tarifa
    FCL USD 6,700.00, MBL USD 65.00, Profit USD 50.00 y un contenedor.
  - Revision dirigida de formula: `6,700 + 65 / 1 + 50 = 6,815` para costo
    y venta inicial; venta manual USD 7,160.00 produce margen USD 345.00.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente avisos de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Seleccionar la tarifa FCL del caso y confirmar una sola linea Ocean
    Freight con costo unitario USD 6,815.00 y venta inicial USD 6,815.00.
  - Cambiar manualmente la venta y confirmar que el costo permanezca intacto.
  - Editar MBL/Profit, volver a seleccionar desde Cards y Tabla y confirmar
    que no reaparezcan overrides anteriores.
- Riesgos pendientes:
  - Las ventas ya ajustadas manualmente no se modifican con este cambio.
- Commit: pendiente.

### 2026-07-29 - FLOW-015 - Fundación de Booking canónico

- Estado: En validación; migración aplicada únicamente en Supabase local.
- Hallazgo: FLOW-015.
- Causa raíz:
  - Las pantallas internas principales coexistían con dos fuentes editables:
    campos legacy de booking en `shipping_instructions` y registros hijos en
    `bookings`.
  - La creación y actualización del booking se ejecutaban directamente desde
    el frontend, por lo que el cambio y su auditoría no eran una sola
    transacción.
- SQL:
  - `supabase/migrations/20260729120000_booking_canonical_foundation.sql`
  - `supabase/diagnostics/booking_source_classification.sql`
  - `supabase/diagnostics/booking_field_conflicts.sql`
  - `supabase/diagnostics/booking_post_foundation_validation.sql`
  - `supabase/tests/booking_canonical_foundation.sql`
- Código:
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/booking/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- Cambios:
  - Se agregó `shipping_instructions.primary_booking_id` con FK
    `ON DELETE SET NULL`, índice y validación de pertenencia a la misma SI.
  - El primer booking de una SI activa se selecciona automáticamente como
    primario. La creación de un segundo booking no reemplaza el primario.
  - Los RPC `create_booking_for_shipping_instruction`,
    `update_booking_canonical`, `set_primary_booking` y
    `select_primary_booking_if_single` validan autenticación y rol
    Admin/Operaciones y registran `activity_logs` en la misma transacción.
  - La actualización canónica limita los campos permitidos y utiliza
    `updated_at` como control optimista de concurrencia.
  - La pantalla nueva y las cachés temporales MBL/HBL dejaron de escribir
    `bookings` directamente.
  - `saveRouting` dejó de guardar `booking_number`, `carrier_booking`,
    `master_bl`, `house_bl`, `etd`, `eta` y `free_days` en SI.
  - La bandeja `/operations/bookings` ahora consulta `bookings`, conserva el
    contexto de SI/cliente/asignado y abre la ruta canónica.
  - La ruta `/shipping-instructions/{id}/booking` quedó como compatibilidad:
    redirige para 0/1 bookings y muestra selector para N, sin escrituras.
  - No se eliminó ni renombró ninguna columna legacy.
- Validaciones:
  - Inspección de migraciones: ninguna posterior a `20260728130000` alteraba
    bookings, SI o sus RLS.
  - `npx supabase migration up`: OK en base local.
  - `npx supabase db push --linked --dry-run`: únicamente propone
    `20260729120000_booking_canonical_foundation.sql`; no se aplicaron cambios
    remotos.
  - `supabase/tests/booking_canonical_foundation.sql`: OK, transacción con
    rollback.
  - Diagnósticos SQL: sintaxis validada localmente; únicamente `SELECT`.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: OK.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Verificación manual pendiente:
  - UAT autenticada de creación/edición desde la UI.
  - Confirmar visualmente la ruta de compatibilidad con 0, 1 y N bookings.
  - Confirmar en la bandeja dos bookings pertenecientes a la misma SI.
  - Aplicar la migración en remoto únicamente después de aprobar esta UAT.
- Riesgos pendientes:
  - `sync_shipping_instruction_from_selected_agent_quote` mantiene la
    sincronización anterior de repricing hacia SI y bookings; quedó fuera del
    alcance aprobado de Fase 4A.
  - Portal, Cost Validation, reportes y alertas aún tienen consumidores legacy
    documentados para fases posteriores.
  - No existe todavía modelo de revisiones de itinerario ni relación formal de
    rollover; cambios de ETD/vessel actualizan el mismo booking canónico.
  - Los campos MBL/HBL en booking continúan como caché temporal hasta completar
    la autoridad documental de `bills_of_lading`.
- Rollback:
  - Revertir las llamadas frontend a los RPC y la consulta de bandeja.
  - Mantener las columnas legacy intactas permite volver temporalmente a las
    lecturas anteriores.
  - Retirar funciones/trigger/FK/índice y `primary_booking_id` solo mediante
    una migración compensatoria; no editar ni borrar la migración ya aplicada.
- Commit: pendiente.

### 2026-07-31 - UX-046 - Perfil de cliente editable desde acciones rápidas

- Estado: En validación manual.
- Hallazgo: UX-046.
- Causa raíz:
  - El menú de acciones rápidas permitía crear clientes, pero consultar o
    modificar uno existente exigía navegar al módulo de Clientes.
- Código:
  - `src/components/clientes/ClientProfileDialog.tsx`
  - `src/components/layout/topbar.tsx`
- SQL: ninguno.
- Cambios:
  - Se agregó la acción `Ver / Editar Cliente` para Admin y Ventas, alineada
    con la política RLS vigente de actualización de clientes.
  - El modal permite buscar por nombre o código, consultar el perfil completo
    y actualizar datos de contacto, dirección, clasificación comercial,
    crédito, seguro y notas sin abandonar la pantalla actual.
  - Cada actualización intenta registrar el evento en `cliente_history` y
    avisa si el perfil se guardó pero falló su registro de historial.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npx eslint src/components/layout/topbar.tsx src/components/clientes/ClientProfileDialog.tsx`:
    OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Abrir la acción con un usuario Admin y otro de Ventas, buscar un cliente,
    modificarlo y confirmar que los datos y el historial persisten.
  - Confirmar que la acción no aparece para roles sin permiso de edición.
- Riesgos pendientes:
  - La validación funcional requiere una sesión autenticada y datos del
    ambiente Supabase.
- Commit: pendiente.

### 2026-07-31 - UX-049 - Footers unificados con la marca de plataforma

- Estado: En validación.
- Hallazgo: UX-049.
- Código:
  - `src/lib/platform-branding.ts`
  - `src/app/login/page.tsx`
  - `src/app/register/page.tsx`
  - `src/app/onboarding/page.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/components/marketing/ForwardersLanding.tsx`
  - `src/app/politicas/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
- SQL: ninguno.
- Cambios:
  - Todos los footers de aplicación, acceso, páginas públicas y cierre
    imprimible usan `Forwarders ERP` y
    `Freight Management Platform by Hernova Systems`.
  - El nombre y la atribución se centralizaron en constantes compartidas para
    evitar divergencias futuras.
  - Las páginas públicas conservan por separado los avisos de derechos
    reservados y región; no se alteró el contenido contractual de Políticas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido: sin errores; conserva dos advertencias preexistentes en
    `ForwardersLanding.tsx` (`AnimatePresence` y `<img>`).
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
  - Búsqueda global de footers: sin referencias restantes a `DHER Solutions`,
    `Sari Express ERP` o `Generado por Sari` dentro de footers.
- Verificación manual pendiente:
  - Revisar los footers de `/login`, `/register`, `/onboarding`, aplicación
    autenticada, landing, `/politicas` y cierre imprimible de facturación.
- Riesgos pendientes:
  - El correo se actualizó a `contacto@forwarders.app` y la identidad a
    `Inversiones A Y H S de R.L.`; siguen pendientes RTN y revisión legal.
- Commit: `d0f6923`.

### 2026-07-31 - DEMO-001 - Sandbox compartido aislado y reproducible

- Estado: Validación local completada; release bloqueado hasta aplicar las
  migraciones sólo en staging, desactivar signup y completar UAT.
- Hallazgo: DEMO-001.
- Código y configuración:
  - `next.config.ts`
  - `src/lib/demo-environment.ts`
  - `src/proxy.ts`
  - `src/components/demo/*`
  - `src/app/login/page.tsx`
  - `src/app/portal/login/page.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/app/portal/layout.tsx`
  - pantallas internas modificadas bajo `src/app/(protected)` y `src/app/portal`
  - componentes PDF modificados bajo `src/components/pdf`
- SQL:
  - `supabase/migrations/20260731190000_demo_environment_foundation.sql`
  - `supabase/migrations/20260731213000_demo_reset_and_seed.sql`
  - `supabase/migrations/20260731214000_booking_tracking_url_hardening.sql`
  - `supabase/migrations/20260731215000_demo_storage_hardening.sql`
- Operación y pruebas:
  - `scripts/demo/reset-and-seed.mjs`
  - `scripts/demo/provision-users.mjs`
  - `docs/demo-runbook.md`
  - `supabase/tests/demo_environment_foundation.sql`
  - `supabase/tests/demo_reset_and_seed.sql`
  - `supabase/tests/booking_tracking_url_hardening.sql`
  - `supabase/tests/demo_storage_hardening.sql`
- Cambios:
  - La rama Demo exige el project ref staging y el dominio
    `demo.forwarders.app` al compilar; no admite silenciosamente variables de
    producción.
  - Se agregaron expiración, grant por entrega, aceptación versionada, banner,
    noindex y marcas de agua en pantallas, impresiones HTML y PDF.
  - El reset usa allowlist sin `CASCADE`, confirmación escrita, nonce de cinco
    minutos, transacción y un dataset ficticio Atlas verificable.
  - Usuarios, configuración, CAI, catálogos maestros, identidad de perfiles,
    envíos externos, cargas de archivos y eliminaciones raíz quedan restringidos
    en la Demo.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `node --check scripts/demo/reset-and-seed.mjs`: OK.
  - `node --check scripts/demo/provision-users.mjs`: OK.
  - ESLint dirigido de configuración, gates, helpers, login, shells y nueva
    bandeja Demo: OK.
  - ESLint sobre todos los TypeScript tocados: mantiene 133 errores y 30
    advertencias preexistentes en páginas/PDF extensos; la capa Demo nueva no
    agrega errores en su ejecución dirigida.
  - Build negativo con `.env.local` de producción: rechazado como se esperaba
    por exigir ambos marcadores `demo`.
  - Build positivo con URLs staging exactas y claves placeholder modernas:
    OK, 68/68 páginas.
  - `npx supabase db reset --local`: OK desde una base limpia con las 55
    migraciones versionadas y `supabase/seed.sql`.
  - Suite SQL completa ejecutada directamente con `psql` dentro de Docker:
    23/23 archivos OK con rollback, incluidas las cuatro pruebas Demo.
  - `npx supabase db lint --local --level error`: OK, sin errores de esquema.
  - La validación detectó y corrigió el valor inválido `Courier` del paquete
    Atlas histórico por el valor permitido `Paquetería`.
  - La regresión RLS confirmó que `anon` sólo puede insertar las cuatro columnas
    públicas de `leads`; los helpers booleanos requeridos por policies públicas
    de leads/Storage son ejecutables sin exponer la tabla privada del ambiente.
  - `git diff --check`: OK; sólo avisos LF/CRLF.
  - Búsqueda de branding privado: sólo permanece `SARIHN-` en la rama
    condicional no-demo del generador de cotizaciones.
- Verificación manual/RLS pendiente:
  - Aplicar todas las migraciones en `wlssekvxpfxhwedsjhpz`, nunca en
    producción.
  - Desactivar `Allow new users to sign up` en Supabase Auth y conservar
    evidencia.
  - Repetir las cuatro pruebas SQL después de aplicar las migraciones en staging.
  - Configurar variables Preview limitadas a la rama `demo`, asociar el dominio
    y completar UAT Admin/Cliente.
  - Inspeccionar/purgar cualquier blob heredado antes de entregar credenciales.
- Riesgos pendientes:
  - `supabase test db` interpreta estas pruebas históricas como pgTAP y reporta
    `No plan found`; la evidencia autoritativa local usa `psql` con
    `ON_ERROR_STOP=1`. Convertir la suite a pgTAP queda como deuda de tooling.
  - El lint global de frontend conserva deuda histórica y no es todavía una
    puerta limpia.
- Commit base: `497a3c5`; correcciones de validación local: pendiente.

### 2026-07-31 - SEC-018 - Rotación fail-closed de cuentas Demo

- Estado: Validación SQL local completada; pendiente de rotación real en staging.
- Hallazgo: SEC-018.
- Código:
  - `scripts/demo/provision-users.mjs`
- SQL:
  - `supabase/migrations/20260731190000_demo_environment_foundation.sql`
  - `supabase/migrations/20260731213000_demo_reset_and_seed.sql`
- Pruebas:
  - `supabase/tests/demo_environment_foundation.sql`
  - `supabase/tests/demo_reset_and_seed.sql`
- Cambios:
  - Cada entrega rota un `demo_access_grant_id` común para la pareja; RLS exige
    que el grant del JWT coincida con el perfil vigente, por lo que un access
    token anterior deja de autorizar operaciones inmediatamente.
  - El RPC privado elimina las sesiones de los dos usuarios administrados del
    slot y sólo acepta la pareja exacta marcada por el aprovisionador.
  - El script desactiva primero los perfiles, mantiene Auth bloqueado durante
    la preparación, revoca sesiones y activa ambos perfiles juntos al final.
  - Ante cualquier error no imprime contraseñas e intenta dejar ambos perfiles
    inactivos y las cuentas Auth bloqueadas.
- Validaciones ejecutadas:
  - `node --check scripts/demo/provision-users.mjs`: OK.
  - `supabase/tests/demo_reset_and_seed.sql`: OK con `psql`, transacción y
    rollback; valida revocación de sesiones, nonce y dataset Atlas.
- Pendiente:
  - Ejecutar una rotación real controlada en staging, comprobando que el
    navegador anterior pierde acceso y no puede renovar sesión.
- Commit base: `497a3c5`; correcciones de validación local: pendiente.

### 2026-07-31 - SEC-019 - Storage y enlaces externos fail-closed en Demo

- Estado: Validación SQL local completada; pendiente de aplicar en staging y UAT.
- Hallazgo: SEC-019.
- Código:
  - `src/lib/external-url.ts`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - pantallas de proveedores, BL y Miami que cargaban o eliminaban archivos
- SQL:
  - `supabase/migrations/20260731214000_booking_tracking_url_hardening.sql`
  - `supabase/migrations/20260731215000_demo_storage_hardening.sql`
  - guard general de Storage en
    `supabase/migrations/20260731213000_demo_reset_and_seed.sql`
- Pruebas:
  - `supabase/tests/booking_tracking_url_hardening.sql`
  - `supabase/tests/demo_storage_hardening.sql`
- Cambios:
  - Tracking sólo admite HTTP/HTTPS sin credenciales y se deshabilita por
    completo en Demo.
  - Se eliminan políticas públicas históricas, se fijan tamaños/MIME y los
    cuatro buckets usados por la UI quedan privados en Demo.
  - Una política restrictiva bloquea toda lectura y escritura de Storage en el
    sandbox; los blobs no se borran automáticamente.
  - `anon` sólo recibe ejecución sobre los helpers booleanos que las policies
    públicas necesitan; las funciones internas continúan revocadas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido de `external-url.ts`, proxy, gates y rutas nuevas: OK.
  - `git diff --check`: OK; sólo avisos LF/CRLF.
  - Build Demo: OK, 68/68 páginas.
  - `supabase/tests/booking_tracking_url_hardening.sql`: OK con rollback.
  - `supabase/tests/demo_storage_hardening.sql`: OK con rollback; una operación
    real de carga anónima en Demo fue rechazada por RLS, no por falta de permiso
    sobre el helper de la policy.
  - Suite SQL completa: 23/23 archivos OK; `db lint --level error`: OK.
- Pendiente:
  - Probar políticas con usuarios Admin/Cliente y revisar que staging no
    contenga objetos reales heredados.
- Commit base: `497a3c5`; correcciones de validación local: pendiente.
