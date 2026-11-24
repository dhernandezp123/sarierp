'use client'

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Calculator, CheckCircle2, ChevronDown, CircleDashed, Clock3, FileText, Info, Landmark, Minus, Receipt, Ship, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { analyzeCosts, containerCount, costLineTotal, freightBreakdown, type CostPricingLine, type ProviderCostLine, type CostContainer, type FreightSource } from '@/src/lib/cost-analysis'
import { formatMoney } from '@/src/lib/format'
import { cardClass } from '@/src/lib/ui-classes'
import { FinanceMetric, type FinanceTone } from '@/src/components/invoicing/FinanceWorkspace'
import { CostNotice, CostProgress, CostStatusBadge, type CostTone } from './CostStatus'

export const costMoney = (value: number | null, currency: string) => value === null ? 'Pendiente / sin base' : formatMoney(value, currency)

type Group = ReturnType<typeof analyzeCosts>[number]
type Row = Group['rows'][number]

const profitTone = (value: number | null): FinanceTone => value === null ? 'slate' : value < 0 ? 'red' : value > 0 ? 'emerald' : 'slate'
const profitIcon = (value: number | null): LucideIcon => value !== null && value < 0 ? TrendingDown : TrendingUp

function groupState(group: Group): { tone: CostTone; label: string; icon: LucideIcon } {
  if (group.closed) return { tone: 'emerald', label: 'Validado', icon: CheckCircle2 }
  if (group.invalid) return { tone: 'red', label: 'Revisar datos', icon: AlertTriangle }
  if (group.base === null) return { tone: 'amber', label: 'Sin costos registrados', icon: CircleDashed }
  if (group.reconciled) return { tone: 'sky', label: 'Conciliado, por validar', icon: Clock3 }
  return { tone: 'amber', label: 'Provisional', icon: Clock3 }
}

function reconciliation(row: Row, closed: boolean): { tone: CostTone; label: string; icon: LucideIcon } {
  if (row.ownZeroCost) return closed ? { tone: 'emerald', label: 'Honorarios propios: cero validado', icon: CheckCircle2 } : { tone: 'sky', label: 'Honorarios propios: confirmar costo cero', icon: Info }
  if (!row.linked.length) return { tone: 'red', label: 'Sin registro vinculado', icon: CircleDashed }
  if (closed) return { tone: 'emerald', label: 'Validado', icon: CheckCircle2 }
  return { tone: 'amber', label: `${row.linked.length} registro(s); confirmar alcance`, icon: Clock3 }
}

/** Variación = registrado − cotizado: positiva es sobrecosto, negativa es ahorro confirmado al cierre. */
function Variance({ value, currency, closed }: { value: number | null; currency: string; closed: boolean }) {
  if (!closed) return <span className="text-xs text-slate-400 dark:text-slate-500">Pendiente de cierre</span>
  if (value === null) return <span className="text-slate-400">{costMoney(value, currency)}</span>
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  const tone = value > 0 ? 'text-red-600 dark:text-red-400' : value < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
  return <span className={`inline-flex items-center justify-end gap-1 font-semibold ${tone}`}>
    <Icon aria-hidden="true" className="h-3.5 w-3.5" />{costMoney(value, currency)}
    <span className="sr-only">{value > 0 ? ' (sobrecosto)' : value < 0 ? ' (menor costo)' : ' (sin variación)'}</span>
  </span>
}

const th = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

