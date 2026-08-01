# Runbook del ambiente demo

Este procedimiento prepara el sandbox compartido de demostraciones y entrega un solo par de accesos por cliente. Está bloqueado al proyecto Supabase `wlssekvxpfxhwedsjhpz`; no usa el proyecto enlazado por Supabase CLI y no lee ni escribe archivos `.env`.

## Resultado esperado

- Dataset ficticio y repetible `atlas-forwarding-demo-v1`.
- Empresa demo estable: `Atlas Forwarding Demo`, UUID `10000000-0000-4000-8000-000000000001`.
- Datos manejables para recorrer cotizaciones, pricing, una operación FCL, facturación y Miami.
- Cinco slots disponibles, cada uno con un par `Admin`/`Cliente`:
  - `demo-admin-01@forwarders.app` + `demo-cliente-01@forwarders.app`
  - hasta el mismo patrón para los slots `02`, `03`, `04` y `05`.
- Cada ejecución del aprovisionador toca únicamente el slot indicado, genera contraseñas nuevas y extiende sus dos perfiles por 72 horas.
- Las dos cuentas del slot reciben el mismo `demo_access_grant_id` nuevo. Por eso las aceptaciones de términos de una entrega anterior no habilitan la entrega nueva.
- La cuenta `Cliente` siempre queda asociada a Atlas; nunca se aprovisiona con `cliente_id=NULL`.
- El reset asegura un actor técnico reservado, `demo-bootstrap@forwarders.app`. Su contraseña aleatoria no se muestra, Auth queda bloqueado por un año renovable y su perfil permanece `Rechazado`, inactivo y no-demo; nunca se entrega ni tiene acceso operativo.

## Protecciones del reset

El reset se divide deliberadamente en dos llamadas de servidor: armar y consumir.

1. Sólo `service_role` puede invocarlas.
2. La URL, el sentinel y ambas funciones exigen el project ref exacto `wlssekvxpfxhwedsjhpz`.
3. Se exige escribir `RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz` en una terminal interactiva.
4. El armado activa `reset_enabled`, genera un nonce nuevo y abre una ventana de cinco minutos.
5. El reset consume ese nonce una sola vez y ejecuta limpieza, seed y validaciones dentro de una transacción.
6. La limpieza usa una lista explícita de tablas. No usa `CASCADE` ni reinicia secuencias; una dependencia futura no incluida hace fallar el reset en vez de borrar más datos.
7. Si la siembra falla, se revierten los cambios operativos, se desarma el reset, se rota el nonce y el dataset queda marcado como no listo.
8. `provision-users.mjs` se niega a tocar Auth si el sentinel no confirma la versión, fecha y cliente exactos del dataset listo.

El reset elimina y reemplaza datos operativos, catálogos comerciales demo, `company_settings` y `email_templates`. Conserva expresamente:

- `auth.users`;
- `profiles` y su historial de cambios de rol;
- `leads`;
- `demo_terms_acceptances`;
- `demo_access_events`;
- la fila privada `platform_environment`.

Antes de borrar clientes, el RPC se detiene si algún perfil está asociado a un cliente distinto de Atlas. Nunca intenta corregir esa situación automáticamente.

### Storage no se purga

Los objetos de Supabase Storage no se borran: eliminar sólo sus filas SQL no garantiza eliminar los blobs. El reset fuerza como privados los buckets conocidos `avatars`, `booking-documents`, `proveedor-docs` y `miami-package-photos`; además, una política restrictiva bloquea todo acceso a Storage en demo, incluso lectura. El script informa cuántos objetos fueron preservados y cuántos buckets cambió a privados. Si el proyecto tuvo archivos reales, deben purgarse posteriormente mediante la API administrativa de Storage o desde Studio antes de reclasificarlo o compartir archivos.

## Prerrequisitos de una sola vez

1. Trabajar desde la raíz de este repositorio con las dependencias instaladas.
2. Aplicar en orden al proyecto demo:
   - `supabase/migrations/20260731190000_demo_environment_foundation.sql`
   - `supabase/migrations/20260731213000_demo_reset_and_seed.sql`
   - `supabase/migrations/20260731214000_booking_tracking_url_hardening.sql`
   - `supabase/migrations/20260731215000_demo_storage_hardening.sql`
3. Confirmar visualmente que el destino de la migración es `wlssekvxpfxhwedsjhpz`. No aplicar estas migraciones de operación demo a un proyecto de cliente.
4. En la configuración de Supabase Auth del proyecto demo, desactivar `Allow new users to sign up` y conservar evidencia de la verificación. Bloquear `/register` y `/portal/register` en la aplicación no sustituye este ajuste: un tercero todavía podría llamar directamente al endpoint de Auth y crear filas en `auth.users`/`profiles`.
5. Obtener la clave `service_role` o `secret` de ese proyecto. No usar la anon key, una clave de producción ni una clave de cliente.
6. Revisar en Studio que ningún perfil esté vinculado a un cliente ajeno a Atlas:

