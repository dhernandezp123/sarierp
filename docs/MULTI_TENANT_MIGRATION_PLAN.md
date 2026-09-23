# Plan de migración multiempresa

## Objetivo

Convertir la instalación actual de Sari Express en la primera empresa de una
plataforma multiempresa, sin interrumpir el uso operativo actual y sin desplegar
cambios durante la preparación.

Resultado objetivo:

```text
forwarders.app       -> sitio público de la plataforma
sari.forwarders.app  -> Sari Express
mya.forwarders.app   -> MYA Cargo Logistics (futuro)
```

Todos los subdominios usarán el mismo código. La separación de datos se hará en
PostgreSQL mediante `tenant_id`, claves foráneas y RLS; el hostname únicamente
resolverá la empresa visible y nunca sustituirá la autorización de base de datos.

## Restricciones de esta iniciativa

- No ejecutar despliegues de aplicación durante las fases de preparación.
- No ejecutar migraciones contra el proyecto Supabase vinculado o producción.
- No usar `db push`, SQL Editor remoto, `vercel --prod` ni acciones equivalentes.
- No modificar ni recalcular cotizaciones, facturas, pagos o snapshots existentes.
- Mantener los estados, RPC atómicos y reglas operativas vigentes.
- Cada fase debe quedar validada localmente antes de avanzar.
- Sari será el tenant inicial y todo dato existente deberá pertenecer a Sari antes
  de hacer obligatorio `tenant_id`.
- Ningún segundo tenant se habilitará hasta aprobar las pruebas negativas de RLS.

## Decisiones de arquitectura

### Identidad de empresa

Se crearán estas entidades:

- `tenants`: identidad estable de cada empresa (`id`, `slug`, estado y metadatos).
- `tenant_domains`: hostnames permitidos y su tenant correspondiente.
- `profiles.tenant_id`: empresa del usuario. Un perfil operativo pertenecerá a una
  sola empresa en la primera versión.
- `company_settings.tenant_id`: una configuración corporativa por tenant.

Los administradores de plataforma conservarán `is_platform_admin`, pero esto no
les dará acceso general automático a los datos de todas las empresas. Las acciones
de soporte transversal deberán tener permisos explícitos y auditoría.

### Resolución del tenant

1. `proxy.ts` normaliza el hostname y extrae el slug permitido.
2. La aplicación resuelve ese slug contra `tenant_domains`/`tenants`.
3. Después del login se comprueba que el tenant del hostname coincide con el del
   perfil autenticado.
4. RLS obtiene el tenant efectivo desde `auth.uid()` y `profiles`; no confía en un
   header, cookie, parámetro o `tenant_id` enviado por el navegador.
5. Un dominio desconocido, inactivo o reservado falla cerrado y no usa Sari como
   fallback.

### Integridad entre empresas

- Las tablas propiedad de una empresa tendrán `tenant_id NOT NULL` al finalizar
  su migración.
- Toda tabla tendrá índice por `tenant_id` y los índices únicos de negocio se
  revisarán para que sean por empresa.
- Las relaciones críticas impedirán referencias cruzadas entre tenants mediante
  claves compuestas o triggers validados, según el caso.
- Las RPC derivarán el tenant del usuario o validarán que todos sus registros
  pertenecen al mismo tenant. No aceptarán un `tenant_id` confiando en el cliente.
- Las numeraciones de cotización, invoice, shipment, booking, HBL y documentos
  serán independientes por tenant.
- Las rutas de Storage comenzarán con el tenant propietario y sus políticas
  verificarán tanto la ruta como el registro relacionado.

## Estado de las fases

| Fase | Nombre | Estado inicial | Efecto en producción |
| --- | --- | --- | --- |
| 0 | Inventario y contrato de seguridad | Inventario inicial completado; auditoría profunda en curso | Ninguno |
| 1 | Fundación aditiva de tenants | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 2 | Identidad, configuración y branding de Sari | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 3 | Comercial: clientes, cotizaciones y pricing | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 4 | Operaciones y documentos | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 5 | Finanzas, catálogos y numeraciones | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 6 | Portal, archivos, correos y APIs | Implementada y validada solo en Supabase local | Ninguno mientras no se despliegue |
| 7 | Resolución por subdominio y experiencia visual | Implementada y validada solo en entorno local | Ninguno mientras no se despliegue |
| 8 | Certificación local y paquete de corte | Pendiente | Ninguno; despliegue fuera de alcance |

