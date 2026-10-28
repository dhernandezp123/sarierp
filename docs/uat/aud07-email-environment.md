# AUD-07 — Bloquear correo cuando el ambiente no puede verificarse

Estado: implementado y validado localmente. Abierto para publicar el código y
verificar configuración/UAT del ambiente destino. Fecha: 14/10/2026.

## Contrato compartido

`src/lib/server/email-environment.ts` es exclusivo del servidor. Se aplica a los
avisos de Miami, soporte y la comprobación de ambiente de Outlook.

| Fuente o resultado | Decisión |
| --- | --- |
| APP_ENV o NEXT_PUBLIC_APP_ENV identifica demo, ignorando mayúsculas/espacios | Bloqueo demo; no necesita consultar la base |
| platform_environment devuelve environment = demo | Bloqueo demo, incluso con variables locales de producción |
| Error de consulta, conexión fallida, fila ausente, respuesta ambigua o valor inesperado | Bloqueo por ambiente no verificado |
| Fila singleton con environment = production, sin error | Permite continuar con los controles de rol, tenant, configuración y opt-in existentes |
| Producción verificada sin OUTBOUND_EMAIL_ENABLED exactamente true | Correo bloqueado |

La consulta filtra `singleton = true` y usa `maybeSingle`: no selecciona una fila
arbitraria si existe más de una. Solo admite los valores exactos `demo` y
`production` de la base. Valores como `trial`, `staging`, `Production`, cadenas
vacías o null son desconocidos y bloquean. Las variables de producción no son un
fallback de una consulta fallida. No se cachea la decisión entre solicitudes.
El ambiente global no equivale al plan comercial Trial de un tenant.

Miami conserva HTTP 403 para demo. Soporte conserva HTTP 200 con
`ok: true, skipped: true, reason: demo`. Ambas rutas devuelven HTTP 503 y
`ok: false` si no pueden verificar el ambiente; no llaman a Resend, no crean
auditoría de envío ni reservan una fila processing en ese caso. Se mantiene el
orden de autenticación/perfil antes de leer el ambiente y las autorizaciones
posteriores sobre el paquete/ticket y su tenant.

Outlook comparte la verificación de la tabla y conserva el veto adicional de
`mail_intake_is_demo`. En producción, esa RPC debe devolver un boolean válido;
error/null/valor inesperado bloquea. Un true también bloquea aunque la tabla
identifique producción. Los handlers run/check devuelven 503 ante fallo, antes
de obtener token, acceder a Graph o mutar mensajes/cursor. La integración permanece
en stand by: las pruebas que ejercitan el flujo activo sustituyen esa constante
solo en mocks y no cambian la configuración ni activan Outlook.

## Publicación y configuración pendiente

No hay SQL ni librerías nuevas en esta etapa. Publicar las rutas y el helper
juntos. Antes de habilitar correo, verificar en el proyecto destino la fuente
confiable de ambiente y el acceso de lectura del servidor:

```sql
select singleton, environment
from public.platform_environment
where singleton is true;
```

Debe devolver una única fila coherente con el ambiente real. No asignar production
solo para quitar un error ni deducirlo del hostname o de una variable local.
Si la tabla/fila falta o no es legible, el comportamiento correcto es mantener
el correo bloqueado y resolver su configuración mediante un despliegue revisado.
Verificar que esta configuración no pueda alterarse desde usuarios del ERP.

El historial actual de migraciones de esta rama no crea `platform_environment`.
El runbook de soporte distingue migraciones exclusivas de Demo que no deben
copiarse a main. Por tanto, no se presupone que una instalación productiva tenga
esta tabla: revisar/provisionar explícitamente la fuente del ambiente destino
antes de considerar cerrado el UAT. No se añadieron defaults de producción ni
se cambiaron banderas para habilitar envío durante esta corrección.

