'use client'

import { formatDate as fmtDate, formatDateTime, formatMoney as fmtMoney, toDateInputValue } from '@/src/lib/format'
import { formatSupplierAmount, supplierAmount, supplierPayableIssue, type SupplierPayable, completeSupplierAction, pendingSupplierActionKey, supplierActionKey } from '@/src/lib/supplier-payables'
import { readAllReportRows } from '@/src/lib/report-query'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'

type CuentaPagar = SupplierPayable

type Ajuste = {
  id: string
  descripcion: string
  monto: number
  moneda: string
  fecha_factura: string | null
  status: string
  tipo: 'NC' | 'ND'
  request_key: string | null
  cancellation_reason: string | null
  cancelled_at: string | null
}

type Pago = {
  id: string
  monto: number
  moneda: string
  fecha_pago: string
  metodo_pago: string | null
  referencia: string | null
  notas: string | null
  created_at: string
  status: string
  request_key: string | null
  reversal_reason: string | null
  reversed_at: string | null
}

const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Parcialmente Pagada': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Vencida: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Anulada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export default function APDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, profile } = useUser()
  const context = `${profile?.tenant_id || ''}:${user?.id || ''}:${id}`
  const canManage = !!user && profile?.id === user.id && profile.status === 'Aprobado' && !!profile.is_active && !!profile.tenant_id
    && ['Admin', 'Finanzas', 'Contabilidad'].includes(profile.rol)
  const loadVersion = useRef(0)
  const mutationPending = useRef(false)
  const [loadedContext, setLoadedContext] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [cuenta, setCuenta] = useState<CuentaPagar | null>(null)
  const [pagos, setPagos] = useState<Pago[]>([])
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPagoForm, setShowPagoForm] = useState(false)
  const [reasonAction, setReasonAction] = useState<{ kind: 'reverse' | 'cancel'; id: string; label: string } | null>(null)
  const [reason, setReason] = useState('')
  const [reasonSaving, setReasonSaving] = useState(false)
  const [showNcNdModal, setShowNcNdModal] = useState(false)
  const [ncNdSaving, setNcNdSaving] = useState(false)
  const [ncNdForm, setNcNdForm] = useState({ tipo: 'NC', descripcion: '', monto: '', fecha: '' })

  const [pagoForm, setPagoForm] = useState({
    monto: '',
    metodo_pago: 'Transferencia',
    referencia: '',
    fecha_pago: toDateInputValue(),
    notas: '',
  })

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    const isCurrent = () => version === loadVersion.current
    setLoading(true)
    setLoadError(null)
    try {
      const [account, balance, paymentRows, adjustmentRows] = await Promise.all([
        supabase.from('cuentas_pagar')
          .select('id, tipo, parent_ap_id')
          .eq('id', id).single(),
        supabase.from('supplier_payable_balances').select('*').eq('id', id).maybeSingle(),
        readAllReportRows<Pago>((from, to) => supabase.from('pagos_proveedor').select('*')
          .eq('cuenta_pagar_id', id).order('fecha_pago', { ascending: false }).order('id').range(from, to),
          { label: 'pagos de la cuenta', isCurrent }),
        readAllReportRows<Ajuste>((from, to) => supabase.from('cuentas_pagar')
          .select('id, descripcion, monto, moneda, fecha_factura, status, tipo, request_key, cancellation_reason, cancelled_at')
          .eq('parent_ap_id', id).order('created_at').order('id').range(from, to),
          { label: 'ajustes de la cuenta', isCurrent }),
      ])
      if (!isCurrent()) return
      if (account.error || !account.data) throw new Error('No se pudo cargar la cuenta. Reintenta la consulta.')
      if (account.data.parent_ap_id) {
        router.replace('/accounts-payable/' + account.data.parent_ap_id)
        return
      }
      if (balance.error || !balance.data) throw new Error('No se pudo cargar el saldo conciliado. Reintenta la consulta.')
      setCuenta(balance.data as unknown as CuentaPagar)
      setPagos(paymentRows)
      setAjustes(adjustmentRows)
      setLoadedContext(context)
      // Recuperar una respuesta perdida antes de habilitar un nuevo registro.
      for (const [action, rows] of [['payment', paymentRows], ['adjustment', adjustmentRows]] as const) {
        const scope = context + ':' + action
        const key = pendingSupplierActionKey(scope)
        if (key && rows.some(row => row.request_key === key)) {
          completeSupplierAction(scope, key)
          if (action === 'payment') {
            setShowPagoForm(false)
            setPagoForm({ monto: '', metodo_pago: 'Transferencia', referencia: '', fecha_pago: toDateInputValue(), notas: '' })
          } else {
            setShowNcNdModal(false)
            setNcNdForm({ tipo: 'NC', descripcion: '', monto: '', fecha: '' })
          }
          toast.info('El registro pendiente ya aparece en el historial.')
        }
      }
    } catch (error) {
      if (isCurrent()) {
        setLoadedContext('')
        setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el historial financiero.')
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [context, id, router])

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPagoForm(false)
      setShowNcNdModal(false)
      setReasonAction(null)
      setReason('')
      setPagoForm({ monto: '', metodo_pago: 'Transferencia', referencia: '', fecha_pago: toDateInputValue(), notas: '' })
      setNcNdForm({ tipo: 'NC', descripcion: '', monto: '', fecha: '' })
      if (canManage) void load()
    }, 0)
    return () => { clearTimeout(timer); loadVersion.current += 1 }
  }, [canManage, load])

  const totalNotasCredito = Number(cuenta?.credit_notes ?? 0)
  const totalNotasDebito = Number(cuenta?.debit_notes ?? 0)
  const saldoPendiente = supplierAmount(cuenta?.pending_balance) ?? 0
  const busy = saving || ncNdSaving || reasonSaving

  const registrarPago = async () => {
    if (!cuenta || !canManage || loadedContext !== context || mutationPending.current) return
    const monto = Number(pagoForm.monto)
    if (!Number.isFinite(monto) || monto <= 0 || !pagoForm.fecha_pago) {
      toast.error('Indica un monto positivo y una fecha de pago.')
      return
    }
    mutationPending.current = true
    const version = loadVersion.current
    setSaving(true)
    try {
      const scope = context + ':payment'
      const key = supplierActionKey(scope)
      const { data, error } = await supabase.rpc('register_supplier_payment', {
        p_account_id: cuenta.id, p_request_key: key, p_amount: monto, p_currency: cuenta.moneda,
        p_payment_date: pagoForm.fecha_pago, p_payment_method: pagoForm.metodo_pago,
        p_reference: pagoForm.referencia.trim() || null, p_notes: pagoForm.notas.trim() || null,
      })
      if (error) throw error
      if (!data?.payment_id) throw new Error('No se pudo confirmar el registro. Actualiza el historial antes de reintentar.')
      completeSupplierAction(scope, key)
      if (loadVersion.current !== version) return
      toast.success(data.already_applied ? 'El pago ya estaba registrado' : 'Pago registrado')
      setShowPagoForm(false)
      setPagoForm({ monto: '', metodo_pago: 'Transferencia', referencia: '', fecha_pago: toDateInputValue(), notas: '' })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo confirmar el pago. Actualiza el historial y reintenta.')
    } finally { setSaving(false); mutationPending.current = false }
  }

  const registrarNcNd = async () => {
    if (!cuenta || !canManage || loadedContext !== context || mutationPending.current) return
    const monto = Number(ncNdForm.monto)
    if (!ncNdForm.descripcion.trim() || !Number.isFinite(monto) || monto <= 0) {
      toast.error('Descripcion y monto positivo son requeridos')
      return
    }
    mutationPending.current = true
    const version = loadVersion.current
    setNcNdSaving(true)
    try {
      const scope = context + ':adjustment'
      const key = supplierActionKey(scope)
      const { data, error } = await supabase.rpc('register_supplier_adjustment', {
        p_account_id: cuenta.id, p_request_key: key, p_type: ncNdForm.tipo,
        p_description: ncNdForm.descripcion.trim(), p_amount: monto, p_document_date: ncNdForm.fecha || null,
      })
      if (error) throw error
      if (!data?.adjustment_id) throw new Error('No se pudo confirmar el ajuste. Actualiza el historial antes de reintentar.')
      completeSupplierAction(scope, key)
      if (loadVersion.current !== version) return
      toast.success(data.already_applied ? 'El ajuste ya estaba registrado' : ncNdForm.tipo + ' registrada')
      setShowNcNdModal(false)
      setNcNdForm({ tipo: 'NC', descripcion: '', monto: '', fecha: '' })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo confirmar el ajuste. Actualiza el historial y reintenta.')
    } finally { setNcNdSaving(false); mutationPending.current = false }
  }

  const openReason = (kind: 'reverse' | 'cancel', documentId: string, label: string) => {
    if (mutationPending.current) return
    setReason('')
    setReasonAction({ kind, id: documentId, label })
  }

  const confirmarMotivo = async () => {
    if (!reasonAction || !canManage || loadedContext !== context || mutationPending.current) return
    if (!reason.trim()) { toast.error('El motivo es requerido'); return }
    mutationPending.current = true
    const version = loadVersion.current
    setReasonSaving(true)
    try {
      const result = reasonAction.kind === 'reverse'
        ? await supabase.rpc('reverse_supplier_payment', { p_payment_id: reasonAction.id, p_reason: reason.trim() })
        : await supabase.rpc('cancel_supplier_payable', { p_document_id: reasonAction.id, p_reason: reason.trim() })
      if (result.error) throw result.error
      if (!result.data) throw new Error('No se pudo confirmar la accion. Actualiza el historial y reintenta.')
      if (loadVersion.current !== version) return
      toast.success(reasonAction.kind === 'reverse' ? 'Pago reversado' : 'Documento anulado')
      setReasonAction(null)
      setReason('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo confirmar la accion. Reintenta.')
    } finally { setReasonSaving(false); mutationPending.current = false }
  }

  if (!canManage) return <p className="p-6 text-sm text-slate-500">Se requiere una sesion financiera activa.</p>
  if (loadError) return <div className={cardClass}><p role="alert">{loadError}</p><button type="button" onClick={() => void load()} className={secondaryButtonClass}>Reintentar</button></div>
  if (loadedContext !== context && !loading) return <PageSkeleton cards={2} rows={4} />
  if (loading) return <PageSkeleton cards={2} rows={4} />
  if (!cuenta) return null

  const displayStatus = cuenta.status

  const setP = (f: keyof typeof pagoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setPagoForm((p) => ({ ...p, [f]: e.target.value }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <Link href="/accounts-payable" className="hover:underline">Cuentas por pagar</Link>{' / '}
            <Link href={`/suppliers/${cuenta.proveedores?.id}`} className="text-slate-700 hover:underline dark:text-slate-300">
              {cuenta.proveedores?.nombre}
            </Link>
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{cuenta.descripcion}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[displayStatus] ?? ''}`}>{displayStatus}</span>
            {cuenta.numero_factura_proveedor && <span className="text-sm text-slate-500">Factura: {cuenta.numero_factura_proveedor}</span>}
          </div>
        </div>
        <button type="button" disabled={busy} onClick={() => void load()} className={secondaryButtonClass}>Actualizar historial</button>
        <button type="button" onClick={() => router.push('/accounts-payable')} className={secondaryButtonClass}>Volver</button>
      </div>

      {cuenta.needs_reconciliation && <p role="status" className="rounded-xl border border-amber-300 p-3 text-sm text-amber-700 dark:text-amber-300">{supplierPayableIssue(cuenta)}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
          <p className="text-xs text-slate-500">Total ajustado</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatSupplierAmount(cuenta.total_adjusted, cuenta.moneda)}</p>
          {(totalNotasCredito > 0 || totalNotasDebito > 0) && (
            <p className="mt-1 text-[11px] text-slate-400">
              Base {fmtMoney(Number(cuenta.monto), cuenta.moneda)} · NC -{fmtMoney(totalNotasCredito, cuenta.moneda)} · ND +{fmtMoney(totalNotasDebito, cuenta.moneda)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Pagado</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatSupplierAmount(cuenta.paid_total, cuenta.moneda)}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${saldoPendiente > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'}`}>
          <p className={`text-xs ${saldoPendiente > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>Saldo pendiente</p>
          <p className={`mt-1 text-xl font-bold ${saldoPendiente > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>
            {formatSupplierAmount(cuenta.pending_balance, cuenta.moneda)}
          </p>
        </div>
      </div>

      {cuenta.parent_ap_id && <Link href={`/accounts-payable/${cuenta.parent_ap_id}`} className="text-sm text-blue-600 hover:underline">Ver cuenta principal para gestionar pagos y ajustes</Link>}
      {cuenta.cancellation_reason && <p className={cardClass}>Anulada: {cuenta.cancellation_reason} / {formatDateTime(cuenta.cancelled_at)}</p>}

      <section className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Informacion</h2>
        <div className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
          {[
            ['Proveedor', cuenta.proveedores?.nombre],
            ['Tipo proveedor', cuenta.proveedores?.tipo],
            ['Fecha factura', fmtDate(cuenta.fecha_factura)],
            ['Vencimiento', fmtDate(cuenta.fecha_vencimiento)],
            ['Moneda', cuenta.moneda],
          ].map(([l, v]) => (
            <div key={l} className="flex gap-2">
              <span className="w-32 shrink-0 font-medium text-slate-500">{l}:</span>
              <span className="text-slate-800 dark:text-slate-200">{v || '-'}</span>
            </div>
          ))}
          {cuenta.quotations && (
            <div className="flex gap-2">
              <span className="w-32 shrink-0 font-medium text-slate-500">Cotizacion:</span>
              <Link href={`/quotations/${cuenta.quotations.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {cuenta.quotations.quotation_number || 'Ver cotizacion'}
              </Link>
            </div>
          )}
          {cuenta.bookings && (
            <div className="flex gap-2">
              <span className="w-32 shrink-0 font-medium text-slate-500">Booking:</span>
              <span className="text-slate-800 dark:text-slate-200">{cuenta.bookings.booking_number}</span>
            </div>
          )}
          {cuenta.notas && (
            <div className="mt-1 rounded-xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300 md:col-span-2">{cuenta.notas}</div>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pagos registrados</h2>
          <div className="flex items-center gap-2">
            {cuenta.tipo === 'AP' && !cuenta.parent_ap_id && cuenta.status !== 'Anulada' && (
              <button type="button" disabled={busy} onClick={() => setShowNcNdModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                <FileText className="h-3.5 w-3.5" />
                NC / ND
              </button>
            )}
            {cuenta.tipo === 'AP' && !cuenta.parent_ap_id && cuenta.status !== 'Pagada' && cuenta.status !== 'Anulada' && (
              <button type="button" disabled={busy} onClick={() => setShowPagoForm(!showPagoForm)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                <Plus className="h-3.5 w-3.5" />
                Registrar pago
              </button>
            )}
          </div>
        </div>

        {showPagoForm && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto <span className="text-red-400">*</span></label>
                <input type="number" step="0.01" min="0.01" max={saldoPendiente} value={pagoForm.monto} onChange={setP('monto')} className={fieldClass}
                  placeholder={`Max. ${fmtMoney(saldoPendiente, cuenta.moneda)}`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha de pago</label>
                <input type="date" max={toDateInputValue()} value={pagoForm.fecha_pago} onChange={setP('fecha_pago')} className={fieldClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Metodo de pago</label>
                <select value={pagoForm.metodo_pago} onChange={setP('metodo_pago')} className={fieldClass}>
                  {['Transferencia', 'Cheque', 'Efectivo', 'Otro'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Referencia / No. cheque</label>
                <input value={pagoForm.referencia} onChange={setP('referencia')} className={fieldClass} placeholder="REF-001" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
                <input value={pagoForm.notas} onChange={setP('notas')} className={fieldClass} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={registrarPago} disabled={busy} className={`${primaryButtonClass} disabled:opacity-50`}>
                {saving ? 'Guardando...' : 'Confirmar pago'}
              </button>
              <button type="button" disabled={busy} onClick={() => setShowPagoForm(false)} className={secondaryButtonClass}>Cancelar</button>
            </div>
          </div>
        )}

        {pagos.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Sin pagos registrados aun.</p>
        ) : (
          <div className="space-y-2">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className={p.status === 'Aplicado' ? "h-4 w-4 text-emerald-500" : "h-4 w-4 text-slate-400"} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmtMoney(Number(p.monto), p.moneda)}</p>
                    <p className="text-xs text-slate-400">{fmtDate(p.fecha_pago)} / {p.metodo_pago || 'Sin metodo'} {p.referencia ? `/ ${p.referencia}` : ''}</p>
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs font-semibold text-slate-500">{p.status}</p>
                  {p.notas && <p className="text-xs text-slate-400">{p.notas}</p>}
                  {p.reversal_reason && <p className="text-xs text-slate-500">{p.reversal_reason} / {formatDateTime(p.reversed_at)}</p>}
                  {p.status === 'Aplicado' && <button type="button" disabled={busy} className={secondaryButtonClass}
                    onClick={() => openReason('reverse', p.id, 'Reversar pago')}>Reversar</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {ajustes.length > 0 && (
        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Notas de crédito y débito</h2>
          <div className="space-y-2">
            {ajustes.map((ajuste) => (
              <div key={ajuste.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {ajuste.tipo} · {ajuste.descripcion}
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(ajuste.fecha_factura)} · {ajuste.status}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className={`text-sm font-bold ${ajuste.tipo === 'NC' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {ajuste.tipo === 'NC' ? '-' : '+'}{fmtMoney(Number(ajuste.monto), ajuste.moneda)}
                  </p>
                  {ajuste.cancellation_reason && <p className="text-xs text-slate-500">{ajuste.cancellation_reason} / {formatDateTime(ajuste.cancelled_at)}</p>}
                  {ajuste.status !== 'Anulada' && <button type="button" disabled={busy} className={secondaryButtonClass}
                    onClick={() => openReason('cancel', ajuste.id, 'Anular ' + ajuste.tipo)}>Anular nota</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {cuenta.status !== 'Pagada' && cuenta.status !== 'Anulada' && (
        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-red-600 dark:text-red-400">Zona de riesgo</h2>
          <button type="button" onClick={() => openReason('cancel', cuenta.id, 'Anular cuenta por pagar')}
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
            Anular cuenta por pagar
          </button>
        </section>
      )}

      <Dialog open={!!reasonAction} onOpenChange={open => { if (!open && !busy) setReasonAction(null) }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{reasonAction?.label}</DialogTitle>
            <DialogDescription>El historial se conserva. La accion requiere un motivo y recalcula el saldo de la cuenta.</DialogDescription>
          </DialogHeader>
          <label htmlFor="supplier-action-reason" className="text-sm font-medium">Motivo</label>
          <textarea id="supplier-action-reason" value={reason} maxLength={1000} disabled={busy}
            onChange={event => setReason(event.target.value)} className={fieldClass} autoFocus />
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setReasonAction(null)} className={secondaryButtonClass}>Cancelar</button>
            <button type="button" disabled={busy || !reason.trim()} onClick={confirmarMotivo} className={primaryButtonClass}>
              {reasonSaving ? 'Guardando...' : 'Confirmar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNcNdModal} onOpenChange={open => { if (!busy) setShowNcNdModal(open) }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Registrar Nota de Crédito / Débito</DialogTitle>
            <DialogDescription>El ajuste y el saldo se confirman juntos sobre la cuenta principal.</DialogDescription>
          </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                <select
                  value={ncNdForm.tipo}
                  onChange={(e) => setNcNdForm((f) => ({ ...f, tipo: e.target.value }))}
                  className={fieldClass}
                >
                  <option value="NC">NC — Nota de Crédito</option>
                  <option value="ND">ND — Nota de Débito</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Descripción <span className="text-red-400">*</span></label>
                <input
                  value={ncNdForm.descripcion}
                  onChange={(e) => setNcNdForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className={fieldClass}
                  placeholder="Ej: Descuento por volumen"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ncNdForm.monto}
                  onChange={(e) => setNcNdForm((f) => ({ ...f, monto: e.target.value }))}
                  className={fieldClass}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
                <input
                  type="date"
                  value={ncNdForm.fecha}
                  onChange={(e) => setNcNdForm((f) => ({ ...f, fecha: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={registrarNcNd}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {ncNdSaving ? 'Guardando...' : 'Registrar'}
              </button>
              <button
                type="button"
                disabled={busy} onClick={() => setShowNcNdModal(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
