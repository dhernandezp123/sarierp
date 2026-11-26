'use client'
import Link from 'next/link'
import type {InvoiceCourtesy} from '@/src/lib/invoice-courtesies'
import {courtesyStatus,courtesyAmount} from '@/src/lib/invoice-courtesies'
import {formatMoney} from '@/src/lib/format'
import {cardClass,secondaryButtonClass} from '@/src/lib/ui-classes'
export function InvoiceCourtesyAmounts({row}:{row:InvoiceCourtesy}){
 const s=row.line_snapshot
 return <p className="text-xs text-slate-500">Cantidad: {s.quantity}{s.net_amount!==undefined&&<> · Base neta: {formatMoney(Number(s.net_amount),s.currency)} · ISV: {formatMoney(Number(s.tax_amount||0),s.currency)}</>} · Importes en moneda de origen, antes de conversión.</p>
}
export function InvoiceCourtesyList({rows,loading,error,dirty,reload}:{rows:InvoiceCourtesy[];loading:boolean;error:string;dirty:boolean;reload:()=>void}){
 return <section className={`${cardClass} space-y-3`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Cortesías de este borrador</h2><button type="button" className={secondaryButtonClass} onClick={reload}>Actualizar cortesías</button></div>
 <p className="text-xs text-slate-500">Solo las aprobaciones vigentes se excluyen del importe a facturar. Guardar cambios invalida la revisión anterior. <Link className="underline" href="/invoicing/courtesies">Abrir solicitudes de cortesía</Link></p>
 {dirty&&rows.length>0&&<p className="text-sm text-amber-700">Hay cambios sin guardar; las cortesías anteriores no se aplican a esta versión.</p>}
 {loading?<p role="status">Consultando cortesías…</p>:error?<p role="alert" className="text-red-600">{error}</p>:!rows.length?<p className="text-sm text-slate-500">Sin solicitudes. Usa el botón de cortesía de cada línea.</p>:<ul className="space-y-2">{rows.map(row=><li key={row.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{row.line_snapshot.description} · {formatMoney(courtesyAmount(row),row.line_snapshot.currency)}</p><InvoiceCourtesyAmounts row={row}/><p>{courtesyStatus(row)} · {row.reason}</p>{row.review_reason&&<p className="text-xs text-slate-500">Decisión: {row.review_reason}</p>}</li>)}</ul>}
 </section>
}
