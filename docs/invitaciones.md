# Invitaciones de usuarios

Administración → Usuarios → Invitar nuevo usuario envía un enlace personal para
completar nombre/apellido y crear contraseña. El rol y la empresa los asigna el
servidor según el Admin autenticado; el correo de invitación no concede otro rol.
Usuarios internos quedan Aprobados; Cliente queda Pendiente y requiere vincularse
y aprobarse según el flujo actual. El branding no modifica esos permisos.

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
Cliente: correo local, asunto SMTP literal, marca Sari, dos enlaces idénticos,
dominio/onboarding exactos, sesión receptora nueva, perfil en la empresa,
contraseña/nombre actualizados, login y rechazo del enlace consumido. El respaldo
neutral se prueba con envío Auth local directo. Las cuentas se eliminan después.
No se envían invitaciones de ensayo a usuarios reales de Production.

La publicación se comprueba con GET posterior y comparación de los demás
ajustes. La entrega en Gmail/Outlook y la aceptación visual completa en navegador
siguen pendientes del próximo envío autorizado. Los correos anteriores no
cambian de diseño ni destino. Los tokens de invitación son sensibles: no
compartirlos ni abrir los del destinatario como prueba técnica.
