# Notas internas por tarifa FCL / LCL — PNOTE-01

## Estado y publicación

Frontend y SQL publicados en Production el 21/10/2026. Migración aplicada:
`supabase/migrations/20261021120000_agent_quote_internal_notes.sql`.
No requiere rellenar tarifas históricas:
`agent_quotes.internal_notes` es nullable. No se modifican permisos ni RLS.

Las notas pertenecen a la tarifa del agente. Son independientes de las notas
internas de Ventas (`quotations.pricing_notes`) y de las condiciones del cliente
(`client_notes`). Las notas por tarifa se excluyen del PDF comercial y portal;
sí se incluyen en la impresión interna de costos de agentes FCL.

## Aceptación autenticada

Usar cotizaciones de prueba del ambiente designado, con roles reales aprobados
y activos. No enviar correos ni propuestas a clientes para esta validación.

1. Como Pricing/Admin, abrir una cotización FCL en **Pendiente de Fijar Precios**.
   Ingresar una tarifa con notas y otra sin notas. Recargar y verificar cada una.
2. Repetir en LCL. Las notas de una opción no deben aparecer en otra ni pasar a
   otra cotización. Verificar una tarifa histórica sin notas.
3. Agregar o editar notas desde la tarjeta de una tarifa seleccionada. Confirmar
   que costos, precios de venta, selección, cargos, opciones comerciales y estado
   permanecen iguales. No debe pedir motivo de repricing ni aplicar costos.
4. Cambiar entre tarjetas y tabla FCL; editar desde la tabla, recargar y confirmar
   persistencia. La impresión interna debe incluir notas y omitir botones.
5. Editar una tarifa no seleccionada desde el formulario completo; comprobar
   precarga y conservación de sus notas junto con los datos de la tarifa.
6. Vaciar la nota y guardar: debe mostrar **Sin notas internas**. Cancelar o
   cerrar por Escape conserva el valor guardado y devuelve el foco al botón.
7. Interrumpir la solicitud al guardar notas. Debe mostrar error, mantener el
   texto del modal y permitir reintentar. Revisar teclado y ancho móvil de 390 px.
8. Como Ventas, verificar lectura sin edición. Como Cliente y usuario de otra
   empresa, comprobar que no pueden leer estas tarifas/notas. Las cotizaciones
   aprobadas, enviadas, ganadas y perdidas mantienen sus notas en solo lectura.
9. Descargar PDF FCL/LCL con una marca reconocible en las notas de tarifa:
   esa marca debe estar ausente y `client_notes` debe seguir apareciendo.

Registrar fecha, ambiente, usuario/rol, resultado y evidencia sin datos sensibles.
La validación con proveedor simulado y las suites SQL locales no sustituyen esta
aceptación con sesiones reales.
