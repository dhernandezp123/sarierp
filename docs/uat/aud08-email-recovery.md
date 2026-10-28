# AUD-08 — Recuperación y conciliación de correo

Estado: implementado y validado localmente; abierto para aplicar SQL, publicar y
ejecutar UAT en destino. Fecha: 14/10/2026. Sin correos reales durante la validación.

## Comportamiento

Miami y Soporte usan `src/lib/server/email-delivery.ts` después de sus controles
de autenticación, perfil, tenant, recurso, ambiente y opt-in. AUD-07 sigue siendo
requisito: un ambiente no verificable bloquea antes de leer/reservar el envío.
Outlook permanece en standby y no cambia en esta etapa.

| Resultado persistido | Respuesta / recuperación |
| --- | --- |
| sent con ID de Resend | 200, alreadySent; sin nueva llamada al proveedor |
| processing de menos de dos minutos | 409, inProgress, ok false; nunca alreadySent |
| Lease vencido, uncertain o failed con snapshot/clave/credencial válidos y ventana vigente | Reserva condicional y repetición del mensaje original para recuperar la respuesta de Resend |
| Timeout, conexión perdida, HTTP 2xx sin ID, 408/409/429 o 5xx | uncertain; no prueba aceptación ni rechazo definitivo |
| HTTP 400/401/403/404/422 | failed; no se modifica automáticamente el mensaje original |
| Resend acepta pero falla la auditoría o cambia el lease | 503, uncertain; no confirma envío al usuario |
| Legacy sin snapshot, ventana agotada, reloj inconsistente o credencial cambiada | 409, uncertain; no llama al proveedor; conciliación administrativa |
| Cinco intentos consumidos | 429; revisión, sin reiniciar contador |

El timeout de 20 segundos incluye lectura del cuerpo y aborta la petición. El
lease es de dos minutos. La reserva y finalización filtran tenant; las reservas
existentes usan estado/revisión esperados y el cierre usa un token exclusivo.
Una solicitud tardía no puede sobrescribir el estado del nuevo propietario.
La restricción única resuelve dos primeras solicitudes concurrentes.

Antes de llamar a Resend se persisten los bytes del JSON, clave única, destinatario,
primer intento, hash de la credencial y token. Los reintentos conservan esos bytes,
clave y fecha inicial, incluso si cambian contacto, remitente, branding o contenido.
El hash no guarda la clave API. Cualquier rotación de credencial bloquea la
recuperación hasta revisar el proveedor, aun cuando la nueva clave sea de la misma
cuenta. No se publica el snapshot ni el hash mediante SELECT del navegador.

Resend conserva las claves de idempotencia durante 24 horas y devuelve el ID
original al repetir la misma petición. Véase [su contrato de idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys).
Se utiliza una ventana de 23 horas desde el primer intento local, con margen
adicional para el timeout. Se comprueba otra vez después de reservar. El plazo
no se extiende al reintentar. Fuera de esa ventana nunca se repite automáticamente.
`sent` significa aceptación confirmada por el proveedor, no entrega en la bandeja
del destinatario. Un rebote no autoriza a marcar el mensaje como no aceptado.

## Publicación

Aplicar en orden y publicar coordinadamente con las rutas/helper:

1. `20261014140000_email_delivery_reconciliation.sql`.
2. `20261014141000_email_delivery_credential_guard.sql`.
3. `20261014142000_email_reconciliation_actor_guard.sql`.

No se rellenan snapshots legacy ni se reinician sus estados/contadores mediante
migración. Mientras falta el esquema, la lectura de auditoría falla y no envía.
No volver a desplegar los handlers anteriores tras empezar a generar snapshots:
ignoran los estados nuevos y pueden intentar reconstruir mensajes distintos.
Para pausar envíos, desactivar `OUTBOUND_EMAIL_ENABLED`; no borrar auditorías.

Verificar RLS/ACL en destino: el navegador conserva únicamente las columnas de
metadatos previamente disponibles y su aislamiento de tenant. `SELECT *` de las
tablas de entrega desde authenticated deja de estar autorizado; los consumidores
actuales de esas tablas son handlers de servidor. Revisar integraciones externas.
`email_delivery_reconciliations` solo permite SELECT/INSERT a service_role;
authenticated/anon no leen ni modifican evidencia ni ejecutan la RPC.

## Operación y conciliación

No hay cron ni worker nuevo: la recuperación se ejecuta al volver a solicitar el
mismo evento autorizado. En Miami se usa el aviso desde Inventario. En Soporte
se conserva ticket/evento/messageId originales; una actualización posterior del
ticket tiene otra clave de evento y no recupera automáticamente un aviso anterior.
Soporte sigue guardando la respuesta aunque falle su aviso. La conciliación de
avisos antiguos se opera mediante el procedimiento de mantenimiento siguiente.

Consulta de diagnóstico en sesión administrativa, sin exponer contenido del mensaje:

```sql
select 'miami' as kind, id, tenant_id, status, attempts, recipient_email,
       resend_message_id, updated_at, first_attempt_at, provider_key
from public.client_email_deliveries
where status in ('uncertain', 'failed')
   or (status = 'processing' and updated_at < now() - interval '2 minutes')
union all
select 'support', id, tenant_id, status, attempts, recipient_email,
       resend_message_id, updated_at, first_attempt_at, provider_key
from public.support_notification_outbox
where status in ('uncertain', 'failed')
   or (status = 'processing' and updated_at < now() - interval '2 minutes')
order by updated_at;
```

1. Pausar nuevas solicitudes para el evento y confirmar que venció su lease.
   Antes de autorizar un nuevo envío por no aceptación, confirmar además que
   terminaron/cancelaron todas las solicitudes anteriores en todas las instancias;
   un lease vencido por sí solo no prueba que un proceso pausado haya terminado.
   Si no se puede confirmar, conservar uncertain y no autorizar una clave nueva.
   Copiar ID, tenant y `updated_at` exactos; no convertirlo a una fecha sin hora.
