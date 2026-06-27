'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, AlertCircle, Clock, Upload, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'

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

type CuentaPagar = {
  id: string
  descripcion: string
  numero_factura_proveedor: string | null
  monto: number
  moneda: string
  fecha_factura: string | null
  fecha_vencimiento: string | null
  status: string
  documento_url: string | null
  quotations: { quotation_number: string | null } | null
  pagos_proveedor?: { monto: number }[]
}

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

const fmtMoney = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

const isOverdue = (d: string | null) => d ? new Date(d + 'T00:00:00') < new Date() : false

const saldoCuenta = (c: CuentaPagar) => {
  const pagado = (c.pagos_proveedor || []).reduce((sum, p) => sum + Number(p.monto || 0), 0)
  return Math.max(0, Number(c.monto || 0) - pagado)
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()

  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([])
  const [approvedQuotations, setApprovedQuotations] = useState<ApprovedQuotation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCPForm, setShowCPForm] = useState(false)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)

  const [cpForm, setCpForm] = useState({
    descripcion: '',
    numero_factura_proveedor: '',
    monto: '',
    moneda: 'USD',
    fecha_factura: '',
    fecha_vencimiento: '',
    quotation_id: '',
    notas: '',
  })

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Proveedor>>({})

  const load = async () => {
    setLoading(true)
    const [{ data: prov }, { data: cp }, { data: quotations }] = await Promise.all([
      supabase.from('proveedores').select('*, agents(id, name)').eq('id', id).single(),
      supabase.from('cuentas_pagar')
        .select('id, descripcion, numero_factura_proveedor, monto, moneda, fecha_factura, fecha_vencimiento, status, documento_url, quotations(quotation_number), pagos_proveedor(monto)')
        .eq('proveedor_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('quotations')
        .select('id, quotation_number, clientes(nombre)')
        .eq('status', 'Ganada')
        .order('created_at', { ascending: false })
        .limit(80),
    ])

    if (!prov) {
      toast.error('Proveedor no encontrado')
      router.push('/suppliers')
      return
    }

    setProveedor(prov as unknown as Proveedor)
    setEditForm(prov as unknown as Proveedor)
    setCuentas((cp || []) as unknown as CuentaPagar[])
    setApprovedQuotations((quotations || []) as unknown as ApprovedQuotation[])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

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
    if (!cpForm.descripcion.trim() || Number.isNaN(amount) || amount <= 0) {
      toast.error('Descripcion y monto valido son requeridos')
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
      fecha_factura: '',
      fecha_vencimiento: '',
      quotation_id: '',
      notas: '',
    })
    load()
  }

  const uploadDocumento = async (cuentaId: string, file: File) => {
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
    const path = `${id}/${cuentaId}/${crypto.randomUUID()}.pdf`
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

  if (loading) return <PageSkeleton cards={2} rows={4} />
  if (!proveedor) return null

  const totalPendiente = cuentas.filter((c) => ['Pendiente', 'Parcialmente Pagada', 'Vencida'].includes(c.status)).reduce((s, c) => s + saldoCuenta(c), 0)
  const totalVencido = cuentas.filter((c) => c.status === 'Vencida' || (['Pendiente', 'Parcialmente Pagada'].includes(c.status) && isOverdue(c.fecha_vencimiento))).reduce((s, c) => s + saldoCuenta(c), 0)

  const setCP = (f: keyof typeof cpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCpForm((p) => ({ ...p, [f]: e.target.value }))
  const setEF = (f: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [f]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{proveedor.nombre}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">{proveedor.tipo}</span>
            {!proveedor.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">Inactivo</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditMode(!editMode)} className={secondaryButtonClass}>
            {editMode ? 'Cancelar' : 'Editar'}
          </button>
          <button type="button" onClick={() => router.push('/suppliers')} className={secondaryButtonClass}>
            Volver
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs text-amber-600 dark:text-amber-400">Por pagar ({proveedor.moneda})</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{fmtMoney(totalPendiente, proveedor.moneda)}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${totalVencido > 0 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'}`}>
          <p className={`text-xs ${totalVencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>Vencido ({proveedor.moneda})</p>
          <p className={`mt-1 text-2xl font-bold ${totalVencido > 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-500'}`}>{fmtMoney(totalVencido, proveedor.moneda)}</p>
        </div>
      </div>

      <section className={cardClass}>
        {editMode ? (
          <>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Editar proveedor</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Nombre</label>
                <input value={editForm.nombre || ''} onChange={setEF('nombre')} className={fieldClass} />
              </div>
              {['rtn', 'email', 'telefono', 'contacto', 'pais'].map((f) => (
                <div key={f}>
                  <label className="mb-1 block text-xs font-medium text-slate-500 capitalize">{f}</label>
                  <input value={(editForm as any)[f] || ''} onChange={setEF(f as any)} className={fieldClass} />
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
                ['Tipo', proveedor.tipo],
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
                  {['Descripcion', 'Factura', 'Monto', 'Vencimiento', 'Estado', 'Doc.', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => {
                  const overdue = (c.status === 'Pendiente' || c.status === 'Parcialmente Pagada') && isOverdue(c.fecha_vencimiento)
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{c.descripcion}</div>
                        {c.quotations && <div className="text-xs text-slate-400">Cot. {(c.quotations as any).quotation_number}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{c.numero_factura_proveedor || '-'}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{fmtMoney(Number(c.monto), c.moneda)}</td>
                      <td className="px-3 py-2.5">
                        <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                          {overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          {fmtDate(c.fecha_vencimiento)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[overdue && c.status === 'Pendiente' ? 'Vencida' : c.status] ?? ''}`}>
                          {overdue && c.status === 'Pendiente' ? 'Vencida' : c.status}
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
                            className={`cursor-pointer ${uploadingDocId === c.id ? 'opacity-40' : ''}`}
                            title={c.documento_url ? 'Reemplazar documento' : 'Subir documento'}
                          >
                            {uploadingDocId === c.id
                              ? <span className="text-[10px] text-slate-400">...</span>
                              : <Upload className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
                            }
                            <input
                              type="file"
                              className="hidden"
                              accept="application/pdf,.pdf"
                              disabled={uploadingDocId !== null}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDocumento(c.id, f) }}
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
    </div>
  )
}
