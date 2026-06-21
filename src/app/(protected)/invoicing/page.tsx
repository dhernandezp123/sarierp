'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, CheckCircle2, Clock, XCircle, AlertCircle, DollarSign, BarChart2, BookOpen, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { primaryButtonClass, cardClass } from '@/src/lib/ui-classes'
import { EstadoCuentaPdf, type EstadoCuentaData, type EstadoCuentaItem } from '@/src/components/pdf/estado-cuenta-pdf'

type InvoiceType = 'Proforma' | 'Factura' | 'Nota de Crédito' | 'Nota de Débito'

type Invoice = {
  id: string
  invoice_number: string | null
  invoice_type: InvoiceType
  status: string
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_email: string | null
  issue_date: string | null
  due_date: string | null
  total: number
  currency: string
  quotation_id: string | null
  parent_invoice_id: string | null
  invoice_payments: Array<{
    amount: number
    currency: string
    payment_date: string
  }> | null
}

type EcCompanySettings = {
  legal_name: string | null
  trade_name: string | null
  rtn: string | null
  address: string | null
  phone: string | null
}

type CierreSummary = {
  currency: string
  emitido: number
  cobrado: number
  porCobrar: number
  vencido: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  Borrador: { label: 'Borrador', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <FileText className="h-3 w-3" /> },
  Enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Clock className="h-3 w-3" /> },
  Aprobada: { label: 'Aprobada', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  Pagada: { label: 'Pagada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  Vencida: { label: 'Vencida', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: <AlertCircle className="h-3 w-3" /> },
  Anulada: { label: 'Anulada', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 line-through', icon: <XCircle className="h-3 w-3" /> },
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatUSD(amount: number, currency = 'USD') {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function InvoicingPage() {
  const router = useRouter()
  const { profile } = useUser()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | InvoiceType>('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCierre, setShowCierre] = useState(false)
  const today = new Date()
  const [cierreMes, setCierreMes] = useState(today.getMonth() + 1)
  const [cierreAnio, setCierreAnio] = useState(today.getFullYear())

  // Estado de cuenta
  const [showEC, setShowEC] = useState(false)
  const [ecClienteId, setEcClienteId] = useState('')
  const [ecCompany, setEcCompany] = useState<EcCompanySettings | null>(null)
  const [ecLoadingCompany, setEcLoadingCompany] = useState(false)
  const [ecPdfData, setEcPdfData] = useState<EstadoCuentaData | null>(null)

  async function fetchInvoices() {
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, status, cliente_id, cliente_nombre, cliente_rtn, cliente_email, issue_date, due_date, total, currency, quotation_id, parent_invoice_id, invoice_payments(amount, currency, payment_date)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) { toast.error('Error al cargar facturas'); setLoading(false); return }
    setInvoices((data || []) as Invoice[])
    setLoading(false)
  }

  useEffect(() => {
    // Initial client-side synchronization with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInvoices()
  }, [])

  const filtered = invoices.filter((inv) => {
    if (filterType !== 'all' && inv.invoice_type !== filterType) return false
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const matchNum = inv.invoice_number?.toLowerCase().includes(q)
      const matchClient = inv.cliente_nombre?.toLowerCase().includes(q)
      if (!matchNum && !matchClient) return false
    }
    return true
  })

  const totals = {
    pendiente: invoices.filter((i) => ['Enviada', 'Aprobada'].includes(i.status)).reduce((s, i) => s + i.total, 0),
    pagado: invoices.filter((i) => i.status === 'Pagada').reduce((s, i) => s + i.total, 0),
    vencido: invoices.filter((i) => i.status === 'Vencida').reduce((s, i) => s + i.total, 0),
  }

  const computeCierre = () => {
    const inPeriod = (dateValue: string | null) => {
      if (!dateValue) return false
      const [year, month] = dateValue.split('T')[0].split('-').map(Number)
      return year === cierreAnio && month === cierreMes
    }
    const amountByCurrency = new Map<string, Omit<CierreSummary, 'currency'>>()
    const ensureCurrency = (currency: string) => {
      if (!amountByCurrency.has(currency)) {
        amountByCurrency.set(currency, { emitido: 0, cobrado: 0, porCobrar: 0, vencido: 0 })
      }
      return amountByCurrency.get(currency)!
    }
    const activeInvoices = invoices.filter((invoice) => invoice.status !== 'Anulada')
    const periodDocuments = activeInvoices.filter((invoice) => inPeriod(invoice.issue_date))

    periodDocuments.forEach((invoice) => {
      if (invoice.invoice_type === 'Proforma') return
      const summary = ensureCurrency(invoice.currency || 'USD')
      const sign = invoice.invoice_type === 'Nota de Crédito' ? -1 : 1
      summary.emitido += sign * Number(invoice.total || 0)
    })

    activeInvoices.forEach((invoice) => {
      for (const payment of invoice.invoice_payments || []) {
        if (!inPeriod(payment.payment_date)) continue
        ensureCurrency(payment.currency || invoice.currency || 'USD').cobrado += Number(payment.amount || 0)
      }
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    periodDocuments
      .filter((invoice) => invoice.invoice_type === 'Factura')
      .forEach((invoice) => {
        const linkedNotes = activeInvoices.filter((note) => note.parent_invoice_id === invoice.id)
        const creditNotes = linkedNotes
          .filter((note) => note.invoice_type === 'Nota de Crédito')
          .reduce((sum, note) => sum + Number(note.total || 0), 0)
        const debitNotes = linkedNotes
          .filter((note) => note.invoice_type === 'Nota de Débito')
          .reduce((sum, note) => sum + Number(note.total || 0), 0)
        const paid = (invoice.invoice_payments || []).reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        )
        const balance = Math.max(0, Number(invoice.total || 0) - creditNotes + debitNotes - paid)
        const summary = ensureCurrency(invoice.currency || 'USD')
        summary.porCobrar += balance

        if (balance > 0 && invoice.due_date) {
          const [year, month, day] = invoice.due_date.split('T')[0].split('-').map(Number)
          const dueDate = new Date(year, month - 1, day)
          if (dueDate < today) summary.vencido += balance
        }
      })

    return {
      total: periodDocuments.length,
      summaries: Array.from(amountByCurrency.entries()).map(([currency, values]) => ({ currency, ...values })),
    }
  }

  const imprimirCierre = () => {
    const mes = MESES[cierreMes - 1]
    const s = computeCierre()
    const fmt = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const summaryCards = s.summaries.map((summary) => `
<h2>${summary.currency}</h2>
<div class="grid">
<div class="card"><div class="label">Total facturado</div><div class="value">${fmt(summary.emitido, summary.currency)}</div></div>
<div class="card"><div class="label">Cobrado</div><div class="value green">${fmt(summary.cobrado, summary.currency)}</div></div>
<div class="card"><div class="label">Por cobrar</div><div class="value amber">${fmt(summary.porCobrar, summary.currency)}</div></div>
<div class="card"><div class="label">Vencido</div><div class="value red">${fmt(summary.vencido, summary.currency)}</div></div>
</div>`).join('')
    const html = `<!DOCTYPE html><html><head><title>Cierre ${mes} ${cierreAnio}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b;max-width:700px;margin:0 auto}
.title{font-size:22px;font-weight:bold;margin-bottom:4px}.sub{color:#64748b;font-size:13px;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:28px}
.card{border:1px solid #e2e8f0;border-radius:8px;padding:16px}
.label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.value{font-size:22px;font-weight:bold}
.green{color:#16a34a}.amber{color:#b45309}.red{color:#dc2626}
.footer{font-size:11px;color:#94a3b8;margin-top:8px}
@media print{button{display:none}}</style></head><body>
<div class="title">Cierre del período</div>
<div class="sub">${mes} ${cierreAnio} &mdash; Sari Express &mdash; ${s.total} documentos</div>
${summaryCards || '<p>Sin movimientos para este período.</p>'}
<div class="footer">Generado por Sari Express ERP &middot; ${new Date().toLocaleDateString('es-HN')}</div>
<script>window.onload=()=>window.print()</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  // Clientes únicos para el selector del estado de cuenta
  const ecClientes = Array.from(
    invoices
      .filter((i) => i.cliente_id && i.cliente_nombre)
      .reduce((map, i) => {
        if (!map.has(i.cliente_id!)) map.set(i.cliente_id!, { id: i.cliente_id!, nombre: i.cliente_nombre!, rtn: i.cliente_rtn, email: i.cliente_email })
        return map
      }, new Map<string, { id: string; nombre: string; rtn: string | null; email: string | null }>())
      .values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  const openEC = async () => {
    setEcClienteId('')
    setEcPdfData(null)
    setShowEC(true)
    if (!ecCompany) {
      setEcLoadingCompany(true)
      const { data, error } = await supabase
        .from('company_settings')
        .select('legal_name, trade_name, rtn, address, phone')
        .limit(1).single()
      if (error) {
        toast.error('No se pudo cargar la configuración de la empresa')
        setEcLoadingCompany(false)
        return
      }
      if (data) setEcCompany(data as EcCompanySettings)
      setEcLoadingCompany(false)
    }
  }

  const buildEcPdf = (clienteId: string) => {
    const cliente = ecClientes.find((c) => c.id === clienteId)
    if (!cliente) return
    const clientDocuments = invoices.filter((invoice) => invoice.cliente_id === clienteId && invoice.status !== 'Anulada')
    const issuedStatuses = new Set(['Enviada', 'Aprobada', 'Pagada', 'Vencida'])
    const todayString = new Date().toISOString().split('T')[0]
    const items: EstadoCuentaItem[] = clientDocuments
      .filter((invoice) => invoice.invoice_type === 'Factura' && issuedStatuses.has(invoice.status))
      .map((invoice) => {
        const linkedNotes = clientDocuments.filter(
          (note) => note.parent_invoice_id === invoice.id && issuedStatuses.has(note.status)
        )
        const notasCredito = linkedNotes
          .filter((note) => note.invoice_type === 'Nota de Crédito')
          .reduce((sum, note) => sum + Number(note.total || 0), 0)
        const notasDebito = linkedNotes
          .filter((note) => note.invoice_type === 'Nota de Débito')
          .reduce((sum, note) => sum + Number(note.total || 0), 0)
        const pagado = (invoice.invoice_payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
        const totalAjustado = Math.max(0, Number(invoice.total || 0) - notasCredito + notasDebito)
        const saldo = Math.max(0, totalAjustado - pagado)
        const vencida = Boolean(invoice.due_date && invoice.due_date.split('T')[0] < todayString && saldo > 0)

        return {
          invoice_number: invoice.invoice_number,
          invoice_type: invoice.invoice_type,
          status: vencida ? 'Vencida' : 'Por vencer',
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          total_original: Number(invoice.total || 0),
          notas_credito: notasCredito,
          notas_debito: notasDebito,
          total_ajustado: totalAjustado,
          currency: invoice.currency,
          pagado,
          saldo,
        }
      })
      .filter((item) => item.saldo > 0.005)
    setEcPdfData({
      empresa: ecCompany?.legal_name || ecCompany?.trade_name || 'Sari Express',
      empresa_rtn: ecCompany?.rtn ?? null,
      empresa_dir: ecCompany?.address ?? null,
      empresa_tel: ecCompany?.phone ?? null,
      cliente_nombre: cliente.nombre,
      cliente_rtn: cliente.rtn ?? null,
      cliente_email: cliente.email ?? null,
      fecha_generacion: new Date().toISOString().split('T')[0],
      items,
    })
  }

  const ecBalances = ecPdfData
    ? Array.from(
        ecPdfData.items.reduce((map, item) => {
          map.set(item.currency, (map.get(item.currency) || 0) + item.saldo)
          return map
        }, new Map<string, number>())
      ).map(([currency, balance]) => ({ currency, balance }))
    : []
  const ecEmailSubject = ecPdfData
    ? `Estado de cuenta al ${ecPdfData.fecha_generacion.split('-').reverse().join('/')} - Sari Express`
    : ''
  const ecEmailBody = ecPdfData
    ? [
        `Estimado/a ${ecPdfData.cliente_nombre},`,
        '',
        'Adjuntamos su estado de cuenta actualizado.',
        ...ecBalances.map(({ currency, balance }) =>
          `Saldo pendiente: ${currency} ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ),
        '',
        'Por favor adjunte el PDF descargado antes de enviar este correo.',
        '',
        'Saludos cordiales,',
        'Sari Express',
      ].join('\n')
    : ''
  const ecMailto = ecPdfData?.cliente_email
    ? `mailto:${ecPdfData.cliente_email}?subject=${encodeURIComponent(ecEmailSubject)}&body=${encodeURIComponent(ecEmailBody)}`
    : ''

  if (loading) return <PageSkeleton cards={3} rows={6} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Finanzas
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Facturación</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Facturas, proformas, notas de crédito y débito.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['Admin', 'Finanzas', 'Contabilidad'].includes(profile?.rol || '') && (
            <button
              type="button"
              onClick={openEC}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <BookOpen className="h-4 w-4" />
              Estado de cuenta
            </button>
          )}
          {['Admin', 'Finanzas'].includes(profile?.rol || '') && (
            <button
              type="button"
              onClick={() => setShowCierre(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <BarChart2 className="h-4 w-4" />
              Cierre del mes
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/invoicing/new')}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Nueva factura
          </button>
        </div>
      </div>

      {showCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-[#0b1220]">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Cierre del período</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mes</label>
                <select
                  value={cierreMes}
                  onChange={(e) => setCierreMes(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Año</label>
                <select
                  value={cierreAnio}
                  onChange={(e) => setCierreAnio(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            {(() => {
              const s = computeCierre()
              const fmt = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              return (
                <div className="mb-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {s.summaries.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
                      Sin movimientos para este período.
                    </p>
                  ) : s.summaries.map((summary) => (
                    <div key={summary.currency}>
                      <p className="mb-1 text-xs font-bold text-slate-500">{summary.currency}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Facturado</p>
                          <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{fmt(summary.emitido, summary.currency)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Cobrado</p>
                          <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmt(summary.cobrado, summary.currency)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Por cobrar</p>
                          <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">{fmt(summary.porCobrar, summary.currency)}</p>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-800/50 dark:bg-rose-950/30">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Vencido</p>
                          <p className="mt-1 text-sm font-bold text-rose-700 dark:text-rose-300">{fmt(summary.vencido, summary.currency)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="flex gap-2">
              <button type="button" onClick={imprimirCierre} className={primaryButtonClass}>
                <BarChart2 className="h-4 w-4" />
                Imprimir
              </button>
              <button type="button" onClick={() => setShowCierre(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Estado de cuenta */}
      {showEC && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#0b1220]">
            <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Estado de cuenta</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Genera el PDF con las facturas pendientes del cliente seleccionado.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
              {ecLoadingCompany ? (
                <p className="text-sm text-slate-400">Cargando...</p>
              ) : (
                <select
                  value={ecClienteId}
                  onChange={(e) => {
                    setEcClienteId(e.target.value)
                    setEcPdfData(null)
                    if (e.target.value) buildEcPdf(e.target.value)
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">— Seleccionar cliente —</option>
                  {ecClientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              )}
            </div>

            {ecPdfData && ecClienteId && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                {ecPdfData.items.length === 0 ? (
                  <p className="text-xs text-slate-500">Este cliente no tiene facturas pendientes.</p>
                ) : (
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>{ecPdfData.items.length} factura{ecPdfData.items.length !== 1 ? 's' : ''} pendiente{ecPdfData.items.length !== 1 ? 's' : ''}</p>
                    {ecBalances.map(({ currency, balance }) => (
                      <p key={currency} className="font-semibold text-slate-700 dark:text-slate-200">
                        {currency} {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {ecPdfData && ecPdfData.items.length > 0 ? (
                <PDFDownloadLink
                  document={<EstadoCuentaPdf data={ecPdfData} />}
                  fileName={`estado-cuenta-${ecPdfData.cliente_nombre.replace(/\s+/g, '-').toLowerCase()}-${ecPdfData.fecha_generacion}.pdf`}
                >
                  {({ loading: pdfLoading }) => (
                    <button
                      type="button"
                      disabled={pdfLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      <BookOpen className="h-4 w-4" />
                      {pdfLoading ? 'Generando...' : 'Descargar PDF'}
                    </button>
                  )}
                </PDFDownloadLink>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-40 dark:bg-white dark:text-slate-900"
                >
                  <BookOpen className="h-4 w-4" />
                  Descargar PDF
                </button>
              )}
              {ecPdfData && ecPdfData.items.length > 0 && ecMailto && (
                <a
                  href={ecMailto}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  <Mail className="h-4 w-4" />
                  Preparar correo
                </a>
              )}
              <button
                type="button"
                onClick={() => { setShowEC(false); setEcPdfData(null); setEcClienteId('') }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
            {ecPdfData && ecPdfData.items.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Descargue el PDF y adjúntelo manualmente al correo antes de enviarlo.
              </p>
            )}
          </div>
        </div>
      )}

      {/* KPI mini cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Por cobrar</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatUSD(totals.pendiente)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-800/50 dark:bg-emerald-950/30">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cobrado</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatUSD(totals.pagado)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/30">
          <p className="text-xs text-slate-500 dark:text-slate-400">Vencido</p>
          <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-300">{formatUSD(totals.vencido)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="all">Todos los tipos</option>
          <option value="Proforma">Proforma</option>
          <option value="Factura">Factura</option>
          <option value="Nota de Crédito">Nota de Crédito</option>
          <option value="Nota de Débito">Nota de Débito</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="all">Todos los estados</option>
          {Object.keys(STATUS_CONFIG).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={`${cardClass} py-16 text-center`}>
          <DollarSign className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            {invoices.length === 0 ? 'No hay facturas aún.' : 'Sin resultados para los filtros aplicados.'}
          </p>
          {invoices.length === 0 && (
            <button
              type="button"
              onClick={() => router.push('/invoicing/new')}
              className={`mt-4 ${primaryButtonClass}`}
            >
              <Plus className="h-4 w-4" />
              Crear primera factura
            </button>
          )}
        </div>
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 pr-4">Número</th>
                  <th className="pb-3 pr-4">Tipo</th>
                  <th className="pb-3 pr-4">Cliente</th>
                  <th className="pb-3 pr-4">Emisión</th>
                  <th className="pb-3 pr-4">Vencimiento</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['Borrador']
                  const isOverdue = inv.status === 'Enviada' && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/invoicing/${inv.id}`)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3 pr-4 font-semibold text-blue-600 dark:text-blue-400">
                        {inv.invoice_number || <span className="text-slate-400 italic">Sin número</span>}
                      </td>
                      <td className="pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          inv.invoice_type === 'Proforma' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : inv.invoice_type === 'Factura' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : inv.invoice_type === 'Nota de Crédito' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                        }`}>
                          {inv.invoice_type === 'Nota de Crédito' ? 'NC' : inv.invoice_type === 'Nota de Débito' ? 'ND' : inv.invoice_type}
                        </span>
                      </td>
                      <td className="pr-4 text-slate-700 dark:text-slate-300">
                        {inv.cliente_nombre || '—'}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className={`pr-4 ${isOverdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {formatDate(inv.due_date)}
                        {isOverdue && <span className="ml-1 text-xs">⚠</span>}
                      </td>
                      <td className="pr-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${sc.color}`}>
                          {sc.icon}
                          {sc.label}
                        </span>
                      </td>
                      <td className="text-right font-semibold text-slate-900 dark:text-white">
                        {formatUSD(inv.total, inv.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
