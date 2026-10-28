# AUD-06 — Asignación única y transaccional de paquetes Miami

Estado: implementado y validado en la base/API local aislada. Abierto para
publicación y UAT autenticado del ambiente destino. Fecha: 14/10/2026.

## Cambio de comportamiento

El manifiesto ya no pide un WH y luego actualiza el paquete por ID. La RPC
`assign_miami_package` bloquea manifiesto → paquete, comprueba que siga disponible
y pertenezca al manifiesto/tenant esperado, valida el cliente y reserva el WH.
Paquete, actor/fecha, evento de asignación, actividad y avisos del portal se
guardan en una transacción. Un error revierte también la reserva del número.

Dos operadores que intentan asignar el mismo paquete reciben un único resultado
confirmado y un conflicto HTTP 409/PT409. Incluso repetir el mismo cliente exige
actualizar la lista; no duplica el WH, el evento ni el aviso. La pantalla conserva
el WH devuelto por el servidor y no solicita correo ante una respuesta fallida o
incompleta. Bloquea el doble clic y cancela el aviso pendiente al desmontarse o
cambiar su contexto. Una lista fallida muestra error/reintento, sin paquetes
parciales. Las lecturas del manifiesto completan todas sus páginas.

`receive_miami_package` reúne ingreso y asignación opcional. Si hay cliente
explícito, prevalece ese cliente; una prealerta ajena a esa elección permanece
pendiente. Si no hay cliente, la autoasignación toma una prealerta pendiente del
tenant, con cliente no eliminado y tracking equivalente. El trigger corre después
de insertar el paquete: el anterior intentaba referenciarlo antes de existir y
fallaba por FK. La RPC relee el estado final antes de responder. Dos ingresos
pueden crear dos paquetes con el mismo tracking, como permitía el ingreso manual;
solo uno consume la prealerta, el otro queda sin asignar. No se añadió unicidad
global de tracking ni idempotencia de ingreso por tracking.

Los avisos del portal se crean desde servidor para los perfiles Cliente activos
y aprobados de ese cliente/tenant. Operaciones ya no depende de una lectura de
perfiles Cliente ni de una inserción de aviso que su RLS no autoriza. El correo
externo sigue siendo posterior al commit, con el endpoint/idempotencia existentes.
Si falla, se informa que la asignación sí fue guardada. Esta etapa no cambia la
verificación del ambiente de correo; ese hallazgo corresponde a AUD-07.

## Reglas preservadas y límites

| Caso | Resultado |
| --- | --- |
| Admin/Operaciones aprobado, activo y del tenant | Puede ingresar/asignar |
| Otro rol, perfil pendiente/inactivo o recurso de otro tenant | Denegado; sin cambios/avisos |
| Sin asignar, en Recibido en Miami, sin WH/actor/fecha/despacho | Asignación inicial disponible |
| Paquete ya asignado, procesado, movido de manifiesto o vinculado a despacho | Conflicto; actualizar lista |
| Manifiesto cerrado con paquetes todavía disponibles | Permite asignar; el cierre termina el escaneo, como antes |
| Cliente eliminado o de otro tenant | Denegado antes de reservar WH |
| Escritura directa de cliente/WH/actor/fecha o nueva asignación desde authenticated | Denegada, incluso para Admin |
| Evento de asignación insertado/modificado/borrado desde authenticated | Denegado |
| Borrado directo de paquete con cliente/WH | Denegado; RPC de borrado existente conserva sus reglas |

No se reemplazan las RPC de escaneo, eliminación, rack, avance/reversión de carga
o despacho. `assignment` identifica el nuevo evento; no se inventa historial para
asignaciones anteriores. No se abre escritura ni corrección para Cliente/Finanzas/
Ventas/Pricing. Las correcciones de una asignación confirmada son distintas de una
segunda asignación accidental y requieren el proceso administrativo siguiente.

## Publicación y regularización administrativa

Aplicar `20261014130000_atomic_miami_package_assignment.sql`, después de las
migraciones anteriores del repositorio, y publicar las pantallas Ingreso y
Manifiesto juntas. Recargar pestañas antiguas: sus UPDATE de asignación quedarán
bloqueados. El worktree depende también del SQL AUD-01/02/03/05 pendiente del
ambiente destino. No se aplicó SQL ni se publicó el frontend remoto.

Antes de publicar, Administración debe identificar paquetes incoherentes:

```sql
select tenant_id, id, tracking_number, status, cliente_id, warehouse_number,
       assigned_at, assigned_by, cargo_status, manifest_id
from public.miami_packages
where (status = 'Sin asignar' and
       (cliente_id is not null or warehouse_number is not null or
        assigned_at is not null or assigned_by is not null))
   or (status = 'Asignado' and
       (cliente_id is null or warehouse_number is null or
        assigned_at is null or assigned_by is null));
```

