# CAI por oficina y tipo de documento — 28/10/2026

## Verificación de solo lectura

Producción y Prueba usan un CAI activo por combinación de **empresa, oficina y
tipo de documento**, con contador en cada rango. Activar otro CAI solo sustituye
al activo de esa misma combinación. La emisión conserva sus RPC transaccionales.

En Producción hay una fila de rango de Factura por oficina: SPS inactiva y TGU
activa. Las fichas tenían vacíos sus códigos de establecimiento/punto de emisión.
El propietario confirmó estos prefijos del SAR:

| Oficina | Establecimiento | Punto de emisión |
| --- | --- | --- |
| San Pedro Sula | 001 | 001 |
| Tegucigalpa | 000 | 001 |

Prueba tiene dos oficinas y no tiene rangos CAI registrados. Sus valores fiscales
se capturan con datos ficticios propios; no se copia configuración real de Sari.

## Corrección preparada

`20261028150000_cai_office_binding.sql` completa los códigos vacíos confirmados
de Sari únicamente si los rangos registrados todavía coinciden. Si cambiaron,
aborta para revisión. No actualiza la tabla de CAI ni documentos emitidos.

También rechaza registrar/activar/utilizar rangos de otra oficina, duplicar los
códigos de una oficina y cambiar códigos incompatibles con su historial fiscal.
La pantalla muestra el prefijo de oficina/tipo y valida antes de guardar.

La separación de series está disponible para Factura, Nota de Crédito, Nota de
Débito, Boleta de Compra, Comprobante de Retención y Guía de Remisión. Esta última
tiene configuración de rango; su interfaz de emisión sigue pendiente y no se
consume numeración al configurar el rango.

## Datos que Contabilidad debe completar

- Registrar el CAI, rango autorizado, fecha límite y próximo número real de cada
  tipo en cada oficina, conforme a su autorización. Actualmente solo hay Factura.
- Revisar qué rango de Factura corresponde activar en SPS. No se activa por
  defecto ni se modifica el estado actual de ningún CAI.
- Completar contactos/domicilio de las oficinas cuando falten antes de emitir.
- No reutilizar los datos de Factura para llenar NC/ND, boletas o retenciones.

## Validación

- Error reproducido antes del cambio: se aceptaba registrar un rango SPS en TGU.
- Suite fiscal nueva: doce series simultáneas, diez emisiones (cinco tipos por
  dos oficinas), contadores independientes, rotación aislada y NC que conserva
  la oficina de la factura original aunque se reasigne el cliente.
- Bloqueos de prefijo cruzado, oficinas duplicadas y cambios de códigos; permiso
  interno de asignación de números sin acceso autenticado directo.
- Migración completa ensayada sobre códigos vacíos y CAI ficticios: comparación
  íntegra de todas las filas CAI, incluidos siguientes números, sin cambios.
- 28 suites SQL/RLS principales y cuatro de Prueba con rollback local aprobados.
- TypeScript, lint sin regresiones y compilación aprobados en ambos árboles.
  492 pruebas Node principales, 13 dirigidas posteriores y 498 en Prueba aprobadas.
- Navegador con datos ficticios: prefijo cruzado bloqueado antes de escribir,
  oficina/tipo correctos, ceros iniciales conservados y formulario móvil sin
  desbordamiento; sin errores de ejecución.
- Paridad local: 534 archivos compartidos y 26 variantes revisadas, sin
  diferencias inesperadas. Falta aplicación remota, commit/despliegue y UAT.

Las consultas remotas realizadas para este ajuste son de solo lectura. Las
pruebas de emisión se ejecutaron únicamente en bases locales desechables.

## Corrección y retiro de CAI

El máster designado en **Contabilidad → Configuración → Usuario master de
facturación** administra los CAI de todas las oficinas. El rol Admin o
Contabilidad por sí solo permite consulta, sin estas acciones.

La pantalla ofrece iconos para agregar, editar, guardar, eliminar y consultar
historial, e interruptor para activar/desactivar. Toda acción pide motivo y
conserva una revisión para rechazar formularios obsoletos. Puede corregirse una
fecha errónea como 20/08/2017 sin activar automáticamente el CAI. Si la fecha
realmente venció, una autorización nueva se registra como otro CAI.

Un CAI usado conserva su identidad, su prefijo, su inicio, sus números utilizados y su
siguiente correlativo. La corrección no cambia los datos fiscales guardados en
facturas/boletas/retenciones anteriores. Para eliminarlo se desactiva primero:
queda retirado de uso, visible como historial y sin posibilidad de borrado físico.
El historial almacena los cambios completos; la pantalla presenta los últimos
100 movimientos con actor, motivo y fecha/hora.

## Autorización individual para apoyo entre oficinas

Decisión confirmada por el propietario: **autorizar oficinas por usuario**.
En **Contabilidad → Configuración → Autorización para emitir por oficina**, el
máster selecciona al usuario y habilita SPS, Tegucigalpa o ambas, con motivo.
Este permiso no concede administración de CAI ni cambia el rol o la oficina del
cliente. El máster tiene acceso a todas las oficinas activas.

La emisión toma la oficina del cliente (o del documento original para NC/ND).
Un colaborador de cualquier sede puede apoyarla si tiene esa oficina autorizada.
Sin autorización puede consultar/preparar borradores conforme a su rol, pero la
base rechaza la emisión, revirtiendo también el consumo de correlativos.
Boletas y retenciones también verifican la oficina fiscal seleccionada.

**Paso requerido al publicar:** aplicar `20261028160000` y `20261028170000`
después de las migraciones previas, y configurar permisos de los usuarios
existentes antes de reanudar su emisión. No se inventan asignaciones ni se
habilitan ambas oficinas automáticamente. No se han aplicado estas migraciones.
Verificar la designación del máster en cada ambiente: conservar la cuenta
autorizada en Producción y utilizar una cuenta ficticia propia en Pruebas.

UAT: con máster, corregir un CAI ficticio vencido, verificar historial y alternar
estado. Con usuario sin máster, comprobar consulta y bloqueo de edición. Autorizar
solo SPS y comprobar rechazo para cliente TGU sin consumo; después autorizar TGU
y emitir para ambos clientes conservando cada serie/encabezado. Revocar TGU y
comprobar bloqueo inmediato. Revisar que los PDF históricos permanezcan iguales.

Validación local del ciclo/permisos: 29 suites SQL/RLS principales y cinco de
Pruebas aprobadas con rollback; 499 pruebas Node principales y 505 de Pruebas,
más seis dirigidas posteriores. TypeScript, lint sin regresiones y compilación
aprobados en ambos árboles. Seis verificaciones de navegador con datos ficticios
incluyen edición del vencido de 2017, toggle, retiro/historial, consulta sin máster,
autorización de ambas oficinas y ancho móvil de 390 px. Paridad: 538 archivos
compartidos y 26 variantes revisadas, sin diferencias inesperadas. Esta evidencia
local no sustituye la aplicación remota ni el UAT con las cuentas de Contabilidad.
