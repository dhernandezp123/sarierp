# AUD-11 — Incidencia y estado del paquete en una transacción

Estado: implementado y validado localmente; abierto para SQL/publicación,
revisión de casos legacy y UAT del destino. Fecha: 14/10/2026.

## Contrato

La RPC pública `report_miami_incident` exige sesión de Cliente aprobada/activa,
perfil coincidente con el usuario esperado, tenant y cliente vinculados. Deriva
actor/tenant/cliente desde la sesión, no desde campos editables del formulario.
El usuario esperado es una precondición: debe coincidir con auth.uid y no concede
privilegios ni permite suplantación. El core interno no está expuesto.

La RPC bloquea el paquete, comprueba propiedad/tenant y que el cliente no esté
eliminado. Guarda juntos incidencia Abierta, estado Con incidencia, evento
incident_reported y actividad. Un fallo de cualquier escritura revierte todo.
No cambia WH, asignación, estado de transporte, documentos, envíos ni importes.
No manda correos ni llama a proveedores externos.

| Situación | Resultado |
| --- | --- |
| Paquete propio asignado/disponible y sin caso activo | Nueva incidencia y cambio de estado confirmados juntos |
| Repetición del mismo actor/clave y mismos datos | Devuelve la incidencia original; sin más casos ni trazas |
| Misma clave reutilizada para otros datos o paquete | Rechaza la solicitud |
| Otro caso Abierta/En revisión, incluso legacy u otra cuenta del mismo cliente | Conflicto PT409 y enlace a Incidencias; no sobrescribe el reporte existente |
| Paquete/cliente/tenant ajenos, cliente eliminado o sesión inválida | Rechazo sin escrituras |
| Paquete Entregado, también por cargo_status | Mantiene contacto con el equipo; no crea un caso nuevo ni cambia la entrega |
| Recuperación de un reporte ya confirmado, cerrado o entregado después | Devuelve el caso original sin reabrirlo ni cambiar el paquete |

La regla de una incidencia activa ya estaba representada por el botón del detalle
del paquete; ahora se comprueba en servidor bajo lock. No se establece una nueva
política de reclamaciones tras entrega. Tampoco se crea un flujo nuevo de cierre,
resolución o reapertura: Administración/Operaciones conservan la gestión existente
de estado/resolución. Cerrar una incidencia no restablece automáticamente el estado
del paquete; esa decisión requiere revisar entrega, transporte y otros casos.

## Reintentos y formulario

El cliente ejecuta una sola RPC y valida su recibo: caso, paquete, actor,
tenant/cliente, clave, contenido y resultado persistido. No muestra confirmación
ante respuesta vacía/incompleta o pérdida de respuesta. Conserva el texto y muestra
un enlace para consultar Incidencias antes de repetir.

Una clave UUID se conserva por sesión/usuario/tenant/cliente y huella del payload
normalizado. Los reintentos con los mismos datos recuperan la misma clave aun al
recargar. No se persiste la descripción en sessionStorage: solo IDs/huella y clave.
Si se cambia el contenido, el servidor sigue evitando un segundo caso activo.
Tras una respuesta perdida y un cambio de datos, revisar primero el historial.
La clave se libera solo al validar un recibo correcto.

Se extrajo a `pending-request.ts` la persistencia ya existente en Finanzas para
reutilizarla. Sus wrappers mantienen namespace, firmas y comportamiento previos;
no cambia ninguna RPC financiera. Con storage bloqueado se conserva la clave en
memoria durante la vida de la página; una recarga sin storage no garantiza conservar
esa clave, pero la comprobación de caso activo del servidor sigue evitando duplicados.

El formulario bloquea doble clic antes de cualquier await, limita la descripción
a 5000 caracteres y congela campos durante el envío. Oculta datos de otro contexto
y descarta respuestas tardías. Antes de despachar verifica que siga siendo la
solicitud activa; el servidor verifica además el usuario esperado.
El selector pagina todas las opciones propias, con filtros de tenant/cliente y
elegibilidad; un fallo en una página no presenta una lista parcial como completa.

## Publicación y compatibilidad

Aplicar en este orden y publicar coordinadamente con helper/formulario:

1. `20261014150000_atomic_portal_incidents.sql`.
2. `20261014151000_incident_session_binding.sql`.
3. `20261014152000_incident_trace_guards.sql`.

Las tres están probadas solo en sarierp_aud01. No aplicar migraciones de Demo a
Producción ni reparar historial para forzar esta salida. Confirmar dependencias
previas de multitenancy y AUD-06 en el dry-run del destino.

Las escrituras INSERT directas desde authenticated/anon ahora se rechazan, también
para Admin/Operaciones: la única entrada de reporte del producto es la RPC del
portal. Los consumidores actuales se actualizaron; revisar integraciones externas
que creen casos por tabla y preparar su acción autorizada si existen. No exponer
service_role en el navegador como alternativa.

Admin/Operaciones pueden gestionar estado/resolución según RLS existente, pero no
reescribir identidad o contenido de un reporte nuevo ni borrar su evidencia de
idempotencia. El evento confirmado tampoco es editable/borrable desde el cliente.
El propietario/servicio de la base conserva capacidades de mantenimiento y debe
usarlas con revisión y trazabilidad. Las filas antiguas no reciben actor/clave
inventados, y no se impone un índice único sobre casos activos legacy que pueda
borrar o bloquear silenciosamente datos previos.

