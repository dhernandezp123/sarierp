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
cambian plantillas, credenciales, allowlist de Auth ni esquema SQL. Mantener ese
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

## Aceptación pendiente en Production

Con una cuenta controlada del equipo, comprobar llegada real, destinatario y
dominio, abrir el enlace en otro navegador, cambiar contraseña e iniciar sesión.
Repetir desde Administración para un usuario interno y un Cliente. Verificar
enlace vencido, petición repetida y preservación del estado/rol/empresa. No enviar
correos de ensayo a usuarios operativos sin autorización específica.
