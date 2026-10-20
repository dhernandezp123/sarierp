# Servicio de Aduanas — aceptación

Publicado y habilitado en Production el 20/10/2026. Las comprobaciones
automáticas y el despliegue están registrados en
[la publicación](../release/customs-service-2026-10-20.md); el recorrido
autenticado de este documento permanece pendiente.

## Comportamiento

El producto `customs_only`, visible como **Servicio de Aduanas**, cotiza honorarios
propios y entrega final opcional. No usa tarifas de agente, contenedores,
dimensiones obligatorias, Incoterm, flete internacional, booking ni BL.

Ventas puede guardar un borrador o crear la propuesta en `Pricing Aprobado`.
El estado conserva el vocabulario vigente del ERP; no requiere pasar por el
comparativo de agentes. Un borrador se aprueba desde su editor. Luego se envía
al cliente y se registra `Ganada` o `Perdida` mediante las transiciones existentes.

Los cargos usan costo externo, venta e ISV; una tasa guardada de cero se conserva.
Los impuestos aduaneros no se calculan automáticamente. Ventas debe describir su
inclusión o exclusión en las condiciones comerciales. Las notas internas de
rentabilidad no aparecen en el PDF; un margen inferior al 5% exige justificación.

Una venta ganada crea el expediente canónico SI/shipment. Para este producto
se presenta un panel de servicio: `Pendiente Validación → En gestión aduanera
→ Liberado → Finalizado`, o `→ Entregado → Finalizado` cuando hay entrega
contratada. Cada avance requiere una referencia o evidencia escrita, registra
usuario/historial y verifica la versión del expediente. Operaciones se asigna
al comenzar la gestión; otro operativo no puede avanzar un expediente asignado.
Se conserva el permiso de Administración para actuar sobre el expediente.

El cierre alimenta la validación financiera existente. Finanzas confirma
expresamente costo externo cero de los honorarios propios; no se crea una
factura ficticia de Sari Express. Entrega final, gastos adicionales y honorarios
con costo externo positivo conservan la conciliación con facturas de proveedor.

Repricing conserva motivo, revisión, auditoría y retorno a venta ganada. Si se
elige sincronizar, actualiza el cliente y las direcciones pendientes sin exigir
agente ni modificar bookings; conserva referencias de etapas ya ejecutadas y
excluye expedientes cerrados. No se reclasifican cotizaciones existentes entre
aduanas y transporte: se crea otra cotización para evitar arrastrar tarifas o
documentos ajenos al servicio.

## Orden de publicación

1. Aplicar únicamente la migración nueva
   `20261020120000_customs_only_service.sql` mediante el proceso autorizado.
   Se valida sobre las migraciones canónicas vigentes; no aplicar Outlook en
   standby como parte de este cambio.
2. Publicar el frontend correspondiente. El SQL debe estar disponible antes de
   utilizar el producto. El catálogo se siembra para los tenants existentes.
   Durante la publicación autorizada del 20/10/2026, la opción se mantiene
   temporalmente inactiva hasta comprobar Vercel Production; después se habilita.
3. Realizar las comprobaciones siguientes con usuarios autorizados de la empresa.

## Recorrido manual

1. **Ventas:** crear una cotización con Servicio de Aduanas. Confirmar que no se
   piden Incoterm, contenedores ni medidas. Ingresar aduana, mercancía, vigencia,
   honorarios y condiciones. Guardar borrador, abrirlo y aprobarlo.
2. **Entrega:** activar entrega final y comprobar que no se aprueba sin dirección
   y precio. Desactivarla elimina ese cargo y su dirección. Revisar importes,
   ISV y PDF antes de enviar la propuesta.
3. **Errores:** provocar un fallo controlado de red en un entorno de pruebas;
   los campos deben conservarse y permitir reintentar. No simular fallos mediante
   solicitudes comerciales o correos enviados a producción.
4. **PDF y correo:** verificar nombre, contacto, aduana, mercancía, entrega,
   vigencia, honorarios e ISV. No deben aparecer notas internas, proveedor,
   costos ni campos ficticios de transporte. El correo conserva el total comercial.
5. **Operaciones:** marcar como ganada y crear el expediente. Avanzar con
   referencias documentales reales. Confirmar que la entrega contratada impide
   saltar de Liberado a Finalizado y que no se ofrece crear booking/BL. Verificar
   rechazo de una pantalla obsoleta o de otro operativo asignado.
6. **Finanzas:** comprobar que no se valida con una operación abierta. Tras
   cerrar, confirmar honorarios de costo externo cero; la entrega y los demás
   cargos deben tener costos conciliados. Comprobar llegada a Por facturar y
   emisión de una factura mediante los controles fiscales existentes.
7. **Repricing y portal:** probar el ajuste de una venta ganada con sincronización,
   revisar la auditoría, el cliente y las direcciones; comprobar el estado del
   servicio desde el portal del cliente y su etiqueta en reportes.
8. **Regresión:** crear una propuesta Miami y una FCL. Miami mantiene su cálculo;
   FCL sigue usando líneas multicontenedor y tarifa de agente. Comprobar que otro
   tenant y roles de lectura no pueden modificar el servicio.

## Cobertura local

Las pruebas Node ejercitan cargos, impuestos, hidratación, márgenes, permisos,
cierre y PDF real. La suite SQL usa fixtures ficticios y rollback en PostgreSQL
aislado: creación, edición, aprobación, venta, expediente, repricing, controles
de versión/tenant/rol, entrega y validación financiera. La prueba de navegador
usa los componentes reales con un proveedor simulado; no certifica UAT
autenticado ni el despliegue en Production.
