# Borradores y correcciones de facturas

Estado: implementación local validada. Migración, publicación, designación master
y aceptación con sesiones reales pendientes.

## Preparación antes de publicar

1. Aplicar únicamente `20261028100000_invoice_drafts_and_master_review.sql` tras
   verificar historial, entorno, permisos y datos. Publicar frontend después.
2. Con un Admin aprobado de la empresa, abrir Configuración contable → Usuario
   master de facturación. Seleccionar la cuenta indicada por el solicitante,
   comprobar correo/rol/empresa, indicar motivo y confirmar. Es una designación
   individual, no un nuevo permiso general del rol Contabilidad o Admin.
3. La cuenta indicada se comprobó en Production con consulta de solo lectura:
   existe una sola, está aprobada/activa, tiene rol Contabilidad y pertenece a Sari.
   Su identidad y correo se mantienen en evidencia local privada.

## Borrador antes del CAI

1. Nueva factura → ingresar una descripción sin cliente, importe o respaldo
   definitivo → Guardar borrador. Confirmar que sigue en Borradores y correcciones
   y que no se consumió correlativo ni aparece saldo contable/cuenta por cobrar.
2. Abrir Continuar y comprobar valores vacíos, descuentos, impuestos, moneda,
   equivalencia, documentos adjuntos y cuenta de ingreso.
3. Completar información y confirmar Emitir factura. Debe asignar un único número
   y quedar Aprobada, con su saldo. Si la validación o contabilización falla, debe
   conservar el borrador y no consumir CAI. La contabilidad automática conserva
   la configuración existente.
4. Reintentar una respuesta perdida y probar doble clic: una sola factura. Cambiar
   de usuario mientras guarda: no mostrar datos ni navegación de la sesión anterior.

## Corrección de un documento numerado

1. Desde el detalle, Preparar corrección. Revisar cliente, servicios, cantidades,
   precios, ISV, moneda, tasa y notas. Para corregir nombre/RTN/domicilio, revisar
   el perfil del cliente; el original conserva su snapshot.
2. Guardar la propuesta y Solicitar aprobación master con motivo. Un usuario
   financiero común puede prepararla, pero no aprobar ni emitir la sustituta.
3. Con la cuenta master, comparar formulario e importe original, revisar líneas y
   confirmar decisión con motivo. Rechazar conserva el original. Editar después
   de aprobar exige guardar y volver a solicitar aprobación.
4. Contabilidad debe solicitar/aprobar la anulación del original y confirmar su
   custodia. Pagos y notas activos deben resolverse por su flujo habitual; se
   mantienen los bloqueos de períodos contables y los reversos ya existentes.
5. El master confirma Emitir corrección aprobada. Obtiene un correlativo nuevo,
   original Anulada sin alterar contenido y vínculos de navegación en ambos
   documentos. El PDF sustituto muestra número/CAI originales como referencia.
6. Cambiar RTN/domicilio/oficina de cliente o datos de emisor después de aprobar,
   o cambiar/revocar el master: debe requerir nueva revisión antes de emitir.
   Una tarifa de cotización cambiada debe recargarse y guardarse nuevamente.

## Criterio de conservación

El SAR indica consignar anulación y custodiar original/copia ante errores de
llenado, según artículo 41 del Acuerdo 481-2017. El sistema conserva el documento
emitido y tramita su sustitución, con aprobación y bitácora.
[Criterio del SAR](https://www.sar.gob.hn/helpie_faq/que-hacer-en-caso-de-emitir-un-documento-fiscal-con-errores-en-el-llenado/).

Los documentos históricos que ya tienen número, aunque su estado comercial sea
Borrador, mantienen ese número. No se reciclan correlativos ni se transforman en
borradores preparatorios. Para ajustes sobre operaciones ya consumadas deben
evaluarse también las notas de crédito/débito con Contabilidad.

## Evidencia local

- 473/473 pruebas de aplicación; regresión nueva de PDF sustituto verificada
  después con los cinco casos de la plantilla.
- 26 suites SQL/RLS en base desechable, con migración y datos revertidos.
- Seis grupos de navegador con datos ficticios, escritorio/móvil, sin excepciones.
- TypeScript, build de 103 páginas y lint sin regresiones.

Estas comprobaciones no sustituyen la aceptación con datos y sesiones reales.