## Fase 0 — Inventario y contrato de seguridad

Objetivo: congelar el alcance antes de escribir SQL.

Entregables:

- Clasificar cada tabla como global, propiedad de tenant o de soporte de
  plataforma.
- Construir el grafo de claves foráneas para definir el orden de backfill.
- Inventariar políticas RLS, RPC `security definer`, triggers, secuencias e índices
  únicos afectados.
- Inventariar buckets y políticas de Storage.
- Inventariar textos, logos, correos y URLs que todavía asumen Sari.
- Definir pruebas negativas con dos tenants, todos los roles y `anon`.
- Definir consultas de preflight y postflight que no muten datos.

Criterio de salida:

- Ninguna tabla o función con datos empresariales queda sin clasificación.
- Existe una matriz que indica cómo se obtiene o hereda `tenant_id` para cada
  tabla.
- Se identifica cualquier fila huérfana antes de preparar backfills.

Hallazgos iniciales:

- `profiles` no tiene `tenant_id`.
- `company_settings` se consume como singleton mediante `.limit(1)`.
- `proxy.ts` no resuelve hostname.
- Existen referencias directas a Sari Express en interfaz, PDFs y correos.
- Los buckets `booking-documents`, `miami-package-photos`,
  `miami-package-documents`, `proveedor-docs` y `support-attachments` requieren
  revisión explícita.
- El esquema contiene decenas de RPC que deben conservar atomicidad y validar
  tenant en el servidor.

## Fase 1 — Fundación aditiva de tenants

Objetivo: introducir el modelo sin cambiar todavía las consultas funcionales.

Trabajo local:

- Crear una migración nueva para `tenants` y `tenant_domains`.
- Reservar slugs de infraestructura como `www`, `api`, `admin`, `support`, `mail`
  y `app`.
- Crear el registro determinista de Sari (`slug = 'sari'`) de forma idempotente.
- Agregar `tenant_id` nullable a `profiles` y `company_settings`.
- Backfill lógico de ambas tablas hacia Sari dentro de la migración.
- Crear helpers SQL iniciales: `current_tenant_id()`,
  `is_current_tenant(uuid)` y validaciones para plataforma.
- Agregar pruebas SQL transaccionales para creación, slug único, dominio único y
  resolución de perfil.

En esta fase no se reemplazan todavía las políticas existentes ni se hace
`tenant_id` obligatorio. Es una base aditiva y reversible.

## Fase 2 — Identidad, configuración y branding de Sari

Objetivo: eliminar la noción de configuración corporativa global.

Estado local al 21/09/2026: completada para la configuración corporativa. La
migración no se ha aplicado al proyecto vinculado ni a producción.

Trabajo:

- Hacer única `company_settings.tenant_id`.
- Cambiar los consumidores de `.limit(1)` para solicitar la configuración del
  tenant autenticado.
- Crear un proveedor de contexto de tenant para Server y Client Components.
- Incorporar nombre comercial, logo, colores y datos fiscales del tenant.
- Centralizar fallbacks; Sari no será el fallback de un hostname desconocido.
- Migrar los textos comerciales y operativos hardcodeados que deban ser
  configurables.
- Conservar el branding de plataforma (`Forwarders ERP`) separado del branding
  de la empresa usuaria.

Criterio de salida:

- Toda la interfaz actual sigue mostrando Sari con los mismos datos.
- No existe una lectura ambigua de `company_settings`.
- Un contexto sin tenant válido falla cerrado.

Implementación validada:

- `company_settings.tenant_id` es obligatorio y único; las políticas RLS dejan
  lectura completa únicamente al personal interno del tenant y escritura al
  Admin activo del mismo tenant. No existe una policy permisiva de borrado.
- `get_current_company_settings()` conserva RLS para los módulos internos y
  `get_current_company_branding()` expone al portal solo identidad, contacto,
  logo, colores y dirección Miami del tenant autenticado.
- Todas las lecturas de la aplicación pasan por un loader centralizado; solo la
  pantalla de configuración conserva `INSERT`/`UPDATE`, ambos con `tenant_id`
  derivado del perfil autenticado.
- Se incorporaron `primary_color` y `secondary_color` con validación hexadecimal
  y edición desde Configuración de empresa.
- La prueba transaccional Sari/MYA cubre aislamiento de lectura y escritura,
  Cliente, Admin de tenant, administrador de plataforma y `anon`, y finaliza con
  `ROLLBACK`.