Un legado Sin asignar con cliente precargado, sin WH/actor/fecha y todavía recibido
puede completarse solamente para ese mismo cliente por la RPC. Los demás casos
exigen revisión; no se corrigen automáticamente ni reciben historial ficticio.

Una corrección de cliente confirmado no está disponible por el botón Asignar.
Debe hacerse mediante mantenimiento administrativo revisado, con motivo, actor,
tenant, cliente/WH actuales esperados y bloqueo de las filas. Conservar el WH y el
estado confirmado; no resetear a Sin asignar para eludir el conflicto. Registrar
valores anteriores/nuevos en evento y actividad dentro de la transacción. Antes
de corregir, reconciliar prealerta, documentación/Storage, despachos y avisos ya
creados o enviados. Un correo enviado no se deshace al cambiar una fila. Este
procedimiento requiere autorización y validación específicas sobre el registro;
AUD-06 no publica una herramienta general de reasignación ni ejecutó correcciones
administrativas sobre paquetes existentes.

La idempotencia existente del correo permite reintentar desde Inventario si el
commit terminó pero falló el aviso. Ante una respuesta de ingreso perdida, revisar
Inventario antes de reenviar: el ingreso manual no tiene clave idempotente nueva.
Los correos de solicitudes descartadas no se inician por estas pantallas; un
cierre de pestaña después del commit puede dejar el correo pendiente de reintento.

## Validaciones realizadas

- Reproducción previa con dos identidades y rollback: la segunda sobrescribió
  cliente/WH, sin evento. Reproducción del trigger previo de prealertas: FK 23503
  al referenciar el paquete en BEFORE INSERT; su restauración de prueba se revirtió.
- SQL de asignación/ingreso/prealerta/escaneo aprobado: roles, perfil activo,
  tenant, cliente eliminado, manifiesto esperado/cerrado, carga procesada, ACL
  del core privado, RLS real del portal y rollback por evento/aviso fallidos.
  Se comprobó que el contador WH y los datos vuelven al valor anterior.
- Cuatro carreras reales entre dos conexiones: clientes distintos, mismo cliente,
  asignación contra borrado del manifiesto y dos ingresos con una prealerta. Las
  tres primeras verifican espera real por lock; la cuarta verifica SKIP LOCKED.
- PostgREST local autenticado: UPDATE directo 403/42501; asignación 200 con objeto
  y actor/WH completos; repetición 409/PT409; un evento y un aviso visible para
  el cliente; ingreso devuelve el estado autoasignado después del trigger.
- Nueve pruebas Node nuevas: cuatro de contrato y cinco de componentes reales
  con hooks/red simulados. Incluyen conflicto sin correo/éxito, doble clic,
  fallo de correo después del commit, desmontaje y conservación del tracking
  ante fallo. Suite completa: 242/242, TypeScript y build (82 páginas) aprobados.
- Helper, test y script nuevo con lint limpio. Pantallas conservan 7 errores y
  0 warnings previos, frente a 10/2 antes, sin infracciones nuevas por archivo/regla.
- `db lint` no reporta errores AUD-06. Conserva el diagnóstico estático previo
  de `mail_intake_is_demo` sobre un helper opcional, protegido por `to_regprocedure`.

Base usada: `sarierp_aud01`, 114 migraciones. SQL de flujo con rollback; API y
concurrencia dejaron fixtures ficticios en el volumen aislado. Sin modificaciones
del stack principal, SQL remoto, correos, pagos, OCR externo ni despachos reales.

## UAT pendiente

1. Dos operadores asignan el mismo paquete a clientes distintos: uno confirma;
   el otro recibe conflicto, ve el resultado actualizado y no inicia aviso.
2. Repetir clic/reintento al mismo cliente; comprobar un WH/evento/aviso por perfil.
3. Ingreso sin cliente, con cliente explícito y con prealerta; comprobar retorno
   persistido, medidas, actor y visibilidad correcta del portal.
4. Dos ingresos sobre una prealerta y escaneo de manifiesto con autoasignación.
5. Cambiar de manifiesto/usuario o cerrar la vista durante asignación; descartar
   respuestas anteriores y no iniciar correo desde la vista que ya no está activa.
6. Fallo de evento/aviso en staging y fallo de correo interceptado: distinguir
   rollback de asignación de un correo pendiente después del commit.
7. Permisos/RLS reales del ambiente destino, perfiles múltiples de cliente,
   manifiesto cerrado, paquetes procesados/despachados e intentos vía API directa.
8. Regularización del legado incoherente, consumidores externos que escriban
   asignaciones directamente y revisión visual/móvil/teclado de los formularios.

No hubo navegador conectado. Lecturas completas del manifiesto aumentan red y
memoria respecto del límite implícito anterior; medir volúmenes reales. La tarea
cubre asignación y sus dos entradas; no centraliza toda edición de paquetes Miami.
