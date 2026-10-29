# Sari Express ERP — Hardening y Trial

### 2026-10-29 - UX-FORM-01 - Formularios con etiqueta arriba y registro de Compras

- Estado: publicado en Producción y Pruebas; revisión autenticada pendiente. No
  modifica SQL, permisos, RPC ni datos.
- Hallazgo (reportado por el usuario en Compras > Registrar documento): las
  etiquetas `<label>Texto<select/></label>` sin clase dejaban el texto en línea y
  el `select` (máx. 448 px) a su lado; "Oficina emisora" mostraba dos etiquetas
  (`BillingOfficeSelect` traía la suya, también en línea en los cuatro
  formularios de clientes); tres tamaños de etiqueta; grilla única con huecos;
  líneas sin bloque; sin marcas de obligatorio; total suelto. Auditoría del repo:
  52 etiquetas con `select` al lado y 145 con campo sin separación en 45
  archivos; etiquetas separadas no `block` en Pricing (`labelClass`), Cobranza y
  reporte de operaciones.
- Cambios: `FormField`/`FormSection` en `src/components/ui/form-field.tsx`
  (antes vacío) y `fieldLabelClass`, `fieldStackClass`, `formSectionTitleClass`
  en `ui-classes.ts`. Compras rediseñada con el patrón de `/quotations/new`:
  secciones Documento / Datos del proveedor (boleta) / Líneas, cada línea como
  bloque numerado con importe y "Quitar", resumen Subtotal/ISV/Total y acciones a
  la derecha; listado con `Pagination` y enlaces de marca. Misma lógica de
  guardado y validación. `BillingOfficeSelect` recibe `label` y `required`.
  ~170 etiquetas apiladas en 45 archivos (Contabilidad, Facturación, Operaciones,
  Cotizaciones, Plataforma, portal) con el texto en `fieldLabelClass`, sin
  `mt-*` redundante ni negrita heredada por el control; `labelClass` de
  `src/lib/ui.ts` pasa a `block`; `InvoiceLineSettings` usa la misma etiqueta;
  Activos y Asientos usan `Pagination`. Excepciones intencionales sin cambio:
  filtros en línea "Ver"/"Mostrar" (dashboard, detalle de cotización), botón
  "Importar CSV", descuento en línea de `invoicing/new` y campo USD de la
  comparación FCL. Skill: `ui-conventions.md` agrega la sección "Formularios" y
  `SKILL.md` la referencia.
- Demo: mismo cambio; `InsuranceCalculationDialog.tsx` es variante revisada
  (marca de agua de impresión) y el manifiesto de paridad actualiza sus huellas
  en ambas ramas.
- Validaciones: `npx tsc --noEmit`; `npm test` 511/511; `lint:ci` 517
  archivos, 223 históricos, 0 regresiones. Navegador (fixture fuera de Git,
  Chrome headless): Compras factura a 1280 y 768 px, boleta USD y retención a
  1280 px; Nuevo cliente; Activos; Asientos; Caja y bancos; Cuentas por cobrar.
  Escaneo final: solo quedan las excepciones intencionales.
- Commits funcionales: main `dc5b25e`, demo `1c5bf19` (cherry-pick limpio).
  Demo: `tsc`, `npm test` 517/517, `lint:ci` 530 archivos sin regresiones y
  paridad 547 compartidos / 26 variantes / 0 diferencias. `npm run build` local
  aprobado en main.
- Publicación: Vercel Production `sarierp-r77o4fzs5` (commit `dc5b25e`, alias
  `sari.forwarders.app`) y Preview `sarierp-h8t51xn28` (commit `1c5bf19`, alias
  `demo.forwarders.app`) en Ready; `/login` 200 y `/accounting/purchases` 307 al
  login en ambos.
- CI: Quality `40937926397` (main) aprobado en aplicación y base de datos;
  paridad `40937931508` (demo) aprobada (la de main se canceló por el grupo de
  concurrencia compartido). Quality `40937931558` (demo): aplicación aprobada;
  base de datos falló al descargar imágenes Docker (`toomanyrequests: Data limit
  exceeded`) antes de ejecutar SQL; el commit no incluye SQL.
- Pendiente: revisión autenticada en Compras (registro real de factura, boleta y
  retención) y en formularios de Operaciones, que no se renderizaron en el
  fixture.

### 2026-10-29 - CI-SQL-02 - Evitar gateways innecesarios en las pruebas SQL

- Estado: verificado en CI de main y Demo; todas las suites SQL/RLS aprobadas.
- Archivos: .github/workflows/quality.yml en main y Demo. No cambia SQL ni
  servicios desplegados. El arranque de CI excluye Kong y PostgREST, que no
  utilizan las fixtures ejecutadas directamente con docker exec / psql.
  Se conserva la inicialización de Auth/Storage, todas las migraciones,
  suites completas, comprobaciones de salud y limpieza de la pila desechable.
- Motivo: CI Trial falló dos veces antes de ejecutar SQL por límites de descarga
  de ECR/GHCR y fallbacks inexistentes de Kong/PostgREST. No fue fallo de las
  pruebas: 34/34 SQL main pasó en CI y 10/10 Trial pasó localmente.
- Validación: revisión de los runners, sin peticiones HTTP a esos servicios;
  referencia: https://supabase.com/docs/reference/cli/supabase-start.
- Verificación: Quality main 40932807229 y Demo 40932813644 aprobados; paridad
  40932813618 aprobada. Commits CI main 94805c72f540d7f1d72bfb525f451de3a7661790
  y Demo 843d452cf9a50ae183be67e3ace7480f89678f7e; sin cambios de negocio ni datos.

### 2026-10-29 - ACC-SERVICE-01 - Cuentas contables por servicio y variante fiscal

- Estado: publicado y verificado técnicamente en Production y Trial.
  UAT autenticada con Zonia pendiente.
- Configuración: contador de conceptos únicos pendientes, ingresos, costos/gastos
  y clasificación; búsqueda por código/nombre y secciones separadas para cargos
  y familias operativas. Variantes I, E y Exonerada independientes y estables;
  se configuran solo las variantes/lados aplicables, exclusivamente por el máster.
  No se asignan cuentas ambiguas ni costos por suposición. No se activa contabilidad.
- Archivos: src/lib/service-accounting.ts, src/hooks/useServiceAccounting.ts,
  src/components/accounting/ServiceAccountingAssignments.tsx,
  src/components/invoicing/InvoiceLineSettings.tsx, src/lib/invoice-drafts.ts,
  src/app/(protected)/accounting/settings/page.tsx,
  src/app/(protected)/accounting/purchases/page.tsx,
  src/app/(protected)/invoicing/new/page.tsx.
- SQL: supabase/migrations/20261029180000_service_accounting_assignments.sql;
  dos tablas con RLS, FK por tenant, RPC máster con revisión y auditoría atómicas.
  El servicio exacto de pricing se conserva; una familia solo aplica al flete.
  Facturas/compras guardan sus cuentas al emitir. Cambiar asignaciones no modifica
  históricos; un servicio sin cuenta guardada no se contabiliza con un ingreso
  global supuesto. Se admite cuenta explícita válida para referencias retiradas.
- Pruebas: tests/service-accounting.test.mjs y
  supabase/tests/service_accounting_assignments.sql; registradas en los runners
  SQL de main y Demo. 511/511 Node, 34/34 SQL Production, 10/10 SQL Trial,
  más revalidación de la última versión de variantes en ambas bases aisladas.
  TypeScript en ambos, ESLint sin regresiones y ambos builds aprobados.
  Seis comprobaciones en navegador con datos ficticios (escritorio/móvil,
  búsqueda, filtros, variantes, guardado/error, permiso máster), sin errores.
  Paridad: 547 archivos compartidos y 26 variantes revisadas, cero diferencias.
- Incluye UX-FIN-04 pendiente: once combobox de cuentas operativas, sin alterar
  sus filtros, IDs ni RPC. Evidencia privada: .ua/intermediate/service-account-release-20261029/.
- Riesgos/pendientes: Zonia debe definir auxiliares de costos/gastos y confirmar
  los códigos I/E de ADUANA; no se cargan asignaciones reales. Emulación de
  navegador no equivale a iPad físico ni UAT. Trial conserva sus bloqueos de
  correo y usa datos ficticios; no se transfieren catálogos ni secretos.
- Publicación técnica verificada: migración 20261029180000 aplicada en ambos
  ambientes, MD5 2d985f0244f99735688bde9e6d3b6a16. Huellas de 131 tablas
  originales de Production y 134 de Trial preservadas en la transacción; sin
  cambios de usuarios, permisos anteriores, CAI/correlativos ni otras migraciones.
  Contabilidad automática desactivada; cero asignaciones reales precargadas.
  Production conserva 714 cuentas / 572 auxiliares. Trial no recibe el catálogo real.
- Despliegues Vercel Ready: Production dpl_DCmKBm2FfXEJY9Q4Bz4szJbUGEZ9 y
  Preview dpl_B3Nh5UHrwMifyU8yBv5X8Tf3ggEP. sari.forwarders.app y
  demo.forwarders.app coinciden con sus manifests inmutables; 23/29 checks HTTP
  sin sesión aprobados, incluidas protección de rutas/API y restricciones Demo.
  Un 503 inicial de Trial no se reprodujo en consultas individuales ni en el
  smoke completo posterior. Estas comprobaciones no son UAT autenticada.
- CI Quality de ambos aprobado (aplicación y SQL/RLS) y paridad vigente aprobada.
  El primer job SQL Trial falló descargando Kong por límites de registro Docker;
  se corrigió el arranque CI excluyendo Kong/PostgREST sin quitar pruebas ni
  inicialización Auth/Storage (CI-SQL-02). La ejecución
  de paridad inicial de main fue cancelada por su grupo compartido; la última
  compara ambas ramas y pasó. Logs y manifiestos en la evidencia privada.
- Código publicado: main 8c1a372fc8ddc6ab794f39c13eca52725f39739d;
  demo 3184eeb8822f1578da5dca3e1c9a0835c00c9d1d.

### 2026-10-29 - UX-FIN-04 - Combobox buscable en configuración de cuentas

- Estado: implementado en main y Demo; validación funcional, visual y builds
  locales aprobados. Publicado con ACC-SERVICE-01; aceptación autenticada pendiente.
- Archivo: `src/app/(protected)/accounting/settings/page.tsx` en ambos árboles.
  Los once selectores nativos de cuentas operativas usan `CompactSelect` con
  búsqueda explícita por código/nombre, sin distinguir mayúsculas ni tildes.
  Lista con desplazamiento y tamaño acotados; código/nombre y nivel/naturaleza;
  etiquetas asociadas al campo, manejo de teclado, foco y «Sin configurar».
- Se conservan los filtros de cuenta activa/de movimiento y naturaleza por uso,
  incluido Costo para compras. Mismas identidades de cuentas y RPC de guardado;
  no se activa la contabilidad ni se cambian fechas, permisos o SQL. Los controles
  se deshabilitan durante el guardado. Máster y usuario por oficina ya disponían
  de combobox con búsqueda y se reutilizan sin duplicarlos.
- Validaciones: 506/506 Node, TypeScript y ESLint de la página en ambos árboles.
  Página y controles reales renderizados con 714 cuentas ficticias: siete
  comprobaciones de búsqueda, elegibilidad, guardado, limpieza, teclado/Escape y
  menús en 1280/768/390 px y oscuro, sin errores en la ejecución final.
  Fixture/capturas privados en `.ua/intermediate/settings-combobox-validation/`;
  emulación de dispositivo, no prueba física de iPad/Safari ni UAT autenticada.
- Paridad de código aprobada: 543 compartidos, 26 variantes, cero diferencias.
- Builds main y Demo aprobados. El build local Demo usa los placeholders
  no funcionales ya utilizados para compilar ese ambiente, sin credenciales
  reales ni acceso autenticado remoto; no es evidencia de UAT.
- Publicación técnica completada con ACC-SERVICE-01. Pendiente:
  aceptación autenticada. Se conservan separados los cambios CAI-CONFIRM-03 ya
  aplicados; no se vuelve a ejecutar su migración ni se alteran datos reales.

### 2026-10-29 - CAI-CONFIRM-03 - Restaurar TGU a los rangos registrados 000-001

- Estado: aplicado y verificado en Producción y Pruebas (registro de Codex);
  fuente versionada en main `a80bbff` y demo `8c26c5d`. Validación SQL de CI y
  aceptación autenticada con Zonia pendientes.
- El propietario confirmó expresamente restaurar TGU 000-001. SPS conserva
  001-001. Zonia ya es el máster individual aprobado y activo; el bloqueo era la
  oficina 000-000 frente a sus tres rangos 000-001 conservados por la corrección anterior.
- SQL nuevo: `supabase/migrations/20261029170000_restore_tgu_registered_cai_prefix.sql`.
  Conserva las migraciones aplicadas, valida rangos/documentos y cambia únicamente
  el punto de emisión TGU. No deshabilita triggers, no activa rangos, no cambia
  CAI, límites, fechas, correlativos, permisos ni cuentas. Auditoría administrativa
  sin suplantar al máster. Instalación vacía/Pruebas no recibe configuración real.
- Regresión: `supabase/tests/tgu_restore_registered_cai_prefix.sql`; reproduce
  el bloqueo, restaura la oficina, compara cada campo CAI, comprueba idempotencia,
  deniega al usuario no máster y permite reactivar los tres documentos al máster
  sin consumir números. Runners `scripts/validate-audit-sql.mjs` y, en Demo,
  `scripts/validate-demo-sql.mjs`, con acceso ficticio propio del ambiente.
- Validaciones: SQL/RLS local en ambas bases dentro de rollback; ensayos remotos
  conservan todas las filas originales, Auth, funciones, políticas, triggers,
  permisos e historial de migraciones; CAI y numeración íntegros. Sin cambio de UI.
- Aplicación atómica: solo cambia el código TGU y se añade una auditoría con
  usuario nulo; la transacción compara todas las filas originales bajo bloqueo.
  Postflight: 131/134 tablas con RLS, funciones y permisos intactos, siete CAI
  originales iguales y tres TGU inactivos; Pruebas conserva cero CAI y sus oficinas
  sin códigos. Fuente aplicada idéntica en ambos historiales (MD5
  `d780f06a0e216a03d47de8804df77b70`). TypeScript en ambos árboles, ESLint de
  runners, diff y paridad aprobados: 543 compartidos, 26 variantes, cero diferencias.
- Entre la instantánea inicial y la aplicación, un usuario actualizó un cliente
  y registró su historial; la hora de esa operación precede a la restauración.
  Esa edición se preservó y no forma parte de la transacción de mantenimiento.
- Commit y publicación (29/10/2026): MD5 de la fuente confirmado antes del commit
  (`d780f06a0e216a03d47de8804df77b70`), idéntica en ambas ramas; ningún workflow
  aplica migraciones. Local: TypeScript, `npm test` 506/512, `lint:ci` sin
  regresiones y paridad 0 diferencias. El Supabase local tiene un esquema anterior
  (sin `billing_offices`) y no se modificó, por lo que la prueba SQL no se pudo
  ejecutar localmente. CI Quality `40915293175` (main) y `40915300401` (demo):
  application aprobado; database falló dos veces al descargar imágenes Docker
  (`toomanyrequests: Data limit exceeded`) antes de ejecutar SQL. Paridad
  `40915300561` aprobada. Vercel: Production commit `a80bbff`
  (`sarierp-fa2y6hijd`) y Preview commit `8c26c5d` (`sarierp-bjjekqtjg`) `READY`,
  alias verificados; login 200. Frontend sin cambios funcionales.
- Pendiente: relanzar el job database cuando el registro lo permita y confirmar
  `tgu_restore_registered_cai_prefix.sql` en ambos; activación por Zonia y
  aceptación autenticada.

### 2026-10-29 - UX-FIN-03 - Navegación de Anulaciones y formularios de Configuración contable

- Estado: publicado en Producción y Pruebas; revisión autenticada pendiente. No
  modifica SQL, permisos ni datos.
- Hallazgos reportados por el usuario tras UX-FIN-02 (revisión visual omitida
  antes de publicar):
  - La pestaña "Anulaciones" de `AccountingNav` llevaba a `/invoicing/voids`,
    que no muestra la barra contable: las pestañas desaparecían.
  - `/accounting/settings`: cada etiqueta quedaba en línea con su `select`
    (limitado a 448 px), con filas escalonadas y recuadros pegados al texto desde
    ~1100 px; tarjetas superiores de 768 px frente a inferiores a todo el ancho;
    fecha de inicio a todo el ancho. Maquetación previa a UX-FIN-02, no detectada.
  - Anulaciones a 768 px: campo de búsqueda desalineado por etiqueta de dos líneas
    y paginación dentro del desplazamiento horizontal de la tabla.
  - `/invoicing`: el enlace "Estado de cuenta completo" y el selector "Por
    facturar / Documentos emitidos" eran elementos en línea contiguos y quedaban
    pegados (ya ocurría antes de UX-FIN-02; el botón pasó a enlace sin separarlos).
- Cambios: `src/app/(protected)/accounting/voids/page.tsx` reexporta la página
  de Anulaciones; esta detecta `/accounting` para mostrar `AccountingNav` con la
  pestaña activa y eyebrow Contabilidad (sin el acceso a Facturación). Desde
  Facturación no cambia. `AccountingNav` apunta a `/accounting/voids`.
  Configuración: etiquetas `flex flex-col`, rejilla de dos columnas con separación,
  máster y oficinas lado a lado desde `xl`, fecha `max-w-xs`, títulos uniformes.
  Anulaciones: filtros `items-end`, etiquetas en columna y paginación fuera del
  área desplazable. Facturación: selector y enlace en una fila `flex-wrap`
  con separación (selector a la izquierda, reporte a la derecha) y `aria-pressed`
  en el selector; Demo conserva su marca de agua y el manifiesto de paridad
  actualiza las huellas de `invoicing/page.tsx` en ambas ramas. Skill: `ui-conventions.md` agrega la regla de etiquetas, la
  ruta contable de Anulaciones y la verificación visual obligatoria.
- Validaciones: `npx tsc --noEmit`; `npm test` 506/506; `lint:ci` 513 archivos,
  223 históricos, 0 regresiones; `npm run build` con `/accounting/voids`.
  Navegador: fixture fuera de Git (`.ua/intermediate/fin-fixture`) con las
  páginas reales, `globals.css`, sesión Admin y Supabase sintéticos por alias de
  webpack; Chrome headless a 1280 y 768 px. Revisadas Configuración (antes y
  después), Anulaciones en Contabilidad y Facturación, Cuentas, Asientos,
  Compras, Activos, Caja y bancos, Cuentas por cobrar, Estado de proveedores,
  Libros y Facturación (antes y después a 1600, 1280 y 768 px). Tipografía del fixture distinta a la app (sin fuente cargada).
- Pendiente: revisión autenticada en Producción y móvil real; Chrome headless no
  baja de 504 px de viewport y la captura a 390 px no es válida.
- Commits funcionales: main `4b38840`, demo `9a55358`; push de ambos sin SQL.
- CI: Quality `40909464676` (main) aprobado; paridad `40909465437` (demo)
  aprobada; la de main `40909464562` quedó cancelada por el grupo de
  concurrencia. Quality `40909465431` (demo) falló solo en el job database al
  descargar imágenes Docker (`toomanyrequests`, límite del registro); application
  aprobó y el job relanzado terminó aprobado, sin cambios de código.
- Publicación: Vercel Production `dpl_CmDEzinTjDmMSPm2RTdcVZQPVxwP`, `READY`,
  commit `4b38840`, alias `sari.forwarders.app`; Preview
  `dpl_FmgcCy3vSkN7dew1mtypcsrsLG4E`, `READY`, commit `9a55358`, alias
  `demo.forwarders.app`. Smoke sin sesión en ambos: login 200 y
  `/accounting/voids` 307 a login.

### 2026-10-29 - UX-FIN-02 - Coherencia visual de Finanzas y Contabilidad (fase 1)

- Estado: publicado en Producción y Pruebas; revisión autenticada en navegador
  pendiente. No modifica SQL, permisos, RPC, cálculos, estados ni datos.
- Hallazgo: tres estilos de cabecera (azul en Facturación, marca en Cobranza con
  eyebrow fijo "Facturación · Gestión financiera" incluso en Caja/Proveedores, y
  `h1` sin descripción en Contabilidad); doble padding en Contabilidad/Cobranza;
  cinco modales `fixed inset-0` sin foco atrapado ni Escape; formateadores
  locales de fecha/moneda; `type="number"` sin `NumberInput`; tres paginaciones;
  enlaces azules; "Estados de cuenta" titulado "Cuentas por cobrar" con pestañas
  contables sin pestaña activa; filas de documentos abribles solo con mouse;
  selector de año del cierre fijo en 2024–2027; aviso de quitar línea de factura
  siempre en "USD" aunque el documento fuera HNL.
- Cambios:
  - `FinanceWorkspace.tsx`: `FinancePageHeader` con `eyebrow`, descripción y
    acciones opcionales; `financeLinkClass`.
  - Cabecera única en Facturación, Borradores, Anulaciones, Cobranza, Estados de
    cuenta, Cuentas por cobrar/proveedores, Caja y bancos y las seis páginas de
    Contabilidad (`accounts`, `assets`, `books`, `journal`, `purchases`,
    `settings`); se retira el padding duplicado.
  - `Dialog` en Cierre del período y Estado de cuenta (`invoicing/page.tsx`) y en
    Registrar pago, Pago de contado registrado y Reversar pago
    (`invoicing/[id]/page.tsx`); no se cierran mientras se guarda o reversa.
  - `formatMoney`/`formatDate(…, '—')` en listado, detalle y nueva factura. El
    precio unitario conserva sus decimales adicionales.
  - `NumberInput type="number"` en Cobranza, nueva factura, pagos del detalle,
    asientos, compras, activos y montos de CxP.
  - `Pagination` en Anulaciones, recibos de Cobranza y reportes de cartera.
  - Enlaces de marca en Facturación, Contabilidad, anulación fiscal, correcciones
    y CxP; número de factura enlazado y enfocable con teclado.
  - `/invoicing/statements` titulado "Estados de cuenta", sin `AccountingNav`.
  - Años del cierre derivados de los documentos y del año actual.
  - Aviso de quitar línea con la moneda del documento.
- Fuera de alcance (fases siguientes): reorganizar la navegación de Finanzas,
  unificar accesos al estado de cuenta, acción principal y menú en Facturación,
  Dashboard Financiero (rentabilidad cotizada), prellenar TC en Cobranza, cierre
  mediante el exportador financiero y monedas fijas HNL/USD en selectores.
- Pruebas: `tests/supplier-payment-flow.test.mjs` simula `NumberInput` como
  `input`, igual que `tests/page-harness.mjs`; los demás tests no cambian.
- Skill: `skills/sari-erp-maintenance/SKILL.md` enlaza la nueva
  `references/ui-conventions.md`; `module-map.md` separa Facturación/cobranza,
  Contabilidad/tesorería y Pagos/costos e incluye las pruebas SQL financieras.
- Validaciones: `npx tsc --noEmit` aprobado; `npm test` 506/506;
  `npm run lint:ci` 512 archivos, 223 diagnósticos históricos, 0 regresiones;
  `npm run build` aprobado. SQL/RLS no aplica (sin cambios de base).
- Pruebas (`demo`): mismos archivos; `invoicing/page.tsx` conserva su variante
  revisada (marca sandbox en la impresión del cierre) y el manifiesto
  `docs/quality/environment-parity.json` actualiza sus dos huellas en ambas ramas.
  `check-environment-parity.mjs`: 541 compartidos, 26 variantes revisadas, 0
  diferencias. Demo: TypeScript, `npm test` 512/512 y `lint:ci` (525 archivos,
  223 históricos, 0 regresiones). El build local de Demo exige claves reales del
  proyecto Demo y no se ejecutó; lo valida el build Preview de Vercel.
- Riesgos / pendientes:
  - Revisión visual en navegador (escritorio y móvil, claro/oscuro) de las
    pantallas citadas y de los cinco diálogos: solo hubo inspección de código.
  - El listado conserva la fila clicable; el enlace detiene la propagación.
- Revisión posterior (29/10/2026): la cabecera pasaba a fila desde 640 px con
  acciones `shrink-0`; en Facturación (seis acciones, sin sidebar bajo 1024 px)
  los botones salían de la vista y el título quedaba en 0 px. `FinancePageHeader`
  usa ahora `flex-wrap`, título `flex-1 basis-80` y acciones `max-w-full`
  envolventes. Medido en Chrome headless con el Tailwind del proyecto sobre la
  misma cabecera: antes, a 700/768 px, acciones hasta 863 px y título 0 px; a 1024
  px, título 57 px. Ahora, a 640/700/768/1024 px, sin desborde y título completo
  (286 px); las acciones bajan bajo el título. Falta revisión en la app real.
- Commits funcionales: main `c0b4d13c47bf1371832f2e91f2ccc12ab64c9554`, demo
  `4da6cb1b369aed1478f82d460b19d9a765553556`. Se hizo push de ambos sin SQL.
- CI: Quality `40901983813` (main) y `40901993850` (demo) aprobados. Paridad
  `40901993808` (demo, compara el nuevo `origin/main` con Pruebas) aprobada; la
  ejecución `40901984074` de main quedó cancelada por el grupo de concurrencia
  `environment-parity` al iniciar la de demo.
- Publicación: Vercel Production `dpl_HzMdt3YTGGCyCZpjLtzLVWwxFVdm`, `READY`,
  commit `c0b4d13`, URL `https://sarierp-qriyjndhu-claudherhn-5641s-projects.vercel.app`,
  alias `sari.forwarders.app` verificado. Pruebas: Preview
  `dpl_GDGbvE2jQZiD4DCKxapsoqNWszrV`, `READY`, commit `4da6cb1`, alias
  `demo.forwarders.app` verificado; Demo no usó destino de Producción. Smoke sin
  sesión en ambos dominios: login 200 y `/invoicing` 307 a login. No certifica
  la revisión autenticada de las pantallas.

### 2026-10-28 - ACC-IMPORT-PDF-01 - Catálogo contable importado desde PDF

- Estado: SQL aplicado en ambos ambientes y catálogo importado/verificado en Sari
  Producción. Aceptación autenticada con Contabilidad pendiente.
- Documento del propietario: 33 páginas, 714 códigos únicos y filas completas.
  Excel/CSV privados de revisión conservan código/nombre/nivel y página original;
  padres, clasificación y movimiento coinciden con las decisiones confirmadas.
- El propietario confirmó solo 572 Auxiliar de movimiento y las cinco relaciones
  según niveles/orden del PDF conservando códigos. Las otras 142 quedan sin
  movimiento; la habilitación de sus hojas se revisará después, sin anticiparla.
- Baseline: cero cuentas, cero asientos y configuración automática ausente. Carga
  atómica: 714 cuentas, 572 de movimiento y 142 sin movimiento; nombres, códigos,
  niveles y padres comparados íntegramente con el archivo confirmado.
- Implementación: `src/lib/accounting.ts`, `accounting-books.ts`, catálogo,
  configuración, compras y selector de cuentas en proveedores. CSV anterior
  compatible y nivel opcional; selectores de naturaleza/nivel/padre compactos.
- SQL nuevo: `20261028190000_account_catalog_structure.sql`, sin cuentas reales.
  Agrega Costo/Resultado/Orden y nivel; agrupadoras sin movimiento, padres mixtos
  de Resultado; compras/cuenta por defecto aceptan Costo y los asientos de Orden
  balancean independientemente. Estados financieros excluyen Orden e incluyen
  costos en el resultado. Plan: `docs/plans/sari-chart-of-accounts-import-20261028.md`.
- Regresiones: tests de catálogo/libros y `accounting_catalog_structure.sql`, con
  fixtures ficticios para ambos ambientes y runners de SQL correspondientes.
  Datos reales y artefactos permanecen fuera de Git en
  `.ua/intermediate/sari-account-catalog/`; no se copian a Pruebas.
- Validación: extracción de las 33 páginas, revisión visual de primera/última,
  unicidad, integridad de filas y jerarquía propuesta; consulta remota de solo
  lectura. Archivo confirmado validado con el parser real, padres antes de hijas,
  códigos textuales y 572/142. Aprobados: 506/512 Node, 32/8 SQL/RLS con rollback,
  TypeScript, lint y compilaciones de ambos árboles. Seis comprobaciones de
  navegador con 714 cuentas ficticias validan paginación/búsqueda, niveles,
  padre mixto, importación CSV y menú móvil acotado, sin errores de ejecución.
  Los fixtures financieros usan la zona de negocio Honduras; correo/seguridad
  conservan UTC. Esto evita que current_date UTC adelante los cortes nocturnos;
  no cambia fechas ni zona de sesiones de Producción. Paridad: 541 archivos
  compartidos, 26 variantes revisadas, sin diferencias inesperadas.
- Ensayos remotos con rollback y aplicación atómica: fuente de `20261028190000`
  verificada contra Git en ambos historiales; 131/134 tablas con RLS, usuarios,
  permisos, datos originales y migraciones previas conservados. Solo cuatro
  funciones contables previstas cambian; CAI/contadores y oficinas intactos.
- La carga real modifica únicamente `accounting_accounts` y añade una auditoría
  administrativa con usuario nulo, rol de base de datos, hash del PDF/archivo de
  carga, 714/572/142 y política confirmada; no suplanta a una persona. Los cinco
  niveles quedan 5/12/34/91/572. Pruebas conserva cero cuentas y sus propios datos.
  No se crearon saldos, asientos, períodos, clientes, proveedores o bancos ni se
  activó contabilidad automática. Las 91 hojas no Auxiliar permanecen sin movimiento.
- Commits funcionales: main `22f5deb`, Demo `0433e60`; registro final de fuente y
  aplicación en este mismo historial. Pendiente: UAT con Contabilidad y futura
  confirmación de movimiento para las hojas no Auxiliar; no anticipar esa decisión.

### 2026-10-28 - CAI-CONFIRM-02 - Confirmación posterior de prefijos por oficina

- Estado: SQL aplicado y verificado en Producción y Pruebas. Nueva autorización
  fiscal TGU y aceptación autenticada con Contabilidad pendientes.
- La confirmación vigente del propietario es TGU `000-000` y SPS `001-001`.
  Sustituye la confirmación anterior que motivó `20261028150000`, cuyo SQL ya
  aplicado e historial de publicación se conservan sin reescribir.
- Consulta remota de solo lectura: oficinas SPS `001-001`, TGU `000-001`;
  siete rangos con esos prefijos, seis con siguiente número superior al inicio
  y `ever_used=true`. No hay documentos fiscales en invoices, compras o
  retenciones vinculados a esos rangos; esto no descarta uso en el sistema anterior.
- `20261028180000_tgu_confirmed_fiscal_prefix.sql` corrigió únicamente TGU:
  desactiva sus rangos incompatibles conservando CAI, prefijos y correlativos,
  corrige la ficha a `000-000` y registra ambos efectos sin suplantar un usuario.
  SPS permanece intacta. No crea autorizaciones ni cambia numeración utilizada.
- La protección de códigos se omite solo para esa fila durante la transacción,
  con bloqueo de tabla, y se restaura antes de terminar. El ajuste aborta si
  aparecen documentos fiscales TGU, códigos desconocidos o un prefijo duplicado.
  Es idempotente; Trial sin rangos propios no recibe configuración real.
- Archivos: `HARDENING.md`, `docs/quality/cai-office-numbering.md` y
  `docs/release/accounting-finance-cai-2026-10-28.md`, en main y Demo.
  SQL nuevo: `supabase/migrations/20261028180000_tgu_confirmed_fiscal_prefix.sql`.
  Regresión: `supabase/tests/tgu_confirmed_fiscal_prefix.sql`, integrada en
  `scripts/validate-audit-sql.mjs` y el runner propio de Demo.
- Validación: consulta remota de solo lectura; migración real con fixtures y
  rollback en ambas bases locales; 31 suites SQL/RLS principales y siete Trial
  aprobadas. Verifica invariantes de CAI/SPS, auditoría,
  idempotencia, bloqueo por factura existente, código desconocido y reactivación
  de prefijo incompatible. TypeScript en ambos árboles y lint de los runners
  aprobados; paridad de 540 fuentes compartidas, 26 variantes, sin desvíos.
  El propietario autorizó expresamente aplicar y conservar el historial,
  incluyendo la desactivación de los tres rangos TGU incompatibles.
  Ensayos remotos con rollback y aplicación atómica en ambos ambientes:
  131/134 tablas verificadas, todas con RLS; usuarios, permisos, funciones,
  documentos e historial de migraciones anteriores conservados. Fuente aplicada
  idéntica a la confirmada en Git. Producción conserva siete CAI y sus números:
  solo desactiva tres TGU, registra tres eventos y una rectificación de oficina.
  Pruebas conserva cero CAI y toda su configuración propia, sin datos copiados.
- Commits funcionales: main `0280ca6`, Demo `a5bd22a`. La aplicación SQL está
  terminada; no se modificó código de interfaz. La CI Quality versionada ejecuta
  estas regresiones en bases desechables. Pendiente operativo: registrar la
  autorización SAR TGU `000-000` y realizar UAT con Contabilidad; no se inventan
  nuevos CAI, rangos, fechas ni siguientes números para reactivar la emisión.

### 2026-10-28 - RELEASE-FIN-20261028 - Publicación coordinada de finanzas, CAI y UX

- Estado: SQL y frontend publicados en Producción y Pruebas; CI y smoke aprobados.
  Aceptación autenticada con Contabilidad y configuración operativa pendientes.
  Registro: `docs/release/accounting-finance-cai-2026-10-28.md`.
- Alcance: FIN-REP-01, FIN-BANK-01/02, CAI-OFFICE-01, CAI-MASTER-01,
  CAI-ACCESS-01 y UX-SELECT-01. Seis migraciones nuevas, SQL antes del frontend.
- Baseline remoto renovado: Producción 113 tablas con RLS y siete rangos fiscales;
  máster individual preexistente elegible. Pruebas 116 tablas con RLS, sin CAI ni
  máster; configuración propia, sin copiar usuarios reales. Ambas ramas coinciden
  con sus referencias remotas y la paridad compartida está aprobada.
- Validaciones: 504/510 Node, 30/6 SQL/RLS con rollback, TypeScript, compilaciones,
  lint y navegador. Ensayos remotos con rollback y aplicación atómica por ambiente:
  seis fuentes SQL verificadas contra los commits; 113/116 tablas originales
  preservadas, usuarios/máster/CAI íntegros, solo reparación TGU y su auditoría.
  Postflight: 131/134 tablas públicas con RLS; ninguna función compartida ausente,
  40 funciones nuevas idénticas. Sin bancos, saldos o permisos de oficina sembrados.
  CI main `40780475897`, Demo `40780480535` y paridad `40780480542` aprobados.
  Vercel Ready en ambos; smoke de 22/28 rutas, noindex/bloqueos Demo, API bancaria
  anónima 401 y manifest de dominio idéntico al deployment inmutable.
- Emisión: conservar máster actual; las oficinas de los demás usuarios se
  habilitan individualmente desde Configuración. Sin asignaciones inferidas.
  UAT con Contabilidad y configuración operativa quedan explícitos. Commits
  funcionales: main `fdf54c5`, Demo `0d74b67` (incluyen `62b5954` / `d2ddf96`).

### 2026-10-28 - CAI-RELEASE-01 - Discrepancia de punto SAR detectada antes de publicar

- Estado: SQL aplicado y verificado en ambos ambientes; reparación TGU auditada
  únicamente en Producción. Ningún CAI, rango o correlativo fue modificado.
- El preflight actual encontró TGU `000-000`, mientras todos sus rangos tienen
  `000-001`, confirmado previamente por el propietario. `20261028150000` estaba
  pendiente en ambos ambientes; se refuerza antes de su primera aplicación.
- Solo se admite ese error conocido en la oficina Sari indicada, con rangos y
  documentos compatibles y sin otro dueño del prefijo. Los códigos no confirmados
  siguen rechazados. Reparación auditada en `activity_logs`, actor administrativo
  sin identidad humana; no altera CAI, fechas, estados ni siguientes números.
- `cai_office_backfill.sql` reproduce la migración canónica real en base desechable,
  verifica datos CAI completos y auditoría, y rechaza un código no confirmado.
  Runners main/Demo incorporan la fuente conservando sus delimitadores SQL.
  Casos de códigos vacíos/error confirmado/rechazo y 30/6 suites SQL con rollback.
  Fuente frontend sin cambios; no repite cambios de diseño o cálculos.
- El release comparó todas las filas originales y admitió solo la auditoría nueva
  de la reparación esperada. CI y smoke aprobados; UAT con Contabilidad pendiente.
  Hashes funcionales: `fdf54c5` / `0d74b67`.

### 2026-10-28 - UX-SELECT-01 - Selectores y paneles de configuración compactos

- Estado: publicado en main y Pruebas, build/CI/smoke aprobados; revisión con
  usuario pendiente. Este ajuste no modifica SQL, permisos ni cálculos financieros.
- Hallazgo: el formulario CAI se extendía al ancho disponible; el tipo ocupaba
  ambas columnas y su menú nativo producía un panel blanco desproporcionado.
  Inventario estático posterior: 222 selectores nativos restantes en 70 archivos.
- `CompactSelect.tsx` reutiliza `useDropdownPosition`: trigger/panel hasta 448 px,
  menú hasta 280 px con desplazamiento y opciones legibles, búsqueda por nombre
  y datos secundarios, teclado/foco y estado deshabilitado. Dentro de diálogos
  se mantiene en el árbol del modal para conservar la interacción y Escape.
- Nueve controles migrados: oficina/tipo CAI, máster, usuario autorizado, tipo
  fiscal y monedas/operaciones de equivalencia/conversión, hoja del extracto.
  `settings/cai/page.tsx`, `InvoiceMasterSettings.tsx`, `BillingOfficeAccessSettings.tsx`,
  `InvoiceFiscalOptions.tsx`, `BankReconciliationWorkspace.tsx`.
- `globals.css`: selectores simples nativos limitados a 448 px, conservando
  formularios/validación nativa y ajuste al contenedor. Listas múltiples/size
  explícito se conservan. Buscadores compartidos de clientes/agentes/cotizaciones
  hasta 512 px; navieras hasta 448 px, sin mínimo de popup que desborde en móvil.
- CAI: panel de edición hasta 768 px, fondo suave, cabecera/acento Sari, campos
  en dos columnas y una en móvil. Avisos y panel de acciones también acotados.
  Configuración de máster/oficinas y tratamiento fiscal usan paneles compactos.
- Validación: TypeScript y cinco pruebas del componente (teclado, búsqueda con
  acentos/datos secundarios, diálogo, bloqueo y Escape capturado antes del cierre
  del modal) aprobados. Suites completas: 504 Node main y 510 Pruebas. Lint dirigido
  de 14 archivos sin regresiones y build aprobados en ambos árboles. Navegador:
  ocho verificaciones locales con datos ficticios; CAI en 1676/1440/390 px, menú
  fiscal de 355 × 254 px en escritorio y 324 × 254 px en móvil, selección/foco,
  búsqueda, validación nativa requerida, usuarios y diálogo real de proforma;
  sin excepciones JavaScript. Los controles y menús caben en el ancho solicitado.
  Paridad: 539 archivos compartidos, 26 variantes revisadas, cero diferencias
  inesperadas. Diff check aprobado. Guía: `docs/quality/compact-selects-uat.md`.
- Pendiente: revisión con usuario en su navegador. Hashes funcionales:
  `fdf54c5` / `0d74b67`; fuente UX incluida en `62b5954` / `d2ddf96`.

### 2026-10-28 - CAI-MASTER-01 / CAI-ACCESS-01 - Correcciones, retiro y autorización individual por oficina

- Estado: migraciones y frontend publicados en ambos ambientes; RLS, CI y smoke
  aprobados. Configurar autorizaciones por usuario y UAT real pendientes.
  No se corrigió por inferencia ninguna fecha real del SAR.
- `20261028160000_cai_master_lifecycle.sql`: solo el máster individual designado
  puede registrar, corregir, activar, desactivar o eliminar CAI de su empresa.
  RLS mantiene la política restrictiva de aislamiento por tenant; Admin y
  Contabilidad sin designación no reciben escritura. Las RPC compatibles de
  activación también exigen máster; funciones internas sin acceso autenticado.
- Edición con motivo/revisión: fecha y rango corregibles, siguiente correlativo
  conservado cuando hay uso, identidad/prefijo/inicio y números utilizados protegidos.
  Una fecha corregida a vencida deja el CAI inactivo. Una renovación con otro
  CAI se registra aparte. No se recalculan snapshots de documentos emitidos.
- Eliminación lógica: requiere desactivar, conserva la fila y su consumo como
  historial de solo lectura; DELETE físico bloqueado. `cai_range_events` registra
  actor, motivo, fecha/hora, valores anteriores/nuevos y consumo. Sin escrituras
  autenticadas al historial. Pantalla muestra los últimos 100 movimientos.
- `20261028170000_user_fiscal_office_access.sql`: autorización por usuario y
  oficina mediante RPC exclusiva del máster, revisión y auditoría. El máster
  administra todas las oficinas activas; los demás requieren selección explícita.
  **Antes de habilitar emisión en el despliegue, autorizar oficinas a los usuarios
  existentes.** No se infiere su sede ni se otorgan ambas oficinas por defecto.
- Control de emisión en almacenamiento para Factura/NC/ND, boleta y retención:
  conserva resolución fiscal existente (cliente/documento original) y valida
  permiso del actor. Denegación revierte documento y consumo atómicamente.
  Borradores/consulta mantienen permisos del módulo; no amplía roles financieros.
- UI: `settings/cai/page.tsx`, `toggle-switch.tsx`, `permissions.ts`,
  `InvoiceMasterSettings.tsx`, `BillingOfficeAccessSettings.tsx`, configuración
  contable y formulario de nueva factura. Iconos con nombres accesibles, toggle
  de estado, motivo/confirmación, edición de vencidos y advertencia recuperable
  ante historial fallido; factura sin oficina autorizada puede guardarse borrador.
- Pruebas: `cai_master_lifecycle.sql`, fixtures financieros con máster explícito,
  `cai-lifecycle.test.mjs`, permisos y flujos de factura/borrador. 29 suites SQL/RLS
  principales y cinco Trial aprobadas con rollback (incluida desactivación de un
  CAI histórico activo/vencido). 499 pruebas Node main, 505 Trial y seis dirigidas
  posteriores aprobadas. TypeScript, lint sin regresiones y build en ambos árboles
  aprobados. Navegador local con datos ficticios: seis flujos de edición, estado,
  retiro/historial, consulta sin máster y autorización individual; escritorio y
  390 px sin desbordamiento ni errores de ejecución. Paridad local: 538 archivos
  compartidos, 26 variantes revisadas, sin diferencias inesperadas. Git diff check
  aprobado. Las bases desechables quedaron sin tablas nuevas tras rollback.
- Pendientes: configurar autorizaciones reales y probar con Contabilidad
  (corregir fecha contra autorización, activar,
  apoyar ambas oficinas y verificar PDF). Guía en `docs/quality/cai-office-numbering.md`.
  Sin datos de documentos fiscales modificados. Hashes: `fdf54c5` / `0d74b67`.

### 2026-10-28 - CAI-OFFICE-01 - Prefijos y series fiscales por oficina/tipo

- Estado: migración y frontend publicados en ambos ambientes; conservación de
  numeración verificada. UAT con Contabilidad pendiente. Véase CAI-RELEASE-01.
- Verificado en Producción y Prueba: asignación fiscal y activación filtran por
  tenant, oficina y tipo; índice único activo por esa combinación. Factura,
  NC/ND, boleta y retención no comparten contador entre oficinas. Guía de Remisión
  tiene su serie configurable; su emisión no tiene interfaz propia todavía.
- Hallazgo reproducido: registrar un rango con prefijo de SPS para TGU era
  aceptado, aunque fallaba al emitir. También podían repetirse códigos SAR en
  oficinas distintas o cambiarse los códigos dejando rangos incompatibles.
- Verificación inicial: dos oficinas, códigos vacíos y solo Factura registrada
  (SPS inactivo/TGU activo). El propietario confirmó SPS `001-001` y TGU `000-001`.
  Al publicar ya había siete rangos; se preservaron. La migración completa campos
  vacíos y la discrepancia TGU documentada en CAI-RELEASE-01 si todos los rangos
  existentes siguen coincidiendo. No modifica CAI, rangos, correlativos, estado
  activo ni documentos emitidos. Las autorizaciones de los demás tipos requieren
  captura real; no se crean ni se deducen a partir del CAI de Factura.
- SQL nuevo `20261028150000_cai_office_binding.sql`: valida prefijos en registro,
  activación e incremento; impide duplicar códigos de oficina y alterar códigos
  incompatibles con CAI/documentos. Cambios de oficina serializados por tenant;
  emisión conserva sus RPC atómicas originales y sus bloqueos por oficina/tipo.
- UI/helper: `settings/cai/page.tsx`, `cai-validation.ts`; prefijo/placeholder según
  oficina y tipo, comprobación antes de escribir y descarte de cargas obsoletas.
  Pruebas: `cai_office_numbering.sql`, fixtures de acceso/puntos de venta y pruebas
  Node; runners SQL de main/Prueba. Cambios compartidos preparados en ambas ramas.
- Validación: fallo original demostrado y suite nueva aprobada con diez emisiones
  ficticias (cinco tipos × dos oficinas), doce series activas, rotación aislada,
  NC de factura original y bloqueos de prefijo/códigos; 28 suites main y cuatro
  Prueba con rollback. Ensayo real de migración sobre configuración ficticia con
  códigos vacíos: comparación íntegra de CAI/contadores sin cambios. TypeScript,
  lint sin regresiones y build aprobados en main y Prueba; 492 pruebas Node main,
  13 dirigidas posteriores y 498 en Prueba aprobadas. Navegador con datos ficticios: prefijo cruzado
  bloqueado antes de guardar, oficina/tipo correctos y formulario móvil sin
  desbordamiento; sin errores de ejecución. Paridad local: 534 archivos
  compartidos y 26 variantes revisadas, sin diferencias inesperadas.
- Pendiente: probar con Contabilidad;
  registrar las autorizaciones SAR faltantes por oficina/tipo y revisar activación
  de rangos válidos. Sin emisión real ni cambios de numeración.
  Hashes funcionales: `fdf54c5` / `0d74b67`.

### 2026-10-28 - FIN-REP-01 / FIN-BANK-01 / FIN-BANK-02 - Plan de cartera, Caja/Bancos y conciliación

- Estado: etapas 1–5 publicadas en ambos ambientes; controles automatizados de
  etapa 6 y SQL/CI/smoke aprobados. UAT autenticado y configuración de saldos/cuentas
  pendientes; no se declara cierre operativo.
- Plan y decisiones: `docs/plans/contabilidad-caja-bancos-20261028.md`; mora por
  vencimiento (Actual no vencido), Excel con bloques en una hoja y únicamente
  firmas físicas. Guía de UAT/publicación en `docs/quality/finance-reporting-banks-uat.md`.
- SQL canónico nuevo: `20261028120000_finance_reporting_history.sql`,
  `20261028130000_treasury_accounts_and_cash.sql`,
  `20261028140000_bank_reconciliation.sql`. No se cambia SQL aplicado.
  Historial/operaciones protegidos por tenant y rol financiero activo/aprobado;
  tablas de solo lectura autenticada, escrituras por RPC atómicas, fuentes con
  idempotencia y reversos auditados. Funciones internas sin grants públicos.
- Reportes compartidos en `finance-report`, `financial-export`, `treasury-report`,
  `report-layout`, `xlsx`, hooks y workspaces de Contabilidad. CxC/CxP al corte,
  NC/ND y retenciones, pagos alcanzables en filtros, saldos corridos e históricos,
  monedas separadas, XLSX/PDF/CSV completos. Consolidado incluye recibos/anticipos
  una vez; Documentos solo descuenta pagos aplicados. Filtros de tipos conservan
  el saldo completo. Se conserva el resumen rápido actual de Facturación, con
  acceso explícito al reporte completo para corte/antigüedad/exportaciones.
- Caja/Bancos: apertura fechada sin semillas reales, tasas compra/venta y aplicada
  congeladas, banco/caja en recibos y pagos, retenciones sin efectivo, transferencias
  propias fuera del flujo externo, contabilización/reversos sobre el motor existente.
  Cobro reversado antes de contabilizar registra original y reverso atómicamente.
  No se activa contabilidad automática ni se altera moneda de cotizaciones.
- Conciliación: extractos manual/CSV/XLSX con vista previa, archivo limitado y
  parseo sin fórmulas/macros/vínculos; integridad ZIP, privacidad de API/tenant,
  detección de repetición/solapamiento con motivo para coincidencias aceptadas.
  Vínculos parciales/grupales no vuelven a contabilizar. Reportes versionados con
  cheques, depósitos, otras salidas, diferencia visible, nombres/líneas de firma;
  resumen general de conciliaciones. No existe flujo de aprobación bancaria.
- UX: componentes/combobox reutilizados, errores recuperables, exportación con
  encabezado/colores Sari, ancho PDF dentro de página, navegación móvil compacta.
  El ensayo de navegador usa exclusivamente datos ficticios y exportaciones locales.
- Validación final: 491 pruebas Node main y 497 Prueba (APP_ENV demo), 27 suites
  SQL/RLS main y tres Prueba con rollback. TypeScript, lint (223 diagnósticos
  históricos, cero regresiones) y build aprobados en ambas ramas. Build local
  Prueba con claves ficticias inutilizables y guardas de proyecto/dominio vigentes;
  no acredita autenticación remota. Paridad: 533 archivos compartidos, 26 variantes
  revisadas, cero diferencias inesperadas. Sin cambios persistentes en los ensayos.
  Navegador con compilación estable y datos ficticios: siete comprobaciones,
  escritorio 1500×1000/móvil 390×844, descargas PDF/XLSX y cero errores. Renderer
  financiero real: fila 505, columnas dentro de página y firmas en la última;
  XLSX de 650 filas, una hoja, subtotales, números, filtros y títulos de impresión.
  Se puede completar una contrapartida inicial omitida; se bloquea otra cuenta
  bancaria como contrapartida para evitar saldos contables sin movimiento nativo.
- Riesgos/pendientes: definir saldos, cuentas y fecha reales; revisar cuentas con
  movimientos previos antes de vincularlas; cobertura anterior reconstruida no
  certifica cortes más antiguos. Abrir Excel/firmar PDF, extractos representativos,
  UAT real. Publicación coordinada verificada; hashes funcionales:
  `fdf54c5` / `0d74b67` (incluyen `62b5954` / `d2ddf96`).

### 2026-10-28 - DEMO-PARITY-002 - Alinear Prueba con Producción sin mezclar entornos

- Estado: SQL y frontend publicados y verificados en ambos entornos; CI de
  aplicación y SQL/RLS aprobados. UAT autenticado pendiente.
- Commits funcionales: Production `8bf64c3`; Demo `b46aec4` (sincronización)
  y `62ea8e2` (marcas de impresión). Cierre documental en commit posterior.
- Inventario inicial real: Production del 27/10, 147 migraciones/110 tablas;
  Demo del 01/10, 88 migraciones/91 tablas, con 98 commits de main ausentes.
  Resultado: 148 migraciones compartidas, más 11 exclusivas de Demo. Todas las
  tablas públicas tienen RLS: 113/113 Production y 116/116 Demo.
- SQL: una migración nueva en Production y 71 ausentes en Demo, incluidas cinco
  adaptaciones exclusivas (`20260731190100`, `20261014152900`, `20261014153100`,
  `20261020115900`, `20261028110000`). Aplicadas antes de cada frontend;
  hashes 71/71 verificados contra SQL confirmado. Sin repair ni reset remoto.
- Preservación atómica: 110 tablas existentes/autorización en Production; en
  Demo, 89 tablas/columnas originales, incluidos documentos, importes, clientes,
  perfiles y cotizaciones. Se comparan por clave los catálogos originales, con
  adiciones previstas; se permite logo ficticio y timestamps. Contadores nuevos
  inicializados sin emitir documentos. Auth e identidades de Demo preservados.
- Conserva separación de bases/usuarios/claves, Atlas, JWT/grants temporales,
  términos, caducidad, noindex, Storage privado/bloqueado, correo e invitaciones
  bloqueados. Configuración fiscal/contable editable en el tenant ficticio y
  flujo Factura/Proforma compartido. Master real designada solo en Production.
  HBL/cotización conservan prefijo Demo con contadores por tenant. El
  aprovisionador asigna/verifica tenant; no se aprovisionaron usuarios nuevos.
- Reset legacy retirado: su allowlist/seed no cubría multiempresa/contabilidad.
  Se preservó el dataset remoto; falta diseñar/probar un sustituto antes de
  ejecutar un reset futuro con autorización explícita. Outlook sigue en espera.
- Funciones comparadas en vivo: ninguna compartida ausente, 363 idénticas y
  nueve variantes revisadas de prefijos/protecciones Demo. Código: 513 archivos
  compartidos, 26 variantes con hashes revisados, cero diferencias inesperadas.
- PDF/HTML: marca real en cada página y en ventanas independientes de cierre,
  embarques, seguro y FCL mediante `withDemoPrintWatermark`; impresión idempotente.
- Validación: 474 pruebas Node y 26 suites SQL/RLS Production (CI `40715647354`);
  480 pruebas Node y dos suites SQL/RLS Demo (CI `40722799987`). Demo ensayada
  desde esquema real con dataset ficticio, sobre la base remota con rollback y
  desde instalación limpia de 160 migraciones en CI. TypeScript/lint/build
  aprobados; 223 diagnósticos históricos, cero regresiones. Smoke sin sesión:
  24 rutas Production/plataforma y 24 Demo, más comprobación de borradores y
  bloqueo de correo; manifest coincidente con los deployments inmutables.
- Archivos: cinco migraciones Demo, suite/runner SQL, workflow Quality Demo,
  gates/layouts, proxy, branding, tipos, componentes PDF/HTML, aprovisionador,
  pruebas y `docs/quality/environment-parity.md`. `Environment parity` compara
  ambas ramas en cada push, sin secretos ni acceso a bases; manifiesto y script
  rechazan diferencias no revisadas. No se publican huellas privadas ni PDFs reales.
- Pendientes: UAT con usuarios reales, acceso temporal Demo vigente cuando se
  requiera y nuevo procedimiento de reset. Pruebas locales/CI y HTTP sin sesión
  no sustituyen aceptación funcional autenticada.

### 2026-10-28 - FIN-DRAFT-01 - Borrador previo a emisión y corrección aprobada por master

- Estado: publicado en Production el 28/10/2026; migración y designación master
  aplicadas con auditoría. UAT autenticado pendiente.
- Commit funcional: `8bf64c3ca3e129069a61afbd496db5f648d5004c`.
  CI: `40715647354`, aplicación y SQL/RLS aprobados. Vercel Production Ready;
  smoke de 24 rutas y manifest idéntico en plataforma, Sari y URL inmutable.
- Antes: generar una factura creaba un registro Borrador que ya consumía CAI y
  correlativo. Ahora Guardar borrador conserva datos incompletos en una tabla
  preparatoria; no crea factura, cuenta por cobrar ni asiento. La emisión exige
  confirmación, valida el documento y asigna numeración/saldo en una transacción.
  Los documentos numerados históricos no se renumeran ni se convierten en borrador.
- `20261028100000_invoice_drafts_and_master_review.sql`: nuevas tablas con RLS
  para borradores, designación individual master y eventos inmutables. RPC de
  guardado con revisión/clave idempotente, solicitud/decisión y emisión bloqueada
  por versión. Reintentos no duplican documentos ni consumen otro correlativo;
  un fallo conserva el borrador y revierte emisión, saldo, CAI y contabilidad.
- Master: una cuenta Admin o Contabilidad aprobada, activa y del mismo tenant;
  no se concede el permiso a todos los integrantes del rol. Administración puede
  designar/revocar desde Configuración contable y queda auditoría. Identidad
  solicitada comprobada en modo de solo lectura: única, Contabilidad, activa,
  aprobada y de Sari; no se cambió su rol ni se creó una cuenta duplicada.
- Aprovisionamiento administrativo: la designación inicial autorizada permite
  registrar el origen `Despliegue autorizado`, sin suplantar una sesión humana.
  Solo el propietario de base puede escribir ese registro; authenticated conserva
  únicamente la RPC Admin. La auditoría distingue el rol técnico y el motivo.
- Correcciones de todos los datos: propuesta editable con cliente, servicios,
  importes, ISV y moneda; nombre/RTN/domicilio se validan desde el perfil del
  cliente. Solo el master designado puede aprobar y emitir la sustituta. Editar
  invalida la aprobación; cambios en datos fiscales del cliente/emisor, designación
  master o líneas de cotización exigen nueva revisión/recarga antes de emitir.
- Conserva original y sustituta vinculados, con motivo, versión, solicitante,
  decisor y eventos. El PDF imprime correlativo/CAI propios y la referencia del
  documento anulado. El contenido de facturas numeradas queda protegido también
  contra modificaciones directas de comentarios o metadatos de pago; los estados
  y pagos conservan sus RPC/flujo habitual.
- Criterio fiscal: SAR indica anular y custodiar original/copia en errores de
  llenado (art. 41 del Acuerdo 481-2017). La corrección no sobrescribe el documento;
  requiere anulación del original aprobada por Contabilidad antes de emitir un
  nuevo número. Pagos/notas activos y períodos cerrados conservan sus bloqueos.
  No se cambia quién aprueba anulaciones ni se activa contabilidad automática.
  Fuente: `https://www.sar.gob.hn/helpie_faq/que-hacer-en-caso-de-emitir-un-documento-fiscal-con-errores-en-el-llenado/`.
- UI: bandeja `/invoicing/drafts`, continuar borrador desde Facturación, guardar
  sin datos fiscales completos, confirmación de emisión y panel de revisión/historial.
  Nuevo vínculo de trazabilidad en detalle de factura. Formulario de líneas
  adaptable en móvil y confirmaciones dentro del viewport, sin introducir librerías.
- Archivos: migración y suite `invoice_drafts_and_master_review.sql`,
  `scripts/validate-audit-sql.mjs`, `invoice-drafts.ts`, `useInvoiceMaster.ts`,
  `InvoiceMasterSettings`, `InvoiceCorrectionReview`, `InvoiceCorrectionLinks`,
  páginas `invoicing/new`, `invoicing/drafts`, `invoicing/[id]`, `invoicing`,
  `accounting/settings`, `invoice-pdf`, `ConfirmDialog`, pruebas de borradores,
  descuentos, plantilla PDF y anulación. Guía: `docs/uat/invoice-drafts-and-corrections.md`.
- Validaciones: 474/474 Node en suite completa, incluida la regresión de PDF de
  sustitución; 26/26 suites SQL/RLS locales y en CI.
  Seis nuevas pruebas de flujo comprueban datos incompletos, valores vacíos,
  reintentos/doble clic, descarte por cambio de identidad y revisión exacta.
  Las 26 suites SQL/RLS pasan con migración canónica dentro de transacción revertida
  y savepoints por suite en base desechable. Cubren permisos/tenant, numeración,
  saldo, rechazo de edición directa, anulación, cambio de RTN y tarifa obsoleta.
- Chrome con páginas/componentes reales y servicios ficticios: seis grupos de
  guardado/reapertura, emisión confirmada, propuesta de Finanzas, revisión master,
  invalidez tras editar, sustitución y configuración individual; sin excepciones.
  Móvil real de navegador de 390 px, sin desbordar página/modal. Capturas y resultados
  en `.ua/intermediate/invoice-drafts-validation/`; no certifican UAT autenticado.
- TypeScript y build aprobados (103 páginas). Lint: 482 archivos, 223 diagnósticos
  históricos, cero regresiones. SQL publicado antes del frontend; las 110 tablas
  existentes y su autorización preservadas en la transacción. La cuenta solicitada
  quedó como única master, con evento de despliegue y sin suplantar usuario humano.
  Falta probar con usuarios reales. Los artefactos
  de identidad/capturas y el correo de la cuenta no se agregan al código público.

### 2026-10-27 - REP-OPCLI-01 - Operaciones aprobadas y activas para el cliente

- Estado: publicado y verificado en Production el 27/10/2026; CI de aplicación
  y SQL/RLS aprobado. UAT autenticado pendiente.
- Commit funcional: `107fa14d31f9f65322a81909842905cf08d7925a` (18 archivos,
  junto con UX-COL-01). SQL: ninguno; no modifica datos operativos.
- Nueva vista `/reports/client-operations`, con accesos desde Reportes y Shipping
  Instructions. Selector de cliente por nombre/código/RTN, alcance y modalidad;
  PDF/Excel exportan todo el resultado filtrado, independientemente de la página.
- Criterio confirmado por el usuario, explícito y ajustable: cotizaciones Ganadas sin
  shipment vinculado y operaciones en curso. No trata Pricing Aprobado como una
  venta aceptada. Excluye cerradas, canceladas, finalizadas, entregadas y eliminadas;
  una cotización ya operada no reaparece como pendiente al cerrar su operación.
- Fuentes: shipments por client_id, cotizaciones del cliente y bookings ACTIVE,
  con paginación completa y lotes de IDs. Una fila por operación, sin duplicarla
  por varios bookings; no incorpora bookings reemplazados/cancelados al agregado.
  Una operación activa en repricing conserva su presencia en el reporte.
- Detalle: cotización, operación, lugar de origen, consignatario real de SI,
  modalidad FCL/LCL/otras y estado. No confunde cliente con consignatario ni
  inventa datos ausentes: se muestran pendientes de confirmar.
- Exportación con proyección explícita de seis campos, sin costos, márgenes,
  notas internas, proveedores o UUIDs. Encabezado de empresa y acentos Sari.
  `ReportPdf` admite audiencia cliente sin el recorte interno de 500 filas;
  los reportes anteriores conservan su comportamiento y estilos.
- Acceso visual/ruta: Admin, Operaciones y Ventas; lecturas mantienen RLS y
  ownership existentes. Resultados, carga y errores se aíslan por usuario/empresa,
  cliente y revisión; una fuente fallida impide exportar un reporte incompleto.
- Archivos: `reports/client-operations/page.tsx`, `client-operations-report.ts`,
  `permissions.ts`, `reports/page.tsx`, `operations/shipping-instructions/page.tsx`,
  `report-pdf.tsx`, `tests/client-operations-report.test.mjs` y este registro.
  Reutiliza el selector/directorio y el exportador existentes.
- Validación: 467/467 Node, incluidas ocho nuevas regresiones de fuentes,
  exclusiones, consignatario, filtros, privacidad, paginación, errores y carreras.
  PDF real de 501 filas conserva la última; Excel contiene todas las columnas.
  TypeScript y build aprobados (102 páginas). Lint: 475 archivos, 223 diagnósticos
  históricos, cero regresiones; ESLint dirigido sin diagnósticos.
- Chrome con páginas reales y servicios locales ficticios: seis grupos aprobados,
  sin excepciones, paginación 25+3, cambio de cliente, fallo/reintento, filtros
  locales, descargas reales PDF/Excel y móvil de 390 px sin desborde de página.
  PDF descargado de dos páginas inspeccionado visualmente y con última cotización
  verificada mediante extracción de texto. Artefactos únicamente locales en
  `.ua/intermediate/client-operations-validation/`.
- Pendiente: validar con sesión real los datos/permisos disponibles de cada rol.
  No se probaron RLS ni flujos reales
  mediante los mocks, ni se publicaron capturas o datos de clientes.
- Production: Vercel `B3ZCEYwonjxPVdtYNQEq2yJvAkoy`, exitoso, build
  `mcfM8c0kAmUmhZ204eZHm`. Smoke de 24 rutas/recursos aprobado y manifiesto
  idéntico en Forwarders/Sari/instancia. Quality `40599973352`: aplicación y
  suites SQL/RLS existentes aprobadas en base desechable. Informe:
  `docs/release/client-operations-collections-2026-10-27.md`.

### 2026-10-27 - UX-COL-01 - Cobranza y estados de cuenta con búsqueda de clientes

- Estado: publicado y verificado en Production el 27/10/2026; CI de aplicación
  y SQL/RLS aprobado. UAT con sesión real pendiente. SQL: ninguno.
- Commit funcional: `107fa14d31f9f65322a81909842905cf08d7925a`, junto con
  REP-OPCLI-01. Evidencia y publicación en el informe de release anterior.
- Reemplaza el selector nativo de clientes en Cobranza y Estado de cuenta por
  `ClienteCombobox`, reutilizable y compatible con su modalidad inline existente.
  Busca nombre, código y RTN con o sin guiones; admite acentos y palabras
  separadas. Escribir solo filtra localmente y no consulta saldos por carácter.
- Navegación con flechas/Enter, Escape/Tab, foco restaurado, opciones identificadas,
  resultados vacíos y carga deshabilitada. El portal se ajusta al viewport visible,
  cambia de dirección cuando corresponde y muestra nombres largos completos.
- `useBillingClients` carga todo el directorio paginado con código/RTN, separa
  resultados por contexto de usuario/empresa y permite reintentar errores.
  No expone una lista parcial al fallar la carga.
- Cobranza incorpora resumen real por cliente/moneda, documentos seleccionables,
  importes parciales, desglose de aplicación/remanente y panel de pago junto al
  historial. Estado de cuenta comparte encabezados, métricas, filtros y estilos.
  Acentos rojos de Sari, estados legibles y distribución adaptable a móvil.
- Conserva RPCs, permisos, registro/reverso de recibos, anticipos y reportes.
  Los filtros del estado de cuenta siguen mostrando saldos calculados con todos
  los movimientos. No se modifican documentos, asientos o configuraciones reales.
- Archivos: `invoicing/collections/page.tsx`, `invoicing/statements/page.tsx`,
  `ClienteCombobox.tsx`, `useComboboxPortal.ts`, `FinanceWorkspace.tsx`,
  `useBillingClients.ts`, `client-search.ts`, `tests/page-harness.mjs`,
  `client-combobox.test.mjs` y `collections-workspace.test.mjs`.
- Validación: 459/459 pruebas Node; 9/9 dirigidas repetidas después del ajuste
  final de distribución. Lint CI: 472 archivos, 223 diagnósticos históricos,
  cero regresiones; ESLint de los 10 archivos de código/pruebas sin diagnósticos.
  Build aprobado (101 páginas), `npx tsc --noEmit` y `git diff --check` aprobados.
- Chrome con páginas/componentes reales y servicios locales ficticios: búsqueda
  sin consultas por carácter, Enter/Tab/Escape, importes parciales, filtros sin
  alterar saldos, compatibilidad inline de 48 px y móvil de 390 px (alturas 844
  y 440 px). Cinco grupos aprobados, sin excepciones ni desborde horizontal.
  Capturas/resultados locales en `.ua/intermediate/collections-ux-validation/`.
  Esto no constituye prueba de RLS ni aceptación autenticada en Production.
- Release conjunto validado con 467/467 Node, TypeScript, build de 102 páginas
  y lint sin regresiones. CI `40599973352` de aplicación/base aprobado;
  Vercel y smoke remotos anteriores incluyen Cobranza y Estado de cuenta.

### 2026-10-27 - FIN-VOID-01 - Anulación aprobada por Contabilidad y acceso a proformas

- Estado: SQL y frontend publicados y verificados en Production; validaciones
  de aplicación y SQL/RLS aprobadas en CI.
  UAT con sesión real de Contabilidad pendiente.
- Commit funcional: `0dff3abf39cc4557087c8cfbbd02be7d6c011632` (24 archivos).
- Antes: el detalle de factura cambiaba directamente a Anulada, sin motivo ni
  aprobación; una boleta/retención podía anularse al cancelar la AP o reversar
  su movimiento. Ahora Admin/Finanzas/Contabilidad solicitan y únicamente el rol
  Contabilidad aprobado, activo y del mismo tenant puede aprobar o rechazar.
- SQL: `20261027230000_fiscal_void_approval.sql`, nueva tabla con RLS, solicitud
  idempotente y decisión transaccional, snapshots, motivos, actores, fechas,
  custodia de originales y vínculos de asiento/reverso. Bloquea anulación directa,
  eliminación, ocultación, alteración de anulados y las vías antiguas AP/retención.
  Conserva los límites de pagos, notas activas, períodos y proformas convertidas.
  No borra ni reutiliza números; no cambia documentos o aprobaciones históricas.
- Registro fiscal siempre disponible. Si existe partida se revierte aunque
  automatic_posting esté apagado; si no existía se indica Sin asiento previo
  sin inventar un asiento de importe cero. Un error de reverso revierte toda
  la aprobación. No se habilita contabilidad automática ni se crean aperturas.
- Pantallas: nuevo `FiscalVoidControl`/revisión, registro `/invoicing/voids`
  con fechas/estados/búsqueda, paginación completa y PDF/Excel; integrado en
  detalle de factura, compras/retenciones, AP y navegación contable/facturación.
  PDFs preservan contenido/CAI y muestran ANULADA, fecha y motivo.
- Proformas ya tenían creación, secuencia propia, anticipos y conversión
  idempotente a factura. Se agregó Nueva proforma y acceso directo al formulario;
  se prueba crear sin CAI y el PDF distingue que no es documento fiscal.
- Referencia: SAR, Reglamento 481-2017 consolidado, artículo 41 (leyenda y
  custodia de original/copia) y definición de nota de crédito, artículo 4.32.
  No se interpreta que cada anulación sin partida previa requiera un asiento nuevo;
  los ajustes posteriores a una venta deben evaluarse mediante nota de crédito.
  Fuente y criterios en el informe de release; no hay envío automático al SAR.
- Archivos: migración, `src/lib/fiscal-void.ts`, componentes/páginas anteriores,
  `FiscalDocumentLayout`, `invoice-pdf`, `purchase-fiscal-pdf`, tipos de compra;
  `fiscal_void_approval.sql`, cuatro regresiones SQL contables actualizadas,
  `fiscal-void-flow.test.mjs`, pruebas de PDF y registro de suites de CI.
- Validación: 450/450 Node y 25 suites SQL/RLS; 19 pruebas de flujos repetidas
  tras ajustar limpieza de efectos. Migración canónica recreada y probada en
  transacción revertida; solicitudes/aprobaciones simultáneas producen una sola
  decisión y un solo reverso. Chrome real con servicios locales ficticios:
  Finance solicita sin anular, Admin no aprueba, Contabilidad confirma motivo y
  custodia, modal móvil dentro del viewport, historial filtrable y exportaciones
  visibles; sin excepciones. Lint: 467 archivos, 223 históricos, cero regresiones.
- TypeScript y build finales aprobados (101 páginas); preflight remoto de solo
  lectura preparado sobre el proyecto vinculado verificado.
- SQL remoto: una sola migración, aplicada antes del frontend con fuente exacta
  del commit, bloqueo y verificación transaccional de 39 tablas. Permisos/RLS y
  helpers previos conservados; nueva tabla con RLS, tres guardas y sin DML directo.
  Pre/postflight: 37 tablas idénticas; clientes/historial cambiaron por una
  actualización de Admin a las 21:59:24 UTC, anterior al SQL de las 22:02 UTC,
  confirmada mediante auditoría. Esa actividad se preservó; no se atribuye al SQL.
  Claims de solo lectura: Contabilidad aprueba, Admin/plataforma no; no es UAT.
- Frontend: Vercel `D6YV1dNZ1ttbpHAgoM3GevV7iZZH`, exitoso; build
  `i1faWhB4fmzV_3rUJiCB7`. Smoke de 21 rutas/recursos aprobado, incluidas
  Anulaciones/Nueva proforma; manifiesto idéntico en Forwarders/Sari/instancia.
  CI `40592010935`: aplicación y suites SQL/RLS aprobadas desde el historial completo.
- Pendiente: aceptación operativa. No se simulan autorizaciones para anulados
  anteriores al flujo. Los PDF/fixtures/capturas locales no se publican.

### 2026-10-27 - UX-NUM-01 - Edición de cero y decimales en campos numéricos

- Estado: publicado en Production por autorización del usuario el 27/10/2026;
  aceptación operativa con sesión real pendiente.
- Commit funcional: `032cbbbe7e8677f367b507ca9d8a5f18af567e00` (12 archivos).
- Causa: conversiones inmediatas `Number('')` y un respaldo con `|| '0'`
  reinsertaban el cero al borrar; el MBL también mostraba un total recalculado.
- Archivos: componente compartido `src/components/ui/NumberInput.tsx` integrado
  en empresa/facturación (6 campos), detalle de agente (4), catálogos (2),
  retiro Miami (1) y costos de la comparación FCL (1); descuento de factura
  nueva usa respaldo nulo. `tests/number-input.test.mjs`,
  `tests/accounting-access.test.mjs`, `tests/invoice-discount-flow.test.mjs`
  y `tests/page-harness.mjs`.
- Auditoría: 127 controles numéricos en 35 archivos; se conservan los que ya
  admiten texto vacío y los controles de solo lectura. El nuevo componente
  conserva el texto mientras se edita y normaliza al perder el foco; los
  cálculos continúan recibiendo números. Respeta cambios externos y atributos
  nativos. ISV, descuentos y recargos permiten cero según su regla existente.
  Guardar empresa rechaza TC no positiva/no finita, impuesto fuera de 0–100%
  y recargos negativos/no finitos antes de escribir. SQL: ninguno.
- Validaciones: 441/441 pruebas Node; 13/13 dirigidas a edición, guardado,
  permisos de Contabilidad y descuentos. Chrome real con datos ficticios
  verifica borrar cero, escribir decimales/ceros finales, normalizar al salir,
  cero explícito y edición en viewport móvil, sin excepciones de ejecución.
  El equipo inyecta atributos `wfd-id` ajenos al código y produce una advertencia
  de hidratación en la prueba aislada; no impide las comprobaciones.
- TypeScript y build aprobados (100 páginas); lint: 463 archivos, 223
  diagnósticos históricos, cero regresiones; `git diff --check` aprobado.
  La prueba de descuento se amplió después de la suite completa para comprobar
  vacío y recálculo sin descuento, y pasó nuevamente (1/1).
- Production: Vercel `3gvK52wnojZrQx4n1xdNY7cnYw8b`, exitoso, build
  `MKCGB6ICAVYeXe5rb19ry`. Smoke de 19 rutas/recursos aprobado; mismo
  manifiesto en Forwarders/Sari/instancia inmutable. Informe:
  `docs/release/number-inputs-2026-10-27.md`.
- CI `40583866907`: aplicación aprobada; el primer intento de base desechable
  no ejecutó SQL/RLS por límites de descarga de imágenes (`toomanyrequests`).
  Se reintentó solo ese trabajo y las suites SQL/RLS quedaron aprobadas en
  el intento 2, sin cambios de código ni uso de la base de Production.
- Pendiente: UAT en la empresa; sin migraciones ni cambios de permisos o
  contabilidad automática. Originales PDF y artefactos locales fuera del commit.

### 2026-10-27 - FIN-REL-01 - Publicación fiscal y contable autorizada

- Estado: SQL y frontend publicados en Production; configuración operativa/UAT pendientes.
- Commit funcional: `9394d9bd3083658a948fb911d3827af88159a36f` (87 archivos).
  Informe: `docs/release/accounting-fiscal-2026-10-27.md`.
- SQL: trece migraciones `20261027100000`–`20261027220000` aplicadas antes del
  frontend en una transacción al proyecto verificado `fwspgdzvlbtbgiupvrzo`.
  Fuentes exactas del commit registradas; hashes, huellas de datos previos,
  políticas/ACL ajenas al cambio y helper de tenant comprobados. RLS nueva activa.
  Sin asientos de apertura ni contabilidad automática habilitada.
- Autorización remota: lecturas con claims de Contabilidad aprobadas; plataforma
  conserva contexto nulo y cero datos de empresas. No equivale a UAT de navegador.
- Vercel Production funcional: `96BBSkByJyaybU8Fqz9BhgUztAb4`, exitoso;
  build `6ebUERu81fq5QgNYHY4iL`. Smoke de 19 rutas/recursos y manifiesto idéntico
  en Forwarders/Sari/instancia. Quality CI `40575004853`: aplicación y base exitosas.
- Validación local: 436/436 Node; 24 suites SQL/RLS; TypeScript/build aprobados;
  lint 461 archivos, 223 diagnósticos históricos, cero regresiones.
- Publicación revisada: originales PDF/muestras/credenciales fuera del commit;
  código, migraciones, pruebas ficticias y documentación técnica únicamente.
- Los pendientes de SQL/publicación descritos en FIN-00..06 y FIN-PDF-02 quedan
  resueltos por este registro. Faltan fichas de oficinas, asignación de clientes,
  CAI/correlativos reales, catálogo/períodos/inicio contable y UAT; ver informe.
  Retención/Entrega pendientes de sus formatos reales. La baja de activos
  implementada es sin venta; no se agregaron revaluaciones ni apertura automática.

### 2026-10-27 - FIN-PDF-02 - Conexión fiscal de plantillas Sari y descuentos

- Estado: publicado en Production; aceptación operativa pendiente, ver FIN-REL-01.
- Archivos: `FiscalDocumentLayout.tsx`, `invoice-pdf.tsx`, `purchase-fiscal-pdf.tsx`,
  nueva/detalle de factura, compras, helper `invoice-fiscal.ts`, tipos de compra;
  migraciones `20261027210000_fiscal_discounts_and_references.sql` y
  `20261027220000_positive_fiscal_total.sql`, pruebas de helper/formulario/PDF/SQL.
- Plantilla Carta compartida: logo/rojo Sari, cliente/proveedor, precios y
  descuentos por línea, tratamiento ISV, resumen, equivalencia antes del total,
  autorizaciones, firma/huella y pie con impresión/páginas. Se repite el
  encabezado en documentos extensos. Se corrigió el cálculo de altura del pie
  dinámico del renderer; se valida su posición dentro de la hoja.
- NC/ND congelan número, CAI y fecha del original por tenant, preservando su CAI
  propio. Descuentos de importe por línea reducen bases/ISV y llegan al diario;
  precio bruto y descuento siguen visibles. Conversión transforma ambos una vez;
  proforma y compra conservan el descuento. Cotización conserva precio/moneda.
  Total cero después de descuento se rechaza atómicamente sin consumir correlativo.
- Validaciones: 436/436 pruebas Node y 24 archivos SQL/RLS; descuentos en factura, NC, proforma, compra,
  desde cotización con operación finalizada y costo respaldado; referencias
  inmutables. PDF real Carta con logo, 1/7/40 líneas, pie visible y sin solapamientos;
  formulario real envía descuento y total neto. TypeScript pasa; build Next.js
  16.2.6 completado con 100 páginas generadas; lint pertinente sin diagnósticos nuevos.
- Release: producción verificada en `fwspgdzvlbtbgiupvrzo`, baseline
  `20261026160000`; paquete transaccional de trece migraciones pendiente de aplicar
  antes del frontend, con huellas de datos previos y RLS. Autorizado expresamente
  por el usuario; no se cargan CAI/correlativos ni datos de clientes desde los PDF.
- Pendientes: completar fichas de oficinas y asignarlas a los clientes, cargar
  autorizaciones reales, catálogo/cuentas/períodos y definir inicio contable.
  Contabilización automática sigue desactivada. UAT autenticado y contraste
  específico de Retención/Comprobante de Entrega pendientes. Commit: pendiente.

### 2026-10-27 - FIN-PDF-01 - Contraste de los cuatro formatos fiscales de Sari

- Estado: revisión y propuesta visual local; sin reemplazar plantillas ni desplegar.
- Archivos: `docs/sari-fiscal-format-review.md`, seguimiento de las seis etapas.
  Sin SQL ni cambios de datos comerciales. Originales fuera del repositorio.
- Se verificaron visualmente Factura/NC/ND/Boleta (Carta, una página). Se crearon
  cuatro muestras ficticias en `.ua/intermediate/sari-fiscal-format-review`, con
  logo y rojo Sari, tipografía incrustada y marca «Sin validez fiscal».
- Hallazgos: plantillas ERP A4; compra con azul de plataforma; falta logo de factura;
  referencia NC/ND incompleta (CAI/fecha original); descuentos sin campo funcional;
  RTN vacío en boleta recibida; condición de crédito mezclada con método de pago.
  No se cargaron CAI, contactos ni correlativos inferidos de los ejemplos.
- Validación: extracción textual y render PNG de los cuatro originales; render
  real de cuatro propuestas Carta con datos ficticios y revisión visual. Son
  muestras de diseño; no certifican emisión ni aceptación funcional del sistema.
- Pendientes: integración y validación funcional de plantillas, formatos de
  Retención/Entrega y UAT. Commit: pendiente.

### 2026-10-27 - FIN-00 - Integración de las seis etapas autorizadas

- Estado: desarrollo y validación local; no desplegado, sin apertura ni UAT.
- Alcance y matriz de aceptación: `docs/accounting-six-stage-plan.md`. Se mantienen
  las seis etapas; los ajustes de integridad posteriores pertenecen a ellas.
- SQL canónico: trece migraciones `20261027100000` a `20261027220000`. Se aplicaron
  en orden en una segunda copia Docker desechable, sin red ni puertos publicados,
  partiendo de la base de pruebas anterior a estos cambios. No se tocó Production
  ni la base habitual de desarrollo. No se emitieron documentos fiscales reales.
- Validación: 436/436 pruebas Node; 24 archivos SQL/RLS pasan con rollback.
  Dos sesiones concurrentes comprueban recibo idempotente y rechazo de una
  aplicación que excedería el saldo; caja 185 / CxC 45 sobre facturas 230,
  sin partidas desbalanceadas. Incluye render PDF real multipágina y Excel OOXML.
- Lint de baseline: 458 archivos, 223 diagnósticos históricos, cero regresiones.
  TypeScript final sin errores; build Next.js 16.2.6 completado, 100 rutas
  generadas. `git diff --check` sin errores de espacios.
- Pendientes de salida: SQL remoto antes del frontend, publicación, UAT autenticado
  de las seis etapas y aceptación de los formatos fiscales reales. La clasificación
  de Comprobante de Entrega permanece pendiente del PDF; no se inventó su flujo.
  No importar Zafra ni crear saldos/fecha inicial; la contabilización automática
  permanece desactivada hasta configurar fecha, cuentas y períodos.
- Límites: no incluye declaración tributaria, certificación SAR, deducibilidad
  automática, venta/revaluación/deterioro de activos ni reconstrucción de eventos
  históricos que nunca se conservaron. La concurrencia probada no cubre todas las
  combinaciones de edición/anulación simultánea.
- Commit: pendiente; sin push ni publicación de este alcance.

### 2026-10-27 - FIN-06 - Activos, depreciaciones y bajas

- Estado: implementado y probado localmente; publicación/UAT pendientes.
- Archivos: `accounting/assets/page.tsx`, `fixed-assets.ts`, `AccountingNav`,
  migración `20261027160000_fixed_assets.sql` y ajustes `20261027170000` /
  `20261027190000`; pruebas `fixed_assets.sql` y `fixed-assets.test.mjs`.
- Alta en preparación o vinculada a adquisición existente. Valida suma de costos
  asignados contra el débito de adquisición. Impide revertir la adquisición usada.
  Línea recta mensual secuencial, idempotente, sin exceder vida útil/residual.
  Bases/cuentas/fechas congeladas al tener historial. Reverso del último mes,
  períodos abiertos incluso en cuotas cero y baja sin venta con partida balanceada.
- Criterio fiscal separado, con referencia obligatoria si se registra vida fiscal.
  La baja conserva el historial y deja el valor en libros en cero. Auxiliar e
  historial exportables a PDF/Excel, con acceso a la partida generada.
- Validaciones: SQL ejecutó siete meses, redondeo, duplicado, salto de mes, reverso,
  doble baja, cuenta patrimonial conciliada y RLS entre empresas; Node prueba
  residual/centavos/bases inválidas. UAT de navegador y criterios fiscales pendientes.
- Commit: pendiente.

### 2026-10-27 - FIN-05 - Compras, documentos fiscales y diario consolidado

- Estado: implementado y probado localmente; formatos fiscales finales/UAT pendientes.
- Archivos: migraciones `20261027140000_accounting_financial_sources.sql`,
  `20261027150000_purchases_and_fiscal_documents.sql`, integridad `20261027170000`,
  requisitos fiscales `20261027180000`, redondeos `20261027190000` / `20261027200000`;
  rutas `accounting/purchases` / `accounting/books`, `InvoiceLineSettings`,
  `purchase-fiscal-pdf`, `purchase-documents`, `accounting-books`, `amount-in-words`,
  nueva factura, ficha de proveedor y exportador financiero compartido.
- Compras por cuenta/servicio, ISV acreditable explícito en factura de proveedor;
  boleta con numeración CAI propia y crédito fiscal ISV bloqueado. Snapshot de
  identidad/domicilio/teléfono del proveedor, importe literal, firma y huella.
  Retención usa su propio CAI, conserva documento de origen y reduce CxP mediante
  un movimiento no monetario que acredita retenciones por pagar, sin salida de caja.
- Adaptadores conectan factura/NC/ND, compra, cobro, anticipo, asignación, pago,
  retención y reverso con el diario. Ingresos y gastos se seleccionan por línea.
  Ficha anterior de proveedor admite cuenta y tasa HNL por moneda. Última cuota
  concilia centavos leyendo el diario inmutable; no modifica el pago original.
- Diario consolidado, mayor por cuenta, comprobación, balance y resultados con
  calendario y PDF/Excel numérico. Anticipos/reclasificación de proforma no duplican
  caja; tipos de cambio distintos generan diferencia cambiaria en cobros.
- Validaciones: `accounting_financial_sources.sql`, `accounting_currency.sql`,
  pruebas de libros y PDF real; boleta rechaza crédito ISV, factura de proveedor
  sí admite crédito explícito, compra duplicada rechazada, USD parcial concilia,
  proforma exonerada pagada deja anticipo/reverso correctos. SQL completo 23/23.
- Fuente: reglamento consolidado SAR enlazado en el plan; códigos reformados
  05/06/07/08/11. La base original 481-2017 no debe usarse sin sus reformas.
  Tasas/procedencia de retenciones y límites de deducción requieren Contabilidad.
- Pendientes: contraste de los PDF de la empresa, Comprobante de Entrega, UAT,
  SQL remoto y despliegue. Sin apertura, declaraciones SAR ni saldos inventados.
- Commit: pendiente.

### 2026-10-27 - FIN-04 - Etapa 4: catálogo y motor contable

- Estado: implementación local en validación; sin activación ni fecha de inicio.
- Archivos: `20261027130000_accounting_engine.sql`, rutas `accounting/accounts`,
  `accounting/settings`, `accounting/journal`, componentes `AccountingNav`,
  `JournalDetail`, `InvoiceJournal`, helper/hook contables, permisos y Sidebar.
- Catálogo manual e importación CSV atómica sin saldos; jerarquía, cuentas de
  movimiento, asignaciones por función, períodos sin solapamiento y cierre.
- Motor: partidas HNL balanceadas e idempotentes, inmutabilidad, reversos en
  período abierto, factura/NC/ND con vínculo de origen. No revierte un asiento
  automático sin corregir su documento. Los adaptadores de cobros/compras/pagos
  se integran con el diario consolidado en la etapa 5.
- Validaciones: TypeScript; lint de archivos nuevos limpio; 9 pruebas Node de
  catálogo, balance y permisos pasan. Suite SQL completa de 20 archivos pasó en
  copia aislada, incluyendo cuentas, importación atómica, NaN/desbalance,
  idempotencia, período cerrado, emisión/anulación fiscal y restricciones.
- Integración de etapa 5 y regresión global local verificadas en FIN-00/FIN-05.
  Pendientes: navegador, SQL remoto y publicación. Sin catálogo ficticio ni apertura automática.
- Commit: pendiente.

### 2026-10-27 - FIN-03 - Etapa 3: cobranza y estados de cuenta

- Estado: implementación local; validación funcional y SQL aislado en curso.
- Archivos: `20261027120000_customer_collections.sql`, rutas
  `invoicing/collections` y `invoicing/statements`, Sidebar, `customer-statement.ts`,
  `FinancialReportExport.tsx`, escritor OOXML `xlsx.ts` sin dependencias nuevas.
- Recibos atómicos con varias facturas/ND, aplicaciones parciales, anticipos,
  reverso completo, bloqueo concurrente e idempotencia. NC descuenta el saldo;
  factura y ND se desglosan sin duplicar la deuda agregada existente.
- Proforma exonerada pagada: exceso queda como anticipo, conserva el cobro original
  y reclasifica aplicaciones con trazabilidad; no genera un ingreso adicional.
- Movimientos persistidos para fechas históricas, moneda separada, filtros de tipo
  sin alterar saldo inicial/final. Reconstrucción previa identificada expresamente.
- Validaciones: TypeScript; prueba SQL `customer_collections.sql` con rollback en
  copia Docker aislada (dos facturas + ND, anticipo, NC, reverso, proforma pagada,
  RLS entre empresas). Pruebas Node de conciliación histórica y paquete Excel ZIP/
  OOXML con checksum, números y texto que no ejecuta fórmulas: 2/2.
- Regresión completa y build verificados en FIN-00. Pendientes: navegador
  autenticado, aceptación de PDF y publicación. No se importaron saldos iniciales ni movimientos de Zafra.
- Commit: pendiente.

### 2026-10-27 - FIN-02 - Etapa 2: impuestos, monedas y proformas

- Estado: implementación local en validación; no aplicado en Production.
- Cambios: `20261027110000_invoice_tax_conversion_proforma.sql`, helper
  `invoice-fiscal.ts`, componentes `InvoiceFiscalOptions`/`ConvertProforma`,
  creación/detalle/PDF de facturas. Exenta y Exonerada separadas de Gravada,
  evidencia privada, conversión de precios explícita sin escribir cotizaciones,
  equivalencia calculada en servidor, proforma vinculada e idempotente.
- Anticipos: se conservan los pagos y su proforma de origen. La etapa 3 integra
  los excesos como remanente de recibo mediante reclasificación trazable;
  no se descarta dinero ni se registra un segundo cobro.
- Validaciones: TypeScript; 3 pruebas de cálculo; SQL `fiscal_invoice_workflow.sql`
  pasó en copia Docker aislada con rollback, incluyendo exoneración, equivalencia,
  conversión, anticipos, doble conversión y bloqueo de alteración directa.
- Suite completa y render PDF verificados en FIN-00. Pendientes: navegador,
  revisión de documentos reales y publicación.
- Commit: pendiente.

### 2026-10-27 - FIN-01 - Etapa 1: oficinas y encabezados fiscales

- Estado: implementación local en validación; SQL remoto, publicación y UAT pendientes.
- Alcance: ficha de oficinas con contacto/dirección/códigos, asignación explícita de
  cliente, selección fiscal obligatoria por oficina, snapshot inmutable del emisor,
  ampliación de tipos CAI y validación de códigos SAR. Emisor SARI USA configurable.
- Archivos: migración `20261027100000_fiscal_offices.sql`, `src/lib/fiscal-offices.ts`,
  componentes `BillingOfficeSelect`/`BillingOfficesSettings`, configuración de
  empresa/CAI, formularios de clientes, creación/detalle/PDF de factura y factura manual.
- Validaciones: TypeScript sin errores; `supabase/tests/fiscal_offices.sql` pasó
  en `supabase_db_sarierp_platform26` con rollback (oficina ajena, sin asignación,
  selección incorrecta, snapshot histórico, NC y permisos).
- Suite completa y build verificados en FIN-00. Pendientes: navegador y contraste de formatos reales.
  No se asignaron clientes existentes por inferencia ni se cargaron datos fiscales.
  Se conserva el momento actual de reserva del correlativo al crear documento:
  cambiarlo requiere integrar el ciclo de emisión, sin reciclar números existentes.
- Commit: pendiente. Seguimiento de las seis etapas en `docs/accounting-six-stage-plan.md`.

### 2026-10-26 - PLAT-02 - Habilitación de la cuenta de plataforma del propietario

- Estado: habilitada en Production por solicitud explícita del propietario y
  confirmación del correo. Consola PLAT-01 publicada; login manual pendiente.
- Hallazgo: la cuenta solicitada ya existía como Ventas, rechazada e inactiva,
  asociada a Sari. No se creó un duplicado ni se restableció su contraseña.
- SQL administrativo: transacción con bloqueo del perfil, comprobación del
  estado esperado, ambiente Production verificado, correo confirmado y contraseña
  existente. Se comprobaron todas las columnas UUID de tablas públicas: solo
  había dos referencias de auditoría de rechazo/desactivación como entidad,
  sin referencias comerciales ni como actor. Esos eventos se conservaron.
- Cambio: perfil `b82c31ac-1bc7-4829-88b2-91f24867400b` con rol Admin, aprobado,
  activo, `is_platform_admin=true` y `tenant_id=NULL`. La autorización se registró
  en `activity_logs` con estado anterior/posterior, actor SQL confiable sin
  atribuir una sesión ficticia y confirmación de credenciales sin cambios.
- Validación: lectura posterior confirmó el perfil; transacción de solo lectura
  con rol authenticated y claims del usuario verificó `is_platform_admin()=true`,
  perfil propio visible, contexto operativo nulo y cero clientes comerciales
  visibles. Esto comprueba autorización/RLS, no un login con contraseña.
- Archivos: este registro. SQL puntual conservado en `.ua/intermediate/`
  (preflight, provisionamiento y verificación); no requiere migración adicional
  ni modifica código de aplicación, Auth, credenciales o datos comerciales.
- Pendientes: completar login y UAT autenticado. El frontend publicado dirige
  el acceso de superadministrador a `/platform`.
- Commit del registro: `87017ae7257fed891ada33eacb3d60528498e7fc`; operación SQL aplicada.

### 2026-10-26 - PLAT-01 - Consola de administración de plataforma

- Estado: migración aplicada y frontend publicado en Production el 26/10/2026.
  Postflight SQL/RLS y smoke HTTP aprobados; UAT autenticado pendiente.
- Hallazgo: el dominio raíz admitía login de plataforma pero enviaba siempre a
  `/support`; solo existía una consola de tickets, sin administración de empresas
  ni directorio global de accesos. El wildcard del rol Admin corresponde a la
  empresa y no debe habilitar administración global.
- Cambios: `/platform` con resumen y rutas de empresas, usuarios y actividad;
  navegación y login de superadmin integrados con el shell existente. Registro
  atómico de empresa/configuración/dominio, cambios de nombre y estado, gestión
  de accesos operativos y auditoría de actor/motivo/antes/después. Se reutiliza
  soporte, Dialog, Sonner y formato de fechas. Listados paginados, búsqueda por
  acción, estados de carga/error/reintento, respuestas antiguas descartadas,
  borradores conservados ante fallos y bloqueo de doble envío.
- Autorización: host raíz, sesión verificada y perfil Admin, aprobado, activo,
  `is_platform_admin=true`, sin tenant; controles en layout, API y RPC. API usa
  el cliente con sesión y valida Origin en mutaciones. Los administradores
  operativos no acceden a `/platform` ni a su API y las cuentas de plataforma
  no se editan desde esta consola. No se conceden escrituras directas de tenants
  o auditoría a authenticated, ni acceso comercial transversal.
- Integridad: control de versión para empresas y estado esperado para usuarios;
  cambios de acceso serializados por empresa, conservando un Admin activo;
  altas y auditoría comparten transacción. Suspender/archivar retira la resolución
  pública y el contexto `current_tenant_id()` de sesiones operativas existentes.
  No se crean superadministradores ni se cambian empresas existentes al migrar.
- Archivos: `src/app/(protected)/platform/`, `src/app/api/platform/route.ts`,
  `src/components/platform/`, `src/lib/platform-admin.ts`,
  `src/lib/server/platform-admin.ts`, login, Proxy, permisos, destinos de login,
  shell/sidebar/topbar; `tests/platform-admin.test.mjs`,
  `scripts/validate-audit-sql.mjs`, `docs/uat/platform-admin-console.md` y este registro.
- SQL: `supabase/migrations/20261026160000_platform_admin_console.sql` y
  `supabase/tests/platform_admin_console.sql`.
- Validación: `npx.cmd tsc --noEmit`, 417/417 pruebas Node (12 específicas de
  plataforma), `npm.cmd run lint:ci` (423 archivos, 223 diagnósticos históricos,
  cero regresiones) y build de producción aprobados. Veinte suites SQL/RLS
  aprobadas en copia Docker local con red `none` y sin puertos. Dos degradaciones
  concurrentes de Admin: exactamente una aprobada, otra rechazada, un
  administrador activo y un evento de auditoría. Las pruebas de componentes
  comprueban búsqueda sin consulta por tecla, respuestas obsoletas descartadas,
  doble envío bloqueado, borrador conservado, reintento y errores no JSON legibles.
- Navegador: fixture con identidad y Host/Origin simulados y componentes/API/RPC
  reales contra la copia local. Comprobados login hacia `/platform`, resumen en
  1440/390 px, navegación móvil y listado de empresas; el buscador móvil se ajustó
  tras revisar la captura. El recorrido completo de formularios no quedó
  certificado por fallos del HMR del fixture y falta de espacio al compilarlo.
  Se cerraron los servicios temporales y se liberaron cachés regenerables; el
  build del ERP sí pasó. Escrituras y permisos tienen cobertura API/componentes
  y SQL/RLS, que no sustituye el ensayo autenticado del frontend publicado.
- Publicación: commit `87017ae7257fed891ada33eacb3d60528498e7fc`, migración
  `20261026160000` aplicada antes del frontend con el SQL exacto del commit.
  Huellas de 25 tablas y sus políticas/ACL sin cambios; auditoría nueva con RLS
  y sin escritura directa de authenticated. Postflight con claims de la cuenta
  autorizada: directorios/resumen accesibles y cero clientes comerciales;
  Admin operativo rechazado por la consola y contexto Sari conservado.
- Vercel: `dpl_BpuBiwqfmanozJwbFvP1WWmSS5gq`, Production exitoso; build
  `Kd2AieFGLd15gCz42TsA2` confirmado en los dominios raíz/Sari y despliegue
  inmutable. Login 200, rutas protegidas 307, API anónima 401, origen ajeno 403
  y consola global desde Sari 404. Quality CI `40403957842` aprobado:
  jobs application `121856785173` y database `121856784843` exitosos.
- Pendientes/riesgos: comprobar login con contraseña y completar la matriz UAT.
  El registro de un subdominio no configura DNS/TLS/alojamiento ni callbacks de
  Auth; el administrador de empresa completa sus datos, catálogos y configuración
  fiscal. No se copian datos privados de Sari al registrar otra empresa.
- Evidencia de release: `docs/release/platform-console-2026-10-26.md`.

### 2026-10-26 - UX-PDF-02 - Descargas PDF sin regenerar documentos durante la escritura

- Estado: publicado en Production el 26/10/2026; UAT autenticado pendiente.
- Hallazgo: auditoría de los consumidores de React-PDF encontró 11 controles
  `PDFDownloadLink` en seis pantallas. El renderer instalado actualiza el PDF
  cuando cambia la identidad de `document`; los JSX recreados por el estado del
  formulario provocaban trabajo PDF al escribir. Afectaba motivo de pérdida en
  cotizaciones; notas, referencias de pago y reversos en facturas; búsquedas y
  filtros del estado de cuenta; campos de Shipping Instruction; notas y acciones
  de Booking; y formularios/anexos de HBL, AWB y Carta Porte. El cuerpo del correo
  de cotizaciones es de solo lectura, no un campo editable afectado.
- Cambios: componente compartido `PdfDownloadButton`, que genera el documento
  únicamente al pulsar Descargar y conserva documento/nombre del mismo clic.
  Bloquea duplicados mientras genera, informa errores con Sonner y permite
  reintentar. Descarta finalizaciones tras desmontar y libera URLs temporales.
  Los cuatro botones que estaban dentro de enlaces ahora son botones únicos,
  conservando estilos y títulos. Se mantienen documentos, props, permisos,
  nombres de archivo, cálculos y snapshots comerciales existentes.
- Alcance: cotización detalle (2 controles), factura detalle (3), facturación /
  estado de cuenta (1), Shipping Instruction detalle (1), Booking detalle (1)
  y BL detalle (3). Factura manual, reportes y las demás acciones explícitas
  `pdf(...).toBlob()` ya generan por solicitud y se conservan.
- Archivos: `src/components/pdf/PdfDownloadButton.tsx`,
  `tests/pdf-download-button.test.mjs`,
  `src/app/(protected)/quotations/[id]/page.tsx`,
  `src/app/(protected)/invoicing/page.tsx`,
  `src/app/(protected)/invoicing/[id]/page.tsx`,
  `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`,
  `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`,
  `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  y este registro. SQL: ninguno.
- Validaciones: cinco regresiones del componente real cubren 40 cambios de
  documento/nombre sin generación, datos vigentes al pulsar, snapshot consistente
  durante edición concurrente, doble clic, error/reintento, disabled, desmontaje
  y liberación de URLs. Chrome local aislado con el botón real y renderer
  instrumentado: 49 caracteres sin solicitudes PDF, una al descargar; snapshot,
  nombre, doble clic y error/reintento verificados; cero excepciones y sin
  desborde a 1440/390 px. Es verificación de llamadas al renderer con datos
  ficticios, no medición de latencia ni UAT de contenido PDF autenticado.
  `npx.cmd tsc --noEmit` OK; suite Node 405/405 con concurrencia 2;
  `npm.cmd run lint:ci`: 412 archivos, 223 diagnósticos históricos y cero
  regresiones; build completo OK con `CIRCLE_NODE_TOTAL=2`; `git diff --check` OK.
- Riesgos/pendientes: probar descargas reales con sesión autorizada
  en las seis pantallas. La generación se inicia al descargar, por lo que la
  espera se muestra entonces con el estado Generando. No se cambia SQL ni RLS.
- Commit funcional: `30909006756f6c1de8a2e5102122362632868c6a`, en `origin/main`.
- Publicación autorizada por el usuario: Vercel Production `7340397399`,
  success, commit funcional exacto; [deployment](https://vercel.com/claudherhn-5641s-projects/sarierp/SxrpQ48g6NGBZzs6dWodyMFRzA9k).
  Quality [40379233051](https://github.com/dhernandezp123/sarierp/actions/runs/40379233051):
  application y database success. Smoke de `https://sari.forwarders.app`:
  login 200, las seis rutas protegidas redirigen 307 al login y scanner API 401.
  Build ID `wAZnDlEYJrIquRHEDIZC7`; su manifiesto responde 200 en dominio e
  instancia `https://sarierp-achfbfpou-claudherhn-5641s-projects.vercel.app`.
  El login del host técnico devuelve el 404 esperado por tenant no registrado.
  Evidencia ignorada en `.ua/intermediate/pdf-release-*`; sin migraciones ni
  escrituras comerciales de prueba. Esto no sustituye UAT autenticado.

### 2026-10-26 - UX-REPRICE-01 - Escritura del motivo de reapertura sin trabajo PDF por tecla

- Estado: publicado en Production el 26/10/2026; UAT autenticado pendiente.
- Hallazgo: el textarea de Reabrir para Repricing almacenaba cada pulsación en
  el estado de `QuotationDetail`. Esto volvía a ejecutar el detalle completo y
  creaba una nueva prop `document` para `PDFDownloadLink`. El renderer instalado
  vuelve a llamar `updateInstance(doc)` en un efecto dependiente de esa prop;
  escribir provocaba trabajo de actualización del PDF ajeno al motivo.
- Cambios: `QuotationRepricingDialog` conserva el borrador en su propio estado
  y se monta únicamente mientras está abierto. Entrega el último texto al
  confirmar; el padre conserva trim, validación, transición atómica, auditoría,
  actualización de estado e historial. Cerrar/reabrir limpia el borrador; un
  fallo conserva el texto. Durante la reapertura se bloquean edición y cierre.
  Se reutiliza el Dialog existente, con etiqueta asociada al textarea.
- Archivos: `src/app/(protected)/quotations/[id]/page.tsx`,
  `src/components/quotations/QuotationRepricingDialog.tsx`,
  `tests/quotation-repricing-dialog.test.mjs` y este registro. SQL: ninguno.
- Validaciones: reproducción en Chrome local con página real, datos ficticios y
  `PDFDownloadLink` instrumentado según la dependencia `document` del renderer:
  32 caracteres causaban 32 actualizaciones del documento antes del fix y cero
  después; cero lecturas de base de datos durante la escritura en ambos casos.
  Es una medición de invalidaciones, no de duración de generación de PDFs reales.
  Modal revisado a 1440/390 px, sin desborde del diálogo. Cuatro regresiones
  aprobadas: texto completo/multilínea, conservación tras fallo y nueva apertura,
  bloqueo durante guardado/impacto y callback real de detalle con transición a
  `Pendiente de Fijar Precios`, motivo recortado y error/reintento.
  `npx.cmd tsc --noEmit` OK; suite Node 400/400 con concurrencia 2;
  `npm.cmd run lint:ci`: 410 archivos, 223 diagnósticos históricos y cero
  regresiones; build completo OK con `CIRCLE_NODE_TOTAL=2`; `git diff --check` OK.
- Riesgos/pendientes: verificar escritura y guardar/reabrir con usuario de
  Pricing/Admin en la versión publicada. La prueba local utiliza navegación y
  fuentes de datos simuladas; no escribe cotizaciones, no envía mensajes ni
  ejecuta reaperturas en Production. No se cambian RPC, RLS, estados, snapshots
  comerciales ni contenido/cálculos del PDF.
- Commit funcional: `30909006756f6c1de8a2e5102122362632868c6a`, en `origin/main`.
- Publicación: mismo deployment Production, Quality CI y smoke de UX-PDF-02,
  autorizados por el usuario el 26/10/2026. Pendiente únicamente UAT autenticado.

### 2026-10-26 - ACC-01 - Accesos operativos de Contabilidad

- Estado: implementado, validado y publicado en Production el 26/10/2026;
  UAT de escritura/guardado con sesión de Contabilidad pendiente.
- Hallazgo: Contabilidad no tenía acceso a perfiles de clientes ni al detalle
  de cotizaciones. Empresa y CAI mostraban controles exclusivos de Admin;
  RLS limitaba clientes/cotizaciones a ganadas o con operación, y rechazaba
  editar clientes y configuración corporativa.
- Cambios: consulta/edición de clientes activos del tenant e historial;
  creación/edición de empresa y configuración de facturación; registro y
  activación de CAI; consulta de todos los estados de cotización, costos,
  utilidades y reporte comercial con CSV/PDF. Scanner/Factura manual ya
  autorizaba Contabilidad en servidor y RLS y se añadió su regresión.
  Se habilita también la acción rápida Ver / Editar Cliente. La tasa ISV cero
  se conserva al guardar configuración. No se conceden crear/eliminar clientes,
  crear/editar cotizaciones, cambiar pricing/tarifas ni enviar cotizaciones.
  Se conservan los permisos financieros previos para cotizaciones ganadas.
- Archivos: `src/lib/permissions.ts`, `src/components/layout/topbar.tsx`,
  páginas `clientes`, `clientes/[id]`, `quotations/[id]`, `reports`,
  `settings/company` y `settings/cai` bajo `src/app/(protected)`;
  `tests/accounting-access.test.mjs`, `tests/manual-invoice-routes.test.mjs`,
  `tests/pricing-write-permissions.test.mjs`, `scripts/validate-audit-sql.mjs`,
  `docs/uat/accounting-and-billing-points.md` y este registro.
- SQL: `supabase/migrations/20261026120000_accounting_access.sql`;
  regresión `supabase/tests/accounting_access.sql`. Helpers/policies conservan
  aprobación, actividad y tenant; Bunker se habilita exclusivamente por su código
  corporativo para que guardar Empresa no deje un error parcial de permisos.
- Validaciones: bloqueo reproducido antes del fix en Node y SQL; regresiones de
  pantallas reales mediante el harness existente, autorización del scanner,
  edición/historial y negativos de RLS (otra empresa, inactivo, pendiente,
  Cliente, creación/borrado y escritura de precios) aprobados. Dieciocho suites
  SQL/RLS aprobadas en una copia Docker local sin red ni puertos.
- Pendientes/riesgos: ejecutar la matriz UAT del documento adjunto. Se verificó
  RLS de solo lectura en Production con una identidad Contabilidad aprobada y
  activa: todos los clientes/cotizaciones, edición de cliente autorizada,
  costos/scanner disponibles, sin crear clientes ni modificar tarifas/precios.
  Esto no sustituye guardar/reabrir en una sesión de navegador.
- Commit funcional: `af2758a4808d1b955b0f525a34c06c6c7d2bb07b`, en `origin/main`.
- Publicación autorizada por el usuario el 26/10/2026; preflight confirmado y
  ejecución documentada en `docs/release/accounting-billing-2026-10-26.md`.

### 2026-10-26 - BILL-POS-01 - CAI y correlativos por punto de venta

- Estado: implementado, validado y publicado en Production el 26/10/2026;
  datos fiscales reales de ambas oficinas y UAT autenticado pendientes.
- Hallazgo: la unicidad y activación del CAI eran por tenant/tipo documental.
  Activar el rango de otra oficina desactivaba el anterior. La emisión no
  recibía oficina y seleccionaba el único CAI activo. El entrypoint público de
  activación tampoco delegaba en el helper tenant-aware vigente.
- Cambios: empresa administra puntos de venta; para Sari se inicializan
  San Pedro Sula (predeterminado) y Tegucigalpa, y los rangos existentes se
  identifican como SPS. Cada oficina/tipo mantiene su CAI activo y next_number.
  Registro permite indicar el próximo correlativo si parte del rango ya se
  utilizó fuera del ERP; vacío conserva el inicio autorizado. Activación y
  emisión comparten bloqueo transaccional por tenant/oficina/tipo. No hay
  fallback de CAI entre oficinas. NC/ND heredan la oficina de su factura,
  incluidas facturas antiguas cuyo rango permite resolverla. El documento nuevo
  conserva un snapshot de oficina que no puede cambiarse después de numerarlo;
  se muestra en listado, detalle, PDF y reporte de facturación con filtro/export.
  Se bloquea quitar/renombrar oficinas con rangos registrados.
- Archivos: `src/lib/billing-points-of-sale.ts`, `src/lib/cai-validation.ts`,
  `src/lib/company-settings.ts`, `src/lib/invoice-list.ts`,
  `src/lib/report-view.ts`, `src/components/pdf/invoice-pdf.tsx`, páginas
  `settings/company`, `settings/cai`, `invoicing`, `invoicing/new`,
  `invoicing/[id]` y `reports` bajo `src/app/(protected)`;
  `tests/billing-points-of-sale.test.mjs`, `tests/accounting-access.test.mjs`,
  `tests/invoice-point-of-sale-pdf.test.mjs`,
  `scripts/validate-audit-sql.mjs`, `docs/uat/accounting-and-billing-points.md`
  y este registro.
- SQL: `supabase/migrations/20261026130000_billing_points_of_sale.sql`;
  regresión `supabase/tests/billing_points_of_sale.sql`. No se actualizan
  facturas existentes, sus números, CAI, impuestos o importes, ni se reinician
  next_number existentes. Los otros tenants reciben su punto Principal.
- Validaciones: dieciocho suites SQL/RLS aprobadas en copia aislada; ambas
  migraciones completas aplicadas desde una copia limpia, más validación final
  del ajuste de metadatos del correlativo inicial. Prueba con seis conexiones:
  veinte emisiones concurrentes (diez SPS/diez TGU), veinte números distintos,
  siguiente correlativo 11 en cada oficina. SQL cubre rotación por oficina,
  agotamiento independiente, oficina ajena, snapshot, NC, herencia, ISV y
  correlativo inicial ya utilizado. El harness monta la pantalla de factura y
  comprueba filtrado por oficina y descarte de respuestas CAI obsoletas.
- Validación general: `npx.cmd tsc --noEmit` aprobado; suite Node 396/396
  (`node --test --test-concurrency=2 tests/*.test.mjs`); `npm.cmd run lint:ci`
  con 408 archivos, 223 diagnósticos históricos y cero regresiones. Build
  completo aprobado con `CIRCLE_NODE_TOTAL=2` para un worker de prerender.
  El intento inicial agotó la memoria local con Docker abierto; se cerró el
  entorno de prueba y se repitió sin modificar la configuración del proyecto.
  PDF fiscal real renderizado para SPS, TGU y legacy: CAI/importe/oficina
  correctos. `git diff --check` aprobado.
- Deuda previa comprobada: la suite adicional
  `phase3_commercial_tenant_isolation.sql` falla en `guard_quotation_transition`
  por actualizar estados directamente. Se reprodujo el mismo fallo en la copia
  previa a estas migraciones; no pertenece a la selección de suites de CI ni
  se modificó su fixture para eludir el guard.
- Pendientes/riesgos: cargar CAI/rango/vigencia y próximo correlativo real de
  ambas oficinas: Production no tenía rangos CAI ni facturas fiscales durante
  el preflight. Los reportes históricos conservan el lugar de emisión
  guardado cuando no existe snapshot de oficina. Scanner/Factura manual mantiene
  su circuito SARI USA independiente de la facturación fiscal hondureña.
- Commit funcional: `af2758a4808d1b955b0f525a34c06c6c7d2bb07b`, en `origin/main`.
- Publicación autorizada por el usuario el 26/10/2026. Production tiene cero
  rangos CAI y cero facturas fiscales: falta registrar datos reales de ambas
  oficinas para emitir. Dry-run selectivo y baseline de helpers confirmados;
  ver `docs/release/accounting-billing-2026-10-26.md`.
- SQL aplicado: historial de 130 a 132 migraciones, exclusivamente las dos
  autorizadas; fuente registrada idéntica a los archivos del commit. Guardas
  transaccionales verificaron huellas de 21 tablas, RLS/ACL y policies ajenas al
  cambio. Postflight independiente: 17 tablas sin diferencias y actividad
  concurrente de Pricing en cotizaciones/tarifas/cargos y dos activity_logs
  `agent_quote_selected`; los datos no cambiaron dentro de la migración.
  Helpers publicados coinciden con el commit y Outlook continúa sin aplicar.
- Vercel: Production `7339152349`, success, fuente del commit funcional;
  instancia `https://sarierp-apcouhg6b-claudherhn-5641s-projects.vercel.app`.
  Dominio `sari.forwarders.app` comprobado con build ID `MiY8oaazeY5lXJ11tf7hF`;
  manifiesto HTTP 200 e idéntico en dominio/instancia. Login 200, módulos
  protegidos 307 y API del scanner 401 sin sesión. Sin documentos, usuarios ni
  mensajes de prueba creados en Production.
- CI remoto del commit funcional: [Quality 40370636848](https://github.com/dhernandezp123/sarierp/actions/runs/40370636848),
  `application` y `database` aprobados.

### 2026-10-23 - MIAMI-INS-03 - ISV opcional en el seguro Miami

- Estado: implementado, validado localmente y publicado en Production el
  23/10/2026 como ajuste del despliegue de seguro autorizado. UAT autenticado pendiente.
- Hallazgo: crear una cotización Miami LCL/aérea con seguro añadía ISV sin
  elección del usuario. Pricing empezaba con el check de ISV marcado y podía
  arrastrar esa elección de una cotización a otra.
- Archivos: `src/lib/miami-insurance.ts`,
  `src/app/(protected)/quotations/new/page.tsx`,
  `src/app/(protected)/pricing-comparison/page.tsx`,
  `tests/miami-insurance.test.mjs`, `tests/miami-insurance-create.test.mjs`,
  `tests/miami-insurance-pricing.test.mjs`, `tests/miami-insurance-pdf.test.mjs`,
  `tests/page-harness.mjs` y este registro. SQL modificado: ninguno.
- Cambios: check «Aplicar ISV al seguro de carga», desmarcado por defecto en
  creación Miami LCL/aérea. Composición de cargos sin ISV salvo elección
  explícita; usa la tasa corporativa al marcar, incluido 0 válido. Sin marcar,
  persiste `taxable = false`, `tax_rate = 0` y `tax_amount = 0` en la línea de
  seguro. PDF, borrador y creación aprobada comparten ese cálculo. Pricing carga
  la elección del seguro guardado y, sin línea previa, inicia sin ISV en Miami;
  los demás productos conservan su valor inicial. Duplicar conserva el flag
  explícito de la línea fuente. No se recalculan documentos históricos ni
  snapshots ofrecidos/aceptados por cargar una pantalla.
- Validaciones: se reprodujeron cuatro fallos antes del fix. Regresiones de
  helper, formulario, borrador, duplicación, Pricing y PDF real: aprobadas.
  Suite Node 381/381, `npx.cmd tsc --noEmit`, build y `git diff --check`: OK.
  ESLint dirigido conserva 53 diagnósticos históricos. `npm.cmd run lint:ci`
  confirma cero regresiones. Se monta el contenido real de Pricing mediante el
  harness existente, sin conectarse a Supabase ni crear datos de negocio reales.
- Riesgos/pendientes: UAT autenticado crear/guardar/reabrir una cotización Miami
  LCL/aérea con y sin ISV, y recalcular explícitamente desde Pricing. Un borrador
  sin datos suficientes para generar la línea de seguro no persiste una prima
  ni su impuesto; al calcularlo después, ISV vuelve a requerir elección.
  Sin cambios SQL/RLS ni modificaciones a facturas emitidas.
- Commit funcional: `18538f469df5c4c038a17476139dd0b6e0f7571c`, en `origin/main`.
- CI remoto: [Quality 39992878789](https://github.com/dhernandezp123/sarierp/actions/runs/39992878789),
  jobs `application` y `database` aprobados; incluye SQL/RLS en base desechable.
- Publicación: [Vercel](https://vercel.com/claudherhn-5641s-projects/sarierp/HyE34iXW3Wn7omGiF7wAVzmGLbLi)
  y GitHub Deployment `7284252379`, `Production`, `success`, con fuente exacta del
  commit funcional. URL inmutable:
  `https://sarierp-95g7tgevh-claudherhn-5641s-projects.vercel.app`.
- Smoke: login 200 y cotización nueva/Pricing 307 a login sin sesión en
  `sari.forwarders.app`. Build ID `m46du8gNl3erQAfANPFZO`; su manifiesto responde
  200 en el dominio y en la instancia inmutable, con el mismo SHA-256:
  `9476e0afd3f9da68a64e6ec58631191fd3eaca62c9f5a377e7517fe9a89e59ea`.
  Verifica disponibilidad/versión publicada, no UAT autenticado de negocio.

### 2026-10-23 - MIAMI-INS-02 - Seguro opcional por cotización Miami

- Estado: implementado, validado localmente y publicado en Production el
  23/10/2026. UAT autenticado pendiente.
- Hallazgo: la preferencia `clientes.asegura_carga` se interpretaba como una
  obligación y bloqueaba desmarcar el seguro, aunque el cliente no asegura todas
  sus cargas. Pricing también ignoraba un `requires_insurance = false` explícito.
- Archivos: `src/app/(protected)/quotations/new/page.tsx`,
  `src/app/(protected)/pricing-comparison/page.tsx`,
  `tests/miami-insurance-create.test.mjs`, `tests/miami-insurance-pdf.test.mjs`,
  `HARDENING.md`. SQL modificado: ninguno.
- Cambios: la preferencia del cliente es el valor inicial para Miami LCL/aéreo;
  marcar o desmarcar decide para esa cotización. Cambiar cliente usa su propia
  preferencia y duplicar conserva la decisión original. Un `false` guardado
  prevalece en Pricing; solo se consulta la preferencia si no hay decisión.
  Sin seguro no se exige FOB ni se genera cargo, ISV o costo de seguro Miami.
  No cambia la ficha del cliente ni recalcula documentos históricos.
- Validaciones: antes del fix se reprodujeron tres fallos con el formulario
  real montado mediante el harness existente (bloqueo, cambio de cliente y
  duplicación). Luego pasaron las seis regresiones de creación, incluyendo
  Miami LCL/aéreo sin FOB ni seguro, reactivación del check y costo residual
  descartado al duplicar. PDF real con y sin seguro respeta la decisión,
  importes e ISV y no muestra datos internos. Suite Node 376/376,
  `npx.cmd tsc --noEmit`, build y `git diff --check`: OK. ESLint dirigido
  conserva 53 diagnósticos históricos; `npm.cmd run lint:ci` confirma 223
  diagnósticos existentes en 403 archivos y cero regresiones.
- Riesgos/pendientes: verificar en sesión autenticada crear, guardar/reabrir y
  previsualizar una cotización Miami LCL/aérea sin seguro para un cliente que
  asegura por defecto. Sin cambios de SQL/RLS ni datos de negocio de prueba
  creados en Production.
- Commit funcional: `6cdf4bb0ec484b137a4c7e7e7118a72dcc25c616`, en `origin/main`.
- CI remoto: [Quality 39986870539](https://github.com/dhernandezp123/sarierp/actions/runs/39986870539),
  jobs `application` y `database` aprobados, incluidas suites SQL/RLS aisladas.
- Publicación: [Vercel](https://vercel.com/claudherhn-5641s-projects/sarierp/94LADFhy5sFhutG1NNkQkn7ESfNT)
  reporta éxito; GitHub Deployment `7283365334`, ambiente `Production`, fuente
  exacta del commit funcional. URL inmutable:
  `https://sarierp-3flhrvaxw-claudherhn-5641s-projects.vercel.app`.
- Smoke posterior: `https://sari.forwarders.app/login` responde 200;
  `/quotations/new` y `/pricing-comparison` responden 307 a login sin sesión.
  Build ID del HTML del dominio: `zQ7tZiJWhIjXcnbF2bb88`. Su `_buildManifest.js`
  responde 200 y coincide en SHA-256 entre dominio e instancia inmutable:
  `9476e0afd3f9da68a64e6ec58631191fd3eaca62c9f5a377e7517fe9a89e59ea`.
  Esto acredita disponibilidad y versión publicada; no sustituye UAT autenticado.

### 2026-10-16 - MIAMI-INS-01 - Seguro al crear cotizaciones Miami aprobadas

- Estado: implementado y validado localmente; UAT autenticado en Production
  pendiente. No se crean ni recalculan cotizaciones reales durante la prueba.
- Hallazgo: `/quotations/new` guardaba `requires_insurance`, pero el generador
  automático Miami no añadía un cargo de seguro al aprobar ni al previsualizar.
  El cálculo legacy leía `fob_value` mientras el campo visible escribía
  `commercial_value`. La cobertura corporativa Ocean Freight tampoco reconocía
  el código propio del flete Miami LCL.
- Archivos: `src/app/(protected)/quotations/new/page.tsx`,
  `src/lib/miami-insurance.ts`, `src/lib/insurance-coverage.ts`,
  `tests/miami-insurance.test.mjs`, `tests/miami-insurance-create.test.mjs`,
  `tests/miami-insurance-pdf.test.mjs`, `HARDENING.md`. SQL modificado: ninguno.
- Cambios: nueva composición de cargos para creación Miami, compartida por PDF
  y guardado atómico existente. Usa FOB visible, porcentaje del cliente, costo
  corporativo, cobertura/exclusiones vigentes, recargo asegurable del 10%, mínimo
  USD 75 e ISV de empresa (incluido 0 explícito). Se conservan bases de costo y
  venta independientes. Alias de fletes Miami para pólizas Ocean/Air Freight.
  Respeta seguro obligatorio del cliente, muestra prima/ISV/total y bloquea
  aprobación/PDF incompletos; permite guardar borrador. Errores RPC visibles.
- Validaciones ejecutadas:
  - Regresiones de composición y página: LCL/aéreo, selección/obligatoriedad,
    FOB visible, cantidades, exclusiones, mínimo, tasa cero, datos inválidos,
    borrador y error RPC conservando datos. PDF comercial real con seguro,
    ISV y total, sin costos/proveedor/notas internas.
  - Supabase aislado `sarierp_aud01`, sesión Ventas aprobada y cliente ficticio:
    creación real `Pricing Aprobado` LCL/aéreo con seguro USD 75 + ISV USD 11.25;
    lectura con sesión normal confirma dos cargos y atributos del padre.
    Cargo inválido revierte la transacción sin cotización parcial.
  - Chrome con datos simulados: bloqueo sin FOB, prima/ISV/total, igualdad de
    PDF y payload, recuperación ante error, LCL/aéreo y anchos 1440/390/320.
  - Suite Node 353/353, TypeScript, ESLint dirigido, lint sin regresiones y
    build: OK. Registros ficticios eliminados; stack aislado detenido.
- Riesgos/pendientes: no hay backfill ni recálculo de cotizaciones existentes
  u opciones ofrecidas; requieren revisión comercial individual. El ajuste de
  alias afecta cálculos futuros explícitos de cobertura, nunca un guardado
  automático de documentos históricos. Sin migración ni cambios de RLS;
  se conserva RPC transaccional y autorización vigente. UAT real pendiente.
  Commit funcional: `00c7fe6`; despliegue y CI se verifican en la entrega.

### 2026-10-16 - AUTH-INVITE-NAMES-01 - Nombres desde la invitación y corrección de perfiles

- Estado: implementado y validado localmente; código publicado en main. UAT real de
  invitación/aceptación/edición pendiente; no se editan datos de usuarios reales.
- Hallazgo: el modal y la API solo recibían correo/rol; los perfiles figuraban
  «Sin nombre» hasta completar onboarding. Su redirección automática por tener
  nombre/apellido y aprobación habría omitido la contraseña al precargar datos.
- Archivos: `src/app/(protected)/admin/users/page.tsx`,
  `src/app/api/admin/invite/route.ts`, `src/app/onboarding/page.tsx`,
  `tests/admin-invite-tenant.test.mjs`, `tests/invite-onboarding.test.mjs`,
  `docs/invitaciones.md`, `HARDENING.md`. SQL modificado: ninguno.
- Cambios:
  - Nombre y apellido obligatorios en invitación, con etiquetas, límite 100,
    recorte de espacios y rechazo de tipos inválidos/caracteres de control en API.
    Se guardan en metadata de Auth y perfil; el update debe devolver una fila.
  - Modal desplazable dentro de la pantalla móvil, prevención de envío doble,
    bloqueo de campos durante envío, limpieza al cancelar/terminar y conservación
    de datos ante fallo de conexión. Sonner informa errores/reintentos.
  - Edición de nombre/apellido para cuentas existentes mediante sesión normal,
    ID+tenant explícitos y RLS vigente. Solo se anuncian filas devueltas; se
    actualiza el listado y registra auditoría auxiliar. No se modifica Auth,
    roles, aprobación, claves ni correo al corregir un nombre existente.
  - Onboarding precarga nombres y mantiene creación de contraseña obligatoria;
    elimina el salto por perfil nombrado/aprobado. SDK fuera del callback Auth,
    soporte de sesión inicial, respuestas obsoletas descartadas y borradores
    conservados ante USER_UPDATED. Se mantienen validación de tenant y destinos
    de Cliente pendiente/interno aprobados.
- Validaciones ejecutadas:
  - Antes del cambio, regresiones reprodujeron nombres ausentes en Auth/perfil,
    aceptación de payload sin nombres y salto al dashboard sin contraseña.
  - Suite Node 345/345, TypeScript final, ESLint dirigido y build 86 páginas: OK.
  - Auth/API/SMTP/DB aislados `sarierp_aud01`: nombres presentes antes de abrir
    correo para Ventas y Cliente; corrección Admin con sesión+tenant, filtro de
    otro tenant rechazado, marca/destino, contraseña, login y token de un uso: OK.
    Usuarios ficticios eliminados; sin invitaciones ni modificaciones remotas.
  - Chrome compilado con APIs simuladas: campos obligatorios, foco inicial,
    JSON y recorte, error de red/reintento conservando datos, cancelación limpia,
    modal a 1440/390/320 sin desbordes y desplazable a 320x640. Edición existente,
    rechazo/reintento sin falso éxito, filtro tenant y actualización de fila: OK.
  - Activación Chrome: datos precargados sin redirección automática, nombres
    editados conservados al cambiar sesión, rechazo de contraseñas distintas y
    guardado con contraseña: OK; revisión visual móvil aprobada.
- Riesgos/pendientes: registros históricos no se rellenan por inferencia; usar
  Editar nombre o completar la activación. Sin migraciones/RLS nuevas; se
  reutilizan políticas vigentes y no se declara UAT Production por mocks.
  La invitación sigue pudiendo enviarse antes de un error al preparar perfil:
  la API conserva el aviso explícito y no anuncia éxito completo. Commit funcional:
  `130a91e`; despliegue y CI se verifican en la entrega.

### 2026-10-16 - AUTH-INVITE-BRAND-01 - Invitación con marca y activación de Sari

- Estado: plantilla aplicada y verificada en Supabase Production; validación
  técnica local aprobada. Entrega real Gmail/Outlook y UAT de aceptación en
  navegador pendientes del próximo envío autorizado.
- Hallazgo: la invitación alojada seguía con `You have been invited`, HTML
  genérico de 197 caracteres y sin marca Sari. Faltaba autorizar
  `https://sari.forwarders.app/onboarding`; Auth podía reemplazar el destino por
  Site URL. El modal mostraba instrucciones sobre claves/archivos del servidor.
- Archivos:
  - `supabase/templates/invite.html`, `supabase/config.toml`.
  - `scripts/publish-recovery-email.mjs`, `tests/invite-email-template.test.mjs`.
  - `src/app/(protected)/admin/users/page.tsx`, `docs/invitaciones.md`,
    `HARDENING.md`. SQL modificado: ninguno.
- Cambios:
  - Asunto ASCII **Activa tu cuenta**; logo, nombre/color de Sari y texto español,
    botón Activar mi cuenta, enlace alternativo y aviso de invitación inesperada.
    Se reutilizan diseño/logos del correo de recuperación; tablas y CSS inline.
  - Marca por `.RedirectTo` exacto de onboarding y respaldo neutral Forwarders.
    Dos href `{{ .ConfirmationURL }}`; tokens sin impresión como texto visible.
  - Publicador existente ampliado con `--invite`: separa los campos de Auth de
    cada flujo, valida destino y conserva recuperación/SMTP/allowlist previa.
  - Destino de onboarding Sari añadido en Production. Modal con explicación
    para la persona administradora, sin instrucciones sobre secretos del servidor.
    No se modifican API, roles, aprobación, RLS ni lógica de onboarding.
- Validaciones ejecutadas:
  - SMTP/Auth/DB aislados `sarierp_aud01`: API real con Admin ficticio invitando
    Ventas y Cliente; Subject literal, marca Sari, dos links idénticos con
    type=invite, onboarding exacto, sesión nueva, perfil/tenant por RLS,
    contraseña/nombre, login y rechazo del token consumido: OK. Ventas Aprobado,
    Cliente Pendiente según flujo vigente. Respaldo neutral por Auth local directo.
    Todas las cuentas ficticias eliminadas y stack aislado detenido.
  - Chrome 1440/390/320 px: Sari y respaldo sin desbordes; logos HTTPS cargados,
    inspección visual móvil aprobada. Enlaces ficticios en las capturas.
  - Regresiones de separación invite/recovery, destinos y asunto; suite Node
    342/342, TypeScript, ESLint dirigido y build Next de 86 páginas: OK.
  - PATCH en proyecto `fwspgdzvlbtbgiupvrzo`, limitado al asunto/HTML de invite
    y unión de allowlist. GET posterior coincide exactamente con el repositorio;
    todo otro ajuste de Auth, incluida recuperación/SMTP, permanece igual.
    Copia previa `.ua/intermediate/invite-auth-before.json`, fuera de Git.
- Riesgos/pendientes: no se enviaron invitaciones reales ni se consumieron
  enlaces de usuarios. Configuración y buzón local no certifican entrega real;
  pendiente UAT en Gmail/Outlook y aceptación en navegador. Solo se retocó texto
  del modal, sin cambiar su interacción; sin UAT nueva del modal completo.
  Nuevas empresas requieren su condición y callback exactos en la plantilla.
  Remitente compartido sigue Forwarders ERP. Commit funcional: `740cee6`.

### 2026-10-16 - AUTH-BRAND-03 - Asunto compatible con la entrega SMTP real

- Estado: mitigación aplicada y verificada en Supabase Production; validación
  SMTP local aprobada. Recepción real del nuevo asunto pendiente. No se declara
  identificada la etapa exacta que recodifica el asunto Unicode en producción.
- Hallazgo: «Mostrar original» del correo de las 10:34 demuestra que el asunto
  llegó dañado después de AUTH-BRAND-02 (commit 10:32). No era solo el título de
  una conversación anterior. La configuración seguía devolviendo `ñ` U+00F1;
  ese GET y el SMTP local correcto no certificaban la entrega real Unicode.
- Archivos: `supabase/config.toml`, `scripts/publish-recovery-email.mjs`,
  `tests/recovery-email-template.test.mjs`, `docs/password-recovery.md`,
  `HARDENING.md`. SQL modificado: ninguno.
- Cambio: asunto **Recupera tu acceso**, español solo ASCII, para que una
  recodificación UTF-8/Latin-1 no altere sus caracteres. El publicador exige ese
  valor; se conserva contenido HTML, marca de empresa y ambos enlaces.
- Validaciones ejecutadas:
  - Regresión de asunto configurado y recodificación, rechazo de mojibake,
    callback exacto y preservación de destinos/SMTP: OK. Suite Node 339/339.
  - SMTP aislado `sarierp_aud01`, cuentas ficticias Cliente: Subject literal
    `Recupera tu acceso` en MIME crudo y buzón, Sari/respaldo, enlaces idénticos,
    destino correcto, cambio de contraseña, login y token de un solo uso: OK.
    Usuarios eliminados y stack aislado detenido; cero correos de prueba reales.
  - TypeScript y ESLint dirigido: OK. No cambia código de aplicación ni HTML;
    no se repite revisión visual ni build local. CI verificará el build.
  - PATCH dirigido y GET posterior: asunto exacto; HTML/allowlist iguales a la
    entrega anterior y todos los demás ajustes de Auth/SMTP sin cambios. Copia
    previa local `recovery-ascii-auth-before.json`, fuera de Git.
- Pendientes: confirmar asunto del próximo correo real autorizado. Los correos
  ya recibidos mantienen su asunto anterior. La captura muestra SPF/DKIM/DMARC
  PASS, pero esas validaciones no acreditan la codificación del Subject.
  Causa exacta de la recodificación alojada pendiente; se evita con el asunto
  ASCII sin cambiar proveedor ni credenciales. Commit funcional: `6160acb`.

### 2026-10-16 - AUTH-BRAND-02 - Destino por empresa, UTF-8 y enlace alternativo

- Seguimiento: AUTH-BRAND-03 registra que la entrega real del asunto Unicode
  seguía dañada y publica un asunto ASCII; el destino y marca Sari sí llegaron.
- Estado: corrección aplicada y verificada en Supabase Production; pruebas
  técnicas locales aprobadas. Pendiente nueva recepción real desde el portal
  del cliente y revisión Gmail/Outlook; no se usaron sus tokens ni se enviaron
  correos de ensayo a usuarios operativos.
- Hallazgo: capturas reales posteriores a AUTH-BRAND-01 mostraron marca neutral,
  `redirect_to=https://forwarders.app` y asunto mal codificado. La allowlist
  productiva contenía solo destinos de plataforma: Auth descartaba el callback
  de Sari y usaba Site URL. La publicación desde PowerShell sin BOM interpretó
  mal la literal UTF-8 del asunto. La comparación previa contra esa misma
  literal no detectó el error; el HTML sí se había leído correctamente.
- Archivos: `supabase/templates/recovery.html`,
  `scripts/publish-recovery-email.mjs`, `tests/recovery-email-template.test.mjs`,
  `docs/password-recovery.md`, `HARDENING.md`. SQL modificado: ninguno.
- Cambios:
  - Callback exacto `https://sari.forwarders.app/auth/callback?next=/portal/reset-password`
    añadido a `uri_allow_list`, conservando todos los destinos previos.
  - Publicación versionada con Node: lee asunto y HTML en UTF-8, rechaza daños
    de codificación y callbacks inesperados. PATCH limitado al asunto, HTML y
    unión de allowlist; GET posterior verifica valores y que todo lo demás en
    Auth/SMTP siga igual. No se publica la configuración local completa.
  - Enlace inferior con etiqueta legible, sin URL/token como texto visible;
    conserva exactamente el mismo href de Auth que el botón. Esto reduce su
    exposición visual, no elimina el token del destino ni cambia su sensibilidad.
- Análisis del enlace: el token es una credencial temporal para recuperar esa
  cuenta, no su contraseña ni una clave de servicio/base de datos. Debe tratarse
  como sensible si se comparte o captura. No se abrió ni consumió ningún enlace
  real aportado; se indica solicitar uno nuevo desde el portal de Sari.
- Validaciones ejecutadas:
  - Fallo reproducido en Auth/SMTP aislado con perfil Cliente: sin allowlist de
    Sari, marca neutral y redirección a Site URL; corregido al añadir el callback.
  - Después: Sari y respaldo neutral; asunto SMTP real codificado como UTF-8,
    dos href idénticos, sin token como texto, destino exacto, sesión nueva,
    lectura RLS de perfil Cliente/tenant, cambio de contraseña, login y rechazo
    del token ya consumido. Cuentas ficticias eliminadas al terminar.
  - Chrome 1440/390/320 px: logos visibles y sin desbordes; inspección visual
    móvil aprobada. Enlaces de demostración, sin tokens reales en capturas.
  - Suite Node: 338/338; TypeScript final y ESLint dirigido: OK. No cambian
    rutas, componentes ni lógica de aplicación; build a cargo del CI publicado.
  - Production: GET confirma `ñ` U+00F1 en asunto, HTML exacto y callback Sari
    autorizado. Los demás ajustes de Auth/SMTP no cambian. Copia previa de los
    tres campos en `.ua/intermediate/recovery-fix-auth-before.json`, fuera de Git.
- Riesgos/pendientes: correos anteriores conservan su destino/asunto viejos;
  solicitar uno nuevo. La recepción real corregida y UAT siguen pendientes.
  Nuevas empresas requieren su condición y callback exactos en la plantilla,
  seguidos del publicador. Commit funcional: `cbb8821`; configuración productiva
  verificada antes de publicar. El CI certificará aplicación y SQL/RLS.

### 2026-10-16 - AUTH-BRAND-01 - Correo de recuperación con marca por empresa

- Seguimiento: AUTH-BRAND-02 corrige la allowlist productiva ausente y el asunto
  mal codificado que no detectaron las comprobaciones de esta primera entrega.
- Estado: plantilla aplicada y verificada en Supabase Production; validación
  técnica local aprobada. Presentación final en Gmail/Outlook y UAT del correo
  nuevo pendientes del próximo envío autorizado.
- Hallazgo: el correo de recuperación llegaba con asunto y contenido genéricos
  en inglés, sin marca de la empresa. La captura del usuario confirma recepción
  de la plantilla anterior; no acredita todavía el diseño nuevo.
- Archivos: `supabase/templates/recovery.html`, `supabase/config.toml`,
  `docs/password-recovery.md`, `HARDENING.md`.
- SQL modificado: ninguno; sin migraciones ni cambios de RLS.
- Cambios:
  - Asunto español, logo/nombre/color de Sari Express, botón de recuperación,
    enlace alternativo, advertencia de solicitud ajena y pie de plataforma.
  - Selección por callback exacto de `.RedirectTo`; respaldo Forwarders ERP
    para destinos no configurados. No depende de metadata editable del usuario.
  - Marca contrastada con `tenant_domains` y `company_settings`: Sari es el
    único tenant registrado actualmente. Para nuevas empresas/cambios de marca
    se debe agregar su condición exacta y volver a publicar la plantilla.
  - HTML por tablas, estilos inline y PNG HTTPS, reutilizando logos existentes.
    Se conserva `{{ .ConfirmationURL }}` y el remitente compartido ya verificado.
- Publicación: PATCH dirigido a `mailer_subjects_recovery` y
  `mailer_templates_recovery_content` en el proyecto `fwspgdzvlbtbgiupvrzo`.
  GET posterior: ambos coinciden exactamente con el repositorio y todos los
  demás campos de Auth permanecen iguales. Copia previa de esos dos campos
  guardada localmente; no se guardan tokens ni configuración SMTP en Git.
- Validaciones ejecutadas:
  - Auth/SMTP reales del stack aislado `sarierp_aud01`: dos cuentas ficticias,
    marca Sari y respaldo neutral, asunto español, metadata ajena ignorada,
    token consumido por un cliente nuevo, cambio de contraseña y login: OK.
    Cuentas eliminadas al terminar; sin correos a destinatarios de Production.
  - Chrome: Sari y respaldo a 1440/390/320 px, logos cargados y sin desborde;
    capturas y HTML de demostración sin tokens en `.ua/intermediate/branding-*`.
  - Logos públicos: HTTP 200 y Content-Type imagen desde ambos dominios.
  - `npx.cmd tsc --noEmit`: OK. Suite Node: 335/335. Sin cambios de lógica de
    aplicación, rutas o componentes; no se requiere otro build local.
- Riesgos/pendientes: imágenes sujetas a la preferencia del cliente de correo;
  el nombre de empresa también aparece como texto. La marca se versiona en la
  plantilla y no se sincroniza automáticamente al editar Configuración Empresa.
  Remitentes distintos por empresa requieren hook/proveedor y verificación de
  dominios. `git push`/Vercel no aplica la configuración de Auth; ya aplicada
  por separado en esta entrega. Commit funcional: `ceda10c`; plantilla productiva
  verificada contra el contenido de ese commit antes de publicar en Git.

### 2026-10-16 - AUTH-RECOVERY-01 - Recuperación interna y administrativa

- Estado: implementado y validado técnicamente; código publicado en `origin/main`.
  UAT real de correo/cambio/login pendiente; no se declara completo el flujo.
- Hallazgo: login interno y Administración no ofrecían recuperación. La del
  portal usaba PKCE en el navegador solicitante; reutilizarla desde Admin habría
  ligado el enlace al navegador equivocado. Un formulario con cualquier sesión
  existente también podía mostrar cambio de contraseña ante un enlace inválido.
- Archivos:
  - `src/app/login/page.tsx`, `src/proxy.ts`, `src/app/auth/callback/route.ts`.
  - `src/app/{forgot-password,reset-password}/page.tsx`.
  - `src/app/portal/{forgot-password,reset-password}/page.tsx`.
  - `src/components/auth/{ForgotPasswordPage,ResetPasswordPage}.tsx`.
  - `src/app/(protected)/admin/users/page.tsx`.
  - `src/app/api/auth/password-recovery/route.ts`.
  - `src/app/api/admin/users/password-recovery/route.ts`.
  - `src/lib/password-recovery.ts`, `src/lib/server/password-recovery.ts`.
  - `tests/password-recovery.test.mjs`, `docs/password-recovery.md`, `HARDENING.md`.
- SQL modificado: ninguno; sin cambios de roles, RLS, SMTP, plantillas o allowlist.
- Cambios:
  - Enlace en login interno y acción administrativa con confirmación; se
    reutilizan formularios compartidos con el portal, Sonner y ConfirmDialog.
  - API pública con respuesta discreta y consulta acotada al tenant. API Admin
    valida sesión/perfil/empresa antes de crear cliente privilegiado, identifica
    la cuenta por ID y verifica que el correo de Auth coincida con el perfil.
  - `readEmailEnvironment` bloquea Demo o ambiente no verificable. Auth conserva
    el SMTP y callback existentes y su límite de frecuencia; no se envían claves
    temporales ni enlaces de recuperación al administrador.
  - Sesión receptora aislada en memoria, validación de empresa, fragmento retirado
    del URL, confirmación de contraseña, soporte PKCE anterior y destinos exactos.
    Los enlaces ausentes/vencidos no habilitan el formulario por otra sesión.
  - Auditoría administrativa sin secretos. Si falla tras el envío, advertencia
    separada sin convertir la solicitud en un fallo que induzca a reenviar.
- Validaciones ejecutadas:
  - Suite final: 335/335; TypeScript, ESLint dirigido y build final 86 páginas: OK.
  - Supabase Auth/SMTP reales del stack aislado `sarierp_aud01`: cuenta ficticia,
    correo capturado en buzón local, token consumido desde cliente nuevo sin
    verificador, cambio de contraseña y login; la contraseña anterior rechazada.
    Cuenta ficticia eliminada en `finally`. Sin correo/personas/datos Production.
  - Pruebas dirigidas: aislamiento de tenant, Admin activo/aprobado, Demo, correo
    Auth/perfil, respuesta no enumerativa, error de auditoría, callback seguro,
    sesión separada del destinatario y validación de contraseña/enlace.
  - Chrome local compilado: enlace del login, solicitud/error/reintento, móvil
    320/390 y escritorio 1440 sin desbordes, enlace vencido seguido de uno nuevo,
    contraseñas distintas, cambio con sesión separada, confirmación de Admin y
    petición solo por ID: OK. APIs interceptadas; cero envíos remotos.
- Pendientes: smoke de publicación y aceptación con correo controlado, interno y
  Cliente según `docs/password-recovery.md`. No se certifica entrega real del SMTP
  productivo con mocks ni con el buzón aislado. Soporte de plataforma sin tenant
  conserva su acceso separado; esta recuperación es para usuarios de empresas.
- Commit funcional: `76209b7`, publicado en `origin/main`. Despliegue y CI
  iniciados; confirmación y smoke finales se verifican en la entrega. Evidencias
  locales `recovery-*` en `.ua/intermediate/`, excluidas de Git.

### 2026-10-16 - FLOW-VISITS-01 - Planificación e informes de visitas comerciales

- Estado: implementado y validado técnicamente; SQL aplicado en Production y
  código publicado en `origin/main`. UAT autenticada de negocio pendiente.
- Hallazgo: la agenda no distinguía visitas pendientes, realizadas y canceladas;
  los filtros históricos no delimitaban un período de planificación y no había
  reporte de visitas ni exportación.
- Archivos modificados:
  - `src/app/(protected)/ventas/page.tsx`.
  - `src/app/(protected)/reports/page.tsx`.
  - `src/lib/sales-visits.ts`, `src/lib/report-view.ts`.
  - `tests/sales-visits.test.mjs`, `tests/sales-activities-query.test.mjs`.
  - `scripts/validate-audit-sql.mjs`, `docs/ventas-visitas.md`, `HARDENING.md`.
- SQL: `supabase/migrations/20261016120000_sales_activity_execution_status.sql`;
  prueba `supabase/tests/sales_activity_execution_status.sql`.
- Cambios:
  - Estado explícito Pendiente/Realizada/Cancelada; las filas antiguas mantienen
    NULL («Sin clasificar»), sin inventar ejecución ni modificar datos históricos.
  - Reporte Visitas para Admin/Ventas con enlace desde la agenda, filtros de
    cliente/prospecto, vendedor, estado y búsqueda; CSV/PDF/impresión completos.
  - Períodos inclusivos: hoy, semana lunes-domingo, mes completo y fechas libres.
    El reporte abre en pendientes del mes completo; mide fecha programada y
    estado actual. Los demás reportes conservan sus períodos originales.
  - Lectura paginada con orden estable y bloqueo de exportación ante errores.
    Relaciones tenant explícitas para clientes y perfiles.
  - Enlace al detalle; Ventas consulta actividades ajenas en modo de lectura.
    El guardado comprueba que se devolvió una fila para no anunciar éxito ante
    una actualización rechazada por permisos. Validación de orden del horario.
  - Se reutiliza RLS vigente; no se amplían roles, empresas ni permisos.
- Validaciones ejecutadas:
  - Migración aplicada en stack aislado `sarierp_aud01`; diez suites SQL/RLS
    aprobadas, incluyendo defaults, NULL histórico, constraint, edición propia,
    Admin, lectura de equipo, otro tenant, inactivos, pendientes y otro rol.
  - Suite Node final: 325/325, incluido PDF real con 50 filas y paginación.
  - `npx.cmd tsc --noEmit`, ESLint dirigido y build final 82/82 páginas: OK.
  - Navegador local compilado, con datos simulados y sin escritura remota:
    filtros y períodos, CSV completo de 1302 pendientes, fallos/reintento y
    anchuras 1440/390/320 sin desborde de página. Edición propia Pendiente →
    Realizada, código CLI-001 y consulta ajena de solo lectura: OK.
  - Preflight Production de solo lectura: cero actividades, RLS habilitado y
    huella de políticas guardada. Dry-run del paquete limitado: exactamente
    `20261016120000_sales_activity_execution_status.sql`; Outlook excluida.
  - Migración aplicada en Production; postflight: columna nullable con default
    Pendiente, RLS habilitado y huellas de datos/políticas idénticas al preflight.
- Riesgos / pendientes: UAT real con Ventas y
  Admin. El estado es actual, no histórico al cierre; no se infiere estado de
  registros legacy. Clasificar visitas anteriores manualmente según su ejecución.
- Commit funcional: `1d76403f591348cbcdafd241337e9e8815fb3327`.
- Publicación: push a `origin/main`; Vercel inició el despliegue de Production
  `BstiJ4a5uuLqxXVa7mgmj6EoZnqY`. Estado final y smoke se verifican en la entrega;
  evidencias locales en `.ua/intermediate/visits-*` (excluidas de Git).

### 2026-10-16 - UX-VENTAS-01 - Código de cliente en actividades comerciales

- Estado: corrección implementada, validada y publicada junto a FLOW-VISITS-01.
  UAT autenticado pendiente; no se declara completo el flujo.
- Hallazgo: `/ventas` consultaba solo `id, nombre` para el selector de cuentas.
  `ClienteCombobox` muestra y busca `codigo_cliente`; al no recibirlo, todas las
  opciones mostraban «Sin codigo» aunque el cliente tuviera código guardado.
- Archivos modificados: `src/app/(protected)/ventas/page.tsx`, `HARDENING.md`.
- SQL modificado: ninguno.
- Cambio: incluir `codigo_cliente` en la consulta y en el tipo del estado local,
  reutilizando el selector existente y el código almacenado del cliente.
- Revisión de visitas (código y migraciones vigentes):
  - Ventas tiene acceso a `/ventas`; las políticas permiten a usuarios Ventas
    aprobados/activos crear actividades de su tenant, consultar las del equipo
    y modificar las propias. Admin puede modificar las del equipo.
  - Se pueden registrar visitas a clientes/prospectos con fecha futura, horas,
    comentarios, resultado y próxima acción; hay lista y calendario mensual.
  - No hay reporte de visitas ni exportación de actividades en `/reports`.
    `sales_activities` tampoco distingue pendiente, realizada o cancelada.
  - «Últimos 7 días» y «Últimos 30 días» solo aplican límite inferior; incluyen
    fechas futuras y no representan una semana/mes delimitados de planificación.
    El calendario sí limita la consulta al mes seleccionado.
- Validaciones ejecutadas: inspección de la consulta, del selector compartido,
  de agenda/calendario, de `/reports`, permisos y políticas versionadas.
  `npx.cmd tsc --noEmit`: OK. ESLint dirigido a `/ventas`: OK, sin errores ni
  advertencias. `npm.cmd test`: 320/320 pruebas correctas. `npm.cmd run build`:
  OK, 82/82 páginas, incluida `/ventas`. `git diff --check`: OK (aviso LF/CRLF).
- Riesgos / trabajo pendiente: verificar con sesión Ventas que el
  código aparece al abrir/editar, que la búsqueda por código funciona y que se
  guarda la cuenta correcta. Probar RLS con Ventas/Admin y otro tenant; no se
  certifican políticas desplegadas con inspección local. Un cliente cuyo código
  esté vacío en la base seguirá mostrando el fallback. El informe diario,
  semanal/mensual de visitas por ejecutar requiere desarrollo adicional.
- Commit funcional: `1d76403f591348cbcdafd241337e9e8815fb3327`; publicación conjunta
  con el reporte de visitas FLOW-VISITS-01.

### 2026-10-02 - MAIL-035 - Solicitudes de Outlook aisladas para Sari

- Estado: en espera por decisión del usuario (02/10/2026), sin acceso
  administrativo a Microsoft 365. Código desplegado en Production, inactivo;
  pendiente SQL/RLS, credenciales, scheduler y UAT. No está activa.
- Stand by: bloqueo explícito `OUTLOOK_INTAKE_STANDBY = true`; ambos endpoints
  responden 503 antes de consultar sesión, base o Microsoft. Menú oculto y ruta
  directa con mensaje «En espera», sin consultas a tablas no provisionadas.
  Migración conservada para el futuro, sin aplicarla durante este despliegue.
- Hallazgo: se requiere registrar solicitudes recibidas por Pricing y comunicar
  una referencia persistida sin calcular correlativos fuera del ERP ni permitir
  que la automatización alcance otros tenants.
- Archivos y SQL modificados:
  - `src/lib/mail-intake.ts`, `src/lib/server/outlook-intake.ts`.
  - `src/app/api/integrations/outlook/{check,run}/route.ts`.
  - `src/app/(protected)/settings/mail-intake/page.tsx`.
  - `src/components/layout/sidebar.tsx`.
  - `supabase/migrations/20261002120000_sari_outlook_intake.sql`.
  - `supabase/tests/sari_outlook_intake.sql`, `tests/mail-intake.test.mjs`.
  - `docs/outlook-intake-runbook.md`, `HARDENING.md`.
- Cambio: configuración provisionada únicamente para el dominio activo
  `sari.forwarders.app`, buzón `Pricing@sarihn.com`, desactivada por defecto.
  Selección de vendedor y prioridad opcional del vendedor del cliente; busca
  Admin pruebas sin inventar un perfil. RPC transaccional registra mensaje y
  Borrador usando el trigger de numeración por empresa. RLS solo para Admin
  aprobado/activo; runtime y RPC restringidos al servicio. Demo bloqueado con
  helper compatible con su rama, sin depender de tablas exclusivas de Demo.
  Delta de Inbox y lease evitan replay/concurrencia. Acuse en el hilo original;
  errores ambiguos quedan para conciliación y no se reenvían automáticamente.
- Validaciones ejecutadas:
  - Pruebas dirigidas: incluye bloqueo de ambos endpoints en stand by, timeout posterior al envío y replay sin
    reenvío, rechazo de llamadas no autorizadas, seguimiento, automáticos y
    validación del destino del cursor.
  - `npm.cmd test`: 160/160 pruebas correctas, incluida la regresión de stand by.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los archivos TypeScript y prueba modificados: OK.
  - `npm.cmd run build`: OK, 79/79 páginas.
  - `git diff --check`: OK; aviso esperado de LF/CRLF en sidebar.
  - Docker local no disponible (daemon ausente); SQL y RLS **no ejecutados**.
  - UI revisada en código; falta comprobación visual autenticada.
- Riesgos / trabajo pendiente:
  - Aplicar y probar migración en base aislada; ejecutar pruebas SQL y validar
    RLS/Admin/Ventas/otro tenant. No se certifica numeración desplegada ni flujo
    end-to-end por resultados de mocks o build.
  - Autorizar Mail.Read y Mail.Send mediante Exchange RBAC limitado al buzón;
    revisar concesiones globales aditivas. Configurar secretos y scheduler POST.
  - La primera versión usa reglas conservadoras, no IA ni DOTS; ambigüedades y
    seguimientos requieren revisión manual desde Outlook. No procesa adjuntos ni
    carpetas fuera de Inbox, ni extrae los datos de carga.
  - Un `202` es aceptación de Microsoft, no prueba de entrega. Conciliar estados
    inciertos y cursor expirado manualmente. Completar UAT con destinatario
    controlado y verificar notas internas fuera del PDF antes de activar.
  - Capacidad: una página de delta y hasta dos acuses por ejecución; vigilar
    backlog y ajustar programación al volumen.
- Postflight Production:
  - Commit funcional `9c7724d` publicado en `main` y
    `feat/multi-tenant-domains`.
  - Vercel `dpl_A8TwfSCGLyd394EAAuoMMoKfHpwM`: target `production`, `Ready`;
    dominio `sari.forwarders.app` incluido entre los aliases.
  - GitHub deployment Production `6814754290` corresponde al mismo SHA.
  - Smoke de producción: `/login` HTTP 200; ambos POST a
    `/api/integrations/outlook/{run,check}` devuelven HTTP 503 con
    «Integración de Outlook en espera», sin conectar sesión/base/Microsoft.
  - No se aplicó SQL, no se configuraron credenciales ni scheduler y no se
    leyeron ni enviaron correos. Activación, SQL/RLS y UAT siguen pendientes.
- Commit funcional: `9c7724d` (`feat: prepare Sari Outlook intake in standby`).

### 2026-09-28 - FLOW-034 - Shipping Instruction conserva contexto tras guardar

- Estado: corrección implementada, validada y desplegada en Production; UAT
  autenticado pendiente.
- Hallazgo:
  - Los RPC de guardado y transición devolvían correctamente la fila actualizada
    de `shipping_instructions`, pero esa fila física no incluye las relaciones
    embebidas `quotation` y `cliente` que carga el detalle.
  - La pantalla reemplazaba todo su estado con la respuesta del RPC. Después de
    `Guardar SI`, el contexto comercial se mostraba como `N/A` hasta ejecutar
    `Actualizar desde Pricing`, acción que incidentalmente volvía a consultar
    las relaciones.
- Archivos y SQL modificados:
  - `src/lib/shipping-instruction-state.ts`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`.
  - `tests/shipping-instruction-state.test.mjs`.
  - `HARDENING.md`.
  - SQL: ninguno; los datos sí se persistían correctamente.
- Cambio:
  - Las respuestas de mutaciones ahora se reconcilian con el estado actual y
    conservan `quotation` y `cliente`, mientras los campos escalares devueltos
    por el servidor siguen siendo la fuente autoritativa.
  - La misma regla se aplica a guardado de Operaciones y Ventas, validación,
    aceptación, asignación, finalización y cancelación para evitar la misma
    regresión en cualquier transición de la SI.
- Validaciones ejecutadas:
  - Regresión dirigida del estado de SI: 2/2 pruebas correctas; cubre la
    conservación de relaciones embebidas y el caso sin contexto previo.
  - `npm.cmd test`: 154/154 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido al helper, la prueba y el detalle de SI: OK.
  - `npm.cmd run build`: OK, 76/76 páginas.
  - `git diff --check`: OK; únicamente el aviso esperado de LF/CRLF.
- Riesgos / trabajo pendiente:
  - Falta UAT autenticado: ganar una cotización, completar proveedor, guardar la
    SI y confirmar que cotización, cliente, origen, destino y notas permanecen
    visibles sin usar `Actualizar desde Pricing`.
  - La sincronización manual desde Pricing se conserva para repricing real; ya no
    es necesaria como recuperación visual después del guardado.
- Postflight Production:
  - Commit funcional `5b3694b` publicado en `main` y en
    `feat/multi-tenant-domains`.
  - GitHub Production `6720835910` y Vercel
    `dpl_BuKZjt751xMpZhDb4Ah8CQ8W1rux` reportan
    `success / Deployment has completed` y `Ready`.
  - URL inmutable:
    `https://sarierp-fdvlamsoi-claudherhn-5641s-projects.vercel.app`.
  - Smoke público de solo lectura: `https://sari.forwarders.app/login` responde
    `200`; `/operations/shipping-instructions` responde `307` al login y conserva
    la ruta de retorno.
- Commit: `5b3694b` (`fix: preserve shipping instruction context after save`).

### 2026-09-28 - INS-028 - Cargo mínimo de seguro de USD 75.00

- Estado: corrección implementada, validada localmente y desplegada en
  Production; queda pendiente el UAT autenticado del flujo de Pricing.
- Hallazgo:
  - El cálculo porcentual del seguro podía guardar un costo o una venta inferior
    al cargo mínimo de USD 75.00.
  - La aplicación real en Pricing y las calculadoras de apoyo tenían caminos de
    cálculo separados, con riesgo de mostrar importes distintos.
- Archivos y SQL modificados:
  - `src/lib/insurance-calculator.ts`.
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/components/quotations/InsuranceCalculationDialog.tsx`.
  - `src/components/quotations/ReferenceInsuranceCalculatorDialog.tsx`.
  - `tests/insurance-calculator.test.mjs`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - Centraliza un cargo mínimo de USD 75.00 y lo aplica de forma independiente
    al costo de aseguradora y a la venta al cliente cuando la prima porcentual
    positiva resulta menor o igual a ese valor.
  - Una prima sin base o con tasa cero permanece en USD 0.00; los cálculos
    superiores a USD 75.00 conservan su importe original.
  - Pricing guarda el importe final con el mínimo antes de calcular el ISV y
    registra en las notas tanto la prima porcentual como el mínimo aplicado.
  - Los desgloses y la calculadora referencial muestran cuándo el resultado fue
    elevado al mínimo, evitando presentar USD 75.00 como si fuera únicamente el
    producto de la base por la tasa.
- Validaciones ejecutadas:
  - Regresión dirigida del mínimo: 3/3 pruebas correctas; cubre prima menor,
    igual y mayor a USD 75.00, además del cálculo vacío en cero.
  - `npm.cmd test`: 152/152 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 76/76 páginas.
  - ESLint dirigido al helper y la prueba nueva: OK.
- Riesgos / trabajo pendiente:
  - No se recalculan líneas históricas automáticamente; el nuevo mínimo se
    guarda cuando Pricing aplica o reaplica el seguro de carga.
  - Falta UAT autenticado con una cotización cuya prima sea menor, igual y mayor
    al mínimo, verificando línea comercial, ISV, PDF y margen.
  - Los componentes históricos de cálculo conservan cuatro errores de lint
    preexistentes (`any` y actualizaciones de estado dentro de efectos), fuera
    del alcance de esta regla; TypeScript, pruebas y build sí concluyen bien.
- Postflight Production:
  - Commit funcional `b572efe` (`fix: enforce insurance minimum charge`)
    publicado en `main` y en `feat/multi-tenant-domains`.
  - GitHub deployment `6717065917` y Vercel Production
    `9kWD1ATsTASPuZxPk8W4BjA5ka9K`: `success`.
  - URL generada por Vercel:
    `https://sarierp-gzz81m24c-claudherhn-5641s-projects.vercel.app`.
    Responde el `404 Empresa no encontrada` de la aplicación porque el hostname
    técnico no pertenece a un tenant registrado; el deployment sí terminó con
    éxito y el dominio canónico quedó actualizado.
  - `https://sari.forwarders.app/pricing-comparison`: `307` hacia
    `/login?next=%2Fpricing-comparison` sin una sesión activa.
  - `https://sari.forwarders.app/login`: `200` con branding de Sari Express.
- Commit: `b572efe` (`fix: enforce insurance minimum charge`).

### 2026-09-25 - PRICING-UX-01 - Desglose de seguro legible y sin superposición

- Estado: corrección implementada, validada y desplegada en Production; queda
  pendiente únicamente la comprobación visual autenticada con una cotización
  real.
- Hallazgo:
  - La ayuda de la línea `Seguro de Carga` se mostraba como un tooltip absoluto
    dentro de la tabla con desplazamiento horizontal. Podía recortarse o
    superponerse a otros elementos y no ofrecía una interacción adecuada en
    pantallas táctiles.
  - El cálculo completo se presentaba como un único párrafo multilínea, lo que
    dificultaba distinguir la base, los servicios cubiertos, los porcentajes y
    el impuesto.
- Archivos y SQL modificados:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/components/pricing/InsuranceCalculationDetails.tsx`.
  - `tests/insurance-calculation-details.test.mjs`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - Se sustituyó el signo de interrogación con tooltip flotante por un control
    explícito `Ver desglose del cálculo`, utilizable con mouse, teclado y tacto.
  - El desglose se expande dentro del flujo de la misma fila, por lo que aumenta
    su altura sin invadir las opciones comerciales ni quedar oculto por el
    contenedor de la tabla.
  - Cada línea histórica del cálculo se presenta como un paso numerado, separa
    visualmente el concepto del valor y conserva intactos los datos y fórmulas
    almacenados en `pricing_items.notes`.
  - La columna de descripción recibe un ancho mínimo para que las fórmulas y las
    listas de servicios puedan ajustarse de forma legible.
- Validaciones ejecutadas:
  - Prueba dirigida del desglose: 2/2 correcta.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido al componente y su prueba: OK.
  - `npm.cmd test`: 149/149 pruebas correctas.
  - `npm.cmd run build`: OK, 76/76 páginas.
- Riesgos / trabajo pendiente:
  - No se modificó el cálculo, la cobertura, los porcentajes, los importes ni el
    guardado del seguro.
  - El archivo histórico de Pricing conserva 33 errores y 5 advertencias de
    lint preexistentes fuera de este cambio; TypeScript, la suite y el build sí
    concluyen correctamente.
  - Falta comprobación visual autenticada con una cotización real.
- Postflight Production:
  - Vercel Production: `Ready`.
  - URL inmutable:
    `https://sarierp-nbfnsrgh9-claudherhn-5641s-projects.vercel.app`.
  - `https://sari.forwarders.app/pricing-comparison`: `307` hacia
    `/login?next=%2Fpricing-comparison` sin una sesión activa.
  - `https://sari.forwarders.app/login`: `200` con branding de Sari.
- Commit: `9b6d460` (`fix: clarify insurance pricing breakdown`).

### 2026-09-25 - SAAS-P8-12 - Entrada del tenant dirigida a su acceso empresarial

- Estado: corrección desplegada y validada local y públicamente; UAT autenticado
  no requerido porque no cambió sesión ni autorización.
- Hallazgo:
  - La raíz `/` estaba clasificada como ruta canónica de plataforma. Como
    consecuencia, `sari.forwarders.app/` respondía con un `308` hacia el landing
    global de `forwarders.app` en vez de abrir el acceso de Sari.
- Archivos y SQL modificados:
  - `src/proxy.ts`.
  - `src/lib/tenant-host.ts`.
  - `tests/tenant-host.test.mjs`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - La raíz de un dominio tenant validado redirige en el mismo origen a `/login`
    y elimina parámetros de campaña que no pertenecen al formulario de acceso.
  - La raíz de `forwarders.app` conserva el landing público.
  - `/politicas` y los documentos globales siguen canonizándose hacia
    `forwarders.app`; las páginas operativas y condiciones logísticas permanecen
    en el dominio tenant.
  - La regla también replica el comportamiento en aliases locales de tenant sin
    convertir la raíz global de plataforma en una ruta de login.
- Validaciones ejecutadas:
  - Prueba dirigida de resolución y redirección de tenant: 8/8 correcta.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 3 archivos TypeScript/JavaScript afectados: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 76/76 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
- Riesgos / trabajo pendiente:
  - Postflight Production:
    - `sari.forwarders.app/`: `308`, `Location: /login`.
    - Seguimiento del redirect: `200` y branding visible de Sari Express.
    - `forwarders.app/`: `200` y conserva el landing de plataforma.
    - `sari.forwarders.app/politicas`: `308` hacia la política global.
    - `sari.forwarders.app/terminos-logisticos`: `200`.
  - Monitorear enlaces externos que hubieran asumido el redirect histórico al
    landing; ahora deben enlazar `forwarders.app` cuando busquen la plataforma.
  - No se modificaron RLS, sesión, perfiles ni SQL.
- Despliegue: Vercel Production `success`; URL inmutable
  `https://sarierp-fhgvpi3s0-claudherhn-5641s-projects.vercel.app`.
- Commit: `7d139ce` (`fix: route tenant root to company login`).

### 2026-09-24 - MKT-LANDING-V2-PLAN-01 - Cierre de las siete fases de Landing V2

- Estado: las siete fases propuestas quedaron implementadas, validadas y
  publicadas en Production; sin escritura de leads reales.
- Hallazgo:
  - Los incrementos anteriores cubrieron hero, evidencia, un workflow resumido,
    product tour, formulario y SEO, pero no materializaron todos los componentes
    ni el recorrido de ocho etapas definidos en el plan aprobado.
  - Faltaban la historia de margen, el cambio de perspectiva por equipo, la
    comparación controlada del portal, las cinco etapas de implementación y la
    composición final en componentes independientes.
- Archivos y SQL modificados:
  - `src/app/page.tsx`.
  - `src/components/marketing/ConnectedOperationHero.tsx`.
  - `src/components/marketing/ConnectedWorkflow.tsx` (retirado).
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/ProductShowcase.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `src/components/marketing/OperationJourney.tsx`.
  - `src/components/marketing/JourneyStagePanel.tsx`.
  - `src/components/marketing/ProductFrame.tsx`.
  - `src/components/marketing/MarginStory.tsx`.
  - `src/components/marketing/TeamRoleSwitcher.tsx`.
  - `src/components/marketing/ClientPortalSection.tsx`.
  - `src/components/marketing/ImplementationPath.tsx`.
  - `src/components/marketing/MarketingFaq.tsx`.
  - `src/components/marketing/DemoConversionPanel.tsx`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - La portada conserva los fundamentos visuales y el hero de la fase 1, con CTA
    móvil de ancho completo y un ajuste específico de composición para `1024px`.
  - El storytelling de la fase 2 recorre las ocho etapas exactas desde Cotización
    hasta Factura y rentabilidad; cada etapa presenta decisión, responsable,
    información conectada y resultado, y enlaza capturas Demo existentes.
  - La fase 3 incorpora la historia de margen con valores visibles en el Demo,
    las perspectivas de Ventas/Pricing, Operaciones/Documentación y
    Finanzas/Dirección, y una comparación conceptual de información interna
    frente a la permitida al cliente.
  - La fase 4 incorpora Diagnóstico, Configuración, Evaluación de datos,
    Capacitación y Puesta en marcha, reutiliza el FAQ visible y conserva el panel
    de conversión y su formulario sin promesas no verificadas.
  - La fase 5 declara una entidad `Organization` reutilizada por `WebSite` y
    `SoftwareApplication`. El sitemap conserva únicamente `/` y `/politicas`: la
    condición del plan de incluir sólo URLs públicas reales prevalece porque
    `/terminos-logisticos` pertenece al tenant Sari y responde `404` en el dominio
    de plataforma; no se mezclaron condiciones logísticas del tenant.
  - Las fases 6 y 7 cierran targets táctiles mínimos, lazy loading fuera del hero,
    navegación por teclado, retorno de foco, movimiento reducido, responsive,
    presupuesto de JavaScript y validación integral.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit`: OK.
  - `npx.cmd eslint src/components/marketing src/app/page.tsx src/app/sitemap.ts src/app/robots.ts`: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 76/76 páginas.
  - Navegador real mediante Chrome DevTools: `320x844`, `390x844`, `768x1024`,
    `1024x768` y `1440x1000`; sin overflow horizontal y con revisión visual de
    los cinco tamaños.
  - Navegación interna, menú móvil con Escape y restitución de foco, tabs con
    teclado, diálogo, zoom, restitución de foco, FAQ y movimiento reducido: OK.
  - Formulario con solicitudes interceptadas: vacío, correo inválido, fallo,
    reintento, doble submit y éxito simulado: OK; una sola solicitud por intento
    y cero leads reales.
  - JavaScript deshabilitado: H1, CTA e imagen principal presentes; consola sin
    excepciones en la auditoría con JavaScript.
  - Rendimiento local, mediana de tres corridas: LCP `0.956 s`, CLS `0`; imagen
    hero precargada y capturas del producto con lazy loading.
  - JavaScript inicial: `247.4 KiB` comprimidos (`861.2 KiB` sin comprimir), por
    debajo del presupuesto aproximado de `265 KiB` comprimidos.
  - Vercel Production `dpl_6XudiUqDQ96RWymNezfvyc63JHPD`: estado `READY`;
    URL inmutable
    `https://sarierp-hchrszcpe-claudherhn-5641s-projects.vercel.app` y alias
    `https://forwarders.app` confirmado.
  - Smoke público posterior, únicamente con solicitudes GET: `/`, `/robots.txt`,
    `/sitemap.xml`, `/opengraph-image` y `/login` respondieron `200` con tipos de
    contenido esperados. El HTML contiene el hero, la etapa Factura y
    rentabilidad, `Organization`, `SoftwareApplication` y `FAQPage`; el sitemap
    publica `/` y `/politicas` y excluye las condiciones logísticas del tenant.
- Riesgos / trabajo pendiente:
  - Monitorear Core Web Vitals de campo; las cifras locales no sustituyen datos
    reales de usuarios y dispositivos.
  - Probar la escritura real de un lead únicamente en un ambiente autorizado y
    confirmar Supabase/RLS de extremo a extremo.
  - UAT comercial pendiente con usuarios designados. No se modificaron SQL, RLS,
    autenticación ni módulos operativos.
  - Commit de implementación y despliegue: `cd91b57`.

### 2026-09-24 - MKT-LANDING-V2-C-01 - Conversión, formulario y SEO técnico

- Estado: Incremento C implementado y validado localmente; sin despliegue ni
  escritura de leads reales.
- Hallazgo:
  - La landing sólo declaraba URL canónica; no tenía título y descripción propios,
    Open Graph, Twitter Card, datos estructurados, sitemap ni reglas explícitas
    para impedir el rastreo de rutas internas del ERP.
  - El formulario era corto, pero agrupaba errores obligatorios, no enfocaba el
    primer campo inválido y el cierre prometía contacto «pronto» sin una condición
    comercial verificada.
- Archivos y SQL modificados:
  - `src/app/page.tsx`.
  - `src/app/opengraph-image.tsx`.
  - `src/app/robots.ts`.
  - `src/app/sitemap.ts`.
  - `src/proxy.ts`.
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/LandingContact.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `HARDENING.md`.
  - SQL: ninguno; se conserva la tabla `leads` y su RLS vigente.
- Cambio:
  - La portada publica título, descripción, keywords, canonical, Open Graph,
    Twitter Card y directivas de indexación específicas de Forwarders.app.
  - Se añadieron JSON-LD de `WebSite`, `SoftwareApplication` y `FAQPage`; las seis
    respuestas estructuradas reutilizan exactamente el contenido visible.
  - `robots.txt` permite la landing y políticas, excluye autenticación, portal y
    módulos internos; `sitemap.xml` publica sólo la portada y políticas.
  - La imagen social de `1200x630` se genera con `ImageResponse` y comunica el
    posicionamiento y el recorrido cotización-pricing-operación-rentabilidad.
  - Las rutas de metadata se habilitaron explícitamente en el proxy de plataforma.
  - La sección final explica qué se revisa en una demo. El formulario conserva
    cuatro datos, muestra errores por campo, enfoca el primero inválido, mantiene
    el bloqueo de doble envío y ofrece estados recuperables sin prometer plazos.
- Validaciones ejecutadas:
  - `/`, `/robots.txt`, `/sitemap.xml` y `/opengraph-image`: `200` local; tipos de
    contenido HTML, texto, XML y PNG correctos.
  - HTML renderizado: title, description, canonical y Open Graph correctos; JSON-LD
    válido con `WebSite`, `SoftwareApplication`, `FAQPage` y 6 preguntas.
  - Imagen Open Graph revisada visualmente: OK.
  - Navegador con solicitudes de Supabase interceptadas: campos vacíos muestran
    tres errores y enfocan `demo-nombre`; fallo de red permite reintentar; éxito
    sustituye el formulario; doble clic genera una sola solicitud.
  - Cero leads reales. El único error de consola fue el fallo de red simulado.
  - Emulación móvil `390x844`: `scrollWidth = clientWidth = 390`; formulario sin
    desbordamiento horizontal.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 8 archivos TypeScript/TSX de este incremento: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 76/76 páginas.
- Riesgos / trabajo pendiente:
  - Verificar después del despliegue los cuatro endpoints públicos, previews de
    redes y rastreo real; enviar el sitemap desde la herramienta de buscadores que
    se decida utilizar.
  - La recepción de un lead debe probarse sólo en un ambiente autorizado. Esta
    revisión no certifica Supabase/RLS de extremo a extremo.
  - No se añadió analítica: falta seleccionar un proveedor y definir medición sin
    datos personales antes de atribuir mejoras de conversión.
  - No se modificaron autenticación, permisos, SQL ni módulos operativos.

### 2026-09-24 - MKT-LANDING-V2-B-01 - Storytelling operativo y product tour

- Estado: Incremento B implementado y validado localmente; sin despliegue.
- Hallazgo:
  - La landing mostraba seis pantallas reales, pero como una galería de módulos
    separada del recorrido de un embarque.
  - El workflow resumido no explicaba los handoffs entre Ventas, Pricing,
    Operaciones, Documentación y Finanzas ni su relación con el producto visible.
- Archivos y SQL modificados:
  - `src/components/marketing/ConnectedWorkflow.tsx`.
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/ProductShowcase.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `src/components/marketing/landing.module.css`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - Se sustituyó el workflow genérico por un ciclo de siete momentos alineado con
    el producto: cotización, pricing, opción aceptada, shipment/SI, booking/BL,
    costos/facturación y resultado.
  - Tres bloques explican los handoffs de decisión, ejecución y cierre sin afirmar
    automatizaciones ni resultados que el sistema no pueda demostrar.
  - El recorrido por capturas ahora funciona como product tour: navegación lateral
    en escritorio, carril táctil en móvil, etapa visible, captura ampliable y CTA
    contextual. Conserva las seis imágenes del ambiente Demo ya aprobadas.
  - La sección por equipos comunica qué recibe y qué entrega cada área, y mantiene
    el portal del cliente separado de las herramientas internas.
  - El nuevo storytelling está renderizado en servidor; sólo las pestañas y el
    diálogo de ampliación permanecen como componente cliente.
- Validaciones ejecutadas:
  - Revisión visual local completa a `1440px`: OK.
  - Emulación móvil real a `390x844`: `scrollWidth = clientWidth = 390`; sin
    desbordamiento horizontal del documento.
  - Navegación del product tour por teclado: la segunda pestaña activa la vista de
    cotización y su contenido correspondiente; sin excepciones del navegador.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 4 archivos TypeScript/TSX de este incremento: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
- Riesgos / trabajo pendiente:
  - En móvil, el ciclo de siete etapas y las seis pestañas usan desplazamiento
    horizontal intencional; el contenido esencial también aparece fuera de esos
    carriles para no depender del gesto.
  - El Incremento C debe cerrar conversión, formulario, metadata y SEO; no forman
    parte de esta entrega.
  - No se modificaron autenticación, leads, SQL, RLS ni módulos operativos.

### 2026-09-24 - MKT-LANDING-V2-A-01 - Landing V2: identidad y primer viewport

- Estado: Incremento A implementado y validado localmente; sin despliegue.
- Hallazgo:
  - La portada pública no expresaba con suficiente claridad que Forwarders.app
    conecta cotización, pricing, operación y rentabilidad para freight forwarders.
  - El primer viewport dependía de mensajes generales y no mostraba evidencia
    inmediata del producto ni el problema de fragmentación que resuelve.
- Archivos y SQL modificados:
  - `src/components/marketing/ConnectedOperationHero.tsx`.
  - `src/components/marketing/FragmentationProblem.tsx`.
  - `src/components/marketing/ProductEvidence.tsx`.
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/LandingHeader.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `src/components/marketing/landing.module.css`.
  - `src/lib/platform-branding.ts`.
  - `HARDENING.md`.
  - SQL: ninguno.
- Cambio:
  - Se introdujo la identidad pública `Forwarders.app` sin cambiar el nombre
    operativo `Forwarders ERP` usado por el producto y los tenants.
  - El hero ahora comunica una operación conectada de cotización a rentabilidad,
    incorpora una captura real del producto y ofrece rutas claras hacia demo y
    exploración del flujo.
  - Se agregó evidencia verificable del alcance actual del producto y una sección
    visual sobre la fragmentación entre Excel, correo, WhatsApp y carpetas.
  - Se mantuvo la landing como composición de servidor salvo las interacciones ya
    existentes, sin dependencias nuevas ni afirmaciones comerciales inventadas.
- Validaciones ejecutadas:
  - Revisión visual local en escritorio y emulación móvil de `390x844`: OK.
  - Ancho móvil: `scrollWidth = clientWidth = 390`; sin desbordamiento horizontal.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 7 archivos TypeScript/TSX modificados: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
- Riesgos / trabajo pendiente:
  - Los incrementos B y C aún deben reorganizar la narrativa completa del
    producto, reforzar la conversión/formulario y completar metadata/SEO.
  - No se modificaron autenticación, leads, SQL, RLS ni módulos operativos.
  - Validar contenido comercial final y analítica antes de desplegar la V2.

### 2026-09-24 - POL-RELEASE-02 - Políticas multiempresa y proveedores de respaldo

- Estado: migración y frontend desplegados; validación local y postflight público
  aprobados. UAT autenticado con alta real pendiente.
- Hallazgo:
  - La edición vigente de la política global aún remitía expresamente al portal y
    a las condiciones de Sari Express, aunque ahora la plataforma admite dominios
    de múltiples empresas.
  - La descripción del rol Administrador podía interpretarse como acceso global y
    el inventario de proveedores no incluía la automatización y almacenamiento de
    los respaldos cifrados.
  - Las versiones anteriores no debían editarse porque sus bytes y hashes forman
    parte de la evidencia de aceptación ya registrada.
- Archivos y SQL modificados:
  - `public/legal/platform-2026-09-24.json`.
  - `public/legal/logistics-2026-09-24.json`.
  - `src/app/politicas/page.tsx`.
  - `src/components/legal/LogisticsTerms.tsx`.
  - `src/lib/legal-documents.ts`.
  - `src/lib/tenant-host.ts`.
  - `supabase/migrations/20260924100000_legal_documents_2026_09_24.sql`.
  - `supabase/tests/legal_documents_2026_09_24.sql`.
  - `tests/legal-documents.test.mjs`.
  - `tests/tenant-host.test.mjs`.
  - `docs/privacy-terms-review-2026-09-24.md`.
  - `docs/privacy-operations-runbook.md`.
  - `HARDENING.md`.
- Cambio:
  - Las condiciones globales ya son neutrales respecto de Sari y remiten las
    condiciones particulares al dominio, cotización o contrato de cada empresa.
  - El acceso administrativo se limita textualmente a la organización y permisos
    asignados; no concede ni describe acceso entre tenants.
  - Se documentan Supabase, Vercel, Resend cuando está habilitado, GitHub Actions
    y Backblaze B2, indicando cifrado previo de las copias externas sin prometer
    región, retención, disponibilidad o restauración no contratadas.
  - Las condiciones logísticas permanecen identificadas como documento exclusivo
    de Sari en `sari.forwarders.app` y no deben reutilizarse para otro tenant.
  - Se publica la edición `2026-09-24` mediante archivos y hashes nuevos; las
    ediciones anteriores continúan intactas y archivadas para trazabilidad.
- Validaciones ejecutadas:
  - Pruebas dirigidas de documentos y dominios: 12/12 correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 6 archivos TypeScript/JavaScript modificados: OK.
  - `npm.cmd test`: 147/147 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
  - `supabase/tests/legal_documents_2026_09_24.sql`: OK en Supabase local;
    verificó catálogo/hashes, aceptación ERP y portal con tenant, rechazo de una
    versión desconocida y finalizó con `ROLLBACK`.
  - La migración nueva se probó de forma aislada porque la copia Docker tenía una
    inconsistencia histórica al reaplicar `20260923141500`; no se modificó esa
    migración ya publicada ni se usaron datos de producción.
  - Dry-run de Supabase Production: solo
    `20260924100000_legal_documents_2026_09_24.sql` pendiente.
  - Migración aplicada en Production y confirmada en el historial remoto.
  - Postflight público:
    - `forwarders.app/politicas`: `200`, versión `2026-09-24` y sin referencia a
      Sari Express.
    - `sari.forwarders.app/politicas`: `308` a la URL canónica de plataforma.
    - `sari.forwarders.app/terminos-logisticos`: `200`, versión `2026-09-24`.
    - Las condiciones y JSON logísticos responden `404` en el dominio raíz; el
      JSON de plataforma se canoniza desde Sari hacia `forwarders.app`.
    - Los registros ERP y portal muestran la versión `2026-09-24`.
- Riesgos / trabajo pendiente:
  - Esta entrega no fuerza una nueva aceptación a cuentas existentes. Evaluar con
    asesoría legal si el cambio debe comunicarse o aceptarse expresamente y, de
    requerirse, diseñar ese flujo sin inventar aceptaciones retrospectivas.
  - Ejecutar UAT autorizado con alta real ERP y portal y comprobar la evidencia
    de versión/tenant. El postflight no creó usuarios ni envió correos reales.
  - Completar la identidad legal del titular, contratos, acuerdo de tratamiento,
    retención y SLA. La revisión técnica no sustituye asesoría jurídica.
- Commit: `31eb411` (`feat: publish multi-tenant legal policies`).

### 2026-09-23 - SAAS-P8-11 - Separación del dominio público y documentos legales

- Estado: corrección implementada y validada localmente; despliegue y UAT
  público pendientes.
- Hallazgo:
  - El landing y las políticas globales de Forwarders ERP se podían abrir bajo
    `sari.forwarders.app`, mezclando identidad de plataforma con la empresa.
  - `forwarders.app` también exponía las condiciones logísticas específicas de
    Sari Express y sus snapshots JSON.
  - Las páginas legales ofrecían los JSON versionados como descargas para el
    usuario, aunque esos archivos existen como evidencia técnica del contenido
    aceptado y de su hash.
- Archivos modificados:
  - `src/proxy.ts`.
  - `src/lib/tenant-host.ts`.
  - `src/lib/platform-branding.ts`.
  - `src/app/page.tsx`.
  - `src/app/politicas/page.tsx`.
  - `src/components/legal/LogisticsTerms.tsx`.
  - `src/components/legal/TermsAcknowledgement.tsx`.
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/LandingContact.tsx`.
  - `tests/tenant-host.test.mjs`.
  - `tests/legal-documents.test.mjs`.
- Cambio:
  - El landing, `/politicas` y los snapshots legales de plataforma se
    canonizan hacia `https://forwarders.app` cuando se solicitan desde un
    dominio tenant; las rutas locales de desarrollo no se redirigen.
  - Las condiciones logísticas y sus snapshots dejan de estar disponibles en
    el dominio raíz y permanecen dentro del dominio tenant de Sari.
  - Los enlaces hacia las políticas del software usan el dominio absoluto de
    plataforma, incluido el registro y el portal.
  - Se retiraron de la interfaz los enlaces a snapshots JSON y el enlace a las
    condiciones de Sari desde las políticas globales. Los archivos no se
    modifican ni eliminan para conservar los hashes legales registrados.
  - Landing y políticas declaran su URL canónica de plataforma.
  - No se modifica SQL, RLS ni información de usuarios.
- Validaciones ejecutadas:
  - Pruebas dirigidas de hostname, canonización y documentos legales: 11/11.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a los 11 archivos afectados: OK.
  - `npm.cmd test`: 145/145 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
- Riesgos / trabajo pendiente:
  - Desplegar y ejecutar smoke cruzado de ambos dominios.
  - La versión legal vigente conserva en su contenido versionado una referencia
    histórica a las condiciones de Sari. Neutralizar ese texto requiere una
    nueva versión legal, hash y migración; no debe editarse retroactivamente.
  - Antes de habilitar MYA se necesitan condiciones logísticas propias de ese
    tenant; no se debe reutilizar el documento de Sari.
- Commit: pendiente.

### 2026-09-23 - SAAS-P8-10 - Detalle de factura bloqueado por relación recursiva

- Estado: corrección desplegada y postflight técnico aprobado; UAT autenticado
  pendiente dentro de la ventana congelada.
- Hallazgo:
  - La auditoría de las 73 páginas reprodujo `PGRST200` al abrir
    `/invoicing/[id]`: PostgREST no encontró una relación embebible entre
    `invoices` y `parent_invoice_id`.
  - La clave foránea compuesta existe en Production, pero es autorreferencial;
    PostgREST requiere una relación computada para embeber relaciones
    recursivas y tampoco resolvió el hint canónico de la constraint.
  - El fallo de ese dato auxiliar impedía cargar por completo la factura,
    incluidos pagos, documentos y acciones operativas.
- Archivos modificados:
  - `src/app/(protected)/invoicing/[id]/page.tsx`.
  - `tests/invoice-detail-query.test.mjs`.
- Cambio:
  - La factura principal se consulta sin el embed recursivo.
  - Si el documento es una nota de crédito o débito, el número de su factura
    original se obtiene mediante una segunda consulta por ID protegida por RLS.
  - Un fallo aislado al leer ese número muestra una advertencia, pero ya no
    bloquea el resto del detalle ni la navegación a la factura original.
  - No se modifica SQL, RLS ni información financiera.
- Validaciones ejecutadas:
  - Consulta original contra Production: `400`, `PGRST200` reproducido.
  - Hint con `invoices_parent_invoice_id_fkey`: `400`, `PGRST200` reproducido.
  - Auditoría PostgREST: 209 consultas de lectura únicas; 207 correctas, este
    hallazgo real y un sentinel opcional de ambiente demo no desplegado.
  - Prueba dirigida del detalle de factura: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a la página y la prueba nueva: OK.
  - `npm.cmd test`: 142/142 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
- Riesgos / trabajo pendiente:
  - Probar con sesión una factura normal y una nota de crédito o débito antes
    de levantar el congelamiento de Facturación.
- Postflight Production:
  - Deployment `dpl_BcJtny9fSELmHYM2QMEXuYTdSHLP`: `Ready`, con alias
    `forwarders.app` y `sari.forwarders.app`.
  - Smoke público: `/` y `/login` responden `200`; `/invoicing` y
    `/invoicing/[id]` redirigen a Login sin sesión.
- Commit: `ad07a3c`.

### 2026-09-23 - SAAS-P8-09 - Relaciones ambiguas en actividades de Ventas

- Estado: hotfix desplegado y UAT autenticado aprobado por el usuario.
- Hallazgo:
  - Ventas devolvía `PGRST201`: PostgREST encontró más de una relación entre
    `sales_activities` y `clientes`.
  - Production conserva intencionalmente una FK simple legacy y una FK
    compuesta por `tenant_id` tanto hacia `clientes` como hacia `profiles`;
    difieren en su acción de borrado y no deben consolidarse automáticamente.
  - Las dos consultas de actividades usaban embeds sin hint. Resolver solamente
    Clientes habría dejado la misma ambigüedad pendiente para Perfiles.
- Archivos modificados:
  - `src/app/(protected)/ventas/page.tsx`.
  - `tests/sales-activities-query.test.mjs`.
- Cambio:
  - La agenda y la cola “Mi día” comparten un select que fija
    `sales_activities_tenant_cliente_fkey` y
    `sales_activities_tenant_created_by_fkey`.
  - No se cambia SQL, RLS ni información comercial.
- Validaciones ejecutadas:
  - Consulta REST original contra Production: `300`, `PGRST201` reproducido.
  - Misma consulta con ambos hints tenant: `200`, sin error de relación.
  - Prueba dirigida de las dos consultas: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a Ventas y la prueba nueva: OK.
  - `npm.cmd test`: 141/141 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
- Riesgos / trabajo pendiente:
  - Ninguno pendiente para las consultas de Ventas corregidas.
- Postflight Production:
  - Deployment `dpl_DQLyyKgQC4SijaefkCkz2zdN1jSV`: `Ready`, con alias
    `forwarders.app` y `sari.forwarders.app`.
  - El usuario confirmó que Ventas y Alertas cargan correctamente.
- Commit: `6def458`.

### 2026-09-23 - SAAS-P8-08 - Caché CORS entre dominio plataforma y tenant

- Estado: hotfix desplegado y postflight técnico aprobado; UAT autenticado en
  progreso dentro de la ventana congelada.
- Hallazgo:
  - Desde `https://sari.forwarders.app`, Reportes y Ventas fallaban con
    `TypeError: Failed to fetch`; Alertas tampoco podía procesar tarifas
    vencidas.
  - DevTools mostró respuestas REST de Supabase reutilizadas con
    `Access-Control-Allow-Origin: https://forwarders.app`, distinto del origen
    tenant solicitante.
  - La configuración remota del rol `authenticator` no contiene
    `pgrst.server_cors_allowed_origins`. Una comprobación fresca del gateway
    acepta ambos orígenes, pero las respuestas REST no publican `Vary: Origin`
    ni `Cache-Control`, por lo que el navegador puede conservar una respuesta
    incompatible al alternar entre dominio raíz y subdominio.
- Archivos modificados:
  - `src/lib/supabase/client.ts`.
  - `tests/supabase-browser-client.test.mjs`.
- Cambio:
  - El cliente Supabase compartido usa un `fetch` personalizado con
    `cache: 'no-store'`, conservando método, headers y demás opciones.
  - El ajuste cubre las consultas autenticadas de Comercial, Alertas,
    Reportes y los demás módulos que consumen el cliente común; no modifica
    tablas, RLS, sesiones ni filas de negocio.
- Validaciones ejecutadas:
  - Consulta remota de solo lectura a `pg_roles`: sin override CORS en
    `authenticator`.
  - Preflight fresco para `sari.forwarders.app`, `forwarders.app` y un origen
    ajeno: `200`, gateway activo.
  - GET REST controlado desde ambos dominios: el gateway refleja el origen
    solicitante y responde mediante Cloudflare en modo `DYNAMIC`; la respuesta
    no declara `Vary` ni `Cache-Control`.
  - Prueba dirigida del wrapper de red: OK; fuerza `no-store` y preserva URL,
    método y headers.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 140/140 pruebas correctas.
  - ESLint dirigido al cliente y su prueba: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
- Riesgos / trabajo pendiente:
  - Completar UAT autenticado en Dashboard, Cotizaciones, Clientes, Ventas,
    Reportes y Alertas antes de levantar el congelamiento.
- Postflight Production:
  - Deployment `dpl_E7UAwdM72niAPWbSsPGqt3M4jh2o`: `Ready`, con alias
    `forwarders.app` y `sari.forwarders.app`.
  - Smoke público: `/` y `/login` responden `200`; las rutas protegidas
    redirigen a Login sin sesión.
  - El bundle publicado contiene el cliente Supabase con `no-store`; los GET
    REST frescos reflejan correctamente ambos orígenes.
- Commit: `c233119`.

### 2026-09-23 - SAAS-P8-07 - Relaciones PostgREST duplicadas tras el corte multiempresa

- Estado: SQL aplicado y postflight remoto aprobado; promoción del frontend y
  UAT autenticado pendientes dentro de la ventana congelada.
- Hallazgo:
  - El UAT autenticado mostró Dashboard y Cotizaciones sin datos.
  - Las 291 cotizaciones activas continúan en Production; PostgREST devolvía
    `PGRST201` porque coexistían la foreign key simple legacy y la nueva foreign
    key compuesta por `tenant_id` para una misma relación.
  - Una auditoría de solo lectura reprodujo 23 consultas ambiguas en Comercial,
    Pricing, Operaciones, Reportes y Finanzas.
- Archivos y SQL:
  - `supabase/migrations/20260923141500_phase8_postgrest_relationship_disambiguation.sql`.
  - `supabase/tests/phase8_postgrest_relationship_disambiguation.sql`.
  - `src/app/(protected)/clientes/[id]/page.tsx`.
  - `src/app/(protected)/reports/page.tsx`.
- Cambio:
  - Los pares de constraints con semántica referencial idéntica se consolidan en
    una sola foreign key compuesta, conservando el nombre legacy consumido por
    las consultas existentes.
  - Las relaciones con acciones distintas no se alteran; el embed de notas de
    cliente se desambigua explícitamente con la clave compuesta por tenant.
  - Los hints abreviados de facturas se reemplazan por los nombres canónicos de
    las constraints compuestas que permanecen después de la consolidación.
  - No se modifican ni eliminan filas de negocio.
- Validaciones ejecutadas:
  - Auditoría Production previa: perfil `Admin Pruebas` activo, aprobado y
    asociado a Sari; 291 cotizaciones activas; error reproducido `PGRST201`.
  - La migración local reconcilió 130 relaciones equivalentes; la prueba SQL
    específica finalizó correctamente con `ROLLBACK`.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 139/139 pruebas correctas.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint dirigido al archivo React tocado reproduce 29 errores y 1 warning de
    deuda legacy preexistente; el cambio de hint no agrega una regla nueva.
  - ESLint dirigido a `reports/page.tsx`: OK.
  - `git diff --check`: OK; solo avisos LF/CRLF del entorno.
  - Production reconcilió 130 relaciones equivalentes sin modificar filas; el
    historial local/remoto quedó alineado hasta `20260923141500`.
  - Auditoría PostgREST posterior: 36 consultas embebidas verificadas, 0 errores.
  - Conteo posterior: 291 cotizaciones activas; consultas exactas de Dashboard e
    Histórico sin error; perfil `Admin Pruebas` conserva contexto Sari válido.
  - `npx.cmd supabase db lint --linked --level error`: sin errores de esquema.
- Riesgos / trabajo pendiente:
  - Promover los hints canónicos del frontend y comprobar el despliegue.
  - Repetir UAT autenticado antes de levantar el congelamiento.
- Commit de migración y hotfix base: `c39cf06`; follow-up de hints pendiente.

### 2026-09-23 - SAAS-P8-06 - Corte SQL multiempresa en Production

- Estado: SQL aplicado y postflight técnico aprobado; frontend Production y UAT
  autenticado pendientes dentro de la misma ventana congelada.
- Alcance:
  - Se aplicaron las Fases 1 a 8, incluida la reconciliación de una cuenta Admin
    operativa y la eliminación autorizada de una notificación legacy huérfana.
  - MYA continúa deshabilitada; solo existe el tenant Sari.
- Evidencia previa:
  - Backup cifrado fresco: run `35908161172`, `success`.
  - Restore drill aislado de esa copia: run `35908448864`, `success`.
  - Dry-run inicial limitado al paquete multiempresa y ausencia de consultas
    largas o bloqueos.
- Postflight Production:
  - Historial local/remoto alineado hasta `20260921190000`.
  - 81 tablas tenant-scoped auditadas: ninguna tabla de negocio contiene
    `tenant_id` nulo ni distinto de Sari.
  - Perfiles: 7 cuentas operativas Sari, 1 cuenta exclusiva de plataforma, 0
    cuentas con doble contexto y 0 cuentas sin contexto válido.
  - Un tenant Sari activo, un dominio primario `sari.forwarders.app` activo y
    `resolve_tenant_public_context` devuelve una sola fila válida; hostname
    desconocido devuelve cero filas.
  - `npx.cmd supabase db lint --linked --level error`: sin errores.
  - Consultas largas y bloqueos: ninguno.
  - Vercel Preview del commit `a15c651`: build `success`; el hostname Preview
    responde `404` de forma esperada porque `*.vercel.app` no está autorizado
    como dominio tenant.
- Riesgos / trabajo pendiente:
  - Promover el commit final a Production y ejecutar smoke/UAT autenticado antes
    de levantar el congelamiento.
  - Configurar y verificar DNS/TLS de `sari.forwarders.app` sin habilitar MYA.
- Hash del commit de documentación: pendiente.

### 2026-09-23 - SAAS-P8-05 - Notificación legacy sin destinatario

- Estado: aplicada y verificada en Production.
- Hallazgo:
  - El preflight transaccional de Fase 6 encontró 1 de 373 notificaciones
    internas con `user_id IS NULL`. La fila no tiene destinatario, no es visible
    para ninguna cuenta y no permite derivar ownership de tenant.
- SQL y pruebas:
  - `supabase/migrations/20260921165000_phase6_remove_orphan_notification.sql`.
  - `supabase/tests/phase6_portal_storage_api_isolation.sql`.
- Cambio:
  - Se elimina exclusivamente la notificación legacy sin destinatario.
  - La migración aborta si encuentra más de una fila para impedir ampliar
    silenciosamente el alcance autorizado.
  - La Fase 6 posterior establece `notifications.user_id NOT NULL` y la clave
    compuesta de tenant/perfil, evitando que reaparezca el estado inválido.
- Validaciones ejecutadas:
  - Auditoría Production de solo lectura: 373 notificaciones totales, 1 con
    `user_id IS NULL`, 0 con perfil inexistente y 0 asociadas a un perfil sin
    tenant.
  - Migración local dentro de `BEGIN`/`ROLLBACK`: OK.
  - `phase6_portal_storage_api_isolation.sql`: OK, finaliza con `ROLLBACK`.
  - Production eliminó exactamente 1 fila; postflight: 372 notificaciones, 0
    destinatarios nulos y 0 tenants inválidos.
- Riesgos / trabajo pendiente:
  - Aplicar la limpieza y las migraciones restantes; ejecutar postflight y UAT
    antes de levantar el congelamiento.
- Commit: `a15c651`.

### 2026-09-23 - SAAS-P8-04 - Reconciliación de administradores operativos Sari

- Estado: aplicada y verificada en Production.
- Hallazgo:
  - El preflight de `20260921142000` detectó dos perfiles `Admin` marcados como
    administradores de plataforma que también son autores de datos históricos
    de Sari. La separación estricta de contexto dejó esos perfiles sin
    `tenant_id` y bloqueó correctamente las claves compuestas de actor/tenant.
- SQL y pruebas:
  - `supabase/migrations/20260921141500_phase3_reclassify_operational_platform_admins.sql`.
  - `supabase/tests/phase3_commercial_tenant_isolation.sql`.
- Cambio:
  - Solo los administradores de plataforma sin tenant que ya poseen referencias
    operativas de Sari se reclasifican como cuentas `Admin` de Sari.
  - La migración aborta si alguna de esas cuentas está referenciada por un
    tenant distinto; no altera administradores exclusivos de plataforma sin
    historial operativo.
- Validaciones ejecutadas:
  - Auditoría Production de solo lectura: 2 perfiles de plataforma iniciales,
    ambos `Admin`, `Aprobado` y activos; 1 conservaba referencias operativas de
    Sari y requería reclasificación.
  - Backup cifrado `35908161172`: OK.
  - Restore drill aislado `35908448864`: OK.
  - Migración correctiva local dentro de `BEGIN`/`ROLLBACK`: OK; 0 cambios en
    los fixtures ya consistentes.
  - `phase3_commercial_tenant_isolation.sql`: OK, finaliza con `ROLLBACK`.
  - `npx.cmd tsc --noEmit`: OK.
  - Production reclasificó exactamente 1 perfil operativo; postflight: 7
    perfiles Sari, 1 administrador exclusivo de plataforma y 0 dobles contextos.
- Riesgos / trabajo pendiente:
  - Aplicar la reconciliación y las migraciones restantes, ejecutar postflight,
    desplegar la aplicación y realizar UAT autenticado antes de levantar el
    congelamiento.
  - La cuenta restante sin tenant conserva exclusivamente el contexto de soporte
    de plataforma y no puede asumir datos operativos de Sari.
- Commit: `9506630`.

### 2026-09-23 - SAAS-P8-03 - Release candidate de dominios multiempresa

- Estado: candidato validado y preparado en la rama
  `feat/multi-tenant-domains`; commit, push y Preview pendientes. Production,
  SQL remoto y DNS permanecen en `NO-GO` hasta ejecutar el preflight y la
  ventana de corte del runbook.
- Alcance:
  - Consolida las fases 1 a 8 del plan multiempresa, sus 18 migraciones, suites
    SQL, aislamiento por tenant, branding, resolución de hostname, Storage y
    acceso limitado del administrador de plataforma.
  - Incluye la documentación de corte/UAT y el registro del sistema externo de
    backups ya validado.
- Validaciones ejecutadas sobre el worktree definitivo:
  - `npm.cmd test`: 139/139 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a proxy, contexto, branding, helpers, providers, endpoints
    administrativos y pruebas tenant: OK.
  - ESLint ampliado sobre el lote modificado reproduce deuda legacy documentada
    en pantallas y PDFs; no se usa como gate ni se mezcla con este corte.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK.
- Validaciones / acciones pendientes:
  - Publicar la rama y verificar el deployment Preview de Vercel.
  - Ejecutar el UAT autenticado de 15 casos sobre un entorno aislado.
  - Congelar escrituras, ejecutar preflight de Production y aplicar las 18
    migraciones antes de promover exactamente este build.
  - Configurar y verificar DNS/TLS de `sari.forwarders.app`; MYA permanece
    deshabilitada.
- Riesgos / trabajo pendiente:
  - La aplicación multiempresa depende de que el SQL se aplique primero; no se
    debe promover esta rama a Production mientras la base conserve el esquema
    anterior.
  - El backup externo está operativo y el restore drill de datos de aplicación
    fue exitoso, pero Auth/Storage alojados aún requieren UAT en un proyecto
    separado cuando exista capacidad.
  - Hash del commit y URL Preview: pendientes.

### 2026-09-22 - SAAS-P8-02 - Acceso aislado a soporte de plataforma

- Estado: implementado y validado localmente; el cierre formal de Fase 8 sigue
  pendiente de UAT visual autenticado y preflight sobre una copia reciente de
  Production. Sin despliegue, DNS, SQL remoto ni alta real de MYA.
- Fase: cierre incremental de la Fase 8 del plan multiempresa.
- Hallazgo:
  - `is_platform_admin` concedía acceso transversal explícito a las tablas y RPC
    de soporte, pero login y el layout protegido exigían siempre un tenant. Una
    cuenta de plataforma sin `tenant_id` no podía abrir la consola autorizada.
  - La navegación de rol `Admin` también habría presentado módulos operativos y
    creación de tickets que no corresponden al contexto de Hernova.
- Archivos modificados:
  - `src/lib/tenant-context.ts`.
  - `src/proxy.ts`.
  - `src/app/login/page.tsx`.
  - `src/app/(protected)/layout.tsx`.
  - `src/app/(protected)/support/page.tsx`.
  - `src/components/layout/protected-shell.tsx`.
  - `src/components/layout/sidebar.tsx`.
  - `src/components/layout/topbar.tsx`.
  - `tests/tenant-host.test.mjs`.
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`.
  - `docs/uat/multi-tenant-phase8-local-certification.md`.
  - `docs/uat/multi-tenant-phase8-manual-uat.md`.
  - `HARDENING.md`.
- Cambios:
  - Se separa el acceso por contexto: un perfil operativo solo coincide con su
    tenant; un administrador de plataforma debe tener `is_platform_admin = true`
    y `tenant_id IS NULL`.
  - El dominio raíz admite login y tickets existentes de soporte. Dashboard,
    perfil, nuevo ticket y cualquier módulo de negocio fallan cerrados.
  - La consola de plataforma oculta acciones rápidas, alertas operativas,
    tutorial, perfil y navegación de negocio; conserva únicamente soporte,
    tema y cierre de sesión.
  - Se documenta una matriz de 15 casos para el UAT manual pendiente.
- Validaciones ejecutadas:
  - `npm.cmd test`: 139/139 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido de los archivos modificados: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - Smoke HTTP local con `Host: forwarders.app`: `/login` 200; `/support` y
    `/support/<uuid>` redirigen a login sin sesión; `/dashboard` y
    `/support/new` responden 404.
- Validaciones pendientes:
  - Login y gestión visual de un ticket con un administrador de plataforma real
    en una copia aislada reciente de Production.
  - UAT por todos los roles, ensayo de duración, locks, conteos y Storage.
- Riesgos / trabajo pendiente:
  - Proxy y layout son defensa de ruta; RLS y RPC continúan siendo la autoridad
    de datos. El UAT debe comprobar ambas capas con sesiones reales.
  - Production, Supabase vinculado, Vercel, DNS y TLS permanecen intactos.
  - No hay hash de commit disponible.

### 2026-09-23 - OPS-BACKUP-01 - Respaldo externo cifrado de Supabase

- Estado: publicado y programado en un repositorio privado aislado; primeras
  ejecuciones de base de datos y Storage verificadas. Restauracion efimera de
  los datos propios del ERP e integridad completa de los artefactos verificadas.
  Sin despliegue de la aplicacion.
- Repositorio externo:
  - `https://github.com/dhernandezp123/sarierp-backups`
  - `.github/workflows/supabase-backup.yml`
  - `.github/workflows/restore-drill.yml`
  - `scripts/backup/backup-supabase.sh`
  - `scripts/backup/restore-drill.sh`
  - `README.md`
- SQL modificado: ninguno.
- Cambios:
  - Programa un dump logico diario de roles, esquema y datos mediante la version
    fijada de Supabase CLI.
  - Incluye un snapshot semanal separado de todos los buckets de Supabase
    Storage mediante su endpoint S3.
  - Cifra los archivos con AES-256 antes de subirlos al bucket privado de
    Backblaze B2 y publica checksums SHA-256.
  - Verifica el tamano remoto, contabiliza todas las versiones de B2 y detiene
    nuevas subidas antes de alcanzar el limite gratuito de 10 GB; la limpieza
    queda en reglas Lifecycle por prefijo para eliminar tambien versiones.
  - Mantiene los secretos exclusivamente en GitHub Actions y elimina el material
    sin cifrar del runner efimero al finalizar.
  - Incorpora una prueba manual de recuperacion que descarga los ultimos
    artefactos desde B2, valida ambos niveles de checksum, descifra y restaura la
    base en un Supabase local efimero dentro de GitHub Actions. No consume un
    proyecto alojado ni se conecta a Production, Demo o Resident Pass.
- Validaciones ejecutadas:
  - `bash -n scripts/backup/backup-supabase.sh`: OK con Git Bash.
  - Parseo estructural de `.github/workflows/supabase-backup.yml` con
    `js-yaml`: OK; trigger y job principal presentes.
  - `npx.cmd supabase db dump --help`: opciones `--role-only`, `--data-only`,
    `--use-copy`, `--exclude`, `--file` y `--db-url` confirmadas.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check` y revision de whitespace de los archivos nuevos: OK;
    solo avisos CRLF del worktree existente.
  - Publicacion aislada en la rama `main` de `sarierp-backups`: OK; el
    repositorio de la aplicacion, Vercel y Supabase permanecieron sin cambios.
  - Primera ejecucion manual de base de datos: OK en 57 segundos; archivo
    cifrado de 624.1 KB y checksum visibles en `production/database/`.
  - Primera ejecucion manual con Storage: OK en 1 minuto 26 segundos; archivo
    cifrado de 213.1 KB y checksum visibles en `production/storage/`.
  - `actions/checkout` actualizado de v4.2.2 a v7.0.1, fijado por SHA, para usar
    el runtime Node.js 24 y eliminar el aviso de deprecacion observado.
- Validaciones pendientes:
  - Restauracion de Storage y UAT integral de Auth, APIs y Realtime en un
    proyecto alojado aislado cuando exista capacidad.
- Riesgos / trabajo pendiente:
  - Una ejecucion verde y los archivos remotos certifican creacion, cifrado,
    subida y tamano, pero no sustituyen una restauracion integral de prueba.
  - La prueba efimera valida la restauracion SQL y la integridad del snapshot de
    Storage; no carga los objetos en una API Storage alojada ni valida servicios
    externos del proyecto.
  - La primera prueba efimera (`35903548497`) verifico descarga, checksums,
    descifrado y extraccion de base y Storage, pero la restauracion SQL se detuvo
    en `auth.custom_oauth_providers.custom_claims_allowlist`: la imagen local de
    Auth incluida por CLI `2.107.0` era anterior al esquema alojado. Se actualiza
    solo el drill a la version estable `2.117.0`; revalidacion pendiente.
  - La segunda prueba (`35904491408`) supero esa diferencia con CLI `2.117.0`,
    pero encontro otra deriva administrada: la tabla alojada
    `auth.mfa_recovery_code_sets` aun no existe en la imagen local. El drill pasa
    a restaurar de forma estricta solo los datos de aplicacion y mantiene los
    bloques `auth`/`storage` intactos y verificados en el respaldo.
  - La tercera prueba (`35905133247`): OK en 1 minuto 49 segundos; 88 bloques
    `COPY` de aplicacion restaurados, 138 tablas base visibles y 31 bloques
    administrados Auth/Storage preservados y verificados. Ningun proyecto remoto
    fue modificado.
  - La rotacion automatica requiere configurar las dos reglas Lifecycle de B2
    documentadas y que Object Lock expire antes de su eliminacion.
  - GitHub Actions y Backblaze B2 son dependencias externas sin SLA contratado.
  - Commits externos: `671cc2a`, `5cab0f9`, `a8211aa`, `9df04aa`, `65bea43` y
    `eef95a3` (`sarierp-backups`).

### 2026-09-21 - SAAS-P8-01 - Certificación local y paquete de corte multiempresa

- Estado: candidato técnico validado localmente; cierre formal pendiente de UAT
  visual autenticado y preflight sobre copia reciente de Production. Sin
  despliegue, DNS, SQL remoto ni alta real de MYA.
- Fase: 8 del plan multiempresa.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_CUTOVER_RUNBOOK.md`
  - `docs/uat/multi-tenant-phase8-local-certification.md`
- SQL y pruebas modificados:
  - `supabase/migrations/20260921150000_phase4_operations_tenant_isolation.sql`
  - `supabase/migrations/20260921162000_phase5_invoice_entrypoint.sql`
  - `supabase/migrations/20260921171000_phase6_tenant_storage_policies.sql`
  - `supabase/migrations/20260921190000_phase8_main_platform_admin.sql`
  - `supabase/tests/phase4_operations_tenant_isolation.sql`
  - `supabase/tests/phase8_upgrade_fixture.sql`
  - `supabase/tests/phase8_upgrade_verify.sql`
- Hallazgos corregidos:
  - Se eliminaron dos dependencias accidentales de `main` hacia helpers
    exclusivos de la rama Demo en facturación y políticas de fotos Miami.
  - El backfill operativo suspende solo los triggers de usuario de sus 27 tablas
    dentro de la transacción, asigna ownership, los reactiva antes del preflight
    y aborta ante nulos o referencias cruzadas. Esto evita que historiales 5C
    append-only bloqueen el upgrade con datos existentes.
  - La prueba de Fase 4 limita su conteo a las 27 policies que realmente
    certifica y no confunde policies agregadas por fases posteriores.
  - La nueva migración `20260921190000` redefine `is_platform_admin()` para la
    rama productiva sin SQL dinámico hacia funciones de Demo y conserva permisos
    mínimos.
- Validaciones ejecutadas:
  - Instalación limpia en la pila aislada
    `sarierp_phase8_certification`: 99 migraciones hasta
    `20260921190000`, correcta.
  - Upgrade desde `20260918200000`: 81 -> 99 migraciones, correcto.
  - Fixture de upgrade: 15/15 tablas conservaron exactamente sus conteos; cero
    `tenant_id` nulos o ajenos y relaciones Cotización -> Shipment -> SI ->
    Booking -> Facturación intactas.
  - Suites SQL `phase1` a `phase7`: 7/7 correctas con rollback; cubren `anon`,
    Cliente, Ventas, Pricing, Operaciones, Contabilidad, Finanzas, Admin,
    administrador de plataforma, cruces Sari/MYA, RPC y Storage.
  - `npx.cmd supabase db lint --local --workdir .phase8-certification --level error`:
    sin errores.
  - `npm.cmd test`: 138/138 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint dirigido de proxy, contexto, branding, helpers, providers y pruebas
    tenant: OK.
  - ESLint dirigido que incluyó los dos PDFs legacy: 23 errores y 7 warnings ya
    existentes (`any`, variables sin uso y `alt`).
  - `npm.cmd run lint`: 212 errores y 41 warnings de deuda extendida existente;
    no se introdujeron errores en la capa tenant dirigida y TypeScript/build
    permanecen correctos.
- Validaciones pendientes:
  - UAT visual autenticado por rol en una copia reciente de Production.
  - Ensayo de duración, locks, conteos y Storage con volumen representativo.
  - Backup restaurado, preflight y autorización explícita en una ventana futura.
- Riesgos / trabajo pendiente:
  - La deuda global de ESLint no se mezcló con el corte y debe abordarse por
    separado.
  - La duración local no predice la duración del backfill productivo.
  - Producción, Supabase vinculado, Vercel, DNS y TLS permanecen intactos; MYA
    continúa deshabilitada.
  - No hay hash de commit disponible.

### 2026-09-18 - FLOW-033 / DB-029 / UX-064 - Excepciones documentales auditables

- Estado: implementado, migrado y publicado en Production; UAT autenticado
  pendiente.
- Hallazgo:
  - El motor documental advertía diferencias entre BL y sus fuentes, pero una
    excepción válida (Switch BL, triangulación u otra instrucción especial) no
    podía justificar ni conservar autor, valores revisados e historial.
  - Las diferencias seguían siendo advertencias en cada revisión o podían
    normalizarse copiando la fuente, sin distinguir una corrección de una
    decisión operativa deliberada.
- Archivos / SQL:
  - `src/lib/bl-document-workflow.ts`.
  - `src/components/operations/BLValidationPanel.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
  - `tests/bl-document-workflow.test.mjs`.
  - `supabase/migrations/20260918100000_bl_validation_exceptions.sql`.
  - `supabase/migrations/20260918103000_bl_exception_transition_gate.sql`.
  - `supabase/tests/bl_validation_exceptions.sql`.
  - `HARDENING.md`.
- Cambios:
  - Se incorpora un registro append-only para excepciones documentales con
    campo, valor del BL, valor y nombre de la fuente, justificación, autor,
    fecha y estado `ACTIVE`, `SUPERSEDED` o `REVOKED`.
  - La justificación solo resuelve la diferencia exacta revisada. Si cambia el
    documento, la fuente o su contexto, la diferencia reaparece; una nueva
    justificación reemplaza la vigente sin borrar la anterior.
  - Operaciones/Admin justifican o revocan mediante RPCs atómicos. La tabla es
    de solo lectura para usuarios autenticados, aplica RLS por acceso al BL y
    cada acción genera un evento en `activity_logs`.
  - El panel separa diferencias pendientes de excepciones vigentes, presenta
    autor/motivo y ofrece historial. Crear una excepción exige un BL guardado;
    un HBL emitido o liberado no admite cambios de excepciones.
  - La UI y un trigger de base exigen corregir o justificar diferencias de
    fuente antes de validar el MBL o emitir el HBL. El gate SQL recalcula las
    fuentes de Booking, SI, cotización, líneas de carga o MBL padre y solo
    acepta una excepción cuyo snapshot coincida exactamente.
  - Las reglas lógicas ETD/ETA y POL/POD continúan como alertas no
    justificables.
- Migración:
  - `20260918100000_bl_validation_exceptions.sql` aplicada correctamente con
    `npx.cmd supabase db push --local`.
  - `20260918103000_bl_exception_transition_gate.sql` aplicada correctamente
    con `npx.cmd supabase db push --local`.
  - Preflight `npx.cmd supabase db push --linked --dry-run`: Production propuso
    únicamente `20260918100000` y `20260918103000`.
  - Ambas migraciones aplicadas correctamente en Supabase Production el
    18/09/2026; el dry-run posterior confirmó `Remote database is up to date`.
- Validaciones:
  - Prueba Node dirigida del workflow: 7/7. Incluye coincidencia exacta,
    invalidación al cambiar la fuente y revocación lógica.
  - Prueba SQL `bl_validation_exceptions.sql`: OK con rollback. Cubre bloqueo de
    inserción directa, alta atómica, reemplazo con historial, revocación y
    eventos de auditoría, bloqueo SQL de finalización y desbloqueo mediante un
    snapshot exacto.
  - Regresiones SQL `bill_of_lading_document_integrity.sql` y
    `bill_of_lading_parent_integrity.sql`: OK con rollback.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 94/94.
  - ESLint dirigido: sin errores ni advertencias.
  - `npx.cmd supabase db lint --local --level warning`: sin errores.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - Postdeploy público: `https://forwarders.app/` responde `200`; la ruta
    `/operations/shipping-instructions` responde `307` hacia
    `/login?next=%2Foperations%2Fshipping-instructions`.
- Riesgos / pendientes:
  - Ejecutar UAT autenticado con un MBL y un HBL reales antes de marcar el
    hallazgo como completado.
  - Verificar en UAT que descripciones y tipos de bulto compuestos se presentan
    igual en la UI y en el gate SQL cuando existen varias líneas de carga.
- Publicación (18/09/2026): implementación `00f9cf1` publicada en `main`;
  GitHub Production `6527725938` finalizó en `success`. Vercel deployment
  `dpl_EBnQ1usgQ6AfkK23X8BHhZkBng5Z` quedó `Ready` con alias
  `https://forwarders.app`.
- Commit de implementación: `00f9cf1`.

### 2026-09-17 - UX-063 / DB-028 - Motor de validación documental MBL/HBL

- Estado: implementado, migrado y publicado en Production; revisión visual y
  UAT autenticado pendientes.
- Hallazgo:
  - La validación del BL detectaba campos vacíos, pero no advertía cuando ruta,
    carrier, buque/viaje, fechas, carga o parties diferían de Booking, Shipping
    Instructions, cotización o MBL padre.
  - La relación `parent_bl_id` tenía FK y la copia de contenedores comprobaba el
    padre cuando estaba informado, pero todavía era posible crear o avanzar un
    HBL sin un MBL padre válido.
- Archivos / SQL:
  - `src/lib/bl-document-workflow.ts`.
  - `src/components/operations/BLValidationPanel.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
  - `tests/bl-document-workflow.test.mjs`.
  - `supabase/migrations/20260917170000_bill_of_lading_parent_integrity.sql`.
  - `supabase/tests/bill_of_lading_parent_integrity.sql`.
  - `supabase/tests/bill_of_lading_document_integrity.sql`.
  - `HARDENING.md`.
- Cambios:
  - El editor compara los campos compartidos del MBL contra Booking/SI y los del
    HBL contra su MBL padre; las partes comerciales del HBL se comparan contra
    SI/cotización, no contra las partes maestras del MBL.
  - Se detectan también ETA anterior a ETD y POL igual a POD. Las diferencias se
    muestran como revisiones, no como bloqueos, porque pueden corresponder a
    Switch BL, triangle shipment u otra excepción documental válida.
  - Cada discrepancia muestra valor del documento, fuente y una acción `Usar
    fuente`; nunca se reemplazan datos automáticamente. Documentos HBL emitidos
    o liberados conservan su snapshot y no se comparan con fuentes que hayan
    cambiado después.
  - El panel separa bloqueos obligatorios, datos recomendados y diferencias de
    consistencia, y está visible también durante la creación del BL.
  - Todo HBL nuevo exige `parent_bl_id` apuntando a un MBL del mismo booking. El
    MBL puede estar en draft mientras se prepara el HBL, pero debe estar en
    `MBL Validado` antes de que el HBL abandone `HBL Draft`. Un MBL no puede
    tener padre.
  - Se eliminó deuda local de lint del editor: tipos `any`, llamada síncrona de
    carga dentro del efecto y comillas JSX sin escapar.
- Migración:
  - `20260917170000_bill_of_lading_parent_integrity.sql` aplicada correctamente
    mediante `npx.cmd supabase db push --local`.
  - Aplicada correctamente en Production el 17/09/2026.
- Validaciones:
  - Pruebas Node dirigidas de workflow + workspace: 10/10. Cubren padre
    obligatorio, diferencias contra MBL/SI, regla ETD/ETA y POL/POD.
  - Prueba SQL `bill_of_lading_parent_integrity.sql`: OK con rollback. Cubre HBL
    sin padre, padre de otro booking, MBL draft y jerarquía válida.
  - Regresión SQL `bill_of_lading_document_integrity.sql`: OK con rollback.
  - `npx.cmd supabase db lint --local --level warning`: sin errores.
  - `npm.cmd test`: 93/93.
  - ESLint dirigido: sin errores ni advertencias.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
- Riesgos / pendientes:
  - Auditar HBL históricos sin padre o asociados a un MBL no validado; la regla
    desplegada protege escrituras futuras y no reescribe snapshots históricos.
  - Ejecutar UAT de una diferencia intencional, `Usar fuente`, guardado y
    transición HBL Draft → Pendiente Aprobación Cliente.
  - Las discrepancias son advertencias deliberadas; convertirlas en bloqueos o
    exigir un motivo persistente para excepciones corresponde a workflows
    avanzados y requiere modelo/auditoría adicional.
- Publicación (17/09/2026): migraciones `20260917150000`, `20260917160000` y
  `20260917170000` aplicadas en Supabase Production. Commit `e79cabc` publicado
  en `main`; Vercel deployment `4M27W7HJ7Lj8iP1h82aZC5DyEsQ7` finalizó en
  `success`. `/operations/shipping-instructions` responde 307 hacia el login
  preservando `next`; UAT autenticado continúa pendiente.
- Commit de implementación: `e79cabc`.

### 2026-09-17 - UX-062 / FLOW-032 - Documentation Workspace unificado

- Estado: implementado y publicado en Production; revisión visual y UAT
  autenticado pendientes.
- Hallazgo:
  - El detalle del booking ya contenía Shipping Instructions, readiness,
    adjuntos y BL, pero como secciones independientes y extensas. El operador
    debía recorrer toda la pantalla para descubrir qué estaba listo, qué lo
    bloqueaba y dónde continuar el MBL/HBL.
  - No existía una representación única del expediente documental ni una
    siguiente acción sugerida basada en las fuentes de verdad actuales.
- Archivos:
  - `src/lib/documentation-workspace.ts`.
  - `src/components/operations/DocumentationWorkspace.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`.
  - `tests/documentation-workspace.test.mjs`.
  - `HARDENING.md`.
- SQL: no aplica. El workspace es una vista derivada; no crea estados, tablas ni
  una fuente documental paralela y no modifica RLS.
- Cambios:
  - Se incorpora al inicio del booking un expediente con tarjetas para Shipping
    Instructions, booking/routing, preparación operativa, archivos de soporte,
    MBL, HBL y aviso de llegada.
  - Cada tarjeta muestra estado `Completo`, `En curso`, `Falta información`,
    `Bloqueado` o `Por iniciar`, además del responsable, contexto y acceso a la
    acción existente correspondiente.
  - La siguiente acción respeta la secuencia SI → booking → readiness → MBL →
    HBL. El HBL no se ofrece hasta que exista un MBL validado y el MBL no se
    ofrece hasta confirmar `Booking Number` o `Carrier Booking`.
  - Los enlaces internos llevan directamente a datos, confirmación, readiness,
    adjuntos y BL sin duplicar formularios. El aviso de llegada conserva su
    disponibilidad únicamente después del arribo.
- Validaciones:
  - Pruebas dirigidas del workspace: 4/4. Cubren creación de MBL por referencia,
    bloqueo y habilitación del HBL y exposición de bloqueos de readiness.
  - Pruebas documentales combinadas: 7/7.
  - `npm.cmd test`: 90/90.
  - ESLint dirigido: sin errores ni advertencias.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
- Riesgos / pendientes:
  - Validar visualmente en escritorio y móvil con datos reales, modos marítimo,
    aéreo y terrestre, y con roles Admin/Operaciones/solo lectura.
  - El workspace resume el expediente de un booking; una vista transversal de
    todos los bookings de un shipment queda fuera de esta fase.
  - Adjuntar un PDF generado como evidencia continúa siendo una acción explícita;
    el workspace no presupone que descargar un PDF lo haya archivado.
- Commit de implementación: `e79cabc`.

### 2026-09-17 - FLOW-031 / UX-061 - Confirmación operativa del booking

- Estado: implementado, migrado y publicado en Production; UAT autenticado
  pendiente.
- Hallazgo:
  - Operaciones veía `Booking Number` y `Carrier Booking` como solo lectura, pero
    la única interfaz capaz de modificarlos era `Corrección Admin` o el flujo de
    reemplazo. Sin una referencia, la pantalla tampoco permitía crear el MBL.
  - El trigger canónico protegía correctamente la identidad del booking, por lo
    que agregar los campos al guardado genérico no era una solución válida.
- Archivos / SQL:
  - `supabase/migrations/20260917160000_booking_reference_confirmation.sql`.
  - `supabase/tests/booking_reference_confirmation.sql`.
  - `src/components/operations/BookingScheduleManager.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`.
  - `HARDENING.md`.
- Cambios:
  - Se agrega `confirm_booking_reference`, disponible solo para Admin y
    Operaciones, con control optimista por `updated_at` y motivo obligatorio.
  - La acción solo completa `booking_number` o `carrier_booking` vacíos; no puede
    borrar ni reemplazar valores confirmados. Una corrección real continúa
    requiriendo el flujo administrativo.
  - Cada confirmación crea una revisión inmutable `BOOKING_CONFIRMATION` y un
    `activity_log` dentro de la misma transacción.
  - `BookingScheduleManager` muestra `Confirmar referencia` cuando falta alguno
    de los dos campos, conserva bloqueadas las referencias ya confirmadas y
    recarga el booking al terminar.
  - La creación del MBL se habilita con `Booking Number` o `Carrier Booking`, y
    el encabezado usa la referencia disponible.
- Migración:
  - Aplicada correctamente en Supabase local mediante
    `npx.cmd supabase db push --local`.
  - Aplicada correctamente en Production el 17/09/2026.
- Validaciones:
  - Prueba SQL dirigida en contenedor local: OK con rollback. Cubre bloqueo de
    `UPDATE` directo, autorización, confirmación incremental, preservación de
    valores, rechazo de reemplazo y creación de revisión/actividad.
  - `npx.cmd supabase db lint --local --level warning`: sin errores de esquema.
  - ESLint dirigido de ambos componentes: sin errores ni advertencias.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 86/86.
  - `npm.cmd run build`: OK, 73/73 páginas.
- Riesgos / pendientes:
  - Ejecutar UAT con rol Operaciones: confirmar primero una referencia, agregar
    la segunda después y crear el MBL desde el mismo booking.
  - Los bookings históricos/finalizados y las referencias existentes mantienen
    su protección; cualquier corrección requiere Admin.
- Commit de implementación: `e79cabc`.

### 2026-09-17 - FLOW-030 / DB-027 - Integridad transaccional MBL/HBL

- Estado: implementado, migrado y publicado en Production; UAT operativo
  pendiente.
- Hallazgos:
  - La numeración `SARI-HBL-YYYYMMDD-NNN` se calculaba en el navegador con
    `max + 1`, por lo que dos usuarios podían reservar el mismo número.
  - Las transiciones actualizaban directamente `bills_of_lading`; la validación,
    las fechas, la bitácora y la sincronización del booking no eran una sola
    transacción y podían ser omitidas por un `UPDATE` directo.
  - Un HBL emitido seguía admitiendo cambios en sus datos y contenedores.
- Archivos / SQL:
  - `supabase/migrations/20260917150000_bill_of_lading_document_integrity.sql`.
  - `supabase/tests/bill_of_lading_document_integrity.sql`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
  - `HARDENING.md`.
- Cambios:
  - Un trigger asigna el número HBL dentro de la misma transacción del `INSERT`,
    usando un contador diario bloqueado y una restricción única normalizada.
  - `transition_bill_of_lading` valida autorización, versión, transición y
    campos documentales; registra fechas, enmienda, actividad y sincroniza el
    resumen del booking mediante `update_booking_canonical` atómicamente.
  - Se retira a `authenticated` el permiso de actualizar columnas de estado y
    control; solo el RPC puede avanzar el documento.
  - Un HBL `Emitido` o `Liberado` y sus `bl_containers` quedan inmutables. La
    única excepción es la transición canónica `Emitido` → `Liberado`.
  - El editor exige guardar primero, usa control optimista por `updated_at`,
    bloquea los campos del HBL emitido y muestra las fechas de control como
    valores administrados por el workflow.
- Migración:
  - Aplicada correctamente en Supabase local mediante
    `npx.cmd supabase db push --local`.
  - Aplicada correctamente en Production el 17/09/2026.
- Validaciones:
  - Prueba SQL dirigida en contenedor local: OK con rollback. Cubre numeración
    única, bloqueo de estado directo, rechazo de documento incompleto,
    transiciones completas, fechas, booking cache, bitácora e inmutabilidad.
  - `npx.cmd supabase db lint --local --level warning`: sin errores de esquema.
  - `npm.cmd test`: 86/86.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint final del helper, componentes, editor y pruebas: sin errores ni
    advertencias; la deuda previa del editor se corrigió en `UX-063 / DB-028`.
  - La ejecución global `supabase test db --local` alcanza y ejecuta la prueba
    nueva sin error, pero el comando global continúa fallando por pruebas
    históricas ajenas (`booking_documents_*`, `phase1_rls` y
    `phase4_receivables`).
- Riesgos / pendientes:
  - La migración de Production comprobó la ausencia de números HBL duplicados y
    se aplicó correctamente; queda pendiente el UAT autenticado del flujo.
  - Ejecutar UAT autenticado de MBL Draft → Validado y HBL Draft → Liberado.
  - La edición ordinaria del draft aún usa `UPDATE` directo; una fase posterior
    puede mover también el guardado y su enmienda a un RPC con versión.
  - La acción operativa para registrar referencias del booking se completa en
    `FLOW-031 / UX-061`.
- Commit de implementación: `e79cabc`.

### 2026-09-17 - FLOW-029 / UX-060 - Preparación documental MBL/HBL

- Estado: implementado y publicado en Production; UAT operativo pendiente.
- Hallazgos:
  - Al crear un HBL desde su MBL padre, el editor heredaba también `shipper`,
    `consignee` y `notify party`. Esas partes corresponden al contrato del MBL
    y podían reemplazar incorrectamente las partes comerciales del HBL.
  - Los nuevos documentos no precargaban descripción, bultos, peso ni volumen
    desde la cotización y sus `quotation_cargo_lines` canónicas.
  - Las transiciones permitían validar o enviar documentos con datos críticos
    incompletos, y el editor no mostraba el contexto SI → Booking → BL.
- Archivos:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
  - `src/lib/bl-document-workflow.ts`.
  - `tests/bl-document-workflow.test.mjs`.
  - `HARDENING.md`.
- Cambios:
  - El HBL conserva las partes comerciales configuradas en la Shipping
    Instruction/cotización y solo hereda del MBL ruta, carrier, buque/viaje y
    datos de carga compartidos.
  - Los nuevos BL precargan mercancía desde `quotation_cargo_lines`; el peso
    unitario en libras se multiplica por cantidad y se convierte a kilogramos.
    Si no hay líneas utilizables, se usan los campos de cabecera de la
    cotización como respaldo.
  - Se incorporan breadcrumbs y contexto visible de SI y Booking.
  - Antes de una transición se muestran faltantes obligatorios y recomendados;
    se bloquea el avance si faltan partes, ruta, carrier, carga, peso o datos de
    buque/viaje. Para validar un MBL también se exige el draft del agente.
- SQL: no aplica en esta fase; no se modificaron esquema, RLS ni datos
  persistidos existentes.
- Validaciones:
  - Pruebas dirigidas del workflow documental: 3/3.
  - `npm.cmd test`: 86/86.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint del helper y prueba nuevos: OK. El editor conserva 8 errores y 1
    aviso preexistentes fuera de las líneas modificadas.
- Riesgos / pendientes:
  - Ejecutar UAT creando MBL/HBL marítimo, aéreo y terrestre desde bookings
    reales, incluyendo un HBL con MBL padre.
  - La validación transaccional y la protección en base de datos se completan en
    `FLOW-030 / DB-027`.
  - No se corrigen automáticamente documentos existentes porque hacerlo exige
    validar las partes contractuales caso por caso.
  - La acción operativa explícita para registrar el número de booking continúa
    pendiente; la numeración HBL y la inmutabilidad se completan en `FLOW-030`.
- Commit de implementación: `e79cabc`.

### 2026-09-17 - PDF-019 - Vessel/voyage y puerto de descarga en HBL

- Estado: implementado y validado por codigo; UAT visual pendiente.
- Hallazgo:
  - En el HBL `SARI-HBL-20260917-001`, el item 14 se titulaba `Exporting
    Carrier`, pero mostraba buque y viaje (`vessel_name / voyage`). Repetir la
    naviera en ese espacio tambien duplicaria el item 12 `Pre-Carriage By`.
  - El item 16 usaba la etiqueta `Foreign port of unloading (Vessel and air
    only)` en lugar de la denominacion solicitada `Port of Discharge`.
- Archivos:
  - `src/components/pdf/house-bl-pdf.tsx`.
  - `tests/house-bl-pdf.test.mjs`.
  - `HARDENING.md`.
- Cambio:
  - El item 12 conserva la naviera desde `carrier` y el item 14 se renombra
    `Vessel / Voy. No.`, alimentado por `vessel_name / voyage`; se elimina
    completamente la etiqueta duplicada `Exporting Carrier`.
  - El item 16 se renombra exactamente a `Port of Discharge` y conserva
    `port_of_discharge` como valor.
  - El item 17 conserva su etiqueta y `place_of_delivery` sin cambios.
- SQL: no aplica; no se modificaron datos ni documentos persistidos.
- Validaciones:
  - Pruebas HBL: 3/3. Verifican que el item 12 use carrier, que el item 14 use
    vessel/voyage, que items 16 y 17 conserven sus fuentes y que el PDF siga
    renderizando en una pagina.
  - `npm.cmd test`: 83/83.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 paginas.
  - ESLint dirigido de HBL y su prueba: sin hallazgos.
- Riesgos / pendientes:
  - Regenerar y revisar visualmente `SARI-HBL-20260917-001`; el cambio corrige la
    plantilla y no altera los datos operativos del booking.
- Commit: incluido en este commit.

### 2026-09-17 - UX-059 / PDF-018 - Cargos Miami LCL y detalle de costos legible

- Estado: implementado y validado por codigo; UAT visual pendiente.
- Hallazgos:
  - En `/quotations/new`, Hazmat, Declaracion IMO y Certificado IMO permanecian
    dentro de la calculadora Miami. Si el cliente no tenia tarifas activas, todo
    el bloque desaparecia y Ventas no podia distinguir una opcion inexistente de
    una tarifa pendiente de configurar.
  - El detalle interno de costos se generaba en LETTER vertical con texto de
    tabla de 5.4 puntos. La cantidad de columnas reducia su legibilidad impresa.
- Archivos:
  - `src/components/quotations/MiamiQuotationSection.tsx`.
  - `src/lib/miami-pricing-items.ts`.
  - `src/components/pdf/cost-detail-pdf.tsx`.
  - `tests/miami-optional-charges.test.mjs`.
  - `tests/cost-detail-pdf.test.mjs`.
  - `HARDENING.md`.
- Cambios UX/UI:
  - Los tres cargos condicionales se muestran siempre en Miami Maritimo LCL.
    Cada opcion indica su tarifa activa y solo puede marcarse con monto mayor a
    cero; sin cliente o tarifa muestra el motivo y permanece deshabilitada.
  - La configuracion de codigos y campos queda centralizada para que la interfaz
    y la generacion de `pricing_items` no diverjan.
  - El detalle de costos usa LETTER horizontal y aumenta tipografia de tabla,
    encabezados, datos del embarque, notas y pie de pagina.
- SQL: no aplica; no se modificaron esquema, RLS ni datos remotos.
- Validaciones:
  - Pruebas dirigidas Miami/PDF: 4/4. Confirman disponibilidad solo con tarifa
    activa positiva, las tres opciones canonicas, LETTER horizontal, una pagina
    para el caso normal y paginacion para un detalle extenso.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 83/83 en la validacion final del lote.
  - `npm.cmd run build`: OK, 73/73 paginas.
  - ESLint dirigido: el helper y las pruebas nuevas no agregan hallazgos. Los
    dos componentes conservan 8 errores y 7 avisos preexistentes fuera de las
    lineas modificadas (`any`, props sin uso, comillas JSX y `alt` del renderer).
- Riesgos / pendientes:
  - Ejecutar UAT visual en claro/oscuro y movil con cliente sin tarifas, con
    tarifas parciales y con las tres tarifas configuradas.
  - Revisar una impresion fisica o vista previa del detalle de costos; la prueba
    automatizada valida orientacion y paginacion, no percepcion visual.
- Commit: incluido en este commit.

### 2026-09-17 - FLOW-028 - Carrier seleccionado en Shipping Instructions

- Estado: implementado, validado, migrado y reparado en Production; UAT
  autenticado pendiente.
- Hallazgo:
  - La cotizacion `SARIHN-2609-0266-AP` tiene seleccionada la tarifa de APS
    EXPRESS con Maersk (`MSK`), pero su Shipping Instruction `RT0032` conserva
    `COSCO`. El booking canonico ya refleja `MSK`.
  - El RPC canonico de repricing sincronizaba agente, contacto y correo hacia
    la Shipping Instruction, y el carrier hacia bookings elegibles, pero omitia
    actualizar `shipping_instructions.carrier`. Por eso la sincronizacion manual
    podia reportar `MSK` sin corregir el carrier visible de la SI.
- Archivos:
  - `supabase/migrations/20260917120000_shipping_instruction_carrier_sync.sql`.
  - `supabase/migrations/20260917123000_repair_rt0032_carrier.sql`.
  - `supabase/tests/booking_canonical_consumers.sql`.
  - `HARDENING.md`.
- SQL:
  - Se conserva la implementacion vigente del RPC como funcion interna y se
    envuelve la sincronizacion canonica para propagar a la SI el carrier no
    vacio devuelto por la tarifa seleccionada.
  - La migracion incluye una reparacion idempotente y auditada para `RT0032`,
    limitada al caso COSCO -> MSK/Maersk de la cotizacion afectada.
  - Como `RT0032` es una referencia visible que no esta persistida en
    `shipping_instructions.reference_number`, la primera condicion no encontro
    la fila y no escribio datos. Una segunda migracion usa el UUID canonico
    comprobado, manteniendo las mismas guardas de cotizacion y carrier.
  - La correccion no modifica campos operativos legacy ni fuerza cambios sobre
    bookings confirmados. Las funciones internas mantienen ejecucion revocada
    para `public`, `anon` y `authenticated`.
- Validaciones:
  - `supabase migration up --local`: migracion aplicada en Docker local.
  - `booking_canonical_consumers.sql`: OK. Verifica carrier canonico en SI,
    preservacion de bookings confirmados y permisos de funciones internas.
  - `npx.cmd supabase db lint --local --level error`: sin errores de esquema.
  - `npx.cmd supabase migration list --local`: historial local alineado hasta
    `20260917120000`.
  - `npx.cmd supabase db push --linked --dry-run`: Production propone solo
    `20260917120000_shipping_instruction_carrier_sync.sql`; no se escribieron
    datos ni esquema remoto.
  - `npx.cmd supabase db push --linked --yes`: aplico
    `20260917120000_shipping_instruction_carrier_sync.sql` en Production.
  - Lectura REST posterior: el RPC quedo publicado; la SI seguia en `COSCO` y
    `reference_number` era `NULL`, confirmando por que el primer backfill seguro
    no actuo.
  - `npx.cmd supabase migration up --local`: aplico
    `20260917123000_repair_rt0032_carrier.sql` sin errores.
  - `npx.cmd supabase db push --linked --yes`: aplico
    `20260917123000_repair_rt0032_carrier.sql` en Production.
  - Lectura REST posterior: la SI `62909f82-241e-462b-90f0-f6e89421f4db`
    muestra `carrier = MSK`; sus tres bookings permanecen en `MSK` y conservan
    sus timestamps previos. La auditoria registra `COSCO -> MSK`, la tarifa
    seleccionada `c05d6f8b-0b05-4b26-a3c4-a864a536df9b` y la migracion
    correctiva.
  - `npm.cmd test`: 78/78.
  - `npx.cmd tsc --noEmit`: OK.
- Riesgos / pendientes:
  - Confirmar mediante UAT autenticado que la SI muestra Maersk en la interfaz.
    La verificacion directa certifica los datos y la auditoria, pero no sustituye
    la revision visual con una sesion operativa.
- Commits: implementacion `0f28d10`; reparacion puntual `95a8d5b`; registro de
  publicacion en commit documental posterior.

### 2026-09-16 - FLOW-027 / SEC-025 / PERF-006 - Workflow y bandeja de Shipping Instructions

- Estado: implementado, validado, migrado y publicado en Production; UAT
  autenticado pendiente.
- Hallazgos:
  - La bandeja descargaba todas las SI autorizadas, sus relaciones y bookings
    para filtrar, contar y paginar en el navegador. Esto aumentaba el costo de
    lectura y podia producir una experiencia lenta a medida que crecieran las
    operaciones.
  - Ventas y Pricing podian pasar la politica RLS de `UPDATE` de una SI y enviar
    columnas fuera de su formulario mediante una llamada directa. Validar,
    asignar y cancelar ejecutaban escrituras y auditoria separadas, sin bloqueo
    de fila ni control de version.
  - El guardado operativo tampoco detectaba una pestaña desactualizada. Asignar
    podia regresar una SI ya validada al estado `Asignado`, y cancelar no cerraba
    el shipment canonico en la misma transaccion.
- Archivos:
  - `supabase/migrations/20260916120000_shipping_instruction_workflow_hardening.sql`.
  - `supabase/tests/shipping_instruction_workflow_hardening.sql`.
  - `src/app/(protected)/operations/shipping-instructions/page.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`.
  - `HARDENING.md`.
- SQL:
  - `list_shipping_instructions` resuelve permisos, busqueda literal, estado
    agregado de bookings, filtros, conteos y paginas de 25/50/100 en servidor.
  - RPC atomicas y con `FOR UPDATE`/`updated_at` para guardar informacion inicial
    de Ventas, guardar detalles operativos, validar, asignar y cancelar.
  - `can_update_shipping_instruction` deja la edicion directa solo a Admin y
    Operaciones; Ventas usa una lista explicita de campos antes de enviar la SI.
  - Cancelar sincroniza SI y shipment, y registra actividad/evento operativo en
    la misma transaccion. Asignar sincroniza `shipments.assigned_to` sin degradar
    un estado avanzado.
- Cambios UX/UI:
  - Busqueda con espera de 300 ms y descarte de respuestas obsoletas; filtros,
    metricas y paginacion conservan la misma interfaz pero ahora reflejan el
    resultado calculado por la base.
  - Los errores de concurrencia explican que la SI cambio en otra sesion y piden
    recargar, evitando que un guardado silencioso sobrescriba trabajo reciente.
  - La respuesta canonica de cada accion actualiza la pantalla; se eliminaron
    escrituras y logs duplicados desde el cliente. Las instrucciones especiales
    que Ventas podia editar ahora tambien se persisten en su guardado inicial.
- Validaciones:
  - Prueba SQL transaccional local: OK. Cubre RLS directo, listas de campos,
    propietario de Ventas, envio unico, versiones obsoletas, guardado operativo,
    validacion, asignacion y sincronizacion, cancelacion atomica/auditoria,
    bloqueo con bookings, paginacion, busqueda escapada, filtros y alcance RLS.
  - `npx.cmd supabase db lint --local --level error`: sin errores de esquema.
  - Historial local reconciliado: se comprobaron columna, default, constraint,
    comentario y uso de `mbl_quantity`; despues se marco solo `20260908150000`
    como aplicada. `supabase migration up --local` aplico y registro
    `20260914233000` y `20260916120000`; `migration list --local` quedo alineado.
  - `npx.cmd supabase db push --linked --dry-run`: Production propone unicamente
    `20260916120000_shipping_instruction_workflow_hardening.sql`.
  - `npm.cmd test`: 78/78.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 paginas.
  - ESLint dirigido de la bandeja: sin hallazgos. El detalle conserva 8 errores
    y 4 avisos preexistentes; este ajuste no agrega nuevas infracciones.
- Riesgos / pendientes:
  - Ejecutar UAT con cuentas Ventas, Operaciones y Admin. La prueba SQL local
    certifica RLS y transacciones, pero no sustituye una sesion real desplegada.
  - Revisar visualmente busqueda rapida, cambio de filtros/pagina y conflictos
    entre dos sesiones. Las notificaciones internas ocurren despues de la
    transaccion principal y su fallo no revierte una transicion ya confirmada.
- Publicacion (16/09/2026):
  - `npx.cmd supabase db push --linked --yes`: aplico unicamente
    `20260916120000_shipping_instruction_workflow_hardening.sql` en Production.
    `migration list --linked` quedo alineado y el dry-run posterior confirma
    `Remote database is up to date`.
  - Implementacion `96b2108c4e77655b311ca5a27cd84bba2b8f2021` publicada en
    `origin/main`. GitHub Production `6491672404` y Vercel
    `78CgmcqV6JXfQ8uRCX84GPaVt1FK` reportan `success / Deployment has completed`.
  - URL del deployment:
    `https://sarierp-kd3ux1t4w-claudherhn-5641s-projects.vercel.app`.
  - GET sin sesion en `https://forwarders.app`: `/login` responde 200;
    `/pricing-comparison`, `/operations/shipping-instructions` y
    `/quotations/new` responden 307 al login conservando la ruta de retorno.
    No se crearon ni modificaron datos comerciales durante esta comprobacion.
- Commit de implementacion: `96b2108`. Registro de publicacion en commit
  documental posterior.

### 2026-09-16 - CALC-008 / FLOW-026 / UX-058 - Pricing, editor y bandeja de Shipping Instructions

- Estado: implementado, validado y publicado en Production; UAT autenticado
  pendiente.
- Hallazgos:
  - Pricing podia mostrar temporalmente cargos y tarifas de la cotizacion previa
    mientras cargaba otra seleccion, y respuestas tardias podian reemplazar el
    estado de una seleccion mas reciente.
  - La tabla recalculaba ISV historico con la tasa corporativa actual mientras
    mostraba el total persistido; el seguro guardaba `tax_rate = 15` aunque la
    configuracion usada para el importe fuera distinta.
  - La bandeja de Shipping Instructions ofrecía etiquetas de filtro que no
    coincidían con los estados mostrados y dependia del estado legacy de la SI,
    sin considerar sus bookings.
  - El editor terminaba su carga al recibir solo la cabecera y su accion Cancelar
    evitaba el guard de cambios sin guardar.
  - El editor, Pricing y el detalle de SI eran paginas extensas sin navegacion
    interna. La bandeja dependia de filas clicables con mouse, no identificaba
    sus filtros y no permitia recuperarse de un error sin recargar la pagina.
    Sus fechas tampoco seguian el formato estandar DD/MM/YYYY del ERP.
- Archivos:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/page.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`.
  - `src/components/ui/SectionNav.tsx`.
  - `src/lib/tax.ts`, `src/lib/operation-status.ts`.
  - `tests/tax-and-documents.test.mjs`, `tests/operation-status.test.mjs`.
  - `HARDENING.md`.
- SQL: no aplica; no se modificaron esquema, funciones, RLS ni datos remotos.
- Cambios:
  - El cambio de cotizacion limpia el workspace dependiente, bloquea acciones
    mientras carga, consulta tarifas/cargos/opciones/contenedores/carga en
    paralelo y descarta respuestas cuyo ID ya no sea el seleccionado. Se retiro
    la segunda carga automatica de tarifas Miami.
  - ISV y total conservan `tax_amount`, `tax_rate` y `total_amount` persistidos;
    solo registros legacy sin esos valores usan la tasa corporativa actual. El
    seguro persiste la misma tasa con la que calcula el importe.
  - Shipping Instructions excluye eliminados, solicita solo columnas necesarias,
    agrega el estado de bookings y comparte etiquetas canonicas de filtro. La
    tabla extensa de Pricing tiene desplazamiento propio en pantallas angostas.
  - El editor espera cabecera, catalogos, cliente, contenedores, carga y Pricing;
    separa error de carga con reintento y Cancelar pasa por el guard existente.
  - Las tres paginas largas comparten navegacion interna fija, desplazamiento
    accesible y destinos con margen para el topbar. Bandeja y bookings exponen
    encabezados semanticos, regiones desplazables y enlaces operables por
    teclado; la bandeja agrega etiquetas, Actualizar, Reintentar, limpiar filtros
    y evita una pagina vacia cuando cambia el total.
  - Las fechas de bandeja y detalle de SI reutilizan `formatDate`, conservando
    columnas DATE y el formato DD/MM/YYYY.
- Validaciones:
  - `npm.cmd test`: 78/78, incluidas tres regresiones nuevas para impuesto
    historico, tasa cero, etiquetas y agregado de bookings.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 paginas.
  - ESLint dirigido: `SectionNav`, helpers y pruebas sin hallazgos. Se conserva
    deuda previa en las cuatro paginas; frente a HEAD baja de 58 errores/16
    avisos a 49/12, sin desactivar reglas ni agregar hallazgos en el detalle SI.
  - `git diff --check`: OK; solo avisos esperados de LF/CRLF.
- Riesgos / pendientes:
  - UAT autenticado: alternar cotizaciones con respuestas lentas, editar/aprobar,
    validar totales con tasas historicas 0%, 12% y default, probar filtros de SI
    con multiples bookings y confirmar Cancelar en el editor.
  - La paginacion en servidor, la restriccion de escritura de Ventas y las
    transiciones atomicas quedaron implementadas y probadas localmente en
    `FLOW-027 / SEC-025 / PERF-006`; el despliegue esta completo y falta UAT.
  - Falta revision visual autenticada de la navegacion fija, foco y tablas en
    movil. La comprobacion postdeploy fue publica y sin escrituras comerciales.
- Commit de implementacion: `96b2108`. Evidencia de publicacion registrada en
  `FLOW-027 / SEC-025 / PERF-006`.

### 2026-09-16 — COST-001 — Detalle y conciliación de costos operativos

- Estado: implementado, validado localmente y publicado en producción;
  UAT autenticado y verificación de permisos desplegados pendientes.
- Hallazgo: sin facturas, Validación mostraba todo el ingreso como “Profit Real”
  y el presupuesto faltante como ahorro. Emparejaba facturas por descripción,
  mezclaba monedas bajo USD y no explicaba el promedio por contenedor.
- Archivos:
  - `src/lib/cost-analysis.ts`, `src/lib/cost-validation-data.ts`.
  - `src/components/pricing/CostAnalysisPanel.tsx`.
  - `src/app/(protected)/cost-validation/page.tsx` y `[id]/page.tsx`.
  - `src/app/(protected)/quotations/[id]/page.tsx`.
  - `src/components/pdf/cost-detail-pdf.tsx`.
  - `tests/cost-analysis.test.mjs`, `tests/cost-analysis-panel.test.mjs`,
    `tests/cost-validation-data.test.mjs`, `tests/cost-detail-pdf.test.mjs`.
- SQL: no aplica; reutiliza `provider_invoice_items.pricing_item_id`, RLS y el
  trigger existente de invalidación financiera. La reasignación incluye la
  descripción sin modificarla para activar ese trigger en la misma escritura.
- Cambios:
  - Costos ausentes quedan pendientes, cero registrado sigue siendo válido;
    utilidad con registros siempre provisional hasta validación y conciliación.
    Facturas parciales no producen un ahorro ni cierre automático.
  - Comparación por ID de cargo y moneda; registros legacy/adicionales quedan
    sin vínculo hasta revisión explícita. Una factura puede cubrir parte de un
    cargo y un cargo puede recibir varias facturas. Formularios con etiquetas,
    verificación de moneda y cantidades, guardado con bloqueo de doble clic.
  - Monedas separadas e impuestos de proveedor separados de la base. La utilidad
    se identifica como comparación sin impuestos; no determina crédito fiscal,
    pagos ni utilidad contable definitiva. Impuesto solo si se selecciona aplicar.
  - Lectura paginada de Pricing/facturas, eliminación lógica excluida, permiso
    de lectura comprobado antes de interpretar un resultado vacío, errores
    bloqueantes con reintento y resultados obsoletos descartados por sesión/ruta.
  - Promedios sobre contenedores canónicos, pérdidas por concepto y desglose
    marítimo/Profit Share/MBL solo cuando coincide con el flete guardado. Panel
    en Tarifas y costos limitado al permiso interno existente Admin/Pricing.
  - PDF interno identifica Pricing actual, promedio, desglose y pérdidas; permite
    paginación de detalles extensos. No modifica PDF comercial ni opciones.
  - Opción aceptada visible como referencia histórica independiente; Pricing
    actual identificado, con aviso de repricing. Listado conserva operaciones
    cuya cotización se reabrió; validar sigue requiriendo Ganada.
- Validaciones:
  - `npm.cmd test`: 75/75; incluye ausencia de facturas, parciales, monedas,
    vínculos por ID, cero válido, líneas eliminadas, errores/paginación y permisos.
    Caso de referencia: costo 95,200, promedio 9,520 y DTHC con pérdida 300.
  - Render estático del panel; PDF normal de una página y PDF de 100 cargos
    paginado, con logo en memoria y sin solicitudes a producción.
  - `npx.cmd tsc --noEmit`: OK tras el último cambio de código.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint de helpers, panel, detalle de validación y pruebas: sin hallazgos.
    Comparación con HEAD: listado mantiene 3 errores previos, cotización 6 y
    PDF 6 errores/1 aviso previos; sin desactivaciones de reglas.
  - `git diff --check`: OK.
- Riesgos / pendientes:
  - UAT con cuentas Admin/Finanzas/Contabilidad: alta parcial, reasignación,
    eliminación, invalidación, cierre y factura; confirmar RLS desplegado. El
    permiso existente puede denegar Finanzas o cotizaciones en repricing; se
    muestra el bloqueo, sin ampliar permisos ni tratarlo como costo cero.
  - La validación de completitud es revisión humana: no existe estado individual
    de cierre de cargo. El guard adicional de conciliación en UI no sustituye la
    autorización ni constituye un nuevo constraint de cierre en servidor.
  - Sin asignación física por BL/contenedor, proyección de facturas parciales,
    conversión de monedas ni modificación de snapshots aceptados. Nuevos cargos
    sin presupuesto requieren conciliación con Pricing antes de cerrar por UI.
  - Render estático de UI y PDFs probado; falta revisión visual móvil/oscuro y
    prueba autenticada en navegador. No hubo escrituras comerciales remotas.
- Publicación (16/09/2026): commit `97d3d2a884ee760f515243676713fe3ded00eea4`
  enviado a `origin/main`. GitHub Production `6486521154` y Vercel
  `7P8urUJk787NmLPttQvpnBpB5PE8` confirman `success / Deployment has completed`.
  - URL del deployment:
    `https://sarierp-13se44l39-claudherhn-5641s-projects.vercel.app`.
  - GET en `https://forwarders.app`: `/login` devuelve 200;
    `/cost-validation` y `/quotations/efc8766f-867c-4d8a-b865-e9a7cc82341f`
    devuelven 307 al login con retorno a la ruta solicitada. Sin sesiones,
    escrituras de datos ni cambios SQL. Esto no certifica el flujo autenticado.
- Commit de implementación: `97d3d2a`. Registro de publicación en commit
  documental posterior. Se conservan todos los pendientes de UAT/RLS anteriores.

Este archivo es el registro versionado del plan de correcciones del ERP.
Debe actualizarse en el mismo commit de cada fix para que el estado viaje con
Git entre computadoras y ambientes.

### 2026-09-08 - CALC-007 - Cantidad de MBL y aplicación de costo FCL

- Estado: Implementado, validado localmente, migrado y desplegado en Producción; UAT pendiente.
- Hallazgo: CALC-007. El costo base sumaba un solo importe de MBL. Al volver a
  seleccionar una tarifa se reemplazaban las líneas de venta existentes.
- Archivos:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/components/pricing/FclAgentComparisonTable.tsx`.
  - `src/lib/agent-mbl-cost.ts`.
  - `tests/agent-mbl-cost.test.mjs`.
  - `supabase/tests/agent_quote_mbl_quantity.sql`.
- SQL: `supabase/migrations/20260908150000_agent_quote_mbl_quantity.sql`.
- Cambios:
  - `agent_quotes.mbl_quantity`: entero positivo, obligatorio, default 1.
    El importe unitario del catálogo de agentes no cambia. Cada tarifa conserva
    su cantidad; guardar, editar, Cards y Tabla usan el total de documentación.
  - El total MBL se prorratea entre los contenedores canónicos. Los overrides
    de Tabla siguen siendo totales y se descartan si su cantidad/costo fuente
    quedó obsoleto; los ajustes legacy de un MBL conservan compatibilidad.
  - La RPC atómica existente conserva IDs, precios de venta, cantidades,
    impuestos, notas y cargos adicionales cuando aplica costos FCL existentes.
    Coincidencias ambiguas, cambios de moneda/cantidad/composición EXW y
    cotizaciones bloqueadas se rechazan sin escrituras parciales.
  - Botón «Aplicar costo» para volver a aplicar la tarifa seleccionada.
    Guardar una tarifa por sí solo no modifica las líneas comerciales.
  - Se mantienen la selección única, la auditoría y los snapshots comerciales.
    La primera selección y el reemplazo de modalidades no FCL conservan su flujo.
- Validaciones ejecutadas:
  - `npm.cmd test`: 29 pruebas exitosas.
  - `npx.cmd tsc --noEmit` y `npm.cmd run build`: exitosos.
  - SQL local: migración aplicada; pruebas `agent_quote_mbl_quantity.sql` y
    `phase5_atomic_agent_selection.sql` exitosas, con rollback de fixtures.
  - RLS local: Pricing guarda cantidad; Cliente no puede cambiarla ni ejecutar
    la selección; anon sin permiso RPC. Políticas remotas revisadas, sin cambios.
  - SQL local verifica 10 × 40HC, 3 MBL × USD 50.00, costo USD 8,601.00,
    venta USD 9,365.00 intacta, destino intacto y opción ofrecida congelada.
  - ESLint dirigido comparado con HEAD: mismos hallazgos previos; helpers y
    pruebas nuevos sin hallazgos. `git diff --check` exitoso.
  - Dry-run remoto: únicamente esta migración pendiente.
  - Migración `20260908150000` aplicada y registrada en Producción. Verificados
    tipo integer, NOT NULL, default 1, check positivo, RLS activo, RPC autenticada
    y anon sin ejecución. Las tarifas existentes mantienen cantidad 1.
  - Vercel confirmó `success / Deployment has completed` para `98ad579` el
    08/09/2026; interfaz publicada desde `origin/main`.
- Riesgos / acciones pendientes:
  - UAT autenticado de Cards/Tabla, móvil, guardado/recarga y aplicación del
    costo; no se dispuso de navegador para verificación visual.
  - En `SARIHN-2609-0266-AP`, configurar 3 MBL en la tarifa MSK y aplicar su
    costo. La consulta previa encontró COSCO seleccionada con flete a costo MSK.
    No se modificaron los datos comerciales de esta cotización desde scripts.
  - Líneas renombradas, carga o moneda distinta requieren revisión explícita;
    la aplicación de costos no adivina correspondencias ni agrega/elimina cargos.
- Commit de implementación: `98ad579`.

### 2026-09-08 - UX-057 - Última conexión de usuarios

- Estado: Implementado, validado localmente y desplegado en Producción; UAT pendiente.
- Hallazgo: UX-057. El perfil y Administración de usuarios no mostraban la fecha
  del último inicio de sesión disponible en Supabase Auth.
- Archivos:
  - `src/app/(protected)/profile/page.tsx`.
  - `src/app/(protected)/admin/users/page.tsx`.
  - `src/app/api/admin/users/last-sign-in/route.ts`.
  - `tests/user-last-sign-in.test.mjs`.
- SQL: No aplica; sin cambios de esquema, políticas RLS ni escrituras en Auth.
- Cambios:
  - Fecha y hora local del último inicio de sesión en Mi perfil y columna en
    Administración, reutilizando `formatDateTime` y `last_sign_in_at` de Auth.
  - Consulta administrativa paginada desde servidor, sin caché, con sesión
    validada y perfil Admin/Aprobado/activo. Solo devuelve ID y fecha.
  - Diferencia entre ausencia de registro y consulta fallida, con reintento.
- Validaciones ejecutadas:
  - `npm.cmd test`: 26 pruebas exitosas; incluye permisos, paginación,
    exclusión de metadata privada, ausencia de registro y fallos del proveedor.
  - `npx.cmd tsc --noEmit`: exitoso.
  - `npm.cmd run build`: exitoso, incluida la nueva ruta administrativa.
  - ESLint dirigido: sin hallazgos nuevos; conserva un error previo de
    `react-hooks/set-state-in-effect` y un warning de `no-img-element` en perfil.
  - `git diff --check`: exitoso.
  - GitHub/Vercel: deployment `6335900546`, ambiente `Production`, commit
    `e233ea37e9f1f3b51bd4f472f809e975057de615`, completado exitosamente el
    08/09/2026.
- Riesgos / acciones pendientes:
  - UAT autenticado: revisar ambas pantallas, fecha/hora, usuario sin registro,
    acceso denegado por rol y recuperación tras fallo de red; comprobar móvil.
  - No hubo navegador disponible; la UI se revisó en código y los controles de
    servidor se probaron con dependencias simuladas, sin certificar RLS remoto.
  - La consulta administrativa requiere `SUPABASE_SERVICE_ROLE_KEY` en servidor,
    ya utilizada por invitaciones. Verificarla en el ambiente de despliegue.
  - El dato representa último inicio de sesión, no presencia ni última actividad
    de una sesión persistente. Se consulta al cargar/refrescar la lista.
- Commit de implementación: `e233ea3`; enviado a `origin/main` y desplegado.

### 2026-09-02 - INS-027 - Tasa excepcional de costo de seguro por cotización

- Estado: Implementado, migrado y validado; pendiente de UAT y deployment de
  la interfaz en Producción.
- Hallazgo: INS-027.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/components/quotations/InsuranceCalculationDialog.tsx`.
- SQL:
  - `supabase/migrations/20260902120000_quotation_insurance_cost_rate.sql`.
- Cambios:
  - Pricing puede ajustar la tasa de costo de la aseguradora al aplicar el
    seguro, sin modificar el porcentaje comercial configurado para el cliente.
  - La tasa corporativa continúa siendo el valor predeterminado; una tasa
    excepcional se guarda en la cotización y se reutiliza al recalcular o
    consultar el detalle histórico.
  - Se valida que la tasa sea mayor que 0% y no exceda 5%, tanto en la interfaz
    como en la base de datos.
- Validaciones ejecutadas:
  - `npx.cmd next typegen` exitoso.
  - `npx.cmd tsc --noEmit` exitoso.
  - Migración `20260902120000` aplicada y registrada en la base remota.
  - Columna remota verificada como `numeric(7,4)` nullable.
  - ESLint dirigido ejecutado; conserva deuda previa del módulo (`any`, estados
    dentro de efectos y variables no usadas), sin errores nuevos del cambio.
- Riesgos o trabajo pendiente:
  - Validar en UAT un caso con costo 0.33% y venta 0.40%, confirmando línea de
    pricing, margen y detalle para aseguradora.
- Commit: `4365234`.

### 2026-08-14 - UX-056 - Recorrido visual real en la landing

- Estado: Implementado y validado localmente; pendiente de UAT y deployment en
  Producción.
- Hallazgo: UX-056.
- Código y assets:
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `public/product/dashboard-comercial.webp`.
  - `public/product/cotizacion-rentabilidad.webp`.
  - `public/product/booking-bl.webp`.
  - `public/product/inventario-miami.webp`.
  - `public/product/dashboard-financiero.webp`.
  - `public/product/portal-tracking.webp`.
- SQL: No aplica.
- Cambios:
  - La landing incorpora un recorrido por pestañas con vistas reales del
    dashboard comercial, cotización, booking/BL, bodega Miami, finanzas y
    portal del cliente.
  - Sólo se publican capturas del ambiente Demo con nombres, correos,
    identificadores y montos ficticios. Se excluyeron las capturas de
    Producción por contener datos operativos o personales y las vistas vacías
    que no explicaban el valor del producto.
  - Las seis imágenes se normalizaron a WebP de 1920 x 1080; el conjunto pesa
    menos de 0.5 MB y se sirve mediante `next/image` con dimensiones estables.
  - La navegación principal y el footer enlazan directamente al nuevo
    recorrido; los controles usan semántica accesible `tab`/`tabpanel`.
  - La imagen comparativa de Excel también pasó a `next/image`, eliminando el
    warning de rendimiento de la landing.
- Validaciones ejecutadas:
  - Guía local de Next.js 16 sobre optimización de imágenes: revisada.
  - Inspección visual de las capturas fuente y de los WebP finales: OK.
  - `npx.cmd next typegen`: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a la landing: OK.
  - Revisión headless en Chrome a 1440 x 1200 y 390 x 844: OK; pestañas
    desplazables en móvil, imagen estable y sin desborde horizontal de página.
  - `git diff --check`: OK; sólo aviso esperado LF/CRLF.
- Riesgos o pendientes:
  - En pantallas móviles las capturas conservan el contexto completo, por lo
    que los textos internos se leen mejor al ampliar; la leyenda exterior
    comunica el contenido sin depender de ese texto.
  - Pendiente desplegar la rama `main` y verificar la landing pública en
    `https://forwarders.app`.
- Commit: incluido en este commit.

### 2026-08-10 - UX-053 - Capturas en la creación de tickets

- Estado: Implementado y validado localmente; pendiente de UAT en Producción.
- Hallazgo: UX-053.
- Código:
  - `src/app/(protected)/support/new/page.tsx`.
  - `src/app/(protected)/support/[id]/page.tsx`.
  - `src/lib/support-attachments.ts`.
  - `docs/support-ticketing-runbook.md`.
- SQL: No aplica. Se reutilizan la tabla, RLS y el bucket privado
  `support-attachments` creados por SEC-024.
- Cambio:
  - El formulario Nuevo ticket permite seleccionar hasta cinco capturas o
    archivos PNG, JPG o PDF de máximo 10 MB cada uno.
  - Los archivos seleccionados muestran nombre y tamaño y pueden quitarse
    antes de crear el ticket.
  - Las capturas quedan asociadas al mensaje inicial y usan paths privados por
    ticket y usuario, igual que los adjuntos de las respuestas.
  - La validación, subida, registro de metadata y limpieza de objetos fallidos
    se centralizaron para evitar diferencias entre creación y conversación.
  - Si un adjunto falla después de crear el ticket, el caso se conserva y la
    interfaz informa la cantidad de archivos no cargados.
- Validaciones ejecutadas:
  - Guías locales de Next.js 16 sobre Client Components y seguridad de datos:
    revisadas.
  - `npm run build`: OK, 70/70 rutas.
  - `npx tsc --noEmit`: OK después de regenerar los tipos de la rama.
  - ESLint dirigido a los tres archivos funcionales: OK.
  - `git diff --check`: OK; sólo avisos esperados LF/CRLF.
- Riesgos o pendientes:
  - Pendiente confirmar en UAT la selección, subida, descarga firmada y vista
    móvil con capturas reales.
  - El MVP mantiene allowlist MIME, límite, bucket privado y RLS, pero no
    incorpora todavía análisis antimalware.
- Commit: incluido en este commit.

### 2026-08-10 - SEC-024 - Mesa de ayuda técnica aislada por instalación

- Estado: Implementado, desplegado y habilitado en Producción. Pendiente de UAT
  funcional y de que `dher@forwarders.app` complete su invitación.
- Hallazgo: SEC-024.
- Alcance:
  - Cada instalación conserva sus propios tickets, mensajes y adjuntos. No se
    introdujo una base central ni acceso cruzado entre proyectos de clientes.
  - El canal es exclusivo para usuarios internos aprobados del ERP y Hernova
    Systems. Los perfiles `Cliente` del portal de carga quedan excluidos.
- Código:
  - `src/app/(protected)/support/layout.tsx`.
  - `src/app/(protected)/support/page.tsx`.
  - `src/app/(protected)/support/new/page.tsx`.
  - `src/app/(protected)/support/[id]/page.tsx`.
  - `src/app/api/support/notify/route.ts`.
  - `src/lib/support.ts`.
  - `src/components/layout/sidebar.tsx`.
  - `src/lib/permissions.ts`.
  - `src/types/index.ts`.
  - `src/proxy.ts`.
  - `src/app/login/page.tsx`.
  - `docs/support-ticketing-runbook.md`.
- SQL:
  - `supabase/migrations/20260810170000_support_ticketing_foundation.sql`.
- Pruebas:
  - `supabase/tests/support_ticketing_foundation.sql`.
- Cambios de seguridad e integridad:
  - `profiles.is_platform_admin` distingue a Hernova de los administradores de
    la empresa cliente. Un trigger impide autoconceder o modificar ese acceso
    desde una sesión autenticada; sólo una operación confiable sin JWT de
    usuario puede configurarlo.
  - La numeración usa una secuencia PostgreSQL y un prefijo configurable por
    instalación, evitando la carrera de `max + 1`.
  - El módulo queda deshabilitado por defecto. Cada instalación debe configurar
    prefijo, buzón y cuenta Hernova antes de abrirlo explícitamente.
  - Tickets y mensajes se crean mediante RPC con validación de rol y entrada.
    Sólo el Administrador Supremo cambia estado, prioridad o responsable.
  - Las notas internas se filtran por RLS y sólo son visibles para perfiles de
    plataforma. Los eventos administrativos son append-only para usuarios.
  - `support-attachments` es privado, limita PDF/PNG/JPEG a 10 MB y exige que
    el path pertenezca al ticket y al usuario autenticado. Las descargas usan
    URL firmada de 60 segundos.
  - El endpoint de Resend vuelve a autenticar y autorizar al emisor, bloquea
    Demo, conserva idempotencia y registra intentos, errores y `message_id` en
    `support_notification_outbox`. Una falla de correo no revierte el ticket.
  - Proxy y login interno conservan un destino local autorizado, permitiendo
    abrir el ticket exacto después de iniciar sesión sin admitir open redirect.
- Validaciones ejecutadas:
  - Guías locales de Next.js 16 sobre Route Handlers y seguridad de datos
    revisadas antes de implementar.
  - Migración ejecutada en Supabase Docker local con transacción y
    `ON_ERROR_STOP=1`: OK.
  - Prueba SQL transaccional: OK. Confirmó exclusión de `Cliente`, bloqueo de
    autoelevación, numeración, permisos de administración, primera respuesta,
    historial y ocultamiento de notas internas.
  - `npx supabase db lint --local --level error`: OK, cero errores de esquema.
  - `npx tsc --noEmit`: OK al cierre.
  - `npm run build`: OK; 70/70 páginas generadas y el Route Handler de
    notificaciones quedó dinámico.
  - ESLint dirigido a todos los archivos nuevos y al retorno del login: OK.
  - El lint global conserva 391 hallazgos preexistentes, incluidos temporales
    dentro de `.ua`; no forman parte de SEC-024.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Reenvío externo de `soporte@forwarders.app` mediante ImprovMX: confirmado.
  - Demo: migración aplicada, deployment Vercel `Ready` y módulo habilitado
    temporalmente para UAT.
  - Producción: dry-run mostró únicamente
    `20260810170000_support_ticketing_foundation.sql`; migración aplicada sin
    incluir las cuatro migraciones exclusivas de Demo.
  - Deployment productivo de Vercel: `Ready`, asociado a `forwarders.app`.
  - `support_settings`: prefijo `SUP`, buzón `soporte@forwarders.app` y
    `enabled=true` verificados después de la transacción.
  - `admin@admin.com` y `dher@forwarders.app` quedaron como Admin aprobados,
    activos y `is_platform_admin=true`. La cuenta `admin@admin.com` ya estaba
    confirmada; a `dher@forwarders.app` se le envió invitación mediante
    Supabase Auth y Resend con retorno a `/onboarding`.
- Riesgos o trabajo pendiente:
  - El Supabase local registra las migraciones exclusivas de la rama `demo`
    `20260731190000`, `20260731213000`, `20260731214000` y `20260731215000`.
    Por diseño no existen en `main`: no copiarlas a Producción ni ejecutar
    `migration repair`. Cada push debe hacerse desde la rama enlazada al
    proyecto correcto; para pruebas locales conviene separar los worktrees.
  - `dher@forwarders.app` no podrá iniciar sesión hasta abrir la invitación y
    completar el onboarding; `admin@admin.com` queda disponible para el UAT
    inmediato de administración.
  - El conector visual del navegador no estuvo disponible en esta sesión;
    falta UAT de lista, creación, conversación, adjuntos, retorno post-login y
    diseño responsive en Demo.
  - No existe análisis antivirus de adjuntos. El MVP reduce riesgo mediante
    bucket privado, allowlist MIME, límite de tamaño y URLs firmadas; un
    escáner de malware queda como mejora futura.
- Commit de implementación: `88b0c6a`.

### 2026-08-10 - UX-052 - Hora Miami e historial de ingresos de bodega

- Estado: Implementado y validado localmente; pendiente de desplegar y ejecutar
  UAT en Producción.
- Hallazgo: UX-052.
- Causa raíz:
  - El portal mostraba sólo la fecha de `miami_packages.received_at`, aunque la
    base ya conserva el instante exacto de recepción.
  - Inventario ordenaba toda la carga por recepción, pero no permitía consultar
    un día o rango ni distinguir ingresos individuales de paquetes escaneados
    dentro de un manifiesto.
- Código:
  - `src/lib/format.ts`.
  - `src/app/portal/paquetes/page.tsx`.
  - `src/app/portal/paquetes/[id]/page.tsx`.
  - `src/app/(protected)/miami/inventario/page.tsx`.
  - `src/app/api/miami/package-assignment-email/route.ts`.
- SQL: ninguno; se reutilizan `received_at` y `manifest_id` existentes.
- Cambios:
  - La lista de paquetes, el seguimiento, la información del paquete y los
    movimientos muestran fecha y hora rotuladas como `hora Miami`.
  - El formato usa explícitamente `America/New_York`; no depende de la zona
    horaria del navegador del cliente y respeta automáticamente horario de
    verano de Miami.
  - Los correos nuevos de carga recibida incluyen también el instante de
    recepción en Miami.
  - Inventario agrega accesos `Hoy`, `Ayer`, `Últimos 7 días`, rango manual y
    filtro de origen `Ingreso individual`/`Por manifiesto`. Al consultar fechas
    se incluyen todos los estados actuales para que una carga ya avanzada o
    entregada no desaparezca del historial de lo recibido ese día.
  - La tabla identifica el origen y muestra la hora exacta de recepción.
  - No se crean manifiestos artificiales por cada ingreso individual. Un
    manifiesto sigue representando un lote real de un transportista; el
    historial operativo se obtiene de la tabla canónica de paquetes.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 67/67 páginas generadas.
  - ESLint dirigido: cero errores; conserva dos advertencias preexistentes de
    dependencias de efectos en las dos pantallas del portal de paquetes.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Riesgos o trabajo pendiente:
  - UAT con un ingreso individual y otro por manifiesto, verificando fecha/hora
    en correo, lista, seguimiento e Inventario para Hoy/Ayer/rango.
  - Inventario ya cargaba el conjunto completo antes de este cambio y los
    filtros nuevos operan sobre ese conjunto en cliente. Cuando el volumen sea
    alto convendrá mover filtros y paginación a la consulta de Supabase.
  - Un correo ya marcado `sent` conserva por idempotencia su plantilla original;
    la hora aparecerá en avisos nuevos.
- Commit: incluido en este commit.

### 2026-08-10 - UX-051 - Retorno al paquete después del login del portal

- Estado: Implementado y validado localmente; pendiente de desplegar y repetir
  la prueba autenticada en Producción.
- Hallazgo: UX-051.
- Causa raíz:
  - `src/proxy.ts` interceptaba la visita no autenticada antes de que el layout
    del portal pudiera guardar el destino y redirigía a `/portal/login`
    eliminando la ruta original.
  - El fragmento `#factura-comercial` no forma parte de la petición HTTP que
    recibe Proxy, por lo que no puede utilizarse por sí solo para transportar
    la sección solicitada a través del login.
- Código:
  - `src/proxy.ts`.
  - `src/app/api/miami/package-assignment-email/route.ts`.
  - `src/app/(protected)/miami/inventario/page.tsx`.
  - `src/app/portal/paquetes/[id]/page.tsx`.
- SQL: ninguno.
- Cambios:
  - Proxy conserva `pathname` y query de cualquier ruta protegida del portal
    en un parámetro `next` codificado antes de enviar al login.
  - El login mantiene su allowlist existente y sólo acepta destinos locales
    bajo `/portal`; no se amplió la superficie de redirección.
  - Los correos nuevos y los enlaces copiados desde Inventario incluyen
    `?section=factura-comercial` además del ancla visual.
  - El detalle del paquete reconoce tanto la query nueva como el ancla para
    enfocar la sección de carga al terminar la autenticación.
- Validaciones ejecutadas:
  - Guía local de Proxy de Next.js 16 revisada antes del cambio.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 67/67 páginas generadas.
  - Prueba HTTP sobre el build local sin sesión: `/portal/paquetes/{id}` con
    `section=factura-comercial` responde `307` a `/portal/login` conservando
    exactamente el paquete y la query dentro de `next`.
  - ESLint dirigido: cero errores; conserva dos advertencias preexistentes de
    dependencias de efectos en las pantallas del portal de paquetes.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Riesgos o trabajo pendiente:
  - Desplegar el commit en Producción y repetir el flujo correo → login →
    paquete → sección de factura comercial con una sesión cerrada.
  - Los correos emitidos antes de este cambio no contienen la query de sección;
    Proxy sí conservará su paquete exacto, pero el desplazamiento automático
    queda garantizado para los enlaces nuevos.
- Commit: incluido en este commit.

### 2026-08-10 - SEC-023 - Factura comercial privada y aviso de carga Miami

- Estado: Aplicado y verificado en Producción; el defecto de retorno exacto
  posterior al login se corrige separadamente en UX-051.
- Hallazgo: SEC-023.
- Código:
  - `src/app/api/miami/package-assignment-email/route.ts`.
  - `src/lib/miami-assignment-email.ts`.
  - `src/app/(protected)/miami/ingreso/page.tsx`.
  - `src/app/(protected)/miami/inventario/page.tsx`.
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`.
  - `src/app/portal/layout.tsx`.
  - `src/app/portal/login/page.tsx`.
  - `src/app/portal/paquetes/[id]/page.tsx`.
- SQL:
  - `supabase/migrations/20260810120000_miami_commercial_invoice_upload.sql`.
- Cambio:
  - Al asignar o autoasignar un paquete Miami, el backend puede enviar por
    Resend un aviso exclusivamente a `clientes.email_1`, el correo principal.
  - El mensaje incluye tracking, WH y un enlace al paquete con ancla
    `#factura-comercial`. El portal conserva el destino al pedir login y sólo
    permite continuar a rutas locales bajo `/portal`.
  - El cliente puede adjuntar PDF, JPG o PNG de hasta 10 MB. Cada carga crea
    una versión auditable y no sobrescribe archivos anteriores.
  - El bucket `miami-package-documents` es privado. Las policies relacionan el
    primer segmento del path con `cliente_id` y el segundo con `package_id`;
    el cliente sólo accede a paquetes de su empresa y Administración u
    Operaciones conservan acceso operativo.
  - Inventario muestra si la factura está pendiente o recibida. Operaciones
    puede abrirla mediante URL firmada de 60 segundos y únicamente Admin ve
    las acciones para copiar el enlace autenticado, compartirlo manualmente y
    enviar/reintentar el aviso.
  - `client_email_deliveries` conserva destinatario, intentos, estado, error
    y `resend_message_id`. La combinación paquete/evento es única y la
    petición a Resend usa `Idempotency-Key`.
  - La asignación de carga no se revierte si el proveedor de correo falla; el
    personal recibe una advertencia y el fallo queda listo para reintento.
  - El endpoint exige usuario aprobado Admin/Operaciones, service role sólo
    en servidor, `OUTBOUND_EMAIL_ENABLED=true` y `RESEND_API_KEY`. Bloquea
    `APP_ENV=demo`, `NEXT_PUBLIC_APP_ENV=demo` y el sentinel privado
    `platform_environment` cuando existe en la base demo.
- Validaciones ejecutadas:
  - Guías locales de Next.js 16 sobre Route Handlers, variables de entorno y
    separación Server/Client revisadas antes de implementar.
  - La migración completa se ejecutó en Supabase Docker local con
    `psql --single-transaction -v ON_ERROR_STOP=1`: OK.
  - `npx supabase db lint --local --level error`: OK, cero errores.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 67 páginas generadas y el nuevo Route Handler quedó
    dinámico.
  - ESLint dirigido al endpoint, helper y flujo de retorno login/layout: OK.
  - El lint global continúa fallando por 392 hallazgos preexistentes, incluidos
    archivos temporales de `.ua`; no se introdujeron como parte de SEC-023.
- Riesgos o trabajo pendiente:
  - Completar el redeploy y la UAT de retorno post-login documentada en UX-051.
  - No se implementó análisis antivirus del contenido; se restringieron MIME,
    tamaño, bucket y ownership, pero un escáner de malware sigue siendo una
    mejora futura antes de aceptar formatos adicionales.
- Commit: `50f284b`.

### 2026-08-10 - SEC-022 - SMTP transaccional y redirecciones Auth de Producción

- Estado: Aplicado y verificado manualmente en Producción.
- Hallazgo: SEC-022.
- Código y SQL: No aplica; el cierre fue de configuración administrada en
  Resend, Vercel DNS y Supabase Auth.
- Configuración aplicada:
  - Resend verificó `mail.forwarders.app` en `us-east-1` para envío
    transaccional, con DKIM y SPF publicados mediante Vercel DNS.
  - Los MX y SPF de ImprovMX en `forwarders.app` permanecieron intactos para
    la recepción y el reenvío de correo.
  - Supabase Producción `fwspgdzvlbtbgiupvrzo` quedó conectado a Resend por
    SMTP con el remitente `Forwarders ERP <no-reply@mail.forwarders.app>`.
  - Auth Site URL quedó en `https://forwarders.app`; la allowlist conserva
    exclusivamente los callbacks productivos de recuperación y onboarding.
  - Se publicó `_dmarc.mail.forwarders.app` con
    `v=DMARC1; p=none;` como política inicial de monitoreo.
  - Se retiró `RESEND_API_KEY` de Vercel Preview. Como Vercel la había
    almacenado como una sola entrada compartida entre Preview y Production,
    la operación eliminó esa entrada completa. El ERP no tenía consumidores
    de la variable y Supabase conserva una credencial SMTP dedicada e
    independiente, por lo que no se afectó el envío verificado.
  - Se eliminó el archivo local no versionado `send-test.js`; no formaba parte
    de Next.js, dependía de `dotenv` sin instalar y contenía un destinatario de
    prueba hardcodeado.
- Validaciones ejecutadas:
  - Resend mostró `mail.forwarders.app` en estado `Verified` y `Ready to send`.
  - DNS autoritativo y los resolvers públicos `1.1.1.1`/`8.8.8.8`
    confirmaron el nuevo DMARC. DKIM y el SPF/MX de Amazon SES para
    `send.mail.forwarders.app` permanecen publicados; ImprovMX conservó sus
    dos MX y SPF en el dominio raíz.
  - Un correo real de recuperación llegó desde
    `no-reply@mail.forwarders.app`.
  - El primer enlace reveló que Supabase aún usaba `localhost:3000`; la causa
    se corrigió en URL Configuration y un enlace nuevo completó el callback
    PKCE hasta `/portal/reset-password`, donde se mostró el formulario de
    nueva contraseña.
  - El inventario sanitizado de Vercel confirmó cero entradas
    `RESEND_API_KEY` en Preview y Production después de la limpieza.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Riesgos o trabajo pendiente:
  - DMARC permanece en `p=none`; antes de elevarlo a `quarantine` o `reject`
    debe definirse un buzón de reportes y observar alineación SPF/DKIM.
  - Probar separadamente una invitación real y su llegada a `/onboarding`.
  - Producción conserva signup público y autoconfirmación de email; revisar
    esta decisión junto con el gate de aprobación de perfiles.
  - Cotizaciones, estados de cuenta y Draft HBL siguen usando `mailto:`. Una
    futura integración Resend API debe crear una clave nueva limitada sólo a
    Production, con autorización, idempotencia y auditoría de entrega.
- Commit: incluido en este commit de documentación.

### 2026-08-03 - SEC-021 - Eliminación segura de documentos de Booking

- Estado: Aplicado y verificado en Producción; pendiente de UAT manual.
- Hallazgo: SEC-021.
- Código:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`.
- SQL:
  - `supabase/migrations/20260803143000_booking_document_delete_permissions.sql`.
- Prueba:
  - `supabase/tests/booking_document_delete_permissions.sql`.
- Causa raíz:
  - Storage permitía eliminar a Admin y Operaciones, pero la policy DELETE de
    `booking_documents` sólo aceptaba Admin. Operaciones podía borrar el blob y
    fallar después al eliminar la metadata.
  - La UI borraba primero Storage. Un documento asociado a VGM usa una FK
    `ON DELETE RESTRICT`, por lo que PostgreSQL podía rechazar la fila después
    de que el archivo ya hubiera sido destruido.
- Cambios:
  - La policy DELETE queda alineada con carga, actualización y Storage:
    `can_manage_operations()` y acceso al booking.
  - La UI sólo muestra carga y eliminación a Admin u Operaciones; Ventas
    conserva lectura y descarga cuando es propietario de la SI.
  - La eliminación ocurre primero en base de datos y exige una fila retornada.
    Si RLS, una FK o una relación la bloquean, el archivo queda intacto.
  - Storage se limpia únicamente después del DELETE autorizado. Si esa limpieza
    falla, se informa al usuario y se registra el cleanup pendiente.
- Validaciones ejecutadas:
  - `supabase/tests/booking_document_delete_permissions.sql`: OK con transacción
    y `ROLLBACK`; Admin y Operaciones eliminaron una fila, mientras Ventas
    propietario, Ventas ajeno y Operaciones inactivo conservaron las suyas.
  - La migración se ejecutó dos veces dentro de la prueba y dejó una sola
    policy DELETE, confirmando idempotencia.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido de la pantalla de Booking: OK, cero hallazgos.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `npx supabase db lint --local --level error`: OK, cero errores de esquema.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Commits `d89d21a` y `88d68c9` enviados a `origin/main`; Vercel confirmó el
    deployment Production de `88d68c9` en estado `READY` antes del cambio SQL.
  - `supabase db push --linked --dry-run` desde un workdir temporal enlazado al
    project ref productivo mostró exclusivamente las migraciones
    `20260803121500` y `20260803143000`.
  - `supabase db push --linked`: ambas migraciones aplicadas y registradas en
    el historial remoto de Producción.
  - Verificación SQL remota: dos migraciones esperadas, una sola policy DELETE,
    expresión alineada con `can_manage_operations()` y `can_select_booking()`,
    y `booking-documents` conservado como privado.
  - `npx supabase db lint --linked --level error` en Producción: OK, cero
    errores de esquema.
  - El workdir temporal fue eliminado y el link permanente del workspace se
    verificó sin cambios en staging `wlssekvxpfxhwedsjhpz`.
- Validaciones pendientes:
  - UAT de eliminación como Admin y Operaciones.
- Riesgos o trabajo pendiente:
  - `supabase migration up --local` no se forzó porque el link conservado a
    staging contiene cuatro migraciones exclusivas de Demo que no existen en
    `main`; no se reparó ni alteró ese historial. La prueba SQL transaccional
    ejecutó directamente la migración versionada.
  - El borrado en cascada de un booking elimina metadata, pero no limpia
    automáticamente sus objetos de Storage; requiere una estrategia de cleanup
    separada si se habilita eliminación física de bookings.
- Commit de implementación: `d89d21a`.

### 2026-08-03 - SEC-020 - Documentos de Booking en Storage privado

- Estado: Aplicado y verificado en Producción y SQL local; pendiente de UAT
  autenticado y registro de la migración en el historial remoto.
- Hallazgo: SEC-020.
- Código:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
- SQL:
  - `supabase/migrations/20260803121500_booking_documents_private.sql`.
- Prueba:
  - `supabase/tests/booking_documents_private.sql`.
- Causa raíz:
  - El bucket `booking-documents` estaba configurado como público en
    Producción. Además, el Draft MBL guardaba y consumía una URL pública,
    aunque el flujo general de documentos ya utilizaba enlaces firmados.
- Cambios:
  - El bucket queda definido como privado mediante una migración productiva,
    idempotente y sin alterar sus límites o tipos MIME actuales.
  - Los Draft MBL nuevos guardan la ruta del objeto, no una URL pública.
  - Los Draft MBL se abren con una URL firmada por 60 segundos y se conservó
    compatibilidad con las URLs públicas heredadas.
  - La ruta se valida contra el UUID del booking actual antes de solicitar el
    enlace firmado.
- Validaciones ejecutadas:
  - Revisión dirigida de todos los consumidores de `booking-documents`: sólo
    el Draft MBL dependía de `getPublicUrl`; no hay consumidores en API, PDF o
    envío real de correo.
  - Preflight remoto de Producción: bucket existente con `public = true` y una
    referencia heredada de Draft MBL; no se mostraron rutas ni datos sensibles.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - ESLint dirigido: sin hallazgos nuevos; la pantalla conserva ocho errores y
    una advertencia históricos fuera de las líneas modificadas.
  - Commits `18307e4` y `f25e882` enviados a `origin/main`; Vercel confirmó el
    deployment Production de `f25e882` en estado `READY` antes de privatizar.
  - Cambio remoto mediante Storage Admin API limitado a
    `booking-documents.public = false`; se conservaron exactamente la
    configuración previa de tamaño y MIME, sin mover ni borrar objetos.
  - Probe anónimo sobre el Draft MBL existente: HTTP `206` antes del cambio y
    HTTP `400` después del cambio, sin imprimir URL, ruta o contenido.
  - Probe firmado del mismo objeto después del cambio: HTTP `206` con URL de 60
    segundos; confirma compatibilidad del archivo heredado.
  - `supabase/tests/booking_documents_private.sql`: OK contra Supabase local;
    comprobó privacidad, preservación exacta de límites/MIME e idempotencia y
    finalizó con `ROLLBACK`.
  - `npx supabase db lint --local --level error`: OK, cero errores de esquema.
- Validaciones pendientes:
  - Registrar la migración idempotente en el historial remoto durante la
    próxima sincronización controlada de `main`; el estado privado ya está
    aplicado mediante la API administrativa.
  - UAT autenticado de carga, descarga y eliminación.
- Riesgos o trabajo pendiente:
  - La eliminación conserva una inconsistencia preexistente: Storage permite
    borrar a Admin u Operaciones, pero la fila `booking_documents` sólo permite
    DELETE a Admin. Se atenderá como hallazgo independiente para evitar blobs o
    metadatos huérfanos.
- Commit de implementación: `18307e4`.

### 2026-07-28 - CALC-005 - Retiro de Bank Transfer Fee del comparativo FCL

- Estado: En validación manual.
- Hallazgo: CALC-005.
- Código:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: No aplica.
- Cambio:
  - Se elimina la fila Bank Transfer Fee de la tabla comparativa FCL.
  - El cargo deja de participar en el total ajustado y en la determinación de
    la tarifa de mejor costo.
  - Se retira la lectura y el prop que conectaban `bank_transfer_fee` desde
    `surcharge_rules` con la tabla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Búsqueda dirigida de `bankTransferFee`, `Bank Transfer Fee` y
    `bank_transfer_fee` en los componentes del comparativo: sin resultados.
- Verificación manual pendiente:
  - Abrir el comparativo FCL, confirmar que no exista la fila Bank Transfer Fee
    y que el total disminuya por el importe anteriormente configurado.
- Riesgos o trabajo pendiente: Ninguno identificado.
- Commit: Pendiente.

### 2026-07-28 - CALC-004 - MBL y Profit Share consolidados en Ocean Freight

- Estado: En validación manual.
- Hallazgo: CALC-004.
- Código: `src/app/(protected)/pricing-comparison/page.tsx`.
- SQL: No aplica.
- Causa raíz: La tabla FCL permite ajustar MBL y Profit Share por agente, pero
  la selección de tarifa regeneraba Pricing usando únicamente los valores
  persistidos en `agent_quotes`, ignorando los importes visibles ajustados en
  el comparativo.
- Cambio:
  - MBL y Profit Share permanecen consolidados dentro de la línea de Ocean
    Freight; no se generan como líneas independientes.
  - MBL se interpreta como total por BL y se divide entre la cantidad real de
    contenedores antes de sumarlo al costo y venta unitarios del flete.
  - Profit Share se interpreta como importe por contenedor y se suma a la venta
    unitaria de Ocean Freight.
  - Al seleccionar desde el comparativo FCL se usan los valores visibles de
    MBL y Profit Share, con fallback a `agent_quotes` cuando no existe ajuste.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente aviso de conversión LF/CRLF.
- Verificación manual pendiente:
  - Con un contenedor, Ocean Freight USD 6,300.00, MBL USD 50.00 y Profit
    Share USD 50.00 deben generar costo unitario USD 6,350.00 y venta base USD
    6,400.00 antes de margen comercial adicional.
  - Con dos contenedores, un MBL total USD 50.00 debe aportar USD 25.00 por
    contenedor; Profit Share debe conservar su importe completo por cada
    contenedor.
- Riesgos o trabajo pendiente:
  - Bank Transfer Fee fue retirado del comparativo bajo CALC-005.
- Commit: Pendiente.

### 2026-07-22 - REP-009 - Cierre mensual histórico de Pricing

- Estado: En validación.
- Código: `src/app/(protected)/reports/page.tsx`.
- SQL: No aplica; utiliza `quotation_status_history` y las relaciones existentes.
- Cambio: agrega una reportería de Pricing exportable a CSV/PDF que reconstruye ciclos desde `Pendiente de Fijar Precios` hasta `Pricing Aprobado` o `Perdida`, con entradas y aprobaciones del período, pendientes a la fecha de cierre, responsable, tiempo calendario de respuesta, valores comerciales y motivo de pérdida. Las métricas se identifican como `Cotizaciones recibidas`, `Aprobadas Pricing` y `Pendientes en Pricing al cierre` para evitar confusiones con la creación y el resultado comercial.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  verificar
  RLS con un usuario Pricing y conciliar manualmente un mes con reingresos a
  Pricing.
- Commit: Pendiente.

### 2026-07-22 - UX-042 - Cierre exterior del selector de estado

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`.
- SQL: No aplica.
- Cambio: el desplegable de estado se cierra al hacer clic fuera de su botón o menú.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: verificación visual manual en escritorio y móvil.
- Commit: Pendiente.

### 2026-07-22 - QTN-028 - Reactivar cotización perdida como nueva

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`, `src/app/(protected)/quotations/new/page.tsx`.
- SQL: No aplica; reutiliza `quotations.duplicated_from` y `activity_logs`.
- Cambio: una cotización `Perdida` conserva su estado y puede reactivarse como una cotización nueva vinculada, con nuevo número, datos editables y motivo obligatorio. La relación queda registrada en ambas cotizaciones mediante el log de actividad.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: validar manualmente una reactivación FCL/FTL y una de carga suelta; confirmar notificación a Pricing al enviarla.
- Commit: Pendiente.

### 2026-07-22 - QTN-027 - Razón obligatoria al perder cotización

- Estado: En validación.
- Código: `src/app/(protected)/quotations/[id]/page.tsx`, `src/lib/quotation-loss-reasons.ts`.
- SQL: `supabase/migrations/20260722143000_quotation_loss_reason.sql`.
- Cambio: al pasar una cotización a `Perdida`, abre un modal con razones categorizadas. `Otra` exige una explicación; la selección se guarda en la cotización, el historial y el log de actividad.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  validar
  manualmente una transición real. Los registros históricos permanecen sin
  razón.
- Commit: Pendiente.

### 2026-07-22 - INS-026 - Flete terrestre y aéreo en seguro

- Estado: En validación.
- Código: `src/lib/insurance-coverage.ts`, `src/app/(protected)/pricing-comparison/page.tsx`, `src/app/(protected)/settings/company/page.tsx`.
- SQL: `supabase/migrations/20260722120000_include_ground_and_air_freight_in_insurance.sql`.
- Cambio: incluye `Flete Terrestre`, `Air Freight` y `Aéreo Consolidado` en la regla general Full Cover. Entrega Local permanece fuera salvo inclusión excepcional.
- Validaciones: `npx tsc --noEmit` OK; `git diff --check` OK.
- Riesgo pendiente: migración aplicada previamente y registrada el 2026-07-28;
  recalcular
  seguros existentes y validar manualmente LTL, aéreo y la exclusión de
  Entrega Local.
- Commit: Pendiente.

### 2026-07-21 - UX-041 - Acceso a cotizacion desde toast de creacion

- Estado: En validacion.
- Hallazgo: UX-041.
- Codigo: `src/app/(protected)/quotations/new/page.tsx`.
- SQL: No aplica.
- Cambio: El toast de creacion incluye la accion `Ir a Cotizacion`, que navega
  al detalle de la cotizacion recien creada. El toast se muestra despues de
  marcar el formulario como guardado para no activar el guard de salida y
  permite cerrarlo manualmente mediante su boton `X`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Crear una cotizacion, pulsar la accion del
  toast y confirmar que abre el detalle correcto sin advertencia de cambios.
- Riesgos o trabajo pendiente: Ninguno identificado.
- Commit: Pendiente.

### 2026-07-21 - CALC-003 - ISV opcional en Redestino del comparativo FCL

- Estado: En validacion.
- Hallazgo: CALC-003.
- Codigo: `src/components/pricing/FclAgentComparisonTable.tsx`.
- SQL: No aplica.
- Cambio: Redestino permite indicar por agente si aplica ISV. El impuesto usa
  la tasa configurada en Empresa, se acumula con el ISV opcional de Entrega
  Local y se refleja en la fila ISV y el total ajustado.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Probar Redestino con y sin ISV, incluyendo un
  caso donde Entrega Local y Redestino sean gravables simultaneamente.
- Riesgos o trabajo pendiente: La seleccion mantiene la persistencia local ya
  existente para la tabla comparativa.
- Commit: Pendiente.

### 2026-07-21 - CALC-002 - ISV opcional en Entrega Local del comparativo FCL

- Estado: En validacion.
- Hallazgo: CALC-002.
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: No aplica.
- Cambio: Entrega Local permite indicar por agente si aplica ISV, usando la
  tasa configurada en Empresa. El impuesto se refleja en la fila ISV y en el
  total ajustado, y la seleccion se conserva al guardar la tabla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Comparar tarifas con y sin ISV en Entrega
  Local y confirmar persistencia, fila ISV y total ajustado.
- Riesgos o trabajo pendiente: La tabla se guarda localmente en el navegador,
  conforme al comportamiento existente del comparativo FCL.
- Commit: Pendiente.

### 2026-07-21 - CALC-001 - MBL por BL en tabla comparativa FCL

- Estado: En validacion.
- Hallazgo: CALC-001.
- Codigo: `src/components/pricing/FclAgentComparisonTable.tsx`.
- SQL: No aplica.
- Cambio: El MBL se suma una sola vez por BL (uno por defecto) y su ayuda
  visual distribuye el importe entre los contenedores. PS continua siendo un
  cargo multiplicado por contenedor.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente: Probar una cotizacion FCL de varios
  contenedores y confirmar el total y el MBL unitario mostrado.
- Riesgos o trabajo pendiente: Si el agente emite varios BL, se debe ingresar
  el importe total de los BL emitidos.
- Commit: Pendiente.

### 2026-07-20 - INS-025 - Cobertura general minima y excepciones por cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-coverage.ts`
- SQL:
  - `supabase/migrations/20260720153000_insurance_default_coverage_and_quote_overrides.sql`
- Cambios:
  - Invierte la politica anterior de incluir todo: por defecto solo se incluyen
    Ocean Freight y cargos clasificados como origen, ademas del FOB obligatorio.
  - Configuracion > Empresa permite administrar los textos que identifican los
    servicios incluidos por defecto; las exclusiones se conservan como regla
    adicional.
  - Antes de aplicar el seguro, Pricing muestra un modal con los servicios de
    regla general y casillas para incluir excepcionalmente DTHC, redestino,
    entrega local u otros cargos. Tambien permite incluir todos de una vez.
  - La excepcion queda guardada en la propia linea de `pricing_items`, por lo que
    el detalle operativo y el PDF reproducen la misma base utilizada al calcular.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Recalcular sin excepciones y confirmar que DTHC, redestino y entrega local
    no formen parte de las bases de costo ni venta.
  - Recalcular marcando uno y luego todos los cargos adicionales; confirmar el
    importe guardado, el detalle para Operaciones y el PDF.
  - Cambiar las inclusiones generales desde Configuracion > Empresa y confirmar
    que las nuevas cotizaciones respeten la regla.
- Riesgos pendientes:
  - Las lineas de seguro existentes conservan el calculo historico hasta que se
    vuelvan a aplicar con la nueva seleccion.
  - La actualizacion de overrides y de la linea de seguro usa operaciones
    consecutivas; si la red falla entre ambas, el modal de detalle advertira la
    diferencia y Pricing debera volver a aplicar el seguro.
- Commit: pendiente.

### 2026-07-31 - UX-048 - Combobox de clientes interactivo dentro del modal

- Estado: En validación manual.
- Hallazgo: UX-048.
- Causa raíz:
  - `ClienteCombobox` renderizaba su buscador y lista mediante un portal en
    `document.body`.
  - En el modal de perfil rápido, el bloqueo de foco y eventos del diálogo
    impedía escribir en el buscador y desplazar la lista portaleada.
- Código:
  - `src/components/ui/ClienteCombobox.tsx`
  - `src/components/clientes/ClientProfileDialog.tsx`
- SQL: ninguno.
- Cambios:
  - Se agregó el modo reutilizable `renderInline` para montar la lista dentro
    del árbol del diálogo y conservar el portal como comportamiento por defecto
    en los demás formularios.
  - La acción rápida activa este modo, permitiendo enfocar el buscador, escribir,
    navegar con teclado y usar scroll en la lista de clientes.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npx eslint src/components/ui/ClienteCombobox.tsx src/components/clientes/ClientProfileDialog.tsx`:
    OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Abrir `Ver / Editar Cliente`, escribir nombre y código en el buscador,
    recorrer la lista con scroll y seleccionar un resultado.
- Riesgos pendientes:
  - La verificación funcional requiere una sesión autenticada con clientes
    visibles.
- Commit: pendiente.


### 2026-07-31 - UX-047 - Cargos manuales y catálogo completo en Miami Aéreo

- Estado: En validación manual.
- Hallazgo: UX-047.
- Causa raíz:
  - Los cargos adicionales en origen exigían una tarifa activa con monto mayor
    que cero y categoría literal `Otros Cargos`.
  - Los conceptos reservados para automatismos de Miami LCL también se
    excluían en Consolidado Aéreo, aunque no tuvieran un control automático en
    ese flujo.
  - No existía una alternativa para cargos no incluidos en el tarifario.
- Código:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/lib/miami-pricing-items.ts`
- SQL: ninguno.
- Cambios:
  - Consolidado Aéreo carga las tarifas de origen configuradas en el catálogo
    activo y conserva compatibilidad con las tarifas de `Otros Cargos`.
  - Las líneas activas con monto `0.00` también aparecen para poder asignar un
    monto específico en la cotización sin crear un concepto manual duplicado.
  - Las exclusiones automáticas ahora dependen del producto: BL, SED,
    Desconsolidación y cargos IMO pueden seleccionarse en Aéreo si el perfil
    del cliente tiene un monto activo; en LCL conservan sus controles actuales.
  - Se agregó `Otro cargo (manual)` para capturar concepto, monto e ISV y
    persistirlo como cargo de origen incluso si no existe en el tarifario.
  - Los cargos manuales existentes se reconocen al reabrir una cotización.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido sobre la lógica nueva: OK. La ejecución con todas las
    reglas conserva hallazgos preexistentes del hook y del componente.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - En una cotización Miami Aéreo, confirmar que aparezcan todas las tarifas de
    origen del catálogo activo, incluyendo las configuradas en `0.00`.
  - Agregar `Otro cargo (manual)`, guardar, reabrir y confirmar concepto, monto
    e ISV tanto en la cotización como en el PDF comercial.
- Riesgos pendientes:
  - La verificación funcional requiere una sesión autenticada y un cliente con
    tarifario Miami configurado.
- Commit: pendiente.


### 2026-07-30 - UX-044 - Confirmación antes de duplicar una cotización

- Estado: En validación.
- Hallazgo: UX-044.
- Archivos modificados:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `HARDENING.md`
- SQL: No aplica.
- Cambios:
  - Los accesos para duplicar una cotización o reactivar una cotización perdida
    abren el `ConfirmDialog` existente antes de navegar al formulario nuevo.
  - El modal identifica la cotización origen y aclara que los datos podrán
    revisarse antes de guardar la copia.
  - Ambos accesos comparten el mismo flujo y conservan el bloqueo de la acción
    mientras inicia la navegación.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Validación manual pendiente:
  - Desde `/quotations/[id]`, cancelar el modal y confirmar que no se abra el
    formulario de duplicación.
  - Confirmar la acción y verificar que abra
    `/quotations/new?duplicateFrom=...` con los datos precargados.
  - Repetir con una cotización `Perdida` y confirmar el texto de reactivación.
- Riesgos pendientes:
  - Falta UAT autenticada de ambos accesos.
- Commit: pendiente.

### 2026-07-30 - UX-045 - Branding del footer de inicio de sesión

- Estado: En validación.
- Hallazgo: UX-045.
- Archivos modificados:
  - `src/app/login/page.tsx`
  - `HARDENING.md`
- SQL: No aplica.
- Cambios:
  - El footer de `/login` muestra `Forwarders ERP` en lugar de
    `© 2026 Sari Express ERP`.
  - La atribución de la plataforma ahora identifica a `Hernova Systems`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Validación manual pendiente:
  - Abrir `/login` en escritorio y móvil y confirmar que ambas líneas del
    footer sean legibles y no se superpongan con el formulario.
- Riesgos pendientes:
  - Falta validación visual autenticada en el deployment de Preview o Production.
- Commit: pendiente.

### 2026-07-29 - REL-004 - Postdeploy remoto 4A–5C

- Estado: SQL aplicado y validado en producción; frontend pendiente por destino
  de hosting no identificado.
- Hallazgo: REL-004.
- Alcance:
  - Verificación final del historial remoto.
  - Gate estructural, conteos, seguridad/permisos y 15 diagnósticos.
  - Conciliación del único conflicto legacy/canónico.
- Validaciones remotas:
  - `npx supabase migration list --linked`: seis versiones
    `20260729120000`–`20260729170000` alineadas.
  - `POSTDEPLOY_GATE_OK`.
  - 15 diagnósticos ejecutados sentencia por sentencia mediante
    `supabase db query --linked`: cero filas en todas las consultas de
    integridad.
  - 12 Shipping Instructions, 12 shipments, 4 bookings, 4 revisiones, 6 filas
    físicas de contenedor, 48 requisitos y cero cut-offs/VGM/excepciones.
  - Cero SI, bookings o eventos sin shipment y cero diferencias de
    clasificación de backfill.
  - 27 RPC `SECURITY DEFINER`: todas ejecutables por `authenticated`, ninguna
    por `anon`.
  - Cero permisos directos de escritura para `anon/authenticated` en tablas 5C.
  - Las cuatro evaluaciones FCL ejecutaron sin error y quedaron bloqueadas por
    readiness incompleto, estado preoperativo esperado; no se forzó transición.
- Conciliación manual:
  - `RT0020` reportó diferencia de `master_bl`.
  - `bills_of_lading` contiene el MBL canónico `APS20260700173`, estado
    `MBL Validado`, igual al cache del booking.
  - `COSU6506723360` permanece solo en el campo legacy de la SI; no se modificó
    ningún dato.
- Riesgos o trabajo pendiente:
  - El repositorio no tiene `.vercel/project.json`, `.openai/hosting.json` ni
    workflow de deploy.
  - La única cuenta Vercel disponible no contiene un proyecto Sari ERP.
  - No desplegar frontend hasta recibir el proyecto o procedimiento de hosting
    correcto. Desplegar el árbol frontend exacto de `856e2a4d...`.
  - Completar UAT autenticada crítica después del despliegue.
- Commit: `a1b569c`.

### 2026-07-29 - REL-003 - Backfill 5C compatible con triggers diferidos

- Estado: Aplicada y validada en producción.
- Hallazgo: REL-003.
- Causa raíz:
  - Con bookings reales, el backfill de requisitos generó eventos de los
    constraint triggers `DEFERRABLE INITIALLY DEFERRED`.
  - La migración intentaba ejecutar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
    antes de resolverlos y PostgreSQL respondió SQLSTATE `55006`.
- SQL y documentación:
  - `supabase/migrations/20260729170000_booking_cutoffs_and_readiness.sql`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/release-readiness-4a-5c.md`
- Corrección:
  - Se agregó `SET CONSTRAINTS ALL IMMEDIATE` inmediatamente después del
    backfill y antes de habilitar RLS.
  - La instrucción ejecuta y valida todos los eventos diferidos; no omite ni
    deshabilita controles de relación.
  - No se añadió ninguna migración y 5C todavía no figuraba en el historial
    remoto.
- Validaciones:
  - `migration list --linked`: 4A–5B aplicadas y 5C pendiente.
  - Dump de esquema remoto: objetos 4A–5B presentes y tablas 5C ausentes.
  - Ensayo local con un booking FCL y contenedor existentes dentro de una sola
    transacción: 12 requisitos creados, `SET CONSTRAINTS`, RLS y `COMMIT`.
  - `POSTDEPLOY_GATE_OK`.
  - Conteos: 1 quotation, SI, shipment, booking, contenedor y revisión; 12
    requisitos; cero cut-offs, VGM, excepciones y evaluaciones.
  - Seguridad: ninguna RPC expuesta a `anon` y ninguna escritura directa
    concedida a `authenticated`.
  - Suite SQL 5C: OK.
  - Diagnósticos de cut-offs, VGM, readiness y pre-shipment: cero hallazgos.
  - Rehearsal acumulado 4A–5C posterior: `LOCAL_REHEARSAL_OK`.
  - `npx next typegen` y `npx tsc --noEmit`: OK.
  - SHA-256 corregido de 5C:
    `8A9BB9F793FF419593D9A1646F889568B30035B16B3600EEA297561B3BFB3925`.
- Riesgos o trabajo pendiente:
  - SQL y postdeploy remoto completados.
  - Mantener frontend sin desplegar hasta identificar el hosting y completar
    la UAT autenticada.
- Commit: `618d3dd`.

### 2026-07-29 - REL-002 - Backfill 4A compatible con rol de migración

- Estado: Aplicada en producción; postdeploy acumulado pendiente de 5C.
- Hallazgo: REL-002.
- Causa raíz:
  - El backfill final de 4A llamaba
    `select_primary_booking_if_single`, una RPC diseñada para sesiones
    autenticadas.
  - Supabase ejecuta las migraciones remotas con un rol técnico que no aporta
    `auth.uid()` y no necesariamente tiene `session_user = 'postgres'`.
- SQL y documentación:
  - `supabase/migrations/20260729120000_booking_canonical_foundation.sql`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/release-readiness-4a-5c.md`
- Corrección:
  - El backfill hace directamente el `UPDATE` de
    `shipping_instructions.primary_booking_id` y crea el mismo
    `activity_logs` de auditoría con fuente `foundation_migration`.
  - Las RPC interactivas conservan sus controles de autenticación y permisos.
  - No se añadió ninguna migración; 4A aún no figuraba en el historial remoto.
- Validaciones:
  - El primer `npx supabase db push` remoto falló con SQLSTATE `42501` y
    PostgreSQL revirtió la migración completa.
  - `npx supabase migration list --linked` confirmó que el remoto continuó en
    `20260728130000`.
  - Un dump de esquema remoto posterior no encontró
    `primary_booking_id`, RPC ni trigger parciales de 4A.
  - Rehearsal local completo corregido: `LOCAL_REHEARSAL_OK`.
  - Gates predeploy/postdeploy/seguridad, seis suites SQL, quince diagnósticos
    y DB lint: OK.
  - SHA-256 corregido de 4A:
    `2E21D65AD37C3BBA53B7433D09894FACCCF8746E5D798E257E6E4319898E95B3`.
- Riesgos o trabajo pendiente:
  - Repetir `migration list` y `db push --dry-run` antes de reaplicar.
  - No desplegar frontend hasta que el SQL remoto y todos los gates
    postdeploy estén aprobados.
- Commit: `229d07b9ecbe148b6342ae9ae7153bc561e63017`.

### 2026-07-29 - REL-001 - Release Readiness acumulado 4A–5C

- Estado: Release candidate preparado; `NO-GO` para producción hasta aprobar
  rehearsal representativo y UAT autenticada.
- Hallazgo: REL-001.
- Alcance:
  - Congelamiento de las seis migraciones 4A–5C.
  - Gates reproducibles de predeploy, postdeploy, conteos y seguridad.
  - Rehearsal local exacto desde el baseline remoto.
  - Checklist UAT unificado, criterios GO/NO-GO y rollback.
- SQL y scripts:
  - `supabase/release/phase_4a_5c/00_predeploy_gate.sql`
  - `supabase/release/phase_4a_5c/01_predeploy_counts.sql`
  - `supabase/release/phase_4a_5c/02_postdeploy_gate.sql`
  - `supabase/release/phase_4a_5c/03_postdeploy_counts.sql`
  - `supabase/release/phase_4a_5c/04_security_gate.sql`
  - `scripts/release/rehearse-phase-4a-5c.ps1`
- Documentación:
  - `docs/release/release-readiness-4a-5c.md`
  - `docs/release/migration-inventory-4a-5c.md`
  - `docs/release/rollback-runbook-4a-5c.md`
  - `docs/uat/release-4a-5c-authenticated.md`
- Verificaciones:
  - `npx supabase migration list --linked`: remoto termina en
    `20260728130000`; 4A–5C no aplicadas.
  - `npx supabase db push --linked --dry-run`: propone únicamente las seis
    migraciones `20260729120000`–`20260729170000`; no aplicó cambios.
  - Rehearsal local desde `20260728130000`: `LOCAL_REHEARSAL_OK`.
  - Gates predeploy, postdeploy y seguridad: OK.
  - Suites SQL 4A, 4B, 4C, 5A, 5B y 5C: OK con rollback.
  - Quince diagnósticos: cero hallazgos sobre base local vacía.
  - DB lint: sin errores ni warnings.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 66/66 páginas.
  - ESLint dirigido a componentes/helpers nuevos: OK.
  - `npm run lint`: conserva deuda global preexistente de 384 hallazgos
    (312 errores y 72 warnings); no se amplió el alcance a módulos ajenos.
- Corrección imprescindible encontrada:
  - El primer runner enviaba SQL UTF-8 mediante el pipeline de texto de
    Windows PowerShell y corrompía estados con acentos.
  - Se cambió únicamente el transporte hacia Docker para preservar bytes
    UTF-8; el rehearsal completo posterior aprobó.
- Gates pendientes:
  - Restaurar una copia representativa anonimizada.
  - Conciliar conteos y clasificaciones reales.
  - Medir locks/duración con volumen representativo.
  - Completar y firmar UAT autenticada.
- Riesgos:
  - La evidencia actual es sintética y la base local estaba vacía.
  - Los logs representativos pueden contener identificadores; por ello
    `release-evidence/` está excluido de Git.
  - Cualquier cambio de hash invalida las aprobaciones y obliga a repetir el
    proceso.
  - La deuda ESLint global requiere aceptación formal o remediación separada;
    TypeScript y el build de producción sí están aprobados.
- Producción: no se aplicó SQL ni frontend.
- Commit: `856e2a4d347d9a27954786e0bb18c2febeb53e37`.

### 2026-07-29 - FLOW-020 - Cut-offs, VGM y readiness previo al embarque

- Estado: Implementado y validado en Supabase local; rehearsal representativo,
  UAT autenticada y SQL remoto pendientes.
- Hallazgo: FLOW-020.
- Causa raíz:
  - El paso a `Listo para Embarque` usaba validaciones marítimas fijas y no
    distinguía FCL, LCL, aéreo ni terrestre.
  - No existía evidencia canónica, versionada ni auditable de cut-offs o VGM
    por contenedor físico.
  - Los documentos se evaluaban por presencia y no existía un snapshot
    inmutable que explicara por qué una transición fue aprobada o bloqueada.
- SQL:
  - `supabase/migrations/20260729170000_booking_cutoffs_and_readiness.sql`
  - `supabase/tests/booking_cutoffs_and_readiness.sql`
  - `supabase/diagnostics/booking_cutoff_integrity.sql`
  - `supabase/diagnostics/container_vgm_integrity.sql`
  - `supabase/diagnostics/booking_readiness_consistency.sql`
  - `supabase/diagnostics/pre_shipment_post_validation.sql`
- Código y documentación:
  - `src/components/operations/BookingReadinessPanel.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5c-booking-readiness.md`
  - `docs/release/phase-5c-deployment-and-rollback.md`
  - `docs/release/phase-4a-5b-release-rehearsal.md`
  - `supabase/rehearsal/phase_4a_5b_pre_snapshot.sql`
  - `supabase/rehearsal/phase_4a_5b_post_reconciliation.sql`
  - `supabase/rehearsal/phase_4a_5b_security_validation.sql`
- Cambios:
  - Se agregaron cut-offs versionados con fecha/hora, zona horaria IANA,
    fuente, estado, cumplimiento, cancelación y excepción administrativa.
  - Se agregó VGM versionado por contenedor físico, masa positiva KG/LB,
    método, documento y estados borrador/verificado/enviado/aceptado/rechazado.
  - El checklist canónico se deriva por modalidad y conserva requisitos no
    aplicables fuera de los bloqueadores.
  - La evaluación de readiness es de solo lectura; las transiciones a
    `Listo para Embarque` y `Embarcado` la aplican transaccionalmente y guardan
    un snapshot inmutable.
  - Los bloqueos retornan requisitos, cut-offs y contenedores concretos, crean
    evento/alerta y no cambian silenciosamente el estado.
  - Rollover conserva únicamente VGM del mismo contenedor, versiona cut-offs
    provistos e invalida dependencias de itinerario. Un reemplazo comienza con
    checklist independiente y no hereda evidencia 5C.
  - Dashboard, alertas, reportes y portal consumen proyecciones específicas; el
    portal no expone excepciones, aprobadores ni razones internas.
  - El backfill crea solamente requisitos faltantes, es idempotente y no
    inventa cut-offs/VGM ni cambia estados.
  - Se corrigieron cadenas mal codificadas de estados en la migración 5B que
    impedían un rollover válido desde `Listo para Embarque`.
- Validaciones ejecutadas:
  - Replay completo `npx supabase db reset --local`: OK.
  - `supabase/tests/booking_cutoffs_and_readiness.sql`: OK con rollback.
  - Regresiones 4A, 4B, 4C, 5A y 5B: OK con rollback.
  - Cuatro diagnósticos 5C: cero hallazgos en la base local vacía.
  - `npx supabase db lint --local --level warning`: sin errores ni warnings.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a los siete consumidores 5C: OK, sin errores ni warnings.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Verificación manual pendiente:
  - Ejecutar el rehearsal acumulado 4A–5B sobre una copia representativa.
  - Ejecutar la matriz UAT 5C con Admin, Operaciones y Cliente.
  - Conciliar FCL, LCL, aéreo y terrestre, incluyendo rollover y reemplazo.
  - Ejecutar smoke visual antes del despliegue.
- Riesgos pendientes:
  - La base local no contiene historia productiva ni contenedores físicos
    reales; las pruebas sintéticas no reemplazan el rehearsal.
  - Un registro `booking_containers` con cantidad mayor a uno no puede
    certificar VGM por unidad y debe normalizarse antes de usar readiness FCL.
  - No existe integración automática con navieras/básculas; la evidencia es
    capturada por usuarios autorizados.
  - La migración 5C no puede desplegarse hasta que 4A–5B estén aplicadas y
    reconciliadas en remoto.
- Rollback:
  - Revertir consumidores y wrappers mediante migración compensatoria.
  - Revocar escrituras 5C y conservar tablas/historia en modo lectura.
  - No borrar cut-offs, VGM, excepciones, eventos ni snapshots.
- Commit: pendiente.

### 2026-07-29 - FLOW-019 - Revisiones y rollover de Booking

- Estado: En validación; SQL aplicado únicamente en Supabase local y UAT
  autenticada pendiente.
- Hallazgo: FLOW-019.
- Causa raíz:
  - El guardado genérico de booking permitía sobrescribir identidad,
    vessel/voyage, ETD/ETA, fechas originales y fechas reales sin distinguir
    revisión, rollover, reemplazo o corrección.
  - `Cancelada` no diferenciaba cancelación definitiva de reserva reemplazada.
- SQL:
  - `supabase/migrations/20260729160000_booking_schedule_revisions.sql`
  - `supabase/tests/booking_schedule_revisions.sql`
  - `supabase/diagnostics/booking_schedule_revision_coverage.sql`
  - `supabase/diagnostics/booking_replacement_consistency.sql`
  - `supabase/diagnostics/booking_original_schedule_integrity.sql`
  - `supabase/diagnostics/booking_rollover_post_validation.sql`
- Código y documentación:
  - `src/components/operations/BookingScheduleManager.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5b-booking-schedule-revisions.md`
- Cambios:
  - Historial inmutable y secuencial en `booking_schedule_revisions`, con
    backfill `INITIAL` idempotente y metadata de inferencia.
  - `original_etd` y `original_eta` quedan fijadas por la primera evidencia;
    el schedule vigente permanece en `bookings`.
  - Ciclo de vida explícito `ACTIVE/CANCELLED/REPLACED`, relaciones de
    sustitución consistentes, sin ciclos y dentro del mismo shipment.
  - RPC transaccionales para revisión, rollover, reemplazo, cancelación,
    reactivación y corrección administrativa, con control optimista, locking,
    eventos y activity logs.
  - El guardado común ya no acepta identidad, schedule, originales ni actuals.
  - Reemplazo no copia BL, documentos, fechas reales, tracking ni eventos.
    Contenedores físicos no se mueven automáticamente.
  - Portal muestra solo bookings activos e itinerario vigente; reportes y
    alertas distinguen históricos y cambios de itinerario.
- Validaciones:
  - Replay completo `npx supabase db reset --local`: OK.
  - `supabase/tests/booking_schedule_revisions.sql`: OK con rollback.
  - Regresiones 4A, 4B, 4C y 5A: OK con rollback.
  - Cuatro diagnósticos 5B: 0 hallazgos en la base local vacía.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: conserva baseline global de 392 problemas
    (318 errores y 74 warnings); el componente nuevo no agrega hallazgos.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- UAT autenticada:
  - Pendiente; matriz preparada en
    `docs/uat/phase-5b-booking-schedule-revisions.md`.
- Riesgos pendientes:
  - La base local no contiene datos productivos; ejecutar los cuatro
    diagnósticos sobre una copia representativa antes de desplegar.
  - La excepción Admin de reemplazo con BL emitido exige revisión documental
    humana y queda auditada.
  - La notificación al cliente es un registro manual; no existe integración
    automática con navieras ni tareas persistentes en esta fase.
- Rollback:
  - Revertir frontend y consumidores.
  - Deshabilitar/revocar los nuevos RPC mediante migración compensatoria.
  - Conservar tabla de revisiones, relaciones, bookings y todo historial
    generado; no borrar datos.
- Commit: pendiente.

### 2026-07-29 - FLOW-018 - Fundación de Shipment canónico

- Estado: En validación manual; migración aplicada únicamente en Supabase local.
- Hallazgo: FLOW-018.
- Causa raíz:
  - `shipping_instructions` funcionaba simultáneamente como documento y raíz
    operativa, mientras bookings y eventos no tenían una FK estable hacia un
    agregado shipment.
  - Portal, reportes, alertas y Cost Validation usaban SI como fila operativa
    y algunos consumidores asumían una sola SI por cotización.
- SQL:
  - `supabase/migrations/20260729150000_shipments_foundation.sql`
  - `supabase/diagnostics/shipment_backfill_classification.sql`
  - `supabase/diagnostics/shipment_relationship_consistency.sql`
  - `supabase/diagnostics/shipment_status_comparison.sql`
  - `supabase/diagnostics/shipment_post_foundation_validation.sql`
  - `supabase/tests/shipment_foundation.sql`
- Código y documentación:
  - `src/lib/shipment-service.ts`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/components/operations/BookingTimeline.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/cost-validation/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
  - `src/lib/alerts.ts`
  - `docs/uat/phase-5a-shipment-foundation.md`
- Cambios:
  - Se creó `shipments` con FK conservadoras, RLS y backfill idempotente
    SI→shipment conservando el UUID.
  - `bookings` y `operational_events` recibieron `shipment_id`; triggers
    impiden relaciones inconsistentes o mover registros históricos.
  - Los RPC canónicos de booking, eventos, timeline y finalización validan y
    retornan el shipment.
  - La creación desde cotización es transaccional, auditable e idempotente.
  - Una guardia de compatibilidad crea shipment para escritores legacy de SI;
    la RPC canónica desactiva esa guardia localmente y no existe doble
    escritura desde frontend.
  - Portal v2, reportes, alertas y Cost Validation leen shipment como raíz.
  - Las rutas y relaciones legacy se conservan.
- Validaciones:
  - Replay completo con `npx supabase db reset --local`: OK.
  - `supabase/tests/shipment_foundation.sql`: OK con rollback; incluye
    backfill de booking/evento y preservación de `updated_at` histórico.
  - Regresiones `booking_canonical_foundation.sql`,
    `booking_canonical_consumers.sql` y
    `canonical_operational_events.sql`: OK con rollback.
  - Cuatro diagnósticos 5A: OK; base local vacía con 0 inconsistencias.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: conserva baseline global de 392 problemas
    (318 errores y 74 warnings); no agrega deuda.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
  - UAT autenticada: pendiente.
- Verificación manual pendiente:
  - Ejecutar toda la matriz de
    `docs/uat/phase-5a-shipment-foundation.md`.
  - Validar conteos y excepciones sobre una copia representativa antes de
    aplicar SQL remoto.
- Riesgos pendientes:
  - La base local estaba vacía; no valida peculiaridades de datos productivos.
  - Las URLs y documentos aún conservan SI como contexto por compatibilidad.
  - `operational_status` legacy puede diferir del derivado; el diagnóstico lo
    reporta y no se corrige destructivamente en 5A.
- Rollback:
  - Revertir consumidores a SI y revocar RPC mediante migración
    compensatoria.
  - Conservar tabla, columnas y relaciones nuevas sin uso; no borrar
    shipments ni reescribir históricos.
- Commit: pendiente.

### 2026-07-29 - FLOW-017 - Timeline y transiciones canónicas de Booking

- Estado: En validación manual; migración aplicada únicamente en Supabase
  local.
- Hallazgo: FLOW-017.
- Causa raíz:
  - El detalle del booking permitía seleccionar cualquier
    `bookings.shipment_status` y enviarlo dentro de
    `update_booking_canonical`, sin matriz de transición ni validaciones por
    etapa.
  - El historial operativo dependía de `shipping_instruction_events`, sin
    asociación estructurada a booking/contenedor.
  - La finalización de SI se validaba y ejecutaba desde el frontend mediante
    actualización directa.
- SQL:
  - `supabase/migrations/20260729140000_canonical_operational_events.sql`
  - `supabase/tests/canonical_operational_events.sql`
  - Ajustes de regresión en las suites 4A y 4B.
- Código:
  - `src/components/operations/BookingTimeline.tsx`
  - `src/lib/booking-status.ts`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `docs/uat/phase-4c-operational-timeline.md`
- Cambios:
  - Tabla `operational_events` con RLS, vínculos validados, fechas de
    ocurrencia/registro separadas y origen auditado.
  - Backfill idempotente desde eventos legacy, sin actualizar estados y sin
    asociar silenciosamente eventos ambiguos a `primary_booking_id`.
  - RPC `record_operational_event`, `transition_booking_status`,
    `reopen_booking`, `get_booking_operational_timeline` y
    `finalize_shipping_instruction_canonical`.
  - `update_booking_canonical` rechaza `shipment_status` y hace inmutable un
    booking finalizado.
  - Selector libre sustituido por acción contextual y modal con concurrencia,
    campos de ocurrencia y errores accionables.
  - Timeline reutilizable con orden alternable y notas operativas.
  - Estado agregado centralizado con confirmación/arribo parcial y cancelados
    explícitos.
  - Las nuevas escrituras de eventos del detalle de SI usan el RPC canónico;
    la tabla legacy permanece solo como lectura histórica.
- Validaciones:
  - `npx supabase migration up --local`: OK.
  - Reconciliación local: 0 eventos legacy, 0 reconciliados, 0 inserciones al
    repetir el backfill.
  - Suite SQL 4C: OK con rollback.
  - Regresiones SQL 4A y 4B: OK con rollback.
  - `npx supabase db lint --local --level warning`: sin hallazgos.
  - `npx tsc --noEmit`: OK final.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; solo avisos esperados LF/CRLF.
  - Lint global before: 401 problemas (326 errores, 75 warnings).
  - Lint global after: 392 problemas (318 errores, 74 warnings); continúa
    fallando por deuda preexistente.
  - Lint focalizado: archivos nuevos sin hallazgos; detalle de booking conserva
    3 errores y 2 warnings preexistentes.
- Verificación manual pendiente:
  - UAT autenticada completa descrita en
    `docs/uat/phase-4c-operational-timeline.md`.
  - Validar el backfill en un ambiente con eventos históricos reales antes de
    producción.
  - Aplicar la migración remota solo tras aprobar UAT y reconciliación.
- Riesgos pendientes:
  - El detalle de SI aún lee `shipping_instruction_events` como histórico y
    `activity_logs`; queda pendiente migrarlo a una vista canónica completa.
  - Las columnas de estado legacy de SI continúan coexistiendo y no deben
    considerarse autoridad del booking.
  - Booking Confirmation usa warning al confirmar y se vuelve obligatoria al
    marcar Listo para Embarque.
- Rollback:
  - Revertir la UI y revocar RPC mediante migración compensatoria.
  - Conservar ambas tablas de eventos en solo lectura; no borrar historia.
  - No se eliminaron columnas, eventos ni datos.
- Commit: pendiente.

### 2026-07-29 - FLOW-016 - Consumidores de Booking canónico Fase 4B

- Estado: En validación; SQL aplicado únicamente en Supabase local y UAT
  autenticada pendiente.
- Hallazgo: FLOW-016.
- Causa raíz:
  - Portal, Cost Validation, reportes, alertas/dashboard y repricing todavía
    consumían o escribían semántica de booking desde campos legacy de
    `shipping_instructions`.
  - Reportes mezclaba una fila SI legacy con filas canónicas de `bookings`.
  - Repricing podía modificar SI legacy y bookings con criterios basados solo
    en identificadores vacíos.
- SQL:
  - `supabase/migrations/20260729130000_booking_canonical_consumers.sql`
  - `supabase/tests/booking_canonical_consumers.sql`
- Código y documentación:
  - `src/lib/booking-status.ts`
  - `src/lib/booking-document-summary.ts`
  - `src/app/portal/page.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
  - `src/app/(protected)/cost-validation/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
  - `src/lib/alerts.ts`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `docs/uat/phase-4b-booking-canonical-consumers.md`
- Cambios:
  - Portal v2 valida `auth.uid()`, pertenencia del cliente y devuelve una
    operación por SI más todos sus bookings en detalle, sin comentarios,
    costos, márgenes ni contactos internos.
  - Se conserva Portal v1 como rollback; los tres consumidores activos llaman
    exclusivamente a v2.
  - Cost Validation muestra 0/1/N referencias operativas y mantiene costos a
    nivel de cotización sin multiplicarlos.
  - Reportes separa explícitamente vista Operaciones y vista Bookings. La
    primera agrega fechas, estado y contenedores; la segunda muestra un booking
    por fila con MBL/HBL canónicos.
  - Alertas y dashboard calculan semántica operativa desde bookings. Las
    alertas SI se limitan a ausencia de bookings, validación, preparación y
    brechas de asignación.
  - `sync_shipping_instruction_from_selected_agent_quote_v2` actualiza solo
    defaults de bookings sin confirmar; omite bookings confirmados, con datos
    operativos o BL estructurado y audita IDs/motivos.
  - Repricing v2 solo actualiza en SI datos propios del contacto del agente.
    No escribe booking, carrier, itinerario, estado ni BL legacy en SI.
  - El rol `authenticated` perdió acceso al RPC v1 de repricing; la función se
    conserva para rollback administrativo.
  - `booking-document-summary` prioriza `bills_of_lading`, usa caché de booking
    solo si falta el BL estructurado y no acepta campos legacy de SI.
  - La revisión PDF confirmó que el PDF activo es una instrucción prevista y
    que el PDF alterno no tiene consumidor activo.
  - No se eliminaron columnas ni se creó `shipments`.
- Validaciones ejecutadas:
  - Migración `20260729130000`: aplicada correctamente en Supabase local.
  - `supabase/tests/booking_canonical_consumers.sql`: OK con rollback.
  - Regresión `supabase/tests/booking_canonical_foundation.sql`: OK con
    rollback sobre el esquema local que ya incluye Fase 4B.
  - Portal probado por SQL con 0/1/N bookings, aislamiento entre dos clientes y
    exclusión de comentarios operativos.
  - Repricing probado con SI sin bookings, booking no confirmado, confirmado,
    mezcla de estados, cambio de carrier/ETD/free days y BL estructurado.
  - Evidencia SQL: los ocho campos booking legacy de SI permanecen iguales
    después de repricing v2.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Prueba directa de helpers con Node 24: estado agregado conservador, BL
    estructurado preferido y fallback de caché de booking, OK.
  - `npm run lint`: ejecutado, no aprobado por deuda global previa del
    repositorio (401 hallazgos: 326 errores y 75 warnings, principalmente
    reglas React Hooks y `no-explicit-any` en módulos fuera de esta fase).
- Verificación manual pendiente:
  - Checklist autenticado completo en
    `docs/uat/phase-4b-booking-canonical-consumers.md`.
- Riesgos y trabajo pendiente:
  - UAT visual/autenticada no ejecutada.
  - Las columnas legacy permanecen y otros consumidores fuera del alcance de
    Fase 4B todavía pueden leerlas.
  - `shipping-instruction-pdf.tsx` se conserva aunque no tenga consumidor
    activo; retirarlo requiere una fase explícita.
  - La migración 4B no se aplicó en Supabase remoto.
- Rollback:
  - Revertir consumidores frontend a Portal v1 y consultas anteriores.
  - Rehabilitar `EXECUTE` de repricing v1 solo mediante migración
    compensatoria y aceptando temporalmente su doble semántica legacy.
  - Mantener intactas las columnas permite la reversión sin pérdida de datos.
- Commit: pendiente.

### 2026-07-20 - INS-024 - Politica configurable de servicios asegurables

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-coverage.ts`
- SQL:
  - `supabase/migrations/20260720100000_company_insurance_coverage_rules.sql`
- Cambios:
  - Agrega a Configuracion > Empresa una lista editable de servicios excluidos
    de la base Full Cover; todo servicio no excluido permanece incluido.
  - La coincidencia parcial revisa `pricing_items.rate_code`, `description` e
    `item_type` sin distinguir mayusculas ni tildes.
  - La migracion inicializa la politica con `DTHC` excluido, sin introducir una
    condicion especial de DTHC en el codigo del calculo.
  - Pricing, el detalle operativo y el PDF comparten el mismo helper de
    inclusion/exclusion y muestran las lineas descartadas junto con la regla
    aplicada.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada y registrada; confirmar que Configuracion > Empresa
    muestre `DTHC` como exclusion inicial.
  - Recalcular una cotizacion con DTHC y verificar que su costo y venta no
    formen parte de ninguna base asegurada.
  - Retirar DTHC de la configuracion, recalcular y confirmar que vuelva a
    incluirse; agregar otra exclusion y repetir.
- Riesgos pendientes:
  - Las lineas historicas sin `rate_code` se evalúan por descripcion o tipo; una
    descripcion demasiado generica puede coincidir con mas servicios de los
    previstos, por lo que el modal y PDF muestran cada coincidencia.
- Commit: pendiente.

### 2026-07-17 - INS-023 - PDF con trazabilidad completa del calculo de seguro

- Estado: En validacion
- Codigo:
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
- SQL: ninguno.
- Cambios:
  - El documento imprimible agrega el detalle de todos los servicios Full Cover
    con cantidad, costo total y venta total, excluyendo seguro e ISV.
  - Separa el recorrido de costo y venta: FOB, servicios, subtotal, gastos
    adicionales, gastos operacionales, base asegurada, porcentaje y prima.
  - La venta muestra tambien el ISV configurado en la linea y el total final
    cobrado al cliente para conciliar con `pricing_items.total_amount`.
  - Mantiene al final los valores resumidos que Operaciones debe trasladar al
    formato de la aseguradora.
  - Si el valor de servicios declarado fue ajustado manualmente, el PDF muestra
    la diferencia contra la suma comercial y aclara cual valor usa la venta.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Imprimir una cotizacion con varios servicios y confirmar que la suma del
    detalle concilia con ambas bases aseguradas y con las primas guardadas.
  - Probar un ajuste manual del valor declarado y confirmar la advertencia en
    el documento.
- Riesgos pendientes:
  - Cotizaciones con muchas lineas pueden extender el documento a una segunda
    pagina; las secciones de calculo se mantienen juntas al imprimir.
- Commit: pendiente.

### 2026-07-17 - PRC-022 - Confirmacion de borrado y resumen FCL compacto

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Limita el ancho de cada tarjeta del resumen por contenedor FCL para evitar
    que una sola tarjeta se extienda por toda la pantalla.
  - Reemplaza el borrado inmediato de lineas de cotizacion por un modal de
    confirmacion que identifica descripcion, tipo y total de la linea.
  - Bloquea acciones duplicadas mientras se elimina y conserva la solicitud de
    motivo para cotizaciones que ya requieren trazabilidad post-aprobacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir una cotizacion FCL con uno y varios tipos de contenedor y validar el
    ancho responsivo del resumen.
  - Presionar Eliminar, cancelar y confirmar que la linea permanece.
  - Confirmar el borrado y validar que la tabla y el resumen se recalculan.
  - Repetir en una cotizacion enviada al cliente y validar el modal adicional
    de motivo de cambio.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-17 - PRC-021 - Resumen comercial FCL por contenedor

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega al Resumen Comercial de cotizaciones FCL un desglose unitario por
    cada tipo de contenedor incluido en `quotation_containers`.
  - Muestra costo base Sari, venta al cliente con ISV y profit sin ISV por
    contenedor, junto con la cantidad cotizada de cada tipo.
  - Asigna las lineas de flete al tipo de contenedor indicado en su descripcion
    y prorratea los cargos generales entre el total de unidades, conservando la
    conciliacion con los totales generales de la cotizacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Probar una cotizacion FCL con un solo tipo y varias unidades.
  - Probar una cotizacion FCL con dos tipos de contenedor y confirmar que costo,
    venta y profit unitarios multiplicados por sus cantidades concilian con el
    resumen general.
- Riesgos pendientes:
  - Las lineas generales no tienen relacion directa con un tipo de contenedor;
    por eso se distribuyen uniformemente entre todas las unidades.
- Commit: pendiente.

### 2026-07-17 - INS-020 - Tasa de costo de seguro configurable por empresa

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/lib/insurance-calculator.ts`
- SQL:
  - `supabase/migrations/20260717140000_company_insurance_cost_rate.sql`
- Cambios:
  - Agrega `insurance_cost_rate_percent` a `company_settings`, con valor
    inicial `0.28` y restriccion de rango mayor que 0% y hasta 5%.
  - Permite al Admin modificar la tasa desde Configuracion > Empresa usando
    notacion porcentual (`0.28` representa `0.28%`).
  - Pricing utiliza la tasa configurada al crear o actualizar la linea de
    seguro, y el calculo operativo para la aseguradora muestra la misma tasa.
  - Conserva `0.28%` como fallback de aplicacion si la configuracion no esta
    disponible.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada y registrada.
  - Cambiar la tasa como Admin, recargar Pricing y recalcular una linea de
    seguro; confirmar importe, formula guardada y detalle para aseguradora.
  - Confirmar que usuarios no Admin solo ven el campo en modo lectura.
- Riesgos pendientes:
  - Las lineas de seguro ya guardadas mantienen su costo historico hasta que
    se vuelvan a calcular.
- Commit: pendiente.

### 2026-07-17 - INS-019 - Calculo operativo para aseguradora

- Estado: En validacion
- Codigo:
  - `src/components/quotations/InsuranceCalculationDialog.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/lib/insurance-calculator.ts`
- SQL: ninguno.
- Cambios:
  - Habilita `Calculo para Aseguradora` en el detalle de cotizaciones que ya
    contienen una linea de seguro, visible para Admin, Pricing, Ventas y
    Operaciones.
  - Presenta por separado factura/FOB y todos los servicios full cover,
    excluyendo seguro e ISV, con los recargos de 10% aplicables.
  - Permite corregir temporalmente los servicios declarados, calcula costo al
    0.28% sobre FOB + costos y venta con el porcentaje del cliente sobre FOB +
    ventas, y advierte diferencias contra la linea comercial guardada.
  - Genera una hoja horizontal imprimible o guardable como PDF para apoyar el
    llenado del formato de la aseguradora.
  - Agrega un detalle desplegable de todos los servicios incluidos en la linea
    comercial, mostrando costo y venta por item, las bases FOB + servicios y
    sus diferencias contra el valor declarado a la aseguradora.
  - Conserva la regla full cover comercial: costo basado en FOB + costos de
    todos los servicios y venta basada en FOB + ventas de todos los servicios,
    excluyendo en ambos casos el seguro y el ISV.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir una cotizacion con seguro como Operaciones, validar FOB y todos los
    servicios full cover precargados, comparar contra la cotizacion y guardar
    PDF.
- Riesgos pendientes:
  - Los ajustes manuales de servicios en el modal son temporales y no modifican
    la cotizacion; deben verificarse contra la solicitud enviada a la
    aseguradora.
- Commit: pendiente.

### 2026-07-17 - PRC-018 - Correccion de tasa de costo del seguro

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Corrige la tasa utilizada para calcular el costo del seguro de carga de
    `0.27%` a `0.28%`.
  - El detalle persistido de la formula toma la misma constante del calculo
    para evitar discrepancias futuras entre el importe y su explicacion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Reaplicar el seguro en una cotizacion y confirmar costo, margen y tooltip.
- Riesgos pendientes:
  - Las lineas de seguro creadas anteriormente conservan el costo historico
    hasta que se vuelva a ejecutar `Aplicar seguro de carga`.
- Commit: pendiente.

### 2026-07-13 - REP-008 - Costo en reporte comercial exportable

- Estado: Completado
- Codigo: `src/app/(protected)/reports/page.tsx`
- SQL: ninguno.
- Cambios: agrega `Costo` desde `quotations.total_cost` a tabla, CSV y PDF,
  incluyendo el total agrupado por moneda.
- Validaciones: `npx tsc --noEmit`: OK.
- Verificacion manual: OK con `CLI-00001 - Inversiones Dennis`; se confirmo
  Costo en pantalla, CSV y PDF, con valores y totales correctos.
- Riesgos pendientes: conserva fecha de creacion y filtros actuales.
- Commit: pendiente.

### 2026-07-16 - PDF-017 - Pesos en libras y kilogramos en detalle de carga

- Estado: En validacion
- Codigo:
  - `src/components/pdf/quotation-pdf.tsx`
- SQL: ninguno.
- Cambios:
  - El detalle de carga comercial muestra peso unitario y peso total de cada
    linea en libras y kilogramos.
  - El resumen inferior muestra siempre `Total lbs` y `Total KG` juntos.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Generar una cotizacion con carga suelta y confirmar los valores por linea y
    totales en el PDF principal y en el anexo de cargas extensas.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-16 - QUO-016 - Cambio de cliente al editar cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega el selector reutilizable de clientes a la edicion de cotizaciones.
  - Guarda `cliente_id` en la cotizacion y autocompleta nombre, correo y
    telefono de contacto al seleccionar un cliente diferente.
  - Registra en `activity_logs` el cliente anterior y el nuevo cuando cambia.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Editar una cotizacion, cambiar el cliente, guardar y confirmar el nuevo
    cliente, los datos de contacto y el registro `change_client`.
- Riesgos pendientes:
  - Las entidades operativas ya creadas conservan su cliente propio; la edicion
    cambia la cotizacion y notifica a Operaciones si existe una SI activa.
- Commit: pendiente.

### 2026-07-15 - UX-014 - Desglose visible del Costo Base Sari

- Estado: En validacion.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - La seccion Construccion de Tarifa muestra dentro de Costo Base Sari el
    desglose en tiempo real de flete, EXW, MBL/documentacion y profit del
    agente.
  - Para Aereo Consolidado muestra peso real, peso volumetrico con divisor
    IATA 6000 (`largo * ancho * alto / 6000`, equivalente a
    `CBM * 166.6667`), peso cobrable (`MAX(real, volumetrico)`) y la
    multiplicacion por tarifa/KG.
  - El desglose usa exactamente los mismos valores que forman
    `agentTotalCost`, evitando costos cargados silenciosamente por el catalogo
    del agente.
  - La tarjeta limita su ancho en escritorio para facilitar la lectura de cada
    concepto junto a su monto, manteniendo ancho completo en pantallas
    pequenas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir Pricing Comparison con una cotizacion Aereo Consolidado y confirmar
    que los componentes del desglose suman el Costo Base Sari.
  - Revisar el comportamiento responsive de la tabla en movil.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-16 - PRC-015 - Impresion horizontal de costos de agentes FCL

- Estado: En validacion
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega la accion `Imprimir Costos Agentes` al comparativo en tabla FCL.
  - Genera una vista exclusiva de impresion en A4 horizontal, conserva los
    indicadores de mejor costo y menor transito y convierte los campos
    editables a importes legibles.
  - Fuerza la impresion de fondos y colores para distinguir visualmente mejor
    costo, menor transito y tarifa seleccionada aun sin graficos de fondo.
  - Evita repetir el nombre cuando el codigo y el nombre comercial de la
    naviera son iguales (por ejemplo, `MSC MSC`).
  - Abre el documento imprimible en una pestaña nueva y la mantiene disponible
    despues del dialogo para volver a imprimirlo o guardarlo como PDF.
  - Limita y centra la previsualizacion en pantalla para aproximarla al ancho
    de una hoja A4 horizontal, sin reducir el espacio disponible al imprimir.
  - Resalta toda la fila `TOTAL` con fondo azul, bordes reforzados y tipografia
    uniforme en negrita para todas las tarifas.
  - Alinea a la derecha el encabezado y todas las etiquetas de la columna
    `Concepto` para mejorar su separacion visual de los importes.
  - Unifica el carrier impreso en una sola etiqueta con el nombre comercial y
    su color de marca, evitando combinaciones visuales como `CMA CMA CGM` o
    `MSK Maersk`.
  - Muestra junto a la linea de seguro un tooltip temporal con el detalle
    persistido de su formula al pasar el cursor o enfocar el indicador.
  - Al editar tarifas FCL reconcilia las lineas historicas del agente con los
    contenedores vigentes por ID o tipo, evitando que el nuevo flete se agregue
    al anterior en lugar de reemplazarlo.
  - En Aereo Consolidado permite alternar entre tarifa por KG y costo `All In`;
    calcula automaticamente el equivalente por KG facturable y conserva el
    costo total normalizado para tarjetas, margenes y seleccion de tarifa.
  - El detalle del calculo aereo respeta la moneda de la tarifa del agente en
    lugar de rotular siempre los importes como USD.
  - Excluye de la impresion los controles de seleccion de tarifa.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir un comparativo FCL con varias tarifas, imprimir/guardar como PDF y
    confirmar legibilidad, orientacion horizontal e importes ajustados.
- Riesgos pendientes:
  - El escalado final puede variar segun el navegador y la cantidad de agentes.
- Commit: pendiente.

### 2026-07-15 - UX-015 - Cargos opcionales del cliente desplegables

- Estado: En validacion.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - La seccion Cargos opcionales del cliente incorpora un control accesible
    para mostrar u ocultar su contenido.
  - En cotizaciones `other_origin_air` inicia cerrada; para los demas
    productos permanece abierta por defecto.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Confirmar que Aereo Consolidado de otros origenes inicia cerrado y que el
    boton Mostrar/Ocultar conserva disponibles las acciones Agregar.
  - Revisar el encabezado y el control en pantalla movil.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-13 - ENV-001 - Ambiente tecnico Supabase staging aislado

- Estado: Disponible, no conectado a la aplicacion local
- Proyecto: `sarierp-staging` (`wlssekvxpfxhwedsjhpz`), region `us-east-1`.
- SQL: las 38 migraciones versionadas de `supabase/migrations` fueron aplicadas
  exitosamente al proyecto staging; Produccion no fue modificada.
- Validaciones:
  - `npx supabase db push --linked --dry-run`: base remota al dia.
  - Staging quedo sincronizado y disponible para uso futuro.
- Verificacion pendiente:
  - Configurar la aplicacion local con URL y anon key de staging.
  - Crear usuarios de prueba por rol y `CLI-00001 - Inversiones Dennis`.
- Decision operativa 2026-07-13:
  - Por solicitud del titular, `.env.local` y Supabase CLI fueron restaurados
    a Produccion (`fwspgdzvlbtbgiupvrzo`).
  - Las pruebas manuales continuaran exclusivamente con
    `CLI-00001 - Inversiones Dennis`.
- Riesgos pendientes:
  - Antes de cada prueba se debe confirmar cliente, usuario y alcance. Los
    movimientos financieros se revierten mediante el flujo auditado; no se
    eliminan fisicamente para ocultar pruebas.
- Commit: pendiente.

## Reglas del registro

- No eliminar hallazgos completados; conservarlos como historial.
- No marcar `Completado` si falta SQL, RLS, pruebas o una acción manual.
- Registrar por separado código desplegado y SQL ejecutado.
- Todo SQL nuevo debe ser una migración versionada e idempotente.
- Toda corrección debe ejecutar, como mínimo:
  - `npx tsc --noEmit`
  - `npm run lint`
  - pruebas relacionadas
  - `npm run build` antes de cerrar una fase
- Estados permitidos: `Pendiente`, `En progreso`, `Bloqueado`, `En validación`,
  `Completado`.

## Baseline de auditoría

Fecha: 22/06/2026

| Validación | Resultado inicial |
|---|---|
| TypeScript | Correcto |
| Build de producción | Correcto |
| ESLint | 277 errores, 94 advertencias en baseline; 95 en validación de Fase 0 |
| Pruebas automatizadas | 0 archivos |
| npm audit | 2 vulnerabilidades moderadas |
| Migraciones | 64 SQL manuales, sin runner formal |
| Esquema real vs registro | Se detectó deriva en Fase 21 |

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Baseline, backup y auditoría real de esquema/RLS | Completado |
| 1 | Seguridad, RLS y escalamiento de usuarios | Completado |
| 2 | Migraciones y constraints de integridad | Completado |
| 3 | Autenticación SSR, sesión y permisos | Completado |
| 4 | Facturación, CAI, CxC, CxP y pagos | En progreso |
| 5 | Transacciones de cotización, pricing y operaciones | En progreso |
| 6 | Miami: embarques persistentes e historial | En progreso |
| 7 | Estados, alertas y notificaciones | Pendiente |
| 8 | Reportes, dashboards, monedas, GP y fechas | Pendiente |
| 9 | UX, responsive y protección de formularios | Pendiente |
| 10 | Calidad, modularización, documentación y CI | Pendiente |
| 11 | Ambiente Trial aislado | Pendiente |
| 12 | E2E, UAT freight-forwarding y release | Pendiente |

## Hallazgos

### Seguridad y acceso

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| SEC-001 | RLS de `agent_quotes` y `pricing_items` permite acceso a cualquier usuario aprobado, incluido Cliente | Crítica | Completado |
| SEC-002 | RLS de `client_rates` puede exponer o permitir modificar tarifas privadas | Crítica | Completado |
| SEC-003 | `garantias_navieras` tiene RLS activo pero ninguna política; queda bloqueada para usuarios autenticados | Alta | Completado |
| SEC-004 | Verificar posible escalamiento mediante onboarding, metadata y escritura de `profiles` | Crítica | Completado |
| SEC-005 | Protección de rutas solo del lado cliente; proxy no usa sesión SSR real | Alta | Completado |
| SEC-006 | Cliente puede intentar acceder a Settings/CAI por excepción global de permisos | Alta | Completado |
| SEC-007 | Políticas de `notifications` y `profiles` no están completamente versionadas | Alta | Completado |
| SEC-008 | Auditar funciones `SECURITY DEFINER`, grants y `search_path` | Alta | Completado |
| SEC-009 | Políticas `USING/WITH CHECK (true)` permiten acceso total autenticado en agentes, catálogos, historial, validación de costos y borradores BL | Crítica | Completado |
| SEC-010 | Las 55 tablas y funciones públicas conservan grants `ALL` para `anon`; RLS reduce el impacto pero amplía innecesariamente la superficie | Alta | Completado |
| SEC-011 | Cinco funciones `SECURITY DEFINER` no fijan `search_path`: `auto_match_pre_alert`, `generate_quotation_number`, `handle_new_quotation_status_history`, `handle_new_user` y `prevent_role_change_by_non_admin` | Crítica | Completado |
| SEC-012 | Invitaciones ignoran el rol elegido y onboarding intenta autoaprobar/cambiar rol contra RLS | Crítica | Completado |
| SEC-013 | Portal no permite solicitar Cliente y el alta pública no distingue acceso interno de acceso cliente | Alta | Completado |
| SEC-014 | Invitado aprobado no puede iniciar sesión porque onboarding no establece contraseña | Alta | Completado |
| SEC-015 | Portal no ofrece recuperación segura de contraseña ni callback PKCE | Alta | Completado |
| SEC-016 | Portal de envíos abre tablas internas y puede exponer notas/contactos operativos | Crítica | En validación |

### Integridad y finanzas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FIN-001 | Se permiten documentos fiscales sin CAI activo | Crítica | Completado |
| FIN-002 | Numeración CAI se calcula en cliente y es vulnerable a concurrencia | Crítica | Completado |
| FIN-003 | Activación de CAI no es atómica y no garantiza uno solo | Crítica | Completado |
| FIN-004 | Pago y cambio de estado se guardan en operaciones separadas | Alta | En validación |
| FIN-005 | Pagos pueden eliminarse físicamente sin reverso ni auditoría suficiente | Alta | En validación |
| FIN-006 | Cuentas por cobrar ignora pagos parciales, NC y ND en reportes | Alta | En validación |
| FIN-007 | Facturas vencidas no actualizan estado automáticamente | Alta | En validación |
| FIN-008 | CxP puede generarse varias veces desde la misma cotización | Alta | Completado |
| FIN-009 | Falta segregación creador/aprobador/pagador | Media | Pendiente |
| FIN-010 | Validar tratamiento de ISV en costo real y GP con Contabilidad | Media | Pendiente |
| FIN-011 | Implementar fase pendiente de retenciones ISV después del hardening | Media | Pendiente |

### Flujos y datos

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FLOW-001 | Estados legacy y actuales de cotización no coinciden | Crítica | En validación |
| FLOW-002 | Selección de tarifa y regeneración de pricing no son atómicas | Crítica | En validación |
| FLOW-003 | Operaciones `delete + insert` pueden perder contenedores, carga, BL o pricing | Crítica | En validación |
| FLOW-004 | Creación de cotización y tablas hijas no tiene rollback | Alta | En validación |
| FLOW-005 | Repricing puede actualizar SI y bookings parcialmente | Alta | En validación |
| FLOW-006 | No existe constraint de una tarifa seleccionada por cotización | Alta | Completado |
| FLOW-007 | No existe protección suficiente contra SI/CxP/proveedor duplicados | Alta | Completado |
| FLOW-008 | Numeración de manifiestos basada en `COUNT` es concurrente | Alta | Completado |
| FLOW-009 | Código muerto en duplicación de cotización | Baja | En validación |
| FLOW-010 | `pricing_items_delete_policy` solo permite Admin; DELETE silencioso acumula pricing Miami en cada guardado | Crítica | En validación |

### Miami y tracking

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| MIA-001 | Lista de embarque no crea un embarque/consolidación persistente | Alta | En validación |
| MIA-002 | Paquetes no conservan historial completo de milestones | Alta | En validación |
| MIA-003 | Falta vincular paquetes con vuelo, camión, contenedor o despacho | Alta | En validación |
| MIA-004 | Falta POD, reversos controlados y auditoría por evento | Media | En validación |
| MIA-005 | Agregar CHECK de `tipo_carga` y `cargo_status` al esquema real | Alta | Completado |
| MIA-006 | Revisar unicidad y tratamiento de tracking duplicado | Media | Completado |

### Bugs funcionales

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| BUG-001 | Reporte Pagos a Proveedores tiene código inalcanzable | Alta | En validación |
| BUG-002 | Notificaciones de tarifa vencida filtran estado legacy `Cotizada` | Alta | En validación |
| BUG-003 | Proveedores busca cotizaciones legacy `Aprobada` | Alta | En validación |
| BUG-004 | `/profile` no está autorizado para roles no Admin | Alta | Completado |
| BUG-005 | Tutorial Admin enlaza `/users` en vez de `/admin/users` | Media | Completado |
| BUG-006 | Sidebar cuenta notificaciones que nunca se marcan como leídas | Alta | En validación |
| BUG-007 | Tres sistemas de notificación están desconectados | Alta | Pendiente |

### Reportes y fechas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| REP-001 | Reportes pueden sumar USD y HNL y etiquetar con una sola moneda | Crítica | En validación |
| REP-002 | Dashboard financiero llama Revenue a venta cotizada, no facturada | Alta | En validación |
| REP-003 | GP real mezcla operaciones con y sin costos reales completos | Alta | En validación |
| REP-004 | Filtros usan fecha de creación en lugar de fecha de negocio | Media | Pendiente |
| REP-005 | Uso de UTC puede adelantar fechas un día en Guatemala | Alta | En progreso |
| REP-006 | Fechas `DATE` pueden mostrarse como el día anterior | Alta | En progreso |
| REP-007 | Crear helper único de fecha, moneda y tipo de cambio | Alta | En progreso |

### UX y documentación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| UX-001 | ERP interno no tiene sidebar/navegación móvil | Alta | En validación |
| UX-002 | Eliminaciones sensibles no piden confirmación | Alta | En validación |
| UX-003 | Formularios largos no tienen autosave ni guard de cambios | Alta | En validación |
| UX-004 | Filtros activos mantienen estilos inconsistentes | Media | Completado |
| UX-005 | Branding del sidebar difiere de configuraciones anteriores | Baja | Pendiente |
| UX-006 | Documento raíz usa `lang="en"` en una aplicación española | Baja | Completado |
| UX-007 | Revisar campos operativos del PDF por modalidad | Alta | Pendiente |
| UX-008 | Mejorar errores, loaders, navegación y accesibilidad | Media | Pendiente |

### Calidad y operación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| QA-001 | ESLint inicia con 277 errores y 94 advertencias | Alta | Pendiente |
| QA-002 | No existen pruebas automatizadas | Crítica | Pendiente |
| QA-003 | No existe CI como puerta de calidad | Alta | Pendiente |
| QA-004 | Páginas críticas superan 1,000–4,900 líneas | Alta | Pendiente |
| QA-005 | Uso extendido de `any` y casts inseguros | Alta | Pendiente |
| QA-006 | README continúa siendo el de `create-next-app` | Media | Completado |
| QA-007 | No existe un runner formal de migraciones | Crítica | Pendiente |
| QA-008 | `AGENTS.md`, `PHASES.md`, estados y código están desalineados | Alta | Pendiente |
| QA-009 | Auditoría npm mantiene dos vulnerabilidades moderadas sin fix | Media | Completado |

### Legal y privacidad

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| LEG-001 | La página pública no identifica todavía denominación legal, RTN/ID y domicilio contractual de DHer | Crítica | Bloqueado por datos del titular |
| LEG-002 | SLA, respaldos, retención, exportación y eliminación deben reflejar capacidades y planes realmente ofrecidos | Alta | Pendiente de definición comercial |
| LEG-003 | Términos, privacidad, tratamiento de datos y limitación de responsabilidad requieren revisión de abogado hondureño | Alta | En validación jurídica |
| LEG-004 | Falta registrar versión y aceptación expresa de términos por organización/usuario | Alta | Pendiente |

## Ambiente Trial

El Trial se implementará después de completar las fases 0–10.

### Requisitos

- Deployment y Supabase separados de producción.
- Cero datos reales de Sari Express.
- Workspace aislado por prospecto.
- Registro autónomo con correo verificado.
- Vigencia configurable de 3, 7, 14 o 30 días.
- Dataset ficticio precargado.
- Banner de días restantes.
- Expiración y bloqueo automáticos.
- Panel interno para extender, revocar o convertir trials.
- Rate limiting, protección antiabuso y auditoría.
- Emails de bienvenida, recordatorio y expiración.

### Decisión Supabase Pro

Estado: `Pendiente de evaluación en Fase 11`.

Antes de adquirir Supabase Pro se evaluará:

- Si el ambiente Trial requiere proyecto separado permanente.
- Cantidad esperada de trials simultáneos.
- Necesidad de branching, PITR, backups y retención de logs.
- Uso estimado de base de datos, storage, realtime y funciones.
- Necesidad de cron y límites de ejecución.
- Costo de un proyecto demo compartido con workspaces frente a proyectos
  aislados por prospecto.

No se recomienda comprar un plan únicamente por anticipación. La decisión se
tomará con la arquitectura Trial definida y una estimación real de uso.

## Bitácora de cambios

Agregar una entrada por fix:

```md
### YYYY-MM-DD — ID — Título

- Estado: En validación | Completado
- Código:
  - `ruta/archivo.ts`
- SQL:
  - `sql/YYYYMMDD_descripcion.sql`
- Validaciones:
  - `npx tsc --noEmit`: OK
  - `npm run lint`: OK / deuda restante documentada
  - Tests: descripción
  - Build: OK
- Verificación manual/RLS: descripción
- Riesgos pendientes: ninguno / detalle
- Commit: hash pendiente
```

### 2026-06-22 — BASELINE — Registro inicial

- Estado: Completado
- Se creó el plan maestro de hardening y ambiente Trial.
- Se registraron los hallazgos iniciales de la auditoría integral.
- Se añadió a `AGENTS.md` la obligación de mantener esta bitácora.
- Supabase Pro queda pendiente de evaluación en Fase 11.
- Commit: `f591015`

### 2026-06-22 — LEGAL — Términos de uso y privacidad

- Estado: En validación jurídica; no marcar como versión contractual final.
- Código:
  - `src/app/politicas/page.tsx`
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - ESLint: cero errores; una advertencia previa de `<img>` en la landing.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se separaron alcance contractual, privacidad, subprocesadores, cookies,
    retención, documentos logísticos, propiedad intelectual, confidencialidad,
    responsabilidad, terminación, Trial y ley aplicable.
  - Se eliminaron promesas absolutas de disponibilidad, seguridad, retención y
    respuesta que no estaban ligadas a un SLA o contrato.
- Pendiente del titular:
  - Denominación legal, RTN/identificación y domicilio de DHer.
  - Jurisdicción/ciudad o cláusula arbitral, política real de backups/retención,
    SLA ofrecido y confirmación de correos/dominio.
  - Revisión y aprobación por abogado hondureño.
- Commit: `5f263b9`

### 2026-06-22 — FASE-1 — Settings, perfiles y notificaciones

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/lib/permissions.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/lib/notifications.ts`
- SQL:
  - `supabase/migrations/20260622210000_phase1_notifications_profiles.sql`
- Pruebas:
  - `supabase/tests/phase1_notifications_profiles.sql`
  - `supabase db reset --local`: OK.
  - Suites RLS de Fase 1: OK, con rollback.
  - `supabase db lint --local --level error`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos TypeScript modificados: OK.
- Cambios:
  - Settings Empresa queda disponible al personal interno; CAI solo a
    Admin/Contabilidad/Finanzas; Cliente vuelve al portal sin bucle.
  - Matching de rutas exige segmento completo y evita prefijos accidentales.
  - Directorio de perfiles excluye Cliente y pendientes para roles no Admin.
  - Notificaciones internas se crean mediante RPC autorizada y el usuario solo
    puede cambiar `is_read`.
  - Notificaciones de portal permiten inserción de Admin/Operaciones y Cliente
    solo puede cambiar `read_at`.
- Producción:
  - Migración aplicada y registrada como `20260622210000`.
  - Historial local/remoto alineado y `db push --dry-run` sin pendientes.
- Commit: `f8e209e`

### 2026-06-22 — UI — Filtros, navegación y alertas

- Estado: Completado
- Código:
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/topbar.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
- Cambios:
  - Presets activos azules y estado personalizado en ambos dashboards.
  - Match exacto de Dashboard Bodega para no activarlo en Manifiestos.
  - Badge superior basado en alertas altas nuevas, persistido por usuario.
- Commit: `0a0038d`

### 2026-06-22 — NEXT-001 — Convención Proxy

- Estado: Completado
- Código:
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; Next reconoce `Proxy (Middleware)`.
- Cambio:
  - Se migró `middleware.ts` a la convención `proxy.ts` de Next.js 16.
- Riesgo pendiente:
  - SEC-005: todavía requiere migrar la sesión a SSR real.
- Commit: `4d3a5c7`

### 2026-06-22 — UX — Landing de freight forwarders

- Estado: Completado
- Código:
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - ESLint del archivo: cero errores, una advertencia por imagen externa.
- Commit: `897a1d0`

### 2026-06-22 — UX — Paginación y filtros reutilizables

- Estado: Completado
- Código:
  - `src/components/ui/Pagination.tsx`
  - `src/lib/ui-classes.ts`
  - Listados de CxP, clientes, histórico, facturación, inventario y operaciones.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - Reinicio de página movido a eventos de filtro para evitar renders en cascada.
- Commit: `b995bd9`

### 2026-06-22 — FASE-0 — Baseline reproducible y auditoría real

- Estado: Completado
- Código/configuración:
  - `package.json`: Supabase CLI 2.107.0 agregado como devDependency.
  - `package-lock.json`: dependencia bloqueada.
  - `supabase/config.toml`: configuración local inicial creada.
  - `supabase/seed.sql`: seed local vacío para evitar datos reales.
  - `.gitignore`: carpeta `/backups/` excluida de Git.
- Verificaciones:
  - CLI ejecutable con `npx supabase --version`: 2.107.0.
  - Proyecto vinculado coincide con `NEXT_PUBLIC_SUPABASE_URL`.
  - Metadata local `.temp` correctamente ignorada por Git.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK (solo avisos esperados de CRLF en Windows).
  - Docker Desktop y WSL 2 instalados; Docker Engine verificado.
  - Backup remoto de roles, esquema y datos completado en `/backups/`.
  - Migración baseline creada: `supabase/migrations/20260622175445_baseline.sql`.
  - Historial local y remoto alineado en `20260622175445`.
  - `supabase start`: stack local iniciado correctamente.
  - `supabase db reset --local`: reconstrucción desde cero completada.
  - Diff `migrations -> linked` para `public`: sin diferencias.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK (Next.js 16.2.6, 57 páginas estáticas).
  - `npm run lint`: deuda existente, 277 errores y 95 advertencias.
- Riesgos observados:
  - El dump de datos advierte relaciones circulares en `profiles`,
    `quotations`, `bills_of_lading`, `invoices`, `cuentas_pagar` y
    `clientes`; la restauración local debe validarse con constraints/triggers.
  - 55/55 tablas tienen RLS habilitado; `garantias_navieras` no tiene políticas.
  - Se detectaron 22 políticas con expresiones permisivas `true`.
  - Se detectaron grants `ALL` a `anon` en las 55 tablas públicas.
  - 38 funciones son `SECURITY DEFINER`; cinco no fijan `search_path`.
- Próximo paso:
  - Fase 1: corregir RLS, funciones privilegiadas, grants y escalamiento de rol.
- Commit: `f591015`

### 2026-06-22 — FASE-1 — Hardening inicial de RLS y perfiles

- Estado: Completado y aplicado en remoto; SEC-005 continúa en Fase 3 (SSR).
- SQL:
  - `supabase/migrations/20260622190000_phase1_rls_hardening.sql`
- Pruebas:
  - `supabase/tests/phase1_rls.sql`
  - Matriz validada para Admin, Pricing, Ventas, Operaciones, Contabilidad,
    Finanzas, Cliente y anon.
  - `supabase db reset --local`: OK.
  - Prueba RLS transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
- Cambios principales:
  - Se agregaron los roles de esquema `Finanzas` y `Cliente` ya usados por UI.
  - Cliente dejó de calificarse como usuario interno aprobado.
  - Se bloqueó la edición propia de rol, aprobación, actividad y vínculo cliente.
  - Agentes, catálogos, costos, historial, BL y garantías usan la matriz aprobada.
  - Funciones privilegiadas fijan `search_path` y `anon` solo puede crear leads.
- Producción:
  - Migración aplicada y registrada como `20260622190000`.
  - `supabase db push --dry-run`: base remota al día.
  - Dump remoto posterior: 36 políticas nuevas, cero políticas legacy abiertas.
  - `anon`: únicamente `USAGE` del esquema e `INSERT` sobre `leads`.
  - El warning posterior de caché `pg-delta` no afectó la migración; se desactivó
    el motor experimental local para usar `migra` de forma estable.
- Commit: `f591015`

### 2026-06-22 — FASE-2 — Integridad inicial de Miami

- Estado: En validación; aplicado en remoto, pendiente de auditar y limpiar datos legacy.
- SQL:
  - `supabase/migrations/20260622223000_phase2_miami_integrity.sql`
  - `supabase/preflight/phase2_integrity_audit.sql`
- Pruebas:
  - `supabase/tests/phase2_miami_integrity.sql`
  - `supabase db reset --local`: OK.
  - Prueba transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: deuda global preexistente, 277 errores y 93 advertencias;
    los archivos de esta entrega son SQL y documentación.
- Cambios:
  - La numeración de manifiestos deja de depender de `COUNT` y usa una secuencia
    global protegida, segura ante solicitudes concurrentes.
  - El RPC de numeración queda restringido a Admin y Operaciones.
  - Se agregan constraints `NOT VALID` para tipo de carga, estado, medidas no
    negativas y total de paquetes no negativo; protegen escrituras nuevas sin
    bloquear todavía por datos legacy.
  - El preflight audita duplicados y valores inválidos antes de imponer o validar
    constraints adicionales sobre pricing, SI, CxP, tracking y Miami.
- Riesgos pendientes:
  - Ejecutar el preflight contra remoto y limpiar cualquier fila reportada.
  - Validar los constraints después de la limpieza.
  - Los números de secuencia pueden tener saltos; esto es esperado y evita
    reutilizar identificadores tras errores o transacciones revertidas.
- Producción:
  - Migración aplicada y registrada como `20260622223000`.
  - `supabase db push --linked --dry-run`: remoto al día.
- Commit: `c1cb17a`

### 2026-06-22 — FASE-2 — Constraints validados y unicidad operativa

- Estado: Completado para FLOW-006, FLOW-008 y MIA-005; FLOW-007 continúa
  en progreso por la generación idempotente de CxP pendiente.
- SQL:
  - `supabase/migrations/20260622231500_phase2_validate_integrity.sql`
- Pruebas:
  - Preflight remoto: ocho verificaciones con cero grupos en conflicto.
  - `supabase/tests/phase2_validated_integrity.sql`: OK, con rollback.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se validaron los cuatro constraints de tipo, estado y cantidades de Miami.
  - Solo puede existir una tarifa activa seleccionada por cotización.
  - Solo puede existir una Shipping Instruction activa por cotización.
  - Una factura AP no anulada no puede repetir su número para el mismo proveedor;
    la comparación ignora mayúsculas y espacios exteriores.
- Decisiones de dominio:
  - No se hizo único el tracking: varias piezas pueden compartir referencia.
  - No se hizo única la combinación proveedor/factura en líneas de costo real:
    una factura puede contener varios conceptos legítimos.
- Producción:
  - Migración aplicada y registrada como `20260622231500`.
- Riesgo pendiente:
  - La creación automática de CxP desde una cotización necesita una clave de
    idempotencia/RPC transaccional para distinguir duplicados de costos legítimos.
- Commit: `0d114b2`

### 2026-06-22 — FASE-2 — CxP de flete idempotente

- Estado: Completado; cierra FIN-008 y FLOW-007 y completa la Fase 2.
- Código:
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260622234500_phase2_idempotent_freight_payable.sql`
- Pruebas:
  - `supabase/tests/phase2_idempotent_freight_payable.sql`: OK, con rollback.
  - Dos llamadas consecutivas retornan el mismo ID y solo una crea la CxP.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - ESLint del archivo modificado conserva deuda previa: 10 errores y 11
    advertencias; el bloque nuevo no introduce `any` ni efectos adicionales.
- Cambios:
  - La CxP automática se crea mediante un RPC transaccional autorizado solo para
    Admin, Finanzas y Contabilidad.
  - Una clave de generación por cotización evita duplicados por doble clic,
    reintentos o solicitudes concurrentes sin bloquear otros costos legítimos.
  - El RPC valida cotización Ganada, tarifa seleccionada, costo positivo y un
    único proveedor activo vinculado al agente.
  - La UI informa si creó la CxP o si ya existía.
- Producción:
  - Migración aplicada y registrada como `20260622234500`.
- Riesgos pendientes:
  - Si un agente tiene más de un proveedor activo vinculado, el RPC lo bloquea
    con un error explícito hasta corregir el catálogo.
- Commit: `5bc4e71`

### 2026-06-22 — FASE-3 — Sesión SSR y protección de rutas

- Estado: En validación; protección anónima comprobada, pendiente de prueba manual
  con sesiones reales de personal y Cliente antes de cerrar SEC-005.
- Código:
  - `src/proxy.ts`
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/hooks/useUser.tsx`
  - `src/app/portal/layout.tsx`
  - Páginas del portal ajustadas para identidad nullable segura.
  - `src/lib/permissions.ts`
  - `src/components/onboarding/OnboardingTutorial.tsx`
- Dependencias:
  - Se agregó `@supabase/ssr` 0.12.0.
  - Se eliminó `@supabase/auth-helpers-nextjs`.
  - `@supabase/supabase-js` resolvió a 2.108.2, compatible con el peer de SSR.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 rutas; las rutas ERP ahora son dinámicas por sesión.
  - ESLint de los archivos modificados: cero errores, siete advertencias legacy.
  - `npm run lint`: deuda global reducida a 268 errores y 89 advertencias.
  - `npm audit --omit=dev`: dos vulnerabilidades moderadas heredadas de PostCSS
    dentro de Next; no se ejecutó `--force` porque propone un downgrade rompedor.
  - HTTP local sin sesión:
    - `/login`, `/portal/login` y `/politicas`: 200.
    - `/dashboard` y `/miami/inventario`: 307 a `/login`.
    - `/portal`: 307 a `/portal/login`.
- Cambios:
  - Las sesiones pasan de `localStorage` a cookies gestionadas por Supabase SSR.
  - Proxy valida claims, refresca cookies y bloquea rutas privadas antes del render.
  - El layout ERP vuelve a comprobar usuario y perfil aprobado/activo en servidor.
  - Cliente no puede renderizar el ERP interno y se redirige a `/portal`.
  - `useUser` comparte una sola carga de identidad por árbol, evitando decenas de
    consultas duplicadas por página.
  - `/portal/login` deja de quedar bloqueado por el layout autenticado del portal.
  - Perfil queda disponible para todos los roles internos y el tutorial Admin usa
    `/admin/users`.
- Riesgos pendientes:
  - Los usuarios con una sesión legacy en `localStorage` deberán iniciar sesión de
    nuevo para crear la cookie SSR.
  - Probar login/logout y expiración con Admin, rol interno y Cliente reales.
  - La autorización fina de rutas sigue complementada por RLS y el guard de rol;
    se revisará la estrategia de permisos de servidor antes de cerrar la fase.
- Commit: `b833e8f`

### 2026-06-22 — SEC-012 — Invitaciones y onboarding autorizados

- Estado: Completado en código; el envío real de correo depende de la
  configuración SMTP/redirect URL de Supabase.
- Código:
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores y cero advertencias.
  - `npm run build`: OK, 58 rutas.
- Cambios:
  - El backend Admin asigna y aprueba el rol seleccionado después de invitar.
  - Las invitaciones ahora admiten también Cliente, coherente con el selector UI.
  - Onboarding solo actualiza nombre, apellido y correo; ya no intenta escalar rol,
    estado ni actividad desde una sesión no administrativa.
- Riesgos pendientes:
  - Probar entrega de invitación y callback con `NEXT_PUBLIC_SITE_URL` del ambiente.
  - Un Cliente invitado debe vincularse a un registro de cliente para ver datos.
- Commit: `80e7e5f`

### 2026-06-22 — SEC-013 — Registro e invitación de clientes

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/portal/register/page.tsx`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/app/(protected)/admin/users/page.tsx`
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
  - `src/proxy.ts`
- SQL:
  - `supabase/migrations/20260622235900_phase3_client_registration.sql`
- Pruebas:
  - `supabase/tests/phase3_client_registration.sql`: OK, con rollback.
  - Solicitud Cliente crea perfil `Cliente/Pendiente`, sin aprobación ni vínculo.
  - Metadata que solicita Admin se degrada a `Ventas/Pendiente`.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Portal Login ofrece “Solicitar cuenta” y `/portal/register` recopila persona,
    empresa, teléfono, correo y contraseña.
  - El registro público solo puede pedir Cliente y siempre queda Pendiente.
  - Admin ve empresa/teléfono, vincula el perfil a `clientes` y solo entonces
    puede aprobarlo.
  - “Invitar usuario” incluye Cliente; las invitaciones Cliente también quedan
    pendientes de vínculo, mientras los roles internos conservan alta directa.
  - Onboarding respeta rol/estado asignados por Admin y nunca se autoaprueba.
- Producción:
  - Migración aplicada y registrada como `20260622235900`.
- Riesgos pendientes:
  - Verificar política real de confirmación de correo y SMTP en Supabase Auth.
  - Probar manualmente solicitud, vínculo, aprobación y primer login Cliente.
- Commit: `1f7531f`

### 2026-06-23 — SEC-014 — Contraseña de invitado y caché de perfiles

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/onboarding/page.tsx`
- SQL:
  - `supabase/migrations/20260623001500_phase3_profile_schema_cache.sql`
- Validaciones:
  - Migración local: OK; columnas ya existentes confirmadas.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de onboarding: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Onboarding exige crear y confirmar una contraseña de al menos 8 caracteres
    antes de completar el perfil invitado.
  - Se fuerza `pgrst reload schema` para que la API reconozca inmediatamente
    `registration_company` y `registration_phone`.
- Producción:
  - Migración aplicada como `20260623001500`; ambas columnas ya existían, lo que
    confirmó que el error observado era caché de PostgREST.
- Acción manual:
  - El invitado existente debe abrir su correo de invitación y completar
    onboarding para establecer contraseña; aprobarlo no genera una contraseña.
- Commit: `37da8d4`

### 2026-06-23 — SEC-015 — Recuperación de contraseña Cliente

- Estado: Completado en código; pendiente verificar entrega real del correo.
- Código:
  - `src/app/portal/forgot-password/page.tsx`
  - `src/app/portal/reset-password/page.tsx`
  - `src/app/auth/callback/route.ts`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 62 rutas.
  - Se corrigió el requisito Next 16 de `Suspense` para `useSearchParams`.
- Cambios:
  - Portal Login incorpora “¿Olvidaste tu contraseña?”.
  - El formulario envía un correo sin revelar si la cuenta existe.
  - `/auth/callback` intercambia el código PKCE por una sesión SSR y solo acepta
    destinos internos bajo `/portal/`.
  - La sesión temporal permite establecer y confirmar una contraseña nueva;
    después se cierra y vuelve al login.
- Acción manual:
  - Autorizar `/auth/callback` para localhost y producción en Supabase Auth URL
    Configuration y probar un correo real.
- Commit: `7d87b1f`

### 2026-06-23 — FASE-3 — Cierre de autenticación y portal Cliente

- Estado: Completado con validación manual del titular.
- Validación manual:
  - Admin inicia sesión y accede a Dashboard/Profile.
  - Logout invalida acceso y `/dashboard` redirige a `/login`.
  - Registro, vínculo, aprobación y acceso Cliente funcionan correctamente.
  - Recuperación de contraseña Cliente envía enlace y permite restablecer acceso.
- Resultado:
  - SEC-005 queda cerrado; sesión SSR, cookies, proxy, perfil activo, permisos y
    portal Cliente fueron comprobados de extremo a extremo.
- Próximo paso:
  - Fase 4: CAI, numeración fiscal, facturación, CxC, CxP y pagos.
- Commit: `aee39c9`

### 2026-06-23 — FASE-4 — Preflight financiero y fiscal

- Estado: Completado; auditoría local y remota sin conflictos.
- SQL:
  - `supabase/preflight/phase4_finance_audit.sql`
- Validaciones:
  - Ejecución contra base local reconstruida: OK, 11 verificaciones.
  - Ejecución manual contra Supabase remoto: OK, 11/11 conteos en cero.
  - El script es de solo lectura y devuelve únicamente conteos agregados.
- Alcance:
  - Rangos CAI activos, formato, orden y vencimiento.
  - Documentos fiscales sin CAI o fuera del rango estampado.
  - Facturas sin líneas o con subtotal inconsistente.
  - Pagos en moneda distinta, sobrepagos y pagos sobre facturas anuladas.
- Próximo paso:
  - Con los conteos remotos, implementar activación CAI atómica, correlativo fiscal
    transaccional y creación conjunta de factura/líneas.
- Commit: `839df3e`

### 2026-06-23 — FASE-4 — CAI y creación fiscal atómica

- Estado: Completado; código y migración aplicados en remoto.
- Hallazgos: FIN-001, FIN-002 y FIN-003.
- Archivos:
  - `supabase/migrations/20260623010000_phase4_cai_atomic.sql`
  - `supabase/tests/phase4_cai_atomic.sql`
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/invoicing/new/page.tsx`
- Cambios:
  - Rangos CAI separados por Factura, Nota de Crédito y Nota de Débito.
  - Activación transaccional con un solo rango activo por tipo documental.
  - Correlativo CAI persistente y bloqueado en base de datos para evitar
    duplicados concurrentes.
  - Factura, líneas, impuestos y avance del correlativo se guardan en una sola
    transacción mediante `create_invoice_with_items`.
  - Proformas usan una secuencia independiente y segura ante concurrencia.
  - La UI ya no calcula números fiscales ni guarda encabezado y líneas por
    separado.
- Validaciones ejecutadas:
  - Preflight remoto: 11/11 verificaciones con cero conflictos.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_cai_atomic.sql`: OK; correlativos consecutivos,
    impuestos, atomicidad, permisos y rollback verificados.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `supabase db push --linked --dry-run`: remoto al día después del despliegue.
- Incidencias detectadas durante pruebas:
  - La primera prueba local detectó una referencia inválida a `clientes.email`;
    se corrigió a `clientes.email_1`. La transacción abortó antes de insertar
    documentos. La segunda ejecución confirmó los correlativos `00000101` y
    `00000102`, y detectó una columna ambigua únicamente en la aserción del test;
    se calificó como `invoice_items.tax_amount`; la tercera ejecución pasó.
- Producción:
  - Migración aplicada y registrada como `20260623010000`.
  - No quedan migraciones locales pendientes contra remoto.
- Riesgo residual:
  - Los tipos y rangos reales deben coincidir con la autorización vigente de SAR
    y ser confirmados por Contabilidad; este hardening no sustituye revisión
    fiscal/legal.
- Commit: `0b5b7e3`

### 2026-06-23 — FASE-4 — Pagos atómicos y reversos auditables

- Estado: En validación manual; migración aplicada en remoto y pruebas
  automatizadas completadas.
- Hallazgos: FIN-004 y FIN-005.
- Archivos:
  - `supabase/migrations/20260623014500_phase4_payment_atomic.sql`
  - `supabase/tests/phase4_payment_atomic.sql`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
- Cambios:
  - Registro de pago, cálculo de saldo, estado y fecha de pago se ejecutan en una
    sola transacción mediante `register_invoice_payment`.
  - Se incorpora el estado `Parcialmente Pagada` para representar cobros reales.
  - Los pagos dejan de eliminarse: `reverse_invoice_payment` conserva el
    movimiento, usuario, fecha y motivo del reverso.
  - Escrituras directas sobre `invoice_payments` quedan revocadas para usuarios
    autenticados; solo los RPC autorizados pueden registrar o revertir.
  - Se bloquean sobrepagos, monedas distintas, fechas futuras, pagos por Ventas,
    anulación con pagos aplicados y estado Pagada con saldo pendiente.
  - CxC, cierre mensual y estado de cuenta excluyen pagos reversados.
  - Registro y reverso generan eventos en `activity_logs`.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_payment_atomic.sql`: OK; pago parcial/total, bloqueo
    de sobrepago/anulación/DELETE, reverso, permisos, auditoría y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - Migración remota aplicada como `20260623014500`.
- Validación manual pendiente:
  - Registrar un pago parcial y completar el saldo desde una factura aprobada.
  - Reversar uno de los pagos indicando motivo y confirmar que permanece visible,
    deja de sumar y recalcula estado/saldo.
  - Confirmar que no se puede anular una factura con pagos aplicados.
- Riesgo residual:
  - Los constraints de monto positivo y moneda válida protegen escrituras nuevas
    como `NOT VALID`; su validación histórica se hará junto al cierre de CxC.
- Commit: `c0c89a6`

---

### 2026-06-23 — FLOW-010 — Fix acumulación de pricing items en flujo Miami

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: FLOW-010.
- Causa raíz: `pricing_items_delete_policy` solo permitía `is_admin()` para DELETE.
  El flujo de guardado Miami en `quotations/[id]/edit` ejecuta DELETE + INSERT para
  reemplazar los pricing items. El DELETE devolvía éxito sin error (Supabase no
  retorna error cuando RLS filtra todas las filas), pero no borraba nada. Cada
  guardado acumulaba un set adicional de items en lugar de reemplazarlos.
- Archivos SQL:
  - `supabase/migrations/20260623030000_fix_pricing_items_delete_rls.sql`
- Cambio:
  - Se reemplaza la política exclusiva de Admin por una matriz explícita para
    Admin, Pricing, Ventas y Operaciones con acceso a la cotización.
  - Contabilidad y Cliente permanecen sin permiso de eliminación.
  - Sigue el mismo patrón de `quotation_cargo_lines_delete_policy` y
    `quotation_containers_delete_policy`.
  - No hay cambios de código TypeScript; el error era exclusivamente de RLS.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - `supabase/tests/phase5_pricing_delete_rls.sql`: OK con cinco roles y rollback.
  - Migración remota aplicada y registrada como `20260623030000`.
- Validación manual pendiente:
  - Abrir una cotización Miami LCL con pricing existente.
  - Guardar desde `/edit` con un monto de pickup distinto.
  - Verificar que el "Detalle de Servicios" en el PDF muestra exactamente un set
    de items (no acumulación).
  - Guardar por segunda vez y confirmar que el set se reemplaza, no se duplica.
- Riesgo residual:
  - La auditoría `supabase/tests/cleanup_duplicate_pricing_items.sql` es de solo
    lectura. No se eliminarán supuestos duplicados sin revisión y respaldo por
    Pricing/Contabilidad.
- Commit: `2f44573`

### 2026-06-23 — FASE-4 — CxC ajustada y vencimientos automáticos

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FIN-006 y FIN-007.
- Archivos:
  - `supabase/migrations/20260623021500_phase4_receivables.sql`
  - `supabase/tests/phase4_receivables.sql`
  - `src/app/(protected)/invoicing/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
- Cambios:
  - `invoice_receivables` centraliza factura menos NC, más ND, menos pagos
    aplicados y excluye pagos reversados.
  - Facturación, detalle, CxC, vencidas y estado de cuenta consumen el saldo
    ajustado en lugar del total bruto.
  - Se agrega estado `Saldada` para facturas compensadas totalmente por NC.
  - Notas nuevas deben pertenecer al mismo cliente y moneda de la factura.
  - Registro/reverso de pagos usa el total ajustado para bloquear sobrepagos.
  - `refresh_invoice_receivable_statuses` y una tarea diaria `pg_cron` a las
    00:05 UTC sincronizan estados vencidos.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones locales presentes.
  - `supabase/tests/phase4_receivables.sql`: OK; NC/ND, pago parcial/final,
    sobrepago, moneda, vencimiento, cron y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las tres páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623021500`.
- Riesgos o trabajo pendiente:
  - Validar manualmente Reportes > Cuentas por cobrar y Vencidas con datos reales.
- Commit: `546fbb2`

### 2026-06-23 — PORTAL — Envíos freight con exposición segura

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: SEC-016.
- Archivos:
  - `supabase/migrations/20260623020000_phase5_portal_shipments.sql`
  - `supabase/tests/phase5_portal_shipments.sql`
  - `src/app/portal/layout.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
- Cambios:
  - El portal incorpora listado, detalle, ruta, hitos, fechas, transporte y
    referencias documentales de los envíos freight del cliente.
  - Se descartaron políticas SELECT directas sobre `quotations` y
    `shipping_instructions`; RLS de filas no protege columnas internas.
  - `get_client_shipments` verifica rol Cliente y vínculo `cliente_id`, y devuelve
    únicamente campos comerciales permitidos.
  - Los contadores usan conteos reales y las fechas evitan desfase UTC/Honduras.
- Validaciones ejecutadas:
  - `supabase/tests/phase5_portal_shipments.sql`: OK; aislamiento entre dos
    clientes, acceso directo bloqueado, columnas internas ausentes y rollback.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a Portal, Facturación y Reportes: OK, sin advertencias.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623020000`.
- Validación manual pendiente:
  - Confirmar listado y detalle con un Cliente que tenga una SI vinculada.
- Commit: `ec786fc`

### 2026-06-24 — Sincronización del historial remoto

- Estado: Completado.
- Acción manual:
  - Se registraron como aplicadas las migraciones `20260623020000`,
    `20260623021500`, `20260623030000` y `20260623040000` después de su ejecución
    satisfactoria en Supabase SQL Editor.
- Validación:
  - `supabase migration list --linked`: Local y Remote coinciden en todas las
    versiones hasta `20260623040000`.
- Riesgos pendientes:
  - Mantener SEC-016, FIN-006/007 y FLOW-010 en validación hasta probar sus flujos
    de interfaz con datos reales.
- Commit: `5c6196a`

### 2026-06-24 — FASE-5 — Selección atómica de tarifa de agente

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FLOW-001 y FLOW-002.
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql`
  - `supabase/tests/phase5_atomic_agent_selection.sql`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/lib/tarifa-expiry-check.ts`
- Cambios:
  - La selección de tarifa, deselección anterior, reemplazo de pricing y
    sincronización comercial se ejecutan en una sola transacción mediante RPC.
  - El RPC valida rol Pricing/Admin, pertenencia de la tarifa, motivo y valores
    no negativos antes de modificar datos, y registra el evento en
    `activity_logs`.
  - Las alertas de vencimiento usan los estados vigentes del flujo en lugar del
    estado legacy `Cotizada`.
  - El proceso global de vencimientos deja de ser ejecutable por `anon` y
    `authenticated`; queda reservado a `service_role` y tareas internas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
  - `supabase db reset --local --yes`: OK desde baseline hasta
    `20260624010000`.
  - `supabase/tests/phase5_atomic_agent_selection.sql`: OK; selección única,
    reemplazo total, sincronización, rollback ante línea inválida y permisos.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260624010000`.
  - `supabase migration list --linked`: historial local/remoto alineado.
  - `supabase db push --linked --dry-run`: remoto actualizado, sin pendientes.
  - ESLint dirigido: conserva 31 errores y 5 advertencias preexistentes del
    archivo histórico de Pricing; el cambio no agrega nuevos usos de `any`.
- Riesgos o trabajo pendiente:
  - Probar manualmente el cambio de tarifa en Pricing Comparison con dos
    alternativas y confirmar el motivo, totales y refresco visual.
- Commit: `8c30148`

### 2026-06-24 — FASE-5 — Corrección: Race condition en selección de tarifa

- Estado: Completado
- Hallazgos: FLOW-002 (race condition)
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql` (modificado)
  - `supabase/migrations/20260624020000_fix_phase5_atomic_selection_race_condition.sql` (migración de corrección)
- Cambios:
  - Se reemplazó el UPDATE combinado `is_selected = (id = p_agent_quote_id)` por dos UPDATEs secuenciales:
    1. Deseleccionar todas las tarifas de la cotización donde `is_selected = true`
    2. Seleccionar solo la nueva tarifa mediante `UPDATE WHERE id = p_agent_quote_id SET is_selected = true`
  - Esto elimina la race condition donde PostgreSQL detectaba `duplicate key value violates unique constraint "agent_quotes_one_selected_per_quotation_idx"` durante cambios de tarifa.
  - La causa raíz era que el UPDATE combinado permitía que PostgreSQL viera temporalmente dos registros con `is_selected = true` en el mismo `quotation_id` durante el apply del índice único.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - Nueva migración `20260624020000` creada y aplicada exitosamente.
  - `supabase migration list --linked`: confirmado sincronización local/remoto en ambas migraciones.
  - Cambio es idempotente y refuerza la integridad del constraint único.
- Riesgos o trabajo pendiente:
  - Ninguno; ya puede seleccionar tarifas sin error de constraint.
- Commit: [en progreso]

### 2026-06-27 — FASE-5 — Sincronización operacional tras cambio de tarifa aceptada

- Estado: En validación manual.
- Hallazgos: FLOW-002, FLOW-003, FLOW-004, FLOW-005 y FLOW-009.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/suppliers/[id]/page.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
- SQL:
  - `supabase/migrations/20260627010000_phase5_atomic_operational_repricing.sql`
    agrega RPC transaccional para sincronizar Shipping Instruction y bookings
    editables desde la tarifa seleccionada.
  - `supabase/migrations/20260627020000_phase5_atomic_quotation_children_replace.sql`
    agrega RPC transaccional para reemplazar contenedores, carga suelta y cargos
    Miami sin riesgo de `delete + insert` parcial.
  - `supabase/migrations/20260627030000_phase5_atomic_quotation_create.sql`
    agrega RPC transaccional para crear cotización con contenedores, carga suelta
    y cargos Miami en una sola operación.
  - `supabase/migrations/20260627040000_phase5_atomic_operations_container_replace.sql`
    agrega RPCs transaccionales para reemplazar contenedores de Booking y BL.
  - `supabase/migrations/20260624030000_sales_activities.sql` ajustada para
    recrear policies de forma idempotente si el remoto quedó parcialmente aplicado.
  - Sin migración nueva para selección de tarifa; depende de `20260624010000_phase5_atomic_agent_selection.sql`
    y `20260624020000_fix_phase5_atomic_selection_race_condition.sql`.
- Cambios:
  - Pricing Comparison prepara y sincroniza agente, contacto, email, carrier, ETD,
    tránsito y días libres hacia la Shipping Instruction afectada.
  - Shipping Instruction permite actualizar datos operativos desde la tarifa
    seleccionada en Pricing cuando una tarifa aceptada debe reemplazarse por
    cancelación o falta de espacio del agente.
  - El Routing Order PDF toma `transshipment` desde la cotización cuando no está
    presente en la ruta.
  - La sincronización operacional desde Pricing/Shipping Instruction deja de hacer
    updates secuenciales desde el cliente y pasa por
    `sync_shipping_instruction_from_selected_agent_quote`.
  - La edición de cotizaciones reemplaza tablas hijas mediante
    `replace_quotation_child_lines`, evitando que una falla de insert deje
    contenedores, carga o pricing eliminados.
  - La creación de cotizaciones usa `create_quotation_with_child_lines` para
    evitar encabezados creados sin contenedores, carga o pricing automático.
  - Operaciones reemplaza contenedores de Booking/BL mediante
    `replace_booking_containers` y `replace_bl_containers`, evitando deletes
    silenciosos bloqueados por RLS y reemplazos parciales.
  - La acción de duplicar cotización usa únicamente
    `/quotations/new?duplicateFrom=...`; el flujo viejo de inserción directa
    queda fuera de ejecución.
  - Proveedores lista cotizaciones `Ganada` para asociar CxP manual, en lugar
    del estado legacy `Aprobada`.
  - Las notificaciones de tarifa vencida ya usan estados vigentes del flujo en
    código y SQL de Fase 5.
  - La migración de actividades comerciales ahora elimina policies existentes
    antes de recrearlas para permitir reintentar `supabase db push`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - Con una cotización ya aprobada, seleccionar una nueva tarifa de agente con
    motivo documentado.
  - Confirmar que queda una sola tarifa `is_selected = true`.
  - Confirmar que la Shipping Instruction y bookings no confirmados reflejan el
    nuevo agente/carrier/ETD/tránsito/días libres.
  - Confirmar que bookings con número confirmado, carrier booking o MBL no se
    sobrescriben silenciosamente.
  - Editar una cotización FCL cambiando contenedores y confirmar reemplazo
    correcto.
  - Editar una cotización LCL/Miami cambiando líneas de carga y confirmar que no
    se pierden líneas si una validación falla.
  - Crear una cotización FCL con múltiples contenedores y confirmar encabezado e
    hijos.
  - Crear una cotización Miami/LCL con líneas de carga y confirmar pricing
    automático.
  - Guardar contenedores de un Booking con rol Operaciones y confirmar reemplazo.
  - Guardar contenedores de un BL con rol Operaciones y confirmar reemplazo.
  - En Proveedores, confirmar que el selector de cotización muestra cotizaciones
    `Ganada`.
  - Ejecutar o verificar la notificación de tarifas vencidas con estados vigentes.
- Riesgos o trabajo pendiente:
  - Si la migración `20260624020000` no está aplicada en Supabase remoto, el cambio
    de tarifa puede seguir fallando por el índice único de tarifa seleccionada.
- Commit: pendiente.

### 2026-07-01 — UX-004 — Estilo unificado de filtros activos

- Estado: Completado.
- Hallazgo: UX-004.
- Causa raíz: los chips de filtro de Alertas y Manifiestos usaban un estilo
  activo gris (`bg-slate-800`), distinto del pill azul estándar que ya usan
  Dashboard, Dashboard Financiero, Reportes, Histórico, Inventario, Embarques,
  Ingreso y Garantías.
- Código:
  - `src/app/(protected)/alerts/page.tsx`
  - `src/app/(protected)/miami/manifiestos/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Los tres grupos de chips adoptan el patrón estándar: activo
    `border-blue-600 bg-blue-600 text-white` (variante dark incluida) e
    inactivo con borde slate sobre fondo blanco.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK (cambio solo de clases CSS).
- Riesgos pendientes:
  - Ninguno.
- Commit: `ef00647`

### 2026-07-01 — UX-003 — Guard de cambios sin guardar en formularios críticos

- Estado: En validación manual; cubre el guard de navegación. El autosave
  queda como mejora posterior.
- Hallazgo: UX-003.
- Causa raíz: los formularios largos (cotización nueva de 2,300+ líneas,
  edición, factura fiscal, clientes, proveedores) perdían todo lo capturado al
  refrescar, cerrar la pestaña o tocar cualquier link del sidebar.
- Código:
  - `src/components/ui/UnsavedChangesGuard.tsx` (nuevo): componente
    auto-contenido que detecta edición vía eventos `input`/`change` del
    documento; muestra el aviso nativo en refresh/cierre (`beforeunload`) e
    intercepta clics en links internos con el `ConfirmDialog` existente
    (sin `window.confirm`, prohibido por AGENTS.md). Exporta `markFormSaved()`
    para páginas que guardan sin navegar.
  - Montado en:
    - `src/app/(protected)/quotations/new/page.tsx` (con `markFormSaved()`
      tras crear, porque la página permanece y resetea el formulario)
    - `src/app/(protected)/quotations/[id]/edit/page.tsx`
    - `src/app/(protected)/invoicing/new/page.tsx`
    - `src/app/(protected)/clientes/nuevo/page.tsx`
    - `src/app/(protected)/clientes/[id]/edit/page.tsx`
    - `src/app/(protected)/suppliers/new/page.tsx`
- SQL:
  - No aplica.
- Decisiones de diseño:
  - La navegación programática (`router.push` tras guardar o al cancelar) no
    se intercepta a propósito: los flujos de guardado/cancelación existentes
    siguen funcionando sin cambios.
  - La carga inicial de datos (setState) no dispara eventos DOM, por lo que
    abrir un formulario de edición no lo marca sucio; solo la escritura real
    del usuario.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del componente nuevo: cero errores; las páginas montadas conservan
    deuda previa documentada en QA-001.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - En `/quotations/new`, escribir en un campo y hacer clic en un link del
    sidebar: debe aparecer el modal "Cambios sin guardar".
  - "Seguir editando" debe conservar el formulario; "Salir sin guardar" debe
    navegar.
  - Refrescar la pestaña con cambios debe mostrar el aviso del navegador.
  - Crear una cotización y verificar que después del guardado exitoso ya no
    aparece el aviso al navegar.
- Riesgos pendientes:
  - Controles custom que no emiten eventos `input`/`change` (botones de
    combobox) no marcan el formulario sucio por sí solos; la mayoría de la
    captura es tipeo y selects nativos, que sí lo hacen.
  - El autosave (borradores) sigue pendiente dentro de UX-003.
- Commit: `f7eb997`

### 2026-07-01 — UX-001 — Navegación móvil del ERP interno

- Estado: En validación manual.
- Hallazgo: UX-001.
- Causa raíz: el layout protegido renderizaba el sidebar fijo de 256 px en
  todas las resoluciones; en móvil ocupaba la pantalla o quedaba inutilizable
  y no existía otra forma de navegar.
- Código:
  - `src/components/layout/protected-shell.tsx`
  - `src/components/layout/topbar.tsx`
- SQL:
  - No aplica.
- Cambio:
  - En pantallas menores a `lg` el sidebar se oculta y el Topbar muestra un
    botón hamburguesa que abre el mismo Sidebar como drawer con backdrop.
  - El drawer se cierra al navegar (patrón de ajuste de estado en render,
    compatible con la regla `react-hooks/set-state-in-effect`) o al tocar el
    fondo.
  - El título del Topbar se oculta en pantallas muy pequeñas y el padding del
    contenido baja a `p-4` en móvil.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Abrir el ERP en un viewport móvil (DevTools o teléfono), navegar con el
    drawer y confirmar que se cierra al elegir una sección.
- Riesgos pendientes:
  - Las tablas anchas de algunos módulos siguen requiriendo scroll horizontal
    en móvil; eso queda dentro de UX-008.
- Commit: `46a36e3`

### 2026-07-01 — QA-009 — npm audit sin vulnerabilidades

- Estado: Completado.
- Hallazgo: QA-009.
- Causa raíz: Next.js 16.2.6 fija PostCSS 8.4.31, afectado por
  GHSA-qx2v-qp2m-jg93 (XSS en salida de stringify). El `npm audit fix --force`
  oficial proponía degradar Next a 9.3.3, lo cual es inviable.
- Código/configuración:
  - `package.json`: override `next > postcss: ^8.5.10`.
  - `package-lock.json`: PostCSS de Next resuelto a 8.5.14 (deduplicado con la
    versión que ya usaba Tailwind).
- Validaciones ejecutadas:
  - `npm audit`: 0 vulnerabilidades.
  - `npm run build`: OK, 65 páginas, sin cambios de comportamiento CSS.
  - `npx tsc --noEmit`: OK.
- Riesgos pendientes:
  - Al actualizar Next en el futuro, revisar si ya incluye PostCSS >= 8.5.10 y
    retirar el override para volver a la versión que Next fija oficialmente.
- Commit: `46a36e3`

### 2026-07-01 — REP-001 — Totales de reportes agrupados por moneda

- Estado: En validación manual.
- Hallazgo: REP-001.
- Causa raíz: `totalAmount` sumaba `__amount` de todas las filas sin importar
  `__currency`, y el total se etiquetaba con la moneda de la primera fila o el
  filtro. Un reporte con facturas USD y HNL mostraba una suma sin sentido.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Los totales (tfoot, métricas y PDF) se agrupan por moneda y se muestran
    como `USD 5,000.00 · HNL 12,000.00` cuando hay más de una.
  - El margen promedio solo se calcula cuando hay una sola moneda; con mezcla
    muestra `-` en lugar de un porcentaje engañoso.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Reportes > Facturación/CxC con documentos en USD y HNL: confirmar totales
    separados por moneda en pantalla y PDF.
- Riesgos pendientes:
  - No hay conversión por tipo de cambio (parte de REP-007); los totales se
    presentan por moneda, no consolidados.
- Commit: `55c0761`

### 2026-07-01 — REP-002/REP-003 — Venta cotizada y GP real comparable

- Estado: En validación manual.
- Hallazgos: REP-002 y REP-003.
- Causa raíz:
  - El dashboard financiero llamaba "Revenue" al `total_sale` de cotizaciones
    Ganadas, que es venta cotizada y no facturación.
  - "GP real" restaba los costos reales de algunas operaciones al revenue de
    todas, inflando el resultado; la varianza comparaba costo real parcial
    contra costo cotizado total.
- Código:
  - `src/app/(protected)/financial-dashboard/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - KPI y charts renombrados a "Venta cotizada (Ganadas)" / "Venta", con
    subtítulo "No es facturación" y descripción que remite a Facturación.
  - GP real ahora es `venta de operaciones con costos reales - costos reales`
    y muestra la cobertura (`X de Y ops con costos reales`).
  - La varianza compara costo real contra costo cotizado solo de esas mismas
    operaciones.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos (deuda previa de hoisting documentada en QA-001).
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Con una operación con costos reales y otra sin ellos, confirmar que GP real
    solo considera la primera y que la cobertura se muestra en el KPI.
- Riesgos pendientes:
  - El cierre definitivo de REP-002 (KPI de facturación real emitida) queda
    para cuando Reportes consuma `invoices` en este dashboard.
- Commit: `55c0761`

### 2026-07-01 — UX-002 — Confirmación en eliminaciones sensibles

- Estado: En validación manual.
- Hallazgo: UX-002.
- Causa raíz: los botones de eliminar rango CAI y tarifa de agente ejecutaban
  el DELETE con un solo clic. El resto de eliminaciones sensibles auditadas
  (tarifas de agente en Pricing Comparison, items de costo real, documentos de
  booking, tareas del dashboard) ya usaban modal o motivo obligatorio.
- Código:
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/agents/[id]/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Ambas eliminaciones pasan por el `ConfirmDialog` existente con acción
    destructiva marcada en rojo; el rango CAI muestra CAI y rango a eliminar.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Intentar eliminar un rango CAI inactivo y una tarifa de agente: debe
    aparecer el modal y solo borrar al confirmar.
- Riesgos pendientes:
  - Los deletes tipo replace dentro de flujos de guardado (client_rates,
    cargo lines) no piden confirmación porque son parte del guardado; su
    atomicidad se maneja en FLOW-003/FLOW-004.
- Commit: `55c0761`

### 2026-07-01 — BUG-001 — Reporte Pagos a Proveedores inalcanzable

- Estado: En validación manual.
- Hallazgo: BUG-001.
- Causa raíz: en `reports/page.tsx` el `return` del reporte de vencidas
  (`overdue`) no estaba condicionado por `activeReport`, por lo que los bloques
  de filas y columnas de `supplier_payments` eran código inalcanzable. El
  reporte Pagos a Proveedores mostraba siempre los datos de Vencidas. La
  consulta a `pagos_proveedor` sí se ejecutaba correctamente.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - El branch de vencidas queda dentro de `if (activeReport === 'overdue')`
    tanto en `baseRows` como en `columns`, habilitando los bloques de
    `supplier_payments` ya existentes.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Con rol Admin/Finanzas/Contabilidad, abrir Reportes > Pagos a Proveedores y
    confirmar columnas de proveedor, período, método y monto.
  - Confirmar que Reportes > Vencidas sigue mostrando CxC y CxP vencidas.
- Riesgos pendientes:
  - Ninguno adicional; el fix no cambia consultas ni permisos.
- Commit: `3c1c535`

### 2026-07-01 — BUG-006 — Notificaciones del sidebar se marcan leídas

- Estado: En validación manual.
- Hallazgo: BUG-006.
- Causa raíz: el helper `markCurrentUserNotificationsAsRead` existía pero
  ningún componente lo llamaba, y el sidebar contaba `is_read = false` una sola
  vez al montar. El badge de Alertas crecía indefinidamente.
- Código:
  - `src/lib/notifications.ts`
  - `src/app/(protected)/alerts/page.tsx`
  - `src/components/layout/sidebar.tsx`
- SQL:
  - No aplica; la política RLS de Fase 1 ya permite al usuario actualizar
    `is_read` de sus propias notificaciones.
- Cambio:
  - Al abrir `/alerts`, las notificaciones del usuario se marcan leídas y se
    emite el evento `sari:notifications-read`.
  - El sidebar recalcula el conteo en cada cambio de ruta y escucha el evento
    para poner el badge en cero de inmediato.
  - El update de lectura filtra `is_read = false` para no reescribir filas ya
    leídas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos en los archivos tocados.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Generar una notificación interna, confirmar el badge, entrar a `/alerts` y
    confirmar que el badge desaparece y no reaparece al navegar.
- Riesgos pendientes:
  - BUG-007 (tres sistemas de notificación desconectados) sigue pendiente; este
    fix solo cubre `notifications` internas del badge de Alertas.
- Commit: `3c1c535`

### 2026-07-01 — REP-005/REP-006/REP-007 — Helper de formato y fechas locales

- Estado: En progreso; corregidos los casos detectados en reportes, dashboards
  y portal. Queda auditoría del resto de módulos y el tipo de cambio.
- Hallazgos: REP-005, REP-006 y REP-007.
- Causa raíz:
  - `new Date('YYYY-MM-DD')` interpreta columnas `DATE` como medianoche UTC y
    en Honduras (UTC-6) muestra el día anterior.
  - `new Date(año, mes, 1).toISOString().slice(0, 10)` devuelve siempre el
    último día del mes anterior, por lo que el preset "Este mes" de dashboards
    y reportes incluía datos del mes previo; `toISOString()` para "hoy"
    devuelve mañana después de las 18:00 hora local.
- Código:
  - `src/lib/format.ts` (nuevo): `parseDateValue`, `formatDate`,
    `formatDateShort`, `formatDateTime`, `toDateInputValue` y `formatMoney`.
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/pre-alertas/page.tsx`
  - `src/app/portal/pickup/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Presets e iniciales de rango de fecha usan `toDateInputValue` (zona local).
  - `expected_date` y `scheduled_date` del portal se formatean sin desfase.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de los archivos nuevos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Confirmar el preset "Este mes" en Dashboard, Dashboard Financiero y
    Reportes: `from` debe ser el día 1 del mes actual.
- Riesgos o trabajo pendiente:
  - Quedan usos de `toISOString().slice(0, 10)` en facturación, CAI, agentes,
    pricing-comparison y operaciones por auditar caso por caso.
  - REP-007 queda parcial: falta centralizar tipo de cambio y migrar los
    formateadores locales duplicados al helper.
- Commit: `3c1c535`

### 2026-07-01 — UX-006 — Idioma del documento raíz

- Estado: Completado.
- Hallazgo: UX-006.
- Código:
  - `src/app/layout.tsx`
- Cambio:
  - `<html lang="en">` pasa a `lang="es"`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 65 páginas.
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 — QA-006 — README del proyecto

- Estado: Completado.
- Hallazgo: QA-006.
- Código:
  - `README.md`
- Cambio:
  - Se reemplazó el README de `create-next-app` por documentación real: stack,
    variables de entorno, comandos de desarrollo y validación, flujo de
    migraciones Supabase, estructura de carpetas y convenciones del ERP.
- Validaciones ejecutadas:
  - `npm run build`: OK (sin impacto en código).
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 - UX-012 - Vista tabla FCL en comparativo de pricing

- Estado: En validacion.
- Hallazgo: UX-012.
- Causa raiz: El comparativo de tarifas FCL solo tenia vista de cards, lo que
  dificultaba comparar agentes horizontalmente por concepto.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego un switch `Cards` / `Tabla` para cotizaciones FCL.
  - `Cards` permanece como vista por defecto y conserva la UI existente.
  - La nueva tabla reutiliza las tarifas ya cargadas y el mismo handler de
    seleccion de tarifa mediante confirmacion existente.
  - La tabla resalta mejor costo, tarifa mas rapida y tarifa seleccionada.
  - PS se toma como cargo por contenedor y se multiplica por la cantidad real
    de contenedores de la cotizacion. El MBL se toma como cargo por BL (uno por
    defecto) y se distribuye entre los contenedores solo para mostrar su costo
    unitario, sin multiplicarlo en el total.
  - Bank Transfer Fee queda fijo en USD 25.
  - DTHC queda editable por naviera; Entrega Local y Redestino se comparten
    entre columnas para comparar con el mismo valor.
  - Los cargos alimentan un total ajustado local en la tabla.
  - Se retiraron filas no usadas de WR and Stuffing, Demurrage / Dia y
    Cancellation Fee.
  - Se agrego `Guardar tabla` para persistir los ajustes FCL en `localStorage`
    por cotizacion; al alternar Cards/Tabla los valores ya no se pierden.
  - Se elimino la fila duplicada `Agente`, porque el agente ya aparece como
    encabezado de cada columna.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Probar `/pricing-comparison` con cotizacion FCL y alternar Cards/Tabla.
  - Seleccionar una tarifa desde la tabla y confirmar que usa el flujo actual.
- Riesgos pendientes:
  - Algunos cargos opcionales solo apareceran si existen como campos en
    `agent_quotes`; no se agregaron queries ni estructura nueva.
  - Los cargos editados son comparativos locales de la tabla y se guardan solo
    en el navegador; no se persisten en Supabase ni cambian la seleccion
    guardada.
- Commit: 2a5f74a

### 2026-07-01 - UX-013 - OOCL en catalogo de navieras

- Estado: En validacion.
- Hallazgo: UX-013.
- Causa raiz: OOCL no estaba disponible en el catalogo compartido de carriers,
  por lo que no aparecia en comboboxes ni badges de navieras.
- Codigo:
  - `src/lib/constants/carriers.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego OOCL como carrier tipo `ocean`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Confirmar que OOCL aparece en los selectores de carrier/naviera maritima.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-07-06 - UX-018 - Plantillas de correo en Acciones Rapidas (copiar sin navegar)

- Estado: En validacion.
- Hallazgo: UX-018 (mejora solicitada por el titular; extiende UX-017).
- Causa raiz: Para copiar una plantilla de correo fuera del detalle de una
  cotizacion habia que navegar a Settings, que ademas es solo de Admin.
- Codigo:
  - `src/components/email/EmailTemplatesDialog.tsx` (nuevo): modal que lista
    las plantillas activas (chips), muestra asunto y cuerpo, y permite
    "Copiar mensaje" / "Copiar asunto". Fuera de una cotizacion no hay datos
    para las variables, asi que se renderizan como campos a llenar en
    corchetes ([CLIENTE], [NUMERO_COTIZACION]) sin omitir lineas. Link
    "Administrar plantillas" visible solo para Admin.
  - `src/lib/email-templates.ts`: `renderEmailTemplateSkeleton` convierte
    `{{variable}}` en `[VARIABLE]` conservando todas las lineas.
  - `src/components/layout/topbar.tsx`: accion rapida "Plantillas de Correo"
    para todos los roles internos (la RLS de lectura ya lo permite); abre el
    modal sin cambiar de pagina.
- SQL:
  - No aplica; reutiliza `email_templates` y sus policies de UX-017.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Abrir la accion rapida desde cualquier pagina, alternar plantillas y
    copiar mensaje y asunto; confirmar los campos [EN_CORCHETES].
  - Confirmar que el link "Administrar plantillas" solo aparece a Admin.
  - Confirmar que un rol interno no-Admin puede ver y copiar plantillas.
  - Confirmar que una plantilla desactivada en Settings no aparece en el
    modal de la accion rapida.
- Riesgos pendientes:
  - Ninguno; solo lectura sobre datos ya expuestos por RLS.
- Commit: hash pendiente

### 2026-07-06 - UX-017 - Plantillas de correo editables (fin del cuerpo hardcodeado)

- Estado: En validacion; migraciones aplicadas en remoto el 2026-07-06 via
  `supabase db push` y SQL Editor. El historial de `20260706220000` se
  registro el 2026-07-28 tras auditar esquema, policies y semillas.
- Hallazgo: UX-017 (mejora solicitada por el titular).
- Causa raiz: El cuerpo del correo de cotizacion estaba hardcodeado (~35
  lineas) en `quotations/[id]/page.tsx`; solo el texto de cierre era
  configurable en `company_settings.plantilla_cotizacion`.
- SQL:
  - `supabase/migrations/20260706200000_email_templates.sql`: tabla
    `email_templates` (template_key unico, nombre, descripcion, asunto,
    cuerpo, is_active, updated_by/updated_at). RLS: SELECT para roles
    internos aprobados mediante `public.is_approved_active_user()`;
    INSERT/UPDATE/DELETE solo Admin mediante `public.is_admin()`. Semilla
    `cotizacion_cliente` equivalente al texto que estaba hardcodeado.
  - `supabase/migrations/20260706210000_email_template_seguimiento.sql`:
    semilla `seguimiento_cotizacion` (correo de seguimiento de tarifa
    ofertada que Ventas copia desde el detalle de la cotizacion).
  - `supabase/migrations/20260706220000_fix_email_templates_encoding_rls.sql`:
    corrige semillas ya aplicadas con `ON CONFLICT DO UPDATE` para normalizar
    textos UTF-8 y reemplaza politicas RLS por helpers versionados.
- Codigo:
  - `src/lib/email-templates.ts` (nuevo): renderizador de variables
    `{{...}}` (las lineas cuyos placeholders resuelven todos vacios se
    eliminan, lo que reemplaza los bloques condicionales del codigo),
    catalogo de variables por plantilla y respaldo local identico a la
    semilla para que el correo nunca salga vacio si falta la fila.
  - `src/app/(protected)/settings/email-templates/page.tsx` (nuevo):
    seccion "Plantillas de Correo" con editor de asunto/cuerpo, chips de
    variables disponibles, vista previa con datos de ejemplo, boton
    "Restaurar original" y guard de cambios sin guardar. Solo Admin edita;
    otros roles con acceso ven solo lectura.
  - `src/components/layout/sidebar.tsx`: entrada "Plantillas de Correo" en
    la seccion admin.
  - `src/app/(protected)/quotations/[id]/page.tsx`: el modal de correo
    carga todas las plantillas activas y muestra un selector (chips) para
    alternar entre ellas (cotizacion, seguimiento y las personalizadas);
    asunto y cuerpo se renderizan con el mismo mapa de variables.
    `{{cierre}}` sigue leyendo `company_settings.plantilla_cotizacion` para
    compatibilidad.
  - Settings permite a Admin crear plantillas nuevas desde la UI (boton
    "Nueva"); quedan disponibles en el selector del modal sin tocar codigo
    ni migraciones. "Restaurar original" solo aparece en plantillas con
    semilla.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - Migraciones `20260706200000` y `20260706210000` aplicadas en remoto y
    semilla insertada antes de esta correccion.
  - Intento manual de `20260706220000` en SQL Editor: fallido por deadlock
    `40P01`, transaccion abortada.
  - Reintento manual de `20260706220000` en SQL Editor: OK, "Success. No rows
    returned".
- Verificacion manual/RLS pendiente:
  - Con Admin, editar la plantilla en `/settings/email-templates`, guardar y
    confirmar que el modal de correo de una cotizacion refleja el cambio.
  - Confirmar que la vista previa coincide con el correo generado.
  - Confirmar el correo de una cotizacion SIN tarifa seleccionada: el bloque
    de tarifa no debe aparecer (lineas con variables vacias omitidas).
  - Confirmar el correo de una cotizacion Miami sin tarifa seleccionada pero
    con total comercial: debe mostrar bloque "TARIFA".
  - Con un rol no-Admin que acceda a la pagina, confirmar solo lectura, y
    que un update directo es bloqueado por RLS.
  - "Restaurar original" recupera la semilla y requiere guardar.
  - En el modal de correo, alternar entre "Cotizacion al cliente" y
    "Seguimiento de cotizacion" y confirmar que asunto y cuerpo cambian.
  - Crear una plantilla nueva desde Settings, guardarla y confirmar que
    aparece en el selector del modal de la cotizacion.
- Riesgos pendientes:
  - Solo existe la plantilla `cotizacion_cliente`; otros correos del sistema
    (mailto de BL/facturacion) siguen como estan y pueden migrarse al mismo
    esquema despues.
  - Un placeholder mal escrito hace que su linea se omita; la vista previa
    del editor lo hace visible antes de guardar.
- Commit: hash pendiente

### 2026-07-06 - UX-019 - Acceso directo, confirmaciones y supresion en plantillas de correo

- Estado: En validacion.
- Hallazgo: UX-002 / UX-017 (mejora solicitada por el titular).
- Causa raiz: Aunque ya existia el editor de plantillas, el modal de correo de
  cotizacion no daba acceso directo para modificar la plantilla activa. Ademas,
  cambiar de plantilla, restaurar la original o crear una nueva podia descartar
  cambios del editor sin una decision explicita.
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/settings/email-templates/page.tsx`
- SQL:
  - No aplica; usa la tabla `email_templates` y RLS existente.
- Cambios:
  - El modal de correo agrega un boton de edicion visible para Admin que abre
    `/settings/email-templates` con la plantilla activa seleccionada.
  - Settings lee `?template=` para abrir directamente la plantilla solicitada.
  - Settings detecta cambios sin guardar y muestra modales de decision antes de
    cambiar de plantilla o crear una nueva.
  - "Restaurar original" ahora pide confirmacion antes de reemplazar el asunto y
    cuerpo actuales del editor.
  - Settings agrega "Suprimir" para plantillas personalizadas: marca
    `is_active = false`, las oculta del editor y del selector de correos, y
    exige confirmacion antes de aplicar la baja logica.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Desde una cotizacion, abrir el modal de correo y confirmar que Admin ve el
    boton de editar plantilla.
  - Confirmar que el boton abre Settings con la plantilla activa seleccionada.
  - Editar una plantilla sin guardar e intentar cambiar de plantilla, crear una
    nueva y restaurar original: debe aparecer el modal de decision.
  - Crear una plantilla personalizada, suprimirla y confirmar que desaparece de
    Settings y del selector de correos.
  - Confirmar que usuarios no Admin no ven el acceso directo de edicion.
- Riesgos pendientes:
  - No aplica SQL nuevo; queda la verificacion manual de UI.
- Commit: hash pendiente

### 2026-07-06 - UX-016 - Accion rapida "Nuevo Cliente" con modal de alta rapida

- Estado: En validacion.
- Hallazgo: UX-016 (mejora solicitada por el titular; mismo patron de UX-015).
- Causa raiz: La accion rapida "Nuevo Cliente" navegaba a `/clientes/nuevo`,
  interrumpiendo el flujo en curso. El formulario completo (6 secciones) no es
  apto para modal, pero el alta durante una llamada solo necesita los datos
  esenciales.
- Codigo:
  - `src/lib/clientes.ts` (nuevo): `createClienteRecord` extrae la logica de
    creacion (insert, fallback de vendedor al usuario autenticado, registro en
    `cliente_history`, retorno del codigo generado) para reutilizarla.
  - `src/components/clientes/NewClientDialog.tsx` (nuevo): modal de alta
    rapida con campos esenciales (nombre, RTN, contacto, telefono, email,
    pais, tipo de empresa, condicion de pago con dias de credito, segmento,
    vendedor). El toast de exito incluye accion "Completar perfil" que lleva a
    `/clientes/[id]/edit`.
  - `src/app/(protected)/clientes/nuevo/page.tsx`: consume el helper
    compartido; formulario completo sin cambios visuales.
  - `src/components/layout/topbar.tsx`: "Nuevo Cliente" abre el modal en
    lugar de navegar (roles Admin y Ventas, sin cambio de roles).
- SQL:
  - No aplica; usa inserts existentes sobre `clientes` y `cliente_history`
    (RLS vigente).
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Crear cliente desde el modal y confirmar toast con codigo generado y
    registro en el historial del cliente.
  - Probar la accion "Completar perfil" del toast.
  - Confirmar que `/clientes/nuevo` sigue creando con todos los campos y
    redirige al detalle.
  - Confirmar condicion de pago a credito: el campo dias de credito aparece y
    persiste.
- Riesgos pendientes:
  - El modal no captura direccion, correos adicionales, seguro ni notas; el
    perfil queda incompleto hasta editarlo (por diseno, se comunica en el
    propio modal).
- Commit: hash pendiente

### 2026-07-06 - UX-015 - Accion rapida "Agregar Agente" con modal

- Estado: En validacion.
- Hallazgo: UX-015 (mejora solicitada por el titular).
- Causa raiz: Crear un agente requeria navegar a `/agents`, interrumpiendo el
  flujo de pricing cuando llega una tarifa de un agente nuevo.
- Codigo:
  - `src/components/agents/AgentForm.tsx` (nuevo): formulario de alta de
    agente extraido de `/agents` para reutilizarse sin duplicar logica.
  - `src/components/agents/NewAgentDialog.tsx` (nuevo): modal custom (Radix
    Dialog existente, sin alert/confirm) que envuelve el formulario.
  - `src/components/layout/topbar.tsx`: accion rapida "Agregar Agente" para
    roles Admin y Pricing; abre el modal sin cambiar de pagina.
  - `src/app/(protected)/agents/page.tsx`: consume `AgentForm` compartido.
- SQL:
  - No aplica; usa el insert existente sobre `agents` (RLS vigente).
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Confirmar que Admin y Pricing ven "Agregar Agente" y que Ventas,
    Operaciones, Finanzas y Contabilidad no.
  - Crear un agente desde el modal en cualquier pagina y confirmar toast de
    exito y cierre del modal.
  - Confirmar que el formulario de `/agents` sigue creando y refrescando la
    tabla.
- Riesgos pendientes:
  - Si el modal se usa estando en `/agents`, la tabla no se refresca sola;
    el formulario lateral de la pagina si lo hace.
- Commit: hash pendiente

### 2026-07-07 - INV-006 - Fallback legal de factura desde branding

- Estado: En validacion manual.
- Hallazgo: INV-006 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/(protected)/invoicing/[id]/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - El PDF de factura deja de tener razon social fallback duplicada y usa
    `normalizeCompanyBranding`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de fallback legal duplicado en `invoicing/[id]/page.tsx`: OK.
- Verificacion manual pendiente:
  - Descargar factura/proforma y verificar encabezado con Config. Empresa.
- Riesgos pendientes:
  - Los calculos fiscales `ISV 15`/`ISV 18` se mantienen por normativa SAR y
    requieren revision fiscal separada antes de parametrizarlos.
- Commit: hash pendiente

### 2026-07-07 - FIN-013 - Etiqueta fiscal neutral en validacion de costos

- Estado: En validacion manual.
- Hallazgo: FIN-013 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
- SQL:
  - No aplica.
- Cambios:
  - La etiqueta de costo real deja de decir `Gravable ISV 15%` y ahora refiere
    al impuesto seleccionado desde `tax_rates`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `ISV 15` en `cost-validation/[id]/page.tsx`: OK.
- Verificacion manual pendiente:
  - Crear costo real con impuesto seleccionado y confirmar que el calculo sigue
    usando `tax_percentage_snapshot`.
- Riesgos pendientes:
  - Ninguno identificado; no se cambio la logica de calculo.
- Commit: hash pendiente

### 2026-07-07 - FIN-012 - Etiquetas Miami usan ISV configurable

- Estado: En validacion manual.
- Hallazgo: FIN-012 (auditoria de valores hardcodeados).
- Codigo:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/quotations/MiamiQuotationSection.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings.default_tax_rate`.
- Cambios:
  - El hook de Miami expone `taxRatePercent`.
  - Las etiquetas de cargos gravables en Miami muestran el porcentaje
    configurado en lugar de `ISV 15%`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `ISV 15` en `MiamiQuotationSection` y `useMiamiQuotation`: OK.
- Verificacion manual pendiente:
  - Cambiar `default_tax_rate` y revisar etiquetas de cargos estandar,
    origen y destino en cotizacion Miami.
- Riesgos pendientes:
  - Ninguno identificado; cambio visual alineado con el calculo ya corregido.
- Commit: hash pendiente

### 2026-07-07 - UX-023 - Branding configurable en documentos operativos restantes

- Estado: En validacion manual.
- Hallazgo: UX-023 (auditoria de valores hardcodeados).
- Codigo:
  - `src/lib/company-branding.ts`
  - `src/lib/miami-pricing-items.ts`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/booking/page.tsx`
  - `src/app/(protected)/miami/embarques/page.tsx`
  - `src/components/pdf/shipping-instruction-pdf.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Notify Party de Booking se genera desde Config. Empresa.
  - Print de Miami / Embarques usa razon social y nombre comercial configurados.
  - Routing / Shipping Instruction PDF usa logo, razon social, direccion, RTN y
    contacto configurados.
  - Cost Detail PDF usa la razon social configurada en el footer.
  - Items automaticos y opcionales de Miami usan el nombre comercial configurado
    como proveedor por defecto.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda acotada de hardcodes anteriores en archivos corregidos: OK.
- Verificacion manual pendiente:
  - Imprimir lista Miami, generar Routing PDF, crear Booking sin Notify Party y
    generar Cost Detail PDF con una empresa de prueba en Config. Empresa.
- Riesgos pendientes:
  - Textos legales generales de la cotizacion siguen mencionando Sari Express
    por marca; cambiar eso requiere decision comercial/legal.
- Commit: hash pendiente

### 2026-07-07 - FIN-011 - ISV configurable en pricing comercial

- Estado: En validacion manual.
- Hallazgo: FIN-011 (auditoria de valores hardcodeados).
- Codigo:
  - `src/lib/tax.ts`
  - `src/lib/miami-pricing-items.ts`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings.default_tax_rate`.
- Cambios:
  - Se centraliza calculo de impuesto en `src/lib/tax.ts`.
  - Miami pricing items, cargos manuales/opcionales, seguro de carga,
    totales de cotizacion y detalle interno de costos usan
    `default_tax_rate` de Config. Empresa.
  - Etiquetas de ISV en Pricing Comparison muestran el porcentaje
    configurado.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de `0.15`, `tax_rate: 15` e `ISV 15` en los archivos corregidos:
    OK, sin apariciones.
- Verificacion manual pendiente:
  - Cambiar `default_tax_rate` en Config. Empresa y validar cargo gravable
    manual, cargo Miami gravable, seguro y PDF interno de costos.
- Riesgos pendientes:
  - Facturacion conserva calculos fiscales especificos de factura/ISV 15; debe
    revisarse en un paquete separado para no romper reportes fiscales.
- Commit: c93092d

### 2026-07-07 - PRC-010 - Reglas de negocio de Miami Air y FCL desde catalogo

- Estado: En validacion manual; migracion aplicada previamente y registrada el
  2026-07-28.
- Hallazgo: PRC-010 (auditoria de valores hardcodeados).
- Codigo:
  - `src/hooks/useMiamiQuotation.ts`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL:
  - `supabase/migrations/20260707090000_seed_business_surcharge_rules.sql`
- Cambios:
  - Minimos Miami Air (`miami_air_min_small`, `miami_air_min_large`) salen de
    `surcharge_rules` en vez de constantes React.
  - Bank Transfer Fee FCL (`bank_transfer_fee`) sale de `surcharge_rules` y se
    pasa al comparativo FCL como prop.
  - La migracion inserta defaults actuales: USD 270 hasta 22 KG, USD 375 de
    22 a 40 KG y Bank Transfer Fee USD 25.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Crear/previsualizar cotizacion Miami Air y confirmar minimos.
  - Abrir comparativo FCL y confirmar Bank Transfer Fee.
- Riesgos pendientes:
  - Validar manualmente los minimos/fee configurados en los flujos indicados.
- Commit: hash pendiente

### 2026-07-07 - UX-022 - Branding configurable en PDFs operativos y reportes

- Estado: En validacion manual.
- Hallazgo: UX-022 (continuacion auditoria de valores hardcodeados).
- Codigo:
  - `src/components/pdf/arrival-notice-pdf.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
  - `src/components/pdf/report-pdf.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Arrival Notice, Shipping Instruction Order, BL Instructions y Reportes usan
    el branding normalizado de Config. Empresa.
  - Se eliminan constantes locales de razon social, direccion, RTN, telefono y
    correo en esos PDFs.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de constantes hardcodeadas en los archivos corregidos: OK; solo
    queda `/logo/sari-logo.png` como fallback local.
- Verificacion manual pendiente:
  - Generar Arrival Notice, SI PDF y reportes para validar encabezado/footer.
- Riesgos pendientes:
  - Si `company_settings` no esta completo, se usan fallbacks normalizados.
- Commit: hash pendiente

### 2026-07-07 - UX-021 - Datos de empresa configurables en contacto y PDF comercial

- Estado: En validacion manual.
- Hallazgo: UX-021 (auditoria de valores hardcodeados).
- Codigo:
  - `src/app/portal/contacto/page.tsx`
  - `src/components/pdf/quotation-pdf.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/components/pdf/house-bl-pdf.tsx`
  - `src/components/pdf/awb-pdf.tsx`
  - `src/components/pdf/carta-porte-pdf.tsx`
  - `src/lib/company-branding.ts`
- SQL:
  - No aplica; se reutiliza `company_settings`.
- Cambios:
  - Portal "Contactanos" deja de mostrar telefonos, correos y direcciones
    placeholder. Lee oficina Honduras y bodega Miami desde Config. Empresa.
  - PDF comercial de cotizacion usa nombre legal/comercial, RTN, direccion,
    telefono, correo y logo desde Config. Empresa, con fallback unico.
  - Nueva utilidad compartida `company-branding` para normalizar branding y
    evitar fallbacks divergentes.
  - Config. Empresa expone `logo_url` como "Logo para documentos".
  - HBL, AWB y Carta Porte usan el mismo branding configurable al descargarse
    desde la pantalla de BL.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - Busqueda de placeholders criticos (`miami@example`, `info@example`,
    `Edificio XYZ`, `8350 NW 52nd`, `Casa #1225`): OK, sin apariciones en
    portal contacto ni PDF comercial.
- Verificacion manual pendiente:
  - Actualizar Config. Empresa con direccion, telefono, correo, Miami y logo.
  - Abrir Portal > Contactanos y confirmar que solo muestra datos reales.
  - Generar PDF de cotizacion desde Nueva Cotizacion, Detalle y Pricing
    Comparison para confirmar encabezado/logo.
  - Generar HBL, AWB y Carta Porte desde Booking/BL para confirmar
    encabezado/logo.
- Riesgos pendientes:
  - Falta extender el mismo helper a Arrival Notice, Shipping Instruction y
    reportes en un cambio posterior.
  - Si `logo_url` apunta a un recurso remoto no accesible por React PDF, el
    fallback local debe usarse manualmente.
- Commit: hash pendiente

### 2026-07-07 - UX-020 - Bunker Emergency Surcharge editable desde Config. Empresa

- Estado: En validacion manual.
- Hallazgo: UX-020 (mejora solicitada por el titular).
- Codigo:
  - `src/app/(protected)/settings/company/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL:
  - No aplica; la regla ya vive en `surcharge_rules` (fila
    `bunker_emergency_surcharge`, insertada manualmente, sin seed en el repo).
    Sus policies RLS existentes cubren la edicion
    (`can_manage_pricing_catalogs` = Admin/Pricing).
- Cambios:
  - Nueva seccion "Bunker Emergency Surcharge — Miami LCL" en Config. Empresa:
    edita etiqueta (nombre en PDF), tarifa por LBS, tarifa por FT3, minimo y
    estado activo/inactivo.
  - Guarda con `upsert` sobre `code`, por lo que crea la fila si no existiera
    en un ambiente nuevo (service_product `miami_lcl`, calculation_type
    `max_formula`).
  - Vista previa en vivo de la formula MAX(lbs x tarifa, ft3 x tarifa, minimo)
    con un ejemplo de 1,000 lbs / 45 ft3.
  - El calculo en cotizaciones ya leia de `surcharge_rules`
    (`useMiamiQuotation.ts`, `pricing-comparison`); no requirio cambios.
  - Correccion posterior: el guardado de Config. Empresa no pisa la regla con
    valores por defecto si falla la carga, y no crea una fila en cero en
    ambientes sin regla hasta que el usuario edite el bloque.
  - Correccion posterior: el recalculo Miami LCL actualiza el bunker por
    `rate_code` estable y elimina la linea automatica si el recargo esta
    desactivado.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Como Admin, editar tarifas del Bunker en Config. Empresa y guardar.
  - Crear una cotizacion Miami LCL nueva y confirmar que usa las tarifas
    nuevas.
  - Desactivar el recargo y confirmar que no se agrega a una cotizacion nueva.
- Riesgos pendientes:
  - Verificacion manual pendiente en ambiente con datos reales y policies RLS
    activas.
- Commit: hash pendiente

### 2026-07-06 - PDF-002 - Seguro en Shipping Instruction no debe marcarse si no fue solicitado

- Estado: En validacion.
- Hallazgo: PDF-002.
- Causa raiz: El PDF de Shipping Instruction podia caer en campos legacy de
  seguro cuando `requires_insurance` no llegaba de forma explicita, mostrando
  "Insurance: Yes" aunque la cotizacion no incluyera seguro.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
- SQL:
  - `supabase/migrations/20260706170000_shipping_instruction_insurance_and_sync_rpc.sql`
- Cambio:
  - Se agrega `shipping_instructions.insurance_requested` como instruccion
    operativa independiente de la cotizacion comercial.
  - Se agrega selector `Insurance` Yes/No en Instrucciones BL de la SI.
  - El PDF de SI ahora toma "Insurance" desde la SI y solo cae a la cotizacion
    como compatibilidad si el campo aun no existe en datos antiguos.
  - Se deja de usar `insurance_cost` como senal de seguro porque puede quedar
    calculado desde el valor FOB aunque no se haya aplicado seguro de carga.
  - Se reemplaza el RPC `sync_shipping_instruction_from_selected_agent_quote`
    calificando columnas con aliases para evitar `quotation_id is ambiguous`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Migracion aplicada en remoto el 2026-07-06 via `supabase db push`
    (registrada como `20260706170000`).
  - Generar SI PDF de una cotizacion sin seguro y confirmar "Insurance: No".
  - Generar SI PDF de una cotizacion con seguro y confirmar "Insurance: Yes".
  - Cambiar selector Insurance en SI y confirmar que el PDF respeta el valor.
  - Ejecutar "Actualizar desde Pricing" y confirmar que no aparece
    `quotation_id is ambiguous`.
- Riesgos pendientes:
  - Ninguno de SQL; queda la verificacion manual del flujo listada arriba.
- Commit: hash pendiente

### 2026-07-06 - PDF-001 - Detalle interno de costos PDF endurecido

- Estado: En validacion.
- Hallazgo: PDF-001.
- Causa raiz: El detalle interno de costos podia imprimirse desde roles de
  edicion comercial/operativa y el PDF consolidaba totales como USD aunque las
  lineas tuvieran moneda propia.
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pdf/cost-detail-pdf.tsx`
- SQL:
  - No aplica.
- Cambio:
  - La accion "Imprimir Detalle de Costos" queda limitada a Admin/Pricing.
  - El PDF agrupa subtotales y resumen final por moneda.
  - El calculo del PDF respeta `tax_amount` y `total_amount` persistidos cuando
    estan disponibles.
  - La generacion del PDF maneja errores con Sonner.
  - El PDF se compacto en formato carta vertical para mantenerse imprimible en
    una pagina y muestra agente, ETD, puertos, fecha de cotizacion, fecha
    Ganada, validez y usuario/fecha de generacion.
  - La tabla de costos incluye columna ISV por linea y subtotal para evitar
    confusiones entre venta sin impuesto y venta total.
  - Se retiro la informacion legal/contacto debajo del logo para reducir ruido
    visual y ahorrar altura en impresion.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica SQL ni RLS nuevo.
  - Confirmar que Ventas y Operaciones no ven la accion del PDF interno.
  - Confirmar que Admin/Pricing pueden generar el PDF.
  - Confirmar PDF con lineas en mas de una moneda: no debe mostrar un total USD
    mezclado; debe separar subtotales/resumen por moneda.
  - Confirmar que el PDF del detalle de costos se mantiene en una sola pagina
    carta vertical para una cotizacion con el volumen normal de lineas.
- Riesgos pendientes:
  - La pantalla de resumen de cotizacion sigue mostrando tarjetas financieras en
    USD como comportamiento previo; este fix solo endurece el PDF interno.
- Commit: hash pendiente

### 2026-07-03 - UX-014 - POL/POD usan puertos en tabla FCL

- Estado: En validacion.
- Hallazgo: UX-014.
- Causa raiz: La vista Tabla del comparativo FCL no consideraba
  `puerto_origen` ni `puerto_destino` de la cotizacion y terminaba mostrando
  `origen`/`destino`, que representan paises.
- Codigo:
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Las filas POL y POD ahora priorizan campos de puerto (`pol`,
    `port_of_loading`, `puerto_origen`, `pod`, `port_of_discharge`,
    `puerto_destino`) y muestran `N/A` si no hay puerto disponible.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Abrir `/pricing-comparison` en una cotizacion FCL con puertos cargados y
    confirmar que POL/POD muestran puerto de origen y puerto de destino, no
    paises.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - FLOW-003 - RPC de hijos de cotizacion sin ambiguedad

- Estado: En validacion manual; SQL aplicado en remoto (el 2026-07-06 se
  registro `20260629090000` en el historial de migraciones via
  `supabase db push`, que no habia quedado registrado).
- Hallazgo: FLOW-003.
- Causa raiz: `replace_quotation_child_lines` retorna una columna llamada
  `quotation_id` y dentro del cuerpo usaba `where quotation_id = p_quotation_id`
  sin alias de tabla. En PL/pgSQL eso vuelve ambigua la referencia entre columna
  real y variable de salida, provocando el error al guardar desde
  `/quotations/[id]/edit`.
- SQL:
  - `supabase/migrations/20260629090000_fix_replace_quotation_child_lines_ambiguous_id.sql`
- Codigo:
  - Sin cambios TypeScript; el formulario ya llama al RPC correcto.
- Cambio:
  - Se recrea el RPC calificando los deletes como `qc.quotation_id`,
    `qcl.quotation_id` y `pi.quotation_id`.
  - El `return query` ahora expone aliases explicitos para evitar nuevas
    colisiones con variables de salida.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Editar una cotizacion FCL/LCL/Miami desde `/quotations/[id]/edit` y guardar.
  - Confirmar que contenedores, carga suelta y pricing Miami se reemplazan sin
    error y sin duplicados.
- Riesgos pendientes:
  - No marcar como completado hasta aplicar SQL remoto y probar el flujo.
- Commit: hash pendiente

### 2026-06-29 - UX-009 - Compatibilidad de scroll suave en Next 16

- Estado: Completado.
- Hallazgo: UX-009.
- Causa raiz: Next.js 16 ya no sobrescribe por defecto `scroll-behavior: smooth`
  durante transiciones SPA. Como `globals.css` define smooth scrolling en
  `html`, Next mostraba el aviso `missing-data-scroll-behavior`.
- Codigo:
  - `src/app/layout.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego `data-scroll-behavior="smooth"` al elemento raiz `<html>` para que
    Next desactive temporalmente el smooth scroll durante cambios de ruta.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Verificar navegacion entre rutas sin warning en consola.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - UX-010 - Cargos adicionales de origen en Miami automatico

- Estado: En validacion manual.
- Hallazgo: UX-010.
- Causa raiz: El flujo rapido Miami Consolidado permitia agregar cargos
  adicionales de destino, pero no cargos de origen seleccionados desde las
  tarifas activas del perfil del cliente.
- Codigo:
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/lib/miami-pricing-items.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego la seccion `Cargos adicionales en origen` para Miami LCL y Miami
    Aereo.
  - El selector usa tarifas activas del cliente en categoria `Otros Cargos`,
    excluyendo fletes, minimos, pickup y cargos automaticos ya controlados por el
    flujo Miami.
  - Al seleccionar una tarifa se precargan descripcion y monto; el monto e ISV
    quedan editables para la cotizacion puntual.
  - Los cargos seleccionados se guardan como `pricing_items` con
    `item_type = origin_charge`.
  - Miami Aereo permite marcar `Agregar Documentos/Manejo`; el monto se toma de
    la tarifa activa `documentos_manejo` del perfil del cliente y se guarda como
    cargo de origen.
  - Se normalizaron valores de inputs y checkboxes nuevos para evitar cambios de
    uncontrolled a controlled durante hidratacion/Fast Refresh.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - En `/quotations/new`, seleccionar cliente con tarifas Miami activas.
  - Probar Miami Consolidado Aereo y Miami Consolidado Maritimo LCL.
  - En Miami Aereo, marcar `Agregar Documentos/Manejo` y confirmar que precarga
    la tarifa del cliente.
  - Agregar un cargo adicional de origen, crear/previsualizar la cotizacion y
    confirmar que aparece en el PDF y en pricing items como cargo de origen.
- Riesgos pendientes:
  - Confirmar con datos reales si algun cargo del catalogo de cliente debe
    mostrarse tambien como destino o mantenerse reservado para reglas
    automaticas.
- Commit: hash pendiente

### 2026-06-29 - UX-011 - Sidebar sin encogimiento en paginas anchas

- Estado: Completado.
- Hallazgo: UX-011.
- Causa raiz: El layout protegido usa flex horizontal y el sidebar no tenia
  `shrink-0`. En paginas con tablas/filtros anchos, como Historico/Cotizaciones,
  el contenido principal podia forzar que el sidebar se encogiera.
- Codigo:
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/protected-shell.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se fijo el sidebar como columna no encogible con `shrink-0`.
  - Se agrego `min-w-0` a la columna principal y al `main` para que el overflow
    se maneje dentro del area de contenido.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Revisar `/historico` y paginas con tablas anchas.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-27 — FASE-6 — Embarques Miami persistentes e historial inicial

- Estado: En validación manual; migraciones aplicadas en Supabase remoto.
- Hallazgos: MIA-001, MIA-002, MIA-003 y MIA-004.
- Código:
  - `src/app/(protected)/miami/embarques/page.tsx`
- SQL:
  - `supabase/migrations/20260627050000_phase6_miami_persistent_shipments.sql`
  - `supabase/migrations/20260627060000_phase6_miami_status_events.sql`
  - `supabase/migrations/20260627070000_phase6_miami_status_reversals.sql`
- Cambios:
  - Agrega `miami_shipments` para conservar cada lista de embarque/despacho Miami
    como entidad persistente.
  - Agrega `miami_shipment_packages` para vincular paquetes a un despacho único.
  - Agrega `miami_package_events` para registrar el primer milestone de despacho
    por paquete y permitir historial posterior.
  - Agrega `next_miami_shipment_number()` y `create_miami_shipment(...)` con RLS
    y validación de rol Operaciones/Admin.
  - La pantalla de Lista de Embarque deja de actualizar paquetes directamente y
    pasa por el RPC transaccional; también muestra embarques recientes.
  - La Lista de Embarque captura modo de transporte (`Aereo`, `Maritimo`,
    `Terrestre` o `Courier`) y lo persiste en el despacho.
  - Inventario avanza estados de paquetes mediante
    `advance_miami_package_status`, dejando evento y cambio de estado en una
    sola transacción.
  - Inventario permite consultar el historial operativo de movimientos por
    paquete desde la misma tabla.
  - Inventario permite reversar un estado Miami con motivo obligatorio mediante
    `reverse_miami_package_status`, conservando auditoría en eventos y
    `activity_logs`.
  - El portal del cliente muestra el historial real de movimientos desde
    `miami_package_events`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - En `/miami/embarques`, seleccionar paquetes en bodega y crear despacho.
  - Confirmar que se crea un registro en `miami_shipments`.
  - Confirmar que cada paquete queda vinculado en `miami_shipment_packages`.
  - Confirmar que cada paquete recibe evento `dispatch` en `miami_package_events`.
  - Confirmar que paquetes ya despachados no pueden volver a entrar en otro
    embarque.
  - Confirmar que el modo de transporte seleccionado queda guardado en
    `miami_shipments.transport_mode`.
  - Desde Inventario, avanzar un paquete y confirmar que aparece un evento
    `status_change` en `miami_package_events`.
  - Desde Inventario, abrir `Historial` en ese paquete y confirmar que lista los
    eventos.
  - `20260627070000_phase6_miami_status_reversals.sql` confirmada en remoto
    (verificado con `supabase migration list --linked` el 2026-07-06).
  - Desde Inventario, reversar un estado con motivo y confirmar evento
    `status_reverse`.
  - Desde el portal cliente, abrir el paquete y confirmar que el historial de
    movimientos muestra despacho y cambios de estado.
- Riesgos o trabajo pendiente:
  - MIA-002 queda parcial: ya existe tabla de eventos para despacho, avance y
    reverso, pero faltan eventos específicos de incidencias.
  - MIA-003 queda parcial: ya existe vínculo con despacho y modo de transporte,
    pero faltan campos específicos para vuelo, camión o contenedor.
  - MIA-004 queda parcial: reversos y auditoría quedan cubiertos; POD/documento
    de entrega queda pendiente de estructura de archivos.
- Commit: pendiente.

### 2026-07-07 — MIA-005 — Ubicación por rack e inventario físico en bodega Miami

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/inventario/page.tsx`
- SQL:
  - `supabase/migrations/20260707110000_miami_rack_locations.sql`
- Cambios:
  - Agrega `rack_location`, `location_updated_at` y `location_updated_by` a
    `miami_packages`, con índice parcial por rack.
  - Agrega RPC `set_miami_package_location(p_tracking, p_rack)` (security
    definer, rol Operaciones/Admin): busca por tracking o WH#, exige que el
    paquete siga en bodega (`Recibido en Miami` / `En Consolidación`), ante
    trackings duplicados toma el ingreso más reciente en bodega, actualiza la
    ubicación y registra evento `location_change` en `miami_package_events` y
    entrada en `activity_logs` en la misma transacción.
  - Inventario muestra columna `Rack`, incluye rack en la búsqueda y agrega
    KPI/filtro `Sin rack (en bodega)` para medir avance del conteo físico.
  - Nuevo modo `Conteo por rack`: se escanea primero el rack y luego los
    trackings uno a uno con input auto-enfocado (mismo patrón de escaneo de
    manifiestos); cada escaneo persiste la ubicación vía RPC y lista lo
    ubicado en la sesión.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual/RLS pendiente:
  - Migración aplicada previamente y registrada en Supabase remoto el
    2026-07-28.
  - Confirmar que un usuario Cliente no puede ejecutar
    `set_miami_package_location` (debe fallar con 42501).
  - En `/miami/inventario`, iniciar `Conteo por rack`, escanear un tracking en
    bodega y confirmar toast, rack en la tabla y evento `location_change` en
    el historial del paquete.
  - Escanear un tracking ya despachado y confirmar error claro con el estado.
  - Confirmar KPI `Sin rack (en bodega)` disminuye al ubicar paquetes.
- Riesgos o trabajo pendiente:
  - Rack es texto libre normalizado (mayúsculas); si se requiere validar
    contra un layout fijo de bodega, agregar catálogo `miami_racks` después.
  - Fase 2 sugerida: reporte de conteo (escaneado vs esperado por rack) para
    detectar faltantes/sobrantes.
- Commit: pendiente.

### 2026-07-07 — MIA-006 — Selector de unidad de peso (lbs/kg) en ingreso Miami

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/ingreso/page.tsx`
- SQL: ninguno (usa columnas existentes `weight_lbs` y `weight_kg`).
- Cambios:
  - El campo de peso ahora tiene toggle `lbs`/`kg`; el valor se captura en la
    unidad elegida y se persisten ambas columnas convertidas (factor 0.453592
    / 2.20462, redondeo a 2 decimales).
  - Muestra la conversión aproximada en vivo bajo el campo.
  - La unidad elegida se conserva entre ingresos consecutivos (igual que el
    carrier).
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Ingresar un paquete en kg y confirmar que `weight_lbs` y `weight_kg`
    quedan correctos en `miami_packages`.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-10 - UX-030 - Catalogo administrable de tipos de contenedor/transporte

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/catalogs/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - Convierte `/catalogs` en pantalla operativa para Pricing/Admin con
    gestion de tipos de contenedor/transporte desde `container_types`.
  - Agrega alta y edicion de nombre/categoria, y selector de encendido/apagado
    sobre `active`.
  - Los tipos apagados se ocultan de nuevas cotizaciones porque los flujos de
    cotizacion leen `container_types` con `active = true`.
  - Mantiene los catalogos existentes de paises y puertos con estilos
    consistentes con el ERP.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Crear un tipo nuevo en `/catalogs`, confirmar que aparece en
    `/quotations/new` para carga FCL/FTL.
  - Apagar el tipo y confirmar que deja de aparecer como nueva opcion.
  - Confirmar con rol Pricing que RLS permite insertar/actualizar el catalogo.
- Riesgos pendientes:
  - No se agrega borrado fisico por seguridad historica; desactivar es la via
    operativa para ocultar opciones.
- Commit: pendiente.

### 2026-07-10 - UX-031 - Catalogos editables para productos y tarifas Miami

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/catalogs/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/clientes/[id]/page.tsx`
  - `src/lib/pricing-catalogs.ts`
  - `src/lib/quotation-products.ts`
- SQL:
  - `supabase/migrations/20260710133000_operational_catalogs.sql`
- Cambios:
  - Agrega tablas `service_products` y `client_rate_catalog` con RLS para
    usuarios internos y gestion por Pricing/Admin.
  - Siembra los productos y cargos actuales para preservar comportamiento.
  - `/catalogs` permite crear, editar y activar/desactivar productos de
    cotizacion y cargos/tarifas Miami por cliente.
  - `quotations/new`, `quotations/[id]/edit`, `clientes/[id]` y
    `pricing-comparison` leen catalogos activos con fallback local para no
    romper si la migracion aun no esta aplicada.
  - Los PDFs no cambian: siguen consumiendo datos guardados en cotizaciones,
    pricing items y client rates.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Migracion aplicada previamente y registrada en Supabase el 2026-07-28.
  - Apagar un producto en `/catalogs` y confirmar que no aparece en nueva
    cotizacion.
  - Apagar un cargo de `client_rate_catalog` y confirmar que desaparece del
    tab Tarifas del Cliente, sin afectar `client_rates` historicos.
  - Confirmar que una cotizacion/PDF historica sigue mostrando sus datos
    guardados.
- Riesgos pendientes:
  - Los productos Miami con logica especial siguen siendo `miami_lcl` y
    `miami_air`; agregar un producto nuevo con comportamiento Miami requiere
    implementar su logica operativa antes de usarlo en produccion.
- Commit: pendiente.

### 2026-07-10 - UX-025 - Breakbulk en catalogo de tipos de contenedor / unidad

- Estado: Aplicado
- Codigo: ninguno (cambio de datos).
- SQL:
  - `supabase/migrations/20260710120000_add_breakbulk_container_type.sql`
  - INSERT idempotente de la fila `Breakbulk` en `public.container_types`
    (name='Breakbulk', category=NULL, active=true).
- Cambios:
  - El dropdown "Tipo de contenedor / unidad" de la seccion Carga en
    cotizaciones FCL/FTL (`quotations/new` y `quotations/[id]/edit`) se alimenta
    de `container_types` (`where active = true order by name`), no de opciones
    hardcodeadas. Al agregar "Breakbulk" como fila del catalogo aparece
    automaticamente en ambas pantallas, ordenado alfabeticamente.
- Validaciones:
  - SQL ejecutado en Supabase (Success, no rows returned).
  - Verificacion REST: `container_types?name=eq.Breakbulk` devuelve
    `[{"name":"Breakbulk","active":true,"category":null}]`.
- Riesgos pendientes:
  - Ninguno de SQL; la ejecucion manual fue auditada y la version
    `20260710120000` quedo registrada en remoto el 2026-07-28.
- Commit: pendiente.

### 2026-07-10 - UX-026 - Correcciones UX en login del portal cliente

- Estado: En validacion
- Codigo:
  - `src/app/portal/login/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega identidad visible en mobile para que el login no pierda contexto de
    Portal de clientes cuando el panel lateral se oculta.
  - Cambia el toggle textual de contrasena por iconos `Eye`/`EyeOff`, evitando
    overflow dentro del input y manteniendo `aria-label`.
  - Asocia labels con inputs mediante `htmlFor`/`id`.
  - Restaura estilos `dark:*` para mantener consistencia con register,
    forgot-password y reset-password.
  - Marca el preview lateral como ejemplo/demo para no confundir datos
    ilustrativos con tracking real.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Abrir `/portal/login` en mobile y desktop, modo claro/oscuro, y confirmar
    identidad visible, foco accesible y toggle de contrasena sin overflow.
  - No aplica RLS ni SQL.
- Riesgos pendientes:
  - No se ejecuto prueba visual automatizada porque no hay herramienta de
    navegador disponible en esta sesion.
- Commit: pendiente.

### 2026-07-10 - UX-027 - Sistema visual base para portal de clientes forwarder

- Estado: En validacion
- Codigo:
  - `src/components/portal/PortalUI.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/paquetes/page.tsx`
  - `src/app/portal/pre-alertas/page.tsx`
  - `src/app/portal/notificaciones/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega componentes compartidos del portal para headers, cards, secciones,
    buscador, filtros, estados vacios, badges, botones y links de texto.
  - Migra listas principales del portal a un patron visual consistente,
    orientado a clientes de freight forwarders: tracking, envios, paquetes,
    pre-alertas y avisos.
  - Unifica filtros activos con acento azul de marca, headers con
    `font-display`, estados vacios y cards `rounded-2xl`.
  - El selector legacy `container_type` en la seccion Carga de
    `quotations/new` deja de tener opciones hardcodeadas y usa el catalogo
    `container_types` ya cargado desde Supabase.
- Validaciones:
  - `npx tsc --noEmit`: OK
  - `rg "Contenedor 20FR|Contenedor 20DR|Contenedor 20OT|Contenedor 40DR|Contenedor 40HC|Camion 8 tons|Contenedor 48' FTL" src -S`: sin resultados.
- Verificacion manual/RLS pendiente:
  - Abrir `/portal`, `/portal/envios`, `/portal/paquetes`,
    `/portal/pre-alertas` y `/portal/notificaciones` en mobile/desktop y
    confirmar consistencia visual.
  - Crear cotizacion FCL en `/quotations/new`, abrir seccion Carga y confirmar
    que "Tipo de contenedor / unidad" refleja el catalogo `container_types`
    incluyendo `Breakbulk`.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes:
  - Faltan por migrar pantallas secundarias del portal: detalles, perfil,
    herramientas, contacto, info y flujos auth restantes.
- Commit: pendiente.

### 2026-07-10 - UX-028 - Consistencia visual en carga LCL/LTL de cotizacion nueva

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - El bloque `Detalle de carga` para LCL/LTL/Consolidado/Courier de otros
    origenes adopta el mismo lenguaje visual del bloque Miami: cabecera por
    linea, borde/fondo segun completitud, labels compactos, campos `h-10` y
    resumen por linea.
  - Se elimina del formulario visible el selector `Caja/Pallet/Pieza` para
    que LCL Otros Origenes y LTL/FTL USA pidan directamente cantidad, volumen,
    unidad, peso y dimensiones/CBM. Internamente se conserva `packageType:
    'Caja'` para no romper persistencia ni PDF.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - En `/quotations/new`, seleccionar `LCL Otros Origenes` y confirmar que
    pide detalle de carga sin selector de tipo de empaque por linea.
  - Seleccionar `LTL / FTL USA` con modalidad `LTL` y confirmar el mismo
    comportamiento.
  - Confirmar que Miami LCL/Aereo conserva su flujo y que guardar cotizacion
    persiste `quotation_cargo_lines`.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes:
  - El tipo de paquete queda fijo como `Caja` en datos heredados para estas
    lineas; si despues se requiere clasificacion real de empaque, debe
    definirse un catalogo/UX separado.
- Commit: pendiente.

### 2026-07-10 - UX-029 - Reset visual despues de enviar cotizacion a Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
- SQL: ninguno.
- Cambios:
  - Corrige que despues de `Enviar a Pricing` el formulario quedara limpio
    pero con `submitted=true`, provocando bordes rojos en campos requeridos
    vacios.
  - Agrega helper `createEmptyCargoLine()` para reiniciar las lineas de carga
    con un estado inicial consistente tras guardar/enviar.
  - Al crear correctamente una cotizacion se resetean `formData`,
    `submitted`, lineas de carga, lineas de contenedor, duplicacion y formulario
    de contenedor.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Crear cotizacion con `Enviar a Pricing` y confirmar que el formulario queda
    en blanco sin bordes rojos residuales.
  - Crear borrador y confirmar el mismo reset visual.
  - No aplica cambio de RLS ni SQL.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-10 - UX-024 - Parpadeo en portal por bucle de re-render en useUser

- Estado: En validacion
- Codigo:
  - `src/hooks/useUser.tsx`
- SQL: ninguno.
- Cambios:
  - El efecto de `UserProvider` tenia `profile` y `user?.id` en sus
    dependencias mientras el mismo efecto reescribia `profile`/`user` con
    objetos nuevos en cada fetch. Sin sesion inicial (portal de clientes) esto
    generaba un bucle: cada `setProfile`/`setUser` re-ejecutaba el efecto,
    volvia a llamar `getUser()` y re-fetch, emitiendo un objeto `user` nuevo en
    cada vuelta.
  - Cada objeto `user` nuevo disparaba los efectos de las paginas hijas
    (`[user]` / `[profile?.cliente_id]`), que ponian `loading = true` y
    recargaban, produciendo el parpadeo "aparece y desaparece" reportado en
    `/portal/notificaciones`.
  - El efecto ahora se suscribe una sola vez (dependencia unica
    `hasInitialSession`) y la guardia de "mismo usuario" usa un `ref`
    (`loadedUserIdRef`) en lugar de `user`/`profile`. Elimina el bucle y de
    paso el doble fetch inicial.
  - El lado `(protected)` no estaba afectado porque monta el provider con
    `initialUser`/`initialProfile`.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Con sesion de Cliente, abrir `/portal/notificaciones` y confirmar que la
    lista carga una sola vez y no parpadea.
  - Navegar entre paginas del portal y confirmar que no hay recargas repetidas.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-08 - PRC-014 - Aviso de estado requerido para modificar tarifas

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega una validacion especifica para editar/agregar tarifas de agente:
    la cotizacion debe estar en `Pendiente de Fijar Precios`.
  - Cuando la cotizacion esta en otro estado, Pricing muestra Sonner:
    `Cotización debe estar en "Pendiente de Fijar Precios" para modificar/agregar tarifas`.
  - Se evita reabrir automaticamente cotizaciones enviadas/aprobadas desde el
    guardado de tarifas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - En una cotizacion `Aereo Consolidado` con tarifa seleccionada y estado
    distinto de `Pendiente de Fijar Precios`, intentar editar/guardar tarifa y
    confirmar el Sonner de estado requerido.
  - Cambiar la cotizacion a `Pendiente de Fijar Precios` y confirmar que
    editar/agregar tarifa funciona normalmente.
- Riesgos pendientes:
  - El usuario debe cambiar el estado de la cotizacion antes de modificar o
    agregar tarifas.
- Commit: pendiente.

### 2026-07-07 — MIA-007 — Escaneo de manifiesto: unidad de peso, duplicados y eliminación segura

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL: ninguno (el trigger existente de `total_packages` cubre el DELETE).
- Cambios:
  - Selector `lbs`/`kg` en el formulario de escaneo; se persisten `weight_lbs`
    y `weight_kg` convertidos (mismos factores que MIA-006).
  - Escaneo duplicado dentro del mismo manifiesto ya no inserta: muestra
    toast de advertencia, limpia el campo y re-enfoca el escáner.
  - Botón rojo (ícono basurero) por fila para eliminar un tracking escaneado
    por accidente; visible solo con manifiesto `Abierto` y paquete
    `Sin asignar`.
  - La eliminación pasa por `ConfirmDialog` (danger) con el tracking en el
    mensaje; el DELETE filtra además por `status = 'Sin asignar'` en servidor
    y verifica filas afectadas para no reportar éxito falso si el paquete fue
    asignado en paralelo.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Escanear en kg y confirmar ambos pesos en `miami_packages`.
  - Escanear dos veces el mismo tracking y confirmar advertencia sin fila
    duplicada.
  - Eliminar un tracking con confirmación y verificar que `total_packages`
    del manifiesto disminuye (trigger).
  - Confirmar por RLS que un usuario Cliente no puede borrar
    `miami_packages`.
- Riesgos pendientes:
  - Paquetes ya asignados no se pueden eliminar desde la UI por diseño
    (tienen WH# y notificación al cliente); si se requiere, definir flujo de
    reverso de asignación aparte.
- Commit: pendiente.

### 2026-07-07 — MIA-008 — Catálogo de transportistas Miami administrable

- Estado: En validación
- Código:
  - `src/hooks/useMiamiCarriers.ts` (nuevo)
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/ingreso/page.tsx`
- SQL:
  - `supabase/migrations/20260707120000_miami_carriers_catalog.sql`
- Cambios:
  - Nueva tabla `miami_carriers` (nombre único case-insensitive, `is_active`,
    auditoría de creador) sembrada con los 8 valores que estaban hardcodeados.
  - RLS: lectura para `authenticated`; insert/update solo Admin/Operaciones.
  - Hook `useMiamiCarriers` comparte el catálogo (alfabético, `Otro` al
    final) con fallback a la lista anterior si la tabla aún no existe.
  - Botón `Nuevo transportista` junto a `Cerrar manifiesto` con modal custom;
    valida nombre vacío y duplicados (cliente + índice único 23505) y
    auto-selecciona el nuevo carrier en el formulario de escaneo.
  - `Ingreso Individual` y el detalle de manifiesto leen del catálogo; se
    eliminaron las constantes hardcodeadas (el portal de pre-alertas conserva
    su lista propia, pendiente de unificar).
- Decisión de diseño:
  - NO se guardan en `proveedores`: su RLS es exclusiva de
    Admin/Finanzas/Contabilidad (bodega no puede leer ni escribir) y los
    couriers de ingreso (USPS, Amazon Logistics, `Otro`) contaminarían el
    catálogo de cuentas por pagar. Si un transportista se vuelve proveedor
    real, Finanzas lo crea en su módulo como hasta ahora.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; seed confirmado
    con 8 filas.
  - Crear un transportista desde el manifiesto y verlo en ambos selects.
  - Intentar crear un duplicado (debe rechazarse con mensaje claro).
  - Confirmar que un usuario Cliente no puede insertar en `miami_carriers`.
- Riesgos pendientes:
  - Lista del portal de pre-alertas sigue hardcodeada; unificarla requiere
    revisar UX del portal (RLS ya permite el select).
- Commit: pendiente.

### 2026-07-07 — MIA-009 — Transportista a nivel de manifiesto (un lote = un carrier)

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/nuevo/page.tsx`
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/manifiestos/page.tsx`
- SQL:
  - `supabase/migrations/20260707130000_miami_manifest_carrier.sql`
- Cambios:
  - Columna `carrier` en `miami_manifests`; UX corregida: el transportista se
    define una vez por manifiesto en lugar de seleccionarse en cada escaneo.
  - Crear manifiesto exige transportista (validación + botón deshabilitado).
  - En el detalle, el select por escaneo se elimina; los paquetes heredan
    `manifest.carrier` al insertarse. Sin transportista definido (manifiestos
    previos) el escaneo queda bloqueado con aviso.
  - Cambiar el transportista de un manifiesto abierto propaga el cambio a los
    paquetes ya escaneados del manifiesto para no mezclar carriers.
  - Crear un transportista desde el modal lo asigna directo al manifiesto
    abierto; la lista de manifiestos muestra columna `Transportista`.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; crear
    manifiesto nuevo eligiendo transportista y
    confirmar que cada paquete escaneado hereda el carrier.
  - En un manifiesto viejo sin carrier, confirmar aviso y bloqueo de escaneo
    hasta seleccionarlo.
  - Cambiar el transportista con paquetes escaneados y confirmar que las
    filas existentes se actualizan.
- Riesgos pendientes:
  - Manifiestos históricos quedan con `carrier` null (solo lectura si están
    cerrados); no se hace backfill porque el dato real no se conoce.
- Commit: pendiente.

### 2026-07-07 — MIA-010 — "Otro" abre alta de transportista; modal reutilizable

- Estado: En validación
- Código:
  - `src/components/miami/NewCarrierModal.tsx` (nuevo)
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
  - `src/app/(protected)/miami/manifiestos/nuevo/page.tsx`
- SQL: ninguno.
- Cambios:
  - El modal de nuevo transportista se extrae a `NewCarrierModal`
    (validación de vacío/duplicado, 23505 amigable, callback `onCreated`).
  - En los selects de transportista del manifiesto (crear y detalle),
    seleccionar `Otro` ya no asigna el valor literal: abre el modal para
    agregar el transportista real; la opción se rotula
    `Otro (agregar nuevo...)`. Al guardarlo queda auto-seleccionado (en
    detalle, propagado al manifiesto y sus paquetes vía MIA-009).
  - Cancelar el modal conserva la selección anterior (selects controlados).
  - El select de carrier de Ingreso Individual conserva `Otro` como valor
    válido (paquete suelto con courier desconocido).
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Elegir `Otro` en crear manifiesto y en detalle: debe abrir el modal y,
    al guardar, quedar seleccionado el nuevo transportista.
  - Cancelar el modal y confirmar que el select regresa al valor previo.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-07 — MIA-011 — Eliminación de manifiestos solo Admin con auditoría

- Estado: En validación
- Código:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260707140000_miami_manifest_delete.sql`
- Cambios:
  - RPC `delete_miami_manifest(p_manifest_id, p_reason)` (security definer):
    exige `is_admin()` y motivo obligatorio; bloquea si algún paquete del
    manifiesto está asignado/procesado (status distinto de `Sin asignar`,
    `cliente_id` o `warehouse_number` presentes) o vinculado a un despacho
    (`miami_shipment_packages`).
  - Antes de borrar registra en `activity_logs` (permanente): número,
    estado, carrier, motivo, conteo y lista de trackings eliminados — los
    `miami_package_events` se van en cascada, por eso el log vive fuera.
  - Borra paquetes y manifiesto en una sola transacción.
  - UI: botón rojo `Eliminar manifiesto` visible solo para rol Admin
    (abierto o cerrado), con modal custom de motivo obligatorio; al eliminar
    redirige a la lista.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificación manual pendiente:
  - Migración aplicada previamente y registrada el 2026-07-28; eliminar el
    manifiesto de prueba del usuario con
    motivo; confirmar registro en `activity_logs` con trackings.
  - Confirmar que un usuario Operaciones no ve el botón y que la RPC le
    devuelve 42501 si la invoca directo.
  - Intentar eliminar un manifiesto con paquete asignado (debe bloquear).
- Riesgos pendientes:
  - La eliminación es física (no soft-delete); el registro de auditoría en
    `activity_logs` es el único rastro. Aceptado por diseño para lotes de
    prueba/error.
- Commit: pendiente.

### 2026-07-07 - MIA-012 - Hardening de escaneo y edicion de manifiestos Miami

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260707150000_miami_manifest_scan_hardening.sql`
- Cambios:
  - Agrega indice unico parcial `miami_packages_manifest_tracking_unique_idx`
    para impedir trackings duplicados dentro de un mismo manifiesto, incluso
    si dos usuarios escanean al mismo tiempo o si alguien inserta directo.
  - Agrega RPC `scan_miami_manifest_package(...)`: bloquea la fila del
    manifiesto, valida rol Operaciones/Admin, manifiesto abierto, carrier
    definido y duplicados antes de insertar el paquete.
  - Agrega RPC `update_miami_manifest_carrier(...)`: cambia el carrier solo
    en manifiestos abiertos sin paquetes asignados/procesados, propaga el
    carrier a los paquetes aun sin asignar y registra `activity_logs`.
  - Agrega RPC `delete_miami_manifest_package(...)`: elimina paquetes
    escaneados por error solo si el manifiesto sigue abierto y el paquete no
    fue asignado/procesado ni vinculado a despacho; registra auditoria antes
    del DELETE.
  - La UI del detalle de manifiesto deja de hacer insert/update/delete directo
    para esas operaciones y llama las RPC auditadas.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual/RLS pendiente:
  - Migracion aplicada previamente y registrada en Supabase remoto el
    2026-07-28.
  - Probar dos escaneos concurrentes del mismo tracking en el mismo manifiesto:
    uno debe insertar y el otro debe fallar con mensaje de duplicado.
  - Intentar cambiar carrier con paquetes ya asignados/procesados: debe
    bloquear.
  - Eliminar un paquete sin asignar y confirmar registro
    `delete_miami_manifest_package` en `activity_logs`.
  - Confirmar que un usuario Cliente no puede ejecutar las nuevas RPC.
- Riesgos pendientes:
  - Si existen duplicados historicos por `(manifest_id, tracking_number)`, el
    indice unico fallara al aplicar la migracion; limpiar esos duplicados antes
    de desplegar.
- Commit: pendiente.

### 2026-07-07 - QUO-013 - Guardado de cotizaciones Miami conserva estado

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
- SQL: ninguno.
- Cambios:
  - El boton `Guardar cotizacion` en creacion respeta el estado `Borrador`.
    En flujo Miami solo se marca `Pricing Aprobado` cuando se usa el boton de
    crear/aprobar cotizacion, no al guardar draft.
  - En edicion, `Guardar Cambios` de una cotizacion Miami recalcula totales y
    cargos, pero ya no cambia `status` ni marca `pricing_approved`.
- Validaciones:
  - `npx tsc --noEmit`: OK
- Verificacion manual pendiente:
  - Crear cotizacion Miami con `Guardar cotizacion` y confirmar estado
    `Borrador`.
  - Editar una cotizacion Miami en `Borrador` y confirmar que `Guardar Cambios`
    no la cambia a `Pricing Aprobado`.
  - Crear cotizacion Miami con el boton de aprobacion y confirmar que sigue
    quedando en `Pricing Aprobado`.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-18 - QUO-014 - Cierre externo del menu de acciones de cotizacion

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL: ninguno.
- Cambios:
  - El menu de los tres puntos en el detalle de cotizacion se cierra al hacer
    clic fuera del boton o de sus opciones.
  - Los clics dentro del menu conservan el comportamiento de cada accion.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir el menu, hacer clic fuera y confirmar que se cierre.
  - Confirmar que las opciones del menu continuen ejecutando su accion.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-20 - PRI-015 - Revision de cantidades FCL antes de aprobar Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - `Aprobar Pricing` abre una revision previa con todas las lineas, cantidades,
    costos unitarios y totales antes de continuar con las validaciones existentes.
  - En FCL se compara la cantidad de las lineas DTHC y Entrega Local presentes
    contra el total de `quotation_containers`.
  - La confirmacion queda bloqueada si uno de esos cargos no tiene una unidad
    por contenedor; el usuario debe volver y corregir la cantidad.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Probar una cotizacion FCL de 2 contenedores con DTHC o Entrega Local en
    cantidad 1 y confirmar que la aprobacion se bloquee.
  - Corregir ambas cantidades a 2 y confirmar que continúe el flujo normal,
    incluidas las validaciones de margen y de impacto operativo.
  - Confirmar que una cotizacion no FCL solo muestre la revision informativa.
- Riesgos pendientes:
  - La deteccion depende de que la descripcion incluya DTHC, Destination THC,
    THC Destino, Entrega Local o Local Delivery.
- Commit: pendiente.

### 2026-07-23 - UX-043 - Calculadora referencial de seguro en acciones rapidas

- Estado: En validacion
- Codigo:
  - `src/components/layout/topbar.tsx`
  - `src/components/quotations/ReferenceInsuranceCalculatorDialog.tsx`
- SQL: ninguno.
- Cambios:
  - Agrega `Calculadora de Seguro` al menu global de acciones rapidas para los
    roles internos.
  - El modal permite ingresar mercancía/FOB, flete y servicios, impuestos
    nacionales y tarifa porcentual, además de activar los recargos adicionales
    y operacionales.
  - Muestra subtotal, valor asegurado y prima estimada en formato USD.
  - El cálculo es local, no guarda información y se identifica como referencia
    no vinculante.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Abrir la calculadora desde acciones rapidas en escritorio y movil.
  - Confirmar el cálculo con y sin cada recargo del 10%.
  - Confirmar que `Limpiar`, `Cerrar` y el cierre exterior del modal funcionen.
- Riesgos pendientes:
  - La tarifa predeterminada es 0.28%; el usuario debe ajustarla a la póliza o
    condición comercial aplicable antes de usar el resultado como referencia.
- Commit: pendiente.

### 2026-07-23 - PRI-016 - Comparacion contra target incluye ISV

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - `Vs Target` compara la venta total con ISV contra el target del cliente,
    que tambien se registra con ISV.
  - Las tarjetas de venta y target indican explicitamente que incluyen ISV.
  - Profit y GP conservan su calculo sin ISV.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - Para venta con ISV USD 8,507.50 y target USD 8,122.00, confirmar que
    `Vs Target` muestre `+ USD 385.50` y `4.75% arriba`.
  - Confirmar que Profit permanezca en USD 700.00 y GP en 8.34%.
- Riesgos pendientes:
  - Las cotizaciones historicas cuyo target se haya ingresado sin ISV deben
    corregir ese dato antes de interpretar la comparacion.
- Commit: pendiente.

### 2026-07-24 - PRI-017 - Edicion de ISV en lineas de Pricing

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - Al modificar una linea de pricing, el formulario carga su indicador gravable
    y permite activarlo o desactivarlo desde la columna ISV.
  - La vista previa de ISV y venta total se recalcula inmediatamente con el
    monto, cantidad y seleccion gravable editados.
  - Al guardar se persisten `taxable`, `tax_rate`, `tax_amount` y `total_amount`
    de forma consistente.
- Validaciones:
  - `npx tsc --noEmit`: OK.
- Verificacion manual pendiente:
  - En una cotizacion FCL, modificar una linea inicialmente exenta, cambiar el
    monto, activar ISV y confirmar que el impuesto y total se actualicen.
  - Guardar, volver a abrir la linea y confirmar que el indicador ISV permanezca
    activo.
  - Desactivar ISV y confirmar que el impuesto quede en cero y el total sea el
    subtotal.
- Riesgos pendientes: ninguno.
- Commit: pendiente.

### 2026-07-28 - PRI-018 - Fecha y hora de ingreso de tarifas de agentes

- Estado: En validacion
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL: ninguno.
- Cambios:
  - Cada tarjeta de tarifa de agente muestra la fecha y hora en que fue
    ingresada al comparativo, tanto para LCL maritimo, aereo consolidado y los
    demas servicios que utilizan la vista de tarjetas.
  - La tabla comparativa FCL incorpora una fila de fecha y hora de ingreso por
    agente, incluida en su impresion interna.
  - Se reutiliza `agent_quotes.created_at` y el helper central
    `formatDateTime`; no se modifica la fecha original al editar una tarifa.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Agregar dos tarifas de agentes en momentos distintos para FCL y confirmar
    que sus fechas y horas sean visibles y comparables en cards y tabla.
  - Repetir en LCL maritimo y aereo consolidado y confirmar el formato
    `DD/MM/YYYY HH:mm`.
  - Editar una tarifa existente y confirmar que conserve la fecha y hora de
    ingreso original.
- Riesgos pendientes:
  - Las tarifas historicas sin `created_at` mostraran `N/A`.
- Commit: `d719cb2`.

### 2026-07-28 - FLOW-011 - RPC de contenedores Booking y BL sin ambiguedad

- Estado: En validacion; SQL aplicado en remoto.
- Hallazgo: FLOW-011.
- Causa raiz:
  - `replace_booking_containers` retorna una columna llamada `booking_id` y
    utilizaba `where booking_id = p_booking_id` sin alias de tabla. PL/pgSQL no
    podia distinguir la columna real de la variable de salida.
  - `replace_bl_containers` repetia el mismo patron con `bl_id`, por lo que
    conservaba el mismo fallo latente al guardar contenedores de un BL.
- SQL:
  - `supabase/migrations/20260728110000_fix_booking_container_rpc_ambiguous_ids.sql`
- Codigo:
  - Sin cambios TypeScript; los formularios ya llaman las RPC correctas.
- Cambios:
  - Los deletes califican las columnas como `bc.booking_id` y `blc.bl_id`.
  - Los recorridos JSON usan alias explicitos y los `return query` nombran sus
    columnas de salida para evitar nuevas colisiones.
  - Se conservan las validaciones de permisos, bloqueos transaccionales,
    validacion de datos y grants existentes.
- Validaciones:
  - `npx supabase db push --dry-run`: OK; incluyo exclusivamente
    `20260728110000_fix_booking_container_rpc_ambiguous_ids.sql`.
  - `npx supabase db push --yes`: OK; migracion aplicada en remoto el
    2026-07-28.
  - `npx supabase migration list`: OK; version local y remota
    `20260728110000`.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Guardar varios contenedores en un Booking, confirmando que reemplace las
    filas sin el error `booking_id is ambiguous`.
  - Editar los contenedores nuevamente y confirmar que no se dupliquen.
  - Guardar contenedores en un BL y confirmar que no aparezca
    `bl_id is ambiguous`.
- Riesgos pendientes:
  - No marcar como completado hasta probar los flujos de Booking y BL con un
    usuario autenticado de Operaciones/Admin.
- Commit: `d719cb2`.

### 2026-07-28 - ENV-002 - Historial remoto de migraciones manuales alineado

- Estado: Completado.
- Hallazgo: ENV-002.
- Causa:
  - Doce migraciones ejecutadas manualmente en Supabase tenian sus cambios
    presentes en la base, pero no estaban registradas en
    `supabase_migrations.schema_migrations`.
- Versiones auditadas:
  - `20260706220000`, `20260707090000`, `20260707110000`,
    `20260707120000`, `20260707130000`, `20260707140000`,
    `20260707150000`, `20260710120000`, `20260710133000`,
    `20260720153000`, `20260722120000` y `20260722143000`.
- Verificaciones remotas:
  - El volcado de esquema confirmo tablas, columnas, indices, funciones,
    policies, grants, defaults y comentarios esperados.
  - Plantillas de correo: 2/2 y sin texto UTF-8 corrupto.
  - Recargos de negocio: 3/3 con sus importes esperados.
  - Carriers Miami: 8/8; Breakbulk: 1/1.
  - Catalogos operativos: 7/7 productos y 24/24 tarifas.
  - Configuracion de seguro: patrones base, terrestre y aereo presentes en
    todas las configuraciones revisadas.
  - Columnas de rack, carrier de manifiesto, excepcion de seguro y razones de
    perdida consultables mediante PostgREST.
- Accion:
  - `npx supabase migration repair --linked --status applied ...`: OK para las
    doce versiones, sin volver a ejecutar su SQL.
- Validaciones:
  - `npx supabase migration list`: todas las versiones Local/Remote alineadas.
  - `npx supabase db push --dry-run`: `Remote database is up to date`.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Riesgos pendientes:
  - Ninguno en el historial de migraciones. Las pruebas funcionales/RLS
    pendientes de cada modulo permanecen documentadas en sus hallazgos.
- Commit: `d719cb2`.

### 2026-07-28 - FLOW-012 - Draft MBL respeta la ruta RLS del booking

- Estado: En validacion.
- Hallazgo: FLOW-012.
- Causa raiz:
  - La carga del Draft MBL usaba `bl-drafts/...` como ruta dentro del bucket
    `booking-documents`.
  - La policy de Storage obtiene el booking desde el primer segmento del
    objeto; `bl-drafts` no es un UUID, por lo que
    `booking_id_from_storage_object_name(name)` devolvia `null` y el insert era
    rechazado por RLS.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno.
- Cambios:
  - La ruta ahora comienza con `bookingId` y conserva la jerarquia
    `bl-drafts/{new|blId}/{timestamp}-{archivo}`.
  - No se relajan policies ni permisos; la carga utiliza el contrato de ruta
    ya aplicado a los documentos generales del booking.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Verificacion manual pendiente:
  - Crear un MBL, subir el Draft MBL del agente y confirmar que Storage no
    devuelve `new row violates row-level security policy`.
  - Guardar el MBL y abrir el enlace del archivo cargado.
  - Repetir la carga al editar un MBL existente.
- Riesgos pendientes:
  - Si el usuario abandona un MBL nuevo despues de subir el archivo, el objeto
    queda bajo `bl-drafts/new`; la limpieza de borradores huerfanos sigue
    pendiente de una politica de retencion.
- Commit: pendiente.

### 2026-07-28 - FLOW-013 - Creacion de BL compatible con RLS

- Estado: En validacion.
- Hallazgo: FLOW-013.
- Causa raiz:
  - La creacion ejecutaba `.insert(...).select('id').single()`, por lo que
    PostgREST solicitaba `INSERT ... RETURNING`.
  - La policy SELECT de `bills_of_lading` usa
    `can_access_bill_of_lading(id)`, que vuelve a consultar la fila. Durante
    el mismo statement de insercion esa comprobacion no encuentra la nueva
    fila y rechaza el `RETURNING`, aunque `can_manage_operations()` sea true.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno; no se relajan ni modifican policies RLS.
- Cambios:
  - El cliente genera el UUID del BL antes de insertarlo.
  - El insert incluye ese UUID y no solicita representacion de retorno.
  - El mismo UUID se utiliza en el log de actividad y en la redireccion al BL.
- Validaciones:
  - Reproduccion SQL local con rol `Admin`: `current_user_role() = Admin` y
    `can_manage_operations() = true`; `INSERT ... RETURNING` reproduce el
    rechazo RLS.
  - Transaccion local con rollback: el mismo insert sin `RETURNING` se crea y
    puede consultarse despues del statement.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente avisos de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Pulsar `Crear Master BL` con el Draft MBL cargado y confirmar que se crea,
    registra la actividad y abre el detalle del nuevo MBL.
- Riesgos pendientes:
  - La verificacion funcional requiere la sesion autenticada y los datos del
    booking del ambiente remoto.
- Commit: pendiente.

### 2026-07-28 - FLOW-014 - HBL hereda contenedores del MBL

- Estado: En validacion; SQL aplicado en remoto.
- Hallazgo: FLOW-014.
- Causa raiz:
  - Al crear un HBL se heredaban los datos generales del MBL padre, pero no sus
    filas de `bl_containers`.
  - El HBL se abria sin contenedores y exigia volver a ingresarlos manualmente.
- SQL:
  - `supabase/migrations/20260728130000_copy_mbl_containers_to_hbl.sql`
- Codigo TypeScript: ninguno.
- Cambios:
  - Un trigger copia los contenedores del MBL padre dentro de la misma
    transaccion que crea el HBL.
  - Se copian numero, precinto, tipo, cantidad, peso, volumen y notas.
  - El trigger valida que el padre sea un MBL del mismo booking.
  - La copia es inicial: despues de crear el HBL, Operaciones puede ajustar sus
    contenedores sin modificar el MBL ni otros HBL.
- Validaciones:
  - `npx supabase migration up`: OK.
  - Prueba SQL transaccional con rollback: 2/2 contenedores copiados y todos
    sus campos coinciden con el MBL padre.
  - Prueba negativa local: un MBL de otro booking es rechazado.
  - `npx supabase db push --linked --dry-run`: incluyo unicamente
    `20260728130000_copy_mbl_containers_to_hbl.sql`.
  - `npx supabase db push --linked --yes`: OK; migracion aplicada en remoto.
  - `npx supabase migration list --linked`: version local/remota
    `20260728130000` alineada.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente aviso de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Crear un HBL desde un MBL con varios contenedores y confirmar que todos
    aparezcan al abrir el nuevo HBL.
  - Modificar el HBL y confirmar que el MBL padre conserve sus datos.
- Riesgos pendientes:
  - Los HBL creados antes de esta migracion no se rellenan automaticamente.
- Commit: pendiente.

### 2026-07-29 - CALC-006 - Profit del agente incluido en costo FCL

- Estado: En validacion manual.
- Hallazgo: CALC-006.
- Causa raiz:
  - La tabla comparativa FCL trataba Flete, MBL y Profit del agente como costo,
    pero al seleccionar la tarifa `pricing_items` excluia el Profit del costo
    y lo convertia en margen entre costo y venta.
  - Los ajustes locales de MBL y Profit podian seguir afectando una seleccion
    desde Cards aunque la tabla no estuviera visible.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
- SQL: ninguno.
- Cambios:
  - En FCL, el costo unitario de la linea Flete suma el flete del contenedor,
    el MBL prorrateado y el Profit del agente por contenedor.
  - La venta inicial se iguala al costo proveedor, sin crear margen comercial
    automatico; Pricing conserva la edicion manual de la venta para alcanzar
    el target del cliente.
  - Los overrides visibles de la tabla solo se usan al seleccionar desde la
    vista Tabla. Cards utiliza los valores persistidos de la tarifa.
  - Al editar MBL o Profit en una tarifa, se eliminan sus overrides locales
    anteriores para evitar que valores obsoletos prevalezcan.
- Caso validado:
  - 1 contenedor, Flete USD 6,700.00, MBL USD 65.00 y Profit del agente
    USD 50.00 deben generar costo y venta inicial unitarios de USD 6,815.00.
  - Una venta modificada manualmente, por ejemplo USD 7,160.00, conserva un
    margen comercial de USD 345.00 sobre el costo correcto.
- Validaciones:
  - Auditoria remota de solo lectura sobre `SARIHN-2607-0167-AP`: tarifa
    FCL USD 6,700.00, MBL USD 65.00, Profit USD 50.00 y un contenedor.
  - Revision dirigida de formula: `6,700 + 65 / 1 + 50 = 6,815` para costo
    y venta inicial; venta manual USD 7,160.00 produce margen USD 345.00.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK; unicamente avisos de conversion LF/CRLF.
- Verificacion manual pendiente:
  - Seleccionar la tarifa FCL del caso y confirmar una sola linea Ocean
    Freight con costo unitario USD 6,815.00 y venta inicial USD 6,815.00.
  - Cambiar manualmente la venta y confirmar que el costo permanezca intacto.
  - Editar MBL/Profit, volver a seleccionar desde Cards y Tabla y confirmar
    que no reaparezcan overrides anteriores.
- Riesgos pendientes:
  - Las ventas ya ajustadas manualmente no se modifican con este cambio.
- Commit: pendiente.

### 2026-07-29 - FLOW-015 - Fundación de Booking canónico

- Estado: En validación; migración aplicada únicamente en Supabase local.
- Hallazgo: FLOW-015.
- Causa raíz:
  - Las pantallas internas principales coexistían con dos fuentes editables:
    campos legacy de booking en `shipping_instructions` y registros hijos en
    `bookings`.
  - La creación y actualización del booking se ejecutaban directamente desde
    el frontend, por lo que el cambio y su auditoría no eran una sola
    transacción.
- SQL:
  - `supabase/migrations/20260729120000_booking_canonical_foundation.sql`
  - `supabase/diagnostics/booking_source_classification.sql`
  - `supabase/diagnostics/booking_field_conflicts.sql`
  - `supabase/diagnostics/booking_post_foundation_validation.sql`
  - `supabase/tests/booking_canonical_foundation.sql`
- Código:
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/booking/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- Cambios:
  - Se agregó `shipping_instructions.primary_booking_id` con FK
    `ON DELETE SET NULL`, índice y validación de pertenencia a la misma SI.
  - El primer booking de una SI activa se selecciona automáticamente como
    primario. La creación de un segundo booking no reemplaza el primario.
  - Los RPC `create_booking_for_shipping_instruction`,
    `update_booking_canonical`, `set_primary_booking` y
    `select_primary_booking_if_single` validan autenticación y rol
    Admin/Operaciones y registran `activity_logs` en la misma transacción.
  - La actualización canónica limita los campos permitidos y utiliza
    `updated_at` como control optimista de concurrencia.
  - La pantalla nueva y las cachés temporales MBL/HBL dejaron de escribir
    `bookings` directamente.
  - `saveRouting` dejó de guardar `booking_number`, `carrier_booking`,
    `master_bl`, `house_bl`, `etd`, `eta` y `free_days` en SI.
  - La bandeja `/operations/bookings` ahora consulta `bookings`, conserva el
    contexto de SI/cliente/asignado y abre la ruta canónica.
  - La ruta `/shipping-instructions/{id}/booking` quedó como compatibilidad:
    redirige para 0/1 bookings y muestra selector para N, sin escrituras.
  - No se eliminó ni renombró ninguna columna legacy.
- Validaciones:
  - Inspección de migraciones: ninguna posterior a `20260728130000` alteraba
    bookings, SI o sus RLS.
  - `npx supabase migration up`: OK en base local.
  - `npx supabase db push --linked --dry-run`: únicamente propone
    `20260729120000_booking_canonical_foundation.sql`; no se aplicaron cambios
    remotos.
  - `supabase/tests/booking_canonical_foundation.sql`: OK, transacción con
    rollback.
  - Diagnósticos SQL: sintaxis validada localmente; únicamente `SELECT`.
  - `npx supabase db lint --local --level warning`: sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: OK.
  - `npm run build`: OK; 66/66 páginas generadas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
- Verificación manual pendiente:
  - UAT autenticada de creación/edición desde la UI.
  - Confirmar visualmente la ruta de compatibilidad con 0, 1 y N bookings.
  - Confirmar en la bandeja dos bookings pertenecientes a la misma SI.
  - Aplicar la migración en remoto únicamente después de aprobar esta UAT.
- Riesgos pendientes:
  - `sync_shipping_instruction_from_selected_agent_quote` mantiene la
    sincronización anterior de repricing hacia SI y bookings; quedó fuera del
    alcance aprobado de Fase 4A.
  - Portal, Cost Validation, reportes y alertas aún tienen consumidores legacy
    documentados para fases posteriores.
  - No existe todavía modelo de revisiones de itinerario ni relación formal de
    rollover; cambios de ETD/vessel actualizan el mismo booking canónico.
  - Los campos MBL/HBL en booking continúan como caché temporal hasta completar
    la autoridad documental de `bills_of_lading`.
- Rollback:
  - Revertir las llamadas frontend a los RPC y la consulta de bandeja.
  - Mantener las columnas legacy intactas permite volver temporalmente a las
    lecturas anteriores.
  - Retirar funciones/trigger/FK/índice y `primary_booking_id` solo mediante
    una migración compensatoria; no editar ni borrar la migración ya aplicada.
- Commit: pendiente.

### 2026-07-31 - UX-046 - Perfil de cliente editable desde acciones rápidas

- Estado: En validación manual.
- Hallazgo: UX-046.
- Causa raíz:
  - El menú de acciones rápidas permitía crear clientes, pero consultar o
    modificar uno existente exigía navegar al módulo de Clientes.
- Código:
  - `src/components/clientes/ClientProfileDialog.tsx`
  - `src/components/layout/topbar.tsx`
- SQL: ninguno.
- Cambios:
  - Se agregó la acción `Ver / Editar Cliente` para Admin y Ventas, alineada
    con la política RLS vigente de actualización de clientes.
  - El modal permite buscar por nombre o código, consultar el perfil completo
    y actualizar datos de contacto, dirección, clasificación comercial,
    crédito, seguro y notas sin abandonar la pantalla actual.
  - Cada actualización intenta registrar el evento en `cliente_history` y
    avisa si el perfil se guardó pero falló su registro de historial.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npx eslint src/components/layout/topbar.tsx src/components/clientes/ClientProfileDialog.tsx`:
    OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Abrir la acción con un usuario Admin y otro de Ventas, buscar un cliente,
    modificarlo y confirmar que los datos y el historial persisten.
  - Confirmar que la acción no aparece para roles sin permiso de edición.
- Riesgos pendientes:
  - La validación funcional requiere una sesión autenticada y datos del
    ambiente Supabase.
- Commit: pendiente.

### 2026-07-31 - UX-049 - Footers unificados con la marca de plataforma

- Estado: En validación.
- Hallazgo: UX-049.
- Código:
  - `src/lib/platform-branding.ts`
  - `src/app/login/page.tsx`
  - `src/app/register/page.tsx`
  - `src/app/onboarding/page.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/components/marketing/ForwardersLanding.tsx`
  - `src/app/politicas/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
- SQL: ninguno.
- Cambios:
  - Todos los footers de aplicación, acceso, páginas públicas y cierre
    imprimible usan `Forwarders ERP` y
    `Freight Management Platform by Hernova Systems`.
  - El nombre y la atribución se centralizaron en constantes compartidas para
    evitar divergencias futuras.
  - Las páginas públicas conservan por separado los avisos de derechos
    reservados y región; no se alteró el contenido contractual de Políticas.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido: sin errores; conserva dos advertencias preexistentes en
    `ForwardersLanding.tsx` (`AnimatePresence` y `<img>`).
  - `git diff --check`: OK; únicamente avisos LF/CRLF.
  - Búsqueda global de footers: sin referencias restantes a `DHER Solutions`,
    `Sari Express ERP` o `Generado por Sari` dentro de footers.
- Verificación manual pendiente:
  - Revisar los footers de `/login`, `/register`, `/onboarding`, aplicación
    autenticada, landing, `/politicas` y cierre imprimible de facturación.
- Riesgos pendientes:
  - Las referencias contractuales a DHer permanecen sin cambios hasta completar
    la revisión de identidad jurídica de Hernova Systems.
- Commit: `d0f6923`.

### 2026-08-03 - UX-050 - Correo público oficial unificado

- Estado: Completado en código; pendiente de verificar el deployment Production.
- Hallazgo: UX-050.
- Código:
  - `src/lib/platform-branding.ts`
  - `src/components/marketing/ForwardersLanding.tsx`
  - `src/app/politicas/page.tsx`
- SQL: ninguno.
- Cambios:
  - Se centralizó `contacto@forwarders.app` en
    `PLATFORM_CONTACT_EMAIL`.
  - El formulario y el footer del landing usan el correo oficial tanto en el
    texto visible como en sus enlaces `mailto:`.
  - La sección de contacto de Políticas reutiliza la misma constante para
    evitar otra divergencia.
- Validaciones:
  - `npm run build`: OK, 66/66 páginas generadas.
  - `npx tsc --noEmit`: OK después de regenerar los tipos de `.next` para
    `main`.
  - ESLint dirigido: cero errores; conserva dos advertencias preexistentes en
    `ForwardersLanding.tsx` (`AnimatePresence` y `<img>`).
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Búsqueda en código y artefactos generados: ninguna referencia restante a
    `contacto@dher.dev`; el correo y `mailto:` oficiales aparecen en landing y
    Políticas.
- Riesgos o trabajo pendiente:
  - Confirmar en `forwarders.app` que el deployment de `main` esté Ready y que
    ambos enlaces abran `mailto:contacto@forwarders.app`.
- Commit: pendiente.

### 2026-08-13 - UX-057 - Guardado de BL bloqueado por consulta ambigua del booking

- Estado: Corregido, validado y desplegado en Production; UAT de escritura
  pendiente.
- Hallazgo: UX-057.
- Causa raiz:
  - La carga del editor de BL embebia `shipping_instructions` sin indicar la
    relacion. Al existir dos llaves foraneas entre esa tabla y `bookings`,
    PostgREST respondia `PGRST201` y no devolvia `bookings.updated_at`.
  - La misma consulta solicitaba `quotations.origin_port` y
    `quotations.destination_port`, columnas que no existen en Production; las
    columnas canonicas son `puerto_origen` y `puerto_destino`.
  - El error de carga se descartaba y el guardado posterior mostraba que no
    podia validar la version del booking, aunque el BL ya podia haberse
    actualizado antes de fallar la sincronizacion heredada.
- Codigo:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno.
- Cambios:
  - La consulta usa explicitamente
    `shipping_instructions!bookings_shipping_instruction_id_fkey`.
  - El prellenado usa `puerto_origen` y `puerto_destino`.
  - La sincronizacion de `master_bl`/`house_bl` conserva la version leida al
    abrir el editor para detectar cambios concurrentes. Si esa version falta,
    intenta recuperarla mediante una consulta directa antes de llamar
    `update_booking_canonical`.
  - Si falla esa sincronizacion secundaria, la interfaz informa que el BL si
    fue guardado y presenta una advertencia separada sobre el resumen del
    booking.
- Validaciones:
  - Consulta original contra Production: reprodujo `PGRST201` por relacion
    ambigua; al especificar la FK revelo `42703` por columnas inexistentes.
  - Consulta corregida contra Production: OK, devolvio una fila y
    `bookings.updated_at` sin exponer datos del registro.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK; 70/70 paginas generadas.
  - Vercel Production `dpl_BV6gvvF8JxE3Prby1kcoRfnjxC6T`: `Ready`, con alias
    `https://forwarders.app`.
  - ESLint dirigido: no se agregaron hallazgos; la pagina conserva 8 errores y
    1 advertencia preexistentes (`any`, efecto de carga y texto JSX).
- Verificacion manual pendiente:
  - Guardar el HBL afectado, confirmar `BL guardado` y revisar que el numero se
    refleje en el resumen del booking.
  - Verificar manualmente el guardado con un BL real en `https://forwarders.app`.
- Riesgos o trabajo pendiente:
  - No se ejecuto una escritura de prueba contra un BL real de Production.
- Commit: `f2b8878`.

### 2026-08-13 - FIN-058 - Registro estructurado de pagos de factura

- Estado: Implementado, migrado y desplegado en Production; UAT pendiente.
- Hallazgo: FIN-058.
- Causa raiz:
  - El pago de una factura solo guardaba monto, fecha, moneda, un metodo de
    texto libre, referencia y notas.
  - No existian campos estructurados para clasificacion fiscal, punto de venta
    ni desglose verificable de pagos mixtos.
- Codigo:
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/components/pdf/recibo-pago-pdf.tsx`
- SQL:
  - `supabase/migrations/20260813180000_invoice_payment_classification_and_splits.sql`
- Cambios:
  - El modal requiere clasificacion fiscal (`Gravada`, `Mixta`, `Exenta`,
    `Exonerada`; `No aplica` para proformas), punto de venta y forma de pago.
  - `Mixta` requiere al menos dos componentes entre importe gravado, exento y
    exonerado; la clasificacion se deriva de la factura y se valida de nuevo en
    PostgreSQL.
  - Los puntos de venta se obtienen del lugar de emision de la factura, rangos
    CAI activos, lugar de emision por defecto y ciudad corporativa, sin
    codificar ciudades en el frontend; la RPC rechaza valores fuera de ese
    catalogo.
  - Los medios disponibles son `Cheque`, `Deposito`, `Transferencia`,
    `Tarjeta debito`, `Tarjeta credito` y `Mixto`; `Contado`/`Credito` se
    manejan como condicion de la factura y no como dinero recibido.
  - El pago mixto requiere por lo menos dos componentes y la suma debe coincidir
    exactamente con el monto recibido.
  - Cheques requieren numero de cheque; depositos y transferencias requieren
    numero de referencia; tarjetas requieren voucher o referencia. La misma
    regla aplica a cada componente de un pago mixto y se valida tambien en
    PostgreSQL.
  - `invoice_payment_splits` conserva metodo, monto y referencia por componente;
    el historial y el recibo PDF muestran el desglose.
  - `register_invoice_payment_v2` valida permisos, estado, saldo, fecha, moneda,
    coherencia fiscal y desglose dentro de una sola transaccion.
  - La RPC anterior permanece disponible para que el frontend publicado siga
    funcionando si la migracion se aplica antes del nuevo deployment.
- Validaciones:
  - `npx.cmd supabase db reset --local --no-seed`: OK; todas las migraciones,
    incluidas `20260813180000` y `20260813200000`, aplicaron desde cero.
  - Pruebas SQL ficticias con `ROLLBACK`: pago simple parcial y pago mixto
    completo OK; suma mixta incorrecta, punto de venta desconocido y
    clasificacion fiscal incompatible rechazados correctamente.
  - Prueba SQL ficticia con `ROLLBACK`: cheque sin numero rechazado y cheque con
    numero guardado en el desglose y aplicado a la factura: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a la pantalla y recibo: 0 errores y 0 advertencias.
  - `npm.cmd run build`: OK; build de produccion de Next.js completado.
  - `npx.cmd supabase db push --linked`: migracion `20260813180000` aplicada al
    proyecto Production `sarierp` (`fwspgdzvlbtbgiupvrzo`).
  - Vercel Production `dpl_BV6gvvF8JxE3Prby1kcoRfnjxC6T`: `Ready`, con alias
    `https://forwarders.app`.
  - `npx.cmd supabase db lint --local --level error`: conserva un hallazgo
    preexistente en `is_platform_admin()` por referencia a
    `is_demo_environment()` inexistente; no fue introducido por FIN-058.
- Verificacion manual pendiente:
  - Registrar y reversar un pago simple y uno mixto desde la interfaz local.
  - Confirmar con Contabilidad los nombres finales de los puntos de venta.
  - Ejecutar UAT en Production.
- Riesgos o trabajo pendiente:
  - `Exenta` y `Exonerada` se validan contra la composicion fiscal ya emitida;
    registrar un pago no reclasifica ni altera los impuestos de la factura.
  - La condicion `Credito` no crea un pago ni reduce cuentas por cobrar; los
    cobros posteriores requieren un medio real y su referencia.
- Commit: `f2b8878`.

### 2026-08-13 - FIN-059 - Condiciones de credito y aplicacion integra de notas

- Estado: Implementado, migrado y desplegado en Production; UAT pendiente.
- Hallazgo: FIN-059.
- Causa raiz:
  - La factura permitia editar manualmente el vencimiento y no conservaba la
    condicion ni los dias de credito configurados en el perfil del cliente.
  - Las notas ya ajustaban cuentas por cobrar mediante
    `invoice_adjusted_total` e `invoice_receivables`, pero no existia un bloqueo
    transaccional para impedir que una nota dejara pagos aplicados por encima
    del nuevo total.
  - El detalle calculaba su balance visual incluyendo notas `Borrador` y
    `Anulada`, aunque la vista contable correctamente las excluia.
- Codigo:
  - `src/app/(protected)/invoicing/new/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/components/pdf/invoice-pdf.tsx`
  - `src/components/pdf/recibo-pago-pdf.tsx`
- SQL:
  - `supabase/migrations/20260813200000_invoice_credit_terms_and_note_integrity.sql`
- Cambios:
  - Cada factura conserva `payment_condition` y `credit_days` como fotografia
    del perfil del cliente al emitirse.
  - `Contado` vence en la fecha de emision; `Credito` vence en fecha de emision
    mas los dias configurados. El trigger de PostgreSQL es la fuente canonica.
  - Un cliente configurado a credito sin dias validos no puede generar nuevas
    facturas hasta corregir su perfil.
  - Una nota de credito resta y una nota de debito suma al total ajustado solo
    cuando no estan en `Borrador` ni `Anulada`.
  - El bloqueo por fila de la factura serializa pagos y notas concurrentes. Una
    nota no puede dejar el total ajustado por debajo de los pagos aplicados.
  - No se puede aplicar una nota antes de emitir la factura, cambiar el tipo de
    una nota existente ni anular una factura con notas emitidas activas.
  - La UI limita la nota de credito al saldo pendiente, muestra el estado de
    cada nota y excluye borradores/anuladas del balance efectivo.
  - Las notas de credito/debito dejan de ofrecer la accion de registrar pago al
    alcanzar `Aprobada`; el cobro solo pertenece a facturas o proformas.
  - La factura y el recibo PDF muestran la condicion de pago y los dias de
    credito conservados.
- Validaciones:
  - `npx.cmd supabase db reset --local --no-seed`: OK; migracion aplicada desde
    cero junto con toda la historia.
  - Prueba SQL ficticia con `ROLLBACK`: credito a 30 dias, contado al mismo dia,
    tarjeta con voucher, pago mixto con referencias, ND sumando saldo, NC
    limitada al pendiente y anulaciones inconsistentes rechazadas: OK.
  - Prueba SQL con `ROLLBACK` de modificacion directa: el trigger restauro
    `Contado`, `0` dias y vencimiento igual a emision: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a facturacion y PDFs: 0 errores y 0 advertencias.
  - `npm.cmd run build`: OK; build de produccion de Next.js completado.
  - `npx.cmd supabase db push --linked`: migracion `20260813200000` aplicada al
    proyecto Production `sarierp` (`fwspgdzvlbtbgiupvrzo`).
  - Preflight Production de solo lectura: 55 clientes activos, 0 clientes de
    credito sin dias validos, 0 facturas emitidas y 0 sobrepagos ajustados.
  - Vercel Production `dpl_BV6gvvF8JxE3Prby1kcoRfnjxC6T`: `Ready`, con alias
    `https://forwarders.app`.
  - `npx.cmd supabase db lint --local --level error`: solo conserva el hallazgo
    preexistente de `is_platform_admin()` documentado en FIN-058.
- Verificacion manual pendiente:
  - UAT de emision para un cliente de contado y otro con credito a 30 dias.
  - UAT de recibos por cheque, transferencia, deposito, ambas tarjetas y pago
    mixto.
  - UAT de emision/anulacion de NC y ND desde la interfaz.
- Riesgos o trabajo pendiente:
  - La migracion protege cambios futuros; el UAT debe confirmar el flujo con
    facturas nuevas porque Production todavia no tenia facturas emitidas.
- Commit: `f2b8878`.

### 2026-08-13 - REP-010 - Reportes de facturacion y pagos completos

- Estado: Implementado, migrado y desplegado en Production; UAT pendiente.
- Hallazgo: REP-010.
- Causa raiz:
  - Los reportes de facturacion no consultaban condicion ni dias de credito,
    clasificacion fiscal, punto de venta, formas de pago, referencias o el
    desglose de pagos mixtos.
  - `invoice_receivables` se cargaba dentro del bloque de roles comerciales;
    Finanzas y Contabilidad podian abrir Cuentas por cobrar, pero recibirlo
    vacio.
  - La vista de cuentas por cobrar incluia facturas `Borrador` y `Anulada`; si
    su fecha habia vencido podia reclasificarlas incorrectamente como
    `Vencida`.
  - El listado de Facturacion mezclaba USD y HNL en un solo KPI y el cierre y
    estado de cuenta reconstruian NC, ND y pagos con logica paralela a la vista
    canonica.
- Codigo:
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
  - `src/components/pdf/estado-cuenta-pdf.tsx`
- SQL:
  - `supabase/migrations/20260813210000_exclude_nonissued_invoice_receivables.sql`
- Cambios:
  - Se agrego el reporte exportable `Pagos de clientes` con fecha, factura,
    cliente, condicion/plazo, clasificacion fiscal, punto de venta, forma,
    referencia o desglose mixto, estado y monto.
  - El reporte permite filtrar por cliente, forma de pago, tipo fiscal, punto
    de venta, estado, moneda y periodo. Un pago mixto puede localizarse por
    cualquiera de sus componentes, incluidos cheque, deposito, transferencia
    y tarjetas.
  - `Facturacion` muestra condicion, vencimiento, formas utilizadas, tipo
    fiscal, estado canonico, impacto neto, pagado y saldo. Borradores,
    anulaciones y proformas aportan cero al neto; las notas de credito restan.
  - `Cuentas por cobrar` y el PDF de estado de cuenta muestran la condicion y
    los dias de credito junto al vencimiento, NC/ND, pagos y saldo.
  - Cuentas por cobrar ahora se consulta para los roles financieros correctos.
  - La vista canonica excluye desde su origen facturas `Borrador` y `Anulada`;
    la interfaz conserva filtros defensivos basados en `stored_status`.
  - El cierre y estado de cuenta consumen `invoice_receivables` para ajustes,
    pagos, saldo y mora, evitando resultados distintos entre pantallas.
  - Los KPIs de Facturacion se agrupan por moneda y ya no suman USD con HNL.
- Validaciones:
  - `npx.cmd supabase db reset --local --no-seed`: OK; toda la historia y la
    migracion `20260813210000` aplicaron desde cero.
  - Prueba SQL ficticia con `ROLLBACK`: entre una factura `Borrador`, una
    `Anulada` y una `Aprobada` vencidas, la vista devolvio solo la aprobada con
    estado `Vencida` y saldo correcto: OK.
  - Consulta de control local: cero filas de `invoice_receivables` con
    `stored_status` Borrador o Anulada: OK.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a reportes, listado de facturacion y estado de cuenta: 0
    errores y 0 advertencias.
  - `npm.cmd run build`: OK; 70/70 paginas generadas.
  - `npx.cmd supabase db push --linked`: migracion `20260813210000` aplicada al
    proyecto Production `sarierp` (`fwspgdzvlbtbgiupvrzo`).
  - Vercel Production `dpl_BV6gvvF8JxE3Prby1kcoRfnjxC6T`: `Ready`, con alias
    `https://forwarders.app`.
  - Smoke HTTP: `/` y `/login` respondieron 200; `/reports` redirigio a
    `/login?next=%2Freports` y respondio 200.
  - `git diff --check`: OK; solo avisos esperados LF/CRLF de Git.
  - `npx.cmd supabase db lint --local --level error`: la vista nueva no reporta
    errores; permanece el hallazgo preexistente de `is_platform_admin()` por
    `is_demo_environment()` ausente, ya documentado en FIN-058.
- Verificacion manual pendiente:
  - UAT del reporte con un pago por cheque, deposito, transferencia, cada tipo
    de tarjeta y uno mixto; revisar filtros, CSV y PDF.
  - UAT de estado de cuenta para clientes de contado y credito, con NC, ND,
    pago parcial, pago completo y factura vencida.
  - Comparar cierre mensual, Cuentas por cobrar y detalle de una misma factura
    despues del deployment.
- Riesgos o trabajo pendiente:
  - Production ya excluye borradores y anuladas desde la vista; falta UAT del
    frontend publicado con los roles Finanzas y Contabilidad.
  - Los pagos historicos anteriores a FIN-058 pueden no tener clasificacion,
    punto de venta o desglose; el reporte los mostrara con `-` y no inventara
    datos retroactivos.
- Commit: `f2b8878`.

### 2026-08-13 - UX-056 - HBL Draft alineado al formato documental real

- Estado: Implementado y validado localmente; pendiente de UAT y deployment.
- Hallazgo: UX-056.
- Causa raiz:
  - El HBL generado usaba una composicion moderna por tarjetas y no la reticula
    documental de un Bill of Lading maritimo utilizado en operacion.
  - El PDF solo podia descargarse despues de emitir el HBL y no incorporaba las
    filas de contenedores guardadas en el borrador.
- Codigo:
  - `src/components/pdf/house-bl-pdf.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno.
- Referencia:
  - Se reviso visualmente un BL real proporcionado por el titular solo para
    reproducir su formato. El archivo y sus datos no se copiaron al repositorio
    ni se incorporaron como constantes.
- Cambios:
  - El HBL usa una hoja Letter con encabezado corporativo, campos numerados de
    partes y ruta, tabla central de carga, bloque inferior de flete y seccion de
    emision/firma.
  - Los datos siguen viniendo del formulario y de la configuracion de empresa.
  - Los contenedores muestran numero, sello, tipo, cantidad y notas disponibles.
  - Los estados anteriores a `Emitido`/`Liberado` muestran marca de agua
    `DRAFT`; el documento emitido no la muestra.
  - La descarga del HBL queda disponible durante el flujo de borrador con la
    etiqueta `Descargar HBL Draft`.
  - El encabezado del editor muestra una accion visible para imprimir el HBL
    actual aun antes de guardarlo; mientras sea borrador conserva la marca de
    agua `DRAFT`.
  - El MBL muestra la accion `Imprimir Draft MBL`, habilitada cuando existe un
    archivo del agente cargado. Se imprime el archivo original y no un MBL
    reconstruido por el sistema.
  - Ambas acciones abren el documento en el visor PDF del navegador para usar
    su dialogo de impresion o guardarlo localmente.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK; 70/70 paginas generadas.
  - ESLint del componente PDF: 0 errores y 0 advertencias. La pagina BL
    conserva 8 errores y 1 advertencia preexistentes fuera de las lineas de
    esta correccion (`any`, efecto de carga y texto JSX).
  - ESLint dirigido despues de agregar impresion: ningun hallazgo nuevo en las
    funciones o controles incorporados.
  - Muestra PDF con datos ficticios: una pagina Letter, reticula completa y sin
    desbordamiento visual.
  - El PDF real de referencia permanecio fuera del repositorio y las capturas de
    analisis se generaron unicamente en el directorio temporal del sistema.
- Verificacion manual pendiente:
  - Descargar un HBL Draft desde un booking real y revisar textos extensos,
    multiples contenedores y condiciones configuradas.
  - Confirmar con Operaciones los nombres definitivos de los campos numerados y
    la informacion que debe mostrarse en la seccion de cargos.
  - Verificar el deployment en `https://forwarders.app`.
- Riesgos o trabajo pendiente:
  - La pantalla no posee un importe de flete dedicado para imprimir; el formato
    conserva la seccion de cargos sin inventar ni exponer montos comerciales.
  - Descripciones o condiciones excepcionalmente extensas requieren UAT con un
    caso real antes del deployment.
- Commit: `43a62ad`.

### 2026-08-14 - FIN-060 - Factura trazable desde cotizacion validada

- Estado: Implementado y validado localmente; SQL de Production, UAT y
  deployment pendientes.
- Hallazgo: FIN-060.
- Causa raiz:
  - `Facturar` permitia guardar un `quotation_id`, pero no cargaba las lineas
    comerciales ni verificaba que coincidieran con la cotizacion.
  - La base no exigia que la cotizacion estuviera ganada y validada por
    Finanzas, que perteneciera al mismo cliente o que no tuviera otra factura
    activa.
  - Cambiar precios o costos despues de una validacion no devolvia la
    cotizacion a estado pendiente.
- Codigo:
  - `src/app/(protected)/invoicing/new/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260814100000_invoice_from_validated_quotation.sql`
- Cambios:
  - Validacion de Costos ofrece `Generar factura` al quedar validada y abre la
    factura existente cuando la cotizacion ya fue facturada.
  - `Facturar` permite seleccionar una cotizacion ganada del cliente, carga
    `pricing_items` y bloquea descripcion, cantidad, precio, moneda e ISV como
    datos de origen.
  - `invoice_items.source_pricing_item_id` conserva la trazabilidad de cada
    linea importada; la factura mantiene su snapshot aunque posteriormente se
    elimine una linea fuente.
  - `create_invoice_from_quotation` vuelve a leer las lineas en PostgreSQL y
    valida rol, cliente, estado, aprobacion financiera, moneda, tasas y
    duplicados antes de consumir CAI y crear factura/items en una transaccion.
  - El RPC manual rechaza cualquier `quotation_id`; el RPC anterior dejo de
    estar expuesto a `authenticated`, evitando saltar el flujo validado.
  - Cambios en precios cotizados o costos reales invalidan automaticamente la
    aprobacion financiera. Solo Admin, Finanzas o Contabilidad puede volver a
    validarla.
  - Solo puede existir una Factura activa por cotizacion. Proformas y facturas
    anuladas no bloquean el flujo.
  - La factura se crea como `Borrador` y conserva el flujo existente: al pasar
    a emitida/enviada entra en `invoice_receivables`; los borradores no crean
    saldo en Cuentas por cobrar.
  - El PDF de factura usa ahora el ISV real de cada linea, incluido 0% y 18%,
    en lugar de asumir 15% para todas.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK; 70/70 paginas generadas.
  - ESLint dirigido para nueva factura, detalle de factura y PDF de recibo: 0
    errores y 0 advertencias.
  - La pagina preexistente de Validacion de Costos conserva 13 errores y 4
    advertencias de ESLint (`any` y reglas de hooks), sin hallazgos nuevos en
    las lineas incorporadas.
  - `npx.cmd supabase migration up --local`: migracion aplicada sobre el
    esquema local existente, sin reconstruir el historial.
  - Prueba SQL transaccional local con datos ficticios y `ROLLBACK`: creo la
    factura y su linea trazable, rechazo una segunda factura activa e invalido
    la aprobacion al cambiar el precio.
  - Permisos locales: `authenticated` no puede ejecutar
    `create_invoice_with_items`; si puede ejecutar los dos wrappers validados.
  - `npx.cmd supabase db lint --local --level error`: la migracion nueva no
    reporta errores; permanece el hallazgo preexistente de
    `is_platform_admin()` por `is_demo_environment()` ausente, documentado en
    FIN-058.
  - `git diff --check`: OK; solo avisos esperados LF/CRLF de Git.
- Verificacion manual pendiente:
  - UAT con cotizacion ganada/validada, lineas gravadas, exentas y 18%, y
    monedas USD/HNL.
  - Confirmar que cotizaciones pendientes y ya facturadas no puedan elegirse.
  - Emitir la factura y comprobar su aparicion y saldo en Cuentas por cobrar.
  - Probar anulacion seguida de una nueva factura para la misma cotizacion.
- Riesgos o trabajo pendiente:
  - Antes de aplicar SQL en Production se debe comprobar que no existan dos
    Facturas activas historicas para una misma cotizacion; el indice unico
    detendra la migracion si detecta esa inconsistencia.
  - La migracion no se ha aplicado al proyecto remoto y el frontend no se ha
    desplegado en `https://forwarders.app`.
- Commit: pendiente.

### 2026-08-14 - FIN-061 - Recibo asociado al pago de contado

- Estado: Implementado y validado localmente; UAT y deployment pendientes.
- Hallazgo: FIN-061.
- Causa raiz:
  - El recibo ya podia descargarse mediante un icono pequeno en el historial,
    pero no existia una decision visible al terminar de registrar un pago de
    contado.
- Codigo:
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/components/pdf/recibo-pago-pdf.tsx`
- SQL: ninguno adicional; utiliza el pago persistido por
  `register_invoice_payment_v2`.
- Cambios:
  - Al registrar un pago de una factura de contado se ofrece inmediatamente
    `Generar recibo` con el monto recibido.
  - Cada pago aplicado conserva una accion textual `Generar recibo` en el
    historial; los pagos reversados no pueden generar recibos vigentes.
  - El PDF incluye un identificador deterministico basado en el UUID del pago,
    numero y tipo de factura, cliente, monto, fecha, metodo, referencia,
    clasificacion fiscal, punto de venta y desglose mixto.
  - El recibo se genera desde el pago ya persistido y no crea un segundo
    movimiento contable ni altera el saldo de Cuentas por cobrar.
- Validaciones:
  - Cubiertas por TypeScript, ESLint dirigido y build de FIN-060.
- Verificacion manual pendiente:
  - Registrar pagos de contado por cheque, deposito, transferencia, tarjetas y
    mixto; generar y revisar cada PDF.
  - Reversar un pago y confirmar que el recibo deje de estar disponible como
    documento vigente.
- Riesgos o trabajo pendiente:
  - El identificador `REC-XXXXXXXX` es una referencia operativa deterministica,
    no un rango fiscal independiente. Si SAR o la politica contable exige un
    correlativo formal de recibos, debera modelarse como una serie documental.
- Commit: pendiente.

### 2026-08-13 - UX-055 - Proteccion integral de eliminaciones y reemplazos

- Estado: Implementado y validado; SQL aplicado en Production; UAT y verificacion del deployment pendientes.
- Hallazgo: UX-055.
- Causa raiz:
  - Varias acciones `Eliminar`, `Quitar` y `Enviar a papelera` descartaban
    registros o valores ingresados sin una decision explicita del usuario.
  - Tres flujos reemplazaban datos con operaciones separadas `delete + insert`;
    un fallo intermedio podia dejar informacion parcial o vacia.
- Codigo:
  - `src/app/(protected)/clientes/[id]/page.tsx`
  - `src/app/(protected)/ventas/page.tsx`
  - `src/app/(protected)/suppliers/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/app/(protected)/quotations/new/page.tsx`
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/invoicing/new/page.tsx`
  - `src/app/(protected)/settings/company/page.tsx`
- SQL:
  - `supabase/migrations/20260813140000_atomic_destructive_replacements.sql`
- Cambios:
  - Se agregaron confirmaciones identificables para papelera de clientes,
    actividades de Ventas, reemplazo de PDF de cuentas por pagar, contenedores
    de Booking/BL/cotizaciones, carga, cargos Miami, lineas de factura y reglas
    globales de seguro.
  - Las filas nuevas completamente vacias pueden quitarse sin confirmacion;
    las filas con datos y los registros persistidos siempre piden decision.
  - Cambiar producto, transporte o modalidad en una cotizacion nueva pide
    confirmacion si el cambio descartara contenedores ya ingresados.
  - `replace_client_rates`, `replace_agent_quote_container_rates` y
    `replace_quotation_cargo_with_totals` ejecutan validacion, borrado e
    insercion dentro de una sola transaccion PostgreSQL.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK; 70/70 paginas generadas.
  - Migracion aplicada correctamente en Supabase local con
    `npx.cmd supabase migration up --local`.
  - `npx.cmd supabase db push`: migracion `20260813140000` aplicada al proyecto
    Production `sarierp` (`fwspgdzvlbtbgiupvrzo`).
  - `npx.cmd supabase migration list`: `20260813140000` coincide en las columnas
    Local y Remote.
  - `npx.cmd supabase db lint --local --level error`: las funciones nuevas no
    reportan errores; permanece un hallazgo preexistente en
    `public.is_platform_admin` por `public.is_demo_environment()` ausente del
    esquema local.
  - `npx.cmd supabase db lint --linked --level error`: las funciones nuevas no
    reportan errores; el mismo hallazgo preexistente permanece en Production.
  - ESLint dirigido: 126 errores y 21 advertencias preexistentes en los modulos
    auditados (`any`, reglas de hooks y texto JSX); TypeScript y build pasan.
- Verificacion manual pendiente:
  - Probar Cancelar/Confirmar en cada modal y verificar que solo se quite el
    registro seleccionado.
  - Ejecutar UAT de los tres reemplazos transaccionales contra el proyecto
    Production vinculado.
  - Verificar el deployment de Production en `https://forwarders.app`.
- Riesgos o trabajo pendiente:
  - La dependencia de despliegue quedo resuelta al aplicar primero la migracion
    remota; falta confirmar el deployment del frontend y ejecutar UAT.
  - No se modificaron los borrados tecnicos de archivos subidos cuando falla su
    registro, porque son compensaciones necesarias y no acciones del usuario.
- Commit: `43a62ad`.

### 2026-08-13 - UX-054 - Confirmación al quitar contenedores del borrador BL

- Estado: Implementado en código; pendiente de validación manual y deployment.
- Hallazgo: UX-054.
- Causa raíz:
  - La papelera de la sección Contenedores quitaba inmediatamente la fila del
    estado local del borrador sin pedir confirmación.
  - Al guardar, `replace_bl_containers` reemplaza el conjunto completo, por lo
    que una fila omitida también se elimina de forma persistente.
- Código:
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
- SQL: ninguno.
- Cambios:
  - La papelera abre un modal de confirmación antes de quitar la fila.
  - El modal identifica el contenedor por número, tipo o posición y diferencia
    una fila nueva de un contenedor previamente guardado.
  - Para registros existentes se aclara que la eliminación definitiva ocurre
    únicamente al pulsar `Guardar contenedores`.
  - El botón de papelera ahora tiene nombre accesible y tooltip nativo.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; 70/70 páginas generadas.
  - ESLint dirigido: el modal compartido no reporta hallazgos y la página
    conserva 8 errores y 1 advertencia preexistentes, fuera de las líneas
    modificadas (`any`, efecto de carga y texto JSX).
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Confirmar que `Cancelar` conserva tanto filas nuevas como persistidas.
  - Confirmar que `Quitar contenedor` elimina solo la fila seleccionada del
    borrador.
  - Guardar y recargar el BL para comprobar la persistencia del cambio.
- Riesgos o trabajo pendiente:
  - La pantalla todavía requiere guardar explícitamente el conjunto después de
    confirmar; el modal no escribe directamente en Supabase.
- Commit: `43a62ad`.
### 2026-08-26 - UX-056 - Catálogo editable de navieras y colores

- Estado: Implementado en código; SQL aplicado en Production y Demo; UAT pendiente.
- Hallazgo: UX-056.
- Causa raíz:
  - Las navieras, sus tipos y colores de badge estaban definidos en
    `src/lib/constants/carriers.ts`, por lo que agregar o modificar una opción
    requería un cambio de código y un nuevo deployment.
- Código:
  - `src/app/(protected)/catalogs/page.tsx`
  - `src/components/ui/CarrierBadge.tsx`
  - `src/components/ui/CarrierCombobox.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
  - `src/hooks/useCarrierCatalog.ts`
- SQL:
  - `supabase/migrations/20260826120000_carrier_catalog.sql`
- Cambios:
  - Se agregó `carrier_catalog` con código, nombre, tipo, colores, visibilidad
    y orden; la migración conserva como semilla todas las opciones actuales.
  - Catálogos permite crear, editar y ocultar navieras, incluida la selección
    visual de color de fondo y texto.
  - El selector, los badges y la impresión comparativa consumen el catálogo
    activo; la lista anterior queda como respaldo si la consulta no está
    disponible durante el despliegue.
  - RLS permite lectura a usuarios internos aprobados y escritura únicamente
    a Admin/Pricing mediante `can_manage_pricing_catalogs()`.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - `npx.cmd supabase migration list --local`: no ejecutable porque la instancia
    local de PostgreSQL no está iniciada en `127.0.0.1:54322`.
  - `npx.cmd supabase db push`: migración `20260826120000` aplicada a Demo
    (`sarierp-staging`, `wlssekvxpfxhwedsjhpz`) sin ejecutar las tres
    migraciones históricas locales pendientes.
  - `npx.cmd supabase db push --dry-run --include-all` contra Production
    (`fwspgdzvlbtbgiupvrzo`): propuso únicamente `20260826120000`.
  - `npx.cmd supabase db push`: migración `20260826120000` aplicada a Production.
  - `npx.cmd supabase migration list --linked`: `20260826120000` coincide en
    Local y Remote en ambos proyectos.
  - ESLint dirigido: el hook y los componentes modificados no agregan hallazgos;
    permanecen errores preexistentes de efectos/`any` en Catálogos,
    `CarrierCombobox` y la tabla comparativa.
- Verificación manual pendiente:
  - Verificar RLS con perfiles Admin, Pricing y Ventas.
  - Crear una naviera, modificar sus colores y confirmar su aparición en el
    selector, badges y vista de impresión.
- Riesgos o trabajo pendiente:
  - Falta UAT funcional de creación, edición, visibilidad y consumo del catálogo.
- Commit: `6a640b1`.

### 2026-09-03 - FLOW-021 - Opciones comerciales múltiples por cotización

- Estado: Implementado, validado y desplegado en Production; UAT funcional pendiente.
- Hallazgo: FLOW-021.
- Causa raíz:
  - `agent_quotes` permitía comparar varias tarifas, pero el índice de selección y
    `pricing_items` conservaban solamente una alternativa comercial final.
  - Cambiar de naviera reemplazaba el pricing visible, por lo que enviar dos
    opciones requería duplicar la cotización o perder el cálculo anterior.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pricing/QuotationOptionsPanel.tsx`
  - `src/components/pdf/quotation-pdf.tsx`
  - `src/lib/quotation-options.ts`
- SQL:
  - `supabase/migrations/20260903120000_quotation_commercial_options.sql`
  - `supabase/tests/quotation_commercial_options.sql`
- Cambios:
  - Se agregaron `quotation_options` y `quotation_option_items` como snapshots
    independientes de tarifa, condiciones, costos, venta, ISV, profit y GP.
  - Pricing puede guardar el pricing actual como Opción A/B, marcar una
    recomendada, reemplazar un borrador y cambiar de tarifa sin perder snapshots.
  - Enviar al cliente publica y congela las opciones junto con el cambio de estado
    dentro de una sola RPC transaccional.
  - El PDF comercial genera una sección completa por opción bajo el mismo número
    de cotización y conserva una sola sección de términos y condiciones.
  - Ventas/Admin registra mediante confirmación la opción elegida; la RPC restaura
    exclusivamente sus líneas en `pricing_items`, selecciona su `agent_quote` y
    sincroniza totales y datos comerciales de la cotización.
  - Guards PostgreSQL impiden marcar la cotización como `Ganada` o crear Shipping
    Instructions cuando existen opciones pero ninguna ha sido aceptada.
  - Cotizaciones sin opciones conservan íntegramente el flujo legacy.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npx.cmd supabase migration up --local`: migración aplicada correctamente.
  - `npx.cmd supabase test db supabase/tests/quotation_commercial_options.sql`: PASS.
  - `npx.cmd supabase db lint --local --level warning`: sin hallazgos.
  - `npx.cmd supabase db push --dry-run`: Production propone únicamente
    `20260903120000_quotation_commercial_options.sql`.
  - `npx.cmd supabase db push`: migración aplicada correctamente en Production.
  - `npx.cmd supabase migration list --linked`: Local y Remote coinciden hasta
    `20260903120000`.
  - `npm.cmd run build`: OK; 70/70 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Supabase Production: migración `20260903120000` aplicada y confirmada en Remote.
  - Vercel Production: deployment `dpl_HiUdcT5yAggJuRxmUNDEeF5bLD5s` en estado
    `Ready`, con alias `https://forwarders.app`.
  - ESLint dirigido: los archivos nuevos no agregan hallazgos; las páginas y el
    PDF conservan errores preexistentes de `any`, hooks y accesibilidad.
- Verificación manual pendiente:
  - Crear dos opciones FCL con navieras y profits distintos y revisar el PDF.
  - Repetir con carga suelta/Aéreo Consolidado, ISV, seguro y multicontenedor.
  - Confirmar con perfiles Pricing y Ventas que publicación, selección y permisos
    coincidan con el flujo definido.
  - Completar UAT con perfiles Pricing y Ventas.
- Riesgos o trabajo pendiente:
  - El flujo multiópción se habilita para cotizaciones comerciales previas a
    operación. El repricing de una cotización que ya tiene SI/Booking continúa con
    el mecanismo legacy y requiere una fase posterior si debe reenviar opciones.
  - Falta revisión visual del PDF con datos reales y UAT del correo; el correo
    informa que las condiciones por opción se encuentran en el PDF adjunto.
- Commit: `47c3467`.

### 2026-09-03 - FLOW-022 - Notas comerciales específicas por opción

- Estado: Implementado, validado y desplegado en Production; UAT funcional pendiente.
- Hallazgo: FLOW-022.
- Causa raíz:
  - `quotations.client_notes` era la única fuente de observaciones comerciales,
    por lo que el mismo texto se repetía en todas las opciones del PDF.
  - Las opciones en borrador solo podían reemplazarse con el pricing actual; no
    existía una edición aislada de nombre, recomendación o notas.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pricing/QuotationOptionsPanel.tsx`
  - `src/components/pdf/quotation-pdf.tsx`
  - `src/lib/quotation-options.ts`
- SQL:
  - `supabase/migrations/20260903190000_quotation_option_client_notes.sql`
  - `supabase/tests/quotation_commercial_options.sql`
- Cambios:
  - Se agregó `quotation_options.client_notes` para conservar hasta 4000
    caracteres de observaciones comerciales exclusivas de cada alternativa.
  - `save_current_pricing_as_option_v2` guarda o reemplaza el snapshot y sus
    notas dentro de la misma transacción, manteniendo disponible la RPC anterior
    durante el despliegue para no romper clientes abiertos.
  - `update_draft_quotation_option_details` permite editar nombre, recomendación
    y notas sin alterar tarifa, cargos, costo, venta, profit o GP.
  - La edición y el reemplazo solo están disponibles para opciones `Borrador`;
    las opciones ofrecidas continúan congeladas.
  - El PDF separa observaciones generales de la cotización y observaciones de
    cada opción. Ventas también puede leer la nota antes de registrar la elección.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npx.cmd supabase migration up --local`: migración aplicada correctamente.
  - `npx.cmd supabase test db supabase/tests/quotation_commercial_options.sql`: PASS.
  - `npx.cmd supabase db lint --local --level warning`: sin hallazgos.
  - `npx.cmd supabase migration list --local`: historial local actualizado hasta
    `20260903190000`.
  - `npx.cmd supabase db push --dry-run`: Production propone únicamente
    `20260903190000_quotation_option_client_notes.sql`.
  - `npx.cmd supabase db push`: migración aplicada correctamente en Production.
  - `npx.cmd supabase migration list --linked`: Local y Remote coinciden hasta
    `20260903190000`.
  - `npm.cmd run build`: OK; 70/70 páginas generadas.
  - ESLint dirigido a `QuotationOptionsPanel.tsx` y `quotation-options.ts`: OK.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Vercel Production: deployment `dpl_93GGHp5EEcRxpjGi6Z6VhuvNYLMM` en estado
    `Ready`, con alias `https://forwarders.app`.
- Verificación manual pendiente:
  - Crear dos opciones con notas distintas y confirmar que cada página del PDF
    muestre únicamente la nota específica correspondiente.
  - Editar solo nombre/notas de una opción borrador y confirmar que sus líneas y
    totales no cambien.
  - Confirmar con una opción ofrecida que los controles de edición permanezcan
    ocultos y que la RPC rechace una modificación directa.
- Riesgos o trabajo pendiente:
  - Las opciones creadas antes de esta migración comienzan sin nota específica;
    conservan las observaciones generales y pueden completarse mientras sean borrador.
- Commit: `54f33f1`.

### 2026-09-03 - FLOW-023 - Trazabilidad visual entre opción y tarifa de agente

- Estado: Implementado, validado y desplegado en Production; UAT funcional pendiente.
- Hallazgo: FLOW-023.
- Causa raíz:
  - Cada `quotation_option` conservaba `agent_quote_id` y `agent_name`, pero la
    tarjeta solo mostraba carrier, tránsito y ETD.
  - Pricing y Ventas no podían identificar visualmente qué agente proporcionó
    cada alternativa ni navegar a su tarifa original.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pricing/QuotationOptionsPanel.tsx`
- SQL: no aplica; se reutiliza la relación persistida `agent_quote_id`.
- Cambios:
  - Cada opción muestra internamente `Agente/Proveedor` usando el nombre
    congelado al crear el snapshot.
  - `Ver tarifa de origen` cambia la comparación FCL a vista Cards cuando es
    necesario, desplaza hasta la tarifa exacta y la resalta temporalmente.
  - La vista de detalle para Ventas/Admin también muestra el agente de cada opción.
  - El PDF comercial no fue modificado y continúa ocultando el proveedor interno.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a `QuotationOptionsPanel.tsx`: OK.
  - `npm.cmd run build`: OK; 70/70 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - Vercel Production: deployment `dpl_3HJQzz2k8zfcDa43AtBrXC3wC4KW`
    en estado `Ready`, con alias `https://forwarders.app`.
- Verificación manual pendiente:
  - Abrir opciones A/B ligadas a agentes distintos y confirmar nombre, scroll y
    resaltado tanto desde vista Cards como desde Tabla FCL.
  - Confirmar en Ventas que el agente sea visible y que no aparezca en el PDF.
- Riesgos o trabajo pendiente:
  - Opciones históricas sin `agent_name` mostrarán `No especificado`, pero el
    vínculo a su tarifa seguirá disponible mediante `agent_quote_id`.
- Commit: `f438837`.

### 2026-09-04 - FLOW-024 - Repricing con opciones y operación existente

- Estado: Implementado, migrado y desplegado en Production; UAT funcional pendiente.
- Hallazgo: FLOW-024.
- Causa raíz:
  - Al aprobar un repricing con Shipping Instruction, Pricing intentaba devolver
    inmediatamente la cotización a `Ganada` y abrir la propagación operativa.
  - El guard de integridad impedía `Ganada` hasta registrar una opción `Aceptada`,
    pero la elección solo era posible después de publicar las opciones como
    `Ofrecida`; el flujo quedaba en una dependencia circular.
  - El selector general también permitía marcar la cotización como enviada sin
    ejecutar la RPC que publica los snapshots, dejándolos en `Borrador`.
  - El modal de revisión llamaba `Venta total` al subtotal sin ISV.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260904120000_quotation_option_repricing_flow.sql`
  - `supabase/tests/quotation_commercial_options.sql`
- Cambios:
  - Un repricing con opciones pendientes se aprueba como `Pricing Aprobado` sin
    modificar todavía la operación; luego se publica mediante el botón dedicado.
  - Ventas/Admin registra la opción elegida desde el detalle y decide si desea
    propagarla a las Shipping Instructions vinculadas.
  - La nueva RPC `finalize_quotation_option_selection` acepta la opción, restaura
    sus líneas y tarifa, sincroniza opcionalmente la operación y cambia la
    cotización a `Ganada` dentro de una sola transacción.
  - Ventas solo puede ejecutar la sincronización canónica para una SI cuya
    cotización ya tenga una opción `Aceptada`; bookings confirmados y BL continúan
    protegidos por las reglas existentes.
  - El cambio manual a `Enviada al Cliente` queda bloqueado en UI y mediante un
    trigger de integridad cuando existen opciones sin publicar; debe usarse
    Pricing Comparison para publicarlas transaccionalmente.
  - El modal de aprobación ahora separa costo, venta sin ISV, ISV y total cliente.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - `npx.cmd supabase migration up --local`: migración aplicada correctamente.
  - `npx.cmd supabase test db supabase/tests/quotation_commercial_options.sql`: PASS.
  - `npx.cmd supabase db lint --local --level warning`: sin hallazgos.
  - `npm.cmd run build`: OK; 70/70 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
  - `npx.cmd supabase db push --dry-run`: Production propuso únicamente
    `20260904120000_quotation_option_repricing_flow.sql`.
  - `npx.cmd supabase db push`: migración aplicada correctamente en Production.
  - `npx.cmd supabase migration list --linked`: Local y Remote coinciden hasta
    `20260904120000`.
  - Vercel Production: deployment `dpl_2vjFt3oUkidCat363ERo7FzkeuJn` en estado
    `Ready`, con alias `https://forwarders.app`.
- Verificación manual pendiente:
  - Repetir el caso real con una cotización reabierta y SI sin bookings: aprobar,
    publicar, elegir A y confirmar `Aceptar y propagar`.
  - Confirmar que la opción ganadora quede `Aceptada`, la otra `No seleccionada`,
    la cotización `Ganada` y la SI con agente/ETD/días libres de la opción A.
  - Probar `Aceptar sin actualizar operación` y un booking confirmado para
    verificar que no se sobrescriban datos operativos consolidados.
- Riesgos o trabajo pendiente:
  - La migración se aplicó antes del frontend para evitar llamadas a una RPC
    inexistente durante el rollout.
  - El flujo de rondas múltiples después de una opción ya aceptada no forma parte
    de este ajuste y requiere versionado explícito de rondas si se habilita.
- Commit: `627650b`.

### 2026-09-04 - FLOW-025 - Fechas seguras e impresión individual de opciones comerciales

- Estado: Implementado y validado localmente; despliegue y UAT pendientes.
- Hallazgo: FLOW-025.
- Causa raíz:
  - El detalle de la cotización convertía columnas `DATE` mediante
    `new Date('YYYY-MM-DD')`; en Honduras esto desplazaba visualmente ETD y
    vigencia al día anterior.
  - El PDF comercial agrupaba todas las opciones visibles en un solo documento,
    sin una acción para generar y compartir cada alternativa por separado.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/components/pricing/QuotationOptionsPanel.tsx`
- SQL: no aplica.
- Cambios:
  - El detalle reutiliza el helper central `formatDate`, que interpreta fechas
    sin hora en el calendario local y conserva el formato `DD/MM/YYYY`.
  - Cuando existen varias opciones, cada tarjeta muestra `Imprimir opción A/B`.
  - La impresión individual usa exclusivamente el snapshot de la opción elegida:
    tarifa, cargos, impuestos, naviera, ETD, vigencia y notas comerciales.
  - `Previsualizar opciones` y la impresión general permanecen disponibles para
    generar el documento conjunto, preservando el flujo existente.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a `QuotationOptionsPanel.tsx`: OK.
  - `npm.cmd run build`: OK; 70/70 páginas generadas.
  - `git diff --check`: OK; únicamente avisos de conversión LF/CRLF.
- Verificación manual pendiente:
  - Confirmar en Pricing Comparison y `quotations/[id]` que A y B abran PDFs
    independientes y que cada archivo contenga solamente sus cargos y condiciones.
  - Confirmar ETD/vigencia 12/09/2026 y 18/09/2026 sin desplazamiento de zona
    horaria en las tarjetas del caso real.
- Riesgos o trabajo pendiente:
  - La apertura del PDF conserva el comportamiento actual del navegador; un
    bloqueador de ventanas emergentes puede requerir autorizar el dominio.
- Commit: pendiente.

### 2026-09-07 - REV-20260907-01 - Fechas locales y vencimientos de calendario

- Estado: Implementado y validado con pruebas locales; UAT autenticado pendiente.
- Hallazgo: Fechas de formularios, pagos y vencimientos usaban el día UTC, que
  cambia a las 18:00 en Honduras. Las alertas de ETA interpretaban DATE como UTC;
  el parser aceptaba fechas imposibles trasladándolas silenciosamente a otro mes.
- Archivos:
  - `src/lib/format.ts`, `src/lib/alerts.ts`, `src/lib/tarifa-expiry-check.ts`.
  - `src/app/(protected)/ventas/page.tsx`.
  - `src/app/(protected)/agents/[id]/page.tsx`.
  - `src/app/(protected)/invoicing/page.tsx`.
  - `src/app/(protected)/invoicing/new/page.tsx`.
  - `src/app/(protected)/invoicing/[id]/page.tsx`.
  - `src/app/(protected)/accounts-payable/[id]/page.tsx`.
  - `src/app/(protected)/quotations/new/page.tsx`.
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`.
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/app/(protected)/operations/garantias/page.tsx`.
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`.
  - `src/app/portal/pickup/page.tsx`, `src/app/portal/pre-alertas/nueva/page.tsx`.
  - `tests/calendar-and-auth.test.mjs`.
- SQL: no aplica; no modifica fechas persistidas, timestamps de auditoría ni
  aritmética UTC explícita de vencimientos por plazo.
- Validación: pruebas en Honduras después de las 18:00, DATE, fechas imposibles,
  año bisiesto y diferencia de días durante cambios de horario de Miami; TypeScript.
- Riesgos / acción manual: probar altas, fechas de pago, filtros de Ventas,
  vencimiento de tarifa y alertas de ETA con usuarios reales. El dashboard Miami
  aún requiere un intervalo propio para sus filtros «hoy» sobre timestamps.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-02 - Sesión obsoleta y destinos de login

- Estado: Implementado y validado con dependencias simuladas; UAT de sesión pendiente.
- Hallazgo: una consulta de perfil tardía podía restaurar información del usuario
  anterior. El login validaba la ruta junto con sus filtros, perdiendo algunos
  destinos permitidos, y no capturaba excepciones de conexión.
- Archivos: `src/hooks/useUser.tsx`, `src/lib/auth-redirect.ts`,
  `src/app/login/page.tsx`, `src/app/portal/login/page.tsx`,
  `tests/user-session.test.mjs`, `tests/calendar-and-auth.test.mjs`.
- SQL: no aplica; permisos de roles y RLS conservados.
- Cambios: invalidación de respuestas obsoletas, limpieza del perfil al cambiar
  sesión, consulta diferida fuera del callback de auth, salida de loading ante
  fallos y normalización del destino antes de comprobar permisos.
- Validación: logout con consulta pendiente, A→B con respuestas invertidas,
  bootstrap antiguo, reintento tras fallo, desmontaje, sesión SSR, filtros/hash,
  rutas externas y normalización de segmentos; TypeScript y ESLint dirigido.
- Riesgos / acción manual: verificar login ERP/portal, refresco de token,
  recuperación de contraseña y cambio de sesión con cuentas reales de cada rol.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-03 - Tasa ausente distinta de exención explícita

- Estado: Implementado y validado con regresiones; UAT comercial/financiero pendiente.
- Hallazgo: `Number(null)` y `Number('')` generaban 0, evitando el default existente
  de la aplicación para una tasa no configurada.
- Archivos: `src/lib/tax.ts`, `tests/tax-and-documents.test.mjs`.
- SQL: no aplica; no se reescribieron facturas ni snapshots.
- Validación: prueba que falló antes del fix; null/undefined/vacío/inválido usan
  default, 0 y '0' permanecen exentos, tasa personalizada y cargo no gravable
  conservan sus resultados; TypeScript y ESLint dirigido.
- Riesgos / acción manual: verificar cotización Miami, Pricing y PDF de costos
  con default ausente y con 0 explícito. No constituye revisión normativa fiscal.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-04 - Autoridad del documento BL estructurado

- Estado: Implementado y validado con regresiones; UAT de reportes/portal pendiente.
- Hallazgo: un MBL/HBL estructurado sin número podía mostrar el número antiguo
  almacenado en el cache del booking, contradiciendo la autoridad documental.
- Archivos: `src/lib/booking-document-summary.ts`, `tests/tax-and-documents.test.mjs`.
- SQL: no aplica; no se modifica la numeración ni se eliminan documentos.
- Validación: prueba que falló antes del fix; documento vacío no resucita cache,
  documento numerado tiene prioridad y fallback legacy sigue disponible cuando
  no existe registro estructurado de ese tipo; TypeScript y ESLint dirigido.
- Riesgos / acción manual: comprobar reportes y detalle del envío en el portal
  con documentos nuevos sin número y expedientes históricos.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-05 - Landing accesible y formulario recuperable

- Estado: Implementado y probado en navegador local; verificación de recepción real pendiente.
- Hallazgo: intro obligatoria retrasaba el contenido; tabs carecían de manejo de
  teclado; formulario sin labels persistentes ni captura de excepciones; menú
  móvil sin estado accesible y comparativa demasiado ancha para móvil.
- Archivos: `src/components/marketing/ForwardersLanding.tsx`,
  `docs/review-2026-09-07.md`.
- SQL: no aplica; se conserva la inserción de leads y sus políticas actuales.
- Cambios: retirada de la intro en la landing; reutilización de Tabs; CTA hacia
  capturas del producto; scroll/márgenes para cabecera fija; labels/autocomplete;
  validación de espacios, exclusión de doble envío, try/catch/finally y errores
  visibles; privacidad enlazada; menú con Escape y retorno de foco; tabla con
  desplazamiento horizontal accesible.
- Validación: Chrome 1440×1000 y 390×844, teclado en tabs, panel único, labels,
  menú/Escape/foco, ancho móvil y cabecera fija; fallo de conexión, reintento,
  doble submit y éxito con solicitudes interceptadas. Cero leads reales y sin
  excepciones JS. Capturas locales en `.ua/intermediate/landing-*.png`.
- Riesgos / acción manual: verificar la recepción de un lead autorizado en un
  ambiente de prueba; auditoría completa de contraste, zoom y lector de pantalla
  pendiente. La reorganización visual/comercial se propone en el informe.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-06 - Guía específica y validaciones reproducibles

- Estado: Implementado y validado estructuralmente; sin evaluación conductual independiente.
- Hallazgo: AGENTS enumeraba estados históricos; no existía skill específica del
  ERP. Los artefactos temporales ignorados por Git eran recorridos por ESLint.
- Archivos: `AGENTS.md`, `skills/sari-erp-maintenance/SKILL.md`,
  `skills/sari-erp-maintenance/references/module-map.md`, `package.json`,
  `tests/load-ts.mjs`, `eslint.config.mjs`, `docs/review-2026-09-07.md`.
- SQL: no aplica; no se modificaron skills globales ni permisos locales de Codex.
- Cambios: fuente actual de estados, skill cargable desde AGENTS con invariantes
  y mapa de módulos, comando `npm.cmd test` con Node/TypeScript instalados y
  exclusión de `.ua/intermediate/**` del lint. No se desactivaron reglas del código.
- Validación: parser YAML instalado, nombre/descripción, campos admitidos,
  ausencia de placeholders y enlaces existentes. Python no está disponible para
  `quick_validate.py`; se ejecutaron comprobaciones estructurales equivalentes.
- Riesgos / trabajo pendiente: ESLint global conserva 307 errores y 69 advertencias
  preexistentes. Revisarlos por módulo; no confundir build verde con UAT/RLS.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - REV-20260907-07 - Respuestas inválidas del proveedor de correo

- Estado: Implementado y validado con proveedor/base simulados; UAT de correo pendiente.
- Hallazgo: `response.json()` podía lanzar antes de actualizar la auditoría,
  dejando el aviso en `processing` e impidiendo el reintento previsto por el flujo.
- Archivos: `src/lib/email-provider-response.ts`,
  `src/app/api/miami/package-assignment-email/route.ts`,
  `src/app/api/support/notify/route.ts`, `tests/email-notifications.test.mjs`.
- SQL: no aplica; las tablas de auditoría y claves de idempotencia se conservan.
- Cambios: parser compartido para respuestas vacías, HTML, null y JSON inválido;
  la ausencia de confirmación pasa por el registro existente de fallo.
- Validación: ambos handlers devuelven 502 y actualizan `failed` ante HTML;
  respuesta válida conserva `sent` e ID del proveedor; demo no llama al proveedor
  ni crea auditorías de envío. No se enviaron correos reales.
- Riesgos / acción manual: probar en staging la auditoría y el reintento autorizado.
  La conciliación si falla la BD tras confirmación del proveedor y los fallos al
  consultar el ambiente siguen pendientes de revisión; no hay reintento automático nuevo.
- Commit: `48080c4`; cambios locales sin despliegue.

### Validación conjunta de REV-20260907-01 a REV-20260907-07

- `npm.cmd test`: PASS, 19 pruebas.
- `npx.cmd tsc --noEmit`: OK después del último cambio de código.
- ESLint dirigido a helpers, sesión, login, landing, APIs, pruebas y configuración:
  OK, sin errores ni advertencias. Global: deuda inicial sin incremento
  (307 errores / 69 advertencias).
- `npm.cmd run build`: OK, 70/70 páginas generadas en la compilación final.
- `git diff --check`: OK; solo avisos de conversión LF/CRLF del entorno Windows.
- No se ejecutó SQL ni se verificó RLS en una base activa. No se hizo deploy;
  la UAT autenticada y las acciones manuales indicadas siguen abiertas.

### 2026-09-07 - REV-20260907-08 - Rediseño de landing orientado a producto y demo

- Estado: Implementado; validado localmente en navegador. Despliegue y recepción
  real de un lead autorizado pendientes.
- Hallazgo: la landing repetía beneficios en varias secciones, relegaba las
  capturas reales y no permitía leerlas con ampliación. Todo el contenido se
  incluía en un componente cliente grande y había cifras/promesas no verificadas.
- Archivos:
  - `src/components/marketing/ForwardersLanding.tsx`.
  - `src/components/marketing/LandingHeader.tsx`.
  - `src/components/marketing/LandingContact.tsx`.
  - `src/components/marketing/ProductShowcase.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `src/components/marketing/landing.module.css`.
  - `skills/sari-erp-maintenance/references/module-map.md`.
  - `docs/review-2026-09-07.md`.
- SQL: no aplica. No se modifican registro de leads, permisos ni rutas del ERP.
- Cambios:
  - Hero centrado en cotizar, coordinar y controlar márgenes junto a una captura
    real identificada como demostración; prioridad de carga para esa imagen.
  - Seis vistas del producto con Tabs existentes, visor Dialog, tamaño original,
    desplazamiento, cierre con Escape y retorno de foco al disparador exacto.
  - Flujo de cuatro etapas, tres áreas internas y acceso al portal del cliente.
    Se conservan destinos anteriores `#beneficios`, `#funcionalidades`, `#workflow`,
    `#portal`, `#producto` y `#demo`.
  - FAQ nativa con información verificable y alcance por definir para migración,
    implementación y precio. Se retiran «+70 cotizaciones» y «menos de 24h».
  - Secciones estáticas de servidor y componentes cliente para menú, visor y
    formulario. Se conserva trim, guard de doble envío, validación y recuperación
    de errores. Sin nuevas librerías ni servicios de analítica.
  - Mayor contraste del texto secundario, foco visible y movimiento reducido
    acotado a la landing; no hay animaciones continuas ni contenido oculto al entrar.
- Validaciones:
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a `src/components/marketing`: OK.
  - `npm.cmd test`: PASS, 19 regresiones existentes.
  - `npm.cmd run build`: OK, 70/70 páginas generadas.
  - Chrome: anchos 320, 390, 768, 1024 y 1440 sin overflow global; tabs por teclado;
    zoom al 100%; foco contenido en modal y restituido al botón correcto; FAQ;
    movimiento reducido; enlaces internos; menú/Escape y cabecera fija.
  - Formulario con campos vacíos/espacios, fallo de conexión, reintento, doble
    submit y éxito simulados. Cero leads o correos reales.
  - Medición puntual local en build de producción, 1440×1000 y cache de navegador
    desactivada: JS inicial (`encodedBodySize`) 310,690 → 271,657 bytes (~12.6%
    menos); altura 9,300 → 4,742 px. LCP observado 968 → 432 ms. Son observaciones
    locales, no métricas de campo ni una garantía de rendimiento o conversión.
  - Evidencia temporal en `.ua/intermediate/redesign-*.png` y
    `.ua/intermediate/landing-metrics-{before,after}.json`.
  - La suite de navegador se repitió sobre el build final de producción: PASS,
    sin excepciones JS. `git diff --check`: OK.
- Riesgos / trabajo pendiente:
  - Confirmar recepción real del formulario en un ambiente autorizado antes de
    cerrar el flujo de contacto como validado de extremo a extremo.
  - Analítica de conversión pendiente de elegir/configurar proveedor aprobado.
    No se añadió seguimiento ni se recolectan datos adicionales.
  - No se verificó conformidad WCAG completa ni se modificaron las condiciones
    comerciales. Los flujos autenticados del ERP conservan sus UAT pendientes.
- Commit: `48080c4`; cambios locales sin despliegue.

### 2026-09-07 - POL-REVIEW-01 - Revisión de privacidad y términos

- Estado: revisión documental realizada; propuestas sin implementar ni publicar.
  Cobertura jurídica pendiente; LEG-001 a LEG-004 no se cierran.
- Archivos: `docs/privacy-terms-review-2026-09-07.md`, `HARDENING.md`.
- Código / SQL: sin cambios. RLS fuera del alcance solicitado.
- Hallazgos: POL-01 a POL-08 en el informe: identidad y marcas, plazo de contacto
  contradictorio, aviso para prospectos, destinatarios/proveedores, acceso previo
  y aceptación versionada, condiciones logísticas, anexos operativos y versiones.
- Validaciones: contraste de políticas, branding, formulario de demo, registros,
  proxy/layout de portal e integraciones de correo; consulta de fuentes jurídicas
  públicas con límites documentados. No se verificó el sitio desplegado ni contratos.
- Riesgos / pendientes: confirmar identidad y condiciones con el titular; aprobación
  jurídica, inventario de proveedores/regiones, conservación y prueba de derechos;
  implementación y validación de acceso público/aceptación después de definir textos.
- Commit: pendiente; informe local sin despliegue.

### 2026-09-07 - POL-IMPLEMENT-01 - Privacidad, condiciones y declaración versionada

- Estado: implementado y validado localmente. Migración remota, publicación y
  validación jurídica pendientes; no se declara cobertura legal completa.
- Decisión del titular: Hernova Systems es nombre comercial sin sociedad constituida;
  dominio `forwarders.app`, correo `contacto@forwarders.app`. No se aportó identidad
  personal/domicilio/RTN; LEG-001 conserva ese pendiente.
- Archivos:
  - `.gitattributes`, `public/legal/platform-2026-06-22.json`,
    `public/legal/platform-2026-09-07.json`, `public/legal/logistics-2026-06.json`,
    `public/legal/logistics-2026-09-07.json`.
  - `src/app/layout.tsx`, `src/app/politicas/page.tsx`,
    `src/app/terminos-logisticos/page.tsx`, `src/app/portal/info/terminos/page.tsx`.
  - `src/components/legal/LogisticsTerms.tsx`,
    `src/components/legal/TermsAcknowledgement.tsx`, `src/lib/legal-documents.ts`.
  - `src/app/register/page.tsx`, `src/app/portal/register/page.tsx`, `src/proxy.ts`,
    `src/components/marketing/LandingContact.tsx`.
  - `tests/legal-documents.test.mjs`, `docs/privacy-operations-runbook.md`,
    `docs/privacy-terms-review-2026-09-07.md`, `HARDENING.md`.
- SQL: `supabase/migrations/20260907160000_signup_legal_acceptance.sql`;
  suite `supabase/tests/signup_legal_acceptance.sql`.
- Cambios: POL-01 a POL-08: marca/dominio corregidos, eliminación de promesa de
  tres días y condiciones logísticas no confirmadas, finalidad de prospectos,
  proveedores/derechos/conservación, textos separados y archivos versionados.
  Ruta pública específica sin abrir módulos privados. Índice móvil y lectura
  sin justificación forzada. Casilla de uso/lectura sin consentimiento publicitario.
- Integridad: captura de declaración en trigger independiente de perfiles, fecha
  del servidor, catálogo con hash SHA-256, sin permisos API para modificar evidencia.
  Se conserva aprobación/roles; altas legacy sin declaración no se inventan como
  aceptaciones. No se da por probado correo ni representación de organización.
- Validaciones:
  - TypeScript y ESLint dirigido: OK; 21 pruebas Node: PASS; build: 71/71 páginas.
  - Migración y suite en PostgreSQL local `supabase_db_sarierp`, transacción con
    rollback: PASS. Declaraciones inválidas rechazadas, fecha no falsificable,
    lectura propia por RLS, anon sin lectura, usuarios sin inserción/update/delete,
    cambios de metadata sin alterar evidencia, perfiles Pendiente conservados.
  - Chrome: 320/390/1440 sin overflow, archivos y páginas públicas, módulos del
    portal protegidos; casilla no premarcada/obligatoria, fallo/reintento/doble
    submit y payload de ambos registros. Solicitudes interceptadas, cero cuentas,
    leads o correos reales. Capturas locales `.ua/intermediate/legal-*-mobile.png`.
  - `git diff --check`: OK.
- Riesgos / acciones pendientes:
  - Aplicar migración en staging y producción antes de publicar frontend; probar
    altas con confirmación de correo e invitaciones autorizadas en staging.
  - Las pruebas de navegador simulan Supabase; no sustituyen UAT de extremo a extremo.
  - Acreditar identidad jurídica, condiciones del operador, atención del buzón,
    acuerdos/proveedores/regiones y conservación/exportación/eliminación/restauración.
  - La evidencia se elimina al borrar la cuenta; resolver antes cualquier deber
    de conservación legal. No existe aceptación retrospectiva ni universal.
  - LEG-002/003/004 no se cierran hasta resolver anexos, revisión jurídica y rollout.
- Commit: pendiente; cambios locales sin despliegue ni SQL remoto.

### 2026-09-07 - POL-RELEASE-01 - Publicación de políticas y registro de aceptación

- Estado: migración aplicada y frontend publicado en Production; comprobaciones
  públicas completadas. UAT de altas reales y validación jurídica pendientes.
- Autorización: titular solicitó migración, commit y despliegue juntos.
- SQL: `20260907160000_signup_legal_acceptance.sql` aplicada mediante Supabase CLI
  al proyecto Production vinculado `fwspgdzvlbtbgiupvrzo`.
- Archivos: los de POL-IMPLEMENT-01 y documentación de esta publicación.
- Validaciones: dry-run mostró únicamente esta migración; `db push --yes`: OK.
  Se conservan TypeScript, lint dirigido, build 71/71, 21 pruebas Node, pruebas
  SQL/RLS locales y navegador registradas en POL-IMPLEMENT-01.
- Esquema remoto: dump de estructura `public,auth` confirmó tablas, claves,
  RLS habilitado, SELECT propio para authenticated, ausencia de permisos de
  escritura de usuarios y trigger `on_auth_user_created_legal_acceptance`.
  Evidencia temporal ignorada: `.ua/intermediate/legal-prod-schema.sql`.
- GitHub: commit `44cda8c` publicado en `origin/main`.
- Vercel: despliegue automático del push `dpl_4ZwZV1E6KCDhbKxqT95PegY4e4de`,
  estado `Ready`, Production, alias `https://forwarders.app`.
- Comprobación pública: `/politicas`, `/terminos-logisticos`, `/register` y
  `/portal/register`: HTTP 200 y contenido nuevo; cuatro archivos legales con
  SHA-256 idéntico al commit; `/portal/paquetes` conserva redirección a login.
  Solo solicitudes GET; no se crearon cuentas ni se enviaron correos reales.
- Pendientes: UAT de alta real/correo e invitaciones con cuentas autorizadas,
  identidad legal, condiciones comerciales y procesos señalados anteriormente.
  La publicación no cierra LEG-001 a LEG-004 como cobertura jurídica completa.
- Commit de implementación: `44cda8c`. Esta actualización documental registra
  el resultado de publicación sin modificar código ni SQL aplicado.

### 2026-09-11 — UX-DASH-01 / REP-DASH-01 — Prioridades y métricas comerciales

- Estado: implementado, validado técnicamente en local y publicado en Production.
  Pendiente UAT autenticado por rol; no se declara cerrado el flujo completo.
- Hallazgos:
  - Los pendientes de pricing heredaban el período comercial y mostraban primero
    los más recientes, ocultando pendientes antiguos.
  - El contador de creadas seguía restringido al mes actual al elegir otro rango;
    el margen global se presentaba como media de porcentajes individuales.
  - El embudo infería transiciones históricas a partir del estado actual.
  - Indicadores sin acceso a su detalle, tablas estrechas y rankings agrupados
    por nombre en lugar de identificador.
- Archivos:
  - `src/app/(protected)/dashboard/page.tsx`.
  - `src/lib/commercial-dashboard.ts`.
  - `tests/commercial-dashboard.test.mjs`.
  - `HARDENING.md`.
- SQL: no aplica; sin cambios de esquema, RLS ni transiciones de negocio.
- Cambios:
  - Prioridades de todos los períodos: pricing y respuestas por antigüedad de
    creación, tarifas seleccionadas vencidas o con vencimiento en siete días,
    y tareas vencidas. Se aclara que la antigüedad es desde creación, no un SLA.
  - Cuatro indicadores con detalle: venta y utilidad cotizadas ganadas, tasa de
    cierre y valor abierto. Margen global = utilidad ganada / venta ganada.
    Sin denominador se muestra ausencia de base, no una tasa de cero.
  - Períodos por fecha local de creación y comparación con igual cantidad de
    días inmediatamente anteriores. Ambos grupos usan estados actuales; no se
    presentan como cierres históricos, facturación o cobros.
  - Distribución actual por estados canónicos, incluidos borradores, en lugar
    del embudo estimado. Borradores excluidos del valor de oportunidades abiertas.
  - Detalle paginado a ancho completo y filtros por estado, cliente y vendedor
    conservando el período; rankings agrupados por ID. Pestañas reutilizadas.
  - Pricing abre con pendientes; Ventas conserva su ámbito y no ve rankings de
    otros vendedores; los accesos respetan permisos existentes por rol.
  - Lectura paginada de cotizaciones, pricing y tareas para evitar totales
    truncados; errores de carga con reintento y descarte de respuestas obsoletas.
    Las mutaciones de tareas mantienen filtro explícito de propietario.
  - Fechas de tareas con helper compartido, etiquetas visibles/accesibles,
    vistas de pendientes/vencidas/completadas y contraste de botones en oscuro.
- Validaciones:
  - Pruebas Node: 33/33, incluidas cuatro regresiones nuevas para fechas locales,
    año completo, intervalos comparables, margen ponderado y base de comparación.
  - Lint dirigido tras el último ajuste: sin errores ni advertencias.
  - `npx.cmd tsc --noEmit`: OK tras retirar la vista de pruebas.
  - `npm.cmd run build`: OK, 72/72 páginas, sin la ruta temporal de revisión.
  - Navegador con datos simulados: PASS en 1440/768/390/320 px, sin overflow
    del documento; inspección visual en claro y oscuro. Se corrigió una etiqueta
    `sr-only` de la tabla que escapaba del contenedor con scroll.
  - Navegador: margen global, filtros de indicadores y estados, pricing antiguo
    fuera del período, tarifa vencida, paginación, tareas vencidas, foco y
    recuperación de un fallo de pricing sin mostrar importes falsos de cero.
    Sin peticiones a Supabase real ni escritura de datos remotos.
  - `git diff --check`: OK. Harness temporal retirado y caché de tipos de esa
    ruta eliminada antes de la compilación definitiva.
- Riesgos y pendientes:
  - UAT autenticado de Admin, Ventas, Pricing y Operaciones, RLS real, enlaces a
    destinos y CRUD de tareas; los mocks de navegador no certifican esos flujos.
  - Vigencia visible según tarifas seleccionadas accesibles mediante RLS.
  - Las comparaciones no reconstruyen el estado histórico de una cotización.
  - El cálculo monetario conserva la fuente cotizada y sus fallbacks existentes;
    no sustituye reportes contables. Validar rendimiento con grandes históricos.
  - Frontend publicado; sin SQL ni cambios de datos remotos. Harness temporal retirado.
- Publicación autorizada por el titular el 11/09/2026:
  - Commit de implementación `ea408c6f26efa17f809a4a3981043705eee1547b`,
    publicado en `origin/main` mediante Git; integración automática de Vercel.
  - GitHub deployment `6403164833`, entorno `Production`; estado Vercel
    `success` / `Deployment has completed` para ese commit.
  - Vercel: `https://vercel.com/claudherhn-5641s-projects/sarierp/4VFy4YQB2Ubfx3aE13Q5JN72JwuR`.
  - Comprobaciones HTTPS en `https://forwarders.app` tras completar el despliegue:
    `/dashboard` devuelve 307 a `/login?next=%2Fdashboard`, `/login` devuelve 200
    y `/api/dashboard-review` devuelve 404. Sin sesiones ni datos reales de prueba.
  - La publicación no sustituye el UAT autenticado ni verifica RLS de extremo
    a extremo; se conservan los pendientes descritos arriba.
- Commit de implementación: `ea408c6`. Registro de publicación en commit documental posterior.

### 2026-09-14 — UX-NAV-02 / UX-QUOTE-02 — Sidebar y detalle de cotización

- Estado: implementado; validación local de navegador, regresiones y compilación
  definitiva completadas y frontend publicado en Production. Pendiente UAT
  autenticado por rol; no se declara cerrado el flujo comercial de extremo a extremo.
- Hallazgos: menú extenso sin jerarquía por rol, selección incorrecta en detalle
  y actividad, drawer móvil sin control de foco, breadcrumb incorrecto, acciones
  de estado que fallaban después del clic, resumen económico ambiguo, correo sin
  aclarar el adjunto manual y consultas fallidas presentadas como datos vacíos.
- Archivos:
  - `src/components/layout/sidebar.tsx`, `protected-shell.tsx`, `topbar.tsx`.
  - `src/components/ui/Breadcrumbs.tsx`.
  - `src/app/(protected)/quotations/[id]/page.tsx`.
  - `src/app/(protected)/historico/page.tsx`.
  - `src/lib/sidebar-navigation.ts`, `src/lib/quotation-detail-ux.ts`.
  - `tests/quotation-navigation.test.mjs`, `HARDENING.md`.
- SQL: no aplica; sin migraciones, cambios de RLS, transiciones canónicas ni RPC.
- Cambios:
  - Inicio, Alertas y Reportes como accesos generales; CTA de nueva cotización
    según permisos. Compras integrada en Finanzas, soporte y perfil al pie.
  - Grupos plegables, preferencia por usuario/rol, orden por rol y apertura del
    grupo activo al navegar. Etiquetas completas y un solo badge de notificaciones
    sin leer; no se fusionaron los sistemas de alertas y notificaciones existentes.
  - Perfil del sidebar obtenido de `useUser`; descarte de conteos obsoletos al
    cambiar usuario o marcar notificaciones como leídas. Logout informa fallos.
  - Dialog existente para navegación móvil: foco contenido, Escape, restitución
    de foco al botón del menú y cierre al pasar al ancho de escritorio.
  - Detalle y edición activan Cotizaciones; Registro de actividad y Nueva
    cotización conservan selección independiente. Breadcrumb a `/historico` con
    filtros/paginación de origen y validación de la ruta de regreso.
  - Encabezado con cliente, ruta, servicio y vigencia; siguiente paso según estado
    y capacidades existentes. Editar queda como acción secundaria. Los requisitos
    de opciones se explican antes de intentar cambiar a Enviada o Ganada.
  - Resumen distingue subtotal, ISV, total al cliente, costo, utilidad y margen.
    Selector de fuente; una opción aceptada usa sus importes guardados por defecto,
    sin recalcular ni modificar snapshots. Utilidad negativa con color de pérdida;
    margen sin denominador muestra «Sin base».
  - Diseño adaptable, pestañas desplazables y tablas con scroll propio. Actividad
    reciente limitada a tres eventos; historial completo en su pestaña.
  - Correo en Dialog accesible: descargar PDF, abrir aplicación de correo y adjuntar
    manualmente. Prepararlo no registra un envío ni cambia el estado. Fallo de
    portapapeles con mensaje y alternativa manual.
  - Errores críticos de carga bloquean importes/documentos parciales y ofrecen
    reintento. Historial y validaciones distinguen errores de ausencia de registros.
    Versionado de cargas y componente por cotización/usuario evitan mezclar datos.
- Validaciones:
  - `npm.cmd test`: 37/37, incluidas selección de rutas, orden por rol, conservación
    y validación del regreso al listado y requisitos de opciones comerciales.
  - Navegador Chrome con fixtures locales, sin peticiones a Supabase real:
    1440/768/390/320 px sin overflow del documento ni del contenedor principal;
    capturas revisadas en escritorio/móvil y captura en oscuro.
  - Navegador: selección de Cotizaciones, breadcrumb con filtros, transición Ganada
    deshabilitada con explicación, correo y adjunto manual, Escape y restitución
    de foco, 35 tabulaciones dentro del menú móvil, utilidad negativa, fuente de
    opción aceptada y fallo de pricing con reintento. Sin excepciones de ejecución.
  - Harness temporal retirado; evidencias locales ignoradas en `.ua/intermediate`.
  - Lint: sidebar, shell, topbar, Breadcrumbs y helpers sin errores ni advertencias.
    Detalle pasa de 15 errores/1 advertencia a 6 errores previos de `any`; listado
    conserva 9 errores/2 advertencias previos (tipado, efecto y código sin uso).
    No se desactivaron reglas ni se añadieron errores de lint.
  - `npx.cmd tsc --noEmit`: OK tras retirar el harness y sus tipos temporales.
  - `npm.cmd run build`: OK, 72/72 páginas; sin la ruta temporal de revisión.
  - `git diff --check`: OK tras corregir un espacio final en el bloque de correo.
- Riesgos y pendientes:
  - UAT autenticado por rol, visibilidad real mediante RLS, vuelta al listado tras
    cambios de datos, emisión de PDF, correo en clientes instalados y aceptación/
    repricing/operación con cuentas autorizadas. Los mocks no certifican esas acciones.
  - Preferencias del menú locales al navegador; no se sincronizan entre dispositivos.
  - Se conserva la deuda de tipado del listado/detalle y las fuentes monetarias
    existentes. Sin escrituras en datos remotos durante las pruebas.
- Publicación: commit y despliegue autorizados por el titular el 14/09/2026.
  - Commit de implementación `898e38a0aba19dac6bb69bb9219e74bbd472c381`, publicado
    en `origin/main` mediante Git; despliegue automático de Vercel.
  - GitHub deployment `6443547683`, entorno `Production`, estado `success` /
    `Deployment has completed` para ese commit.
  - Vercel: `https://vercel.com/claudherhn-5641s-projects/sarierp/6tfTefNU7yBJ9p4ivvMFCUYUgZq5`.
  - Comprobaciones públicas HTTPS del 14/09/2026: `/dashboard` y `/quotations/id`
    devuelven 307 al login con su ruta de regreso, `/login` devuelve 200 y
    `/api/ux-review/demo` devuelve 404. Solo GET, sin sesiones ni datos reales.
  - Se conservan los pendientes de UAT/RLS y la deuda histórica de lint anteriores.
    La publicación no sustituye una prueba autenticada de los flujos comerciales.
- Commit de implementación: `898e38a`. Resultado de publicación en commit documental posterior.

### 2026-09-14 — REP-011 / UX-REP-01 — Consulta y exportación de reportes

- Estado: implementado y validado con pruebas locales, navegador simulado y
  compilación definitiva. Publicado en producción; UAT autenticado pendiente.
- Hallazgos: Vencidas heredaba el mes actual y ocultaba deudas anteriores; errores
  de consulta terminaban como datos vacíos, los SELECT no recorrían todas las
  páginas y la tabla estaba limitada a 120 filas. Filtros mezclaban estados y
  campos de distintos módulos; indicadores operativos mostraban un monto sin base.
- Archivos: `src/app/(protected)/reports/page.tsx`, `src/lib/report-query.ts`,
  `src/lib/report-view.ts`, `src/components/ui/Pagination.tsx`,
  `tests/reports.test.mjs`, `HARDENING.md`.
- SQL: no aplica. Se conservan fuentes financieras canónicas y RPC de readiness;
  no se modifican permisos, RLS, snapshots, facturas, pagos ni estados de negocio.
- Cambios:
  - Lectura paginada por fuente con orden estable y desempate por ID. Avanza por
    la cantidad realmente recibida hasta una página vacía, incluso si el servidor
    limita las respuestas por debajo del tamaño solicitado. Detecta IDs repetidos.
  - Carga solamente las fuentes del reporte seleccionado. Errores persistentes
    con reintento, descarte de cargas obsoletas y aislamiento por usuario/rol.
    Importes y exportación bloqueados hasta completar todas sus dependencias.
  - Vencidas abre con todas las fechas; aclara que muestra saldos actuales, no una
    reconstrucción histórica. Cada reporte indica su fecha de filtrado. Trimestre
    corresponde al trimestre calendario hasta hoy; validación de rangos invertidos.
  - Estados derivados del reporte y filtros aplicables al módulo; los parámetros
    de campos ajenos se ignoran. Selección inicial por rol, grupos por área y
    selector móvil. Fechas, filtros, búsqueda, página y orden se conservan en URL;
    al cambiar de reporte se recuerda su selección durante la visita.
  - Búsqueda, orden numérico/monetario y cronológico, paginación 25/50/100 y enlaces
    al documento original condicionados a permisos. Totales sobre todas las filas
    filtradas; CSV/PDF incluyen todas, independientemente de la página visible.
  - Indicadores propios para operaciones y preparación de embarques, sin montos
    ficticios. Comercial usa Venta cotizada, Utilidad cotizada y Margen global;
    se mantiene la separación de monedas y la fuente de importes existente.
  - Exportaciones con etiquetas visibles y PDF generado a petición. Apertura de
    pestaña asociada al clic, alternativa de descarga y mensajes de error. CSV
    con BOM UTF-8, campos entrecomillados y neutralización de fórmulas de planilla.
  - Filtros plegables en móvil, tablas con scroll propio y paginación adaptable.
    Botones y selector de la paginación compartida reciben nombres accesibles.
- Validaciones:
  - `npm.cmd test`: 45/45. Ocho pruebas nuevas cubren lectura completa con límite
    menor, error en página posterior, duplicados/respuestas obsoletas, deuda
    anterior, trimestre calendario, filtros/URL/permisos, CSV y orden por valores.
  - ESLint dirigido a los cinco archivos de código/pruebas: sin errores ni avisos.
  - Navegador Chrome con 1,302 cotizaciones simuladas y API limitada a 100 filas:
    total USD 130,200.00, 1,302 filas en CSV, búsqueda de la última cotización,
    tamaño de página, persistencia de filtros entre reportes y al recargar URL.
  - Navegador: Vencidas incluye CxC/CxP de agosto; USD y HNL separados; campos de
    pago solo donde aplican; indicadores operativos; enlaces al documento; fallo
    en la segunda página sin exportación parcial ni ceros falsos y reintento.
  - Navegador en 1440/768/390/320 px sin overflow del documento o main. Revisión
    visual en escritorio/móvil y oscuro; filtros móviles expanden/colapsan.
    Se corrigió un desbordamiento de los controles de paginación a 320 px.
  - PDF generado efectivamente con fixture de una fila: 7,109 bytes y cabecera PDF
    válida; rango invertido bloquea exportaciones. Sin excepciones en las pruebas
    finales y sin peticiones a Supabase real ni mutaciones de datos remotos.
  - Caché local de Turbopack invalidaba una ruta temporal antigua; se limpió y
    se repitieron las pruebas correctamente. Harness retirado; evidencias locales
    ignoradas en `.ua/intermediate`. Caché de desarrollo retirada antes del build.
  - `npx.cmd tsc --noEmit`: OK tras retirar la ruta de revisión y su caché.
  - `npm.cmd run build`: OK, 72/72 páginas; ruta temporal ausente del build.
  - `git diff --check`: OK.
- Riesgos y pendientes:
  - UAT autenticado por rol y RLS real, enlaces completos a destinos, revisión de
    PDF con tablas anchas y grandes volúmenes, compatibilidad CSV con Excel y
    conciliación con datos reales. Los fixtures no certifican estos flujos.
  - Los saldos son actuales. El filtro de vencimiento no calcula saldos históricos.
    Consultas paginadas no son un snapshot transaccional entre múltiples tablas;
    conviene actualizar tras cambios concurrentes. Validar rendimiento/memoria
    de reportes muy grandes y de exportaciones PDF extensas.
  - Nombres de cliente/vendedor y cálculos financieros mantienen sus fuentes
    existentes; no se introduce conversión de monedas ni se recalculan documentos.
- Publicación (14/09/2026):
  - Commit y despliegue autorizados por el usuario. Implementación `305f605`
    publicada en `main`; Vercel y GitHub confirman Production `success`.
  - Deployment GitHub `6444275867`, Vercel `FXqzYFhuQiaw4LVGvuU6mEeAUa3a`.
    URL: `https://sarierp-ed9sfzifv-claudherhn-5641s-projects.vercel.app`.
  - Verificación pública en `https://forwarders.app`: `/reports` devuelve 307
    a `/login?next=%2Freports`, `/login` devuelve 200 y `/api/reports-review`
    devuelve 404. Solo solicitudes GET, sin sesiones ni mutaciones de datos.
  - Se conservan los pendientes de UAT/RLS, conciliación y exportaciones extensas.
    La publicación no certifica el flujo autenticado con datos reales.
- Commit de implementación: `305f605`. Resultado de publicación en commit
  documental posterior.

### 2026-09-14 — REP-012 / UX-FIN-01 — Rentabilidad y cobertura del Dashboard Financiero

- Estado: implementado y validado con pruebas locales, navegador y build final.
  Publicado en producción; UAT autenticado y verificación de RLS desplegado pendientes.
- Hallazgos: consultas sin paginación y errores de costos ignorados; suma de
  monedas distintas bajo USD; utilidad presentada como real con costos parciales;
  CSV limitado a ocho nombres truncados y montos redondeados. Filtros sin
  persistencia ni etiquetas de fecha, pérdidas sin enlace al detalle y baja
  visibilidad de registros pendientes de revisar.
- Archivos: `src/app/(protected)/financial-dashboard/page.tsx`,
  `src/lib/financial-dashboard.ts`, `tests/financial-dashboard.test.mjs`,
  `HARDENING.md`.
- SQL: no aplica. No se modifican políticas, permisos, documentos ni estados.
- Cambios:
  - Lectura completa con `readAllReportRows`, orden por ID, cláusulas IN de hasta
    100 cotizaciones y exclusión de líneas eliminadas. Publicación del resultado
    solo al completar todas las fuentes; errores persistentes, reintento,
    invalidación de consultas obsoletas y aislamiento por usuario/rol.
  - Comprobación de acceso mediante `can_select_provider_invoice_item` para una
    cotización ganada visible. Si devuelve false, el costo y la detección de
    pérdidas quedan explícitamente no disponibles; una restricción RLS no se
    interpreta como ausencia de costos. Un error en esa comprobación bloquea
    la consulta. No se sustituye la política RLS ni se amplían permisos.
  - Registro por cotización y moneda. La venta de cabecera existente se conserva
    cuando Pricing identifica una sola moneda; para Pricing multimoneda se usan
    sus ventas por moneda sin duplicar ni consolidar la cabecera. Sin Pricing o
    sin moneda identificable se exige revisión y no se inventa una base USD.
  - Costos registrados incluyen los impuestos de proveedor existentes. Utilidad
    y variación comparan importes de la misma moneda. Costos cero son válidos;
    cantidades cero no se reemplazan por uno. Importes inválidos no son ceros.
    Margen ponderado sobre ventas/costos comparables, con cobertura visible.
  - “Utilidad con costos registrados” declara su carácter provisional. Alertas
    de pérdidas, ausencia de costos, validación pendiente y datos por revisar
    filtran el detalle y llevan el foco al encabezado. Enlaces a validación de
    costos por cotización, Facturación, CxC y CxP.
  - Fechas locales de creación, trimestre calendario, rangos invertidos
    bloqueados, moneda/búsqueda/revisión/orden/paginación en URL. Filtros plegables
    en móvil; etiquetas Desde/Hasta y calendarios legibles en oscuro.
  - Gráficos con leyenda, centavos conservados, márgenes negativos permitidos y
    nombres completos de cliente; agrupación por ID de cliente. El ranking
    muestra ocho clientes y se identifica como tal. Meses sin datos no se
    reconstruyen ni se presentan como ventas cero.
  - CSV de todo el detalle filtrado, independiente de la página visible: moneda,
    importes a dos decimales, nombres completos, estado de validación y cobertura.
    BOM UTF-8 y neutralización de fórmulas; campos vacíos distinguen falta de
    base de un monto cero. Tabla paginada 25/50/100 con desplazamiento propio.
- Validaciones:
  - `npm.cmd test`: 55/55, incluidas diez regresiones del dashboard financiero.
    Monedas, cobertura parcial/costo cero, importes inválidos, eliminados,
    margen ponderado, CSV, URL/orden, lectura completa, errores y permiso denegado.
  - ESLint dirigido: sin errores ni avisos tras corregir el inicio de la carga.
  - Chrome local con 1,302 cotizaciones simuladas y respuestas limitadas a 100:
    1,300 registros USD, venta USD 130,715.00 y CSV de 1,300 filas con centavos y
    nombres completos. Separación de HNL y registros sin moneda; paginación,
    búsqueda del último registro, enlace de pérdida a su validación y URL al
    recargar. Error en página posterior de Pricing/proveedor bloquea resultados
    y CSV; reintento recupera. Permiso denegado se muestra sin falsas pérdidas.
  - Navegador 1440/768/390/320 px sin desbordamiento de documento/main;
    filtros móviles, etiquetas de fecha, rango inválido y oscuro comprobados.
    Sin excepciones en la ejecución final. Solo fixtures; Supabase bloqueado.
  - Harness temporal retirado; caché dev retirada con ruta absoluta verificada.
    Evidencias locales ignoradas en `.ua/intermediate/financial-adjusted-*.png`.
  - `npx.cmd tsc --noEmit`: OK después de retirar el harness y la caché dev.
  - `npm.cmd run build`: OK, 72/72 páginas; la ruta de revisión no está incluida.
  - ESLint final y `git diff --check`: OK.
- Riesgos y pendientes:
  - La función de lectura versionada no incluye Finanzas, aunque la página sí.
    No se comprobó la definición desplegada con una sesión real. La interfaz
    respeta la respuesta del servidor y muestra la limitación. Revisar el rol,
    la visibilidad de Pricing y RLS en UAT antes de cerrar este hallazgo.
  - Conciliar importes contra datos reales y validar navegación completa por rol,
    Excel y volúmenes grandes. Las lecturas paginadas no son un snapshot
    transaccional; actualizar tras cambios concurrentes. La muestra consultada
    de permiso usa la política actual, uniforme para cotizaciones ganadas visibles;
    revisar esa comprobación si se introduce autorización por cotización.
  - No es facturación, caja ni utilidad contable definitiva. No se convierten
    monedas, no se reconstruyen costos históricos y no se recalculan documentos.
- Publicación (14/09/2026): implementación `e800cc7` publicada junto con el portal.
  GitHub Production `6447587170` y Vercel `FYn7fkF1fdr6ojnF18WViVcqESgi`
  confirman `success`. `/financial-dashboard` en `https://forwarders.app`
  devuelve 307 a `/login?next=%2Ffinancial-dashboard` sin sesión.
  Se mantienen pendientes la conciliación y el UAT/RLS con cuentas reales.
- Commit de implementación: `e800cc7`. Registro de publicación en commit documental posterior.

### 2026-09-14 - UX-PORTAL-20260914 - Navegación y autoservicio del cliente

- Estado: publicado en producción y validado localmente con fixtures; UAT autenticado pendiente.
- Hallazgos de origen: UX-PORTAL-01 a UX-PORTAL-12 en
  `docs/portal-ux-review-2026-09-14.md`. UX-PORTAL-06 se atiende con acceso a
  soporte tras entrega; la elegibilidad de reclamaciones queda pendiente de
  definición operativa, sin modificar transiciones.
- Archivos:
  - Las 22 páginas existentes de `src/app/portal/**/page.tsx`, su `layout.tsx`
    y la nueva `src/app/portal/solicitudes/page.tsx`.
  - `src/components/portal/PortalUI.tsx`, `PortalFeedback.tsx`,
    `PortalConfirmation.tsx`, `PortalPrintButton.tsx`.
  - `src/lib/portal.ts`, `src/hooks/useClientNotifications.ts`,
    `src/components/legal/LogisticsTerms.tsx`, `src/app/globals.css`.
  - `tests/portal-ux.test.mjs`, documento de análisis y
    `docs/uat/portal-ux-2026-09-14.md`.
- SQL: ninguno. No se modifican políticas RLS, estados comerciales,
  condiciones legales ni cálculos de facturación.
- Cambios:
  - Cinco destinos móviles y Solicitudes; regreso predecible, acceso a ayuda,
    cuenta sin herramientas deshabilitadas y carga explícita de sesión/vinculación.
  - Búsqueda de paquetes sobre el conjunto autorizado, filtros y paginación
    en servidor, URL persistente y descarte de consultas obsoletas. Prealertas
    con búsqueda/páginas; avisos con historial paginado y filtro sin leer.
  - Errores de consultas separados de listas vacías. Los avisos y el
    portapapeles solo confirman éxito tras completar su operación.
  - Transporte y asignación diferenciados; factura vigente con corrección
    visible; historial plegable y detalle móvil sin desbordamiento. Inicio
    enlaza indicadores/paquetes y muestra correcciones de paquetes recientes.
  - Historial de envíos finalizados/cancelados, fechas estimadas visibles,
    plazos convertidos a la zona indicada y contacto para documentos pendientes.
  - Confirmaciones persistentes, etiquetas accesibles, contraseñas consistentes,
    dirección copiable por campo y conversión física de unidades en calculadora.
  - Ayuda y búsqueda de materiales, retiro de métricas/promesas no verificadas
    de Nosotros e impresión de términos conservando versiones y registro JSON.
- Validaciones ejecutadas:
  - `npm.cmd test`: 59/59 OK; incluye cuatro regresiones de portal sobre estados,
    escape de tracking, zonas horarias de verano/invierno y cambio de unidades.
  - ESLint de las rutas, componentes, hook y helper afectados: sin errores ni avisos.
  - Chrome local: 23 pantallas a 1280/390/320 px, sin desbordamiento de documento
    ni campos/botones sin nombre en las pantallas examinadas. Comprobación
    adicional oscura en Inicio, Paquetes, detalle de Envío y Solicitudes.
  - 18 comprobaciones de interacción con respuestas simuladas: búsqueda del
    paquete 25, página 2, error/reintento, unidades, historial, zona horaria,
    fallo/éxito de avisos, portapapeles denegado y confirmaciones de prealerta,
    incidencia, recogida y acceso pendiente. Sin excepciones durante los recorridos.
  - Harness temporal retirado. Caché dev eliminada tras verificar ruta absoluta
    dentro del workspace. Evidencias locales ignoradas en `.ua/intermediate/`.
  - `npm.cmd run build`: OK, 73/73 páginas; incluye Solicitudes y excluye el harness.
  - `npx.cmd tsc --noEmit`: OK después de retirar el harness y del último ajuste.
  - `git diff --check`: OK con la configuración de finales de línea del repositorio.
- Riesgos / acciones pendientes:
  - Validar cuentas reales y aislamiento RLS, carga de facturas privadas, enlaces
    firmados, correos y recuperación de contraseña. Mocks no certifican estos flujos.
  - Verificar la consulta de documentos anidados de Inicio contra esquema/RLS
    desplegados. Las correcciones del Inicio abarcan los tres paquetes recientes;
    no se presentan como inventario completo de tareas del cliente.
  - Elegibilidad después de entrega, edición/cancelación de solicitudes,
    adjuntos de incidencias y publicación de documentos requieren definición
    operativa y permisos antes de ampliar el flujo.
  - Incidencia y estado de paquete siguen siendo escrituras separadas: ante
    fallo de la segunda se conserva la confirmación del caso y se informa del
    pendiente, evitando duplicarlo. Atomicidad futura requiere migración propia.
  - Incidencias, recogidas y RPC de envíos conservan su alcance de lectura actual;
    revisar límites con volúmenes altos. Validar horarios y contenido operativo.
  - Guion de aceptación completo: `docs/uat/portal-ux-2026-09-14.md`.
- Publicación (14/09/2026):
  - Commit y despliegue autorizados por el usuario, incluyendo Dashboard Financiero.
    Implementación `e800cc7` publicada en `main`; GitHub y Vercel confirman Production `success`.
  - Deployment GitHub `6447587170`, Vercel `FYn7fkF1fdr6ojnF18WViVcqESgi`.
    URL: `https://sarierp-ak8s6oypw-claudherhn-5641s-projects.vercel.app`.
  - Verificación pública en `https://forwarders.app`: `/portal/login` y
    `/portal/register` devuelven 200; `/portal/solicitudes` devuelve 307 a
    `/portal/login?next=%2Fportal%2Fsolicitudes`. `/api/portal-review/inicio`
    y `/api/financial-review` devuelven 404. Solo GET, sin mutaciones de datos.
  - Suite conjunta antes del commit: 59/59 pruebas, TypeScript, ESLint dirigido
    y build de 73/73 páginas correctos. La publicación no certifica UAT autenticado
    ni RLS; se conservan los pendientes anteriores.
- Commit de implementación: `e800cc7`. Registro de publicación en commit documental posterior.

### 2026-09-14 — INT-20260914 — Hallazgos de pruebas integrales

- Estado: SQL y frontend publicados y verificados el 16/09/2026.
  Regresiones locales realizadas; UAT autenticado pendiente. No cerrar los hallazgos aún.
- IDs: INT-01 shipment Miami; INT-02 fecha CAI; INT-03 Garantías;
  INT-04 guardado/envío a Pricing; INT-05 apertura/foco de formularios;
  INT-06 contacto; INT-07 carga Miami sin tarifas; INT-08 garantías multimoneda.
- Archivos:
  - `src/app/(protected)/settings/cai/page.tsx`, `src/lib/cai-validation.ts`.
  - `src/app/(protected)/operations/garantias/page.tsx`, `src/lib/guarantees.ts`.
  - `src/app/(protected)/quotations/[id]/edit/page.tsx`,
    `src/app/(protected)/quotations/new/page.tsx`,
    `src/components/quotations/MiamiQuotationSection.tsx`.
  - `tests/integral-findings.test.mjs`, `supabase/tests/integral_ux_flow_fixes.sql`.
  - `docs/uat/integral-findings-2026-09-14.md`, `docs/uat/integral-cai-audit.sql`.
- SQL: nueva `supabase/migrations/20260914233000_integral_ux_flow_fixes.sql`.
  Probada en transacción local con rollback; aplicada en producción el 16/09/2026.
- Cambios:
  - `save_quotation_edit`, SECURITY INVOKER y política UPDATE existente: whitelist de
    campos, bloqueo de fila y estado esperado, cabecera/hijos/pricing/historial y
    envío en una transacción. Reutiliza `replace_quotation_child_lines`.
    Los dos botones usan el mismo guardado, con exclusión de envíos simultáneos;
    la UI conserva los campos ante error y distingue fallos de avisos posteriores.
    Se retiran bloques legacy inactivos de delete/insert en el editor.
  - No exige agente únicamente para Miami LCL/Aéreo. Conserva autorización,
    idempotencia, SI/shipment atómicos y datos del agente cuando existe.
    Ningún rol crea un shipment nuevo desde cotización no ganada.
  - CAI valida formato calendario/año y orden de rango; triggers bloquean fechas
    no finitas o fuera de años 0001–9999 y emisión desde un CAI histórico corrupto.
    Permite desactivar un rango inválido para su revisión. No deduce fechas correctas
    ni modifica datos fiscales existentes. UI señala fechas anómalas.
  - Garantías obtiene routing desde la FK explícita a Shipping Instructions, evita
    ambigüedad por booking primario, recorre páginas y separa error de lista vacía.
    Recuperación comprueba fila devuelta y estado previo; lectura/escritura conserva
    roles Admin/Operaciones y cuenta aprobada/activa. Totales por moneda.
  - CAI/Garantías abren y enfocan en lugar de alternar cierre. Calendarios legibles
    en oscuro; carga Miami visible sin tarifas, precios condicionados a disponibilidad.
    Creación y edición autocompletan `clientes.contacto`.
- Validaciones:
  - Node: 62/62 pruebas correctas; tres regresiones nuevas de fecha/rango CAI y monedas.
  - SQL local: migración compila y pasan assertions de persistencia, rollback de
    cabecera/carga/pricing, estado obsoleto, campos no editables, Miami/idempotencia,
    FCL con/sin agente, rechazo de cotización no ganada y rol Cliente, fechas CAI,
    emisión rechazada sin consumir correlativo y RLS de Garantías por rol.
  - REST local: ambas consultas de Garantías responden HTTP 200 con FK explícita.
  - Chrome con respuestas simuladas: 22 comprobaciones correctas, sin excepciones
    durante interacciones; año extendido no se envía, fecha válida exacta, foco y
    apertura repetida, registro con booking, error/reintento, moneda, carga Miami,
    payload completo al enviar, retención ante fallo y contacto en edición.
    CAI/Garantías a 1280/390/320 px sin desbordamiento y capturas oscuras revisadas.
  - Harness retirado y caché dev eliminada comprobando ruta absoluta del workspace.
    Evidencia ignorada en `.ua/intermediate/integral-*`. Los fixtures requieren
    sesión simulada; no certifican hidratación ni autenticación en producción.
  - ESLint de CAI, Garantías y helpers sin infracciones. Cotizaciones nueva/edición
    y componente Miami conservan 30 errores y 12 avisos preexistentes, comprobados
    contra HEAD; no se desactivaron reglas ni añadieron infracciones.
  - `npm.cmd run build`: OK, 73/73 páginas; harness excluido.
    `npx.cmd tsc --noEmit` final y `git diff --check`: OK.
    La prueba SQL también confirma emisión válida y consumo de un solo correlativo.
- Riesgos / acciones pendientes:
  - SQL aplicado antes del frontend y auditoría CAI realizada (resultado abajo).
    Para conciliar el hallazgo original, identificar su registro/ambiente y contrastar
    la fecha con el documento original; no truncar años ni inferir correcciones.
  - Verificar perfiles/RLS desplegados, persistencia al recargar y avisos reales.
    La política de edición existente puede restringir Operaciones aunque la UI del
    editor muestre ese rol; esta RPC no amplía permisos por el mero control visual.
  - El historial local de migraciones difiere del esquema: `mbl_quantity` ya existe
    sin registrar su migración. El push local se detuvo ahí; aceptación legal previa
    sí se aplicó localmente. Nueva migración probada transaccionalmente, sin reparar
    historial por inferencia ni ejecutar SQL remoto.
- Publicación SQL (16/09/2026):
  - Commit y despliegue autorizados por el usuario. Host de Supabase verificado
    contra los assets públicos de `forwarders.app`: proyecto `fwspgdzvlbtbgiupvrzo`.
  - Dry run: solo `20260914233000_integral_ux_flow_fixes.sql` pendiente.
    Copia del esquema anterior guardada localmente e ignorada. La definición
    anterior de `create_shipment_from_quotation` coincide con la fuente versionada.
  - `supabase db push --yes`: correcto. Registro remoto de migración confirmado,
    cuatro cuerpos de función coincidentes por MD5 con el SQL local y ambos
    triggers activos. `save_quotation_edit` conserva SECURITY INVOKER;
    ejecución denegada a `anon` y concedida a `authenticated`.
  - Auditoría remota de solo lectura como `postgres`, sin filtrado RLS:
    0 rangos CAI y 0 documentos con fecha CAI no representable. No había fechas
    que corregir en esta base. La fecha reportada por las pruebas anteriores
    requiere identificar su registro/ambiente para contrastarla con el original.
  - No se emitieron facturas ni se crearon registros de prueba en producción.
- Publicación frontend (16/09/2026):
  - Implementación `7b4eff5` publicada en `main`; Vercel y GitHub Production
    confirman `success`. Deployment GitHub `6484076735`, Vercel
    `A3WabPMXwFi1qRThLXht3Meycdea`.
  - URL: `https://sarierp-pnjen3c88-claudherhn-5641s-projects.vercel.app`.
  - En `https://forwarders.app`, `/login` y `/portal/login` responden 200;
    `/settings/cai`, `/operations/garantias` y `/quotations/new` responden 307
    al login conservando destino. `/api/integral-review/demo` responde 404.
    Comprobaciones GET sin sesión ni mutaciones de datos.
  - Estas verificaciones no cierran el UAT autenticado descrito en el guion.
- Commit de implementación: `7b4eff5`. Registro de publicación en commit documental posterior.

### 2026-09-18 - OPS-P0-01 - Restauración de Dashboard y bandeja de bookings

- Estado: implementado, validado y desplegado; UAT autenticado pendiente.
- Fase: 0 - restaurar verdad operacional, sin modificar reglas de negocio,
  estados, ownership ni diseño de Control Tower.
- Hallazgos: O-01, O-02 y D-01 de la auditoría transversal del 18/09/2026.
- Causa raíz:
  - `bookings` y `shipping_instructions` tienen dos relaciones válidas desde
    la introducción de `shipping_instructions.primary_booking_id`.
  - Dashboard Operativo y `/operations/bookings` embebían
    `shipping_instructions` sin especificar la FK. PostgREST respondía
    `PGRST201` y ambas pantallas descartaban el error como si no hubiera filas.
- Código:
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `tests/operations-dashboard-query.test.mjs`
- SQL: ninguno. No se modificaron migraciones, RLS ni datos productivos.
- Cambios:
  - Ambas consultas usan la relación canónica explícita
    `shipping_instructions!bookings_shipping_instruction_id_fkey`.
  - Los errores de bookings, contenedores cotizados o readiness dejan de
    convertirse en métricas cero y muestran un estado persistente con detalle
    y acción `Reintentar`.
  - Dashboard y bandeja incluyen `Actualizar`; la bandeja distingue entre
    cero bookings activos y cero resultados por filtros.
  - Se agregó una regresión de fuente que impide reintroducir el embed ambiguo
    y comprueba los estados de error/vacío.
- Validaciones ejecutadas:
  - Producción, solo lectura: la consulta original reprodujo `PGRST201`; la
    misma consulta con la FK canónica respondió correctamente con 9 bookings
    activos. No se realizaron escrituras.
  - `npm.cmd test`: 96/96 pruebas correctas, incluidas 2 regresiones nuevas.
  - ESLint dirigido sobre las dos rutas y la prueba: sin errores ni avisos.
  - `npm.cmd run build`: OK, 73/73 páginas; incluye ambas rutas operativas.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; solo avisos de conversión LF/CRLF.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT con una cuenta Admin y una de Operaciones para confirmar RLS,
    carga de readiness, enlaces de detalle, refresh y recuperación ante error.
  - La corrección restaura los datos existentes; no corrige todavía reglas de
    prioridad, documentos por modalidad, ETAs vencidas ni asignación. Esos
    cambios pertenecen a las fases siguientes del plan aprobado.
- Commit de implementación y despliegue: `c93548c`.

### 2026-09-18 - OPS-P1-01 - Unificación de reglas operativas

- Estado: implementado, validado y desplegado; migraciones productivas aplicadas
  y UAT autenticado pendiente.
- Fase: 1 - unificar estado derivado, riesgo, siguiente acción, readiness,
  documentación por modalidad y visibilidad de ownership.
- Hallazgos: O-03 y H-01 de la auditoría transversal del 18/09/2026.
- Causa raíz:
  - Dashboard, bandeja de bookings y alertas duplicaban reglas de estado, ETA y
    documentos; algunas contradecían readiness y Documentation Workspace.
  - La lista fija exigía Booking Confirmation, MBL, HBL, Packing List y
    Commercial Invoice a todas las modalidades.
  - Una ETA vencida desaparecía de “próximos 7 días”, y un booking podía seguir
    visualmente como solicitado aun teniendo ambas referencias confirmadas.
  - `booking_operational_mode` evaluaba textos compartidos antes del
    `quote_type`; `usa_ltl_ftl` impedía distinguir confiablemente LTL de FTL.
- Código:
  - `src/lib/booking-operational-state.ts`
  - `src/lib/documentation-workspace.ts`
  - `src/lib/alerts.ts`
  - `src/components/operations/DocumentationWorkspace.tsx`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/operations/bookings/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `tests/booking-operational-state.test.mjs`
  - `tests/documentation-workspace.test.mjs`
  - `tests/operations-dashboard-query.test.mjs`
- SQL:
  - `supabase/migrations/20260918170000_booking_operational_mode_priority.sql`
  - `supabase/migrations/20260918171000_booking_operational_mode_explicit_quote_type.sql`
  - `supabase/tests/booking_cutoffs_and_readiness.sql`
- Cambios:
  - Se creó una derivación pura y reutilizable para estado visible, drift,
    severidad, ETA, ownership, documentos y siguiente acción.
  - Los estados persistidos no se modifican automáticamente: cualquier
    incompatibilidad con referencias o fechas reales se presenta como “por
    conciliar”, conservando el valor almacenado para auditoría.
  - Dashboard muestra ETAs vencidas, operaciones sin asignar y estados por
    conciliar; la bandeja añade filtro de asignación y siguiente acción.
  - Readiness alimenta las mismas decisiones en Dashboard, bandeja y detalle.
  - MBL/HBL dejan de bloquear modalidades terrestres; `requires_hbl = false`
    evita exigir HBL en operaciones marítimas configuradas de esa forma.
  - Alertas reutiliza los requisitos documentales por modalidad y ahora genera
    una alerta explícita para ETA vencida sin arribo.
  - La clasificación SQL prioriza `quote_type` explícito y mantiene textos de
    transporte/servicio únicamente como fallback.
- Validaciones ejecutadas:
  - Producción, solo lectura: la consulta ampliada recuperó 9 bookings activos;
    los 9 están sin asignar, los 9 tienen readiness bloqueado, 4 tienen ETA
    vencida sin arribo y 2 tienen referencias completas con estado solicitado.
    `evaluate_booking_readiness` respondió para los 9. No hubo escrituras.
  - Base local: ambas migraciones aplicadas; prueba SQL transaccional ejecutada
    directamente con `psql -v ON_ERROR_STOP=1`: `BEGIN`,
    `booking_cutoffs_and_readiness: OK`, `ROLLBACK`.
  - `npm.cmd test`: 105/105 pruebas correctas.
  - ESLint dirigido sobre helpers, componentes, rutas y pruebas: sin errores ni
    avisos.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; solo avisos de conversión LF/CRLF.
- Producción:
  - Migraciones `20260918170000` y `20260918171000` aplicadas el 18/09/2026
    al proyecto enlazado `fwspgdzvlbtbgiupvrzo`.
  - `supabase migration list --linked`: historial local/remoto alineado.
  - Dump remoto posterior: `booking_operational_mode` prioriza `quote_type`
    explícito para FTL, LTL, LCL y FCL antes de usar el contexto como fallback.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT autenticado con Admin y Operaciones para verificar RLS del RPC
    `get_booking_readiness_overview`, navegación de acciones, filtros y estados
    derivados. Service role no reproduce el contexto de `auth.uid()` requerido
    por `can_select_booking`.
  - Revisar manualmente los 2 drifts de confirmación y asignar responsables a
    los 9 expedientes; esta fase no altera datos productivos automáticamente.
  - La cola única de Control Tower, aging y persistencia de filtros pertenecen
    a la Fase 2 y no se implementaron aquí.
- Commit de implementación y despliegue: `c93548c`.

### 2026-09-18 - P2-CTRL-01 - Control Tower Operativo y Mi día comercial

- Estado: implementado, validado y desplegado; UAT autenticado pendiente.
- Fase: 2 - priorización diaria y trazabilidad de trabajo. No incluye handoff
  formal de ownership, cierre operativo/facturación ni Agent 360, reservados
  para fases posteriores.
- Hallazgos: cola operativa fragmentada, aging no visible, dashboard comercial
  limitado a actividades históricas y pérdida de filtros al abrir un detalle.
- Código:
  - `src/lib/operations-control-tower.ts`
  - `src/lib/operations-navigation.ts`
  - `src/lib/sales-work-queue.ts`
  - `src/lib/quotation-detail-ux.ts`
  - `src/app/(protected)/operations/dashboard/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/ventas/page.tsx`
  - `tests/operations-control-tower.test.mjs`
  - `tests/operations-navigation.test.mjs`
  - `tests/sales-work-queue.test.mjs`
  - `tests/quotation-navigation.test.mjs`
- SQL: ninguno. Esta fase consume `operational_events`,
  `quotation_status_history` y los RPC vigentes de readiness sin modificar
  esquema, RLS ni datos.
- Cambios:
  - El Dashboard Operativo abre con una Control Tower única, filtros por
    atención, asignación, salidas, arribos, documentos, excepciones y cierres
    recientes, además de búsqueda por booking, RT, cliente o carrier.
  - La cola reutiliza `get_booking_readiness_alerts`; combina cut-offs,
    readiness, ETA, free days, ownership, drift y documentos con una sola
    severidad y siguiente acción. Los paneles especializados se conservan como
    vistas secundarias.
  - El aging operativo parte del último `operational_event` del booking y usa
    `bookings.updated_at`/`created_at` solo como fallback. Los tres primeros
    elementos se presentan como “Siguientes 3 acciones”.
  - `/ventas` pasa a encabezar con “Mi día”: seguimiento vencido o de hoy,
    vigencia de propuesta, cotización enviada sin respuesta, cotización ganada
    sin shipment y lead sin primera gestión. Agenda y calendario permanecen
    debajo como historial.
  - El aging comercial de cotizaciones parte del último cambio al estado actual
    en `quotation_status_history`; no se calcula desde la creación salvo que no
    exista historial. Para no duplicar pendientes, solo se proyecta la próxima
    acción de la actividad más reciente por cuenta/prospecto.
  - Los filtros de ambas colas se serializan en la URL. Los detalles validan un
    `returnTo` interno y permiten volver al Control Tower o a Mi día sin perder
    búsqueda/filtro; URLs externas o rutas ajenas se descartan.
- Validaciones ejecutadas:
  - `npm.cmd test`: 114/114 pruebas correctas; 9 regresiones nuevas para
    prioridad, aging desde eventos/historial, deduplicación de seguimientos,
    leads gestionados y navegación segura.
  - ESLint dirigido sobre Control Tower, Mi día, detalle de booking y helpers:
    sin errores ni avisos. El detalle legacy de Shipping Instruction también
    se comprobó con sus cuatro reglas preexistentes deshabilitadas de forma
    dirigida; no se añadieron nuevas excepciones al repositorio.
  - `npm.cmd run build`: OK, 73/73 páginas, incluidas `/operations/dashboard`
    y `/ventas`.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; solo avisos de conversión LF/CRLF.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT autenticado con Ventas, Operaciones y Admin para confirmar RLS,
    volumen real, orden de las tres primeras acciones, anclas y retorno de
    filtros. La validación local no sustituye esa prueba de aceptación.
  - `sales_activities` no tiene estado de ejecución. La cola considera resuelto
    un seguimiento anterior cuando existe una actividad más reciente para la
    misma cuenta/prospecto; una fase futura podría introducir tareas explícitas
    si el negocio necesita conservar varios pendientes simultáneos.
  - Los leads tampoco tienen relación formal con actividades. “Sin gestión” se
    infiere por coincidencia normalizada de empresa o contacto; revisar falsos
    positivos/negativos durante UAT antes de endurecer el modelo.
  - Las dos migraciones de modalidad de la Fase 1 fueron aplicadas en
    Production el 18/09/2026; su UAT autenticado continúa pendiente.
- Commit de implementación y despliegue: `c93548c`.

### 2026-09-18 - FLOW-P3-01 - Handoffs formales y cola Por facturar

- Estado: implementado, validado y desplegado; migración productiva aplicada y UAT autenticado pendiente.
- Fase: 3 - aceptación Ventas → Operaciones, cierre operativo verificable y handoff Operaciones → Finanzas. No incluye Agent 360.
- Hallazgos: ownership operativo implícito, validación de costos antes del cierre real y ausencia de una bandeja derivada por facturar.
- Código:
  - `src/lib/billing-readiness.ts`
  - `src/lib/cost-validation-data.ts`
  - `src/lib/operations-navigation.ts`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/cost-validation/[id]/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
  - `src/app/(protected)/invoicing/new/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `tests/billing-readiness.test.mjs`
  - `tests/operations-navigation.test.mjs`
- SQL:
  - `supabase/migrations/20260918180000_phase3_handoffs_billing_readiness.sql`
  - `supabase/tests/phase3_handoffs_billing_readiness.sql`
  - `supabase/tests/shipping_instruction_workflow_hardening.sql`
- Cambios:
  - La entrega de Ventas queda aceptada explícitamente por el usuario de Operaciones responsable, con actor y fecha. Si no había asignación, el operativo que acepta asume ownership; una reasignación reinicia la aceptación.
  - `validate_shipping_instruction` exige una aceptación vigente y coherente con el asignado. Admin puede asignar, pero solo el operativo responsable acepta el expediente.
  - El cierre reutiliza exclusivamente `finalize_shipping_instruction_canonical`; `shipments.closed_at` y `Finalizado` siguen siendo los hechos canónicos.
  - Finanzas valida mediante `validate_quotation_financial_costs`, evitando que RLS convierta el cierre en un `UPDATE` de cero filas y dejando auditoría. El servidor exige operación cerrada, todos los cargos con costos vinculados, moneda coherente e importes válidos.
  - No se puede crear una Factura vinculada hasta que exista al menos un shipment activo y todos los activos estén cerrados canónicamente.
  - `/invoicing` abre con `Por facturar`: clasifica operación pendiente, costos pendientes, RTN faltante, Pricing inválido y listo para facturar, con bloqueo y siguiente acción.
  - Cola, Validación de Costos, creación y detalle de factura conservan un `returnTo` interno validado; retornos externos se descartan.
- Validaciones ejecutadas:
  - Base local: migración aplicada de forma idempotente.
  - SQL transaccional con `psql -v ON_ERROR_STOP=1`: `phase3_handoffs_billing_readiness: OK` y `shipping_instruction_workflow_hardening.sql: OK`; ambos con `ROLLBACK`.
  - `npm.cmd test`: 117/117 pruebas correctas.
  - ESLint dirigido: sin errores ni avisos.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; solo avisos LF/CRLF.
- Producción:
  - Migración `20260918180000` aplicada el 18/09/2026 al proyecto enlazado
    `fwspgdzvlbtbgiupvrzo`.
  - `supabase migration list --linked`: historial local/remoto alineado.
  - Dump remoto posterior: presentes `operations_accepted_at`,
    `operations_accepted_by`, el constraint de aceptación, los RPC de handoff,
    cierre/validación/cola y el trigger que protege Facturación.
  - Respaldo previo del esquema público guardado fuera del repositorio con
    SHA-256 `0970CDF66C49F047D968C2842299F5E1BB4771C114C6A661B50EEB61F1AE0689`.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT con Ventas, dos usuarios de Operaciones, Admin y Finanzas: envío, aceptación, reasignación, validación, cierre multishipment, costos, RTN, factura y retornos.
  - No se inventó aceptación histórica: expedientes existentes aún previos a Booking deberán ser aceptados por su responsable.
  - Cotizaciones históricas ya `Validado` no se reescriben; cola y guarda de Factura igualmente bloquean si la operación no cerró.
- Commit de implementación y despliegue: `c93548c`.

### 2026-09-18 - AGT-P4-01 - Agent 360 basado en relaciones canónicas

- Estado: implementado, validado y desplegado; migración productiva aplicada y
  UAT autenticado pendiente.
- Fase: 4 - consulta contextual de agentes. No introduce scoring, documentos de
  agentes, actividad transversal ni modelos nuevos.
- Hallazgos: `/agents` funcionaba como catálogo editable sin mostrar uso real;
  Ventas y Operaciones podían leer `agents` por RLS, pero la navegación les
  bloqueaba el módulo y `agent_route_rates` solo permitía lectura a Admin/Pricing.
- Código:
  - `src/lib/agent-360.ts`
  - `src/components/agents/Agent360Panel.tsx`
  - `src/app/(protected)/agents/page.tsx`
  - `src/app/(protected)/agents/[id]/page.tsx`
  - `src/lib/permissions.ts`
  - `tests/agent-360.test.mjs`
  - `tests/quotation-navigation.test.mjs`
- SQL:
  - `supabase/migrations/20260918190000_agent_360_read_access.sql`
  - `supabase/tests/phase4_agent_360_access.sql`
- Cambios:
  - El perfil consolida ofertas, selecciones, cotizaciones ganadas, shipments,
    bookings visibles, última actividad y lanes utilizados a partir de
    `agents → agent_quotes → quotations → shipments → bookings`.
  - Un shipment solo se atribuye al agente cuando existe una tarifa activa con
    `is_selected = true`; no se relacionan operaciones por nombres legacy.
  - Activos/cerrados reutilizan el hecho canónico `shipments.closed_at`; los
    conteos no inventan performance ni mezclan costo cotizado con costo real.
  - Cotizaciones y expedientes conservan enlaces permitidos por rol. Pricing
    abre el comparativo; Operaciones/Ventas abren únicamente rutas autorizadas.
  - La contraparte de Proveedores permanece separada y solo se consulta cuando
    el rol ya tiene permiso financiero; los demás roles reciben una explicación.
  - Ventas y Operaciones obtienen acceso de consulta a `/agents` y lanes. Crear,
    editar o eliminar agentes/tarifas queda oculto y sigue protegido por RLS
    para Admin/Pricing.
- Validaciones ejecutadas:
  - Migración aplicada en Supabase local.
  - SQL directo con `psql -v ON_ERROR_STOP=1`: Ventas/Operaciones leen lanes y
    no pueden modificarlas; Pricing conserva escritura; Finanzas ve cero filas;
    prueba finalizada con `ROLLBACK` y `phase4_agent_360_access.sql: OK`.
  - `npm.cmd test`: 119/119 pruebas correctas.
  - ESLint dirigido sobre rutas, panel, helpers y pruebas: sin errores ni avisos.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd tsc --noEmit`: OK.
  - `git diff --check`: OK; solo avisos LF/CRLF.
  - Preflight Production: historial remoto alineado hasta `20260918180000` y
    dry-run limitado exclusivamente a `20260918190000_agent_360_read_access.sql`.
  - Respaldo previo del esquema `public` guardado fuera del repositorio en
    `sarierp-prod-pre-phase4-20260918.sql` (852,992 bytes), SHA-256
    `75386573E6166E10E22C00D41E1913A94F62CDA177F8798ADBA86FA1C3899A5D`.
  - Migración aplicada en Production al proyecto vinculado
    `fwspgdzvlbtbgiupvrzo`; historial local/remoto alineado en
    `20260918190000` y postflight `db push --dry-run`: base remota al día.
  - Snapshot posterior `sarierp-prod-post-phase4-20260918.sql` (853,076 bytes),
    SHA-256 `4CD502B528F31A8574BEA3CC3B2272C1E2632955B871B4F5A7098B3252125152`;
    confirma `agent_route_rates_select_policy` para Admin, Pricing,
    Operaciones y Ventas, condicionado a usuario activo/aprobado.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT con Admin, Pricing, Operaciones y Ventas: visibilidad por rol,
    ofertas versus seleccionadas, expedientes 0/1/N, lanes, enlaces y edición.
  - Los registros históricos que solo guardan `agent_name`/`agente_nombre` sin
    `agent_id` no se atribuyen automáticamente; conciliarlos requiere evidencia
    y no forma parte de esta fase.
  - Los totales son relativos a lo que RLS permite ver al usuario autenticado;
    una suite local no certifica el volumen ni los datos de Production.
  - La comprobación pública no sustituye el UAT autenticado de datos y permisos.
- Publicación frontend:
  - Commit `c93548c` publicado en `origin/main` el 18/09/2026.
  - Vercel Production `dpl_5hTtAkXSfTVQFaQMJAS8xBNHdsYJ`, estado `Ready`;
    URL inmutable `https://sarierp-k08pbshr4-claudherhn-5641s-projects.vercel.app`.
  - Alias confirmados: `https://forwarders.app`, `https://sarierp.vercel.app` y
    rama `main`.
  - Smoke público posterior: `/` y `/login` respondieron HTTP 200 desde Vercel;
    comprobaciones GET sin sesión y sin escrituras.
- Commit de implementación y despliegue: `c93548c`. Registro de publicación en
  commit documental posterior.

### 2026-09-18 - TASK-P5-01 - Tareas contextuales sin duplicar fuentes de verdad

- Estado: implementado, validado y desplegado; migración productiva aplicada y
  UAT autenticado pendiente.
- Fase: 5 - arquitectura transversal de recordatorios manuales y next actions.
  No copia a `user_tasks` los estados derivados de Control Tower, readiness o
  facturación, ni reemplaza `sales_activities`/`operational_events` como historia.
- Evidencia de Production, solo lectura y sin exponer contenido:
  - `user_tasks`: 1 registro, ya completado, con prioridad media y vencimiento;
    la migración conserva sus campos y completa `completed_at`.
  - `sales_activities`: 0 registros; no existe historia comercial que migrar o
    reconciliar en este ambiente.
  - `operational_events`: 51 registros; continúan como hechos operativos y no se
    convierten en tareas manualmente completables.
- Código:
  - `src/lib/user-tasks.ts`
  - `src/components/tasks/CreateContextTaskDialog.tsx`
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/agents/[id]/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `tests/user-tasks.test.mjs`
- SQL:
  - `supabase/migrations/20260918200000_phase5_contextual_user_tasks.sql`
  - `supabase/tests/phase5_contextual_user_tasks.sql`
- Cambios:
  - Se extendió la tabla existente `user_tasks`; no se creó una tabla paralela.
    El contexto opcional admite cliente, lead, actividad comercial, cotización,
    Shipping Instruction, booking, BL, agente o factura.
  - Las tareas guardan módulo, etiqueta y ruta interna. Frontend y constraint SQL
    rechazan destinos externos; el enlace se vuelve a validar según entidad.
  - `can_access_user_task_context` reutiliza las funciones canónicas de acceso a
    clientes, cotizaciones, SI, bookings, BL y facturas. Agentes, leads y
    actividades exigen rol y usuario activo/aprobado.
  - RLS mantiene cada tarea privada para su propietario. No existe política de
    `DELETE`; `soft_delete_user_task` valida sesión/propiedad y deja auditoría.
  - El trigger de lifecycle mantiene `updated_at`, registra `completed_at` al
    completar y lo limpia al reabrir.
  - Cotización, SI, Agent 360 y factura permiten crear un recordatorio contextual.
    “Mis tareas” muestra notas, módulo y retorno seguro al expediente.
  - Las colas de Ventas, Operaciones y Facturación siguen derivándose de hechos;
    el modal aclara que un recordatorio no cambia estado ni resuelve bloqueos.
- Validaciones ejecutadas:
  - Migración aplicada idempotentemente en Supabase local.
  - SQL directo transaccional con `psql -v ON_ERROR_STOP=1`: creación contextual,
    aislamiento entre Ventas/Operaciones, lifecycle, bloqueo de borrado físico y
    borrado lógico; finalizó con `ROLLBACK` y
    `phase5_contextual_user_tasks.sql: OK`.
  - `npm.cmd test`: 121/121 pruebas correctas.
  - ESLint dirigido: helpers, componente, dashboard y detalles modificados sin
    errores. El detalle legacy de cotización conserva sus excepciones dirigidas
    preexistentes para `no-explicit-any`; no se añadieron `any` nuevos.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd tsc --noEmit`: OK.
  - Preflight Production: historial remoto alineado hasta `20260918190000` y
    dry-run limitado exclusivamente a
    `20260918200000_phase5_contextual_user_tasks.sql`.
  - Respaldo previo del esquema `public` guardado fuera del repositorio en
    `sarierp-prod-pre-phase5-tasks-20260918.sql` (853,076 bytes), SHA-256
    `4CD502B528F31A8574BEA3CC3B2272C1E2632955B871B4F5A7098B3252125152`.
  - Migración aplicada en Production al proyecto `fwspgdzvlbtbgiupvrzo`;
    historial local/remoto alineado en `20260918200000` y postflight dry-run:
    base remota al día.
  - Snapshot posterior `sarierp-prod-post-phase5-tasks-20260918.sql` (860,260
    bytes), SHA-256
    `3FA1746AB4C5DCDF38F848158BFF7195FE3D98E032F80C1B8D981095565258CF`;
    confirma columnas, constraints, índices, trigger, RLS y RPC de borrado.
  - Verificación agregada posterior: 1 tarea histórica, 1 completada, 1 con
    `completed_at` y `updated_at`; cero contextuales y cero borradas. No se
    imprimieron títulos, notas ni datos personales.
- Riesgos / trabajo pendiente:
  - Ejecutar UAT con Ventas, Operaciones, Pricing, Admin y Finanzas: crear desde
    cada contexto, completar, reabrir, borrar lógicamente y regresar al origen.
  - La fase no convierte automáticamente `proxima_accion` de Ventas en tarea:
    hoy Production no tiene `sales_activities`, y hacerlo sin transacción única
    introduciría dos fuentes de verdad. Evaluar sólo cuando exista uso real.
  - No hay asignación de tareas entre usuarios. `user_tasks.user_id` conserva el
    modelo privado existente; un workflow de delegación requiere reglas y UAT de
    ownership explícitos antes de ampliar RLS.
- Publicación frontend:
  - Commit `6637e82` publicado en `origin/main` el 18/09/2026.
  - Vercel Production `dpl_2bukdyTDSiDEBS6XXsTDJ9ipdC2R`, estado `Ready`;
    URL inmutable
    `https://sarierp-o2x9hibeo-claudherhn-5641s-projects.vercel.app`.
  - Smoke público posterior en `https://forwarders.app`: `/` y `/login`
    respondieron HTTP 200; `/dashboard` sin sesión respondió HTTP 307 hacia
    `/login?next=%2Fdashboard`, sin escrituras ni credenciales.
- Commit de implementación y despliegue: `6637e82`. Registro de publicación en
  commit documental posterior.

### 2026-09-21 - SAAS-P1-01 - Fundación aditiva multiempresa para Sari

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 0/1 del plan multiempresa. Registra a Sari como tenant inicial sin
  cambiar todavía el aislamiento RLS de los módulos de negocio.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- Código:
  - `src/types/index.ts`
- SQL:
  - `supabase/migrations/20260921120000_phase1_multitenant_foundation.sql`
  - `supabase/tests/phase1_multitenant_foundation.sql`
- Cambios:
  - Crea `tenants` y `tenant_domains`, con slugs/hostnames validados, un dominio
    primario por tenant y RLS de lectura limitada al tenant autenticado.
  - Registra de forma determinista a Sari y `sari.forwarders.app`.
  - Agrega `tenant_id` nullable a `profiles` y `company_settings`; el backfill
    asigna registros actuales a Sari y deja sin tenant a administradores
    exclusivos de plataforma.
  - Agrega `current_tenant_id()` e `is_current_tenant(uuid)`; ambos exigen un
    perfil activo y aprobado y no están disponibles para `anon`.
  - Un trigger impide que usuarios autenticados, incluidos Admin de tenant,
    asignen o cambien su propia empresa. La Fase 1 no cambia aún RLS de clientes,
    cotizaciones, pricing, operaciones ni finanzas.
- Validaciones ejecutadas:
  - Inventario estático: 88 tablas clasificadas; base local alineada hasta
    `20260918200000`, con 204 funciones `SECURITY DEFINER` y 394 policies en
    `public`/Storage antes de esta migración.
  - `npx.cmd supabase migration up --local`: migración aplicada; el historial
    local queda en `20260921120000`.
  - `phase1_multitenant_foundation.sql`: OK mediante `psql` en el contenedor
    local; prueba Sari/MYA, grants, RLS, perfil inactivo, Admin de tenant,
    administrador de plataforma y `anon`; finaliza con `ROLLBACK`.
  - Postflight local: 1 tenant, 1 dominio primario de Sari, 2 policies nuevas y
    3 helpers/guards de tenant presentes.
  - `npm.cmd test`: 121/121 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido a `src/types/index.ts`: OK.
  - `git diff --check`: OK; solo avisos LF/CRLF preexistentes del entorno.
  - `npx.cmd supabase db lint --local --level warning`: los objetos nuevos no
    reportan hallazgos; persiste un error previo en
    `can_access_user_task_context` porque referencia `leads.deleted_at`, columna
    ausente. No fue introducido ni corregido en esta fase.
- Validaciones pendientes:
  - UAT y RLS en una base con copia de datos reales, únicamente cuando se acuerde
    una ventana futura. No ejecutar contra producción durante la preparación.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios y no debe recibir esta migración mientras
    el usuario esté trabajando cotizaciones.
  - Un segundo tenant continúa prohibido: las políticas de los 88 módulos aún
    no incorporan `tenant_id`.
  - Falta completar la auditoría de las 204 funciones `SECURITY DEFINER`, vistas,
    índices únicos, grants efectivos y rutas de Storage.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P7-01 - Resolución segura por hostname y branding de tenant

- Estado: implementado y validado localmente; sin despliegue, DNS, SQL remoto ni
  UAT productivo.
- Fase: 7 del plan multiempresa. Conecta dominio, autenticación e identidad
  visual sin usar el hostname como autorización de datos.
- Archivos / SQL principales:
  - `src/proxy.ts`.
  - `src/lib/tenant-host.ts`.
  - `src/lib/tenant-context.ts`.
  - `src/components/tenant/TenantProvider.tsx`.
  - `src/components/tenant/TenantBrand.tsx`.
  - layouts, login, registro, onboarding, callback, portal, navegación y PDFs.
  - `supabase/migrations/20260921180000_phase7_tenant_hostname_resolution.sql`.
  - `supabase/migrations/20260921181000_phase7_sari_branding_bootstrap.sql`.
  - `supabase/tests/phase7_tenant_hostname_resolution.sql`.
  - `tests/tenant-host.test.mjs`.
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`.
- Cambios:
  - Normaliza hostnames y puertos, admite `sari.localhost` y el alias local
    explícito de Sari, y rechaza slugs reservados, `Host` ambiguo, suffix
    injection, dominios desconocidos y tenants/dominios inactivos.
  - `proxy.ts` borra headers de tenant aportados por el cliente y solo inyecta
    identidad después de resolver un RPC público de campos limitados. RLS sigue
    derivando el tenant desde el perfil autenticado.
  - Los layouts protegidos, ambos login, portal, onboarding y callback comparan
    el tenant del dominio con `profiles.tenant_id`; una sesión de otra empresa
    se cierra o redirige sin conceder acceso.
  - El registro público entrega únicamente el hostname canónico. El trigger de
    Auth resuelve `tenant_id`, conserva invitaciones administrativas confiables
    y enlaza la aceptación legal al mismo tenant.
  - Nombre, logo, colores y metadata se aplican en el root layout, accesos,
    portal y shell interno. Cotización y orden operativa reemplazan textos de
    Sari por el nombre comercial cargado del tenant al renderizar PDF/correo.
  - El bootstrap crea `company_settings` de Sari solo si una base construida
    desde migraciones no posee la fila histórica; nunca reemplaza una existente.
- Validaciones ejecutadas:
  - `npx.cmd supabase migration up --local`: migraciones aplicadas únicamente a
    Supabase local; historial alineado en `20260921181000`.
  - `phase7_tenant_hostname_resolution.sql`: OK mediante `psql`, con rollback.
    Cubre RPC anónimo limitado, MYA temporal, dominio desconocido/inactivo, alta
    ligada al dominio, aceptación legal y bloqueo de lectura directa de tablas.
  - Smoke HTTP con Next.js y Supabase locales: `sari.localhost/login` y el alias
    `localhost/login` responden 200 con nombre, colores y metadata de Sari;
    `forwarders.app/` responde 200 y su `/login` responde 404; dominio
    desconocido, reservado y suffix injection responden 404.
  - `npm.cmd test`: 138/138 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido al resolver, proxy, layouts, auth, portal, navegación e
    invoicing: sin errores ni advertencias.
  - `npx.cmd supabase db lint --local`: sin errores.
  - `npm.cmd run build`: OK, 73/73 páginas; proxy reconocido por Next.js 16.
- Validaciones pendientes:
  - UAT autenticado por rol y revisión visual completa pertenecen a la Fase 8.
  - Validar upgrade desde copia representativa de Production y migración desde
    cero antes de preparar cualquier ventana de corte.
- Riesgos / trabajo pendiente:
  - Producción y el proyecto Supabase vinculado permanecen sin cambios; la app
    desplegada todavía no debe recibir tráfico en `sari.forwarders.app`.
  - El entorno local habitual apunta al Supabase vinculado; el smoke de esta
    fase se ejecutó con variables temporales hacia Supabase local para no tocar
    datos remotos.
  - MYA no fue creada de forma persistente. DNS wildcard, TLS, dominios de Auth,
    variables del hosting y rollback operacional corresponden al paquete de
    corte de Fase 8.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P6-01 - Portal, Storage, correos y APIs por tenant

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 6 del plan multiempresa. Cierra portal, auditoría, notificaciones,
  soporte, archivos privados y Route Handlers que usan `service_role`.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- SQL:
  - `supabase/migrations/20260921170000_phase6_portal_support_tenant_isolation.sql`
  - `supabase/migrations/20260921171000_phase6_tenant_storage_policies.sql`
  - `supabase/tests/phase6_portal_storage_api_isolation.sql`
- Aplicación y pruebas principales:
  - `src/app/api/admin/invite/route.ts`
  - `src/app/api/admin/users/last-sign-in/route.ts`
  - `src/app/api/miami/package-assignment-email/route.ts`
  - `src/app/api/support/notify/route.ts`
  - `src/lib/storage-paths.ts`
  - `src/lib/support-attachments.ts`
  - `src/lib/company-settings.ts`
  - consumidores de Storage de perfil, proveedor, Booking, BL, soporte y portal
    Miami.
  - `tests/admin-invite-tenant.test.mjs`
  - `tests/storage-paths.test.mjs`
  - `tests/email-notifications.test.mjs`
  - `tests/user-last-sign-in.test.mjs`
- Cambios:
  - Agrega `tenant_id NOT NULL`, índices, guards y RLS restrictivo a 13 tablas:
    8 de auditoría/portal y 5 tenant-scoped de soporte.
  - Acota la lectura y administración de `profiles` al tenant; Hernova conserva
    acceso transversal únicamente a la mesa de ayuda.
  - Soporte deriva el tenant del creador/ticket y permite a administradores de
    plataforma responder sin convertir datos operativos del tenant en globales.
  - Las cargas nuevas de los seis buckets usan el prefijo de tenant. Booking,
    documentos/fotos Miami, proveedor y soporte verifican además el padre; las
    rutas privadas legacy solo siguen accesibles si se relacionan con un padre
    visible del tenant actual.
  - `avatars` continúa público por diseño, pero solo su propietario autenticado
    puede crear, reemplazar o borrar bajo `tenant_id/auth.uid()/...`.
  - Invitaciones fijan tenant y dominio primario; la consulta de últimas
    conexiones filtra los usuarios Auth al tenant del Admin.
  - Correos Miami y soporte validan ownership antes de leer/escribir con
    `service_role`, registran auditoría con tenant y generan enlaces desde el
    dominio primario activo. Miami usa branding/contacto del tenant; soporte
    conserva la identidad de Hernova/Forwarders ERP.
  - Corrige `can_access_user_task_context`: elimina la referencia inválida a
    `leads.deleted_at` y exige tenant en agentes/actividades comerciales.
- Validaciones ejecutadas:
  - `npx.cmd supabase migration up --local`: ambas migraciones aplicadas solo a
    Supabase local; historial alineado en `20260921171000`.
  - Postflight: 13/13 columnas obligatorias, 13/13 guards, 13/13 policies RLS
    restrictivas, 6 policies de carga con prefijo y cero tenants MYA persistidos.
  - `phase6_portal_storage_api_isolation.sql`: OK mediante `psql`; prueba Sari,
    MYA, administrador de plataforma, auditoría, soporte, attachment privado,
    intento de notificación cruzada y termina con `ROLLBACK`.
  - `npx.cmd supabase db lint --local --level error`: sin errores.
  - `npm.cmd test`: 133/133 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint dirigido de APIs, helpers y pruebas: OK; consumidores UI modificados
    sin errores y con un único warning preexistente por `<img>` en perfil.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; únicamente avisos LF/CRLF del worktree existente.
- Validaciones pendientes:
  - UAT autenticado con una copia representativa de Production para Cliente,
    Admin, Operaciones, Finanzas y administrador de plataforma.
  - Preflight de filas/objetos reales, respaldo y ventana futura antes de aplicar
    SQL o migrar rutas legacy en el proyecto vinculado.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios y MYA continúa deshabilitada.
  - El resolver de hostname, alta pública asociada al dominio, callbacks de Auth
    y experiencia visual global corresponden a la Fase 7; no se debe habilitar
    un segundo tenant antes de completarla.
  - Los avatares son activos públicos no sensibles; los documentos operativos
    permanecen en buckets privados con validación de tenant.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P2-01 - Configuración y branding aislados por tenant

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 2 del plan multiempresa. El cambio elimina las lecturas globales de
  `company_settings`, pero no habilita todavía un segundo tenant operativo.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- Código principal:
  - `src/lib/company-settings.ts`
  - `src/lib/company-branding.ts`
  - `src/app/(protected)/settings/company/page.tsx`
  - Consumidores de branding/configuración en cotizaciones, pricing, invoicing,
    operaciones, reportes, Miami y portal.
  - `tests/company-settings-tenant.test.mjs`
- SQL:
  - `supabase/migrations/20260921130000_phase2_tenant_company_settings.sql`
  - `supabase/tests/phase2_tenant_company_settings.sql`
- Cambios:
  - Convierte `company_settings.tenant_id` en obligatorio y único por empresa.
  - Agrega colores principal/secundario con defaults de Sari y constraints de
    formato hexadecimal.
  - Reemplaza políticas globales por lectura del tenant para personal interno e
    `INSERT`/`UPDATE` para su Admin activo; no agrega policy permisiva de DELETE.
  - Agrega un RPC interno completo que conserva RLS y un RPC de branding seguro
    para Cliente, ambos resolviendo el tenant desde `auth.uid()`.
  - Centraliza los consumidores en loaders por tenant y elimina todas las
    lecturas `.from('company_settings')` fuera del editor controlado.
  - La pantalla de configuración deriva `tenant_id` del perfil, limita el update
    por `id + tenant_id` y permite editar los dos colores corporativos.
- Validaciones ejecutadas:
  - `npx.cmd supabase migration up --local`: migración aplicada; historial local
    alineado en `20260921130000`.
  - `phase2_tenant_company_settings.sql`: OK mediante `psql`; prueba aislamiento
    Sari/MYA, unicidad, colores, Cliente, Admin de tenant, administrador de
    plataforma y `anon`, y finaliza con `ROLLBACK`.
  - Postflight local: las políticas efectivas son por tenant y los datos de MYA
    no permanecen después de la prueba.
  - `npm.cmd test`: 124/124 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - ESLint dirigido a los helpers, normalización de branding y prueba nueva: OK.
  - `npx.cmd supabase db lint --local --level warning`: los objetos de Fase 2 no
    reportan hallazgos; persiste el error previo en
    `can_access_user_task_context` por la referencia a `leads.deleted_at`.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios. No aplicar esta migración mientras se estén
    trabajando cotizaciones ni sin una ventana posterior autorizada.
  - `surcharge_rules` sigue siendo global y se aislará con catálogos/finanzas en
    la Fase 5.
  - Los colores ya se almacenan, pero el tema global, logo y metadatos por
    hostname se conectarán en la Fase 7.
  - MYA sigue prohibida como empresa operativa hasta aislar comercial,
    operaciones, finanzas, portal, Storage y APIs.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P3-01 - Aislamiento comercial Sari/MYA

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 3 del plan multiempresa. Aísla clientes, CRM, cotizaciones, pricing,
  agentes y snapshots comerciales sin cambiar estados ni cálculos.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- SQL:
  - `supabase/migrations/20260921140000_phase3_commercial_tenant_isolation.sql`
  - `supabase/migrations/20260921141000_fix_phase3_parent_tenant_guard.sql`
  - `supabase/migrations/20260921142000_phase3_profile_reference_integrity.sql`
  - `supabase/migrations/20260921143000_phase3_tenant_delete_guards.sql`
  - `supabase/tests/phase3_commercial_tenant_isolation.sql`
- Cambios:
  - Agrega `tenant_id NOT NULL` e índice a 19 tablas del núcleo comercial.
  - Backfill de raíces hacia Sari con comprobación por cliente/perfil y herencia
    determinista para hijos de cliente, cotización, agente, tarifa y opción.
  - Instala 19 guards para `INSERT`, `UPDATE` y `DELETE`; el tenant se deriva de
    la sesión o del padre y las RPC `SECURITY DEFINER` no pueden mutar otro tenant.
  - Agrega claves compuestas de ownership y de referencias de perfiles para
    bloquear clientes, agentes, snapshots, actores y asignaciones cruzadas.
  - Reemplaza las policies comerciales y helpers `can_*` conservando los roles
    vigentes, soft delete, demo guards y RPC atómicas.
  - Cambia la unicidad de `codigo_cliente` y `quotation_number` de global a
    `(tenant_id, valor)`. Las secuencias independientes se mantienen para Fase 5.
  - La corrección incremental `20260921141000` documenta el hallazgo detectado
    durante pruebas: `EXECUTE` dinámico no actualiza `FOUND` en PL/pgSQL.
- Validaciones ejecutadas:
  - Migraciones aplicadas únicamente en Supabase local; historial local alineado
    en `20260921143000`.
  - Postflight: 19/19 columnas `tenant_id` obligatorias, 19 guards instalados,
    índices únicos comerciales por tenant y cero tenants MYA persistentes.
  - `phase3_commercial_tenant_isolation.sql`: OK mediante `psql`; prueba Sari/MYA,
    Ventas, Pricing, Cliente, administrador de plataforma, `anon`, mismas claves
    en tenants distintos, referencias cruzadas, perfiles, RPC de tarifas,
    selección atómica, snapshots y borrado propio/cross-tenant; termina con
    `ROLLBACK`.
  - `npm.cmd test`: 124/124 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd supabase db lint --local --level warning`: los objetos de Fase 3 no
    reportan hallazgos; persiste el error previo en
    `can_access_user_task_context` por la referencia a `leads.deleted_at`.
- Validaciones pendientes:
  - UAT autenticado con datos equivalentes a Production para Ventas, Pricing,
    Admin, Operaciones y Contabilidad antes de cualquier despliegue.
  - Preflight de filas reales y respaldo en una ventana futura autorizada.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios y MYA continúa deshabilitada.
  - `leads` se resolverá con el contexto de landing/dominio en Fases 6/7;
    `client_notifications` y correos del portal quedan en Fase 6.
  - Catálogos y secuencias, incluido `client_rate_catalog`, continúan pendientes
    para Fase 5.
  - Operaciones y documentos aún no tienen ownership propio; se abordarán en
    Fase 4 antes de habilitar una segunda empresa.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P4-01 - Aislamiento de operaciones y documentos Sari/MYA

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 4 del plan multiempresa. Aísla Shipment, Shipping Instruction, Booking,
  documentos operativos, BL, VGM, garantías y operación Miami sin cambiar sus
  estados ni sustituir las RPC atómicas vigentes.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- SQL:
  - `supabase/migrations/20260921150000_phase4_operations_tenant_isolation.sql`
  - `supabase/migrations/20260921151000_phase4_operations_tenant_helpers.sql`
  - `supabase/tests/phase4_operations_tenant_isolation.sql`
- Cambios:
  - Agrega `tenant_id NOT NULL` e índice a 27 tablas: las 19 del expediente
    operativo y 8 de Miami; `miami_carriers` queda en Fase 5 como catálogo.
  - El backfill usa cotización, cliente, Shipping Instruction, Booking, BL,
    paquete o perfil según el padre canónico, con Sari únicamente como fallback
    histórico de raíces sin vínculo.
  - Agrega claves compuestas para expediente, actores y relaciones opcionales;
    bloquea referencias entre tenants incluso desde `service_role` o funciones
    propietarias.
  - Instala 27 guards para `INSERT`, `UPDATE` y `DELETE`, además de 27 policies
    RLS restrictivas que conservan las reglas funcionales, Cliente y Demo.
  - Endurece helpers de Shipping Instruction, Shipment, Booking, BL y documentos
    Miami. `booking_operational_mode()` y `get_billing_work_queue()` ya no leen
    datos de otra empresa bajo `SECURITY DEFINER`.
  - Convierte routing, shipment, HBL, manifiesto, warehouse y embarque Miami a
    unicidad por tenant; los generadores independientes permanecen en Fase 5.
- Validaciones ejecutadas:
  - `npx.cmd supabase migration up --local`: ambas migraciones aplicadas solo a
    Supabase local; historial alineado en `20260921151000`.
  - Postflight: 27/27 columnas `tenant_id` obligatorias, 27/27 guards, 27/27
    policies restrictivas y cero tenants MYA persistentes.
  - `phase4_operations_tenant_isolation.sql`: OK mediante `psql`; prueba Sari y
    MYA con Ventas, Operaciones, Contabilidad, Cliente, administrador de
    plataforma y `anon`; ejerce creación canónica de shipment y booking,
    eventos, BL, documentos, garantías, manifiestos y embarques Miami, números
    compartidos, referencias/borrado cross-tenant y cola de facturación; termina
    con `ROLLBACK`.
  - `npm.cmd test`: 124/124 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `npx.cmd supabase db lint --local --level warning`: los objetos de Fase 4 no
    reportan hallazgos; persiste el error previo en
    `can_access_user_task_context` por la referencia a `leads.deleted_at`.
- Validaciones pendientes:
  - UAT autenticado con una copia representativa de Production para Ventas,
    Operaciones, Contabilidad y Cliente antes de cualquier despliegue.
  - Preflight de filas reales, respaldo y ventana de mantenimiento futura.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios y MYA continúa deshabilitada.
  - Finanzas, proveedores, catálogos (`miami_carriers` incluido) y numeradores
    independientes continúan en Fase 5.
  - Storage, portal completo, correos y Route Handlers con `service_role`
    continúan en Fase 6; no se modificaron rutas de archivos existentes.
  - No hay hash de commit disponible.

### 2026-09-21 - SAAS-P5-01 - Aislamiento financiero, catálogos y numeraciones Sari/MYA

- Estado: implementado y validado localmente; sin despliegue, SQL remoto ni UAT
  productivo.
- Fase: 5 del plan multiempresa. Aísla documentos fiscales, cartera, pagos,
  proveedores, costos, catálogos configurables y numeradores sin recalcular
  saldos, importes o snapshots históricos.
- Documentación:
  - `docs/MULTI_TENANT_MIGRATION_PLAN.md`
  - `docs/MULTI_TENANT_TABLE_INVENTORY.md`
- SQL y aplicación:
  - `supabase/migrations/20260921160000_phase5_finance_catalog_tenant_isolation.sql`
  - `supabase/migrations/20260921161000_phase5_finance_tenant_helpers.sql`
  - `supabase/migrations/20260921162000_phase5_invoice_entrypoint.sql`
  - `supabase/migrations/20260921163000_phase5_freight_payable_conflict.sql`
  - `supabase/migrations/20260921164000_phase5_internal_function_privileges.sql`
  - `supabase/tests/phase5_finance_catalog_tenant_isolation.sql`
  - `src/app/(protected)/settings/company/page.tsx`
- Cambios:
  - Agrega `tenant_id NOT NULL`, índice, guard de `INSERT`/`UPDATE`/`DELETE` y
    policy RLS restrictiva a 20 tablas financieras y configurables.
  - El backfill deriva ownership desde cotización, cliente, invoice, pago,
    proveedor, booking, agente o perfil; usa Sari solo como fallback histórico.
  - Agrega relaciones compuestas para impedir facturas, notas, pagos, splits,
    costos, CxP, proveedores, impuestos y actores cruzados entre tenants.
  - Acota por tenant la unicidad de número de factura, CAI activo, idempotencia
    de CxP, plantillas, productos, cargos, carriers y demás catálogos.
  - Convierte `document_sequences` y `hbl_number_counters` a contadores por
    tenant. Cliente, cotización, routing, proforma, HBL, manifiesto, warehouse y
    embarque Miami conservan sus formatos visibles y avanzan por separado.
  - Endurece CAI, creación atómica de facturas, pagos, reversos, CxP, helpers de
    costos y acceso, además de `invoice_receivables`, contra lecturas o
    mutaciones cross-tenant bajo `SECURITY DEFINER`.
  - Actualiza el `upsert` de Bunker para usar la clave compuesta
    `tenant_id,code` sin aceptar el tenant desde la interfaz.
  - La migración incremental `20260921163000` corrige el `ON CONFLICT` legacy de
    la CxP detectado por `supabase db lint` y conserva su idempotencia por tenant.
- Validaciones ejecutadas:
  - `npx.cmd supabase migration up --local`: cinco migraciones aplicadas solo a
    Supabase local; historial alineado en `20260921164000`.
  - Postflight: 20/20 columnas `tenant_id` obligatorias, 20/20 guards, 20/20
    policies restrictivas y cero tenants/usuarios MYA de prueba persistentes.
  - `phase5_finance_catalog_tenant_isolation.sql`: OK mediante `psql`; prueba
    Sari/MYA, números y códigos iguales entre tenants, duplicados internos,
    facturas/items, pagos, CxP idempotente, proveedores, costos, catálogos,
    contadores, administrador de plataforma y `anon`; termina con `ROLLBACK`.
  - `npm.cmd test`: 124/124 pruebas correctas.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd run build`: OK, 73/73 páginas.
  - `git diff --check`: OK; únicamente avisos de normalización LF/CRLF del
    worktree existente.
  - `npx.cmd supabase db lint --local --level warning`: los objetos de Fase 5 no
    reportan hallazgos; persiste únicamente el error previo en
    `can_access_user_task_context` por la referencia a `leads.deleted_at`.
- Validaciones pendientes:
  - UAT autenticado con una copia representativa de Production para Finanzas,
    Contabilidad, Admin, Pricing y Operaciones antes de cualquier despliegue.
  - Preflight de filas reales, respaldo y ventana de mantenimiento futura.
- Riesgos / trabajo pendiente:
  - Producción permanece sin cambios y MYA continúa deshabilitada.
  - Portal, Storage, correos enviados y Route Handlers con `service_role`
    continúan en Fase 6.
  - Los prefijos visibles existentes de Sari se conservaron deliberadamente;
    la experiencia visual y resolución por hostname pertenecen a la Fase 7.
  - No hay hash de commit disponible.

### 2026-09-30 - FLOW-035 - Conservación de servicios al cambiar tarifa aérea

- Estado: implementado, validado, migrado y desplegado en Production; UAT
  autenticado pendiente.
- Hallazgo: al cambiar una tarifa ya seleccionada en una cotización Aéreo
  Consolidado, la RPC de selección eliminaba todas las líneas de venta y solo
  recreaba flete/EXW. Se perdían cargos de servicio, IDs, venta, impuestos y
  notas ya registrados.
- Archivos:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `supabase/tests/air_consolidated_agent_selection.sql`.
- SQL:
  - `supabase/migrations/20260930120000_preserve_air_consolidated_pricing.sql`.
- Cambios:
  - La RPC atómica conserva las líneas existentes de Aéreo Consolidado cuando
    ya había una tarifa seleccionada, igual que el resguardo vigente de FCL.
  - Solo actualiza costo y proveedor de la línea canónica de flete; mantiene
    IDs, precios de venta, cantidades, impuestos, totales, notas y servicios,
    incluso si un servicio adicional está clasificado como `Flete`.
  - Una primera selección sin tarifa previa conserva el flujo de generación
    inicial. Coincidencias ambiguas o incompatibles abortan toda la transacción.
  - La UI registra el cambio como actualización conservando venta en vez de
    describirlo como regeneración de pricing.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit`: exitoso.
  - `npm.cmd test`: 154/154 pruebas exitosas.
  - `npm.cmd run build`: exitoso, 76/76 páginas generadas.
  - ESLint dirigido: 33 errores y 5 advertencias preexistentes; el resultado es
    idéntico contra `HEAD` y el cambio no agrega hallazgos.
  - `git diff --check`: exitoso.
  - Migración aplicada en Supabase local; `db lint --local --level warning` sin
    errores de esquema.
  - Prueba SQL transaccional `air_consolidated_agent_selection.sql`: exitosa y
    finalizada con `ROLLBACK`. Verifica tres líneas intactas, actualización
    exclusiva de costo/proveedor, selección única y rollback ante incompatibilidad.
  - Migración `20260930120000` aplicada al proyecto Supabase remoto vinculado;
    historial local/remoto alineado y postflight `db push --linked --dry-run`:
    base remota al día.
- Riesgos / trabajo pendiente:
  - UAT autenticado: cambiar entre dos tarifas de Aéreo Consolidado con cargos
    de servicio y verificar selección única, importes comerciales y PDF.
- Postflight Production:
  - Commit funcional `a688c19` publicado en `origin/main`.
  - GitHub Production `6767287257` y Vercel reportan
    `success / Deployment has completed`.
  - URL inmutable:
    `https://sarierp-awjwk4ebl-claudherhn-5641s-projects.vercel.app`.
  - Smoke público de solo lectura: `https://sari.forwarders.app/login` responde
    `200`; `/pricing-comparison` responde `307` hacia
    `/login?next=%2Fpricing-comparison`; `https://forwarders.app/` responde `200`.
- Commit de implementación y despliegue: `a688c19`. Registro de publicación en
  commit documental posterior.

### 2026-10-12 - UX-065 - Costos por contenedor en tarjetas de comparativo

- Estado: implementado, validado en código con datos reales de solo lectura y
  desplegado en Production; pendiente revisión visual y UAT autenticado.
- Hallazgo: las tarjetas de Pricing mostraban únicamente el flete agregado de
  `agent_quotes`, aunque los costos unitarios ya estaban registrados en
  `agent_quote_container_rates`.
- Archivos:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `src/components/pricing/AgentContainerRateBreakdown.tsx`.
  - `HARDENING.md`.
- SQL: no aplica; no se modificaron esquema, RLS ni datos.
- Cambios:
  - La consulta carga las líneas guardadas en una relación anidada, ordenadas
    por fecha y con FK explícita para evitar ambigüedad entre relaciones.
  - Las tarjetas FCL/FTL muestran cantidad, tipo y flete unitario; cantidades
    mayores a uno muestran también su subtotal.
  - Los totales y cálculos existentes se conservan; se etiquetan como totales
    y se aclara que EXW, MBL y PS están incluidos en el costo final.
  - Las tarifas históricas sin líneas informan que no hay desglose registrado;
    no se distribuye un total arbitrariamente entre tipos de contenedor.
- Validaciones ejecutadas:
  - Consulta remota de solo lectura de `SARIHN-2609-0317-AP`: dos contenedores
    canónicos, 1 × 40HC y 1 × 20GP, y dos tarifas con sus líneas guardadas.
    Tarifa de la captura: USD 8,400.00 y USD 8,200.00, base USD 16,600.00.
    Tarifa seleccionada: USD 7,400.00 y USD 7,600.00, base USD 15,000.00.
  - Consulta anidada exacta del componente: exitosa para ambas tarifas.
  - Render estático del componente real: ambos desgloses coinciden con sus
    totales; cantidad 3 calcula su subtotal; cero explícito, costo ausente y
    desglose ausente se distinguen correctamente.
  - `npx.cmd tsc --noEmit`: OK.
  - `npm.cmd test`: 160/160 pruebas correctas.
  - `npm.cmd run build`: OK, 79/79 páginas generadas.
  - ESLint: componente nuevo sin hallazgos; página conserva los mismos
    33 errores y 5 advertencias de `HEAD`, sin hallazgos nuevos.
  - Intento de vista aislada con CSS de producción en Chrome/Edge headless:
    el entorno no produjo capturas; revisión visual pendiente.
- Riesgos / trabajo pendiente:
  - UAT autenticado en escritorio/móvil: abrir la cotización, verificar ambos
    desgloses, editar una tarifa y comprobar actualización; alternar Cards/Tabla
    y comprobar que selección, totales y venta mantienen su comportamiento.
  - La lectura privilegiada verifica los datos y la relación, sin certificar
    RLS con una sesión de Pricing. Se conserva el cliente autenticado existente
    y se revisaron las policies vigentes; no se agregó acceso privilegiado a UI.
  - No se ejecutó SQL; la base de datos no requirió cambios.
- Postflight Production:
  - Commit funcional `39e9a6e` publicado en `origin/main`.
  - Sin despliegue automático para el commit; se ejecutó el despliegue
    autorizado mediante `vercel deploy --prod` sobre el proyecto `sarierp`.
  - Vercel: `dpl_4wSD9gz3JV2GBo3QFBsFbxzhutU5`, target `production`, estado
    `READY`; compilación remota y TypeScript exitosos, 79/79 páginas generadas.
  - URL inmutable:
    `https://sarierp-nq1o6n9yz-claudherhn-5641s-projects.vercel.app`.
  - Vercel confirma los aliases `sari.forwarders.app` y `forwarders.app` en
    ese despliegue.
  - Smoke público de solo lectura: `https://sari.forwarders.app/login` responde
    `200`; `/pricing-comparison` responde `307` hacia
    `/login?next=%2Fpricing-comparison`; `https://forwarders.app/` responde `200`.
- Commit de implementación y despliegue: `39e9a6e`. Registro de publicación en
  commit documental posterior.

### 2026-10-12 - UX-066 - Scanner y generador de factura manual SARI USA

- Estado: implementado, validado y publicado en Production tras autorización
  de configurar el servidor; migración aplicada y captura manual/PDF/historial
  disponibles. La opción de OpenAI quedó bloqueada por saldo agotado y fue
  sustituida en la interfaz por el lector gratuito de UX-067. Pendiente UAT
  autenticada y aprobación visual del documento final.
  No se declara completado el flujo operativo.
- Hallazgo / necesidad: no existía un módulo para leer PDF/fotos de facturas
  SARI USA, corregir los campos del ejemplo y regenerar documentos independientes
  con su plantilla. El usuario confirmó PDF/fotos y documentos independientes.
- Archivos:
  - `src/app/(protected)/manual-invoices/page.tsx`.
  - `src/components/invoicing/ManualInvoiceEditor.tsx`.
  - `src/components/pdf/manual-invoice-pdf.tsx`.
  - `src/lib/manual-invoice.ts`.
  - `src/lib/server/manual-invoices.ts`, `manual-invoice-ocr.ts`.
  - `src/app/api/manual-invoices/route.ts`, `ocr/route.ts`.
  - `src/lib/permissions.ts`, `src/components/layout/sidebar.tsx`.
  - `public/logo/sari-usa-invoice.jpeg`: extraído del Word proporcionado.
  - `tests/manual-invoice.test.mjs`, `manual-invoice-routes.test.mjs`,
    `manual-invoice-pdf.test.mjs`.
  - `docs/manual-sari-usa-invoices.md`, `.gitignore`, `.vercelignore`, `HARDENING.md`.
- SQL:
  - `supabase/migrations/20261012160000_manual_sari_usa_invoices.sql`.
  - `supabase/tests/manual_sari_usa_invoices.sql`.
- Cambios:
  - Ruta propia con acceso de Admin, Operaciones, Finanzas y Contabilidad de
    Sari; controles en página, API y RLS. Sin acceso de clientes, otros tenants
    ni administradores exclusivos de plataforma.
  - Captura manual, comparación del original, lectura PDF/JPG/PNG/WEBP,
    revisión de campos, cargos y WR, y confirmación de revisión antes de guardar
    o generar PDF. El total se calcula en centavos; un cero explícito es válido.
  - Plantilla Letter con identidad fija SARI USA, recuadros, detalle y Remarks;
    sin resaltados, con paginación explícita para documentos extensos. Las
    fechas y moneda usan helpers del ERP. El original se mantiene en memoria,
    no se publica ni se almacena como asset del historial.
  - Historial de versiones inmutables en tabla independiente: no crea partidas
    en `invoices`, cuentas por cobrar, CAI o operaciones. El trigger deriva
    número, cliente y total del contenido incluso en inserciones REST directas.
  - OCR con Responses API, esquema estricto y `store: false`, clave solo en
    servidor, habilitación explícita, límite de 3 MB, validación de firmas y
    lectura acotada del cuerpo aun sin Content-Length. Cupo atómico de 20
    intentos diarios por usuario en calendario Miami. Sin nuevas librerías.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit`: OK.
  - ESLint sobre todos los archivos TS/TSX modificados y nuevas pruebas: OK.
  - `npm.cmd test`: 176/176 pruebas correctas; incluye 16 pruebas del módulo
    sobre totales, fechas, datos ilegibles, cargas falsas, permisos, cupos,
    solicitudes a OCR simuladas y render real del PDF.
  - Render real del ejemplo: una página Letter 612 × 792 y USD 3,845.00;
    documento extenso conserva cargos/WR en sus páginas, y campos con longitudes
    máximas se comprueban contra líneas y cajas sin recorte.
  - Migración y regresión SQL ejecutadas en `supabase_db_sarierp` dentro de una
    única transacción con rollback: OK. Pruebas de RLS para Admin, Ventas,
    otro tenant y usuario suspendido; disponibilidad para Operaciones,
    Finanzas y Contabilidad; sin grants de lectura anónima; versiones no
    actualizables/eliminables; resumen derivado, fechas/importes inválidos,
    tenant/autor falsificados y cupo 20/21.
  - `npm.cmd run build`: OK, 82/82 páginas; incluye ambas API y el módulo.
  - Ejemplo local generado en
    `.local/manual-invoice/SARI-USA-Invoice-131326.pdf` (artefacto ignorado).
- Riesgos / trabajo pendiente:
  - Migración aplicada en Production el 12/10/2026 tras la solicitud explícita
    de configurar el servidor; conservar verificación del flujo con sesión real
    en UAT. La ejecución local original se revirtió.
  - Clave y activación configuradas. Agregar créditos en OpenAI y validar OCR
    real con PDF escaneado/foto. Las pruebas originales no llamaron al proveedor;
    la comprobación posterior usó solo datos ficticios y recibió error de saldo.
  - UAT autenticado: carga, comparación, edición, revisión, descarga, guardado,
    historial, escritorio/móvil, teclado y errores de red. El original no queda
    guardado y los datos no guardados se pierden al salir.
  - Aprobar visualmente la impresión contra el formato de SARI USA: logotipo
    rojo del Word frente a monocromo de la foto, encabezado y texto fijo. Se
    verificó layout con el renderer; Chrome headless no produjo captura local,
    por lo que no se certifica revisión visual en navegador.
  - Los intentos fallidos consumen el cupo OCR; la lectura requiere revisión
    humana. El costo y retención del proveedor deben configurarse en su cuenta.
  - El saldo agotado de OpenAI (`credit_balance_exhausted`) impide usar esa
    opción anterior; no afecta al lector local gratuito agregado en UX-067.
- Configuración Production autorizada el 12/10/2026:
  - Proyecto Supabase `sarierp`, ref `fwspgdzvlbtbgiupvrzo`.
  - Prerrequisitos verificados: helpers de tenant, aprobación y rol; dominio
    Sari activo. Tabla del módulo ausente y conteo de `invoices` = 0.
  - Migración `20261012160000` aplicada aisladamente mediante transacción y
    registrada con el SQL exacto en `supabase_migrations.schema_migrations`.
    No se ejecutó `db push` general ni la migración de Outlook `20261002120000`,
    que permanece pendiente.
  - Postflight: RLS habilitado; sin SELECT de anon; sin UPDATE/DELETE de
    authenticated; sin EXECUTE anónimo de OCR. Conteos: `invoices` = 0,
    `manual_invoices` = 0, cupos OCR = 0. No se insertaron facturas de prueba.
  - Vercel `sarierp`: `MANUAL_INVOICE_OCR_ENABLED=false` y
    `MANUAL_INVOICE_OCR_MODEL=gpt-4.1-mini`, solo Production. No existe
    `OPENAI_API_KEY`; el usuario confirmó que todavía no tiene una.
  - El dry-run de Vercel detectó inclusión de artefactos locales y del checkout
    Demo; se agregó `.vercelignore` para excluirlos junto con credenciales,
    perfiles del navegador y cachés. No se publicó el manifiesto inicial.
  - Dry-run final de Vercel: 654 archivos; incluye módulo y logotipo, sin
    `.local/`, `.demo-sync/`, `.ua/`, `supabase/.temp/` ni archivos `.env`/PEM.
  - `npx.cmd tsc --noEmit` y `git diff --check`: OK antes de publicación.
  - Commit funcional local: `2cbbd04`.
  - Publicación Vercel: `dpl_AVhCXMJNxAfapJgCjpSUQa1w1MiD`, target
    `production`, estado `READY`. Compilación remota y TypeScript exitosos;
    82/82 páginas generadas.
  - URL inmutable:
    `https://sarierp-4su76v44x-claudherhn-5641s-projects.vercel.app`.
  - Smoke en `https://sari.forwarders.app`: `/login` = 200;
    `/manual-invoices` = 307 hacia `/login?next=%2Fmanual-invoices`;
    ambas API nuevas = 401 JSON sin sesión; logotipo del módulo = 200 JPEG.
  - REST Supabase sin sesión de usuario: lectura de `manual_invoices` y
    ejecución de `claim_manual_invoice_ocr` rechazadas con 401/42501.
  - Policies remotas comprobadas: SELECT por tenant/rol; INSERT también exige
    autor = auth.uid(); trigger de validación instalado; tabla de cupos con
    RLS y sin grants directos a authenticated.
  - No se crearon documentos de prueba en Production ni se llamó a OpenAI.
- Commit funcional/despliegue: `2cbbd04`; registro postflight en commit documental
  posterior. Los commits permanecen locales en esta sesión.

- Activación OCR autorizada el 12/10/2026 tras confirmación del usuario:
  - `OPENAI_API_KEY` presente como Sensitive/Production en Vercel; clave local
    presente sin espacios externos, OCR `true` y modelo `gpt-4.1-mini`.
    No se imprimió, copió al repositorio ni descargó la clave de Vercel.
  - Variable Vercel `MANUAL_INVOICE_OCR_ENABLED` actualizada a `true`.
  - La revisión automática rechazó enviar el PDF de ejemplo por posible
    información sensible sin autorización específica. No se envió ese archivo.
    Se usó una alternativa con un PDF generado en memoria: TEST CUSTOMER,
    OCR-TEST-001 y USD 1.00, sin documentos aportados ni datos de clientes.
  - Comprobación con certificados confiables de Windows y validación TLS activa:
    OpenAI respondió HTTP 429, código `credit_balance_exhausted`. No hubo
    extracción exitosa ni cambios en la base de datos por esta comprobación.
  - Fix: el módulo distingue falta de saldo de límites temporales, indica al
    administrador agregar créditos y conserva la captura manual. No devuelve
    mensajes internos del proveedor. Archivos: `manual-invoice-ocr.ts`,
    `tests/manual-invoice.test.mjs`, esta bitácora y la guía del módulo.
    SQL: sin cambios.
  - Validación: 17/17 pruebas del módulo, incluidos errores de saldo, rate limit
    y respuesta no JSON; suite completa 177/177, TypeScript, ESLint y build
    82/82 páginas OK. Publicación y checks finales se registran al terminar.
  - Pendiente: recarga de la organización API, lectura exitosa, UAT autenticada
    y aprobación visual del PDF. No se declara completado el flujo operativo.
  - Commit del ajuste: `e1a1a0d`. Publicación Production
    `dpl_AT21haRc2qbvMoDr3YLTLvvPimXM`, estado `READY`, dominio
    `sari.forwarders.app`; build remoto y TypeScript OK, 82/82 páginas.
    URL inmutable:
    `https://sarierp-cjkyirkzd-claudherhn-5641s-projects.vercel.app`.
  - Smoke tras publicar: `/login` 200, `/manual-invoices` 307 al login y
    `/api/manual-invoices/ocr` 401 JSON sin sesión. No se realizó UAT autenticada
    ni una lectura exitosa en Production. El bloqueo de saldo se comprobó con
    la clave local; en Vercel solo se verificó presencia del secreto.

### 2026-10-12 - UX-067 - OCR gratuito en el navegador para facturas SARI USA

- Estado: implementado, validado localmente y publicado en Production; pendiente
  UAT autenticada de guardar/historial y aprobación visual del PDF. El usuario
  autorizó integrar Tesseract.js y PDF.js tras indicar que no dispone de saldo
  para la API. No se declara completado el recorrido operativo.
- Hallazgo: la opción de OpenAI impedía leer documentos sin créditos, aun con
  clave y límites Free configurados. Se necesita lectura sin cargos por API.
- Archivos:
  - `src/lib/browser/manual-invoice-ocr.ts`.
  - `src/lib/manual-invoice-ocr-parser.ts`.
  - `src/components/invoicing/ManualInvoiceEditor.tsx`.
  - `src/proxy.ts`, `tests/manual-invoice-browser-ocr.test.mjs`.
  - `package.json`, `package-lock.json`, `scripts/sync-invoice-ocr-assets.mjs`.
  - `public/ocr-assets/NOTICE.md`, `LICENSE.txt`, `lang/eng.traineddata.gz`.
  - `.gitignore`, `.vercelignore`, `docs/manual-sari-usa-invoices.md`, esta bitácora.
- SQL: sin cambios. Migración, policies, grants e historial independiente de
  UX-066 se conservan; no se crean facturas/cuentas por cobrar por leer un archivo.
- Cambios:
  - Lectura únicamente en navegador: PDF con texto, PDF escaneado y fotos;
    imports diferidos, engine en worker, progreso, cancelación y limpieza.
  - Recursos del motor/modelo/fuentes desde el mismo origen. Predev/prebuild
    copia los runtimes fijados; modelo inglés versionado con checksum SHA-256.
    Solo `/ocr-assets/` omite el proxy, por contener archivos públicos de librería.
    Las rutas de factura/API continúan cubiertas por proxy y autorización/RLS.
  - Parser por posiciones/etiquetas: cliente y columnas separados, cargos y WR,
    total impreso, fechas con selector explícito MM/DD o DD/MM. Datos ilegibles
    vacíos, cero conservado, importes inválidos advertidos y facturas diferentes
    rechazadas sin combinar cargos. Texto de apoyo solo en memoria, sin ejecutar
    instrucciones ni scripts del documento.
  - Límite de 3 MB, 5 páginas, render de hasta 8 millones de píxeles y 3 minutos.
    La captura manual, revisión obligatoria y PDF SARI USA mantienen sus reglas.
  - Tesseract.js 7.0.0 y PDF.js 6.2.108 fijados. La versión de PDF.js incorpora
    el parche de GHSA-hq66-cqwq-w95j; no se habilita scripting/XFA de documentos.
  - Interfaz sin llamadas a la API de OCR de pago. Variable anterior
    `MANUAL_INVOICE_OCR_ENABLED=false` en `.env.local` y Vercel Production;
    credenciales existentes conservadas exclusivamente en el servidor.
- Validaciones:
  - Suite Node: 186/186 (9 pruebas nuevas), incluidas columnas, fechas, cargos
    cero/faltantes, bordes, instrucciones en descripciones, facturas distintas,
    cancelación tardía, firmas falsas y matcher real de Next para assets/rutas.
  - TypeScript y ESLint de archivos afectados: OK. Build local: 82/82 páginas.
  - Chrome headless con perfil aislado y código real del lector: PDF con texto,
    imagen rasterizada, PDF escaneado y foto inclinada 4° recuperan número,
    cliente, tres cargos, seis WR y USD 3,845.00; fechas bajo selección DD/MM.
    Se verificó rechazo de PDF de 6 páginas y cancelación de lectura real.
  - Imagen/PDF escaneado pueden incluir puntuación de bordes en referencias;
    foto inclinada no recuperó el total impreso y emitió advertencia. No se
    inventó ni reemplazó ese total; se conservan cargos calculados y revisión.
  - Network de página/workers sin peticiones externas del OCR ni a OpenAI.
    El antivirus local inyectó sus propias peticiones a Kaspersky; se separaron
    de las del código de la aplicación y no se desactivó la protección.
  - `npm audit`: sin hallazgos en Tesseract/PDF.js/canvas/wasm; permanecen 15
    hallazgos previos de otras dependencias, fuera de este cambio.
  - Dry-run Vercel: 661 archivos, modelo de idioma incluido; sin `.local/`,
    `.demo-sync/`, `.ua/`, variables `.env` ni runtime generado en el upload.
    Los workers/wasm se generan mediante prebuild en el servidor de compilación.
  - Sin envío de originales a proveedores ni inserciones de prueba en Production.
- Riesgos / pendiente:
  - Fotos reales con perspectiva, mala iluminación o texto borroso requieren
    UAT y correcciones. Rendimiento depende del dispositivo; primera carga
    descarga motor/modelo. No se certifica exactitud OCR sin revisión humana.
  - Verificar móvil/teclado y recorrido autenticado completo de edición,
    generación, guardado e historial; la prueba Chrome usa un harness local.
  - Pendiente UAT con documentos reales y sesión autorizada; las comprobaciones
    HTTP siguientes verifican disponibilidad y protección, no el flujo autenticado.
- Publicación y postflight (12/10/2026):
  - Commit funcional: `2a1f47e`; registro postflight en commit documental posterior.
    Los commits permanecen locales en esta sesión.
  - Vercel Production: `dpl_HQkChWLhuXFFyr7FQAv8vHzkhmCQ`, estado `READY`.
    Build remoto, prebuild de assets y TypeScript OK; 82/82 páginas generadas.
    URL inmutable:
    `https://sarierp-f2bpfr2qk-claudherhn-5641s-projects.vercel.app`.
  - En `https://sari.forwarders.app`: `/login` = 200; `/manual-invoices` = 307
    al login; `/api/manual-invoices` y `/api/manual-invoices/ocr` = 401 JSON
    sin sesión. Workers Tesseract/PDF.js y core relaxed-SIMD LSTM JS/WASM = 200,
    con tipos JavaScript/WebAssembly correctos.
  - Modelo inglés servido = 200, 2,952,873 bytes; SHA-256 idéntico al modelo
    versionado: `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`.
    Verificación HTTPS con certificados de Windows y TLS activo.

### 2026-10-12 - UX-068 - Flechas y número destacado en PDF de factura manual

- Estado: ajuste implementado, validado visualmente en PDF real y publicado
  en Production; postflight de disponibilidad y acceso correcto.
- Hallazgo: Helvetica no imprime los caracteres de flecha del indicador PAGE;
  el número de factura tenía el mismo tamaño y peso que los demás valores.
- Archivos: `src/components/pdf/manual-invoice-pdf.tsx`, esta bitácora.
- SQL: sin cambios; no modifica datos, permisos ni documentos independientes.
- Cambios: triángulos SVG negros antes y después de PAGE, apuntando hacia
  afuera como en la referencia Word. Número en Helvetica-Bold de 12 pt
  (antes 7.5 pt); tamaño adaptable para referencias largas. Altura y ancho
  del renglón ajustados dentro del mismo recuadro de factura.
- Validaciones: pruebas existentes de PDF 3/3, incluidas paginación y máximos
  de campos sin recorte/desbordamiento; TypeScript y ESLint afectado OK.
  PDF de ejemplo generado localmente, rasterizado con PDF.js e inspeccionado:
  ambas flechas visibles y número 131326 grande/negrita, sin solapamientos.
  Build local OK, 82/82 páginas; build remoto y TypeScript también correctos.
- Riesgos / pendiente: UAT autenticada general de UX-066/067 continúa pendiente;
  esta inspección valida el PDF generado, no el recorrido de guardado/historial.
- Commit funcional: `a753301`; postflight en commit documental posterior.
  Commits locales en esta sesión.
- Publicación: `dpl_2iyzKAD9gYhjV7ven4HqzT8SiGNr`, Production `READY`.
  URL inmutable:
  `https://sarierp-87qibzlsc-claudherhn-5641s-projects.vercel.app`.
  Dominio `sari.forwarders.app`: login 200, factura manual 307 hacia login,
  ambas API del módulo 401 JSON sin sesión; workers/core/modelo OCR 200
  y SHA-256 del modelo coincide con el versionado. Sin datos de prueba
  insertados ni originales enviados a proveedores.

### 2026-10-12 - UX-069 - Formato seleccionado de fechas en factura manual y PDF

- Estado: implementado, validado localmente y publicado en Production. UAT
  autenticada con guardado/historial en Production continúa pendiente.
- Hallazgo: el selector solo cambiaba la interpretación de fechas del OCR;
  el PDF imprimía siempre DD/MM/YYYY y el formato no se guardaba con la factura.
  Reproducido antes del fix con una prueba del renderer real: MM/DD fallaba
  al imprimir 12/10/2026 en lugar de 10/12/2026 para el 12 de octubre.
- Archivos: `src/lib/manual-invoice.ts`, `src/lib/manual-invoice-ocr-parser.ts`,
  `src/components/invoicing/ManualInvoiceEditor.tsx`,
  `src/components/pdf/manual-invoice-pdf.tsx`,
  `tests/manual-invoice.test.mjs`, `tests/manual-invoice-pdf.test.mjs`,
  `tests/manual-invoice-routes.test.mjs`, `tests/manual-invoice-browser-ocr.test.mjs`,
  `docs/manual-sari-usa-invoices.md`, esta bitácora.
- SQL: sin cambios. El formato usa `date_format` en el JSON existente;
  el trigger vigente conserva las propiedades adicionales del documento.
  Fechas calendario, totales, políticas y grants conservan sus reglas.
- Cambios:
  - Un único formato guardado (`mdy` / `dmy`) gobierna OCR y PDF de la factura.
    Validación rechaza opciones inválidas. Fechas internas continúan siendo ISO;
    cambiar el formato cambia la presentación, no el día/mes ingresados.
  - Nuevas facturas usan MM/DD; versiones antiguas sin metadata conservan DD/MM
    al abrirse. No se reescriben versiones históricas ni fechas existentes.
  - El formato participa en el snapshot: cambiarlo exige revisión, marca cambios
    por guardar e invalida la vista previa anterior. Carga de archivo conserva
    la selección; abrir historial restaura la selección de esa versión.
  - Selector explícito «Formato de fechas (OCR y PDF)» y texto bajo las fechas
    con su presentación en PDF; instrucciones para volver a leer el original
    si se desea reinterpretar sus fechas. Formato general del ERP sin cambios.
- Validaciones:
  - Suite completa 188/188: PDF real en ambos formatos y fallback histórico;
    persistencia/restauración mediante API simulada y JSON; rechazo de metadata
    inválida; OCR conserva el formato seleccionado; fechas calendario sin cambios.
  - TypeScript y ESLint de archivos afectados OK. Build local OK, 82/82 páginas.
    Build remoto OK, TypeScript correcto y 82/82 páginas generadas.
  - Dos PDFs ficticios rasterizados e inspeccionados: emisión 12 de octubre =
    10/12/2026 (MM/DD) o 12/10/2026 (DD/MM); vencimiento 5 de noviembre =
    11/05/2026 o 05/11/2026. Flechas y número destacado visibles.
- Riesgos / pendiente: la prueba de API usa Supabase simulado; no acredita UAT
  autenticada de persistencia real. Inputs date conservan el calendario nativo
  del navegador, con una indicación explícita del formato usado en el PDF.
  Sin documentos de prueba en Production ni envíos a servicios OCR externos.
- Commit funcional: `d193f1b`; postflight en commit documental posterior.
  Commits locales en esta sesión.
- Publicación: `dpl_D7GuqNHq7JkuQtv81E9uq821BMo6`, Production `READY`.
  URL inmutable:
  `https://sarierp-1a21wev2j-claudherhn-5641s-projects.vercel.app`.
  En `sari.forwarders.app`: login 200, factura manual 307 al login,
  ambas API 401 JSON sin sesión; workers/core/modelo OCR 200 y checksum del
  modelo correcto. Estos checks no sustituyen el recorrido autenticado.

### 2026-10-12 - UX-070 - Texto del scanner y visualizar PDF en otra pestaña

- Estado: implementado, validado localmente y publicado en Production;
  pendiente UAT de pestañas en el navegador del usuario.
- Hallazgo: textos técnicos sobre gratuidad/clave/saldo innecesarios para el
  flujo solicitado; el botón solo generaba la vista previa dentro del editor.
- Archivos: `src/components/invoicing/ManualInvoiceEditor.tsx`,
  `docs/manual-sari-usa-invoices.md`, esta bitácora. SQL: sin cambios.
- Cambios: retirados ambos textos indicados por el usuario. Botón «Visualizar
  PDF» abre una pestaña durante el clic, antes de generar el documento, usando
  el patrón existente de Reportes. Se desvincula opener y se navega al blob
  generado o a la vista previa vigente. Ante bloqueo se ofrece descarga en
  Sonner; errores de validación/generación cierran la pestaña reservada.
  Descarga directa y preview dentro del editor conservan su funcionamiento.
- Validaciones: TypeScript y ESLint afectado OK; comprobación del handler real
  extraído del componente con ventana/generador PDF simulados: pestaña nueva,
  reutilizar PDF vigente, apertura bloqueada, formulario inválido, fallo al
  generar, descarga sin abrir pestaña y bloqueo por busy; ausencia de los dos
  textos solicitados. Build local y remoto OK, 82/82 páginas; TypeScript
  remoto correcto.
- Riesgos / pendiente: validación de comportamiento simulada, sin UAT del
  editor autenticado ni verificación de ventanas reales en móviles/navegadores.
  El navegador del usuario puede bloquear pestañas; se muestra recuperación.
  No se envían documentos ni se crean facturas de prueba en Production.
- Commit funcional: `a84269f`; postflight en commit documental posterior.
  Commits locales en esta sesión.
- Publicación: `dpl_HTHzKwsigcNdnbB3yzDBUYv4yCSN`, Production `READY`.
  URL inmutable:
  `https://sarierp-gmtc3r8ib-claudherhn-5641s-projects.vercel.app`.
  Alias `sari.forwarders.app` resuelve a este despliegue. Login 200; factura
  manual 307 al login; ambas API 401 JSON sin sesión; assets OCR 200 y checksum
  del modelo correcto. No se comprobó el editor con sesión autenticada.

### 2026-10-12 - UX-071 - Título INVOICE y ancho de cuadros izquierdos

- Estado: implementado, validado visualmente en PDF real y publicado en Production.
- Hallazgo: INVOICE se imprimía con Helvetica regular; Bill to tenía 286 pt
  de ancho frente a los 271 pt del cuadro inferior de embarque, desalineando
  sus bordes derechos en la columna izquierda.
- Archivos: `src/components/pdf/manual-invoice-pdf.tsx`, esta bitácora.
  SQL: sin cambios.
- Cambios: título INVOICE en Helvetica-Bold; Bill to con 271 pt de ancho,
  igual al cuadro inferior y con el mismo margen izquierdo de 32 pt.
- Validaciones: pruebas existentes del renderer 4/4 (paginación, límites de
  campos y fechas en ambos formatos); TypeScript OK. PDF de ejemplo generado,
  rasterizado con PDF.js e inspeccionado: título en negrita y bordes izquierdos/
  derechos alineados. ESLint afectado y build local OK, 82/82 páginas.
  Build remoto y TypeScript OK, 82/82 páginas generadas.
- Riesgos / pendiente: UAT autenticada general permanece pendiente; esta
  validación comprueba la plantilla generada. No se escriben datos ni se
  envían documentos de prueba a proveedores.
- Commit funcional: `69cf257`; postflight en commit documental posterior.
  Commits locales en esta sesión.
- Publicación: `dpl_AW5RxyHrnshD6tvmjYSXVU7pk1ft`, Production `READY`.
  URL inmutable:
  `https://sarierp-miax7gtnf-claudherhn-5641s-projects.vercel.app`.
  Alias `sari.forwarders.app` confirmado en esta versión. Login 200, factura
  manual 307 al login, ambas API 401 JSON sin sesión; assets OCR 200 y checksum
  del modelo correcto. Estos checks no sustituyen el recorrido autenticado.

### 2026-10-13 - AUD-01 - Separar consulta y escritura de pricing

- Estado: implementado y validado localmente con RLS real y fixtures aislados.
  Pendientes publicación SQL/frontend, comprobación de RLS remoto y UAT por rol.
  No se declara cerrado ni se modificó Production.
- Hallazgo: las policies de pricing/tarifas usaban autorización de lectura para
  permitir escritura; los reemplazos SECURITY DEFINER podían conservar ese
  permiso amplio aun después de ajustar RLS.
- Reproducción: en `sarierp_aud01`, antes de aplicar el cambio, la suite falló
  con `ASSERTION FAILED: Ventas no debe editar venta FCL por tener lectura`.
  El UPDATE había afectado la fila; el fixture se revirtió al cerrar la sesión.
- Archivos:
  - `supabase/migrations/20261013120000_pricing_write_authorization.sql`.
  - `supabase/tests/aud01_pricing_write_permissions.sql`.
  - `supabase/tests/phase3_commercial_tenant_isolation.sql`: fixtures financieros
    escritos por Pricing en el estado requerido, conservando el test de tenant.
  - `src/lib/permissions.ts`, `src/lib/tarifa-expiry-check.ts`.
  - `src/app/(protected)/clientes/[id]/page.tsx`.
  - `tests/pricing-write-permissions.test.mjs`.
  - `docs/uat/aud01-pricing-write-permissions.md`, seguimiento en
    `docs/review-2026-10-13.md` y esta bitácora.
- SQL/cambios:
  - Doce policies restrictivas para INSERT/UPDATE/DELETE de `pricing_items`,
    `agent_quotes`, `agent_quote_container_rates` y `client_rates`. Las policies
    de SELECT, tenant y borrado físico existentes se conservan.
  - Helpers de escritura por rol, tenant, estado y ownership. Pricing general:
    Admin/Pricing en estados editables. Ventas conserva Miami propio/asignado,
    incluida la excepción del editor comercial enviado. Tarifas de cliente:
    Admin/Pricing/Ventas; agentes/contenedores: Admin/Pricing en Pendiente de
    Fijar Precios. Ganada/Perdida no admiten escritura directa de cargos.
  - `is_selected` no cambia por escritura directa: se utiliza la selección o
    aceptación atómica existente. El trigger es INVOKER y reconoce el rol real
    de ejecución de esas RPC, sin excepciones basadas en GUC del cliente.
  - Los cores de creación y reemplazo se conservan privados; los entrypoints
    mantienen firma/transacción y comprueban autorización bajo lock. Creación
    comercial FCL no acepta cargos inyectados por Ventas; creación sin estado
    usa Borrador y no reintroduce Solicitud. Aceptación de opciones conserva el
    snapshot y el cierre Ganada por Admin/Ventas.
  - Checker de vencimientos mediante RPC transaccional por tenant; no necesita
    habilitar escritura libre sobre tarifas cerradas. Avisos internos y marcador
    se confirman juntos, con idempotencia y rollback. No envía correo.
  - Tarifas del cliente en modo consulta para roles sin permiso, sin botón de
    guardado y con guard en el handler, además de la autorización SQL efectiva.
- Validaciones ejecutadas:
  - Instalación limpia de 107 migraciones en stack `sarierp_aud01`, puertos
    575xx y seed deshabilitado; versión máxima `20261013120000`. No se reseteó
    ni migró el stack de trabajo `sarierp`.
  - `aud01_pricing_write_permissions.sql`: aprobado con doce perfiles ficticios,
    dos tenants, roles autenticados, INSERT/UPDATE/DELETE, denegación de cores,
    casos positivos Miami/selección/opciones y rollback de notificaciones.
  - `phase3_commercial_tenant_isolation.sql`: aprobado con rollback.
  - `air_consolidated_agent_selection.sql`: aprobado con rollback; conservación
    de venta/cargos y cambios de tarifas aéreas.
  - `npm.cmd test`: 190/190 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
  - `npm.cmd run build`, incluido prebuild OCR: aprobado, 82/82 páginas.
  - ESLint: helpers y prueba nuevos/modificados sin infracciones; Clientes
    conserva 29 errores y 1 warning previos. Comparación programática con HEAD:
    mismos conteos por regla, sin desactivaciones globales ni nuevas infracciones.
  - DB lint del stack aislado: no reportó problemas de funciones AUD-01;
    reportó el diagnóstico existente `mail_intake_is_demo` sobre una referencia
    dinámica opcional a `is_demo_environment()`, protegida por `to_regprocedure`.
    El comando devolvió 0, pero no se presenta el lint global como libre de avisos.
  - `git diff --check`: aprobado.
- Riesgos / acciones pendientes:
  - SQL debe publicarse antes del frontend: Alertas depende de la nueva RPC.
    Guion de publicación/UAT y matriz completa en el documento citado.
  - Probar en navegador con cuentas autorizadas, incluyendo Miami propio y
    asignado, perfiles sin edición, dos empresas y aceptación/repricing.
    Las pruebas SQL locales no acreditan el estado de RLS desplegado ni UX móvil.
  - La máquina completa de transiciones y los campos financieros de la cabecera
    de cotización permanecen dentro de AUD-05; este cambio protege las cuatro
    tablas de precios y sus RPC de reemplazo/creación.
  - Suites históricas de etapas anteriores pueden expresar permisos previos;
    la nueva matriz y la suite comercial actualizada son el gate de esta entrega.
  - Conservar los guards ante fallos de integración y preparar forward-fix;
    no restaurar permisos amplios como rollback automático.
- Commit: pendiente; cambios locales sin commit, push ni despliegue.

### AUD-02 — Pagos y ajustes de proveedores atómicos, idempotentes y reversables

- Prioridad: P1. Fecha: 13/10/2026.
- Estado: implementado y validado localmente; **abierto para publicación SQL,
  verificación de RLS desplegado, conciliación legacy y UAT autenticado**.
- Archivos y SQL:
  - `supabase/migrations/20261013130000_atomic_supplier_payments.sql`.
  - `supabase/migrations/20261013131000_supplier_cancelled_document_guard.sql`:
    forward-fix separado, conserva también AP anuladas sin movimientos.
  - `supabase/tests/aud02_supplier_payments_before.sql` y
    `supabase/tests/aud02_supplier_payments.sql`.
  - `scripts/validate-aud02-concurrency.mjs`.
  - `src/lib/supplier-payables.ts`.
  - `src/app/(protected)/accounts-payable/[id]/page.tsx` y
    `src/app/(protected)/accounts-payable/page.tsx`.
  - `src/app/(protected)/suppliers/[id]/page.tsx` y
    `src/app/(protected)/reports/page.tsx`.
  - `tests/supplier-payables.test.mjs`, `tests/supplier-payment-flow.test.mjs`.
  - `docs/review-2026-10-13.md`,
    `docs/uat/aud02-supplier-payments.md` y este registro.
- Resultado:
  - Cuatro RPC por tenant y rol financiero activo/aprobado. Movimiento, estado
    de AP y auditoría quedan juntos; todas bloquean primero la cuenta principal.
    Un pago/NC no supera el saldo actualizado, y una anulación ND no crea un
    sobrepago. Moneda, monto finito/positivo con dos decimales, método y fechas
    se validan en servidor; fecha financiera usa calendario Honduras.
  - Claves UUID con payload por pago/nota; replay confirma el mismo original,
    datos distintos se rechazan, claves de pagos reversados no los reaplican.
    Clave del navegador conservada por tenant/usuario/cuenta/acción hasta
    confirmación o recuperación desde historial; doble clic bloqueado.
  - Reverso/anulación con actor, fecha y motivo; originales inmutables,
    sin borrar movimientos ni AP anuladas. AP con pagos aplicados/notas activas
    requiere resolver esos movimientos primero. Reverso legacy compatible.
  - Escritura directa de pagos cerrada por RLS; guards financieros para
    estados, notas y originales; cores privados sin EXECUTE de cliente/servicio.
    Alta AP, adjuntos y generación desde flete conservan los flujos existentes.
  - Historial del detalle sin truncado, errores recuperables y protección de
    respuestas obsoletas. Pagos reversados excluidos de sumas y reporte activo
    en los cuatro consumidores. No se reescriben importes/estados históricos al
    migrar; los pagos anteriores adquieren estado Aplicado.
- Validaciones ejecutadas:
  - Stack aislado `sarierp_aud01`: 109 migraciones, máxima `20261013131000`,
    seed deshabilitado. No se migró ni reseteó el stack principal `sarierp`.
  - Reproducción antes del SQL: sobrepago120/100 y anulación sin motivo,
    bajo rol authenticated/Finanzas, con rollback.
  - Suite `aud02_supplier_payments.sql`: aprobada con perfiles ficticios,
    dos empresas, lectura/escritura/RPC, claves repetidas/datos diferentes,
    monedas/fechas/montos inválidos, NC/ND, originales, reverso legacy,
    anulación y rollback por fallo de auditoría (alta, ajuste, reverso y anulación).
  - Cinco carreras reales en dos conexiones PostgreSQL, comprobando espera por
    lock en `pg_stat_activity`: pagos60+60, misma clave, pago60/NC60 en ambos
    órdenes y anulación/pago. Resultado: sin duplicados ni sobrepagos.
  - `phase5_finance_catalog_tenant_isolation.sql`: aprobada con rollback,
    incluida CxP de flete idempotente y cobros de facturas por tenant.
  - `npm.cmd test`: 197/197 aprobadas. Siete regresiones nuevas, incluidas
    pruebas del componente real con hooks/red simulados para doble clic,
    respuesta perdida, recuperación de historial, fallos de lectura y cambio
    de cuenta durante un guardado. No acreditan navegador/RLS por sí solas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
  - `npm.cmd run build`, incluido prebuild OCR: aprobado, 82/82 páginas.
  - ESLint afectado: detalle AP, proveedor, reportes, helper, script y pruebas
    nuevos sin infracciones. Bandeja AP conserva sus cuatro errores previos
    (tres any y un set-state-in-effect), mismos conteos por regla; sin nuevos
    errores ni desactivaciones. Detalle pasó de 9 errores/1 warning a cero.
  - DB lint local devolvió 0. Conserva el error histórico opcional de
    `mail_intake_is_demo`/`is_demo_environment()`. En AUD-02 reportó dos avisos
    de variable `v_account` no leída en reverso/anulación: su asignación ejecuta
    el helper que autoriza/bloquea AP. No se presenta DB lint como limpio.
  - `git diff --check`: aprobado, con avisos de normalización LF/CRLF.
- Riesgos / trabajo pendiente:
  - Publicar SQL antes del frontend y coordinar la ventana sin escrituras del
    frontend anterior; éste usa INSERT/UPDATE que ahora se rechazan.
  - Aplicar el guion UAT y revisar datos reales: sobrepagos, monedas/proveedores
    inconsistentes y estados legacy requieren conciliación, no saneamiento
    automático. Los guards no sustituyen la gestión de credenciales privilegiadas.
  - UAT visual, móvil, teclado y usuarios autenticados pendiente; hubo inspección
    de código y pruebas simuladas, sin navegador conectado en esta sesión.
  - `sessionStorage` bloqueado limita recuperación de la clave tras recarga
    completa; conciliar historial antes de una nueva operación. Una clave nueva
    es una operación nueva y no equivale a deduplicar comprobantes bancarios.
  - Conciliación general de NC/ND permanece en AUD-03; completitud de otras
    bandejas en AUD-04. Reporte de pagos refleja estado aplicado actual, no
    reconstrucción histórica anterior a reversos posteriores.
  - `phase4_payment_atomic.sql` histórica no superó su fixture de cliente sin
    tenant en el esquema vigente; no llegó al flujo de cobros. No se declara
    aprobada; regresión vigente de aislamiento financiero sí aprobada.
  - Fixtures de carreras tienen commit y quedan solo en el volumen de la base
    aislada. Suites principales terminan en rollback. No se enviaron correos,
    pagos bancarios ni mensajes a terceros.
  - Mantener el SQL publicado y corregir hacia adelante si aparece una incidencia;
    no restaurar permisos amplios ni borrar historial como rollback.
- Commit: pendiente; incluir este registro junto con el cambio, sin commit,
  push ni despliegue en esta sesión.

### AUD-03 — Saldos canónicos de CxP en detalle, bandeja, proveedor y reportes

- Prioridad: P1. Fecha: 13/10/2026.
- Estado: implementado y validado localmente; **abierto para publicación SQL,
  verificación RLS del ambiente destino y UAT autenticado/visual**.
- Archivos y SQL:
  - `supabase/migrations/20261013140000_supplier_payable_balances.sql`.
  - `supabase/tests/aud03_supplier_payable_balances.sql`.
  - `src/lib/supplier-payables.ts` (contrato, lectura completa, resúmenes,
    formato/anomalías y filas compartidas de tabla/CSV/PDF).
  - `src/app/(protected)/accounts-payable/page.tsx` y
    `src/app/(protected)/accounts-payable/[id]/page.tsx`.
  - `src/app/(protected)/suppliers/[id]/page.tsx` y
    `src/app/(protected)/reports/page.tsx`.
  - `tests/supplier-payable-balances.test.mjs` y
    `tests/supplier-payment-flow.test.mjs`.
  - `docs/review-2026-10-13.md`,
    `docs/uat/aud03-supplier-payable-balances.md` y este registro.
- Resultado:
  - Vista `supplier_payable_balances`, solo SELECT, INVOKER, RLS de origen,
    filtro explícito por tenant y rol financiero aprobado/activo. Una fila por
    AP principal, agregados de NC/ND activas y pagos Aplicado, sin producto
    cartesiano ni límite de embeds. No expone notas como obligaciones separadas.
  - Misma fórmula NUMERIC para lecturas y core privado de mutaciones AUD-02:
    base − NC + ND − pagos. Estado/días vencidos y pagos mensuales según
    calendario Honduras. Leer no actualiza importes ni estados históricos;
    `stored_status` queda disponible para diagnóstico.
  - Saldo negativo visible en sobrepagos; totales positivos Por pagar/Vencido
    separados de sobrepagos. Anuladas excluidas de esos KPIs, conservadas en
    Todos/reporte. Obligación negativa o movimientos inconsistentes requieren
    conciliación; importes no comparables muestran Por conciliar.
  - Proveedor con totales por cada moneda; bandeja permite monedas presentes
    además de USD/HNL. Reporte, CSV y PDF usan las mismas filas y explican qué
    incluye el total Por pagar, con sobrepagos y conciliaciones separados.
    Vencidas de CxP usa saldo y días canónicos; CxC conserva su implementación.
  - Loader común hasta agotar páginas, orden estable, filtro de proveedor en
    servidor y rechazo de respuesta parcial/repetida/obsoleta. Pantallas con
    errores recuperables y actualización explícita. Enlaces históricos a notas
    redirigen a la AP principal; historial de notas y reversos sigue accesible.
- Validaciones ejecutadas:
  - Reproducción previa con las funciones reales de bandeja transpileadas:
    base1000/NC200 devolvía1000 en vez de800; base1000/ND300/pago100 devolvía900
    en vez de1200; base100/pagos120 ocultaba el sobrepago con saldo0 en vez de-20.
  - Migración aplicada solo en `sarierp_aud01`:110 migraciones, máxima
    `20261013140000`. No se migró/reseteó el stack principal ni se desplegó.
  - `aud03_supplier_payable_balances.sql`: aprobada con rollback, once perfiles
    ficticios y dos empresas; notas anuladas, reversos, centavos, estados,
    sobrepagos, inconsistencias, lectura/autorización y equivalencia con el core.
    Una AP con1005 NC y1005 pagos verifica agregado completo sin multiplicación.
  - `aud02_supplier_payments.sql`: aprobada con rollback sobre el nuevo core.
  - `phase5_finance_catalog_tenant_isolation.sql`: aprobada con rollback.
  - Cinco carreras reales de `validate-aud02-concurrency.mjs`: aprobadas con
    el esquema nuevo y espera por lock verificada; sin duplicados/sobrepagos.
  - `npm.cmd test`:209/209 aprobadas. Doce casos nuevos en este cambio:
    saldos/resúmenes/exportación, monedas, sobrepago, nulos, centavos, lectura
    limitada50 de1301 AP, páginas fallidas/repetidas y contexto obsoleto;
    detalle canónico con historial de otra instantánea, saldo negativo, URL
    histórica de nota y fallo de la lectura canónica con historial disponible.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
  - ESLint de los cuatro consumidores, helper y pruebas afectados:0 errores,
    0 warnings. Bandeja pasa de sus cuatro errores históricos a cero; sin
    desactivaciones de reglas ni reescrituras generales.
  - `npm.cmd run build`, incluido prebuild OCR: aprobado después del último
    cambio de código,82/82 páginas.
  - `git diff --check`: aprobado, con avisos LF/CRLF; archivos nuevos revisados
    también sin espacios al final de línea ni ausencia de newline final.
  - DB lint local devolvió0; no reportó problemas del core redefinido de AUD-03.
    Mantiene el error histórico opcional de `mail_intake_is_demo` sobre
    `is_demo_environment()` y los dos avisos de variables no leídas de AUD-02.
    No se presenta el lint global de base como limpio.
- Riesgos / trabajo pendiente:
  - Aplicar SQL antes del frontend, con el historial AUD-01/AUD-02 pendiente
    en orden. La nueva versión del frontend depende de la vista.
  - Validar RLS remoto y UAT con los mismos filtros/moneda/período en las cuatro
    vistas; el reporte mensual inicial tiene otro alcance que la bandeja completa.
  - Inspección visual de móvil, teclado, CSV/PDF e impresión pendiente; se
    inspeccionó código y se ejecutaron pruebas SQL y de hooks/red simulados.
    No hubo un navegador conectado para este cambio.
  - Datos legacy inconsistentes requieren conciliación de Finanzas, sin borrar
    originales ni forzar importes a cero. La migración no sanea esos documentos.
    El guion incluye revisión de pagos asignados a notas y jerarquías huérfanas:
    la vista no reasigna esos movimientos históricos ni los interpreta como
    pagos directos de una AP. AUD-02 impide nuevas altas de ese tipo.
  - Cada consulta tiene su instantánea: actualizar pantallas sin escrituras
    simultáneas al comparar. No se reconstruyen cierres históricos ni tasas FX.
    Pagado este mes refleja pagos actualmente aplicados del mes de Honduras.
  - Completitud de CxP resuelta en estos consumidores; AUD-04 mantiene el alcance
    sobre facturación, histórico, Miami y otras consultas del informe.
  - Fixtures de concurrencia retenidos solo en el volumen aislado; suites SQL
    principales con rollback. Sin correos, pagos bancarios ni datos productivos.
- Commit: pendiente; cambios locales sin commit, push ni despliegue. Incluir
  este registro y el guion de UAT junto con la implementación.

### AUD-04 — Lecturas completas y acceso paginado a documentos antiguos

- Prioridad: P1. Fecha: 13/10/2026.
- Estado: implementado y validado localmente; **abierto para publicación y UAT
  autenticado/visual, con verificación de límites y permisos del ambiente destino**.
- Archivos y SQL:
  - `src/lib/report-query.ts`: paginación de relaciones en grupos acotados de IDs.
  - `src/lib/invoice-list.ts`, `src/lib/history-quotations.ts`,
    `src/lib/miami-reads.ts`: loaders completos por caso de uso.
  - `src/lib/alerts.ts`: fuentes completas, incluidas relaciones y readiness RPC.
  - `src/lib/postgrest-search.ts` y `src/lib/portal.ts`: extracción y reutilización
    del escape literal existente del portal, sin cambiar su comportamiento.
  - `src/lib/manual-invoice-history.ts`: contrato/merge de páginas manuales.
  - `src/app/(protected)/invoicing/page.tsx`,
    `src/app/(protected)/historico/page.tsx`,
    `src/app/(protected)/miami/inventario/page.tsx`,
    `src/app/(protected)/miami/embarques/page.tsx`,
    `src/app/(protected)/alerts/page.tsx`.
  - `src/components/layout/topbar.tsx`,
    `src/components/invoicing/ManualInvoiceEditor.tsx`,
    `src/app/api/manual-invoices/route.ts`.
  - `tests/complete-reads.test.mjs`, `tests/manual-invoice-history.test.mjs`,
    `tests/complete-read-pages.test.mjs`, `tests/paged-client.mjs`,
    `tests/page-harness.mjs`.
  - `docs/review-2026-10-13.md`, `docs/uat/aud04-complete-queries.md` y este registro.
  - SQL modificado: ninguno. No se modifican políticas, permisos, RPC ni tablas.
- Resultado:
  - Facturas, saldos y cobros se leen completos y se asocian por ID. La falta de
    saldo de una factura activa o de cabecera correspondiente exige recargar;
    no se interpreta como cero. Cierre/estado de cuenta conservan sus fórmulas,
    monedas y tratamiento de reversos, sobre conjuntos completos.
  - Cola por facturar paginada por quotation_id; si falla, se muestra un error
    independiente y no se publica una cola parcial. Documentos financieros
    cargados correctamente pueden consultarse sin afirmar que la cola está vacía.
  - Histórico completo con vigencias, contenedores y carga suelta; inventario
    completo con documentos e historial del paquete. No se usan embeds limitados
    como si fueran la totalidad de las líneas.
  - Embarques sin topes ocultos de 500 paquetes/10 despachos: ambas tablas
    paginadas visualmente. Selección, peso, impresión y payload de despacho
    conservan todos los seleccionados al cambiar página/filtro. RPC existente
    conservada; no se introduce escritura alternativa ni despacho de prueba real.
  - Alertas completas por rol/propiedad, incluidas sus líneas, documentos,
    revisiones y RPC readiness. Centro/campana distinguen fallos de ausencia de
    alertas y permiten reintentar; respuestas obsoletas descartadas.
  - Manuales: API con offset/tamaño validado, conteo real, siguiente offset
    según filas recibidas y búsqueda literal por número/cliente. UI Cargar más,
    sin cortar versiones antiguas a 100, con recuperación ante páginas repetidas
    o metadatos inconsistentes. Guardar sigue creando versiones independientes;
    no se integra este documento al libro contable ni se altera OCR/PDF.
  - Se reutiliza readAllReportRows. Filtros de relaciones de hasta 100 IDs por
    petición, cada uno con todas sus páginas. Errores y cambios de contexto no
    publican totales/colecciones parciales como resultados completos.
- Validaciones ejecutadas:
  - GET real de HEAD frente a fixture de 1,301 documentos, servidor limitado a
    50: devolvía 50 sin acceso a otra página. GET corregido devuelve 25 visibles,
    total 1,301 y continuidad de páginas; sin datos ni peticiones productivas.
  - 18 regresiones nuevas: nueve de loaders/relaciones/RPC, cinco del contrato
    y API de historial y cuatro de componentes reales con hooks/red simulados.
    Incluyen 1,301 cabeceras/saldos, 2,602 cobros, 1,101 filas de cola, 1,005
    líneas/documentos, historial antiguo, fallos posteriores y contexto obsoleto.
  - Componentes: navegación al registro 1,301 del histórico; error/reintento de
    facturación sin exportación parcial; búsqueda/carga de versiones manuales
    antiguas y ausencia de coincidencias; selección entre páginas/filtros Miami
    con peso y payload completos. La RPC de despacho de esta prueba es simulada.
  - Autorización manual existente conservada en tests: tenant/host/rol/perfil;
    la búsqueda no sustituye el filtro explícito de tenant. Se verifica escape
    de comillas/comas/%/_/barras y equivalencia con el filtro previo del portal.
  - `npm.cmd test`: 227/227 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
  - `npm.cmd run build`, incluido prebuild OCR: aprobado, 82/82 páginas.
  - ESLint: archivos nuevos, helpers, facturación, inventario, alertas, campana,
    API/editor manual y portal sin infracciones. Histórico conserva 7 errores
    any y 2 warnings de helpers no usados; Embarques conserva 7 errores y 1 warning
    previos. Total afectado: 14 errores/3 warnings, frente a 18/4 antes.
    Comparación por archivo/regla sin hallazgos nuevos ni reglas desactivadas.
- Riesgos / trabajo pendiente:
  - UAT en staging con perfiles autenticados de los roles/tenants pertinentes:
    orden/rangos reales de PostgREST y RPC, documentos Storage y selección de
    carga. No se certifica RLS desplegado mediante los clientes simulados.
  - Revisión visual móvil/teclado, impresión/PDF y tiempos de respuesta pendiente;
    hubo inspección de código y pruebas de flujo simuladas, sin navegador conectado.
  - Lecturas completas para filtros/KPIs/exportaciones aumentan red/memoria.
    Medir volúmenes reales; evolucionar a agregados/búsqueda de servidor si es
    necesario, sin restaurar límites silenciosos. No garantiza coste constante
    para volúmenes arbitrarios. API manual permanece explícitamente paginada.
  - Las páginas no forman una única instantánea transaccional. Duplicados o
    desajustes detectados exigen actualizar; una inserción concurrente puede
    desplazar páginas por offset en el historial manual. No se afirma aislamiento
    de snapshot entre peticiones ni reconstrucción histórica de saldos.
  - Publicar frontend/API juntos y actualizar pestañas anteriores. AUD-04 no
    requiere SQL nuevo; el worktree completo sigue dependiendo de las migraciones
    AUD-01/02/03 pendientes del ambiente destino antes de desplegar ese frontend.
  - Sin cambios al stack principal/aislado de Supabase en esta etapa, ni correos,
    pagos bancarios, OCR de proveedor o despachos reales enviados como prueba.
    Alcance: consultas del hallazgo y relaciones necesarias; no todas las
    consultas de la aplicación. CxP quedó cubierto en AUD-03.
- Commit: pendiente; cambios locales sin commit, push ni despliegue. Incluir
  este registro y el guion UAT junto con la implementación.

### AUD-05 — Transiciones e historial atómicos de cotizaciones (14/10/2026)

- Prioridad: P1, integridad de flujo y auditoría.
- Estado: implementado y validado localmente; abierto para publicar SQL/frontend,
  revisar repricing legado y ejecutar UAT autenticado en el ambiente destino.
- Archivos:
  - `src/lib/quotation-status.ts` y `src/lib/quotation-transition.ts`.
  - `src/app/(protected)/quotations/[id]/page.tsx` y `edit/page.tsx`.
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - `tests/quotation-transition.test.mjs`.
  - `scripts/validate-aud05-concurrency.mjs`.
  - `supabase/tests/aud05_quotation_transitions_before.sql` y `aud05_quotation_transitions.sql`.
  - `supabase/tests/aud01_pricing_write_permissions.sql`, `quotation_commercial_options.sql`
    e `integral_ux_flow_fixes.sql`: contratos versionados y fixtures explícitos de
    tenant/datos comerciales; conservan comprobaciones de permisos/snapshots/operación.
  - `docs/uat/aud05-quotation-transitions.md` y `docs/review-2026-10-13.md`.
- SQL nuevo, en orden:
  - `20261014120000_atomic_quotation_transitions.sql`.
  - `20261014121000_quotation_transition_entry_guards.sql`.
  - `20261014122000_quotation_conflict_http_status.sql`.
- Corrección:
  - RPC de transición con lock, tenant/perfil/rol y estado/revisión esperados.
    Estado, flags de aprobación, pérdida/motivo, historial y auditoría básica
    se confirman o revierten juntos. Reaprobación también aumenta la revisión.
  - Guard INVOKER rechaza escrituras directas de estado/aprobación/revisión;
    el cliente no puede insertar/borrar/modificar/truncar historial. No se usan
    GUC de cliente como excepción de autorización. Creación conserva los estados
    iniciales actuales y el pricing automático Miami; bloquea terminales/legacy.
  - La aprobación toma totales netos de líneas persistidas activas; no cambia
    facturas emitidas ni snapshots ofrecidos. Repricing ganado puede sincronizar
    operaciones dentro de la misma transacción usando la RPC operativa vigente.
  - Opciones conservan sus cuerpos canónicos de publicación, aceptación y
    propagación, bajo entradas versionadas. El editor sigue INVOKER/RLS y llama
    a la transición dentro de su transacción; no duplica inserts de historial.
  - Marcador de retorno a Ganada en reaperturas ganadas; las reaperturas anteriores
    a la venta no cierran como ganadas por logs antiguos u operaciones. Backfill
    conservador solo cuando la última transición histórica demuestra el origen.
  - Conflictos deliberados usan PT409: PostgREST reintentaba 40001 hasta HTTP 504.
    El contrato final devuelve HTTP 409 inmediatamente, comprobado por API local.
- Validaciones ejecutadas:
  - Antes: Ventas aprobó por UPDATE y no se generó historial de transición.
    Fixture ficticio, base aislada y rollback.
  - SQL AUD-05 aprobado: creación, escrituras directas, roles/perfil/tenant,
    estado/revisión obsoletos, regreso al mismo estado, reaprobación, razón Otra,
    repricing, editor y rollback de motivo/estado/historial por fallo de auditoría.
    Fallo real de sincronización también revierte aprobación e historial.
  - Regresiones SQL AUD-01, opciones comerciales y editor integral aprobadas.
  - Cuatro carreras reales entre dos conexiones, comprobando espera por lock:
    doble solicitud, regreso a Ganada, aprobación contra pérdida y reaprobación.
    La segunda revisión obsoleta se rechaza; no duplica historial ni sobrescribe.
  - API PostgREST local autenticada: RPC 200 con objeto/revisión persistida,
    UPDATE directo 403/42501, conflicto 409/PT409, historial único visible por RLS.
  - Seis regresiones Node nuevas; suite completa 233/233 aprobada.
  - `npx.cmd tsc --noEmit` aprobado después del último cambio TypeScript.
  - `npm.cmd run build` aprobado, incluido prebuild OCR y 82/82 páginas.
  - Helpers, test y script nuevo con lint limpio. Pantallas afectadas conservan
    44 errores y 7 warnings previos (antes 45/7), sin nuevas infracciones por regla.
  - `db lint` del esquema público no reporta errores AUD-05. Reporta referencia
    opcional preexistente en `mail_intake_is_demo` a `is_demo_environment()`; está
    protegida por `to_regprocedure`. Invocación real local devuelve false sin error.
  - `git diff --check` aprobado; advertencias de normalización LF/CRLF existentes.
- Riesgos / trabajo pendiente:
  - Aplicar las tres migraciones y publicar frontend coordinadamente, después
    del SQL anterior requerido por el worktree. Actualizar pestañas antiguas y
    consumidores de RPC sin revisión. Sin SQL, commit, push ni despliegue remoto.
  - Revisar reaperturas legacy pendientes sin evidencia suficiente para el
    marcador de retorno. No fabricar historial ni inferir una venta ganada.
  - UAT autenticado/RLS del ambiente destino, PDF, timeline, móvil y teclado
    pendientes; hubo SQL/API local y pruebas Node, sin navegador conectado.
  - `status_revision` versiona estados/aprobación, no contactos, tarifas ni todas
    las líneas. Las ediciones previas de tarifas conservan sus escrituras/RPC
    independientes; no se afirma una transacción global de edición de pricing.
  - Notificaciones y snapshots adicionales del cliente siguen posteriores al
    commit; su fallo no elimina la auditoría básica atómica del servidor.
  - Stack usado: `sarierp_aud01`, 113 migraciones. SQL de flujo con rollback;
    concurrencia/API dejaron datos ficticios en su volumen aislado. Docker reanudó
    automáticamente contenedores principales existentes al arrancar; no se aplicó
    SQL ni se escribieron datos de negocio en ese stack. Sin correos, pagos,
    OCR externo o despachos reales. Parada del stack aislado conservando volúmenes.
- Commit: pendiente; incluir este registro y el guion UAT con la implementación.

### AUD-06 — Asignación Miami sin sobrescritura concurrente (14/10/2026)

- Prioridad: P1, bodega/concurrencia e integridad del flujo.
- Estado: implementado y validado localmente; abierto para publicación,
  regularización administrativa del legado y UAT del ambiente destino.
- Archivos:
  - `src/lib/miami-assignment.ts`.
  - `src/app/(protected)/miami/manifiestos/[id]/page.tsx`.
  - `src/app/(protected)/miami/ingreso/page.tsx`.
  - `tests/miami-assignment.test.mjs`.
  - `scripts/validate-aud06-concurrency.mjs`.
  - `supabase/tests/aud06_miami_assignment_before.sql`.
  - `supabase/tests/aud06_miami_assignment.sql`.
  - `docs/uat/aud06-miami-package-assignment.md` y `docs/review-2026-10-13.md`.
- SQL nuevo: `20261014130000_atomic_miami_package_assignment.sql`.
- Corrección:
  - Asignación inicial por RPC con locks manifiesto → paquete, permiso de
    Admin/Operaciones aprobado/activo, tenant y cliente disponibles, manifiesto
    esperado y estado de carga recibido sin despacho. Manifiestos cerrados
    conservan asignación de paquetes disponibles; no reabre el escaneo.
  - Paquete/cliente, WH, fecha/actor, evento `assignment`, actividad y avisos
    del portal se guardan juntos. Errores revierten también la reserva del WH.
    El segundo operador recibe PT409/HTTP 409 sin sobrescribir ni notificar.
  - Guard INVOKER impide asignar/modificar ownership directamente desde
    authenticated, incluso Admin, y protege los eventos de asignación. El core
    privado no está expuesto a authenticated/anon/service_role.
  - Ingreso y asignación opcional en una RPC. Cliente explícito prevalece sin
    consumir una prealerta de otro cliente. Matching posterior a INSERT, por
    tenant/tracking y prealerta pendiente con lock/SKIP LOCKED; devuelve el estado
    final, estampa actor y no consume la misma prealerta dos veces.
  - Avisos del portal generados por servidor para perfiles Cliente aprobados
    y activos del tenant; resuelve la inserción/lectura fallida de perfiles que
    el handler anterior de Operaciones ignoraba. No hay envío externo en SQL.
  - Las pantallas usan resultados persistidos, bloquean doble clic, muestran
    conflicto/error, conservan tracking ante fallos y solicitan correo únicamente
    tras confirmar asignación. Se descartan respuestas del contexto desmontado.
    Lista de manifiesto con lecturas completas, error y reintento; sin nueva librería.
- Validaciones ejecutadas:
  - Antes: dos identidades ficticias sobrescribieron cliente/WH por ID y no
    generaron evento. Reproducción con rollback en la base aislada.
  - Trigger anterior de prealertas restaurado temporalmente en una transacción
    local: falló con FK 23503 al referenciar el paquete en BEFORE INSERT. Rollback
    restauró el trigger actual; la versión AFTER INSERT pasó los casos SQL/API.
  - SQL de flujo aprobado: ingreso simple/cliente/prealerta, escaneo, asignación,
    repetición, manifiesto esperado/cerrado, roles/perfil/tenant, cliente eliminado,
    carga procesada, ACL del core y RLS del portal. Fallos de evento/aviso revierten
    paquete, contador WH y trazas.
  - Cuatro carreras reales entre dos conexiones: clientes distintos, mismo
    cliente, asignación contra eliminación de manifiesto y consumo de prealerta.
    Las tres primeras comprobaron espera real por lock; la cuarta SKIP LOCKED.
    Un owner/WH/evento y cero avisos para el cliente de la asignación descartada.
  - PostgREST local autenticado: UPDATE directo 403/42501, asignación 200 con
    objeto completo, repetición 409/PT409, evento único, aviso leído mediante RLS
    por el Cliente y retorno autoasignado después del trigger de ingreso.
  - Nueve regresiones Node nuevas: cuatro de contrato y cinco de componentes
    reales con hooks/red simulados. No invocan correo real ni crean despachos.
  - `npm.cmd test`: 242/242 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio TypeScript.
  - `npm.cmd run build`: aprobado, incluido prebuild OCR y 82/82 páginas.
  - Helper, test y script nuevo con lint limpio. Pantallas conservan 7 errores
    y 0 warnings previos, frente a 10/2 antes; sin infracciones nuevas por regla.
  - `db lint` no reporta errores AUD-06. Conserva referencia estática previa
    de `mail_intake_is_demo` a helper opcional protegido por `to_regprocedure`.
  - `git diff --check` aprobado; advertencias LF/CRLF de normalización existentes.
- Riesgos / trabajo pendiente:
  - Aplicar migración y publicar Ingreso/Manifiesto coordinadamente, junto al
    SQL anterior necesario para el worktree. Recargar pestañas y revisar otros
    consumidores que escriban asignaciones directamente. Sin SQL remoto/deploy.
  - Revisar paquetes legacy incoherentes con el SELECT del guion UAT. Cliente
    precargado sin WH/actor/fecha puede completarse solo para ese mismo cliente;
    otros casos necesitan Administración. No se inventa historial anterior.
  - Corregir ownership confirmado requiere mantenimiento administrativo revisado
    con motivo/actor/valores esperados/trazas, preservando WH y reconciliando
    prealertas, documentos/Storage, despachos y avisos. Asignar no es una herramienta
    general de reasignación; no se corrigieron datos existentes de negocio.
  - Correo posterior al commit: fallo o cierre de vista puede dejar aviso pendiente
    de reintento desde Inventario. AUD-07 conserva la revisión del ambiente de
    correo. No se garantiza idempotencia nueva del ingreso manual por tracking;
    tras una respuesta perdida revisar Inventario antes de repetir.
  - UAT autenticado/RLS del ambiente destino, móvil/teclado y revisión visual
    pendientes; hubo SQL/API local y componentes simulados, sin navegador conectado.
    Medir red/memoria de manifiestos grandes al retirar su límite implícito.
  - Base aislada `sarierp_aud01`, 114 migraciones; fixtures de SQL revertidos,
    fixtures de concurrencia/API conservados en su volumen. Stack principal
    sin modificaciones. Sin correos, pagos, OCR externo ni despachos reales.
    Parada del stack aislado conservando volúmenes.
- Commit: pendiente; cambios locales sin commit/push. Incluir registro y guion UAT.

## AUD-07 — Bloquear correo ante ambiente no verificable (14/10/2026)

- Prioridad: P1.
- Estado: implementado y validado localmente; abierto hasta publicación,
  verificación de configuración/permisos y UAT del ambiente destino.
- Archivos modificados:
  - `src/lib/server/email-environment.ts` (nuevo).
  - `src/app/api/miami/package-assignment-email/route.ts`.
  - `src/app/api/support/notify/route.ts`.
  - `src/lib/server/outlook-intake.ts`.
  - `tests/email-route-fixture.mjs` y `tests/email-environment.test.mjs` (nuevos),
    `tests/email-notifications.test.mjs`.
  - `docs/uat/aud07-email-environment.md`, `docs/support-ticketing-runbook.md`,
    `docs/review-2026-10-13.md` y este registro.
- SQL modificado: ninguno. No se aplicaron migraciones ni cambios de RLS.
- Corrección:
  - Guard común exige una lectura correcta de `platform_environment`, fila
    singleton y valor exacto `demo` o `production`. Error, excepción, ausencia
    o valor inválido bloquean el correo con error tipado; sin caché entre solicitudes.
  - `APP_ENV` y `NEXT_PUBLIC_APP_ENV` en Demo vetan el envío incluso si falla
    la base. No habilitan producción como fallback. Miami y Soporte conservan
    sus respuestas Demo; ambiente desconocido devuelve 503 antes del proveedor,
    reserva del envío o escritura de auditoría. Conservan autorización y opt-in
    exacto `OUTBOUND_EMAIL_ENABLED=true` para producción verificada.
  - Outlook reutiliza el guard y conserva el veto de su RPC legacy: error o
    resultado no booleano bloquean. `OUTLOOK_INTAKE_STANDBY` permanece activo.
    Las pruebas habilitan esa rama solamente mediante mocks.
- Validaciones ejecutadas:
  - Reproducción sobre copias de ambos handlers anteriores: una lectura fallida
    del ambiente todavía llamaba al proveedor una vez. Proveedor simulado,
    rechazo 502; sin correo real.
  - 14 regresiones nuevas: ambientes inválidos/ausentes, errores/excepciones,
    Demo, producción con opt-in exacto, autenticación/perfiles y Outlook.
    Casos bloqueados sin llamada al proveedor, reserva ni actualización de envío;
    mocks restauran variables y fetch al finalizar.
  - Suite focalizada: 29/29 aprobadas. `npm.cmd test`: 256/256 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
  - `npm.cmd run build`: aprobado, incluido prebuild OCR y 82/82 páginas.
  - ESLint de los siete archivos de código/pruebas afectados: 0 errores y
    0 warnings. `git diff --check`: aprobado.
- Riesgos / trabajo pendiente:
  - Publicar y ejecutar el guion UAT. Verificar en destino la fila singleton,
    su ambiente real y acceso del servidor a `platform_environment`. Las
    migraciones actuales no crean esa tabla; si falta, el correo queda bloqueado.
    Resolver su configuración mediante un cambio revisado; no copiar SQL exclusivo
    de Demo ni asumir producción por ausencia de datos.
  - Una instalación que antes ignoraba errores de esa lectura puede dejar de
    enviar hasta corregir la configuración. Un fallo de correo posterior a una
    operación persistida no revierte dicha operación; revisar antes de repetirla.
  - Las pruebas simuladas no certifican permisos/RLS remotos ni entrega real.
    No hubo llamadas a Microsoft, proveedores de correo u OCR externo, ni cambios
    en Docker o bases de negocio. El plan Trial de un tenant no determina el
    ambiente global. La comprobación es por solicitud, no un lock entre cambio
    de ambiente y llamada al proveedor.
  - AUD-08 sigue pendiente: envíos atascados en processing y conciliación de
    respuestas inciertas. No se cambiaron políticas de reintento en esta etapa.
- Commit: pendiente; cambios locales sin commit/push. Incluir este registro y
  el guion UAT en el mismo commit de la corrección.

### AUD-08 — Recuperar y conciliar correo con resultado incierto (14/10/2026)

- Prioridad: P1.
- Estado: implementado y validado localmente; abierto para aplicar SQL, publicar,
  verificar permisos del destino y ejecutar UAT. Sin despliegue remoto.
- Archivos modificados:
  - `src/lib/server/email-delivery.ts` (nuevo).
  - `src/app/api/miami/package-assignment-email/route.ts` y
    `src/app/api/support/notify/route.ts`.
  - `tests/email-delivery.test.mjs` (nuevo), `tests/email-route-fixture.mjs` y
    `tests/email-notifications.test.mjs`.
  - `scripts/validate-aud08-email-recovery.mjs` (nuevo).
  - `docs/uat/aud08-email-recovery.md` (nuevo),
    `docs/support-ticketing-runbook.md`, `docs/review-2026-10-13.md` y este registro.
- SQL nuevo:
  - `supabase/migrations/20261014140000_email_delivery_reconciliation.sql`.
  - `supabase/migrations/20261014141000_email_delivery_credential_guard.sql`.
  - `supabase/migrations/20261014142000_email_reconciliation_actor_guard.sql`.
  - `supabase/tests/aud08_email_delivery.sql`.
- Corrección:
  - Helper común reserva después de los controles existentes de rol/perfil,
    recurso, tenant, ambiente y opt-in. Processing activo devuelve 409/inProgress,
    no alreadySent. Sent exige ID persistido; sent sin ID pasa a uncertain.
  - Guarda JSON exacto, destinatario, clave de idempotencia, primer intento,
    hash de credencial y token de lease antes del proveedor. Repite solo el
    snapshot original dentro de 23 horas, con margen para timeout; no renueva
    la ventana. Respeta cinco intentos, reserva única y CAS por estado/revisión.
  - Timeout de 20 segundos incluye cuerpo y abort; red/200 sin ID/409/5xx dejan
    uncertain. Aceptación con fallo de auditoría nunca confirma envío al usuario.
    Cierre condicionado por token impide sobrescritura de una solicitud tardía.
  - Legacy sin snapshot, ventana vencida o credencial distinta no se reenvía.
    Un cambio de credencial podría cambiar la cuenta donde vive la idempotencia.
  - RPC de mantenimiento solo service_role: Admin activo/aprobado del tenant
    para Miami o plataforma para Soporte. Roles null fallan cerrados. Exige
    versión y evidencia, bloquea lease activo y persiste conciliación/historial
    atómicamente. Aceptado exige ID; no aceptado habilita un nuevo snapshot/clave
    sin reiniciar intentos. Un ID ya conocido impide habilitar otro envío.
  - SELECT del navegador conserva metadatos/RLS pero no cuerpo, hash ni tokens.
    Evidencia solo SELECT/INSERT para service_role; sin UPDATE/DELETE de ese rol.
    Outlook continúa en standby. Sin nuevos workers, cron o librerías.
- Validaciones ejecutadas:
  - Antes: ambas rutas reales respondieron alreadySent a una fila processing
    antigua; cero llamadas de recuperación. Fixtures/proveedor simulados.
  - 18 regresiones nuevas con handlers reales, SDK y timers simulados: lease,
    replay congelado, expiración antes/después de reservar, credencial, errores
    de DB/red/cuerpo, pérdida de CAS/token, auditoría fallida y límite de intentos.
  - `npm.cmd test`: 274/274 aprobadas. `npx.cmd tsc --noEmit`: aprobado.
  - `npm.cmd run build`: aprobado; prebuild OCR y 82/82 páginas.
  - ESLint de siete archivos de código/pruebas/script: 0 errores y 0 warnings.
  - Tres migraciones aplicadas solo a sarierp_aud01. Guion SQL con rollback:
    ACL/RLS de tenant/columnas, actor ajeno/inactivo de estado/sin rol, conflicto,
    lease activo, provider ID conocido y reversión por fallo de evidencia.
  - PostgREST aislado con Supabase SDK real, dos lecturas del mismo estado en
    paralelo: inserción única y recuperación CAS en ambas tablas, escritor
    tardío y fallo real del UPDATE final seguido de recuperación. Un correo
    aceptado por proveedor simulado; snapshots/clave idénticos y contador correcto.
    Fixtures de ese script eliminados al terminar.
  - Lint SQL sin errores AUD-08; conserva error previo de mail_intake_is_demo
    por helper opcional is_demo_environment y dos variables previas sin uso
    en funciones financieras. No se declara aprobado el lint global.
  - `git diff --check` y revisión de whitespace/UTF-8 de archivos nuevos aprobados.
- Riesgos / trabajo pendiente:
  - Aplicar las tres migraciones y publicar helper/rutas coordinadamente.
    Verificar fuente de ambiente AUD-07 y ACL/RLS en destino. No rellenar ni
    reiniciar auditorías legacy. No volver a handlers antiguos que ignoran uncertain.
  - UAT autenticado/visual y entrega del proveedor pendientes. Suite simulada y
    SQL/API aislados no certifican permisos remotos. No hubo correos, Microsoft,
    OCR externo, pagos ni despachos reales; base principal sin modificaciones.
  - Recuperación a demanda del mismo evento, sin worker automático. La revisión
    de Soporte conserva eventType/messageId originales; una revisión posterior
    del ticket no recupera un aviso anterior. Diagnóstico y conciliación están
    documentados en el guion UAT; desconocido nunca equivale a no aceptado.
  - Verificar logs/ID/destinatario/evento antes de conciliación manual. La RPC
    requiere mantenimiento coordinado: antes de autorizar nueva clave por no
    aceptación, terminar/cancelar las solicitudes anteriores de todas las
    instancias. Un lease vencido no prueba que un proceso pausado terminó.
    Sin esa comprobación, conservar uncertain y escalar.
  - La RPC
    almacena evidencia declarada por mantenimiento confiable, no consulta Resend
    ni prueba por sí sola que la evidencia sea verdadera. Sent significa aceptado,
    no entregado. No forzar nuevo intento por rebote o ausencia de una búsqueda.
  - Relojes sincronizados y mantenimiento coordinado. No hay garantía de entrega
    exactamente una vez ante pausas arbitrarias que crucen las 24 horas del
    proveedor; abortar tampoco revierte una aceptación externa. Rotación de
    credencial requiere revisión, incluso si continúa en la misma cuenta.
  - Revisar consumidores externos que hagan SELECT * como authenticated;
    los consumidores actuales de las tablas de entrega son handlers de servidor.
  - Stack aislado con 117 migraciones, detenido conservando volúmenes. AUD-09
    queda siguiente: no presentar fallos de consulta como cero/listas vacías.
- Commit: pendiente; cambios locales sin commit/push. Incluir este registro,
  SQL y procedimiento UAT en el mismo commit de la corrección.

### AUD-09 — No presentar errores de consulta como cero registros (14/10/2026)

- Prioridad: P2.
- Estado: implementado y validado localmente; abierto para publicación y UAT
  visual/autenticado y permisos del ambiente destino.
- Archivos modificados:
  - `src/lib/miami-dashboard.ts` (nuevo).
  - `src/app/(protected)/miami/page.tsx` y `src/components/layout/topbar.tsx`.
  - `tests/read-error-fixture.mjs`, `tests/read-error-states.test.mjs` (nuevos),
    `tests/page-harness.mjs` y `tests/supplier-payment-flow.test.mjs`.
  - `docs/uat/aud09-read-errors.md` (nuevo), `docs/review-2026-10-13.md` y este registro.
- SQL modificado: ninguno. Sin cambios en RLS, RPCs, esquema o datos financieros.
- Corrección:
  - Miami comprueba error en las seis respuestas, counts enteros no negativos y
    listas válidas. Count/lista null no equivale a cero/vacío. Publica una lectura
    completa en UI; un fallo de subconsulta no mezcla KPIs nuevos y listas viejas.
  - Error inicial sin KPIs ni listas vacías exitosas; reintento visible. Al
    actualizar, conserva datos del mismo contexto con etiqueta de desactualización.
    Un vacío anterior usa texto histórico, no afirma que todo esté asignado ahora.
    Botones de actualización/reintento con clases existentes y sin nuevas librerías.
  - Reutiliza canAccessPath y requiere identidad/perfil, aprobación, actividad,
    tenant y permiso Miami. Añade tenant explícito a las seis consultas y oculta
    snapshot ajeno inmediatamente. Versionado descarta respuestas reemplazadas
    o posteriores al desmontaje. RLS sigue siendo la autorización de la base.
  - Campana conserva lectura, badge y vistos ante error. Indicador cerrado y
    aviso dentro del dropdown; vacío anterior se etiqueta como histórico.
    Actualización/reintento y contexto de usuario/tenant/rol/perfil; no consulta
    sin permiso o en transición de sesión. Abrir cache durante fallo/carga no
    marca vistos. Respuestas tardías no cambian lista ni persistencia de vistos.
  - Detalle CxP ya bloqueaba lecturas parciales desde AUD-02/03/04. Se amplían
    sus regresiones sin modificar la pantalla financiera ni recalcular importes:
    cuenta/saldo/pagos/ajustes deben cargar correctamente antes de mostrar datos
    o permitir acciones. Una actualización fallida conserva el bloqueo.
- Validaciones ejecutadas:
  - Antes: dashboard real con seis errores simulados mostraba KPIs cero y
    estados vacíos exitosos. Campana real perdía su lista al fallar una recarga.
  - Once regresiones nuevas: nueve para dashboard/helper/campana y dos CxP.
    Errores por subconsulta, respuestas incompletas, cero válido, recuperación,
    preservación del snapshot/vistos, cambio de identidad/rol/tenant, perfil
    inválido, respuestas fuera de orden y desmontaje. Harness admite props.
  - Suite focalizada 19/19; suite total `npm.cmd test`: 285/285 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio TypeScript.
  - `npm.cmd run build`: aprobado, incluido prebuild OCR y 82/82 páginas.
  - ESLint de siete archivos afectados: 0 errores y 0 warnings.
  - `git diff --check` y revisión de UTF-8/whitespace de archivos nuevos aprobados.
- Riesgos / trabajo pendiente:
  - Publicar pantallas/helper y ejecutar `docs/uat/aud09-read-errors.md` en
    destino. Verificar permisos/RLS y dependencias financieras previas. No hay
    navegador conectado; mocks no certifican móvil, foco, modo oscuro o RLS remoto.
  - Son seis lecturas de Miami independientes, no un snapshot transaccional
    de SQL. Se evita la mezcla parcial por fallo, no los cambios concurrentes
    de negocio entre consultas. Se mantienen previews de 10 manifiestos/15
    paquetes con counts exactos; no se presenta un listado limitado como completo.
  - Los datos anteriores se conservan en memoria y se etiquetan como desactualizados;
    completar una consulta antes de utilizarlos como información vigente. CxP
    conserva el bloqueo total para no operar sobre un saldo anterior/parcial.
  - La frontera UTC de hoy y fechas anteriores se conservan hasta AUD-10; no
    cambiar reglas de calendario dentro de este fix de errores de lectura.
  - Sin correos, pagos, ajustes, OCR externo ni despachos reales; sin cambios
    en Docker, bases de negocio, SQL remoto o despliegues. Sin modificación
    de los fixes locales previos. AUD-10 queda siguiente.
- Commit: pendiente; cambios locales sin commit/push. Incluir registro y guion
  UAT en el mismo commit de la corrección.

### AUD-10 — Calendario de Miami, CxP e Histórico (14/10/2026)

- Prioridad: P2.
- Estado: implementado y validado localmente; abierto para publicación y UAT
  visual/autenticado del ambiente destino.
- Archivos modificados:
  - `src/lib/format.ts` y `src/lib/miami-dashboard.ts`.
  - `src/app/(protected)/miami/page.tsx` y `src/app/(protected)/historico/page.tsx`.
  - `tests/calendar-flows.test.mjs` (nuevo), `tests/read-error-fixture.mjs` y
    `tests/supplier-payment-flow.test.mjs`.
  - `docs/uat/aud10-calendar-timezones.md` (nuevo),
    `docs/review-2026-10-13.md` y este registro.
- SQL modificado: ninguno. CxP ya usa fecha Honduras y vencimiento posterior
  a hoy mediante la vista canónica de AUD-03; se revisó esa implementación y se
  amplió cobertura de interfaz, sin duplicar ni cambiar cálculos financieros.
- Corrección:
  - `miamiDayRange` calcula ambas medianoches reales de America/New_York usando
    Intl. Rango UTC semiabierto: >= inicio y < siguiente medianoche para ambos
    contadores de hoy. Respeta DST, excluye la siguiente medianoche y fechas
    futuras, conserva filtros de tenant/estado y validación completa de AUD-09.
  - Las listas del dashboard muestran DD/MM/YYYY y hora Miami del instante real.
    Formato numérico opcional en helper existente; consumidores previos, incluido
    el correo, conservan su formato largo por defecto. No cambia timestamps.
  - Histórico reutiliza `isInCreationPeriod` del dashboard comercial y `formatDate`:
    el filtro y la fecha visible comparten calendario local, sin cortar el prefijo
    UTC. Mantiene paginación/filtros/contexto; rango invertido no incluye filas.
  - Vigencia de tarifa seleccionada con `calendarDaysUntil` y `formatDate`.
    No divide horas entre 24 ni normaliza fechas DATE imposibles a otro mes.
  - CxP conserva as_of_date/status/days_overdue del servidor, calculados con
    America/Tegucigalpa. Una AP que vence hoy tiene cero días vencidos; no se
    vuelve a derivar el estado con el reloj/zona del navegador. Sin cambiar
    saldos, pagos, notas, estados históricos ni snapshots comerciales.
- Validaciones ejecutadas:
  - Antes, reloj controlado: Miami a las 21:30 del 14/10 consultaba desde 15/10
    UTC, sin límite superior. Histórico excluía del filtro 14/10 una cotización
    de 15/10 01:30Z mostrada como 14/10 en Honduras.
  - Nueve regresiones nuevas: invierno/verano, días DST de 23/25 horas, hora
    repetida, medianoches inclusiva/exclusiva, año y febrero bisiesto, counts
    con tenant, fechas visibles y período local, vigencia de ocho días tras DST,
    fechas imposibles y CxP en cuatro zonas. Restauran TZ y reloj simulado.
  - `npm.cmd test`: 294/294 aprobadas.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio TypeScript.
  - `npm.cmd run build`: aprobado, incluido prebuild OCR y 82/82 páginas.
  - Seis archivos con ESLint limpio. Histórico conserva siete errores previos
    de no-explicit-any y dos avisos previos no-unused-vars; comparación de la
    versión anterior de esta etapa con mismas reglas/cantidades, sin infracciones
    nuevas. No se declara aprobado el lint global.
  - `git diff --check` y revisión de whitespace/UTF-8 del test y guion nuevos aprobados.
- Riesgos / trabajo pendiente:
  - Publicar helpers/pantallas juntos y ejecutar UAT. Verificar dependencias
    previas de AUD-03/09 y permisos/RLS del destino. No se ejecutó SQL ni se
    inició Docker; las pruebas de CxP son de contrato/interfaz, no RLS remoto.
  - Sin navegador conectado. Verificar tablas en móvil, modo oscuro, zona visible,
    rangos/paginación y cambios de día desde una sesión real con red interceptada.
    No hubo correos, pagos, ajustes, OCR externo ni datos de negocio reales.
  - Histórico mantiene la convención comercial existente de calendario local
    del navegador; otro navegador puede mostrar otro día para el mismo instante,
    pero fecha visible y filtro coinciden. No se agrega zona configurable por tenant.
  - Miami recalcula límites al consultar/actualizar; no hay autorrefresco al
    cruzar medianoche. Actualizar una pestaña abierta antes de usar sus contadores
    del nuevo día. Se depende del reloj y datos IANA del dispositivo.
  - Las consultas siguen siendo independientes, con límites de preview y
    protección de errores de AUD-09. No reescriben auditoría ni fechas DATE.
    AUD-11 queda siguiente: incidencia y estado del paquete en una transacción.
- Commit: pendiente; cambios locales sin commit/push. Incluir registro y guion
  UAT en el mismo commit de la corrección.

### AUD-11 — Reporte de incidencia atómico desde el portal (14/10/2026)

- Prioridad: P2.
- Estado: implementado y validado localmente; abierto para SQL, publicación,
  revisión de datos históricos y UAT del ambiente destino.
- Archivos modificados:
  - `src/app/portal/incidencias/nueva/page.tsx`, `src/lib/miami-incidents.ts`
    (nuevo), `src/lib/pending-request.ts` (nuevo) y `src/lib/supplier-payables.ts`.
  - `tests/miami-incidents.test.mjs` (nuevo), `tests/paged-client.mjs` y
    `scripts/validate-aud11-concurrency.mjs` (nuevo).
  - `supabase/tests/aud11_portal_incidents.sql` (nuevo),
    `docs/uat/aud11-atomic-portal-incidents.md` (nuevo),
    `docs/review-2026-10-13.md` y este registro.
- SQL nuevo, en este orden:
  - `supabase/migrations/20261014150000_atomic_portal_incidents.sql`.
  - `supabase/migrations/20261014151000_incident_session_binding.sql`.
  - `supabase/migrations/20261014152000_incident_trace_guards.sql`.
- Corrección:
  - Reproducción anterior con RLS real: INSERT de incidencia aprobado, UPDATE
    del paquete afecta cero filas sin error. El formulario podía anunciar éxito
    con incidencia abierta y paquete todavía Asignado.
  - Una RPC confirma incidencia, estado Con incidencia, evento y actividad en
    la misma transacción. Deriva tenant, cliente y actor de una sesión Cliente
    aprobada y activa; valida propietario, cliente vigente y ambos indicadores
    de entrega. La identidad esperada del navegador debe coincidir con auth.uid.
    La función interna no es ejecutable por roles de API.
  - Bloqueos del paquete y de la clave de solicitud serializan reportes y
    entregas. La misma clave devuelve el comprobante original; otra solicitud
    no puede abrir un segundo caso activo, incluso desde otra cuenta del mismo
    cliente o ante un caso histórico. Una repetición después del cierre o la
    entrega no vuelve a abrir el caso ni sobrescribe el estado del paquete.
  - El formulario verifica el comprobante completo antes de confirmar, bloquea
    doble envío y conserva texto/clave ante resultado incierto. sessionStorage
    guarda UUID e identidad/hash de la solicitud, sin descripción en claro.
    Si el almacenamiento está bloqueado, usa memoria; el control de casos activos
    del servidor sigue vigente tras recargar. El helper reutilizable conserva
    namespace y contrato financiero anteriores, sin cambiar RPC de pagos.
  - Selector paginado completo, sin resultados parciales ante error; contexto
    de sesión validado antes de enviar y respuestas tardías descartadas. No se
    ofrecen paquetes entregados para reportar desde este formulario.
  - Se bloquea INSERT directo autenticado, incluido personal interno; la gestión
    existente de estado/resolución se conserva. Identidad, contenido y clave de
    nuevos reportes son inmutables y su eliminación autenticada se bloquea;
    el evento incident_reported también queda protegido. Mantenimiento con
    privilegios elevados conserva su responsabilidad de auditoría.
  - Sin backfill, eliminación ni conciliación automática de casos históricos.
    El guion incluye consulta de diagnóstico para duplicados activos, propiedad,
    entrega y divergencias entre caso/paquete. El cierre conserva la política
    existente: no restaura automáticamente el estado del paquete.
- Validaciones ejecutadas:
  - `npm.cmd test`: 303/303 aprobadas; subconjunto de incidencia y pagos: 23/23.
    Nueve regresiones nuevas cubren contrato, reintento tras recargar, datos
    inválidos, cambio de sesión, doble envío, paginación y recuperación de error.
  - `npx.cmd tsc --noEmit`: aprobado después del último cambio TypeScript.
  - `npm.cmd run build`: aprobado, incluido prebuild OCR y 82/82 páginas.
  - Siete archivos de esta etapa con ESLint sin errores ni avisos.
  - SQL de regresión aprobado en base aislada, con rollback: permisos/RLS,
    entrada inválida, repetición, trazabilidad, cierre/entrega y fallos inyectados
    en paquete, evento y actividad sin escrituras parciales.
  - Cinco carreras con conexiones PostgreSQL reales y espera de bloqueo
    comprobada: misma clave, dos cuentas del cliente, entrega primero, reporte
    primero y reutilización de clave para otro paquete. Todas aprobadas.
  - API PostgREST autenticada local: comprobante y repetición correctos,
    identidad distinta rechazada, INSERT directo rechazado y lectura RLS aislada.
  - `supabase db lint --local`: sin errores nuevos de AUD-11; conserva el error
    previo de mail_intake_is_demo por is_demo_environment ausente y dos avisos
    financieros previos de v_account sin uso. No se declara aprobado el lint global.
  - `git diff --check` y revisión UTF-8/whitespace de archivos nuevos aprobados.
- Riesgos / trabajo pendiente:
  - Aplicar las tres migraciones y publicar el formulario coordinadamente;
    verificar dependencias de AUD-06 y RLS del destino. La pantalla anterior
    falla de forma segura después de retirar INSERT directo. Revisar otros
    consumidores internos que aún inserten incidencias por tabla.
  - Ejecutar diagnóstico histórico y documentar cualquier conciliación manual
    con identidad, motivo y trazabilidad en una transacción. No borrar duplicados
    ni inferir estados de entrega automáticamente.
  - Ejecutar UAT visual, móvil y autenticado según el guion. Sin navegador
    conectado ni validación del ambiente remoto; SQL aplicado exclusivamente
    a sarierp_aud01, con fixtures sintéticos limpiados y sin proveedores externos.
  - Base aislada con 120 migraciones y cero fixtures AUD-11 restantes; stack
    detenido conservando volúmenes. El stack principal no se modifica. No hubo
    correos, pagos ni despachos reales.
  - Quedan por abordar AUD-12 a AUD-20 (9). Los hallazgos anteriores conservan
    sus pendientes de publicación, SQL o UAT; no equivalen a cierres productivos.
- Commit: pendiente; cambios locales sin commit/push. Incluir SQL, registro y
  guion UAT en el mismo commit de la corrección; hash aún no disponible.

### AUD-12 — Avisos a varias cuentas del portal (14/10/2026)

- Prioridad: P2.
- Estado: cubierto y validado localmente; abierto para publicación/UAT de AUD-06.
- Archivos: eliminado `src/lib/client-notifications.ts` (sin consumidores);
  ampliado `supabase/tests/aud06_miami_assignment.sql`; documentación común de
  esta ronda: `docs/uat/aud12-20-acceptance.md`,
  `docs/review-2026-10-13.md`, matriz de release y este registro.
- SQL de esquema nuevo: ninguno. Se reutiliza
  `20261014130000_atomic_miami_package_assignment.sql` de AUD-06.
- Corrección: todos los perfiles Cliente aprobados/activos del cliente y tenant
  reciben su aviso en la transacción de asignación. No se vuelve a consultar
  maybeSingle ni se escribe desde un helper separado. Conflicto/reintento no
  duplica y un fallo del aviso revierte la asignación.
- Validaciones: búsqueda de consumidores antes de retirar; suite SQL AUD-06
  aprobada con cero/una/dos cuentas, inactivo/pendiente excluidos, RLS de ambas
  cuentas, cliente ajeno, prealerta y rollback. Siete suites SQL de auditoría
  aprobadas en sarierp_aud01 con fixtures revertidos. Véase validación conjunta.
- Pendientes: desplegar dependencias de AUD-06 y probar portal en destino. No
  modifica el destinatario comercial email_1 ni crea una política de contactos
  principales; este fix se refiere a avisos dentro del portal.
- Commit: pendiente; cambios locales, sin commit/push ni hash disponible.

### AUD-13 — CI y deuda de lint explícita (14/10/2026)

- Prioridad: P2.
- Estado: implementado localmente; abierto para primera ejecución alojada y
  configuración de controles de merge.
- Archivos: `.github/workflows/quality.yml`, `scripts/lint-baseline.mjs`,
  `scripts/validate-audit-sql.mjs`, `tests/lint-baseline.test.mjs`, `package.json`,
  `docs/quality/lint-baseline.json`, `docs/quality/continuous-checks.md`,
  `src/lib/pricing-catalogs.ts`, documentación común y este registro.
- SQL nuevo: ninguno; el job SQL aplica migraciones en stack Docker desechable
  y ejecuta siete suites de esta auditoría. Localmente solo admite --isolated
  sobre sarierp_aud01; sin conexión remota ni reset de la base de trabajo.
- Corrección: TypeScript/tests/build/lint:ci por PR y push main/master, permisos
  read-only y sin secretos. Baseline por archivo/regla/severidad/título, con
  conteo de repeticiones; ignora extractos/rutas/line numbers de React Compiler
  para igualdad Windows/Linux. Parseo/configuración fallan siempre; no se puede
  regenerar el baseline en CI y no se desactivan reglas globales.
- Reducción de deuda: tres no-explicit-any eliminados en pricing-catalogs con
  tipos del cliente y filas; se conservan catálogos/defaults/comportamiento.
  Baseline original 227 -> 224; las tres excepciones se retiran, no se trasladan.
- Validaciones: prueba de comparación para archivo/regla/severidad/repeticiones,
  disminución permitida y título estable; siete suites SQL locales aprobadas.
  Gate completo y comandos finales en validación conjunta.
- Pendientes: GitHub Actions no se ejecutó desde este checkout. Administrador
  debe exigir jobs application/database al merge tras primera ejecución verde.
  El job no sustituye todas las suites históricas, carreras reales ni UAT.
- Commit: pendiente; workflow, baseline y registro deben incluirse juntos.

### AUD-14 — Matriz única de release y aceptación (14/10/2026)

- Prioridad: P2.
- Estado: preparación documental implementada; abierto para evidencia remota y
  aceptación funcional. No se declara UAT completada.
- Archivos: `docs/release/audit-release-matrix.md`,
  `docs/MULTI_TENANT_CUTOVER_RUNBOOK.md`,
  `docs/release/release-readiness-4a-5c.md`, documentación común y este registro.
- SQL nuevo: ninguno.
- Corrección: matriz con commit, ambiente/hostname, versiones SQL efectivamente
  aplicadas, RLS, frontend y responsables/evidencia/fecha; pasos integrales FCL,
  carga suelta y Miami, incluidos dinero, portal, fallos y concurrencia. Runbooks
  anteriores remiten al índice vigente y conservan sus veredictos históricos.
- Validaciones: contraste del inventario y guiones AUD-01 a AUD-11 con migraciones
  versionadas y estados locales; revisión de enlaces/procedimiento. No se
  consultó esquema productivo ni se inventaron aprobaciones/nombres de firmantes.
- Pendientes: preparar candidato con SHA real, verificar destino y ejecutar los
  tres expedientes con roles; responsables por nombre y firmas de negocio. La
  autorización de correcciones locales no se interpreta como autorización de corte.
- Commit: pendiente; sin hash disponible.

### AUD-15 — Fallos auxiliares y APIs rastreables (14/10/2026)

- Prioridad: P2.
- Estado: implementado y probado localmente; abierto para publicación y operación
  de logs en hosting.
- Archivos: `src/lib/activity-logger.ts`, `src/lib/diagnostics.ts`,
  `src/app/api/miami/package-assignment-email/route.ts`,
  `src/app/api/support/notify/route.ts`, `tests/diagnostics.test.mjs`,
  documentación común y este registro. SQL nuevo: ninguno.
- Corrección: createActivityLog comprueba Auth/INSERT y devuelve ok o referencia
  de fallo; Sonner avisa sin arrojar una excepción que induzca a repetir la
  operación de negocio ya persistida. Auditoría obligatoria permanece en las RPC.
  APIs agregan referencia a cuerpo, mensaje y X-Request-ID ante catch/ambiente o
  entrega incierta/fallida. JSON de diagnóstico contiene evento, UUID, fecha,
  IDs validados, código y resultado; nunca serializa payload/exception/token.
- Validaciones: cuatro pruebas de diagnóstico, incluida respuesta/proveedor
  incierto con una sola llamada; bloque de correo de 45 pruebas aprobado con
  proveedor simulado y regresiones de aislamiento/demo/recuperación. Se preserva
  el estado incierto y no se fuerza un reenvío. Véase validación conjunta.
- Pendientes: captura, permisos y retención de logs reales del hosting; referencias
  tempranas pueden carecer de tenant/entidad antes de verificarlos. Auditoría
  auxiliar fallida no reemplaza una traza obligatoria ni se reconstruye a ciegas.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

### AUD-16 — Extraer creación y retirar escrituras muertas (14/10/2026)

- Prioridad: P2.
- Estado: extracción inicial implementada/probada; refactor incremental abierto.
- Archivos: `src/lib/quotation-create.ts`,
  `src/app/(protected)/quotations/new/page.tsx`, `tests/quotation-create.test.mjs`,
  documentación común y este registro. SQL nuevo: ninguno.
- Corrección: creación usa helper tipado que comprueba respuesta única, ID
  esperado y referencia; padre, contenedores, carga y pricing automático siguen
  en create_quotation_with_child_lines. Retirados los tres bloques Boolean(false)
  de INSERT separado de contenedores/cargos/carga. Sin cambiar reglas, snapshots,
  estados ni fórmulas. Las extracciones de transiciones previas siguen vigentes.
- Validaciones: lectura de RPC y payload vigente antes de extraer; pruebas de
  una sola RPC con todas las líneas y error/comprobante ajeno/incompleto sin
  confirmar. Suites SQL de pricing/transiciones aprobadas y validación conjunta.
- Pendientes: UAT FCL/carga suelta/Miami; descomposición posterior de comparación,
  booking y SI por casos de uso. No se presenta una extracción como reescritura
  completa de todas las páginas extensas.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

### AUD-17 — Protección de edición por formulario y navegación (14/10/2026)

- Prioridad: P2.
- Estado: implementado/probado con harness; abierto para UAT de navegador y
  compatibilidad de historial.
- Archivos: `src/components/ui/UnsavedChangesGuard.tsx`,
  `src/components/invoicing/ManualInvoiceEditor.tsx`, páginas de nuevo proveedor,
  nuevo/editar cliente, nueva factura y editar cotización,
  `tests/unsaved-changes.test.mjs`, documentación común y este registro.
- SQL nuevo: ninguno.
- Corrección: detección limitada al contenedor del guard, readonly/disabled y
  data-unsaved-ignore excluidos; dirty controlado del editor manual conserva su
  confirmación de reemplazo y evita marcar búsqueda del historial como edición.
  Botones Cancelar solicitan navegación con modal; guardado confirmado limpia
  dirty y error conserva datos. Enlaces internos mantienen captura y closing
  usa beforeunload. Traversal interceptable/cancelable usa Navigation API sin
  parchear history de Next ni insertar entradas ficticias.
- Validaciones: tres pruebas del componente real para scope/guardado, cancelar
  sin perder edición/confirmar y destino exacto del historial, además de
  regresiones de factura manual. Documentación instalada Next Link consultada.
- Pendientes: navegación/teclado/móvil en browsers de negocio; si Navigation API
  falta o el traversal no es cancelable, no se certifica bloqueo de atrás/adelante.
  Las pruebas de eventos simulados no son UAT visual ni garantía multiplataforma.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

### AUD-18 — Responsable y seguimiento de bloqueos (14/10/2026)

- Prioridad: P2.
- Estado: implementado/probado localmente; abierto para SLA/escalamiento y UAT.
- Archivos: `src/lib/billing-readiness.ts`, `src/lib/user-tasks.ts`,
  `src/app/(protected)/invoicing/page.tsx`, `tests/billing-readiness.test.mjs`,
  `tests/user-tasks.test.mjs`, `tests/complete-read-pages.test.mjs`, documentación
  común y este registro. SQL nuevo: ninguno.
- Corrección: cada readiness indica área que lo resuelve. Admin accede a cliente
  o pricing cuando corresponde; enlaces pasan por permisos existentes. Finanzas
  no recibe edición de cliente/pricing/operaciones. Sin acción permitida, reutiliza
  CreateContextTaskDialog para un seguimiento personal con fecha/prioridad y
  retorno canónico a Por facturar. No duplica Mi día ni Control Tower.
- Validaciones: helper por rol/readiness, ausencia de acción sin rol, contexto de
  tareas sin URL externa/query privada y regresión real de listado/error/reintento
  aprobados. El fixture contempla alias de cliente usado por el diálogo existente.
- Pendientes: acuerdos de SLA por servicio/handoff, persona responsable y
  escalamiento; no se inventan plazos ni se asignan tareas a otros usuarios.
  Indicadores definidos como propuesta, sin métricas reales observadas.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

### AUD-19 — Puesta en marcha y capacidades vigentes (14/10/2026)

- Prioridad: P3.
- Estado: documentación actualizada; ensayo independiente pendiente.
- Archivos: `README.md`, `config/development.env.example`,
  `docs/setup-and-capabilities.md`, `docs/manual-sari-usa-invoices.md`,
  documentación común y este registro. SQL nuevo: ninguno.
- Corrección: Node/npm ci, hostname y tenant activo, claves solo locales,
  aprobación de cuenta, matriz de variables y criterios de activación; sin reset
  destructivo como paso rutinario. OCR en dispositivo separado de OCR externo,
  correo bloqueado en demo y Outlook en standby sin secretos/scheduler nuevos.
  Factura manual independiente, historial paginado y sin contabilización fiscal.
- Validaciones: contraste con proxy/resolveTenantHost, lecturas process.env,
  seed vacío, runbooks y constante OUTLOOK_INTAKE_STANDBY=true. No se usaron
  secretos reales en el ejemplo ni se crearon cuentas de negocio.
- Pendientes: otro desarrollador debe ensayar instalación nueva y acceso con
  cuenta sintética aprobada; no se afirma bootstrap completo autenticado en GUI.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

### AUD-20 — Instrumentación local y base de medición (14/10/2026)

- Prioridad: P3.
- Estado: instrumentación preparada/probada; abierto para medición de navegador,
  presupuestos de rendimiento y analítica aprobada.
- Archivos: `src/lib/browser/measurements.ts`,
  `src/components/marketing/LandingContact.tsx`, `src/lib/quotation-create.ts`,
  `src/components/invoicing/ManualInvoiceEditor.tsx`, `tests/measurements.test.mjs`,
  `scripts/measure-build.mjs`, `docs/performance/measurement-plan.md`,
  `docs/performance/build-baseline.json`, documentación común y este registro.
- SQL nuevo: ninguno.
- Corrección: eventos locales de inicio/éxito/error y duración de envío demo,
  creación y generación PDF, más inicio de edición de demo. Allowlist de campos,
  sin PII/IDs/URL/error body, cookies, storage, red ni proveedor externo. Excepción
  y resultado del negocio conservados; medición auxiliar no bloquea el flujo.
  Script mide JS/CSS/gzip de chunks, SHA y árbol sin commit. Plan define ensayos
  pricing/booking/PDF frío/caliente/móvil antes de optimizar.
- Validaciones: pruebas de allowlist/ausencia de PII, resultado y excepción
  preservados y ausencia de window. Lead/proveedor simulado, sin solicitudes
  comerciales reales. Resultado estático de build en validación conjunta.
- Pendientes: no hay medición de navegador ni tasa de conversión real, presupuesto
  acordado o proveedor analítico aprobado. Suma de chunks no equivale a tamaño
  descargado por ruta ni prueba una mejora de rendimiento frente a un baseline
  anterior inexistente. No se difieren componentes por especulación.
- Commit: pendiente; cambios locales sin commit/push ni hash disponible.

#### Validación conjunta de AUD-12 a AUD-20 — 14/10/2026

- `npm.cmd test`: 316/316 aprobadas, cero fallos (13 regresiones nuevas respecto
  de AUD-11). Subconjunto de los cambios: 16/16. Bloque de correo: 45/45.
  La primera corrida detectó un alias Supabase ausente en el fixture de listado;
  se corrigió el fixture y se repitieron tanto el caso real como la suite completa.
- `npx.cmd tsc --noEmit`: aprobado después del último cambio de código.
- `npm.cmd run build`: aprobado, prebuild OCR y 82/82 páginas.
- `npm.cmd run lint:ci`: aprobado; 364 archivos, 224 diagnósticos históricos,
  cero regresiones. Deuda explícita: 187 errores y 37 avisos. No es un aprobado
  de lint global. Se retiraron tres excepciones en pricing-catalogs.
- `node scripts/validate-audit-sql.mjs --isolated`: siete suites aprobadas,
  AUD-01/02/03/05/06/08/11, con rollback y sin proveedores. Incluye cobertura
  ampliada de múltiples destinatarios de AUD-12. No se agregó migración en esta
  ronda; se conservan las 120 aplicadas exclusivamente al stack aislado.
- Los fixtures transaccionales de esta ronda se revirtieron; los volúmenes
  conservan fixtures sintéticos históricos de ensayos anteriores. Stack
  sarierp_aud01 detenido conservando volúmenes; base principal sin cambios.
- `node scripts/measure-build.mjs`: artefacto generado con 126 chunks,
  6,124,258 bytes y 1,792,173 bytes gzip sumados. Registra HEAD y árbol sin commit;
  no mide transferencia por ruta ni latencia de navegador ni mejora comparativa.
- `git diff --check`, UTF-8/whitespace y enlaces Markdown locales de 47 archivos
  de esta ronda aprobados. Sin librerías nuevas ni secretos versionados.
- Sin commit/push, SQL remoto, hosting, correos, leads reales, OCR externo,
  cobros, pagos o despachos de negocio. Primera ejecución alojada de CI, reglas
  de merge, UAT firmado, inventario remoto y medición real siguen pendientes.

### AUD-RELEASE — Preparación del commit y despliegue autorizado (14/10/2026)

- Alcance: paquete AUD-01 a AUD-20. El usuario autorizó commit/despliegue y
  confirmó que él mismo, como administrador, validará flujos y SLA. Responsabilidad
  identificada; aceptación de escenarios/plazos todavía no firmada.
- Destinos comprobados: Vercel sarierp/prj_y4WUxpZULtZ6bdb779GJsPMUJFmC,
  Supabase fwspgdzvlbtbgiupvrzo, dominio sari.forwarders.app. El main remoto es
  ancestro de la rama local; se preservan los 14 commits locales anteriores.
- Preflight remoto de solo lectura: 105 migraciones, última 20261012160000;
  316 cotizaciones, dos paquetes, cero obligaciones/pagos/incidencias, cero
  anomalías de vínculos financieros y RLS activo en las tablas auditadas.
  Cero correos processing. Copia de esquema guardada en evidencia ignorada.
- Dependencia AUD-07 resuelta en código: nueva migración
  `20261014153000_verified_platform_environment.sql`, tabla sin acceso de ERP,
  servidor read-only, default Demo, Production solo con verificación del dueño;
  función is_demo_environment falla cerrada. Prueba nueva
  `supabase/tests/aud07_verified_environment.sql` aprobada. Sin activar Outlook.
- AUD-05 legacy: cuatro casos identificados por historial explícito final
  Ganada→Pendiente. Nueva `20261014154000_reviewed_legacy_repricing.sql` agrega
  acción owner-only con revisión/ID de historial esperado y motivo; rechaza
  ambigüedad, cambios concurrentes y reentrada. Solo recupera metadata de retorno,
  sin aprobar/renumerar/cambiar importes o documentos. Auditoría obligatoria en
  la misma transacción; cobertura añadida a aud05_quotation_transitions.sql.
  Ejecución remota y cantidades efectivas se registrarán en postflight.
- AUD-16 ampliado: `src/lib/quotation-cargo.ts` comparte diez helpers/tipo de
  volumen y peso entre creación y edición. Extracción comprobada contra ambas
  implementaciones anteriores: 960 comparaciones coincidentes. Dos pruebas
  nuevas verifican unidades, cantidad y volumen manual como total de línea.
  No se reescriben snapshots ni fórmulas ni se reactiva un camino legacy.
- AUD-17/20: ensayo real con Chrome/155.0.8059.79 en perfil aislado, fixture
  compilado y APIs interceptadas; seis grupos aprobados para scope, enlaces,
  Cancelar, guardado fallido/confirmado, Atrás con confirmación, editor manual
  y su reemplazo a 390 px, error/reintento/doble submit de demo y eventos sin PII.
  No hubo UAT autenticada de Production ni solicitud comercial real. El ensayo
  no certifica cierre/recarga del navegador ni todos los navegadores móviles.
- Archivos adicionales: `scripts/validate-browser-guards.mjs`,
  `tests/browser/fixture-app/` (excluido de Vercel),
  `scripts/release/prepare-audit-package.mjs`, `tests/quotation-cargo.test.mjs`,
  páginas new/edit de cotizaciones, runner SQL, `.vercelignore`, matriz, guion
  de navegador y documentación AUD-07/calidad. Sin librerías nuevas.
- Validaciones: 318 pruebas Node, TypeScript y ocho suites SQL/RLS aisladas
  aprobadas; fixture browser compilado y seis grupos Chrome aprobados. Build
  principal aprobado con 82/82 páginas. Lint: 373 archivos, 223 diagnósticos
  históricos, cero regresiones; un aviso retirado además de los tres any previos.
  Quince regresiones de correo/listado/carga repetidas tras limpieza de EOF,
  TypeScript y diff --cached --check aprobados. Revisión de 161 archivos añadidos/
  modificados: UTF-8 y patrones de credenciales aprobados; un archivo eliminado.
  Postflight del candidato se registra con su hash en el siguiente asiento.
- Paquete remoto: 16 migraciones de auditoría, copia/hash por archivo, dry-run
  verificado y Outlook 20261002120000 expresamente excluido. La preparación no
  aplica SQL. Estrategia: construir Production sin alias, aplicar SQL revisado,
  configurar ambiente verificado, postflight y luego promover dominios.
- Pendientes: publicación, gates remotos, ejecución CI alojada, aceptación
  administrativa de los tres expedientes y SLA, medición de pricing/booking con
  datos representativos. No declarar cerrados esos puntos por tener build verde.
- Commit funcional: en preparación; registrar SHA y despliegue en postflight.

### AUD-RELEASE — Postflight publicado (14/10/2026)

- Commit funcional: `c767762d40aa657892c5b62d5ea85e17b22fba64`, origin/main.
  Contiene AUD-01 a AUD-20, SQL, pruebas, CI y registros de las etapas previas.
- CI alojada: Quality 38645720142, application y database success. Se retiró
  otra excepción de lint: baseline final 223 (187 errores/36 avisos), cero nuevas.
- Vercel: `dpl_Ce8vhFUzn3wocVfr2v4UmKcCyL9z`, Production READY; promovido a
  sari.forwarders.app tras construir sin dominios y verificar SQL/huellas/CI.
- Supabase fwspgdzvlbtbgiupvrzo: 105 -> 121 migraciones; exactamente 16 de
  auditoría aplicadas hasta 20261014154000. Outlook 20261002120000 sigue sin aplicar.
- Huellas y conteos de negocio iguales al preflight: 316 cotizaciones, dos
  paquetes, cero obligaciones/pagos/incidencias. RLS activo, cero RPC auditadas
  para anon y cero cores internos para authenticated.
- AUD-05: el backfill ya existente en 20261014121000 recuperó retorno de cuatro
  casos con historial explícito Ganada→Pendiente; cero repricings con operación
  sin retorno. La RPC adicional owner-only no se ejecutó. Sin aprobar precios
  ni modificar importes/documentos/estados comerciales.
- AUD-15: smoke de login/redirects/API sin sesión aprobado; una solicitud JSON
  inválida falló antes de auth/negocio y permitió comprobar referencia idéntica
  en cuerpo, X-Request-ID y log JSON real de Vercel, sin payloads privados.
- Archivo: `docs/release/audit-deployment-2026-10-14.md` y matriz actualizada.
  SQL adicional de este asiento: ninguno. Evidencia privada en .ua/intermediate.
- Bloqueo de aprobación: la revisión automática rechazó la consulta combinada
  de configuración Production y recuperación de cuatro casos, por requerir
  autorización específica de cambios persistentes. No se ejecutó. La recuperación
  ya quedó resuelta por la migración previa; solo falta autorización explícita
  para marcar platform_environment como production. Permanece Demo y bloquea correo.
- Pendientes: administrador solicitante identificado para UAT/SLA, sin firma aún;
  medición representativa/multinavegador y refactor incremental. No se certifica
  aceptación funcional ni se hacen pruebas con datos/envíos de negocio reales.
- Operación local: al crear el commit falló el repack automático por espacio,
  pero el commit quedó íntegro. Se retiraron solo compilaciones/caché propios y
  el temporal de repack; conectividad Git y push aprobados. Stack aislado detenido
  conservando volúmenes; perfil Chrome de la tarea cerrado.
- Commit de este postflight: documental posterior al funcional; hash disponible
  en Git tras confirmar este asiento.

### AUD-07 / AUD-RELEASE — Ambiente Production autorizado y verificado (14/10/2026)

- Estado: configuración protegida aplicada en Supabase fwspgdzvlbtbgiupvrzo
  después de recibir autorización explícita del administrador: «Autorizar ambos
  cambios». Se resuelve el bloqueo de aprobación descrito en el asiento previo.
- SQL operativo: `.ua/intermediate/audit-release-environment-approved.sql`
  (evidencia local ignorada). Una transacción comprueba la fila Demo sin verificar
  y el tenant activo, configura environment=production con verified_at/verified_by
  y agrega actividad verify_platform_environment. User_id nulo, actor declarado
  como mantenimiento del dueño de base; no se suplanta una sesión del ERP.
  Reintento sobre Production verificada conserva evidencia y no duplica actividad.
- Verificación efectiva: 2026-10-14T22:21:45.788954+00:00 (16:21:45 Honduras),
  una entrada de auditoría; service_role lee production e is_demo_environment()
  devuelve false en transacción de solo lectura. Sin conceder nuevos permisos.
- AUD-05: los cuatro retornos ya corregidos por 20261014121000 se conservan;
  no se repitió la reparación ni se ejecutó la consulta combinada rechazada.
  La autorización adicional no requiere una mutación redundante de cotizaciones.
- Archivos: este registro, `docs/release/audit-deployment-2026-10-14.md`,
  `docs/release/audit-release-matrix.md`, `docs/review-2026-10-13.md`.
  Sin cambios de esquema, migraciones, código o variables de hosting; no requiere
  redesplegar el frontend funcional c767762, publicado en el asiento anterior.
- Validaciones: huellas de cotizaciones, agentes, cargos, shipments, bookings,
  paquetes, obligaciones y pagos idénticas al preflight. Consulta del servidor
  comprobada sin llamar al proveedor de correo. Postflight remoto: 121 migraciones,
  316 cotizaciones, dos paquetes, cero repricings con operación sin retorno,
  cero RPC auditadas para anon, cero cores para authenticated y RLS activo.
  Cliente sin lectura y service_role sin escritura de la tabla de ambiente.
  TypeScript (`npx.cmd tsc --noEmit`) y `git diff --check` aprobados. La primera
  consulta de postflight no respondió y fue interrumpida; reintento de solo
  lectura aprobado. No se repitió la mutación de configuración.
- Riesgos/pendientes: permanecen los demás guards de correo y Outlook standby;
  no hubo envío de prueba ni operación real. UAT/SLA del administrador, políticas
  de merge/retención, ensayo independiente, medición y refactor incremental siguen
  abiertos según la matriz. No se declara aceptación funcional completa.
- Commit: asiento documental posterior a 13c0f47; SHA disponible en Git tras commit.

### 2026-10-15 - UX-072 - Símbolo de dólar en el total del PDF manual

- Estado: implementado, validado localmente y publicado en Production.
- Hallazgo: el total de la plantilla SARI USA mostraba el prefijo USD; el
  usuario solicita el símbolo $.
- Archivos: `src/components/pdf/manual-invoice-pdf.tsx`,
  `docs/manual-sari-usa-invoices.md`, esta bitácora. SQL: sin cambios.
- Cambio: total impreso como $3,845.00, con separadores estadounidenses y dos
  decimales. Se conserva el cálculo en centavos y la moneda del documento.
- Validaciones: pruebas existentes del PDF 4/4 y TypeScript OK. PDF ficticio
  generado y leído con PDF.js: texto Total Amount: $3,845.00 y ausencia de USD;
  raster del total inspeccionado visualmente. ESLint afectado y build local OK,
  82/82 páginas. Postflight y bundle público aprobados.
- Riesgos / pendiente: UAT autenticada general del módulo continúa pendiente;
  no se cambian datos, permisos ni totales guardados. Sin documentos enviados
  a proveedores o registros de prueba en Production.
- Commit funcional: `2bc4d4f`, enviado a `origin/main`. Postflight en commit
  documental local posterior.
- Publicación: Vercel CLI rechazó la creación con 403/invalidToken; consultas
  de identidad/proyecto funcionaron inicialmente, sin autorización de escritura.
  Reintento con acceso ampliado tampoco publicó. No hubo rechazo de la revisión
  automática de permisos. Se usó la integración existente GitHub–Vercel, cuya
  publicación anterior estaba verificada; sin cambiar secretos ni configuración.
- Vercel GitHub status: success, Production, deployment GitHub `7104953440`,
  Vercel `dpl_3QLPGJwn1TcTAfNCavEnT67MMEeU`.
  URL inmutable: `https://sarierp-gf5uxem9b-claudherhn-5641s-projects.vercel.app`.
  Dominio `sari.forwarders.app`: chunk PDF `0xfjvfqvv1h4s.js` = 200 y SHA-256
  idéntico al compilado local validado:
  `6c569629ce0c68b475bc8d2ece1d9773f052251e0b8a85dd42a6833568df8e5a`.
  Login 200, manual-invoices 307 al login y ambas API 401 JSON sin sesión;
  assets OCR 200 y checksum de modelo correcto. Sin UAT autenticada nueva.
- CI Quality del push: application aprobado; database todavía en ejecución
  al registrar este postflight. No hay SQL nuevo en este ajuste visual.
- Pendiente administrativo: restaurar la autorización de Vercel CLI para
  publicaciones directas futuras; no bloquea este cambio ya publicado por GitHub.

### 2026-10-15 - FLOW-036 - Ajustar seguro de venta ganada sin nueva elección del cliente

- Estado: implementado, validado en stack aislado y publicado SQL/frontend en
  Production. UAT autenticada de la aprobación real permanece pendiente.
- Solicitud: una venta ganada puede reabrirse para agregar/ajustar seguro y
  volver a Ganada al aprobar Pricing, sin pedir al cliente confirmar otra vez.
- Diagnóstico de solo lectura: SARIHN-2609-0266-AP tenía opción B aceptada,
  seguro en cargos actuales y borrador C; quedó en Pricing Aprobado con
  `repricing_return_status=Ganada`. No se cambiaron sus importes ni su estado.
  Antes de publicar, una nueva lectura mostró Ganada, revisión 8 y retorno
  vacío. Ese cambio ya existía en Production; no fue ejecutado por esta tarea.
- Causas: transición atómica prohibía cerrar repricing con cualquier opción,
  incluso aceptada; UI solo reconocía el retorno desde Pendiente, perdiendo
  el contexto al llegar al estado intermedio Pricing Aprobado. Además, cerrar
  solo el estado habría dejado el PDF mostrando el snapshot anterior sin seguro.
- Archivos:
  - `src/lib/quotation-status.ts`, `src/lib/quotation-options.ts`.
  - `src/app/(protected)/pricing-comparison/page.tsx`,
    `src/app/(protected)/quotations/[id]/page.tsx`.
  - `src/components/pricing/QuotationOptionsPanel.tsx`.
  - `tests/quotation-transition.test.mjs`, `tests/won-quotation-repricing.test.mjs`.
  - `supabase/tests/won_quotation_pricing_adjustments.sql`,
    `scripts/validate-audit-sql.mjs`, guías UAT y esta bitácora.
- SQL nuevo:
  - `20261016010000_won_pricing_adjustments.sql`.
  - `20261016011000_lock_won_adjustment_pricing.sql`.
- Cambios:
  - Admin/Pricing cierra el ajuste por la misma RPC transaccional, con revisión,
    actor, tenant, rentabilidad y registros obligatorios; Ventas no obtiene
    permiso de aprobar precios. La lista general de transiciones no se amplía.
  - Con la misma tarifa elegida, conserva la elección anterior y crea/refresca
    un borrador mediante la RPC canónica de snapshots. El nuevo vigente enlaza
    `supersedes_option_id` al anterior, cuyo contenido/aceptación original se
    conservan. El sucesor no inventa accepted_by/accepted_at de cliente;
    la aprobación de Pricing queda explícita en actividad. UI: Ajuste aprobado.
  - Cargos vigentes mantienen IDs e importes; se actualiza su enlace al snapshot.
    PDF utiliza la versión ajustada con seguro. No se recalculan facturas
    emitidas, CxP ni documentos operativos por cambiar precios.
  - Tarifa distinta o falta de opción aceptada mantienen el flujo comercial
    normal. Helper de snapshots sin EXECUTE para anon/authenticated/service_role.
  - Se admite cerrar desde Pricing Aprobado cuando persiste el retorno a Ganada.
    SI/bookings solo se sincronizan si el usuario lo solicita; se reutilizan
    protecciones vigentes de bookings confirmados y BL. Fallos al leer el
    impacto operativo detienen la aprobación, sin degradarla a otra transición.
  - Bloqueo de líneas persistidas antes de leer totales/snapshot del cierre.
- Validaciones:
  - Antes del fix, fixture SQL fallaba al retornar Pricing Aprobado a Ganada.
  - Nueva regresión SQL aprobada: seguro, ambos estados de reapertura, versiones,
    aceptación original, IDs de cargos, operación sin cambios por defecto,
    sincronización explícita, permisos, tarifa distinta, falta de aceptación,
    revisión obsoleta, core privado y rollback de todo el ajuste por auditoría.
  - Nueve suites SQL/RLS auditadas aprobadas; cuatro carreras reales de AUD-05
    aprobadas. Todas sobre `sarierp_aud01`, fixtures ficticios y rollback/limpieza.
  - Suite Node 320/320, TypeScript OK; ESLint 374 archivos, 0 regresiones sobre
    baseline vigente (223 diagnósticos previos). Build local exitoso.
  - Smoke de Production: login 200; Pricing y detalle de cotización sin sesión
    redirigen 307 al login. Chunk de Pricing publicado responde 200 y coincide
    en SHA-256 con el build local validado.
- Publicación: dry-run y push desde el paquete aislado de release incluyeron
  únicamente las dos migraciones anteriores. Conserva sin aplicar el archivo
  histórico `20261002120000_sari_outlook_intake.sql`, excluido también en el
  release previo; no se usa include-all ni se marca una migración no aplicada.
  La primera consulta CLI de huellas no conectó como rol temporal; se reemplazó
  por lecturas REST con hostname de proyecto verificado y sin imprimir secretos.
- Postflight Production (15/10/2026):
  - Ambas versiones SQL registradas en `supabase_migrations.schema_migrations`;
    columna de sucesión disponible y EXECUTE del helper privado denegado para
    anon, authenticated y service_role, comprobado con consulta de solo lectura.
  - Huellas SHA-256 antes/después idénticas para la cotización real, cargos,
    opciones, snapshots, SI y bookings. Sigue Ganada, revisión 8, sin retorno.
    Esta publicación no aprobó ni modificó datos comerciales del caso real.
  - Commit funcional `4796cc7` publicado en `main`. GitHub deployment Production
    `7107166759`: `success / Deployment has completed`, mismo SHA.
    URL inmutable: `https://sarierp-ctcpwnirm-claudherhn-5641s-projects.vercel.app`.
  - Dominio `https://sari.forwarders.app` sirve el chunk nuevo verificado.
    Stack de pruebas `sarierp_aud01` detenido conservando volúmenes; stack
    habitual del proyecto sin detener.
  - CI Quality del SHA funcional, ejecución `38825532550`: jobs application y
    database aprobados. Incluye TypeScript, 320 pruebas, lint/build y las nueve
    suites SQL/RLS sobre una base desechable creada desde cero.
- Riesgos / pendiente: no hay UAT autenticada de la cotización real. La aprobación
  operativa sigue siendo una acción del usuario en su sesión; no se impersonan
  usuarios ni se fuerza una venta mediante la cuenta dueña de base. El máximo
  vigente de 26 opciones/versiones se conserva. Nuevas ventas/cambios de tarifa
  continúan requiriendo su elección comercial habitual.
- Commit funcional: `4796cc7` (`fix: approve won quote pricing adjustments without new client selection`).

### 2026-10-19 - MKT-LANDING-SHARE-01 - Metadatos sociales y textos de conversión

- Estado: publicado y comprobado por HTTP en Production; pendiente revisar las
  previsualizaciones dentro de las aplicaciones de terceros.
- Hallazgos:
  - `FragmentationProblem` ya contiene `relative overflow-hidden`; el resplandor
    `.problemGlow` está recortado por la sección y no requiere un cambio de CSS.
  - Existe `src/app/opengraph-image.tsx`, que Next.js incorpora automáticamente
    como imagen Open Graph PNG de 1200x630. Los objetos `openGraph` y `twitter`
    de la portada no declaraban explícitamente sus imágenes.
  - Implementación, evidencia y preguntas frecuentes usaban textos defensivos
    que se sustituyen por la redacción comercial solicitada.
- Archivos modificados:
  - `src/app/page.tsx`.
  - `src/components/marketing/landing-content.ts`.
  - `HARDENING.md`.
  - SQL: ninguno; sin cambios de permisos o RLS.
- Cambios:
  - Ambos metadatos reutilizan `/opengraph-image`, sus dimensiones reales y alt;
    no se duplica el generador ni se atribuye formato 1200x630 a la captura
    existente de 1920x1080.
  - Actualizados los cinco pasos de implementación, tres bloques de evidencia
    y seis preguntas/respuestas con el texto proporcionado. El FAQ visible y
    su JSON-LD siguen compartiendo `landingQuestions`.
  - Reformulado el resultado financiero del recorrido para comunicar visibilidad
    del margen con los costos registrados.
- Validaciones ejecutadas:
  - `npm.cmd test`: 353/353 pruebas aprobadas.
  - `npx.cmd tsc --noEmit`: OK, después del último cambio de código.
  - ESLint dirigido a los dos archivos TypeScript/TSX modificados: OK.
  - `npm.cmd run build`: OK sobre la versión final.
  - HTTP local con Host de plataforma y User Agents de WhatsApp, LinkedIn y
    Twitter: portada 200, `og:image` y `twitter:image` absolutos en `<head>`,
    ambos apuntan a `https://forwarders.app/opengraph-image`.
  - `/opengraph-image`: 200, tipo PNG y dimensiones reales 1200x630; imagen
    revisada visualmente.
  - Chrome headless, anchos 320, 360, 390, 430, 768, 1024 y 1440: documento con
    `scrollWidth = clientWidth`; sección del resplandor con overflow horizontal
    computado `hidden`. Capturas móviles revisadas visualmente.
  - Cinco pasos y tres bloques comerciales presentes; seis respuestas del FAQ
    coinciden con JSON-LD. FAQ operable por teclado; cero excepciones JavaScript.
  - Evidencias locales ignoradas por Git:
    `.ua/intermediate/landing-20261019/` (logs, PNG y `report.json`).
- Riesgos / trabajo pendiente:
  - Publicado con `8003402`; HTML e imagen social 1200x630 comprobados en
    `https://forwarders.app`. No se enviaron leads para validar.
  - Validar las previsualizaciones reales de WhatsApp y LinkedIn tras desplegar;
    esta revisión local no certifica el estado de caché de servicios externos.
- Commit funcional: `80034020c95037bbd6c52a2b9b65152178ad929a`.

### 19/10/2026 - FLOW-037 - Cliente de SI y shipment después de cambiar la cotización

- Estado: publicado en Production con ambas migraciones aplicadas; datos,
  función, permisos y RLS comprobados. UAT de pantalla/PDF autenticado pendiente.
  Commit y despliegue autorizados por el usuario el 19/10/2026.
- Hallazgo y diagnóstico de solo lectura:
  - `SARIHN-2610-0340-AP` (`9720a5c2-a187-4cca-98ca-439e60095d48`)
    está Ganada y pertenece a AGROSOLUCIONES INTEGRALES S DE RL DE CV.
  - La SI y shipment `RT0039` (`3abede6a-c1a0-43b0-a112-5c38c678c483`)
    conservan el vínculo de BOMOHSA. Shipment abierto y sin bookings.
  - La pantalla usaba `shipping_instructions.client_id`; el PDF usa el cliente
    actual de la cotización. La sincronización de Pricing omitía ambos vínculos.
- Archivos / SQL:
  - `src/lib/shipping-instruction-state.ts` y
    `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`.
  - `tests/shipping-instruction-state.test.mjs`.
  - `supabase/migrations/20261019200000_shipping_instruction_client_sync.sql`.
  - `supabase/migrations/20261019201000_repair_rt0039_client.sql`.
  - `supabase/tests/shipping_instruction_client_sync.sql` y
    `supabase/tests/shipping_instruction_client_repair.sql`.
  - `HARDENING.md`.
- Corrección:
  - Pantalla y PDF comparten el cliente vigente de la cotización, con fallback
    al cliente operativo para documentos legacy sin esa relación.
  - La cadena RPC existente sincroniza SI y shipment en la misma transacción;
    conserva tarifa seleccionada, exclusiones de bookings y auditoría operativa.
    Audita cliente anterior y nuevo de ambos vínculos. Exige tenant, cliente y
    cotización vigentes; bloquea operaciones cerradas/canceladas. No reemplaza
    partes documentales editadas, snapshots comerciales, facturas ni BL.
  - Reparación acotada a los UUID verificados, cliente anterior/nuevo esperados,
    cotización Ganada y RT0039 abierto sin bookings. Idempotente y auditada;
    se omite si cambió alguna de esas condiciones antes de aplicar la migración.
  - El aviso de éxito indica que la SI se sincronizó incluso al omitir bookings.
- Validaciones ejecutadas:
  - Reproducción SQL antes del fix: falla la aserción del cliente persistido;
    después del fix, `shipping_instruction_client_sync.sql`: OK con rollback.
  - Fixtures ficticios en `sarierp_si_client_sync_v2_test`, base aislada dentro
    del contenedor local. Esquema comercial/Auth y permisos restaurados; sin
    copiar datos de desarrollo ni Production. Se omitieron pg_cron, triggers
    administrativos de extensiones y permisos administrativos ajenos al flujo.
    Migraciones recientes aplicadas; `platform_environment` ya estaba en el
    esquema exportado y no se recreó.
  - Casos con/sin bookings, booking confirmado intacto, cambio auditado,
    repetición, rol no autorizado, otro tenant y operación cerrada: OK.
  - Portal v2: cliente anterior pierde el shipment y el actual lo recibe.
    Fallo de auditoría revierte ambos vínculos. Wrapper interno sigue privado.
  - `shipping_instruction_client_repair.sql`: OK; guardas de cierre/cambio
    posterior de cliente, reparación de ambos vínculos e idempotencia.
  - Regresión `won_quotation_pricing_adjustments.sql`: OK con rollback.
  - `npm.cmd test`: 360/360; TypeScript, ESLint dirigido y build: OK.
  - Dry-run remoto: el push general detecta además
    `20261002120000_sari_outlook_intake.sql`, ausente del historial remoto y ajena
    al fix. No se aplicó ni se marcó como ejecutada.
  - Preparado directorio local ignorado
    `.ua/intermediate/si-client-sync-release` con el historial correspondiente,
    configuración y plantillas, excluyendo únicamente la migración de Outlook.
    `supabase db push --linked --dry-run --workdir
    .ua/intermediate/si-client-sync-release`: OK; propone exclusivamente las dos
    migraciones FLOW-037. Este ensayo no publica cambios de esquema ni datos.
- Publicación y postflight (19/10/2026):
  - Commit funcional `5a82e19206df0e67e95379a15854973595ad2b8e` en `origin/main`.
    Despliegue Vercel Production `7182873733`, success. URL inmutable:
    `https://sarierp-d74mhxzc7-claudherhn-5641s-projects.vercel.app`.
  - Aplicadas únicamente las migraciones `20261019200000` y `20261019201000`
    mediante el directorio selectivo validado. Dry-run posterior: base remota
    al día con ese paquete. Outlook continúa pendiente y no fue marcado aplicado.
  - Preflight confirmó las condiciones originales. Postflight: cotización,
    SI RT0039 y shipment apuntan al cliente
    `4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4` (AGROSOLUCIONES); una sola entrada
    `shipping_instruction_client_backfilled` con los vínculos anterior/nuevo.
  - Huellas antes/después: cotización, tarifas, cargos, opciones, bookings y
    facturas intactos; SI/shipment solo cambian `client_id` y `updated_at`.
  - Esquema remoto leído después del despliegue: cuerpo de la función coincide
    con la migración versionada; wrapper/core privados para clientes de API,
    RPC público v2 ejecutable por `authenticated`. RLS activo y policy
    `tenant_isolation_guard` restrictiva en SI y shipments.
  - GitHub Quality `39310662968`: application y database completados en success.
    El TypeScript local final también aprobado.
  - HTTP del dominio Sari: login 200; SI/cotización sin sesión redirigen 307 al
    login conservando su ruta de retorno. No se usó una cuenta de usuario para
    hacer cambios ni se enviaron mensajes/correos de prueba.
  - Evidencias locales ignoradas en `.ua/intermediate/si-client-sync-release/`:
    `before.json`, `after.json` y `production-public.sql`.
- Riesgos / trabajo pendiente:
  - Recargar RT0039 y comparar pantalla/PDF con sesión autorizada; validar
    “Actualizar desde pricing” y acceso de portal desde cuentas del cliente.
    La inspección de RLS publicado y las regresiones locales no certifican ese
    UAT autenticado en Production. El hallazgo conserva ese pendiente.
- Commit funcional: `5a82e19206df0e67e95379a15854973595ad2b8e`.

### 2026-10-19 - MKT-LANDING-CONTACT-03 - Formulario y recorrido operativo con recepción segura

- Estado: frontend y ambas migraciones publicados; SQL/RLS, HTTP y navegador
  comprobados en Production. GitHub Actions continúa en cola al registrar el cierre.
- Hallazgos: confirmación personalizada basada en campos editables y sin trim;
  etiquetas de etapas recortadas; honeypot exclusivamente cliente omitible por
  inserciones directas a `leads`.
- Archivos y SQL:
  - `src/components/marketing/LandingContact.tsx`, `OperationJourney.tsx`.
  - `src/lib/demo-lead.ts`, `src/app/api/demo-request/route.ts`.
  - `tests/demo-request.test.mjs`, `scripts/validate-browser-guards.mjs`.
  - `supabase/tests/demo_request_server.sql`, `supabase/tests/phase1_rls.sql`,
    `scripts/validate-audit-sql.mjs`, `HARDENING.md`.
  - Migraciones nuevas: `20261019180000_demo_request_server.sql` y
    `20261019181000_demo_request_server_only.sql`.
- Cambios:
  - Incorporadas las propuestas comerciales, con confirmación que utiliza una
    copia de los datos normalizados enviados; campos deshabilitados durante el
    envío, nombre por espacios y vínculo de privacidad canónico preservado.
  - Ocho etapas en grid 2/4/8 con nombres completos y ajuste de línea.
  - Receptor de servidor JSON, máximo 4096 bytes, origen/host de plataforma,
    validación compartida y honeypot en cliente y servidor. Respuestas sin datos
    privados; fallos y límite de frecuencia conservan el formulario para reintentar.
  - RPC restringida a service_role: inserción y cuota atómicas, cinco solicitudes
    por 15 minutos. Clave HMAC rotada diariamente con IP suministrada por Vercel;
    no se guarda la IP ni se confía en headers reenviados fuera de Vercel.
  - RLS en contadores y sin permisos de lectura/escritura para clientes. Segunda
    migración revoca INSERT a anon/authenticated; Ventas conserva SELECT.
  - Publicación por fases: preparar RPC, desplegar frontend y finalmente cerrar
    el camino directo, sin interrumpir el formulario anterior durante el build.
- Validaciones ejecutadas:
  - Cinco pruebas Node nuevas del receptor: OK (validación, origen, tamaño,
    honeypot, clave HMAC, cuota y fallo de DB).
  - Once suites SQL/RLS vigentes aprobadas en PostgreSQL aislado
    `supabase_db_sarierp_landing19`, creado desde todas las migraciones.
  - Ocho conexiones concurrentes: cinco aceptadas y tres rechazadas; fixtures
    ficticios eliminados. Prueba SQL cubre rollback conjunto de cuota e inserción.
  - El fixture histórico `phase1_rls.sql` falla antes de las comprobaciones de
    leads por registros comerciales sin tenant_id; sus expectativas de inserción
    se actualizaron y se verifican también en la nueva suite específica. No se
    presenta ese fixture histórico como aprobado.
  - TypeScript, ESLint dirigido y build local: OK; 358/358 pruebas aprobadas.
    Gate ESLint de 396 archivos: 223 diagnósticos históricos, cero regresiones.
  - Chrome, diez anchos entre 320 y 1440: etiquetas completas, ocho paneles y
    teclado; formulario vacío enfoca el primer error; fallos 503/429 permiten
    reintentar; doble submit produce una solicitud; edición programática durante
    espera no altera la confirmación, que usa nombre y empresa normalizados.
  - Honeypot cliente sin solicitud de red; honeypot servidor probado por unidad;
    mediciones sin datos personales y cero excepciones JS. Sonner usa un mismo
    ID para reemplazar el error previo cuando un reintento termina bien.
  - Evidencia ignorada: `.ua/intermediate/landing-20261019/`.
- Publicación y postflight (19/10/2026):
  - Commit funcional `8003402` en `origin/main`; Vercel Production deployment
    `7178252140`, estado success. URL inmutable:
    `https://sarierp-q96rje9o0-claudherhn-5641s-projects.vercel.app`.
  - Primero se aplicó `20261019180000`, luego se verificó el frontend publicado
    y por último `20261019181000`; registro de cada migración en la misma
    transacción de su ejecución. Ambas fuentes coinciden con el SQL local validado.
    No se ejecutaron otras migraciones pendientes ni Outlook en standby.
  - Catálogo remoto: RLS activo en leads/contadores; sin INSERT de clientes,
    incluso por columnas; sin EXECUTE de RPC para anon/authenticated; service_role
    sí puede ejecutarla; SELECT de Ventas preservado. Conteo de leads: 1 antes y
    después; ningún lead de prueba se insertó en Production.
  - Dominio público: portada 200 con nuevo formulario, grid, WhatsApp y chunk
    `/api/demo-request`; imagen social PNG 1200x630 y captura q=90 responden 200.
    Receptor rechaza origen externo con 403 y JSON malformado con 400 antes de DB.
    Login de Sari 200 y Pricing sin sesión redirige 307 al login.
  - Chrome aislado con red sobre `https://forwarders.app`: diez anchos, ocho
    etapas, foco, fallos/reintento, cuota, snapshot y honeypot aprobados con los
    tres POST del formulario interceptados; cero excepciones JavaScript.
    El navegador bajo restricciones no conectaba por ERR_CONNECTION_RESET;
    la prueba final se ejecutó con acceso de red, sin omitir validación TLS.
  - GitHub Quality `39280512986`: trabajos application/database en cola al cierre;
    no se presenta CI remoto como aprobado. Las comprobaciones locales
    equivalentes sí se ejecutaron y aprobaron.
- Riesgos / pendientes: resultado de CI remoto y UAT de una solicitud comercial
  real por el usuario; las pruebas no generaron leads ni mensajes reales.
  La cuota reduce abuso, no sustituye protección frente a ataques distribuidos.
- Commit funcional: `80034020c95037bbd6c52a2b9b65152178ad929a`.

### 2026-10-19 - MKT-LANDING-TOUR-02 - Tour móvil, capturas compartidas y contacto comercial

- Estado: implementado, validado localmente y publicado en Production.
- Hallazgos:
  - Next.js 16.2.6 admite `preload`; se conserva en el hero. Los originales WebP
    ya pesan entre 41.114 y 86.654 bytes.
  - Los cuatro pasos del hero parecían controles sin acción; el badge comercial
    estaba oculto en móvil y el tour requería desplazamiento lateral.
  - Los paneles inactivos se desmontaban y el modal pedía el original sin
    optimizar, distinto del recurso usado por la vista normal.
- Archivos modificados:
  - `src/components/marketing/ConnectedOperationHero.tsx`.
  - `src/components/marketing/ProductShowcase.tsx`.
  - `src/components/marketing/DemoConversionPanel.tsx`.
  - `src/lib/platform-branding.ts`, `next.config.ts`, `HARDENING.md`.
  - SQL: ninguno; sin cambios en RLS ni dependencias nuevas.
- Cambios:
  - Los cuatro pasos enlazan al tour y usan iconos uniformes; el badge se coloca
    debajo de la tarjeta en móvil y conserva su posición flotante desde `sm`.
  - Navegación del tour en dos columnas en móvil, tres en tablet y barra lateral
    desde `lg`. Etiquetas completas con ajuste de línea en pantallas estrechas.
  - Un IntersectionObserver prepara las seis capturas a 200 px de la sección;
    sus paneles se mantienen montados y los inactivos llevan `hidden`.
  - Vista normal y modal comparten dimensiones, `quality=90` y `sizes=1920px`.
    Next.js permite calidades 75 y 90; conserva el valor predeterminado para las
    otras imágenes. El enlace al original sigue disponible por separado.
  - Ajustado el tercer paso de demo con la redacción solicitada. Añadido enlace
    `https://wa.me/50499467738`, número facilitado por el usuario; abre una pestaña
    nueva y no envía mensajes automáticamente.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit`: OK después del último ajuste de código.
  - ESLint dirigido a los cinco archivos TS/TSX modificados: OK.
  - `npm.cmd test`: 353/353 aprobadas; `npm.cmd run build`: OK en versión final.
  - Chrome headless, DPR 2, anchos 320, 360, 375, 390, 430, 768, 1024 y 1440:
    documento y menú sin desbordamiento; seis nombres completos; dos columnas
    en móvil, tres en tablet y una desde `lg`. Badge visible en todos los anchos.
  - Confirmado `<link rel="preload" as="image">` responsive del hero en `<head>`.
    Antes de aproximarse al tour sólo está montada la primera captura; después
    cargan las seis con `q=90`. Sus nodos se conservan al cambiar de pestaña y
    sólo un panel queda visible/accesible.
  - Las seis opciones activadas mediante eventos de puntero; navegación por
    flecha derecha comprobada. Cada modal usa el mismo `currentSrc` que su
    captura, sin solicitud adicional de imagen al abrirlo.
  - Zoom a 1920 px contenido dentro del modal, cierre por Escape y botón,
    devolución de foco al disparador y reinicio del zoom al reabrir: OK.
  - Enlace WhatsApp y número autorizados coinciden; no se abrió el servicio ni
    se enviaron mensajes. Sin leads ni escrituras a producción; cero excepciones
    JavaScript en el recorrido.
  - Capturas móvil/desktop revisadas visualmente. Evidencias locales ignoradas
    por Git en `.ua/intermediate/landing-20261019/`: `tour-report.json`,
    `tour-*.png`, `tour-tests.log` y `tour-build-final.log`.
- Riesgos / trabajo pendiente:
  - Publicado con `8003402`; enlace WhatsApp y recurso optimizado q=90 verificados
    en el dominio público. La velocidad en redes móviles reales requiere medición.
  - Las capturas nativas a calidad 90 priorizan legibilidad y reutilización con
    zoom; el tour completo se descarga al aproximarse a la sección.
- Commit funcional: `80034020c95037bbd6c52a2b9b65152178ad929a`.

### 2026-10-20 - CUS-01 - Servicio de Aduanas sin agente y con entrega final opcional

- Estado: SQL y frontend publicados y comprobados en Production el 20/10/2026;
  Servicio de Aduanas habilitado en el catálogo. UAT autenticado pendiente.
- Hallazgo: el catálogo de cotizaciones no permitía cotizar un servicio propio
  de aduanas; obligaba a simular transporte y tarifas de agente. Las excepciones
  estaban limitadas a Miami en UI, RPC, RLS de pricing y creación del expediente.
- Archivos y SQL:
  - Cotizaciones: `src/app/(protected)/quotations/new/page.tsx`,
    `[id]/page.tsx`, `[id]/edit/page.tsx`; nuevo
    `src/components/quotations/CustomsQuotationSection.tsx` y
    `src/lib/customs-quotation.ts`.
  - Catálogos/flujo: `src/lib/pricing-catalogs.ts`, `quotation-products.ts`,
    `quotation-status.ts`, `pricing-validation.ts`; `src/hooks/useMiamiQuotation.ts`;
    `src/app/(protected)/pricing-comparison/page.tsx`.
  - Documento comercial: `src/components/pdf/quotation-pdf.tsx`.
  - Operaciones: `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`,
    nuevo `src/components/operations/CustomsServicePanel.tsx`,
    `src/lib/operation-status.ts`.
  - Finanzas: `src/lib/cost-analysis.ts`, `cost-validation-data.ts`,
    `src/components/pricing/CostAnalysisPanel.tsx`,
    `src/app/(protected)/cost-validation/[id]/page.tsx`.
  - Portal/reportes: `src/app/portal/envios/page.tsx`, `envios/[id]/page.tsx`,
    `src/app/(protected)/reports/page.tsx`.
  - Migración nueva `supabase/migrations/20261020120000_customs_only_service.sql`;
    suite `supabase/tests/customs_only_service.sql`, incorporada a
    `scripts/validate-audit-sql.mjs`.
  - Pruebas `tests/customs-quotation.test.mjs`, `customs-quotation-pdf.test.mjs`;
    aceptación/publicación en `docs/uat/customs-service.md`; este registro.
- Cambios:
  - Producto `customs_only`, visible como **Servicio de Aduanas**. Cotiza
    honorarios propios y entrega opcional, con costo externo, venta, ISV,
    vigencia, aduana, mercancía y condiciones comerciales. No exige tarifa
    Miami, agente, Incoterm, contenedores ni medidas ficticias.
  - Ventas guarda borrador o crea propuesta aprobada en el vocabulario vigente
    (`Pricing Aprobado`); el editor también aprueba el borrador sin enviarlo al
    comparativo. Validación compartida y SQL de dirección/precio de entrega,
    importes finitos y justificación interna de margen inferior al 5%.
  - Edición/duplicación conservan los cargos propios y sus tasas, incluido cero.
    El PDF presenta alcance y cargos del servicio; notas internas, proveedor,
    costos y campos de flete quedan fuera de la propuesta comercial.
  - Expediente canónico SI/shipment con gestión, liberación, entrega cuando
    está contratada y cierre; notas/evidencias escritas, usuario, historial,
    tenant, asignación y control de versión. Bloquea creación de booking,
    tarifas de agente y líneas ficticias de flete para este producto.
  - Repricing conserva la transacción, revisiones, auditoría y retorno a Ganada;
    la sincronización de expedientes abiertos no exige agente. No cambia
    documentos emitidos, snapshots históricos ni expedientes cerrados.
  - Finanzas confirma expresamente costo externo cero de honorarios propios,
    sin factura ficticia; entrega y gastos con costo mantienen conciliación.
    El cierre canónico alimenta Por facturar sin alterar sus controles fiscales.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit`: aprobado después del último ajuste de código.
  - `npm.cmd test`: 371/371 aprobadas, incluido PDF renderizado real con
    importes/ISV y comprobación de exclusión de costos y notas internas.
  - `npm.cmd run lint:ci`: 401 archivos, 223 diagnósticos históricos,
    cero regresiones. `npm.cmd run build`: aprobado en la versión final.
  - PostgreSQL aislado `supabase_db_sarierp_customs20`, recreado desde las
    migraciones canónicas. Outlook en standby excluido expresamente. Suite
    nueva y once suites SQL/RLS vigentes aprobadas, con fixtures y rollback.
    Incluye aprobación directa/borrador, costos, repricing ganado sin agente,
    cierre, entrega obligatoria, control de revisión, permisos y aislamiento.
    Los productos/rate codes legacy nulos mantienen la conciliación obligatoria;
    la excepción financiera exige producto y honorario propios explícitos.
  - Chrome headless sobre componentes reales con proveedor ficticio: validación
    sin datos de flete, PDF previo de USD 230.00/345.00, entrega, justificación
    de margen, error/reintento con formulario preservado y payload atómico.
    Cero excepciones JS durante la interacción; anchos 390 y 1440 revisados.
    La revisión visual detectó recorte de acciones en móvil; se ajustó el
    contenedor para apilar y envolver los botones; la repetición visual y
    funcional confirmó que las tres acciones quedan visibles.
  - Evidencias locales ignoradas: `.ua/intermediate/customs-db/`,
    `customs-browser-report.json`, `customs-390.png`, `customs-1440.png`,
    `customs-node-final.log` y `customs-build-final.log`.
- Riesgos / pendientes:
  - Migración y frontend publicados; catálogo habilitado para el tenant
    existente. RLS/permisos desplegados comprobados por catálogo; esa revisión
    no certifica cuentas reales. UAT autenticado pendiente según el documento.
  - El servicio no liquida impuestos aduaneros. Se documenta su alcance en
    condiciones comerciales. Los avances requieren referencia escrita;
    comprobar documentación real y factura emitida durante UAT.
  - La prueba de navegador utiliza un proveedor simulado, sin correos,
    cotizaciones ni escrituras a Production. No se instalaron dependencias.
- Publicación autorizada y postflight (20/10/2026):
  - Commit funcional `196713ec2b3e352ce0b651105a30ee9db0f11b63` en `origin/main`.
  - Supabase `fwspgdzvlbtbgiupvrzo`: aplicada únicamente `20261020120000`,
    con fuente exacta registrada en la misma transacción. Historial de 128 a
    129 migraciones; Outlook `20261002120000` sigue sin aplicar.
  - Guard transaccional comparó huellas antes/después de catorce tablas de
    negocio; postflight independiente confirmó que permanecen intactas.
    Sin cotizaciones, facturas, operaciones ni mensajes de prueba en Production.
  - RLS activo en las seis tablas revisadas; siete funciones nuevas sin EXECUTE
    para anon; triggers privados para authenticated. Validación pura y avance
    operativo son ejecutables por authenticated, con los controles de rol,
    tenant, estado y versión presentes en los cuerpos publicados.
  - Opción nueva temporalmente inactiva durante el build para no exponerla al
    frontend anterior; habilitada tras confirmar Vercel y CI del mismo commit.
    Producto `customs_only`, etiqueta `Servicio de Aduanas`, activo y sin
    tarifas Miami en el tenant existente.
  - GitHub Quality `39469345310`: application/database success.
  - Vercel Production deployment `7207033956`: success; URL inmutable
    `https://sarierp-jytbiy22f-claudherhn-5641s-projects.vercel.app`.
  - Dominio `sari.forwarders.app`: login 200; cotización nueva, pricing y
    operaciones redirigen 307 a login conservando retorno. Portal de envíos
    redirige 307 a su login. Sin utilizar cuentas comerciales para el smoke.
  - Evidencia ignorada: `.ua/intermediate/customs-release/` con manifest,
    preflight, fuente aplicada, grants/RLS, huellas, activación y HTTP.
- UAT autenticado conserva su pendiente independiente según
  `docs/uat/customs-service.md`; publicación detallada en
  `docs/release/customs-service-2026-10-20.md`.

### CUS-PDF-02 — Etiquetas de operación y domicilio en PDF de Aduanas (20/10/2026)

- Estado: validado localmente; regeneración del PDF del cliente pendiente.
- Hallazgo: el PDF titulaba «Dirección» al sentido comercial Importación /
  Exportación, lo que se confundía con el domicilio de entrega.
- Archivos: `src/components/pdf/quotation-pdf.tsx`,
  `tests/customs-quotation-pdf.test.mjs` y este registro. SQL: ninguno.
- Cambio: «Tipo de operación» identifica `trade_direction`; «Dirección de
  entrega» identifica `delivery_address` cuando la entrega está incluida.
  Se conservan «No incluida» y «Por definir» según el alcance contratado.
- Validación: la prueba del PDF renderizado reprodujo el fallo antes del
  cambio y ahora comprueba ambas etiquetas junto con sus valores correctos.
  `npx.cmd tsc --noEmit`, 371/371 pruebas y build aprobados. ESLint dirigido:
  19 diagnósticos históricos del componente; `npm.cmd run lint:ci` comprueba
  la ausencia de regresiones contra el baseline vigente.
- Riesgos / pendientes: los PDF descargados previamente requieren regenerarse.
  Comprobación del documento del cliente por el usuario pendiente; no se
  modifican cotizaciones, direcciones, importes ni datos de Production.
- Commit funcional: `6bae9f9aba3fa135ee3ba4a8f6713f81930878e2`.

### 2026-10-21 - PNOTE-01 - Notas internas por tarifa FCL y LCL

- Estado: frontend y SQL publicados y comprobados en Production el 21/10/2026.
  UAT autenticado pendiente.
- Hallazgo: Pricing Comparison no permitía explicar la elección de una tarifa ni
  conservar comentarios independientes por opción FCL/LCL.
- Archivos y SQL:
  - `src/app/(protected)/pricing-comparison/page.tsx`.
  - Nuevo `src/components/pricing/AgentQuoteNotes.tsx` y modificación de
    `src/components/pricing/FclAgentComparisonTable.tsx`.
  - Nueva migración `supabase/migrations/20261021120000_agent_quote_internal_notes.sql`.
  - Suite `supabase/tests/agent_quote_internal_notes.sql`, integrada en
    `scripts/validate-audit-sql.mjs`; prueba `tests/agent-quote-notes-pdf.test.mjs`.
  - `docs/uat/pricing-rate-notes.md` y este registro.
- Cambios:
  - Campo opcional `agent_quotes.internal_notes`, separado de notas de Ventas y
    condiciones comerciales. Se guarda al crear/editar tarifas FCL/LCL.
  - Notas visibles en tarjetas y tabla FCL; modal reutilizable para editar solo
    la nota, incluso en la tarifa seleccionada, sin tocar costos, selección,
    pricing ni estado. Texto multilínea; vaciar guarda NULL; error conserva el
    borrador y permite reintentar. Etiquetas y controles accesibles.
  - Respeta permisos y RLS vigentes: Pricing/Admin en Pendiente de Fijar Precios;
    lectura según acceso existente. Sin RPC nuevas ni ampliación de privilegios.
  - Impresión interna FCL conserva las notas sin botones de edición. El PDF
    comercial conserva `client_notes` y excluye comentarios internos de tarifa.
- Validaciones ejecutadas:
  - `npx.cmd tsc --noEmit` y `npm.cmd run build`: aprobados.
  - `npm.cmd test`: 373/373 aprobadas; dos PDF comerciales reales renderizados
    para FCL/LCL confirman exclusión de notas internas y conservación de las comerciales.
  - ESLint dirigido: diagnósticos históricos en página/tabla; componente nuevo
    sin diagnósticos. `npm.cmd run lint:ci`: 403 archivos, 223 diagnósticos
    históricos, cero regresiones.
  - Base aislada `supabase_db_sarierp_customs20`, historial hasta 20261020120000,
    sin cotizaciones previas: migración nueva aplicada únicamente allí. Suites
    `agent_quote_internal_notes.sql` y `aud01_pricing_write_permissions.sql`
    aprobadas con rollback de fixtures. Comprueban crear/editar/vaciar FCL/LCL,
    Admin/Pricing, denegación de escritura de Ventas/Cliente/otra empresa,
    denegación de lectura a Cliente/otra empresa, bloqueo enviado y preservación
    de todos los campos ajenos a la nota y de la cotización.
  - Chrome sobre Pricing Comparison real con proveedor simulado: guardado de
    notas en tarifa seleccionada con payload limitado a `internal_notes`, filtros
    de tarifa/cotización y sin RPC/repricing; edición desde tabla; borrado a NULL;
    independencia entre opciones LCL; precarga/guardado del formulario completo;
    impresión interna con notas y sin botones. Error de red conserva texto y
    permite reintentar. Modal contenido en 390 px, cierre por Escape y devolución
    del foco comprobados. Capturas 1440/390 revisadas visualmente; se corrigió la
    altura fija heredada de `fieldClass` en ambas áreas de notas.
  - Recorrido final sin excepciones JavaScript; HMR deshabilitado en el navegador
    de pruebas para mantener estables las navegaciones del fixture local.
    Evidencias ignoradas en `.ua/intermediate/notes-*`: informe JSON, capturas,
    logs SQL, pruebas, lint, TypeScript y build. Sin cuentas ni escrituras reales.
- Riesgos / pendientes:
  - Frontend y migración publicados. No se crearon datos de negocio de prueba ni
    se enviaron mensajes a Production.
  - Completar aceptación con cuentas reales según `docs/uat/pricing-rate-notes.md`.
    La nota es un comentario editable por opción, no un historial de comentarios.
- Commit funcional: `2736ca11203c9daf4ea7e1b3a4889db42a242f2e`, en `origin/main`.
- Preflight de publicación autorizado (21/10/2026): `main` local y remoto en
  `6cade0973d9ec2c2d9b9ed50899050e8052a7f50`; Production
  `fwspgdzvlbtbgiupvrzo` con 129 migraciones, última `20261020120000`.
  `agent_quotes.internal_notes` ausente y RLS activo. Se publicará únicamente
  `20261021120000`, con fuente exacta registrada y comparación transaccional de
  datos/permisos; Outlook en standby permanece fuera de la publicación.
- SQL publicado (21/10/2026): aplicada únicamente `20261021120000`, con fuente
  exacta registrada en la misma transacción; historial de 129 a 130 migraciones.
  Ensayo previo en base local aislada vacía aprobado. Huellas de catorce tablas
  de negocio y permisos intactos tanto dentro de la transacción como en el
  postflight independiente. La huella de tarifas excluye únicamente la columna
  nueva; todas sus notas se inicializaron a NULL. Columna TEXT nullable,
  RLS/policies/ACL y funciones de acceso conservados. Outlook sigue sin aplicar.
- Despliegue frontend: Vercel Production `dpl_C9D4g2v9w2eDvzrjJ86QWBVvWUkz`,
  `READY`, fuente Git del commit funcional `2736ca1`. Sesión Vercel autorizada;
  commit verificado por API y dominio `sari.forwarders.app` comprobado como alias
  del mismo despliegue. URL inmutable
  `https://sarierp-lclnn1llg-claudherhn-5641s-projects.vercel.app`.
- Quality CI `39622724610`: application y database aprobados para el commit
  funcional publicado. CI `39623750879` del registro documental `cab237a` también
  aprobado; sin cambios adicionales de aplicación.
- Smoke final del frontend publicado: login 200; cotización nueva y pricing 307
  a login; portal de envíos 307 a su login. No certifica UAT autenticado de las
  notas; se conserva ese pendiente independiente y documentado.

### 2026-10-21 - PNOTE-UX02 - Ancho contenido para las áreas de notas

- Estado: validado localmente y publicado en Production; revisión autenticada
  de presentación pendiente.
- Hallazgo: las notas internas de tarifas y las observaciones del cliente se
  extendían a todo el ancho de Pricing Comparison en escritorio.
- Archivos: `src/app/(protected)/pricing-comparison/page.tsx` y este registro.
  SQL: ninguno.
- Cambio: ambos campos tienen ancho máximo de 42 rem (672 px con la tipografía
  base), alineados a la izquierda y adaptables al espacio disponible en móvil.
  El botón de observaciones conserva la alineación con su campo. Se mantiene
  altura multilínea y redimensionado vertical.
- Validaciones: `npx.cmd tsc --noEmit` y `npm.cmd run build` aprobados;
  `npm.cmd run lint:ci`: 403 archivos, 223 diagnósticos históricos, cero
  regresiones. Chrome sobre Pricing Comparison real con proveedor simulado:
  FCL/LCL a 1676, 1440 y 390 px. Ambos campos miden 672 px en escritorio y quedan
  dentro del viewport móvil; cero excepciones JavaScript. Capturas revisadas
  visualmente. Evidencia ignorada: `.ua/intermediate/notes-width-*`.
- Riesgos / pendientes: revisión autenticada de presentación en Production;
  no cambia guardado, permisos, costos, estados ni estructura de datos.
- Commit funcional: `4355447ea0079c52c4c32f913434847dfe85ffd5`, en `origin/main`.
- Publicación: Vercel Production `dpl_3ptLT54fV6DrDwZ38EX12EGxm6GV`, `READY`;
  URL `https://sarierp-j6rdqc6fq-claudherhn-5641s-projects.vercel.app`.
  Alias `sari.forwarders.app` verificado contra ese despliegue. Smoke sin sesión:
  login 200 y pricing 307 a login. No se ejecutó SQL ni se crearon datos de
  negocio. Quality CI `39635482978` en ejecución al cerrar este registro.
