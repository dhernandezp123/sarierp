# Invitaciones de usuarios

Administración → Usuarios → Invitar nuevo usuario solicita **Nombre**, **Apellido**,
correo y rol. Nombre y apellido son obligatorios, de hasta 100 caracteres;
se recortan espacios exteriores y se guardan tanto en Auth como en el perfil
desde la invitación, antes de que el destinatario abra el enlace.

El enlace personal permite revisar los nombres precargados y crear contraseña.
Un nombre ya informado no completa la activación ni omite la contraseña.
Los eventos de Auth cargan el perfil fuera del callback para evitar bloqueos
del SDK; las actualizaciones de sesión no borran los nombres que se estén editando.
El rol y la empresa los asigna el
servidor según el Admin autenticado; el correo de invitación no concede otro rol.
Usuarios internos quedan Aprobados; Cliente queda Pendiente y requiere vincularse
y aprobarse según el flujo actual. El branding no modifica esos permisos.

Para cuentas ya invitadas que aparecen como **Sin nombre**, usar **Editar nombre**
debajo de su correo, completar ambos campos y **Guardar nombre**. Esta acción
solo actualiza `profiles.nombre` y `profiles.apellido`, limitada por ID, empresa
y RLS vigente. No reenvía correos ni cambia contraseña, rol o aprobación. La UI
solo confirma guardado si la base devuelve una fila. Se registra actividad auxiliar.
No se deducen ni rellenan nombres históricos automáticamente a partir del correo.

## Correo con marca

La plantilla `supabase/templates/invite.html` usa el mismo diseño del correo de
recuperación: logo, nombre/color de empresa, botón y enlace alternativo, sin
imprimir tokens como texto. Ambos enlaces conservan `{{ .ConfirmationURL }}` y
se consumen en Auth con `type=invite`. No usar el enlace de recuperación para
activar una cuenta.

Asunto: **Activa tu cuenta**, español ASCII para evitar el problema de
recodificación observado con el asunto Unicode de recuperación. El cuerpo HTML
mantiene acentos y `charset=utf-8`. Remitente compartido:
`Forwarders ERP <no-reply@mail.forwarders.app>`.

Sari se identifica mediante `.RedirectTo` exacto
`https://sari.forwarders.app/onboarding`, que la API toma del dominio principal
activo de la empresa del Admin. Otros destinos usan respaldo neutral Forwarders
ERP; no se toma la marca de metadata editable por el destinatario. Al incorporar
una empresa o cambiar su marca/dominio, agregar su condición exacta y contrastar
logo/color/nombre con su configuración antes de publicar.

El destino completo también debe estar autorizado en Supabase Auth. Sin él,
Auth sustituye el destino por Site URL y la invitación pierde la marca y dominio
de la empresa. El 16/10/2026 se añadió el onboarding de Sari, que estaba ausente.

## Publicación

Con el proyecto vinculado y `SUPABASE_ACCESS_TOKEN` del operador autenticado:

```text
node scripts/publish-recovery-email.mjs --invite
node scripts/publish-recovery-email.mjs --invite --apply
```

Se reutiliza el publicador para conservar las verificaciones UTF-8, asunto ASCII,
dos enlaces de Auth y callback exacto. Respaldar antes `mailer_subjects_invite`,
`mailer_templates_invite_content` y `uri_allow_list`. Solo se actualizan esos
tres campos, preservando todos los destinos existentes y el resto de Auth/SMTP,
incluida la recuperación. Sin `--invite`, el script sigue publicando únicamente
la plantilla de recuperación.

No usar `supabase config push` para este cambio. Vercel/git no publican la
plantilla alojada; se aplica por separado con Management API o desde
Authentication → Emails → Invite user. La configuración local sí referencia
la plantilla versionada mediante `supabase/config.toml`.

## Verificación y límites

En el stack aislado se prueba la API real con Admin ficticio invitando Ventas y
Cliente: nombres en Auth/perfil antes de aceptar, edición administrativa con
sesión y filtro de empresa, correo local, asunto SMTP literal, marca Sari, dos enlaces idénticos,
dominio/onboarding exactos, sesión receptora nueva, perfil en la empresa,
contraseña/nombre actualizados, login y rechazo del enlace consumido. El respaldo
neutral se prueba con envío Auth local directo. Las cuentas se eliminan después.
No se envían invitaciones de ensayo a usuarios reales de Production.

La publicación se comprueba con GET posterior y comparación de los demás
ajustes. La entrega en Gmail/Outlook y la aceptación visual completa en navegador
siguen pendientes del próximo envío autorizado. Los correos anteriores no
cambian de diseño ni destino. Los tokens de invitación son sensibles: no
compartirlos ni abrir los del destinatario como prueba técnica.
