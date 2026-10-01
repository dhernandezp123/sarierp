---
name: sari-erp-maintenance
description: Revisar y corregir Sari Express ERP preservando cotizaciones, pricing, operaciones, documentos, finanzas y portal. Usar al mantener este repositorio o evaluar su landing; no aplica a otros proyectos ni a la configuración global de Codex.
---

# Mantenimiento de Sari Express ERP

Lee `AGENTS.md` y la sección pertinente de `HARDENING.md`. Comprueba `git status`
antes de editar. Usa los documentos de la versión instalada en
`node_modules/next/dist/docs/` para cambios de Next.js; la versión declarada está
en `package.json`. No sustituyas estas fuentes por convenciones de otra versión.

## Elegir el cambio

Localiza el flujo y sus consumidores con `rg`. Consulta
[el mapa de módulos](references/module-map.md) únicamente para las áreas afectadas.
Reproduce el fallo o demuestra el caso con código y una prueba antes de cambiar
una regla de negocio. Distingue fallos funcionales de avisos de lint y deuda
histórica; no conviertas una revisión en una reescritura general.

## Invariantes que se deben preservar

- El rol, `status = Aprobado` e `is_active` determinan el acceso; los controles
  visuales no sustituyen la autorización del servidor y RLS. Una respuesta de
  perfil obsoleta no debe aplicarse después de cerrar sesión o cambiar de usuario.
- Para elegir agentes, reemplazar líneas, aceptar opciones y propagar repricing,
  reutiliza las RPC atómicas existentes. No reactives bloques legacy
  `Boolean(false)` ni reemplaces una transacción por `delete` seguido de `insert`.
- Una opción ofrecida es un snapshot congelado. Su PDF utiliza sus propios cargos,
  impuestos, condiciones y `client_notes`; `pricing_notes` y proveedor interno
  quedan fuera del documento comercial. No propagues opciones sin aceptar a una
  operación, ni sobrescribas bookings consolidados.
- FCL/FTL: `quotation_containers`. Carga suelta: `quotation_cargo_lines`.
  Conserva fallbacks legacy solo donde estén justificados para registros antiguos.
- Columnas DATE: `formatDate` / `parseDateValue`; inputs de fecha local:
  `toDateInputValue`; diferencias de calendario: `calendarDaysUntil`.
  Timestamps de auditoría siguen siendo ISO. No reemplaces mecánicamente
  aritmética UTC explícita ni conversiones `datetime-local`. Miami tiene zona
  propia y debe verificarse también en cambios de horario.
- Una tasa explícita de 0 es válida; una tasa ausente no equivale a una exención.
  Usa `src/lib/tax.ts`. No recalcules facturas emitidas ni snapshots históricos
  como efecto lateral de corregir un helper.
- Mantén separación entre Production y Demo/Trial, bloqueo de correo en demo,
  idempotencia de avisos y documentos privados. Prueba formularios públicos con
  respuestas interceptadas; no envíes leads ni correos de prueba a producción.

## Cambios de UX y landing

Reutiliza componentes existentes (`Tabs`, `ConfirmDialog`, campos, Sonner) y
los assets en `public/brand` y `public/product`. Mantén CTAs ligados a acciones
reales, etiquetas visibles y navegación por teclado. Evita bloquear el acceso
con intros obligatorias. Comprueba móvil, foco, errores y recuperación tras fallos
de red. Las capturas demo deben identificarse; no inventes testimonios, cifras,
precios o compromisos de respuesta. Evalúa cambios visuales en navegador cuando
esté disponible y señala si solo hubo inspección de código.

## Validación y entrega

Ejecuta `npx.cmd tsc --noEmit` después del último cambio. Usa `npm.cmd test` para
las regresiones de helpers y sesión; el runner usa Node y TypeScript ya instalados.
Ejecuta ESLint sobre los archivos afectados y `npm.cmd run build` cuando cambien
rutas, componentes o lógica compartida. No ocultes deuda con desactivaciones
globales de reglas. Una suite con mocks no certifica RLS ni UAT autenticado.

Si cambia SQL, añade una migración nueva y la prueba pertinente en
`supabase/tests`, valida en una base local disponible y registra el despliegue
pendiente por separado. No edites una migración ya aplicada. Una revisión local
no autoriza por sí sola un push de base de datos o un despliegue.

Registra cada fix en `HARDENING.md` con ID, estado, archivos/SQL, validaciones,
pendientes y hash cuando exista. Informa qué quedó comprobado y qué requiere UAT;
no declares completado un flujo que no se haya probado. Describe los límites
reales de cobertura de una revisión, aunque TypeScript y build estén verdes.