Límites deliberados:

- La aplicación global de colores, logo y metadatos según hostname se hará en la
  Fase 7 junto al resolver de subdominios; en esta fase solo se persiste y entrega
  branding seguro por tenant.
- `surcharge_rules` y los demás catálogos continúan globales hasta la Fase 5.
- MYA aparece únicamente como tenant temporal en pruebas con rollback. No se
  habilita un segundo tenant mientras comercial, operaciones y finanzas sigan
  pendientes de aislamiento.

## Fase 3 — Comercial: clientes, cotizaciones y pricing

Objetivo: aislar el flujo Cotización -> Pricing sin cambiar reglas de negocio.

Estado local al 21/09/2026: completada para el núcleo comercial. Las migraciones
no se han aplicado al proyecto vinculado ni a producción.

Orden sugerido:

1. `clientes`, direcciones, historial, tarifas y notas de cliente.
2. `quotations`, historial y change logs.
3. `quotation_containers` y `quotation_cargo_lines`.
4. `agent_quotes`, tarifas de contenedor y `pricing_items`.
5. Opciones comerciales, snapshots y sus items.
6. Actividades, leads y notificaciones relacionadas.

Trabajo:

- Agregar y rellenar `tenant_id` desde el padre canónico.
- Adaptar índices únicos y claves foráneas.
- Endurecer RLS por tenant y rol.
- Revisar RPC de creación, reemplazo de líneas, selección atómica, repricing y
  aceptación de opciones.
- Verificar que los snapshots comerciales permanecen congelados.
- Probar que Sari no cambia resultados, totales, estados ni PDFs.

Implementación validada:

- Se agregó `tenant_id NOT NULL` a 19 tablas de clientes, CRM, cotizaciones,
  pricing, agentes y opciones comerciales. El backfill deriva ownership desde el
  padre canónico y utiliza Sari únicamente para registros históricos sin padre.
- Cada raíz recibe el tenant desde el perfil activo y cada hijo lo hereda de su
  cliente, cotización, agente, tarifa u opción. Los guards cubren `INSERT`,
  `UPDATE` y `DELETE`, incluidas mutaciones dentro de RPC `SECURITY DEFINER`.
- Claves foráneas compuestas impiden asociar clientes, agentes, tarifas,
  contenedores, pricing, snapshots y perfiles de empresas diferentes incluso en
  operaciones confiables que omitan RLS.
- `codigo_cliente` y `quotation_number` son únicos por tenant. La generación de
  secuencias independientes continúa reservada para la Fase 5.
- Se endurecieron los helpers canónicos `can_*_cliente` y `can_*_quotation` y
  las policies vigentes sin cambiar el modelo de roles ni las transiciones.
- La matriz transaccional prueba Sari/MYA, Ventas, Pricing, Cliente, administrador
  de plataforma, `anon`, RPC atómicas, snapshots, referencias de actor y borrado
  cross-tenant; finaliza con `ROLLBACK`.

Reclasificaciones deliberadas:

- `client_rate_catalog` es configuración compartida/configurable y se aislará en
  la Fase 5, no como hijo de un cliente.
- `client_notifications` y `client_email_deliveries` pertenecen al cierre de
  portal/correos de la Fase 6.
- `leads` recibe solicitudes desde la landing pública de Forwarders ERP. Su
  ownership se resolverá con el contexto público de plataforma/dominio en las
  Fases 6 y 7; no se le asigna Sari silenciosamente.

## Fase 4 — Operaciones y documentos

Objetivo: propagar el tenant sin romper el flujo aceptado.

Estado local al 21/09/2026: completada para operaciones, documentos y Miami. Las
migraciones no se han aplicado al proyecto vinculado ni a producción.

Incluye:

- Shipments y eventos operativos.
- Shipping Instructions y handoffs.
- Bookings, contenedores, cutoffs, readiness y revisiones de itinerario.
- BL, contenedores, enmiendas, drafts y excepciones.
- Miami: paquetes, prealertas, manifiestos, embarques, incidencias y eventos.
- Garantías, VGM y documentos operativos.

Cada creación derivará el tenant del expediente padre. Se conservarán las RPC
atómicas existentes y se agregarán pruebas que intenten asociar IDs de dos
empresas diferentes.

Implementación validada:

