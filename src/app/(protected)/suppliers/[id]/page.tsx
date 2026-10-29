'use client'

import { formatSupplierAmount, loadSupplierPayables, supplierPayableIssue, supplierPayableSummary, type SupplierPayable } from '@/src/lib/supplier-payables'
import { formatDate as fmtDate, formatMoney as fmtMoney } from '@/src/lib/format'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSupplierTypes } from '@/src/hooks/useSupplierTypes'
import { SupplierTypeSelect } from '@/src/components/suppliers/SupplierTypeSelect'
import { FormField } from '@/src/components/ui/form-field'

import Link from 'next/link'
import { Plus, AlertCircle, Clock, Upload, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { useAccounting } from '@/src/hooks/useAccounting'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass, fieldLabelClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { buildTenantStoragePath } from '@/src/lib/storage-paths'

type Proveedor = {
  id: string
  nombre: string
  tipo: string
  rtn: string | null
  email: string | null
  telefono: string | null
  contacto: string | null
  pais: string | null
  moneda: string
  terminos_pago: number
  agente_id: string | null
  is_active: boolean
  notas: string | null
  agents: { id: string; name: string } | null
}

type CuentaPagar = SupplierPayable

type ApprovedQuotation = {
  id: string
  quotation_number: string | null
  clientes: { nombre: string | null }[] | { nombre: string | null } | null
}

const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Parcialmente Pagada': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Vencida: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Anulada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const editableTextFields = ['rtn', 'email', 'telefono', 'contacto', 'pais'] as const

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const catalog = useSupplierTypes()
  const { user, profile } = useUser()
  const { data: accounting } = useAccounting()
  const context = `${profile?.tenant_id || ''}:${user?.id || ''}:${id}`
  const loadVersion = useRef(0)
  const activeContext = useRef<string | null>(context)
  const [loadedContext, setLoadedContext] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([])
  const [approvedQuotations, setApprovedQuotations] = useState<ApprovedQuotation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCPForm, setShowCPForm] = useState(false)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)
  const [documentReplacement, setDocumentReplacement] = useState<{
    cuentaId: string
    label: string
    file: File
  } | null>(null)

  const [cpForm, setCpForm] = useState({
    descripcion: '',
    numero_factura_proveedor: '',
    monto: '',
    moneda: 'USD',
    tipo_cambio: '',
    expense_account_id: '',
    fecha_factura: '',
    fecha_vencimiento: '',
    quotation_id: '',
    notas: '',
  })

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Proveedor>>({})

  const load = useCallback(async () => {
    if (activeContext.current !== context) return
    const version = ++loadVersion.current
    const isCurrent = () => version === loadVersion.current
    setLoading(true)
    setLoadError(null)
    try {
      const [providerResult, cp, quotationResult] = await Promise.all([
        supabase.from('proveedores').select('*, agents(id, name)').eq('id', id).single(),
        loadSupplierPayables(supabase, { supplierId: id, isCurrent }),
        supabase.from('quotations')
          .select('id, quotation_number, clientes(nombre)')
          .eq('status', 'Ganada')
          .order('created_at', { ascending: false })
          .limit(80),
      ])

      if (!isCurrent()) return
      if (providerResult.error || !providerResult.data || quotationResult.error) throw new Error('No se pudo cargar el proveedor y sus datos. Reintenta la consulta.')
      const prov = providerResult.data

      setProveedor(prov as unknown as Proveedor)
      setEditForm(prov as unknown as Proveedor)
      setCuentas(cp.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)))
      setApprovedQuotations((quotationResult.data || []) as unknown as ApprovedQuotation[])
      setLoadedContext(context)
    } catch (error) {
      if (isCurrent()) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los saldos')
    } finally { if (isCurrent()) setLoading(false) }
  }, [id, context])

  useEffect(() => {
    activeContext.current = context
    const timeout = window.setTimeout(() => void load(), 0)
    return () => { window.clearTimeout(timeout); activeContext.current = null; loadVersion.current += 1 }
  }, [load, context])

  const saveEdit = async () => {
    if (!editForm.nombre?.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    const terminosPago = Number(editForm.terminos_pago ?? 30)
    if (Number.isNaN(terminosPago) || terminosPago < 0) {
      toast.error('Los terminos de pago deben ser validos')
      return
    }

    if (!proveedor) return
    if (editForm.tipo !== proveedor.tipo && !catalog.types.some(t=>t.active&&t.code===editForm.tipo)) { toast.error('Selecciona un tipo de proveedor activo.'); return }
    setSaving(true)
    const { error } = await supabase.from('proveedores').update({
      nombre: editForm.nombre.trim(),
      tipo: editForm.tipo,
      rtn: editForm.rtn || null,
      email: editForm.email || null,
      telefono: editForm.telefono || null,
      contacto: editForm.contacto || null,
      pais: editForm.pais || null,
      moneda: editForm.moneda,
      terminos_pago: terminosPago,
      is_active: editForm.is_active,
      notas: editForm.notas || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Proveedor actualizado')
    setEditMode(false)
    load()
  }

  const createCP = async () => {
    const amount = Number.parseFloat(cpForm.monto)
    if (!cpForm.descripcion.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('Descripcion y monto valido son requeridos')
      return
    }
    const rate = cpForm.moneda === 'HNL' ? 1 : Number(cpForm.tipo_cambio)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000) {
      toast.error('Indica una tasa de cambio válida a lempiras.')
      return
    }

    setSaving(true)
    const terminos = proveedor?.terminos_pago ?? 30
    const vencimiento = cpForm.fecha_vencimiento || (cpForm.fecha_factura
      ? new Date(new Date(cpForm.fecha_factura + 'T00:00:00').getTime() + terminos * 86400000).toISOString().split('T')[0]
      : null)

    const { error } = await supabase.from('cuentas_pagar').insert({
      proveedor_id: id,
      quotation_id: cpForm.quotation_id || null,
      descripcion: cpForm.descripcion.trim(),
      numero_factura_proveedor: cpForm.numero_factura_proveedor.trim() || null,
      monto: amount,
      moneda: cpForm.moneda,
      tipo_cambio: rate,
      expense_account_id: cpForm.expense_account_id || null,
      fecha_factura: cpForm.fecha_factura || null,
      fecha_vencimiento: vencimiento,
      notas: cpForm.notas.trim() || null,
      created_by: user?.id || null,
    })
    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Cuenta por pagar creada')
    setShowCPForm(false)
    setCpForm({
      descripcion: '',
      numero_factura_proveedor: '',
      monto: '',
      moneda: proveedor?.moneda || 'USD',
      tipo_cambio: '',
      expense_account_id: '',
      fecha_factura: '',
      fecha_vencimiento: '',
      quotation_id: '',
      notas: '',
    })
    load()
  }

  const uploadDocumento = async (cuentaId: string, file: File) => {
    if (!profile?.tenant_id) {
      toast.error('Tu perfil no tiene una empresa asignada')
      return
    }
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se permiten archivos PDF')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El PDF no puede superar 10 MB')
      return
    }

    setUploadingDocId(cuentaId)
    const currentDocument = cuentas.find((cuenta) => cuenta.id === cuentaId)?.documento_url || null
    const path = buildTenantStoragePath(
      profile.tenant_id,
      id,
      cuentaId,
      `${crypto.randomUUID()}.pdf`,
    )
    const { error: upErr } = await supabase.storage
      .from('proveedor-docs')
      .upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (upErr) { toast.error(upErr.message); setUploadingDocId(null); return }

    const { error: dbErr } = await supabase
      .from('cuentas_pagar')
      .update({ documento_url: path })
      .eq('id', cuentaId)

    if (dbErr) {
      await supabase.storage.from('proveedor-docs').remove([path])
      toast.error(dbErr.message)
      setUploadingDocId(null)
      return
    }

    if (currentDocument && !currentDocument.startsWith('http')) {
      await supabase.storage.from('proveedor-docs').remove([currentDocument])
    }

    toast.success('Documento subido')
    setUploadingDocId(null)
    load()
  }

  const openDocumento = async (documentPath: string) => {
    const legacyMarker = '/storage/v1/object/public/proveedor-docs/'
    const normalizedPath = documentPath.includes(legacyMarker)
      ? decodeURIComponent(documentPath.split(legacyMarker)[1] || '')
      : documentPath

    if (!normalizedPath) {
      toast.error('La ruta del documento no es válida')
      return
    }

    const { data, error } = await supabase.storage
      .from('proveedor-docs')
      .createSignedUrl(normalizedPath, 60)

    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'No se pudo abrir el documento')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loadError) return <div className={cardClass}><p role="alert">{loadError}</p><button type="button" onClick={() => void load()} className={secondaryButtonClass}>Reintentar</button></div>
  if (loading || loadedContext !== context) return <PageSkeleton cards={2} rows={4} />
  if (!proveedor) return null

  const currencies = Array.from(new Set([proveedor.moneda, ...cuentas.map(row => row.moneda)]))

  const setCP = (f: keyof typeof cpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCpForm((p) => ({ ...p, [f]: e.target.value }))
  const setEF = (f: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [f]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{proveedor.nombre}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">{catalog.label(proveedor.tipo)}</span>
            {!proveedor.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">Inactivo</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={secondaryButtonClass}>Actualizar saldos</button>
          <button type="button" onClick={() => setEditMode(!editMode)} className={secondaryButtonClass}>
            {editMode ? 'Cancelar' : 'Editar'}
          </button>
          <button type="button" onClick={() => router.push('/suppliers')} className={secondaryButtonClass}>
            Volver
          </button>
        </div>
      </div>

      {currencies.map(currency => {
        const totals = supplierPayableSummary(cuentas, currency)
        return <div key={currency} className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">Por pagar ({currency})</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{fmtMoney(totals.pending, currency)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs text-slate-500">Vencido ({currency})</p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-300">{fmtMoney(totals.overdue, currency)}</p>
            </div>
          </div>
          {totals.reconciliationCount > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            {totals.reconciliationCount} cuenta(s) requieren conciliacion. Sobrepagos: {fmtMoney(totals.overpaid, currency)}.
            {' '}Los totales excluyen saldos inconsistentes y obligaciones negativas; los sobrepagos se muestran separados.
          </p>}
        </div>
      })}

      <section className={cardClass}>
        {editMode ? (
          <>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Editar proveedor</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Nombre</label>
                <input value={editForm.nombre || ''} onChange={setEF('nombre')} className={fieldClass} />
              </div>
              <FormField as="div" label="Tipo de proveedor" required><SupplierTypeSelect types={catalog.types} value={editForm.tipo||''} onChange={value=>setEditForm(p=>({...p,tipo:value}))} loading={catalog.loading} error={catalog.error}/></FormField>
              {editableTextFields.map((f) => (
                <div key={f}>
                  <label className="mb-1 block text-xs font-medium text-slate-500 capitalize">{f}</label>
                  <input value={editForm[f] || ''} onChange={setEF(f)} className={fieldClass} />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Terminos (dias)</label>
                <input type="number" min="0" value={editForm.terminos_pago ?? 30} onChange={setEF('terminos_pago')} className={fieldClass} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={editForm.is_active ?? true}
                  onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">Activo</label>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
                <textarea rows={2} value={editForm.notas || ''} onChange={setEF('notas')} className={`${fieldClass} min-h-16`} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={saveEdit} disabled={saving} className={`${primaryButtonClass} disabled:opacity-50`}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Informacion del proveedor</h2>
            <div className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
              {[
                ['Tipo', catalog.label(proveedor.tipo)],
                ['RTN / Tax ID', proveedor.rtn || '-'],
                ['Pais', proveedor.pais || '-'],
                ['Contacto', proveedor.contacto || '-'],
                ['Email', proveedor.email || '-'],
                ['Telefono', proveedor.telefono || '-'],
                ['Moneda', proveedor.moneda],
                ['Terminos de pago', `${proveedor.terminos_pago} dias`],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="w-32 shrink-0 font-medium text-slate-500">{label}:</span>
                  <span className="text-slate-800 dark:text-slate-200">{val}</span>
                </div>
              ))}
              {proveedor.agents && (
                <div className="flex gap-2">
                  <span className="w-32 shrink-0 font-medium text-slate-500">Agente ERP:</span>
                  <Link href={`/agents/${proveedor.agents.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {proveedor.agents.name}
                  </Link>
                </div>
              )}
              {proveedor.notas && (
                <div className="mt-2 rounded-xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300 md:col-span-2">
                  {proveedor.notas}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Cuentas por pagar</h2>
          <button type="button" onClick={() => {
            setCpForm((prev) => ({ ...prev, moneda: proveedor.moneda }))
            setShowCPForm(!showCPForm)
          }}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
            <Plus className="h-3.5 w-3.5" />
            Nueva cuenta
          </button>
        </div>

        {showCPForm && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Nueva cuenta por pagar</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Cotizacion aprobada relacionada</label>
                <select value={cpForm.quotation_id} onChange={setCP('quotation_id')} className={fieldClass}>
                  <option value="">Sin vincular</option>
                  {approvedQuotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_number || 'Sin numero'}{(() => {
                        const cliente = Array.isArray(q.clientes) ? q.clientes[0] : q.clientes
                        return cliente?.nombre ? ` - ${cliente.nombre}` : ''
                      })()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Descripcion <span className="text-red-400">*</span></label>
                <input value={cpForm.descripcion} onChange={setCP('descripcion')} className={fieldClass}
                  placeholder="Ej: Flete maritimo MOLU1234 - Ruta SPS-MIA" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">No. factura del proveedor</label>
                <input value={cpForm.numero_factura_proveedor} onChange={setCP('numero_factura_proveedor')} className={fieldClass} placeholder="INV-2026-001" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto <span className="text-red-400">*</span></label>
                <input type="number" step="0.01" min="0" value={cpForm.monto} onChange={setCP('monto')} className={fieldClass} placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Moneda</label>
                <select value={cpForm.moneda} onChange={setCP('moneda')} className={fieldClass}>
                  {['USD', 'HNL', 'EUR', 'MXN'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha factura</label>
                <input type="date" value={cpForm.fecha_factura} onChange={setCP('fecha_factura')} className={fieldClass} />
              </div>
              {cpForm.moneda !== 'HNL' && <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>HNL por {cpForm.moneda}</span><input type="number" min="0.000001" max="1000000" step="0.000001" value={cpForm.tipo_cambio} onChange={setCP('tipo_cambio')} className={fieldClass}/></label>}
              <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Cuenta de costo / gasto / activo</span><select value={cpForm.expense_account_id} onChange={setCP('expense_account_id')} className={fieldClass}><option value="">Cuenta de compras configurada</option>{accounting?.accounts.filter(a=>a.active&&a.postable&&['Activo','Costo','Gasto'].includes(a.kind)).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
              <p className="text-sm md:col-span-2">Para varias cuentas por línea, ISV acreditable o boleta fiscal, usa <Link className="text-blue-700 underline" href="/accounting/purchases">Compras y documentos</Link>.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Vencimiento <span className="text-slate-400">(se calcula si queda vacio)</span>
                </label>
                <input type="date" value={cpForm.fecha_vencimiento} onChange={setCP('fecha_vencimiento')} className={fieldClass} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
                <input value={cpForm.notas} onChange={setCP('notas')} className={fieldClass} placeholder="Notas adicionales..." />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={createCP} disabled={saving} className={`${primaryButtonClass} disabled:opacity-50`}>
                {saving ? 'Guardando...' : 'Crear cuenta'}
              </button>
              <button type="button" onClick={() => setShowCPForm(false)} className={secondaryButtonClass}>Cancelar</button>
            </div>
          </div>
        )}

        {cuentas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No hay cuentas por pagar para este proveedor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Descripcion', 'Factura', 'Total ajustado / Saldo', 'Vencimiento', 'Estado', 'Doc.', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => {
                  const overdue = c.days_overdue > 0
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{c.descripcion}</div>
                        {c.quotations && (
                          <div className="text-xs text-slate-400">
                            Cot. {(Array.isArray(c.quotations) ? c.quotations[0] : c.quotations)?.quotation_number}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{c.numero_factura_proveedor || '-'}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{formatSupplierAmount(c.total_adjusted, c.moneda)}
                        <p className="text-xs font-normal">Saldo: {formatSupplierAmount(c.pending_balance, c.moneda)}</p>
                        <p className="text-xs font-normal">Pagado: {formatSupplierAmount(c.paid_total, c.moneda)}</p>
                        {c.needs_reconciliation && <p className="text-xs text-amber-700 dark:text-amber-300">{supplierPayableIssue(c)}</p>}</td>
                      <td className="px-3 py-2.5">
                        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                          {overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          {fmtDate(c.fecha_vencimiento)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[c.status] ?? ''}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {c.documento_url && (
                            <button
                              type="button"
                              onClick={() => c.documento_url && openDocumento(c.documento_url)}
                              title="Ver documento"
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <label
                            className={`flex min-w-0 flex-col gap-1.5 cursor-pointer ${uploadingDocId === c.id ? 'opacity-40' : ''}`}
                            title={c.documento_url ? 'Reemplazar documento' : 'Subir documento'}
                          >
                            <span className={fieldLabelClass}>{uploadingDocId === c.id
                              ? <span className="text-[10px] text-slate-400">...</span>
                              : <Upload className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
                            }</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="application/pdf,.pdf"
                              disabled={uploadingDocId !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.currentTarget.value = ''
                                if (!file) return
                                if (c.documento_url) {
                                  setDocumentReplacement({
                                    cuentaId: c.id,
                                    label: c.numero_factura_proveedor || c.descripcion,
                                    file,
                                  })
                                  return
                                }
                                void uploadDocumento(c.id, file)
                              }}
                            />
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/accounts-payable/${c.id}`}
                          className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={documentReplacement !== null}
        onOpenChange={(open) => { if (!open) setDocumentReplacement(null) }}
        title="Reemplazar documento"
        description={documentReplacement
          ? `La cuenta ${documentReplacement.label} ya tiene un PDF. El archivo anterior se eliminará permanentemente al cargar ${documentReplacement.file.name}.`
          : undefined}
        confirmLabel="Reemplazar PDF"
        danger
        onConfirm={() => {
          if (documentReplacement) {
            void uploadDocumento(documentReplacement.cuentaId, documentReplacement.file)
          }
          setDocumentReplacement(null)
        }}
      />
    </div>
  )
}
