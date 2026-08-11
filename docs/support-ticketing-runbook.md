# Runbook — Mesa de ayuda por instalación

## Estado actual

El módulo está integrado en `feat/support-tickets-demo`. La migración
`20260810170000` fue aplicada al proyecto Demo verificado el 10/08/2026 y
`support_settings.enabled` quedó activo temporalmente para UAT. Producción no
ha sido modificada. No aplicar allí hasta completar primero la UAT en Demo.

El historial local contiene cuatro migraciones exclusivas de la rama `demo`
que, por diseño, no existen en `main`:

```text
20260731190000
20260731213000
20260731214000
20260731215000
```

No copiarlas a `main` ni utilizar `supabase migration repair`. Para Demo se
trabaja desde la rama `demo`, donde sí existen; para Producción se trabaja desde
`main`, donde no deben aplicarse. Confirmar siempre rama y project ref antes de
`db push`. Si se alternan ramas localmente, usar worktrees/instancias locales
separadas o reconstruir conscientemente la base local de la rama objetivo.

## Configuración por instalación

Estado del canal: `soporte@forwarders.app` fue creado en ImprovMX y su reenvío
se confirmó el 10/08/2026 con un correo enviado desde una cuenta externa.

Antes de habilitar correos:

1. Crear `soporte@forwarders.app` en ImprovMX y probar su reenvío.
2. Confirmar que Vercel tiene, sólo en el ambiente objetivo:
   - `OUTBOUND_EMAIL_ENABLED=true`.
   - `RESEND_API_KEY`.
   - `RESEND_FROM_EMAIL`.
   - `NEXT_PUBLIC_SITE_URL` con el dominio exacto de esa instalación.
3. Confirmar que el proyecto Supabase y la rama Git corresponden al cliente.

Después de aplicar la migración, configurar desde SQL Editor confiable. Cambiar
el prefijo y correo antes de ejecutar:

```sql
begin;

update public.support_settings
set ticket_prefix = 'MYA',
    support_email = 'soporte@forwarders.app',
    enabled = true,
    updated_at = now()
where singleton is true;

do $grant_platform_admin$
declare
  v_profile_id uuid;
  v_count integer;
begin
  select count(*), min(id)
    into v_count, v_profile_id
  from public.profiles
  where lower(email) = lower('dher@forwarders.app')
    and rol = 'Admin'::public.user_role
    and status = 'Aprobado'
    and is_active is true;

  if v_count <> 1 then
    raise exception 'Se esperaba exactamente un perfil Admin activo de Hernova';
  end if;

  update public.profiles
  set is_platform_admin = true
  where id = v_profile_id;

  if not found then
    raise exception 'No se pudo configurar el Administrador Supremo';
  end if;
end
$grant_platform_admin$;

select ticket_prefix, support_email, enabled
from public.support_settings
where singleton is true;

select email, rol, status, is_active, is_platform_admin
from public.profiles
where is_platform_admin is true;

commit;
```

La cuenta de Hernova debe existir y estar aprobada antes de ejecutar el bloque.
No sustituirla por un administrador propiedad del cliente.

## UAT en Demo

### Vista del usuario en Demo

Demo bloquea intencionalmente los privilegios de plataforma y los correos.
Habilitar tickets sólo durante una ventana de prueba controlada, validar la
vista del usuario interno y volver a dejar `enabled = false` al terminar.

Como usuario interno normal:

1. Abrir `Mesa de ayuda` desde el sidebar.
2. Crear un ticket Normal y otro Crítico.
3. Confirmar numeración con el prefijo configurado.
4. Adjuntar un PDF y una imagen desde una respuesta.
5. Cerrar sesión, abrir el enlace directo y confirmar retorno al mismo ticket.
6. Intentar abrir un ticket como usuario `Cliente`; el módulo no debe aparecer
   ni la base debe permitir crear/leer tickets.

### Administración en entorno local aislado

Las acciones de Administrador Supremo se prueban localmente con el sentinel en
modo `production`; nunca cambiar el sentinel compartido de Demo para saltarse
sus protecciones.

Como Administrador Supremo:

1. Ver todos los tickets de esa instalación.
2. Cambiar estado, prioridad y responsable.
3. Agregar una respuesta pública.
4. Agregar una nota interna.
5. Confirmar que el usuario normal ve la respuesta pública, pero no la nota ni
   sus adjuntos.
6. Marcar Resuelto y responder después como usuario normal; debe reabrirse en
   `En revisión`.
7. Marcar Cerrado; ninguna cuenta debe poder agregar mensajes hasta que soporte
   lo reabra.

Correos en Demo permanecen bloqueados. Para validar entrega real, repetir un
ticket controlado en un Preview autorizado con una clave separada, o después de
aprobar la salida a Producción.

## Salida a Producción

1. Respaldar la base del proyecto objetivo.
2. Confirmar la lista exacta de migraciones pendientes con dry-run.
3. Confirmar que se ejecuta desde `main` y que el dry-run no incluye ninguna
   migración exclusiva de Demo.
4. Ejecutar la configuración transaccional de prefijo y Administrador Supremo.
5. Desplegar la rama que contiene la interfaz.
6. Crear un ticket controlado y confirmar:
   - correo a `soporte@forwarders.app`;
   - enlace al dominio correcto;
   - respuesta de Hernova al creador;
   - outbox en estado `sent` y con `resend_message_id`.

## Desactivación segura

Si aparece un problema después del despliegue, no eliminar tablas ni tickets.
Desactivar nuevas altas conservando la evidencia:

```sql
update public.support_settings
set enabled = false,
    updated_at = now()
where singleton is true;
```

Después se puede volver al deployment anterior de Vercel. Los datos y adjuntos
permanecen disponibles para diagnóstico y una activación posterior.
