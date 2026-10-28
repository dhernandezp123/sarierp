# Selectores compactos — 28/10/2026

## Alcance del ajuste

El formulario de CAI queda limitado a 768 px, con dos columnas en escritorio y
una en móvil. El panel tiene fondo suave y cabecera breve; la lista fiscal deja
de usar el popup nativo de Windows. Las acciones de CAI conservan sus permisos,
confirmaciones y contratos de guardado.

`CompactSelect` limita el control y su menú a 448 px o al contenedor disponible;
la lista alcanza como máximo 280 px y desplaza sus opciones cuando hace falta.
Usa el posicionamiento reutilizable de los combobox existentes. Ofrece flechas,
Enter, Home/End, Escape, Tab, búsqueda con acentos y datos secundarios, retorno
de foco y bloqueo de opciones deshabilitadas.

Se aplicó a nueve controles: oficina/tipo de CAI, selección de máster, usuario
autorizado por oficina, tipo fiscal, moneda de referencia, dos operaciones de
conversión/equivalencia y hoja de extracto bancario. Dentro del diálogo de
conversión de proforma, la lista permanece en el modal y Escape la cierra primero.

El inventario estático identificó 222 selectores nativos restantes en 70 archivos.
Todos los selectores simples comparten ahora un límite CSS de 448 px; los de
selección múltiple o tamaño explícito conservan su comportamiento. La validación
nativa requerida sigue disponible. Los buscadores compartidos de cliente, agente
y cotización tienen un máximo de 512 px; el de naviera, 448 px.

## Evidencia local

Las verificaciones de navegador usan componentes reales con datos ficticios y
Supabase sustituido en una aplicación local; no escriben en los ambientes.
El contenedor reproduce el desplazamiento interno del ERP. La prueba móvil es
emulación de viewport, no una certificación en un teléfono físico.

| Ancho solicitado | Formulario CAI | Selector fiscal | Menú fiscal |
| --- | ---: | ---: | ---: |
| 1676 px | 768 px | 355 px | 355 × 254 px |
| 1440 px | 768 px | 355 px | 355 × 254 px |
| 390 px | 358 px | 324 px | 324 × 254 px |

Las seis opciones fiscales aparecen con texto legible. Se comprobó selección
por teclado, foco, búsqueda por descripción, validación nativa de un campo
obligatorio, búsqueda de clientes, selección de usuario para autorizar oficinas y
selección/Escape dentro del diálogo real de proforma. Ocho comprobaciones de
navegador aprobadas, sin excepciones JavaScript.

Cinco pruebas del componente y las suites Node completas (504 principal y 510
Pruebas) aprobadas; TypeScript y lint dirigido de 14 archivos sin regresiones en
ambos árboles. Compilación aprobada en ambos; paridad de 539 archivos compartidos
y 26 variantes revisadas, sin diferencias inesperadas. Diff check aprobado.

## Publicación y UAT pendientes

Este ajuste visual no agrega SQL adicional. Las migraciones financieras/CAI y
los frontends ya están publicados en ambos ambientes; fuentes, RLS, CI y smoke
verificados en `docs/release/accounting-finance-cai-2026-10-28.md`.

Después del despliegue: revisar CAI nuevo/edición, consulta sin permiso máster,
selección de usuario, opciones fiscales y hoja del extracto en el navegador de
Contabilidad. Revisar también buscadores de clientes/agentes/cotizaciones/navieras
y filtros de reportes en escritorio y teléfono real, incluidos nombres largos y
modo oscuro. La cobertura visual abarca los flujos descritos; el inventario de
los 70 archivos es una revisión estática.
