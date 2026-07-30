# UAT Fase 5C — Cut-offs, VGM y readiness previo al embarque

Estado: pendiente de ejecución autenticada sobre datos representativos.

## Precondiciones

- Fases 4A, 4B, 4C, 5A, 5B y 5C aplicadas en un ambiente aislado.
- Usuarios Admin, Operaciones y Cliente aprobados.
- Un shipment y booking activo por modalidad: FCL, LCL, aéreo y terrestre.
- Para FCL, cada contenedor físico debe ser una fila de
  `booking_containers`; una fila con cantidad mayor a uno no permite certificar
  el VGM de cada unidad.
- Conservar evidencia previa de booking, estado, `updated_at`, contenedores,
  documentos, BL, cut-offs, VGM y revisiones.

## Caso 1 — Clasificación y checklist por modalidad

1. Abrir cada booking en el detalle canónico.
2. Confirmar que FCL exige contenedores y VGM por unidad.
3. Confirmar que LCL y aéreo exigen carga recibida, documentos e itinerario,
   sin exigir VGM ni contenedor.
4. Confirmar que terrestre no exige vessel, voyage, VGM ni cut-offs marítimos.
5. Verificar que un requisito no aplicable no aparezca como bloqueador.

Resultado: pendiente.

## Caso 2 — Cut-offs y zona horaria

1. Como Operaciones, registrar cut-offs documental, SI, VGM, puerto y carga
   con fecha/hora, zona horaria IANA y fuente.
2. Confirmar fecha local, zona horaria, tiempo restante y fuente en UI.
3. Intentar una zona horaria inválida: debe rechazarse.
4. Corregir un cut-off con motivo; el anterior debe quedar versionado y no
   borrado.
5. Marcar un cut-off cumplido y verificar evento/timeline.
6. Vencer un cut-off: debe bloquear readiness y generar alerta.
7. Como Admin, autorizar una excepción con motivo; debe quedar visible en el
   timeline interno y permitir reevaluar.
8. Confirmar que el portal solo muestre cut-offs marcados para cliente.

Resultado: pendiente.

## Caso 3 — VGM por contenedor FCL

1. Capturar un VGM en borrador con masa positiva, unidad KG o LB, método,
   responsable y documento.
2. Verificar, enviar y aceptar el VGM; confirmar cada transición en timeline.
3. Rechazar otro VGM con motivo y confirmar que bloquee readiness.
4. Corregirlo: debe crear una nueva versión y conservar el historial.
5. Confirmar que el VGM de un contenedor no satisface el de otro.
6. Intentar eliminar o editar historia certificada directamente: debe fallar.
7. Confirmar que el portal solo exponga conteos/estado permitido, no aprobadores
   ni comentarios internos.

Resultado: pendiente.

## Caso 4 — Bloqueo transaccional de Listo para Embarque

1. Dejar un FCL sin VGM, con documento faltante o cut-off vencido.
2. Intentar pasar a `Listo para Embarque`.
3. Confirmar que el estado no cambie y que el modal enumere requisitos,
   cut-offs y contenedores concretos.
4. Verificar evento `READINESS_BLOCKED` y alerta.
5. Completar la evidencia y reintentar.
6. Confirmar transición y snapshot inmutable de la evaluación aprobada.
7. Modificar luego una evidencia relevante y confirmar que una nueva
   evaluación refleje el cambio sin alterar el snapshot anterior.

Resultado: pendiente.

## Caso 5 — Bloqueo de Embarcado

1. Preparar un booking completo y llevarlo a `Listo para Embarque`.
2. Invalidar una condición posterior o dejar pendiente el requisito de salida.
3. Intentar pasar a `Embarcado`: debe permanecer sin cambio.
4. Completar la evidencia de salida y reintentar.
5. Confirmar que la transición, evento y snapshot sean atómicos.

Resultado: pendiente.

## Caso 6 — Rollover y reemplazo

1. Registrar cut-offs y VGM en un FCL y ejecutar rollover del mismo booking.
2. Proveer los cut-offs revisados.
3. Confirmar versiones nuevas, preservación de VGM del mismo contenedor e
   invalidación de requisitos dependientes de itinerario.
4. Reemplazar formalmente otro booking.
5. Confirmar que el nuevo booking tenga checklist independiente y no herede
   cut-offs, VGM, excepciones ni snapshots.
6. Intentar mover automáticamente contenedores con evidencia 5C: debe
   bloquearse.

Resultado: pendiente.

## Caso 7 — Seguridad y concurrencia

1. Como Cliente, intentar crear/editar cut-offs, VGM, excepciones o
   evaluaciones: debe fallar.
2. Como Operaciones, intentar autorizar una excepción administrativa: debe
   fallar.
3. En dos sesiones, corregir simultáneamente el mismo cut-off/VGM; solo una
   versión activa debe sobrevivir.
4. Confirmar que las tablas históricas no permiten `DELETE`.
5. Validar que el portal no permita inferir otro cliente cambiando UUID.

Resultado: pendiente.

## Caso 8 — Alertas, dashboard y reportes

1. Crear un booking bloqueado, un cut-off próximo, uno vencido y un VGM
   rechazado.
2. Confirmar KPIs de bookings no listos y cut-offs vencidos.
3. Confirmar alertas con severidad y enlaces al booking.
4. Abrir el reporte de readiness y el de VGM por contenedor.
5. Exportar CSV/PDF y conciliar los conteos con el detalle canónico.

Resultado: pendiente.

## Aprobación

- Operaciones: pendiente.
- Admin: pendiente.
- Cliente/Portal: pendiente.
- Seguridad/RLS: pendiente.
- Reportes: pendiente.
- Evidencia adjunta: pendiente.

No declarar Fase 5C aprobada ni aplicar SQL remoto hasta completar esta matriz
sobre una copia representativa y reconciliar los diagnósticos.
