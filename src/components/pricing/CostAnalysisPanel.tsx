'use client'

import { analyzeCosts, containerCount, costLineTotal, freightBreakdown, type CostPricingLine, type ProviderCostLine, type CostContainer, type FreightSource } from '@/src/lib/cost-analysis'
import { cardClass } from '@/src/lib/ui-classes'

export const costMoney = (value: number | null, currency: string) => value === null ? 'Pendiente / sin base' : `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function CostAnalysisPanel({ pricing, invoices = [], containers = [], agent = null, validated = false, showRegistered = true }: {
  pricing: CostPricingLine[]; invoices?: ProviderCostLine[]; containers?: CostContainer[]
  agent?: FreightSource | null; validated?: boolean; showRegistered?: boolean
}) {
  const groups = analyzeCosts(pricing, invoices, validated)
  const count = containerCount(containers)
  const breakdown = freightBreakdown(pricing, containers, agent)
  return <section className="space-y-4" aria-label="Análisis de costos">
    {count !== null && <p className="text-sm">Carga cotizada: {containers.map(c => `${c.quantity} × ${c.container_type_name}`).join(' · ')}. Los promedios distribuyen el total entre {count} contenedores; no son costos individuales asignados a un BL o booking.</p>}
    {!groups.length && <p className={cardClass}>Sin líneas de costo disponibles.</p>}
    {groups.map(group => <div key={group.currency} className={`${cardClass} space-y-4 min-w-0`}>
      <h2 className="text-xl font-bold">Detalle de costos — {group.currency}</h2>
      {showRegistered && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        {group.closed ? 'Validación financiera registrada. Comparación de importes sin impuestos de proveedor.' : group.base === null ? 'Costos pendientes de registrar. La ausencia de facturas no representa ahorro ni utilidad real.' : 'Resultado provisional: las facturas registradas pueden ser parciales. Confirma los cargos restantes antes de validar.'}
        {' '}{group.rows.length - group.missing.length} de {group.rows.length} cargos con registros vinculados (no certifica facturación completa).
        {group.unmatched.length > 0 && ` ${group.unmatched.length} registros sin conciliar con un cargo en la misma moneda.`}
        {group.invalid && ' Hay importes o monedas sin base comparable; revisa los datos.'}
      </p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Costo cotizado', group.quoted], ['Venta cotizada sin impuesto', group.sale],
          ['Utilidad cotizada', group.quotedProfit],
          ...(count !== null ? [['Promedio cotizado / contenedor', group.quoted === null ? null : group.quoted / count]] : []),
          ...(showRegistered ? [
            ['Costo registrado sin impuesto', group.base], ['Impuestos de proveedor', group.tax],
            ['Total registrado con impuesto', group.payable],
            [group.closed ? 'Utilidad con costos validados, sin impuestos' : 'Utilidad provisional con costos registrados, sin impuestos', group.registeredProfit],
          ] : []),
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1 font-bold tabular-nums ${typeof value === 'number' && value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{costMoney(value as number | null, group.currency)}</p>
        </div>)}
      </div>
      <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-100 text-left dark:bg-slate-800"><tr>
            <th className="p-3">Concepto / proveedor</th><th className="p-3 text-right">Cantidad cotizada</th>
            <th className="p-3 text-right">Costo unitario</th><th className="p-3 text-right">Costo total</th>
            {count !== null && <th className="p-3 text-right">Promedio / contenedor</th>}
            <th className="p-3 text-right">Utilidad cotizada</th>
            {showRegistered && <><th className="p-3 text-right">Registrado sin impuesto</th><th className="p-3">Conciliación</th><th className="p-3 text-right">Variación sin impuesto</th></>}
          </tr></thead>
          <tbody>{group.rows.map(row => <tr key={row.item.id} className="border-t dark:border-slate-700">
            <td className="p-3"><p className="font-medium">{row.item.description}</p><p className="text-xs text-slate-500 dark:text-slate-400">{row.item.supplier || 'Proveedor pendiente'}</p></td>
            <td className="p-3 text-right">{row.item.quantity ?? 'Sin cantidad'}</td>
            <td className="p-3 text-right tabular-nums">{costMoney(costLineTotal(row.item.cost_amount, 1), group.currency)}</td>
            <td className="p-3 text-right tabular-nums">{costMoney(row.quoted, group.currency)}</td>
            {count !== null && <td className="p-3 text-right tabular-nums">{costMoney(row.quoted === null ? null : row.quoted / count, group.currency)}</td>}
            <td className={`p-3 text-right tabular-nums ${row.profit !== null && row.profit < 0 ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{costMoney(row.profit, group.currency)}{row.profit !== null && row.profit < 0 && <p className="text-xs">Pérdida cotizada</p>}</td>
            {showRegistered && <><td className="p-3 text-right tabular-nums">{costMoney(row.base, group.currency)}</td>
              <td className="p-3">{!row.linked.length ? 'Sin registro vinculado' : group.closed ? 'Validado' : `${row.linked.length} registro(s); confirmar alcance`}</td>
              <td className="p-3 text-right tabular-nums">{group.closed ? costMoney(row.variance, group.currency) : 'Pendiente de cierre'}</td></>}
          </tr>)}</tbody>
        </table>
      </div>
      {showRegistered && <p className="text-sm text-slate-600 dark:text-slate-300">Presupuesto de cargos sin registros vinculados: {costMoney(group.unregisteredBudget, group.currency)}. No incluye el saldo pendiente de facturas parciales ni es una proyección de cierre. Los impuestos se muestran separados; este análisis no determina su tratamiento contable ni refleja pagos.</p>}
    </div>)}
    {breakdown && <details className={cardClass}>
      <summary className="cursor-pointer font-semibold">Composición del flete {agent?.carrier} — {costMoney(breakdown.total, breakdown.currency)}</summary>
      <ul className="mt-3 space-y-2 text-sm">
        <li>Flete marítimo total: {costMoney(breakdown.ocean, breakdown.currency)}; promedio: {costMoney(breakdown.ocean / breakdown.count, breakdown.currency)} por contenedor.</li>
        <li>Profit Share del agente: {breakdown.count} × {costMoney(breakdown.ps, breakdown.currency)} = {costMoney(breakdown.ps * breakdown.count, breakdown.currency)}. Forma parte del costo.</li>
        <li>Documentación: {breakdown.mbl} MBL × {costMoney(breakdown.fee, breakdown.currency)} = {costMoney(breakdown.mbl * breakdown.fee, breakdown.currency)}; promedio: {costMoney(breakdown.mbl * breakdown.fee / breakdown.count, breakdown.currency)} por contenedor.</li>
      </ul>
      <p className="mt-3 text-xs text-slate-500">Desglose de la tarifa seleccionada actual, conciliado con el total de flete guardado. No agrega cargos al presupuesto.</p>
    </details>}
  </section>
}