export function CostAnalysisPanel({ pricing, invoices = [], containers = [], agent = null, validated = false, showRegistered = true, ownZeroCostIds = [] }: {
  pricing: CostPricingLine[]; invoices?: ProviderCostLine[]; containers?: CostContainer[]
  agent?: FreightSource | null; validated?: boolean; showRegistered?: boolean; ownZeroCostIds?: string[]
}) {
  const groups = analyzeCosts(pricing, invoices, validated, ownZeroCostIds)
  const count = containerCount(containers)
  const breakdown = freightBreakdown(pricing, containers, agent)
  return <section className="space-y-4" aria-label="Análisis de costos">
    {count !== null && <CostNotice tone="sky" icon={Boxes}>Carga cotizada: <strong className="font-semibold">{containers.map(c => `${c.quantity} × ${c.container_type_name}`).join(' · ')}</strong>. Los promedios distribuyen el total entre {count} contenedores; no son costos individuales asignados a un BL o booking.</CostNotice>}
    {!groups.length && <p className={`${cardClass} text-sm text-slate-500 dark:text-slate-400`}>Sin líneas de costo disponibles.</p>}
    {groups.map(group => {
      const state = groupState(group)
      const covered = group.rows.length - group.missing.length
      const quoted: [string, number | null, LucideIcon, FinanceTone][] = [
        ['Costo cotizado', group.quoted, Calculator, 'slate'],
        ['Venta cotizada sin impuesto', group.sale, Receipt, 'sky'],
        ['Utilidad cotizada', group.quotedProfit, profitIcon(group.quotedProfit), profitTone(group.quotedProfit)],
        ...(count !== null ? [['Promedio cotizado / contenedor', group.quoted === null ? null : group.quoted / count, Boxes, 'slate'] as [string, number | null, LucideIcon, FinanceTone]] : []),
      ]
      const registered: [string, number | null, LucideIcon, FinanceTone][] = [
        ['Costo registrado sin impuesto', group.base, FileText, group.base === null ? 'amber' : 'slate'],
        ['Impuestos de proveedor', group.tax, Landmark, 'slate'],
        ['Total registrado con impuesto', group.payable, Wallet, 'slate'],
        [group.closed ? 'Utilidad con costos validados, sin impuestos' : 'Utilidad provisional con costos registrados, sin impuestos', group.registeredProfit, profitIcon(group.registeredProfit), group.closed ? profitTone(group.registeredProfit) : group.registeredProfit !== null && group.registeredProfit < 0 ? 'red' : 'amber'],
      ]
      return <div key={group.currency} className={`${cardClass} min-w-0 space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">Detalle de costos — {group.currency}</h2>
          {showRegistered && <CostStatusBadge tone={state.tone} icon={state.icon}>{state.label}</CostStatusBadge>}
        </div>
        {showRegistered && <CostNotice role="status" tone={state.tone} icon={state.icon}>
          {group.closed ? 'Validación financiera registrada. Comparación de importes sin impuestos de proveedor.' : group.base === null ? 'Costos pendientes de registrar. La ausencia de facturas no representa ahorro ni utilidad real.' : 'Resultado provisional: las facturas registradas pueden ser parciales. Confirma los cargos restantes antes de validar.'}
          {' '}{covered} de {group.rows.length} cargos {ownZeroCostIds.length ? 'con costo conciliable o con honorarios propios de costo externo cero' : 'con registros vinculados'} (no certifica facturación completa).
          {group.unmatched.length > 0 && ` ${group.unmatched.length} registros sin conciliar con un cargo en la misma moneda.`}
          {group.invalid && ' Hay importes o monedas sin base comparable; revisa los datos.'}
          {group.rows.length > 0 && <div className="mt-3 max-w-md"><CostProgress done={covered} total={group.rows.length} label="Cargos con registro" tone={state.tone} /></div>}
        </CostNotice>}
        <div className="space-y-2">
          {showRegistered && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Presupuesto cotizado</p>}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {quoted.map(([label, value, icon, tone]) => <FinanceMetric key={label} label={label} value={costMoney(value, group.currency)} icon={icon} tone={tone} />)}
          </div>
        </div>
        {showRegistered && <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Facturas de proveedor</p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {registered.map(([label, value, icon, tone]) => <FinanceMetric key={label} label={label} value={costMoney(value, group.currency)} icon={icon} tone={tone} />)}
          </div>
        </div>}
        <div className="relative overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700" tabIndex={0} role="region" aria-label={`Cargos en ${group.currency}, desplazamiento horizontal`}>
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/60"><tr>
              <th scope="col" className={th}>Concepto / proveedor</th><th scope="col" className={`${th} text-right`}>Cantidad cotizada</th>
              <th scope="col" className={`${th} text-right`}>Costo unitario</th><th scope="col" className={`${th} text-right`}>Costo total</th>
              {count !== null && <th scope="col" className={`${th} text-right`}>Promedio / contenedor</th>}
              <th scope="col" className={`${th} text-right`}>Utilidad cotizada</th>
              {showRegistered && <><th scope="col" className={`${th} text-right`}>Registrado sin impuesto</th><th scope="col" className={th}>Conciliación</th><th scope="col" className={`${th} text-right`}>Variación sin impuesto</th></>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{group.rows.map(row => {
              const status = reconciliation(row, group.closed)
              return <tr key={row.item.id} className="align-top transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3"><p className="font-medium text-slate-900 dark:text-white">{row.item.description}</p><p className="text-xs text-slate-500 dark:text-slate-400">{row.item.supplier || 'Proveedor pendiente'}</p></td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{row.item.quantity ?? 'Sin cantidad'}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{costMoney(costLineTotal(row.item.cost_amount, 1), group.currency)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums whitespace-nowrap">{costMoney(row.quoted, group.currency)}</td>
                {count !== null && <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">{costMoney(row.quoted === null ? null : row.quoted / count, group.currency)}</td>}
                <td className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${row.profit !== null && row.profit < 0 ? 'font-bold text-red-600 dark:text-red-400' : row.profit !== null && row.profit > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{costMoney(row.profit, group.currency)}{row.profit !== null && row.profit < 0 && <p className="text-xs">Pérdida cotizada</p>}</td>
                {showRegistered && <><td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{costMoney(row.base, group.currency)}</td>
                  <td className="px-3 py-3"><CostStatusBadge tone={status.tone} icon={status.icon}>{status.label}</CostStatusBadge></td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap"><Variance value={row.variance} currency={group.currency} closed={group.closed} /></td></>}
              </tr>
            })}</tbody>
          </table>
        </div>
        {showRegistered && <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"><Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Presupuesto de cargos sin registros vinculados: <strong className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">{costMoney(group.unregisteredBudget, group.currency)}</strong>. No incluye el saldo pendiente de facturas parciales ni es una proyección de cierre. Los impuestos se muestran separados; este análisis no determina su tratamiento contable ni refleja pagos.</span></p>}
      </div>
    })}
    {breakdown && <details className={`${cardClass} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900 dark:text-white [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Ship aria-hidden="true" className="h-[18px] w-[18px]" /></span>Composición del flete {agent?.carrier} — <span className="tabular-nums">{costMoney(breakdown.total, breakdown.currency)}</span></span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <li className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">Flete marítimo total: {costMoney(breakdown.ocean, breakdown.currency)}; promedio: {costMoney(breakdown.ocean / breakdown.count, breakdown.currency)} por contenedor.</li>
        <li className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">Profit Share del agente: {breakdown.count} × {costMoney(breakdown.ps, breakdown.currency)} = {costMoney(breakdown.ps * breakdown.count, breakdown.currency)}. Forma parte del costo.</li>
        <li className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">Documentación: {breakdown.mbl} MBL × {costMoney(breakdown.fee, breakdown.currency)} = {costMoney(breakdown.mbl * breakdown.fee, breakdown.currency)}; promedio: {costMoney(breakdown.mbl * breakdown.fee / breakdown.count, breakdown.currency)} por contenedor.</li>
      </ul>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Desglose de la tarifa seleccionada actual, conciliado con el total de flete guardado. No agrega cargos al presupuesto.</p>
    </details>}
  </section>
}
