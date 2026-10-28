# Anulaciones aprobadas y proformas — 27/10/2026

Registro del hallazgo `FIN-VOID-01`. Publicación autorizada por el usuario.
Commit funcional: `0dff3abf39cc4557087c8cfbbd02be7d6c011632` (24 archivos).
La migración y el frontend están publicados y verificados en Production.
CI de aplicación y pruebas SQL/RLS desde el historial completo están aprobados.

## Comportamiento

En el detalle del documento, **Solicitar anulación** registra el motivo sin
cambiar su estado ni saldo. Admin, Finanzas y Contabilidad pueden solicitar.
Solo una cuenta de Contabilidad aprobada, activa y de la misma empresa puede
aprobar o rechazar, con motivo de decisión y confirmación de custodia de
original/copia cuando corresponda. No se exige una segunda persona diferente
del solicitante si quien resuelve ya tiene ese rol.

La aprobación conserva documento, CAI, número, conceptos, importes y snapshots.
Registra solicitante, aprobador, fechas, motivos y partida/reverso asociados.
No recicla el correlativo y no permite anulación directa, ocultar, eliminar,
reactivar o modificar un documento anulado. Tampoco permite saltarse la
aprobación cancelando la AP de una boleta o reversando una retención.

Aplica a facturas, notas de crédito/débito, compras/boletas y retenciones ya
implementadas. Las proformas se identifican como comerciales sin CAI.
Las solicitudes se consultan desde **Facturación → Anulaciones** y desde la
navegación contable; fechas, estado y búsqueda filtran el registro completo,
exportable a PDF/Excel. Las decisiones anteriores al nuevo flujo no se inventan:
los documentos históricos conservan su estado y muestran que no hay solicitud
registrada cuando corresponda.

## Contabilidad y criterio fiscal

Si existía una partida, se crea su reverso aunque la contabilización automática
esté apagada. Un período cerrado o un pago/nota activo que impida anular deja
sin efecto toda la aprobación. Si no había partida, el registro indica
**Sin asiento previo**; no presenta un asiento inexistente ni crea uno de importe
cero. No se activan cuentas, aperturas o automatización como efecto del cambio.

El [texto consolidado del Reglamento 481-2017 publicado por el SAR](https://www.sar.gob.hn/download/texto-consolidado-reglamento-del-regimen-de-facturacion-otros-documentos-fiscales-y-registro-fiscal-de-imprentas-contenido-en-el-acuerdo-481-2017-segun-acuerdos-609-2017-725-2018-y-817-2018/),
artículo 41, establece la identificación de los documentos erróneos como
anulados y su custodia cronológica, incluidos original y copia. La definición
de nota de crédito del artículo 4.32 distingue ajustes posteriores a una venta.
Estas disposiciones no se interpretan como obligación de inventar una nueva
partida por todo documento sin asiento previo. La aprobación solicita confirmar
un error de emisión; las devoluciones/ajustes posteriores se evalúan con una
nota de crédito vinculada. No hay notificación automática al SAR ni se sustituye
la revisión de Contabilidad sobre declaraciones y respaldos.

## Proformas

La creación y conversión ya existían. Se agregó **Nueva proforma** en Facturación,
que abre el formulario con ese tipo seleccionado. Conserva numeración propia
sin consumir CAI, PDF claramente comercial, anticipos y conversión idempotente a
factura final con el CAI de la oficina del cliente. Una proforma convertida
conserva su historial y no puede anularse para alterar la factura final.

## Validación y límites

- 450 pruebas Node, TypeScript y build aprobados; 101 páginas generadas.
- Lint: 467 archivos, 223 diagnósticos históricos, cero regresiones.
- 25 suites SQL/RLS en la copia desechable; acceso por rol y empresa, pagos,
  notas, períodos cerrados, snapshots modificados, boletas y retenciones.
- Migración canónica recreada y comprobada en una transacción revertida;
  dos solicitudes/aprobaciones simultáneas generan una solicitud/decisión y
  un solo reverso. Los fixtures se limpiaron solo en la copia desechable.
- Chrome real con servicios ficticios locales: solicitud mantiene estado,
  Admin no aprueba, Contabilidad confirma motivo/custodia, modal móvil dentro
  del viewport y registro filtrable con controles de PDF/Excel.
- Render PDF real de anulación con motivo, fecha, CAI e importes conservados;
  proforma con indicación de que no sustituye al documento fiscal final.
- Falta UAT autenticado de Contabilidad en la empresa tras la publicación.
  Las pruebas locales y el futuro smoke HTTP no equivalen a esa aceptación.

SQL nuevo: `supabase/migrations/20261027230000_fiscal_void_approval.sql`.
Evidencia local ignorada por Git: `.ua/intermediate/fiscal-void-validation/`
y `.ua/intermediate/fiscal-void-release-20261027/`. Los PDF originales y las
capturas/fixtures de navegador no se publican.

## Migración y postflight

Se aplicó únicamente `20261027230000` antes del frontend al proyecto verificado
`fwspgdzvlbtbgiupvrzo`, en Production, mediante una transacción que registra la
fuente exacta del commit y comprueba las huellas de 39 tablas antes/después.
No se cambiaron datos de negocio, autorización previa o configuración contable
como efecto de la migración. La tabla nueva tiene RLS; las tres guardas están
activas; no hay escritura directa de solicitudes desde cliente ni ejecución
anónima de la decisión o ejecución pública del helper interno.

Entre el preflight de las 21:59 UTC y el postflight de las 22:02 UTC hubo una
actualización de cliente por Admin, registrada a las 21:59:24 UTC. Explica la
diferencia de huellas de clientes/historial; las otras 37 tablas coincidieron.
La comprobación transaccional no detectó cambios producidos por la migración y
se preservó esa actividad del usuario. No se sobrescribió ni revirtió esa edición.

SQL de solo lectura con claims existentes confirmó Contabilidad autorizada,
Admin sin aprobación y plataforma sin aprobación/tenant/datos de empresas.
Es una verificación de autorización; no es una sesión autenticada de navegador.

## Frontend y comprobaciones públicas

Vercel funcional `D6YV1dNZ1ttbpHAgoM3GevV7iZZH`, exitoso, asociado al SHA
funcional exacto; GitHub Deployment `7371595468`. Instancia:
`https://sarierp-jl6xzkk66-claudherhn-5641s-projects.vercel.app`.
Build `i1faWhB4fmzV_3rUJiCB7`.

Smoke HTTP sin sesión: 21 rutas/recursos aprobados, incluidas las rutas de
Anulaciones y Nueva proforma, login, protección financiera y rechazo de
plataforma desde el dominio Sari. Mismo manifiesto en `forwarders.app`,
`sari.forwarders.app` y la instancia inmutable.

[Quality CI 40592010935](https://github.com/dhernandezp123/sarierp/actions/runs/40592010935):
aplicación y suites SQL/RLS aprobadas desde el historial completo de migraciones.
