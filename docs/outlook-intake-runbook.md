# Solicitudes por Outlook — Sari

Estado: **stand by solicitado por el usuario el 02/10/2026**, sin acceso
administrativo a Microsoft 365. `OUTLOOK_INTAKE_STANDBY = true` bloquea ambos
endpoints antes de consultar sesión, base de datos o Microsoft; oculta el menú
y muestra «En espera» en la ruta directa, sin necesitar tablas nuevas.
No aplicar la migración ni configurar secretos o scheduler mientras esté en
espera. Para retomar, revisar SQL/RLS, completar permisos y UAT, y levantar el
bloqueo mediante un cambio de código revisado.

No hay conexión, SQL aplicado, scheduler ni envío
real certificados. Se ofrece solamente al tenant del dominio activo
`sari.forwarders.app`, con el buzón `Pricing@sarihn.com`. Otros tenants no tienen
fila de configuración ni acceso al ejecutor. La tabla admite futuras
integraciones, pero habilitarlas requiere ampliar explícitamente la autorización
y provisionar credenciales aisladas por cliente.

## Comportamiento

- Administrador: **Administración → Solicitudes por Outlook**.
- Vendedor predeterminado seleccionable. La migración busca el perfil activo
  **Admin pruebas**; si no existe, exige seleccionarlo antes de activar. No
  fabrica un perfil ni fuerza las iniciales de otro usuario a AP.
- Opcionalmente usa el vendedor del cliente, buscando coincidencia única en
  `email_1`, `email_2` o `email_3`. Cliente nuevo: contacto en un Borrador sin
  inventar ni crear un cliente. El vendedor completa cliente, servicio y carga.
- Se conserva asunto y texto del correo como `pricing_notes` internas, limitadas
  a 12.000 caracteres. No se extraen adjuntos ni datos de carga automáticamente.
- Primera versión: reglas conservadoras para solicitudes explícitas en español
  e inglés; **no utiliza un modelo de IA ni conecta DOTS**. Mensajes ambiguos y
  seguimientos quedan en el historial para revisión y respuesta manual desde
  Outlook. No se genera otra referencia para una conversación ya registrada.
- Se lee Inbox, independientemente de que un correo esté leído. No incluye
  Enviados, Spam ni carpetas a las que reglas de Outlook desvíen mensajes.
- Cada activación fija el inicio a la hora actual. No se acusa el histórico.
- Una RPC registra mensaje y Borrador en una transacción; la numeración usa el
  trigger vigente, por empresa. Duplicados por ImmutableId no crean otro Borrador.
- Una concesión temporal evita ejecuciones simultáneas; cursor delta conservado
  por empresa. Cada ejecución procesa una página y hasta dos acuses pendientes.
- Respuesta en el mismo hilo con `reply`, usando la referencia ya persistida:
  «Hemos recibido tu solicitud bajo el número de referencia {referencia}. En breve
  regresaremos con los costos correspondientes.»
- Microsoft devuelve `202`: estado **accepted**, no certifica entrega final.
  Ante fallos/timeout/crash: **uncertain**, sin reenvío automático. Revisar Enviados
  y la cotización antes de responder manualmente. Un cursor expirado devuelve
  error; un administrador debe conciliar y restablecerlo sin replay histórico.

## Microsoft 365 (administrador)

1. Registrar una aplicación de tenant único en Entra ID. Registrar su Directory
   ID, Application/Client ID y Object ID del **service principal** empresarial.
2. Autorizar **Application Mail.Read** y **Application Mail.Send** mediante
   Exchange Online RBAC for Applications, con un management scope que incluya
   únicamente `Pricing@sarihn.com`. No se necesita Mail.ReadWrite: no se modifica
   ni elimina correo original.
3. No combinar ese scope con permisos equivalentes globales de Entra: son
   aditivos y ampliarían el acceso a otros buzones. El administrador debe revisar
   y eliminar concesiones globales equivalentes si existen.
4. Ejecutar `Test-ServicePrincipalAuthorization` para este buzón y para un buzón
   ajeno; verificar que solo el primero permita Mail.Read/Mail.Send. Conservar
   evidencia administrativa antes de activar.
5. Crear una credencial de servidor con vencimiento y planificar su rotación.
   Introducir el valor únicamente en los secretos del hosting, nunca en el chat,
   repositorio ni variables NEXT_PUBLIC.

Fuentes oficiales:
[RBAC de aplicaciones](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac),
[delta de mensajes](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0),
[reply](https://learn.microsoft.com/en-us/graph/api/message-reply?view=graph-rest-1.0).

## Servidor y despliegue

Variables exclusivas del ambiente Production:

```text
SARI_OUTLOOK_DIRECTORY_ID=<Directory ID de Microsoft>
SARI_OUTLOOK_CLIENT_ID=<Application ID>
SARI_OUTLOOK_CLIENT_SECRET=<secreto de Microsoft>
SARI_OUTLOOK_RUN_SECRET=<valor aleatorio de al menos 32 caracteres>
OUTBOUND_EMAIL_ENABLED=true
```

Reutiliza `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` existentes.
Mantener la integración desactivada hasta completar el preflight.

1. Revisar y aplicar únicamente la migración
   `20261002120000_sari_outlook_intake.sql` en la base objetivo. No ejecutar un
   `db push` indiscriminado: el historial de Demo es diferente a Production.
2. Ejecutar `supabase/tests/sari_outlook_intake.sql` en una base local aislada.
   No correr los fixtures en Production. Verificar RLS con usuarios autenticados
   Admin, Ventas y otro tenant; confirmar rechazo de configuración cross-tenant.
3. Desplegar el código y configurar los secretos del servidor.
4. En la página de configuración, **Comprobar conexión** valida lectura de Inbox
   sin enviar correos. No certifica autorización de envío ni scope de Exchange.
5. Programar un scheduler del servidor que ejecute cada minuto:
   `POST https://sari.forwarders.app/api/integrations/outlook/run`, con
   `Authorization: Bearer <SARI_OUTLOOK_RUN_SECRET>`. No es un cron del navegador.
   Ajustar frecuencia y capacidad al volumen; vigilar backlog de acuses.
6. Confirmar vendedor y autorización de acuses, guardar, y probar un correo de
   un destinatario controlado. Verificar un único Borrador, referencia y acuse.
7. Probar replay, dos llamadas simultáneas, respuestas automáticas, follow-up,
   vendedor del cliente y cliente nuevo. Confirmar notas internas fuera del PDF.
8. Probar timeout de Graph simulado y revisar estado uncertain sin duplicados.
9. Confirmar que Demo bloquea configuración y ejecución. No cargar credenciales
   de producción en Demo/Preview. Otros clientes no deben mostrar la opción.

No hay scheduler creado ni credenciales almacenadas por este cambio. Para
pausar, desactivar y guardar la configuración; detener también el scheduler.
Un envío externo que ya empezó puede terminar aunque se pause la integración.