```sql
select id, email, rol, cliente_id
from public.profiles
where cliente_id is not null
  and cliente_id <> '10000000-0000-4000-8000-000000000001'::uuid;
```

Si aparecen filas, detenerse y revisarlas manualmente. No se debe sortear esta protección para conservar usuarios o datos reales dentro del sandbox.

## 0. Configurar el deployment Preview de la rama `demo`

La Demo no usa `vercel --prod`. En el mismo proyecto Vercel ya enlazado al
repositorio, crea variables **Preview limitadas a la rama `demo`**. No cambies
las variables Production de `main`.

| Variable | Valor para Preview / rama `demo` |
|---|---|
| `APP_ENV` | `demo` |
| `NEXT_PUBLIC_APP_ENV` | `demo` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wlssekvxpfxhwedsjhpz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key del proyecto demo |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret/service role del proyecto demo |
| `NEXT_PUBLIC_SITE_URL` | `https://demo.forwarders.app` |

En el Dashboard de Vercel usa **Settings -> Environment Variables -> Preview ->
Branch `demo`**. Si se usa CLI, cada comando solicita el valor de forma
interactiva; el tercer argumento limita la variable a esa rama:

```powershell
vercel env add APP_ENV preview demo
vercel env add NEXT_PUBLIC_APP_ENV preview demo
vercel env add NEXT_PUBLIC_SUPABASE_URL preview demo
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview demo
vercel env add SUPABASE_SERVICE_ROLE_KEY preview demo
vercel env add NEXT_PUBLIC_SITE_URL preview demo
```

Marca la clave de servicio como sensible y no la copies a variables públicas.
El build de esta rama se niega a compilar si falta una variable, si las URLs no
son exactas o si una clave JWT legacy declara otro project ref.

En **Domains**, agrega `demo.forwarders.app` y asígnalo al entorno Preview con
Git branch `demo`. Conserva `main` como Production Branch. Después de hacer
push de `demo`, valida que el deployment muestre `Source: demo`; no pulses
Redeploy sobre un deployment de Production para publicar la Demo.

## 1. Preparar la sesión de PowerShell

Configura los secretos únicamente en la terminal actual. `Read-Host` evita escribir la clave en el historial:

```powershell
$env:DEMO_SUPABASE_URL = 'https://wlssekvxpfxhwedsjhpz.supabase.co'
$env:DEMO_SUPABASE_SERVICE_ROLE_KEY = Read-Host 'Service role/secret del proyecto demo'
```

No hace falta definir `DEMO_CLIENT_ID`: el aprovisionador resuelve automáticamente el UUID estable de Atlas. Si se define por compatibilidad operativa, sólo acepta exactamente:

```powershell
$env:DEMO_CLIENT_ID = '10000000-0000-4000-8000-000000000001'
```

## 2. Reiniciar y sembrar el dataset

No ejecutar este paso mientras otro prospecto esté usando el sandbox compartido, porque reemplaza sus datos operativos visibles.

```powershell
node .\scripts\demo\reset-and-seed.mjs
```

La terminal debe mostrar el proyecto, lo que se preserva y el dataset que instalará. Autoriza escribiendo exactamente:

```text
RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz
```

El resultado correcto termina con `RESET DEMO COMPLETADO`, la versión `atlas-forwarding-demo-v1`, el UUID de Atlas, conteos del dataset y la cantidad de objetos Storage preservados. No continúes si el comando termina con error.

## 3. Aprovisionar sólo el slot asignado

Escoge un slot libre entre `01` y `05`. Mantén fuera del repositorio un registro mínimo de slot, prospecto y vencimiento para evitar entregar el mismo slot a dos clientes.

Ejemplo para el slot `01`:

```powershell
node .\scripts\demo\provision-users.mjs --slot 01
```

Autoriza escribiendo exactamente la frase que incluye ese slot:

```text
PROVISIONAR DEMO SLOT 01 wlssekvxpfxhwedsjhpz
```

Para otro slot, cambia `01` en el comando y en la frase. El script nunca rota
los diez usuarios: sólo modifica el par seleccionado. Reutilizar un slot
bloquea primero ambas cuentas, reemplaza las dos contraseñas anteriores, genera
un grant compartido nuevo, elimina las sesiones anteriores e invalida la
aceptación de términos previa para esa pareja. Los perfiles sólo se activan
juntos después de verificar el par completo.