- Se agregó `tenant_id NOT NULL` a 27 tablas: 19 del expediente operativo y 8
  de la operación Miami. `miami_carriers` permanece deliberadamente en Fase 5
  como catálogo configurable.
- Shipping Instructions y shipments validan cotización, cliente, opción y
  perfiles; bookings, eventos, cutoffs, readiness, BL, VGM y documentos heredan
  el tenant de su padre canónico mediante claves foráneas compuestas.
- Manifiestos y embarques Miami son raíces; paquetes, prealertas, incidencias,
  documentos, eventos y asociaciones de embarque impiden referencias entre
  empresas.
- Las 27 tablas tienen guards de `INSERT`, `UPDATE` y `DELETE`, incluso dentro
  de RPC `SECURITY DEFINER`, y una policy RLS restrictiva que se combina con las
  reglas de rol, Cliente y Demo ya existentes.
- Los helpers de acceso a shipment, Shipping Instruction, booking, BL y paquete
  Miami, junto con `booking_operational_mode()` y `get_billing_work_queue()`,
  fallan cerrados fuera del tenant autenticado.
- La unicidad de routing, shipment, HBL, manifiesto, warehouse y embarque Miami
  quedó acotada por tenant. La generación independiente de secuencias y
  contadores sigue reservada para la Fase 5.
- La prueba transaccional cubre Sari/MYA, Ventas, Operaciones, Contabilidad,
  Cliente, administrador de plataforma y `anon`; ejerce RPC canónicas de
  shipment, booking, eventos y Miami, referencias cruzadas, borrado por RPC y
  lectura de la cola de facturación, y finaliza con `ROLLBACK`.

Límites deliberados:

- Las rutas y policies de Storage de documentos se conservan para la Fase 6.
- Finanzas, proveedores, catálogos y contadores no se modifican en esta fase.
- MYA continúa siendo un tenant temporal de pruebas y no queda habilitada para
  operación real.

## Fase 5 — Finanzas, catálogos y numeraciones

Objetivo: separar documentos fiscales, saldos y configuración operativa.

Incluye:

- Invoices, items, receivables, pagos, splits, cuentas por pagar y pagos a
  proveedor.
- CAI y lugar de emisión.
- Proveedores, agentes y catálogos configurables.
- Plantillas de correo, impuestos, productos, carriers y surcharge rules.
- `document_sequences` y `hbl_number_counters` por tenant.

Pruebas obligatorias:

- Números iguales pueden existir en tenants distintos cuando el negocio lo
  permita, pero nunca duplicados dentro del mismo tenant.
- No se puede aplicar un pago, nota o costo a un documento de otra empresa.
- Los cierres y snapshots históricos no se recalculan durante el backfill.

Implementación validada:

- Se agregó `tenant_id NOT NULL`, guard de fila e isolation policy restrictiva a
  20 tablas de finanzas, proveedores, CAI, catálogos y contadores.
- Facturas, items, pagos, splits, costos, cuentas por pagar y documentos de
  proveedor heredan o validan el tenant mediante claves foráneas compuestas.
- La unicidad de invoice, CAI activo, plantillas, productos, carriers y reglas
  configurables quedó acotada por tenant, sin recalcular importes ni snapshots.
- `document_sequences` y `hbl_number_counters` ahora usan claves compuestas por
  tenant. Cliente, cotización, routing, proforma, HBL y numeraciones Miami
  consumen contadores independientes conservando el formato visible de Sari.
- Las RPC atómicas de facturación, pagos, reversos, cuentas por pagar y CAI, los
  helpers de autorización y `invoice_receivables` fallan cerrados fuera del
  tenant autenticado.
- La prueba transaccional Sari/MYA permite el mismo número o código en empresas
  distintas, rechaza duplicados internos y asociaciones cruzadas, y finaliza
  con `ROLLBACK`.

Límites de esta fase:

- No se desplegó SQL ni aplicación; MYA sigue siendo únicamente un tenant
  temporal de pruebas.
- Portal, Storage, correos enviados y Route Handlers con `service_role` se
  mantienen para la Fase 6.

## Fase 6 — Portal, archivos, correos y APIs

Objetivo: cerrar rutas que pueden eludir RLS o filtrar identidad empresarial.

Trabajo:

- Aislar perfiles Cliente, notificaciones, pickups y portal por tenant.
- Prefijar rutas nuevas de Storage con `tenant_id` y planificar la compatibilidad
  de archivos existentes.
