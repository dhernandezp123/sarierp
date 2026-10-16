# Recuperación de contraseñas

## Uso

- Login interno: **¿Olvidaste tu contraseña?** abre `/forgot-password`.
- Portal: conserva su enlace y `/portal/forgot-password`.
- Administración → Usuarios: **Enviar recuperación**, confirmar el correo
  mostrado y **Enviar enlace**. El destinatario elige su contraseña; Admin no la
  ve ni la asigna. Se usa el correo guardado en Auth y en su perfil, no uno
  proporcionado por el navegador.
- El formulario exige ocho caracteres y confirmación. Al terminar, dirige al
  login interno o de clientes según el rol. No modifica rol, aprobación,
  actividad, empresa ni vínculo de cliente.
- La solicitud pública responde igual para cuentas existentes y desconocidas.
  Revisar spam/promociones y esperar un minuto antes de pedir otro enlace.
- Los enlaces vencidos muestran cómo solicitar otro. Si se recarga el formulario
  después de consumir un enlace nuevo, puede ser necesario solicitar uno nuevo:
  la sesión de recuperación se mantiene en memoria para separarla de otras
  cuentas abiertas en ese navegador.

## Controles y configuración

El servidor valida la empresa resuelta por el proxy. La recuperación pública
solo consulta perfiles de esa empresa; el envío administrativo exige Admin
aprobado/activo del mismo tenant y rechaza soporte de plataforma. Las claves de
servicio permanecen en servidor. Correo bloqueado en Demo o si no se puede
verificar el ambiente mediante `readEmailEnvironment`.

Supabase Auth envía mediante su SMTP configurado. Se reutiliza el redirect
existente `https://<dominio>/auth/callback?next=/portal/reset-password`; no se
cambian credenciales, allowlist de Auth ni esquema SQL. Mantener ese
callback autorizado para cada dominio productivo activo.

Los envíos iniciados por servidor no dependen de un verificador PKCE guardado en
el navegador de Admin. El destinatario consume el fragmento de recuperación con
un cliente Auth sin persistencia. El fragmento se retira de la barra de dirección
y se valida perfil/empresa antes de permitir el cambio. Ese cliente sigue ligado
a la cuenta recuperada aunque cambie la sesión habitual del navegador. El
callback también conserva soporte para enlaces PKCE anteriores y solo admite
destinos exactos de recuperación.

El envío administrativo registra `request_password_recovery` sin contraseña,
token ni enlace en `activity_logs`. Si falla esa auditoría después de solicitar
el correo, se muestra una advertencia que no induce un reenvío. La respuesta de
Auth confirma la solicitud; la entrega final depende del SMTP/buzón.

Referencias oficiales: [recuperación](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[enlaces y sesiones](https://supabase.com/docs/guides/auth/auth-email-templates).

## Marca del correo de recuperación

La plantilla está versionada en `supabase/templates/recovery.html`; el asunto es
**Restablece tu contraseña**. Incluye logo, nombre de empresa, color principal,
botón, enlace alternativo y aviso para quien no solicitó el cambio. Usa tablas
y estilos inline y logos PNG públicos por HTTPS para clientes de correo.

Supabase comparte la plantilla y el remitente entre empresas. La selección de
marca compara `.RedirectTo` con el callback exacto de cada empresa, que envía
el servidor tras validar su dominio. Actualmente Sari es la única empresa
registrada y usa Sari Express, `/logo/sari-logo.png` y `#0038BD`, según su
configuración. Los demás destinos muestran Forwarders ERP; nunca heredan Sari.
No se usa metadata editable del usuario para elegir marca, logo o enlaces.
El botón y el enlace alternativo conservan `{{ .ConfirmationURL }}` de Auth.
Ambos llevan exactamente al mismo enlace. El token de esa URL es una credencial
temporal de recuperación de la cuenta, no una contraseña, una clave de servicio
ni acceso general a la base de datos. Desde la corrección del 16/10/2026 se usa
una etiqueta legible en el enlace alternativo, sin mostrar el token en el texto.
El token sigue en el destino de ambos enlaces, como requiere Auth; ocultar su
texto no elimina su carácter sensible. No reenviar ni compartir enlaces,
capturas que los revelen o archivos `.eml`. Si se expone, solicitar un enlace
nuevo desde el portal de la empresa. No abrir enlaces reales como prueba técnica.

El remitente compartido sigue siendo
`Forwarders ERP <no-reply@mail.forwarders.app>`. El nombre del remitente no se
personaliza por empresa con esta plantilla; hacerlo requiere un envío mediante
hook de Auth/proveedor con remitentes verificados por empresa.

Al incorporar otra empresa o cambiar su marca/dominio, añadir una condición
exacta para su callback con nombre, URL HTTPS del logo, color hexadecimal y
ancho de imagen, contrastados con `tenant_domains` y `company_settings`.
Conservar el respaldo neutral y probar el caso de la nueva empresa y el de
Sari en Auth/SMTP local antes de publicar. La plantilla es una configuración
versionada; no consulta `company_settings` durante cada envío.

Publicación en Supabase alojado: **Authentication → Emails → Reset password**,
pegar el HTML versionado y el asunto indicado. También se puede usar la
[Management API](https://supabase.com/docs/guides/auth/auth-email-templates):
GET y PATCH `/v1/projects/<project-ref>/config/auth`. Guardar una copia de
`mailer_subjects_recovery`, `mailer_templates_recovery_content` y `uri_allow_list`.
El callback completo de cada empresa debe estar en Redirect URLs de Auth, además
de en la plantilla: si falta, Auth sustituye `.RedirectTo` por Site URL y se
pierden tanto el destino de la empresa como su marca.

Usar `node scripts/publish-recovery-email.mjs` para revisar el cambio y añadir
`--apply` para publicarlo, con `SUPABASE_ACCESS_TOKEN` del operador autenticado y
el proyecto ya vinculado. El script lee asunto/HTML como UTF-8, rechaza texto
mal codificado, autoriza los callbacks exactos de la plantilla, conserva los
destinos anteriores y verifica los tres campos tras el PATCH. Comprueba también
que los demás ajustes de Auth no cambiaron. No publicar el resto de `config.toml` para este
cambio: sus valores locales difieren de Production. `git push`/Vercel por sí
solos no actualizan las plantillas alojadas.

El cambio de branding del 16/10/2026 se valida con buzón local y cuentas
ficticias: asunto español, Sari, respaldo neutral, metadata ignorada, token de
recuperación, cambio de contraseña y login. Comprobar la presentación final en
Gmail/Outlook con el próximo envío autorizado; no se envían pruebas a usuarios
operativos. Las capturas reales posteriores revelaron el asunto mal codificado
y el callback de Sari ausente en Production; las pruebas anteriores solo
autorizaban ese callback en local. Se reproduce el fallo antes de corregirlo y
se verifica después con perfiles Cliente, ambos enlaces y el encabezado SMTP
UTF-8 real. Los correos ya enviados no se modifican: solicitar uno nuevo desde
`https://sari.forwarders.app/portal/forgot-password` tras publicar la corrección.

## Aceptación pendiente en Production

Con una cuenta controlada del equipo, comprobar llegada real, destinatario y
dominio, abrir el enlace en otro navegador, cambiar contraseña e iniciar sesión.
Repetir desde Administración para un usuario interno y un Cliente. Verificar
enlace vencido, petición repetida y preservación del estado/rol/empresa. No enviar
correos de ensayo a usuarios operativos sin autorización específica.