Una instalación que antes enviaba porque ignoraba el error de esa lectura ahora
devolverá 503 hasta quedar verificada. Tickets, asignaciones y avisos del portal
ya persistidos no se revierten al bloquear un correo. No se reserva una entrega
nueva ni se consume un intento de envío durante el bloqueo.

Conservar `OUTBOUND_EMAIL_ENABLED` deshabilitado en staging y usar proveedor
interceptado para UAT. Los registros processing previos y la conciliación de
resultados inciertos permanecen en AUD-08. La decisión se toma por solicitud;
no constituye una transacción con cambios del ambiente y el proveedor externo.

## Validaciones realizadas

Actualización de release: `20261014153000_verified_platform_environment.sql`
provisiona ahora la fuente en instalaciones que no la tenían. Comienza en Demo,
con RLS y sin escritura para anon/authenticated/service_role; el servidor solo
puede leer. Production requiere fecha/evidencia de verificación por el propietario
de la base. No se heredan banderas ni defaults de producción. La función interna
is_demo_environment también falla cerrada si falta la fila. Prueba SQL nueva:
`supabase/tests/aud07_verified_environment.sql`. La sección anterior describe el
estado de AUD-07 antes de preparar este despliegue; el resultado final consta en
la matriz y el registro de release.

- Reproducción previa de los handlers reales con SDK/proveedor simulados:
  la lectura del ambiente falló y Miami/soporte llamaron una vez al proveedor.
  La respuesta mock rechazó el envío; no hubo contactos ni correo real.
- Catorce pruebas Node nuevas de helper, handlers y Outlook. Cubren error, fila
  ausente, error combinado con production, valor desconocido/null/array, excepción
  de conexión, vetos demo de ambas variables, cambio entre solicitudes y opt-in.
- Los handlers reales, con red/SDK simulados, confirman cero llamadas al proveedor,
  inserciones, actualizaciones y reservas de entrega en cada bloqueo; producción
  verificada conserva un envío mock, idempotency key y auditoría sent.
- Autenticación/perfil denegados no llegan a consultar el ambiente. Regresiones
  de tenant, demo, respuesta HTML de Resend, auditoría de envío y standby de
  Outlook siguen aprobadas. RPC de Outlook inválida no permite token/Graph.
- Suite completa: 256/256 pruebas aprobadas. TypeScript y build con 82 páginas
  aprobados. ESLint de todos los archivos afectados: 0 errores/0 warnings.

Las pruebas usan fixtures compartidos en `tests/email-route-fixture.mjs`, sin
credenciales reales y con restauración de variables/fetch después de cada caso.
No se arrancaron bases ni se enviaron correos, mensajes Microsoft, OCR externo,
pagos o despachos. No se ejecutó SQL, push ni despliegue remoto.

## UAT pendiente en el ambiente destino

1. Verificar fuente de ambiente, valor singleton y permisos de lectura del
   servidor; comprobar que producción no dependa de una tabla/fila ausente.
2. Con proveedor interceptado, simular error/ausencia/valor inválido de la lectura:
   HTTP 503, cero llamadas externas y cero reservas/intentos nuevos de entrega.
3. Demo por base y por cada variable local, con el flag outbound activado solo
   en la prueba interceptada: no debe salir correo. Comprobar respuestas propias
   de Miami y soporte, y que el recurso de negocio ya guardado se conserve.
4. Producción verificada con opt-in apagado/ausente: cero envíos. Con opt-in true
   y destinatario ficticio interceptado: un envío con su key/auditoría existentes.
5. Cambiar la respuesta del ambiente entre dos solicitudes y verificar que la
   segunda no reutilice una decisión de producción anterior.
6. Validar roles/tenants reales y recuperación del aviso después de restaurar la
   verificación, sin modificar asignaciones/tickets ni reiniciar processing previos.
7. Mantener Outlook en espera; si se autoriza su futura activación, verificar
   también ambiente compartido, RPC booleana y los controles de conexión/opt-in.

La suite con mocks no certifica RLS desplegado, configuración remota ni UAT visual.