- Revisar políticas de lectura, carga y borrado de todos los buckets.
- Validar tenant en Route Handlers que usan `service_role`.
- Generar invitaciones, recuperación, enlaces y correos con el dominio primario
  del tenant.
- Mantener soporte de Hernova separado de los datos operativos del cliente.
- Probar que ninguna URL firmada o attachment cruza empresas.

Implementación validada:

- Se agregó `tenant_id NOT NULL`, guard de escritura y policy restrictiva a las
  8 tablas de auditoría/portal pendientes y a las 5 tablas tenant-scoped de la
  mesa de soporte. `support_settings` permanece global de Hernova.
- El directorio de `profiles` y sus actualizaciones administrativas quedaron
  acotados al tenant. Los administradores de plataforma conservan acceso
  transversal únicamente para atender soporte.
- Los buckets privados de Booking, documentos y fotos Miami, proveedor y
  attachments de soporte validan ruta, registro padre y tenant. Las cargas
  nuevas usan `tenant_id/recurso/...`; las rutas legacy solo se leen si todavía
  se pueden relacionar con un registro visible del tenant actual.
- El bucket público de avatares conserva su clasificación pública, pero sus
  altas, reemplazos y borrados exigen la ruta `tenant_id/auth.uid()/...`.
- Los cuatro Route Handlers con `service_role` validan el tenant antes de leer
  Auth, paquetes, tickets o auditorías. Invitaciones, enlaces de paquetes y de
  soporte usan el dominio primario activo del tenant.
- El correo Miami toma nombre y respuesta comercial de `company_settings`; la
  mesa de ayuda conserva deliberadamente la identidad de Forwarders ERP/Hernova.
- La prueba transaccional Sari/MYA demuestra aislamiento de auditoría, soporte
  y Storage, junto con el acceso explícito de plataforma, y finaliza con
  `ROLLBACK`.

Límites deliberados:

- El resolver de hostname, registro público ligado al dominio, callbacks de
  autenticación y aplicación visual global pertenecen a la Fase 7. Hasta que
  esa fase se complete, las solicitudes públicas nuevas no deben habilitarse en
  un segundo tenant.
- Avatares continúan siendo activos públicos no sensibles; no se usan para
  documentos ni datos operativos.
- No se desplegó SQL ni aplicación y MYA sigue existiendo solo dentro de pruebas
  con rollback.

## Fase 7 — Subdominio y experiencia visual

Objetivo: activar localmente la resolución `sari.forwarders.app` sin habilitarla
en DNS ni producción.

Trabajo:

- Agregar un resolver puro y probado para hostnames.
- Integrarlo en el único `proxy.ts` de Next.js 16.
- Pasar contexto validado a layouts y rutas sin usarlo como autorización final.
- Rechazar dominios desconocidos, tenants inactivos y slugs reservados.
- Adaptar login, onboarding, logout y callbacks para conservar tenant.
- Probar hosts locales equivalentes (`sari.localhost`) y solicitudes con `Host`
  manipulado.
- Verificar navegación, portal, PDFs, tema, logo y metadatos.

Implementación validada:

- Un resolver puro normaliza `Host`, puertos y aliases locales; reconoce
  `sari.forwarders.app`, `sari.localhost` y un alias local explícito, y rechaza
  slugs reservados, hosts ambiguos, suffix injection y dominios desconocidos.
- El único `src/proxy.ts` elimina cualquier header de tenant enviado por el
  navegador, resuelve la identidad mediante un RPC público de campos limitados
  y propaga headers internos solo después de validar tenant y dominio activos.
- El hostname sigue siendo contexto visual: layouts, login, portal, onboarding
  y callback comparan `profiles.tenant_id`, mientras toda autorización de datos
  continúa derivándose de `auth.uid()` y RLS.
- El alta pública envía el hostname canónico; el trigger Auth resuelve el tenant
  activo y registra perfil y aceptación legal bajo la misma empresa. Las
  invitaciones conservan su tenant confiable y los dominios inactivos fallan
  cerrados.
- Nombre, logo, colores y metadatos se aplican desde el contexto de tenant en
  login, portal y shell interno. Los PDFs comerciales/operativos sustituyen la
  identidad de Sari por el branding cargado del tenant.
- `localhost` apunta a Sari únicamente como alias explícito de desarrollo; en
  producción no existe fallback de hostname. Puede configurarse con
  `LOCAL_TENANT_HOSTNAME`, sin exponerlo al navegador.