El frontend antiguo intentará INSERT y fallará sin crear datos parciales. Durante
la publicación pausar el reporte, aplicar SQL y desplegar la UI; recargar pestañas.
Para rollback no reabrir INSERT sin revisar la integridad; pausar el formulario y
conservar datos/migraciones hasta una corrección coordinada.

## Revisión legacy obligatoria

Consulta administrativa de solo lectura antes de publicar:

```sql
select i.id, i.tenant_id, i.package_id, i.cliente_id, i.status,
       p.status as package_status, p.cargo_status,
       p.cliente_id as package_cliente_id,
       count(*) over (partition by i.tenant_id, i.package_id) as active_cases
from public.miami_incidencias i
left join public.miami_packages p on p.id = i.package_id and p.tenant_id = i.tenant_id
where i.status in ('Abierta', 'En revisión')
order by i.tenant_id, i.package_id, i.created_at;
```

Revisar paquete ausente, ownership distinto, estado sin incidencia, entregado o
varios casos activos. No corregir con un UPDATE masivo ni eliminar duplicados.
Administración/Operaciones debe confirmar ownership y cronología; un entregado
puede haber sido entregado legítimamente después del reporte.

Cuando corresponda reparar un flag legacy, hacerlo en mantenimiento revisado:
bloquear paquete y casos, comprobar tenant/cliente/estado y revisión esperados,
registrar motivo/actor y traza del ajuste en la misma transacción. No alterar
transporte/entrega para acomodar el caso ni asignar actor/clave retroactivos.
Si no puede establecerse la relación o hay varios casos, conservarlos y escalar
para conciliación. Esta etapa no ejecuta esas correcciones de datos en destino.

## Validación ejecutada

- Antes, en transacción aislada con rollback: el INSERT de Cliente persistía un
  caso; el UPDATE posterior afectaba cero paquetes por RLS sin devolver error.
  Quedaban un caso abierto y paquete Asignado. La nueva RPC valida un recibo real.
- SQL con rollback: actor/tenant/ownership/RLS, perfiles inválidos/sin rol,
  cliente eliminado, ambos estados de entregado, caso activo legacy, reintento,
  clave alterada y conservación de identidad/trazas. Fallos inyectados de estado,
  evento y actividad revierten caso y paquete.
- Cinco carreras reales con dos conexiones y espera por lock comprobada: misma
  clave, claves distintas desde dos cuentas del mismo cliente, entrega primero,
  reporte primero y clave repetida para otro paquete. Sin duplicados; la entrega
  posterior a un reporte válido sigue siendo Entregado y conserva el caso.
- PostgREST autenticado real: sesión esperada, recibo/replay, INSERT directo
  rechazado y visibilidad de caso para su cliente, oculto para otro cliente.
- Nueve regresiones Node nuevas: helpers/formulario real con SDK simulado,
  storage/recarga, recibos inválidos, doble clic, error/reintento, respuesta tardía
  y selector de más de 1000 paquetes sin filas ajenas/entregadas o páginas parciales.
- Suite total 303/303; TypeScript y build aprobados, 82/82 páginas. Siete archivos
  con lint limpio. Lint SQL sin errores AUD-11; conserva el error previo de Outlook
  por helper opcional y dos variables previas sin uso en Finanzas.

Fixtures de SQL revertidos y del script de concurrencia/API eliminados. Stack
aislado detenido conservando volúmenes; base principal sin cambios. No hubo
reportes, correos, pagos, OCR externo ni despachos reales en ambientes de negocio.

## UAT del destino

1. Confirmar las tres migraciones y revisar la consulta legacy. Publicar código
   y recargar pestañas. Verificar permisos del core y la RPC pública sin service key.
2. Con Cliente aprobado/activo, reportar un paquete propio elegible. Deben
   aparecer caso, flag y traza; WH/transporte/documentos permanecen consistentes.
3. Forzar un fallo al cambiar estado o escribir trazas en una base de pruebas:
   nada debe quedar parcialmente guardado. El formulario conserva datos y permite
   consultar el historial. Nunca provocar estos fallos en Producción compartida.
4. Interrumpir la respuesta tras commit y repetir los mismos datos; debe devolver
   el mismo caso. Probar doble clic y dos sesiones/cuentas del mismo cliente.
5. Competir con una entrega: si se entregó primero, no abrir caso ni sobrescribir
   Entregado. Si se reportó antes, una entrega posterior válida conserva ambos
   hechos. Entregado sin caso nuevo sigue remitiendo a contacto.
6. Probar cliente/tenant ajenos, pendiente/inactivo, perfil sin vínculo, interno,
   plataforma y cambio de usuario durante envío. Sin caso ajeno ni confirmación
   aplicada en otra sesión. Verificar RLS de historial y rechazo de escritura directa.
7. Verificar lookup/paginación con muchos paquetes, error de página/reintento,
   descripción vacía/límite, contexto de tracking y confirmación enlazada.
8. Revisar móvil, foco/teclado, fieldset deshabilitado, modo oscuro y mensajes.

Pendientes: SQL/publicación remotos, revisión legacy y UAT visual/autenticado con
permisos reales del destino. Las pruebas simuladas no certifican un navegador
conectado ni la política de reclamaciones después de entrega. AUD-12 sigue con
los avisos de clientes con varias cuentas del portal.
