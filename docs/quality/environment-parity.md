# Producción y Prueba — 28/10/2026

## Comparación inicial verificada

| Control | Producción | Prueba |
| --- | --- | --- |
| Dominio | `sari.forwarders.app` | `demo.forwarders.app` |
| Rama y commit inicial | `main`, `86d542a` | `demo`, `8408d09` |
| Última versión publicada | 27/10/2026 | 01/10/2026 |
| Supabase | `fwspgdzvlbtbgiupvrzo` | `wlssekvxpfxhwedsjhpz` |
| Migraciones registradas | 147 | 88 |
| Tablas públicas | 110 | 91 |
| Brecha | Arquitectura multiempresa y contabilidad vigentes | 98 commits de main aún no integrados |

Prueba tenía 22 commits propios de sandbox. Se fusiona `main` hasta el commit
funcional `8bf64c3ca3e129069a61afbd496db5f648d5004c`, conservando sus protecciones.
Incluye Contabilidad, oficinas fiscales/CAI, impuestos y equivalencias, proformas,
cobranza/estados de cuenta, diario/mayor/balances, compras, activos/depreciaciones,
anulaciones aprobadas, reportes de operaciones, campos numéricos y borradores
con corrección master individual.

## Límites intencionales

- Bases, usuarios, claves y documentos separados. No se copia información de
  clientes ni credenciales de Producción a Prueba.
- Prueba conserva Atlas, aceptación de términos, grants temporales ligados al
  JWT, caducidad, `noindex`, marcas en cada página PDF y en impresión HTML.
- Correo e invitaciones bloqueados; Storage privado y sin acceso autenticado.
  El build Preview exige URL/variables del proyecto Demo. Nunca `vercel --prod`.
- Configuración fiscal y contable editable en el tenant ficticio. Ya no se fuerza
  convertir toda factura en Proforma; se puede ensayar el mismo flujo fiscal con
  documentos que llevan la marca de sandbox y carecen de validez.
- La cuenta master de Sari se designa únicamente en Producción. Prueba permite
  designar su propia cuenta elegible; no replica el usuario de Contabilidad real.
- Conserva el bloqueo de eliminación completa de manifiestos Miami y perfiles.
- El reset anterior queda retirado: su allowlist y seed no son compatibles con
  multiempresa/contabilidad. No se ejecutó reset ni se borró el dataset remoto.
  Un reset futuro requiere procedimiento nuevo, ensayo y autorización explícita.
- Outlook permanece en espera en ambas bases: se conserva su migración pendiente
  y no se activa ninguna integración ni se transfieren secretos.

## Validación y publicación

Producción: `8bf64c3`, migración `20261028100000` aplicada antes del frontend.
Designación inicial auditada; 110 tablas existentes y autorización preservadas.
CI `40715647354` aprobado, 474 pruebas Node y 26 suites SQL/RLS; 24 rutas HTTP y
versión publicada verificadas. El smoke sin sesión no certifica UAT.

Prueba: 71 migraciones ausentes aplicadas, incluidas cinco adaptaciones de
sandbox. Ensayo local desde su esquema real con dataset ficticio y suites de
emisión/corrección y acceso Demo. Instalación limpia ensayada por separado.
Ensayo sobre la base remota dentro de una transacción revertida: preservación de
89 tablas/columnas originales (excluye timestamps de actualización y logo Demo),
incluidos documentos, importes, clientes, perfiles y cotizaciones. Los productos
y versiones legales originales se comparan por su clave, permitiendo solo las
adiciones de catálogos previstas. Las secuencias vacías se inicializan por tenant
sin consumir documentos. El sentinel conserva su dataset y grants.

Publicación de Prueba: sincronización `b46aec4`, cierre de marcas HTML `62ea8e2`;
71/71 migraciones aplicadas y hashes verificados contra el código confirmado.
Preview Ready y smoke de 24 rutas aprobado, incluyendo noindex, bloqueo de
invitaciones, marca Atlas, rutas nuevas y versión idéntica al deployment inmutable.
CI `40722799987` aprobado: 480 pruebas Node, dos suites SQL/RLS, TypeScript,
lint y build. Instalación limpia de las 160 migraciones de la rama verificada
en la base desechable de CI. UAT autenticado sigue pendiente.

| Control final | Producción | Prueba |
| --- | --- | --- |
| Migraciones aplicadas | 148 | Las mismas 148 + 11 exclusivas de sandbox |
| Tablas públicas con RLS | 113/113 | 116/116 |
| Funciones compartidas | 372 | Ninguna ausente; 363 idénticas + 9 límites/prefijos Demo |
| Borradores nuevos durante release | 0 | 0 |
| Master de facturación | Cuenta de Contabilidad solicitada, única y auditada | Configuración propia; no se copió la cuenta real |

Las diferencias intencionales están revisadas en el manifiesto: 26 variantes
entre 513 archivos compartidos. Las tablas adicionales de Prueba corresponden a
términos, accesos Demo y el sentinel histórico custodiado. Las nueve funciones
distintas conservan numeración Demo, JWT/caducidad, protección de perfiles y
bloqueo de eliminación de manifiestos; las funciones contables son iguales.

## Mantener ambos al día

1. Validar y publicar el cambio compartido en `main`, con SQL antes del frontend.
2. Fusionar ese commit en `demo`, sin copiar datos ni variables de entorno.
3. Aplicar únicamente las migraciones ausentes al proyecto Demo; ensayar primero
   el historial acumulado y revisar los backfills. No usar `migration repair`.
4. Desde la raíz: `node scripts/check-environment-parity.mjs main .demo-sync`.
   En CI Demo se compara `origin/main` contra el checkout. Cualquier archivo
   compartido ausente o variante sin hashes revisados hace fallar el control.
5. Revisar `environment-parity.json` cuando cambie código con una protección Demo.
   No aceptar nuevas diferencias únicamente para silenciar la comprobación.
6. CI de Demo ejecuta TypeScript, pruebas de aplicación, lint, build y SQL/RLS
   propios con acceso temporal/JWT realista. Comprobar Preview y ambos dominios.
7. Registrar commit, migraciones, comparación y pruebas en `HARDENING.md`.

El workflow `Environment parity` se ejecuta en cada push a cualquiera de las dos
ramas. Es una comparación de solo lectura, sin credenciales ni acceso a bases,
para señalar una nueva brecha aunque todavía no se haya publicado la otra rama.

El archivo histórico `20260918190000_agent_360_read_access.sql` tiene una variante
ya aplicada en Demo. Se conserva su fuente; las funciones actuales se contrastan
con Producción por separado. Las migraciones Demo no se trasladan a `main`.