Límites deliberados:

- No se configuró DNS, wildcard TLS, Vercel ni variables de producción, y las
  migraciones no se aplicaron al proyecto Supabase vinculado.
- El landing de `forwarders.app` sigue siendo plataforma. Rutas de acceso ERP o
  portal en el dominio raíz fallan cerrado hasta entrar por un dominio de tenant.
- MYA continúa existiendo solo dentro de pruebas transaccionales con rollback.
  Su alta real, datos, dominio y configuración quedan fuera de esta fase.

## Fase 8 — Certificación local y paquete de corte

Objetivo: dejar una versión candidata lista para una ventana futura, sin
desplegarla.

Validaciones mínimas:

- `npx.cmd tsc --noEmit`.
- Suite completa `npm.cmd test`.
- ESLint dirigido y luego completo, diferenciando deuda histórica.
- `npm.cmd run build`.
- Migraciones desde cero en Supabase local.
- Upgrade desde una copia local del esquema actual.
- Pruebas SQL de RLS para `anon`, Cliente, Ventas, Pricing, Operaciones,
  Contabilidad, Finanzas, Admin y administrador de plataforma.
- Matriz cruzada Sari/MYA: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, RPC y Storage.
- Pruebas de integridad y conteos antes/después del backfill.
- UAT local del flujo Cotización -> Pricing -> Shipment -> SI -> Booking ->
  Operación -> Facturación.

El paquete de corte documentará migraciones, orden, duración estimada, respaldo,
preflight, postflight y rollback. Su ejecución en producción requerirá una
autorización posterior y una ventana separada.

Certificación técnica local ejecutada el 21/09/2026:

- Instalación limpia correcta con 99 migraciones hasta `20260921190000`.
- Upgrade correcto desde `20260918200000` con un expediente ficticio y conteos
  idénticos en 15/15 tablas antes/después del backfill.
- Siete suites SQL multiempresa correctas; cubren todos los roles previstos,
  cruces Sari/MYA, RPC y Storage.
- `db lint` sin errores, 138/138 pruebas de aplicación, TypeScript limpio y
  build de 73/73 páginas.
- ESLint dirigido de la capa tenant limpio. El lint global mantiene deuda
  existente (212 errores y 41 warnings) fuera del cambio SQL de esta fase.
- Evidencia: `docs/uat/multi-tenant-phase8-local-certification.md`.
- Matriz manual: `docs/uat/multi-tenant-phase8-manual-uat.md`.
- Runbook: `docs/MULTI_TENANT_CUTOVER_RUNBOOK.md`.
- Cierre incremental del 22/09/2026: se corrigió el acceso de la cuenta de
  plataforma a la mesa de soporte desde `forwarders.app`, sin concederle rutas
  operativas ni permitir crear tickets. Suite 139/139, TypeScript, ESLint
  dirigido y build 73/73 correctos; smoke de rutas de plataforma correcto.

Pendiente para cerrar formalmente la fase:

- UAT visual autenticado por rol sobre una copia reciente de Production.
- Ensayo de duración y preflight con volumen representativo.
- Autorización separada para cualquier SQL remoto, despliegue, DNS o TLS.

## Matriz inicial de propiedad

La clasificación final se cerrará en Fase 0. La base inicial es:

- Global de plataforma: versiones legales y referencias geográficas realmente
  compartidas.
- Propiedad de tenant: perfiles operativos, clientes, comercial, pricing,
  operaciones, Miami, finanzas, catálogos configurables, branding y documentos.
- Soporte de plataforma: configuración y conversaciones de soporte; los tickets
  deberán identificar el tenant solicitante sin conceder acceso transversal a
  sus datos de negocio.
- Revisión caso por caso: países, puertos, tipos de contenedor, tipos de paquete y
  carriers, porque pueden ser catálogo global con extensiones por tenant.

## Condiciones que bloquean el avance

- Filas huérfanas que impidan determinar el tenant propietario.
- Una RPC `security definer` que permita actuar sobre IDs sin validar ownership.
- Una tabla expuesta sin RLS o con políticas globales incompatibles.
- Storage sin forma verificable de relacionar el objeto con su tenant.
- Pruebas negativas que permitan cualquier lectura o escritura cruzada.

Ninguna de estas condiciones se resolverá relajando RLS o usando el hostname como
fuente de autorización.
