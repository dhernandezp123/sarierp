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

## Invariantes de Finanzas visibles en la UI

- Un borrador no consume CAI ni correlativo; estos se asignan al emitir.
- Una factura emitida no se recalcula por cambios de configuración ni helpers.
- Anular un documento fiscal requiere solicitud y decisión de Contabilidad.
- Los asientos solo usan cuentas marcadas para movimiento. En Sari, el propietario
  confirmó solo las Auxiliar; no habilites otras hojas sin su confirmación.
- Cada moneda se totaliza por separado; no sumes HNL y USD en una sola cifra.
