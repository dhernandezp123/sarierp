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
| Paginación de tablas | `Pagination` | Botones Anterior/Siguiente propios |
| Montos editables | `NumberInput` con `type="number"` explícito | `<input type="number">` directo: pierde texto intermedio como `1.` |
| Moneda y fecha | `formatMoney`, `formatDate`, `formatDateTime` de `src/lib/format.ts` | Formateadores locales y `toLocaleString('en-US')` sueltos |
| Lista sin resultados | `EmptyState` o `FinanceEmptyState` | Texto suelto sin acción |

Una etiqueta que envuelve texto y campo usa `flex flex-col gap-1.5`: `space-y`
no separa el texto suelto, y un `select` (limitado a 448 px en `globals.css`)
queda en la misma línea que su etiqueta. En filas de filtros, `items-end`
mantiene alineados los campos aunque una etiqueta ocupe dos líneas.

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