Las contraseñas sólo viven en memoria y aparecen una vez al final. Cópialas de inmediato a un gestor seguro. No tomes capturas, no redirijas la salida, no las pegues en tickets y no las agregues al repositorio.

Si ocurre un error, el script no muestra ninguna contraseña e intenta dejar
ambas cuentas Auth bloqueadas y sus perfiles inactivos. Si el mensaje indica
que el cierre automático también falló, bloquea manualmente las dos cuentas del
slot en Supabase antes de continuar. Corrige la causa y repite exactamente el
mismo slot; no intentes completar la pareja manualmente con otro grant.

## 4. Verificar antes de entregar

**Gate obligatorio:** la Demo permanece `BLOQUEADA` para terceros hasta confirmar que el signup público está desactivado en Supabase Auth. No entregar credenciales basándose únicamente en que las rutas de registro no aparecen en la interfaz.

En Supabase Studio, verifica el sentinel:

```sql
select environment, project_ref, reset_enabled, reset_armed_at,
       dataset_version, dataset_seeded_at, dataset_client_id
from public.platform_environment
where singleton is true;
```

Debe cumplir todo lo siguiente:

- `environment='demo'`;
- `project_ref='wlssekvxpfxhwedsjhpz'`;
- `reset_enabled=false` y `reset_armed_at IS NULL`;
- `dataset_version='atlas-forwarding-demo-v1'`;
- `dataset_seeded_at` no es nulo;
- `dataset_client_id='10000000-0000-4000-8000-000000000001'`.

Verifica el par aprovisionado, sustituyendo `01` si corresponde:

```sql
select email, rol, status, is_active, cliente_id,
       is_demo_user, demo_expires_at, demo_access_grant_id,
       is_platform_admin
from public.profiles
where lower(email) in (
  'demo-admin-01@forwarders.app',
  'demo-cliente-01@forwarders.app'
)
order by email;
```

Las dos filas deben estar aprobadas, activas y vigentes, marcadas como demo, con el mismo grant no nulo y `is_platform_admin=false`. Sólo `Cliente` debe tener el UUID de Atlas; `Admin` conserva `cliente_id=NULL`.

Luego prueba en una ventana privada:

1. Inicia sesión como Admin, acepta los términos y recorre dashboard, cotizaciones, pricing, operación, factura y Miami.
2. Cierra sesión por completo.
3. Inicia sesión como Cliente, acepta los términos y confirma que sólo ve Atlas y los datos ficticios del portal.
4. Confirma que los PDF y pantallas muestran identificación de demo y que Storage permanece inaccesible.

No es necesario hacer redeploy para repetir reset/seed o rotar un slot. Sí deben estar desplegados previamente el código y las migraciones que implementan el ambiente Trial.

## 5. Entrega y siguiente demostración

Entrega solamente:

- la URL del deployment demo;
- las dos credenciales del slot asignado;
- la fecha y hora de vencimiento indicada por el script;
- la advertencia de que todos los datos y contactos son ficticios.

Para otra demostración:

- si no hay evaluadores activos, vuelve a ejecutar reset/seed y aprovisiona el slot que vas a entregar;
- si existe una evaluación activa, no reinicies el dataset compartido; coordina la ventana o usa otro slot sobre el dataset vigente;
- al reutilizar un slot, aprovisiónalo nuevamente para rotar ambas contraseñas y el grant.

## Recuperación segura

- Confirmación escrita incorrecta: no se modifica nada.
- Error durante seed: no aprovisionar usuarios. Revisa el mensaje, corrige la causa y repite el reset completo.
- Mensaje `ERROR ADICIONAL` al desarmar: inspecciona `platform_environment`; no aprovisiones mientras `reset_enabled=true` o los marcadores del dataset estén vacíos.
- Sentinel `customer`, project ref distinto o perfiles ligados a otro cliente: detenerse y revisar el proyecto correcto. No editar el script para eludir la guarda.
- Error del aprovisionador: no se entregan credenciales. Confirma que ambas
  cuentas Auth estén bloqueadas y ambos perfiles inactivos; luego repite el
  mismo slot.

## Limpiar la terminal

Cuando termines, cierra la terminal o elimina sus variables:

```powershell
Remove-Item Env:DEMO_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:DEMO_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:DEMO_CLIENT_ID -ErrorAction SilentlyContinue
```

Las variables `DEMO_*` son temporales. No se agregan a `.env.local`, Vercel, notas, salidas de CI ni scripts auxiliares. Las variables normales del deployment se administran por separado.
