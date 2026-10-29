# Mapa de decisiones del ERP

Todas las rutas siguientes son relativas a la raíz del repositorio. Usa este
mapa para encontrar implementaciones; confirma siempre los consumidores actuales.

| Área | Fuentes que conviene revisar juntas |
| --- | --- |
| Sesión y acceso | `src/proxy.ts`, `src/hooks/useUser.tsx`, `src/lib/permissions.ts`, `src/lib/auth-redirect.ts`, `src/app/(protected)/layout.tsx`, `src/app/portal/layout.tsx` |
| Cotizaciones | `src/lib/quotation-status.ts`, `src/lib/quotation-products.ts`, `src/app/(protected)/quotations/`, `src/hooks/useMiamiQuotation.ts` |
| Pricing y opciones | `src/app/(protected)/pricing-comparison/page.tsx`, `src/lib/quotation-options.ts`, `src/lib/pricing-validation.ts`, `src/components/pricing/QuotationOptionsPanel.tsx` |
| PDF comercial | `src/components/pdf/quotation-pdf.tsx`, snapshots en `src/lib/quotation-options.ts`; verificar notas generales y por opción |
| Operaciones | `src/lib/shipment-service.ts`, `src/lib/operation-status.ts`, `src/lib/booking-status.ts`, `src/lib/booking-document-summary.ts`, `src/lib/shipment-events.ts`, `src/components/operations/` |
| Cálculos | `src/lib/tax.ts`, `src/lib/insurance-calculator.ts`, `src/lib/miami-lcl-calculator.ts`, `src/lib/miami-pricing-items.ts` |
| Facturación y cobranza | `src/app/(protected)/invoicing/` (listado, `new`, `[id]`, `drafts`, `voids`, `collections`, `statements`), `src/components/invoicing/`, `src/lib/invoice-list.ts`, `invoice-fiscal.ts`, `invoice-drafts.ts`, `fiscal-void.ts`, `fiscal-offices.ts`, `cai-validation.ts`, `src/app/(protected)/settings/cai/` |
| Contabilidad y tesorería | `src/app/(protected)/accounting/`, `src/components/accounting/`, `src/lib/accounting.ts`, `accounting-books.ts`, `finance-report.ts`, `treasury-report.ts`, `bank-import.ts`, `financial-export.ts` |
| Pagos y costos | `src/app/(protected)/accounts-payable/`, `src/app/(protected)/cost-validation/`, `src/app/(protected)/financial-dashboard/` (rentabilidad cotizada, no saldos reales) |
| UI de Finanzas | `src/components/invoicing/FinanceWorkspace.tsx` y [convenciones de UI](ui-conventions.md) |
| Alertas y fechas | `src/lib/format.ts`, `src/lib/alerts.ts`, `src/lib/tarifa-expiry-check.ts`, `src/lib/notifications.ts` |
| Correo y soporte | `src/app/api/miami/package-assignment-email/route.ts`, `src/app/api/support/notify/route.ts`, `src/lib/email-provider-response.ts`, `src/lib/support-attachments.ts`, `docs/support-ticketing-runbook.md` |
| Landing | `src/app/page.tsx`, `src/components/marketing/ForwardersLanding.tsx` (contenido servidor), `LandingHeader.tsx`, `LandingContact.tsx`, `ProductShowcase.tsx`, `landing-content.ts` y `landing.module.css` en el mismo directorio; `src/lib/platform-branding.ts`, `src/components/ui/tabs.tsx`, `src/components/ui/dialog.tsx`, `public/product/` |

## SQL y pruebas

`supabase/migrations` contiene el historial canónico; `sql/` también contiene
scripts históricos, no asumas que su estado representa el esquema desplegado.
Consulta las migraciones más recientes que reemplazan una función, no solamente
su definición en el baseline. Para pricing, las pruebas incluyen
`quotation_commercial_options.sql`, `phase5_atomic_agent_selection.sql` y
`phase5_pricing_delete_rls.sql`. Para Finanzas: `phase4_*`, `accounting_*`,
`cai_*`, `fiscal_*`, `customer_collections.sql`, `finance_reporting_and_banks.sql`
e `invoice_drafts_and_master_review.sql`.

Los guiones de aceptación existentes están en `docs/uat/`. Las pruebas de Node
en `tests/` ejercitan helpers reales y el orden de respuestas del proveedor de
sesión con dependencias simuladas; no usan credenciales ni escriben en Supabase.