2. Revisar logs del proveedor de la cuenta/credencial original. Si existe ID,
   usar [Retrieve Sent Email](https://resend.com/docs/api-reference/emails/retrieve-email)
   o el dashboard para comprobar ID, destinatario, asunto, tiempo y tags del evento.
   Consultar al proveedor cuando no haya evidencia suficiente. La ausencia de
   resultados en una búsqueda no demuestra no aceptación.
3. Registrar evidencia verificable (referencia de logs/caso, criterio y revisión)
   y el administrador responsable: Miami exige Admin aprobado/activo del tenant,
   sin privilegio de plataforma; Soporte exige administrador de plataforma
   aprobado/activo. La identidad se proporciona en mantenimiento con service_role;
   no es una RPC disponible a una sesión del navegador.
4. Si se confirmó aceptación, ejecutar `accepted` con el ID verificado. Si se
   confirmó explícitamente que no se aceptó, ejecutar `not_accepted`, sin ID.
   Un ID ya persistido impide autorizar otro envío: revisar su aceptación.
   Si permanece desconocido, conservar uncertain y escalar; no limpiar la fila.
5. Volver a leer estado y evidencia. Un conflicto PT409 exige revisar la versión
   actual; no forzar el cambio ni reemplazar el timestamp esperado a ciegas.

Plantilla que debe completarse con valores verificados, en una conexión segura
de mantenimiento. No pegar una service key en el navegador o en documentación:

```sql
begin;
set local role service_role;
select public.reconcile_email_delivery(
  p_kind => 'miami', -- o support
  p_delivery_id => '<UUID_DEL_AVISO>'::uuid,
  p_tenant_id => '<UUID_DEL_TENANT>'::uuid,
  p_expected_updated_at => '<TIMESTAMP_EXACTO_LEIDO>'::timestamptz,
  p_actor_id => '<UUID_ADMIN_RESPONSABLE>'::uuid,
  p_outcome => 'accepted', -- not_accepted SOLO con evidencia de no aceptación
  p_evidence => '<REFERENCIA_Y_VERIFICACION_DE_LOGS_DEL_PROVEEDOR>',
  p_provider_message_id => '<ID_VERIFICADO_RESEND>' -- null para not_accepted
);
commit;
```

La RPC bloquea la fila y persiste cambio/evidencia en una transacción. `accepted`
guarda ID y fecha de conciliación sin enviar. `not_accepted` habilita una nueva
reserva con mensaje/clave nuevos y conserva intentos; no envía por sí misma.
Revisar destinatario y evento antes de pedir ese nuevo intento. No autoriza más
de cinco intentos. Si la evidencia no puede escribirse, se revierte el cambio.
El historial conserva estado previo y clave, sin cuerpo del correo. Service_role
no puede actualizar/borrar ese historial; el propietario de la base conserva
sus capacidades administrativas y debe protegerse por proceso.

## Validación local y UAT pendiente

Reproducción anterior: ambas rutas devolvían alreadySent para una fila processing
antigua, sin proveedor ni recuperación. Se probaron los handlers reales con SDK,
correo y timers simulados: 18 regresiones nuevas; suite total 274/274.
TypeScript y build aprobados, 82/82 páginas; lint de siete archivos sin errores
ni warnings. SQL con rollback verifica estados, actor/rol nullable, ACL/RLS,
conflictos, lease activo, ID conocido y reversión ante fallo de evidencia.

`scripts/validate-aud08-email-recovery.mjs` usa exclusivamente sarierp_aud01 y
PostgREST local. En ambas tablas prueba dos lecturas concurrentes para inserción
y recuperación, snapshot invariable, escritor tardío y fallo real del UPDATE
final seguido de recuperación. Un único correo aceptado por proveedor simulado;
fixtures eliminados al terminar. Nunca usa credenciales remotas ni envía correo.
El lint SQL no reporta errores de conciliación; conserva el error previo del
helper opcional `is_demo_environment` y dos variables previas sin uso en finanzas.

UAT del ambiente destino, con proveedor interceptado/clave de pruebas autorizada:

1. Aplicar las tres migraciones y verificar AUD-07, RLS y grants por columnas.
2. Pausar antes/después de aceptación; pedir el evento desde dos sesiones.
   Verificar inProgress o recuperación sin duplicado y contador correcto.
3. Forzar timeout durante conexión/cuerpo, HTTP 200 sin ID y fallo final de DB.
   Nunca debe aparecer el toast de aviso enviado sin auditoría confirmada.
4. Cambiar contacto/branding y solicitar el mismo evento: debe conservar snapshot.
   Cambiar credencial o agotar 23 horas: debe requerir conciliación, sin proveedor.
5. Probar accepted/not_accepted con evidencia, perfil ajeno/inactivo/sin rol,
   versión vieja y cinco intentos. Verificar que una evidencia fallida no cambia
   el estado. Ningún tenant debe leer snapshot o evidencia de otro.
6. Comprobar ingreso/asignación/respuesta persistidos aunque el correo falle.
   Demo, ambiente inválido y opt-in desactivado no reservan ni llaman al proveedor.

Límites: los tests no certifican permisos remotos, entrega real, UAT visual ni
operación con proveedor en producción. Se necesita reloj sincronizado entre
instancias y coordinación durante mantenimiento/deploy. No se garantiza entrega
exactamente una vez ante pausas arbitrarias del proceso que crucen la retención
del proveedor; abortar una petición tampoco revierte una aceptación externa.
La evidencia incierta nunca se trata como permiso para reenviar.
