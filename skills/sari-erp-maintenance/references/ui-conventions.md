# Convenciones de UI

Aplica a pantallas internas del ERP. Antes de crear una variante, revisa si una
de estas piezas ya cubre el caso.

## Base compartida

| Necesidad | Usar | Evitar |
| --- | --- | --- |
| Campos, tarjetas y botones | `src/lib/ui-classes.ts` | Repetir cadenas largas de Tailwind |
| Modal con formulario o información | `Dialog` de `src/components/ui/dialog.tsx` | `div fixed inset-0` propio: no atrapa foco ni cierra con Escape |
| Confirmación simple | `ConfirmDialog` | `window.confirm()` |
| Avisos | Sonner (`toast`) | `alert()` |
| Paginación de tablas | `Pagination` (con `pageSize` en estado) | Botones Anterior/Siguiente propios |
| Montos editables | `NumberInput` con `type="number"` explícito | `<input type="number">` directo: pierde texto intermedio como `1.` |
| Moneda y fecha | `formatMoney`, `formatDate`, `formatDateTime` de `src/lib/format.ts` | Formateadores locales y `toLocaleString('en-US')` sueltos |
| Lista sin resultados | `EmptyState` o `FinanceEmptyState` | Texto suelto sin acción |
| Campo con etiqueta | `FormField` de `src/components/ui/form-field.tsx` | `<label>Texto<select/></label>` sin apilar |
| Bloque de formulario con título | `FormSection` (mismo archivo) | `legend` o `h2` sueltos con estilos propios |

## Formularios

Referencia visual: `/quotations/new`. Toda captura (alta de documento, filtros,
diálogos) sigue esta anatomía:

- **Etiqueta arriba, control abajo.** Usa `FormField` (`label`, `required`,
  `hint`, `className`). Pinta la etiqueta con `fieldLabelClass`
  (`text-xs font-medium text-slate-500`), apila con `fieldStackClass`
  (`flex min-w-0 flex-col gap-1.5`) y añade `*` rojo si `required`. Con
  `CompactSelect`, combobox u otro control que ya tenga `aria-label`, usa
  `as="div"` para que la etiqueta no reciba los clics.
- **Nunca** `<label>Texto<select/></label>` sin clase: el texto queda en línea y
  el `select` (limitado a 448 px en `globals.css`) se coloca a su lado. Tampoco
  `space-y-*` como sustituto: no separa texto suelto. Una etiqueta separada
  (`<label htmlFor>` + control) debe ser `block` o estar en un contenedor
  `flex-col`; `labelClass` de `src/lib/ui.ts` ya incluye `block`.
- **La etiqueta no impone peso al control.** No pongas `font-semibold` o
  `font-medium` en el `label` contenedor: los controles heredan la fuente
  (`font: inherit`) y el valor sale en negrita. El estilo va en el `span`.
- **Secciones con título.** Agrupa por significado con `FormSection` (título
  `text-sm font-semibold`, descripción breve, línea `border-b`). Ejemplo de
  Compras: Documento → Datos del proveedor (solo boleta) → Líneas → resumen.
- **Grilla 1/2/3 columnas**: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`
  (`lg:grid-cols-4` en líneas de detalle). Ordena los campos como se leen en el
  documento físico y evita filas con un solo campo; un campo largo usa
  `col-span-2`, no una fila propia.
- **Componentes reutilizables no fijan su etiqueta.** Reciben `label` (por
  ejemplo `BillingOfficeSelect label="Oficina emisora"`); la página no añade
  una segunda etiqueta encima.
- **Líneas repetibles** (conceptos, cargos): cada una en un bloque con borde,
  encabezado «Línea N», su importe a la derecha y «Quitar» con icono. «Agregar
  línea» va en la cabecera de la sección.
- **Cierre**: observaciones a la izquierda; resumen (Subtotal, ISV, Total por
  moneda) y acciones alineadas a la derecha, con «Cancelar» antes de la acción
  principal.
- **Filtros en línea intencionales** («Ver [select]», «Mostrar [select]») son
  la excepción: `flex items-center gap-2` explícito, solo para un selector
  corto que se lee como frase.
- En filas de filtros, `items-end` mantiene alineados los campos aunque una
  etiqueta ocupe dos líneas.

Para auditar el repo, busca `<label` que envuelva texto y control sin
`flex-col` ni `grid` en su clase; cada hallazgo debe pasar a `FormField` o al
patrón apilado.

`formatDate(value, '—')` conserva la raya larga cuando la pantalla la usaba como
vacío. Un precio unitario puede tener más de dos decimales; no lo pases por
`formatMoney` si eso trunca información.

## Finanzas y Contabilidad

- Cabecera: `FinancePageHeader` de `src/components/invoicing/FinanceWorkspace.tsx`,
  con `eyebrow` del área (`Finanzas · Facturación`, `Finanzas · Cobranza`,
  `Contabilidad`, `Tesorería`). El `main` del layout ya aplica padding; no añadas
  `p-4 sm:p-6` en la página.
- Acciones secundarias: `financeActionClass`. Acción principal: `primaryButtonClass`
  con `inline-flex items-center gap-2` cuando lleva icono.
- Enlaces: `financeLinkClass` o el color de marca `#B3282D` (`dark:text-rose-300`).
  El azul queda para estados semánticos (por ejemplo, `Enviada`), no para enlaces.
- KPIs: `FinanceMetric`. Una fila clicable debe tener además un enlace o botón
  enfocable para teclado.
- `AccountingNav` solo en pantallas de Contabilidad; una pantalla de Facturación
  que reutiliza un workspace contable debe ocultarla y tener su propio título.
  Cada pestaña debe apuntar a una ruta `/accounting/*` que muestre la misma
  barra (Anulaciones usa `/accounting/voids`, que reexporta la página de
  Facturación); si no, la barra desaparece al navegar.

## Verificación visual

Un cambio de UI no se publica solo con TypeScript, pruebas y build. Renderiza
las páginas reales con datos sintéticos (fixture fuera de Git en
`.ua/intermediate/`, sesión y cliente Supabase sustituidos por alias de webpack)
y revísalas en Chrome a 1280 y 768 px como mínimo, más el ancho en que se
reporte el fallo. Chrome headless no baja de unos 500 px de viewport: para
móvil usa emulación de dispositivo, no `--window-size`.

## Invariantes de Finanzas visibles en la UI

- Un borrador no consume CAI ni correlativo; estos se asignan al emitir.
- Una factura emitida no se recalcula por cambios de configuración ni helpers.
- Anular un documento fiscal requiere solicitud y decisión de Contabilidad.
- Los asientos solo usan cuentas marcadas para movimiento. En Sari, el propietario
  confirmó solo las Auxiliar; no habilites otras hojas sin su confirmación.
- Cada moneda se totaliza por separado; no sumes HNL y USD en una sola cifra.
