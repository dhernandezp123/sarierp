'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'
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

const TAX_RATE = 15

function newItem(): InvoiceItem {
  return { id: crypto.randomUUID(), description: '', quantity: '1', unit_price: '0', amount: 0 }
}

function reqClass(submitted: boolean, value: string) {
  return submitted && !value ? 'border-red-400 dark:border-red-500' : ''
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
  const [exchangeRate, setExchangeRate] = useState('1')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([newItem()])

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)

  useEffect(() => {
    supabase
      .from('clientes')
      .select('id, nombre, rtn, direccion, email')
      .order('nombre')
      .then(({ data }) => setClientes((data || []) as Cliente[]))
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

  const updateItem = (id: string, field: keyof InvoiceItem, value: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const updated = { ...it, [field]: value }
        const qty = parseFloat(updated.quantity) || 0
        const price = parseFloat(updated.unit_price) || 0
        updated.amount = qty * price
        return updated
      })
    )
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  const taxAmount = subtotal * (TAX_RATE / 100)
  const total = subtotal + taxAmount
  const totalLps = currency === 'USD' ? total * (parseFloat(exchangeRate) || 1) : total

  const generateNumber = async (type: 'Proforma' | 'Factura'): Promise<string> => {
    const now = new Date()
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const prefix = type === 'Proforma' ? `SARI-PRO-${ym}-` : `SARI-FAC-${ym}-`
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('invoice_type', type)
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
    const last = data?.[0]?.invoice_number?.replace(prefix, '')
    const seq = last ? parseInt(last, 10) + 1 : 1
    return `${prefix}${String(seq).padStart(3, '0')}`
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

    setSaving(true)
    const invoiceNumber = await generateNumber(invoiceType)

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
        tax_rate: TAX_RATE,
        tax_amount: taxAmount,
        total,
        currency,
        exchange_rate: parseFloat(exchangeRate) || 1,
        total_lps: currency === 'USD' ? totalLps : null,
        notes: notes || null,
        created_by: user?.id || null,
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

      {/* Main form */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left col: header fields */}
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

              {/* Tipo de cambio (solo si USD) */}
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
                    step="0.01"
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
              <div className="grid grid-cols-[1fr_80px_110px_110px_36px] gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <span>Descripción</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Precio unit.</span>
                <span className="text-right">Importe</span>
                <span />
              </div>

              {items.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_80px_110px_110px_36px] items-center gap-2">
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
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                <span className="font-medium">{currency} {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">ISV ({TAX_RATE}%)</span>
                <span className="font-medium">{currency} {taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
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
