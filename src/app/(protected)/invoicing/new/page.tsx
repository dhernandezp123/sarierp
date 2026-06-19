'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronLeft, ShieldCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import {
  primaryButtonClass,
  secondaryButtonClass,
  cardClass,
  fieldClass,
} from '@/src/lib/ui-classes'

type InvoiceItem = {
  id: string
  description: string
  quantity: string
  unit_price: string
  amount: number
  isv_rate: 0 | 15 | 18
}

type Cliente = {
  id: string
  nombre: string
  rtn: string | null
  direccion: string | null
  email: string | null
}

type Quotation = {
  id: string
  quotation_number: string | null
  clientes: { nombre: string | null }[] | { nombre: string | null } | null
  total_sale: number | null
}

type CaiRange = {
  id: string
  cai: string
  rango_desde: string
  rango_hasta: string
  fecha_limite_emision: string
  lugar_emision: string | null
}

function newItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit_price: '0',
    amount: 0,
    isv_rate: 15,
  }
}

function reqClass(submitted: boolean, value: string) {
  return submitted && !value ? 'border-red-400 dark:border-red-500' : ''
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function NewInvoicePage() {
  const router = useRouter()
  const { user } = useUser()
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const [invoiceType, setInvoiceType] = useState<'Proforma' | 'Factura'>('Factura')
  const [clienteId, setClienteId] = useState('')
  const [quotationId, setQuotationId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [exchangeRate, setExchangeRate] = useState('25.30')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([newItem()])

  // SAR fields
  const [activeCai, setActiveCai] = useState<CaiRange | null>(null)
  const [esExonerado, setEsExonerado] = useState(false)
  const [ordenCompraExenta, setOrdenCompraExenta] = useState('')
  const [noConstanciaExonerado, setNoConstanciaExonerado] = useState('')
  const [noRegistroSag, setNoRegistroSag] = useState('')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('clientes').select('id, nombre, rtn, direccion, email').order('nombre'),
      supabase.from('cai_ranges').select('*').eq('is_active', true).limit(1).single(),
      supabase.from('company_settings').select('exchange_rate_usd_hnl').limit(1).single(),
    ]).then(([clientesRes, caiRes, settingsRes]) => {
      setClientes((clientesRes.data || []) as Cliente[])
      if (caiRes.data) setActiveCai(caiRes.data as CaiRange)
      if (settingsRes.data?.exchange_rate_usd_hnl) {
        setExchangeRate(String(settingsRes.data.exchange_rate_usd_hnl))
      }
    })
  }, [])

  useEffect(() => {
    if (!clienteId) { setQuotations([]); setQuotationId(''); return }
    const c = clientes.find((x) => x.id === clienteId) || null
    setSelectedCliente(c)
    supabase
      .from('quotations')
      .select('id, quotation_number, clientes(nombre), total_sale')
      .eq('cliente_id', clienteId)
      .eq('status', 'Ganada')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setQuotations((data || []) as Quotation[]))
  }, [clienteId, clientes])

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const updated = { ...it, [field]: value }
        const qty = parseFloat(String(updated.quantity)) || 0
        const price = parseFloat(String(updated.unit_price)) || 0
        updated.amount = qty * price
        return updated
      })
    )
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  // Totals breakdown (SAR)
  const importeExento = items.filter((i) => i.isv_rate === 0).reduce((s, i) => s + i.amount, 0)
  const importeGravado15 = items.filter((i) => i.isv_rate === 15).reduce((s, i) => s + i.amount, 0)
  const importeGravado18 = items.filter((i) => i.isv_rate === 18).reduce((s, i) => s + i.amount, 0)
  const isv15Amount = importeGravado15 * 0.15
  const isv18Amount = importeGravado18 * 0.18
  const subtotal = importeExento + importeGravado15 + importeGravado18
  const taxAmount = isv15Amount + isv18Amount
  const total = subtotal + taxAmount
  const totalLps = currency === 'USD' ? total * (parseFloat(exchangeRate) || 1) : total

  const generateNumber = async (type: 'Proforma' | 'Factura'): Promise<string> => {
    if (type === 'Proforma') {
      const now = new Date()
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
      const prefix = `SARI-PRO-${ym}-`
      const { data } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('invoice_type', 'Proforma')
        .like('invoice_number', `${prefix}%`)
        .order('invoice_number', { ascending: false })
        .limit(1)
      const last = data?.[0]?.invoice_number?.replace(prefix, '')
      const seq = last ? parseInt(last, 10) + 1 : 1
      return `${prefix}${String(seq).padStart(3, '0')}`
    }

    // Factura: SAR format within active CAI range
    if (!activeCai) {
      // Fallback to SARI-FAC format if no CAI configured
      const now = new Date()
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
      const prefix = `SARI-FAC-${ym}-`
      const { data } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('invoice_type', 'Factura')
        .like('invoice_number', `${prefix}%`)
        .order('invoice_number', { ascending: false })
        .limit(1)
      const last = data?.[0]?.invoice_number?.replace(prefix, '')
      const seq = last ? parseInt(last, 10) + 1 : 1
      return `${prefix}${String(seq).padStart(3, '0')}`
    }

    // SAR sequential within rango
    const lastDash = activeCai.rango_desde.lastIndexOf('-')
    const prefix = activeCai.rango_desde.substring(0, lastDash + 1)
    const startNum = parseInt(activeCai.rango_desde.substring(lastDash + 1), 10)
    const endNum = parseInt(activeCai.rango_hasta.substring(lastDash + 1), 10)
    const digits = activeCai.rango_desde.length - lastDash - 1

    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('cai', activeCai.cai)
      .eq('invoice_type', 'Factura')
      .order('invoice_number', { ascending: false })
      .limit(1)

    let nextNum: number
    if (data?.[0]?.invoice_number) {
      const lastDashUsed = data[0].invoice_number.lastIndexOf('-')
      nextNum = parseInt(data[0].invoice_number.substring(lastDashUsed + 1), 10) + 1
    } else {
      nextNum = startNum
    }

    if (nextNum > endNum) {
      throw new Error('El rango CAI está agotado. Registra un nuevo rango antes de emitir facturas.')
    }

    return `${prefix}${String(nextNum).padStart(digits, '0')}`
  }

  const handleSave = async () => {
    setSubmitted(true)
    if (!clienteId || !issueDate || items.length === 0) {
      toast.error('Completa los campos requeridos')
      return
    }
    if (items.some((it) => !it.description)) {
      toast.error('Todas las líneas deben tener descripción')
      return
    }
    if (invoiceType === 'Factura' && esExonerado && !ordenCompraExenta) {
      toast.error('Ingresa el número de Orden de Compra Exenta')
      return
    }

    setSaving(true)

    let invoiceNumber: string
    try {
      invoiceNumber = await generateNumber(invoiceType)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar número')
      setSaving(false)
      return
    }

    const isFact = invoiceType === 'Factura'

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        invoice_type: invoiceType,
        status: 'Borrador',
        quotation_id: quotationId || null,
        cliente_id: clienteId || null,
        cliente_nombre: selectedCliente?.nombre || null,
        cliente_rtn: selectedCliente?.rtn || null,
        cliente_direccion: selectedCliente?.direccion || null,
        cliente_email: selectedCliente?.email || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        subtotal,
        tax_rate: 15,
        tax_amount: taxAmount,
        total,
        currency,
        exchange_rate: parseFloat(exchangeRate) || 1,
        total_lps: currency === 'USD' ? totalLps : null,
        notes: notes || null,
        created_by: user?.id || null,
        // SAR fields (solo Factura)
        ...(isFact && activeCai ? {
          cai: activeCai.cai,
          rango_desde: activeCai.rango_desde,
          rango_hasta: activeCai.rango_hasta,
          fecha_limite_emision: activeCai.fecha_limite_emision,
          lugar_emision: activeCai.lugar_emision || null,
        } : {}),
        ...(isFact ? {
          es_exonerado: esExonerado,
          orden_compra_exenta: esExonerado ? ordenCompraExenta || null : null,
          no_constancia_exonerado: esExonerado ? noConstanciaExonerado || null : null,
          no_registro_sag: esExonerado ? noRegistroSag || null : null,
          isv_18_rate: importeGravado18 > 0 ? 18 : 0,
          isv_18_amount: isv18Amount,
          importe_exento: importeExento,
          importe_exonerado: 0,
        } : {}),
      })
      .select('id')
      .single()

    if (invError || !invoice) {
      toast.error('Error al crear la factura')
      setSaving(false)
      return
    }

    const lineItems = items.map((it, i) => ({
      invoice_id: invoice.id,
      description: it.description,
      quantity: parseFloat(it.quantity) || 1,
      unit_price: parseFloat(it.unit_price) || 0,
      amount: it.amount,
      sort_order: i,
    }))

    const { error: itemsError } = await supabase.from('invoice_items').insert(lineItems)
    if (itemsError) {
      toast.error('Error al guardar líneas de la factura')
      setSaving(false)
      return
    }

    toast.success(`${invoiceType} ${invoiceNumber} creada`)
    router.push(`/invoicing/${invoice.id}`)
  }

  const isFact = invoiceType === 'Factura'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push('/invoicing')}
          className={secondaryButtonClass}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Facturación
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Nueva factura</h1>
        </div>
      </div>

      {/* CAI alert banner (solo Factura sin CAI activo) */}
      {isFact && !activeCai && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No hay un rango CAI activo. Las facturas se numerarán en formato interno. <a href="/settings/cai" className="underline font-semibold">Registrar rango CAI →</a></span>
        </div>
      )}

      {/* Main form */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left col */}
        <div className="space-y-6 xl:col-span-2">
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Datos generales</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Tipo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tipo de documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}
                  className={`${fieldClass} ${reqClass(submitted, invoiceType)}`}
                >
                  <option value="Factura">Factura</option>
                  <option value="Proforma">Proforma</option>
                </select>
              </div>

              {/* Cliente */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className={`${fieldClass} ${reqClass(submitted, clienteId)}`}
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Cotización vinculada */}
              {quotations.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Cotización vinculada (opcional)
                  </label>
                  <select
                    value={quotationId}
                    onChange={(e) => setQuotationId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Sin vinculación</option>
                    {quotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quotation_number || q.id}
                        {q.total_sale ? ` — USD ${Number(q.total_sale).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fecha emisión */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Fecha de emisión <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className={`${fieldClass} ${reqClass(submitted, issueDate)}`}
                />
              </div>

              {/* Fecha vencimiento */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={fieldClass}
                />
              </div>

              {/* Moneda */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={fieldClass}
                >
                  <option value="USD">USD</option>
                  <option value="HNL">HNL</option>
                </select>
              </div>

              {/* Tipo de cambio */}
              {currency === 'USD' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Tipo de cambio (HNL/USD)
                  </label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    min="1"
                    step="0.0001"
                    className={fieldClass}
                  />
                </div>
              )}
            </div>

            {/* Notas */}
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Notas (aparecen en el documento)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Condiciones de pago, instrucciones especiales..."
                className={`${fieldClass} resize-none`}
              />
            </div>
          </section>

          {/* CAI info (solo Factura con CAI activo) */}
          {isFact && activeCai && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Rango CAI activo
                </p>
              </div>
              <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{activeCai.cai}</p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <span className="block font-semibold">Desde</span>
                  <span className="font-mono">{activeCai.rango_desde}</span>
                </div>
                <div>
                  <span className="block font-semibold">Hasta</span>
                  <span className="font-mono">{activeCai.rango_hasta}</span>
                </div>
                <div>
                  <span className="block font-semibold">Fecha límite</span>
                  <span>{fmtDate(activeCai.fecha_limite_emision)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Exoneración (solo Factura) */}
          {isFact && (
            <section className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Exoneración</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={esExonerado}
                    onChange={(e) => setEsExonerado(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
                  />
                  Cliente exonerado
                </label>
              </div>

              {esExonerado && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Orden de Compra Exenta <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={ordenCompraExenta}
                      onChange={(e) => setOrdenCompraExenta(e.target.value)}
                      placeholder="OCE-..."
                      className={`${fieldClass} ${reqClass(submitted, ordenCompraExenta)}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Constancia exoneración
                    </label>
                    <input
                      value={noConstanciaExonerado}
                      onChange={(e) => setNoConstanciaExonerado(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Registro SAG
                    </label>
                    <input
                      value={noRegistroSag}
                      onChange={(e) => setNoRegistroSag(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Line items */}
          <section className={cardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Líneas de factura</h2>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, newItem()])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </button>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className={`grid gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 ${isFact ? 'grid-cols-[1fr_72px_110px_90px_110px_36px]' : 'grid-cols-[1fr_72px_110px_110px_36px]'}`}>
                <span>Descripción</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Precio unit.</span>
                {isFact && <span className="text-center">ISV</span>}
                <span className="text-right">Importe</span>
                <span />
              </div>

              {items.map((it) => (
                <div
                  key={it.id}
                  className={`grid items-center gap-2 ${isFact ? 'grid-cols-[1fr_72px_110px_90px_110px_36px]' : 'grid-cols-[1fr_72px_110px_110px_36px]'}`}
                >
                  <input
                    type="text"
                    placeholder="Descripción del servicio..."
                    value={it.description}
                    onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                    className={`${fieldClass} text-sm ${submitted && !it.description ? 'border-red-400' : ''}`}
                  />
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => updateItem(it.id, 'quantity', e.target.value)}
                    min="0"
                    step="1"
                    className={`${fieldClass} text-right text-sm`}
                  />
                  <input
                    type="number"
                    value={it.unit_price}
                    onChange={(e) => updateItem(it.id, 'unit_price', e.target.value)}
                    min="0"
                    step="0.01"
                    className={`${fieldClass} text-right text-sm`}
                  />
                  {isFact && (
                    <select
                      value={it.isv_rate}
                      onChange={(e) => updateItem(it.id, 'isv_rate', Number(e.target.value) as 0 | 15 | 18)}
                      className={`${fieldClass} text-center text-sm`}
                    >
                      <option value={15}>15%</option>
                      <option value={18}>18%</option>
                      <option value={0}>Exento</option>
                    </select>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    {it.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    disabled={items.length === 1}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right col: totals + actions */}
        <div className="space-y-4">
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Resumen</h2>
            <div className="space-y-2 text-sm">
              {isFact ? (
                <>
                  {importeExento > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Importe exento</span>
                      <span>{currency} {importeExento.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {importeGravado15 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 15%</span>
                      <span>{currency} {importeGravado15.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {importeGravado18 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 18%</span>
                      <span>{currency} {importeGravado18.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isv15Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 15%</span>
                      <span>{currency} {isv15Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isv18Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 18%</span>
                      <span>{currency} {isv18Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span>{currency} {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">ISV (15%)</span>
                    <span>{currency} {taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {currency} {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {currency === 'USD' && (
                  <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>≈ HNL</span>
                    <span>{totalLps.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Cliente info snapshot */}
          {selectedCliente && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-900/50">
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Datos del cliente</p>
              <p className="font-semibold text-slate-900 dark:text-white">{selectedCliente.nombre}</p>
              {selectedCliente.rtn && <p className="text-xs text-slate-500">RTN: {selectedCliente.rtn}</p>}
              {selectedCliente.direccion && <p className="mt-1 text-xs text-slate-500">{selectedCliente.direccion}</p>}
              {selectedCliente.email && <p className="text-xs text-slate-500">{selectedCliente.email}</p>}
            </section>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`w-full ${primaryButtonClass}`}
          >
            {saving ? 'Guardando...' : `Crear ${invoiceType}`}
          </button>
          <button
            type="button"
            onClick={() => router.push('/invoicing')}
            className={`w-full ${secondaryButtonClass}`}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
