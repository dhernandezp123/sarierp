'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

type CuentaPagar = {
  id: string
  descripcion: string
  numero_factura_proveedor: string | null
  monto: number
  moneda: string
  fecha_factura: string | null
  fecha_vencimiento: string | null
  status: string
  notas: string | null
  proveedores: { id: string; nombre: string; tipo: string; terminos_pago: number } | null
  quotations: { id: string; quotation_number: string | null } | null
  bookings: { id: string; booking_number: string | null } | null
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
}

const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Parcialmente Pagada': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Vencida: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Anulada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const fmtMoney = (n: number, cur = 'USD') =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

export default function APDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()

  const [cuenta, setCuenta] = useState<CuentaPagar | null>(null)
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPagoForm, setShowPagoForm] = useState(false)
  const [confirmAnularOpen, setConfirmAnularOpen] = useState(false)

  const [pagoForm, setPagoForm] = useState({
    monto: '',
    metodo_pago: 'Transferencia',
    referencia: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    notas: '',
  })

  const load = async () => {
    setLoading(true)
    const [{ data: cp }, { data: pp }] = await Promise.all([
      supabase.from('cuentas_pagar')
        .select('*, proveedores(id, nombre, tipo, terminos_pago), quotations(id, quotation_number), bookings(id, booking_number)')
        .eq('id', id).single(),
      supabase.from('pagos_proveedor').select('*').eq('cuenta_pagar_id', id).order('fecha_pago', { ascending: false }),
    ])

    if (!cp) {
      toast.error('Cuenta no encontrada')
      router.push('/accounts-payable')
      return
    }

    setCuenta(cp as unknown as CuentaPagar)
    setPagos((pp || []) as Pago[])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0)
  const saldoPendiente = Math.max(0, (cuenta?.monto ?? 0) - totalPagado)

  const registrarPago = async () => {
    if (!cuenta) return

    const montoPago = Number.parseFloat(pagoForm.monto)
    if (Number.isNaN(montoPago) || montoPago <= 0) {
      toast.error('Monto invalido')
      return
    }
    if (montoPago > saldoPendiente) {
      toast.error('El pago no puede ser mayor al saldo pendiente')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('pagos_proveedor').insert({
      cuenta_pagar_id: id,
      monto: montoPago,
      moneda: cuenta.moneda,
      fecha_pago: pagoForm.fecha_pago,
      metodo_pago: pagoForm.metodo_pago || null,
      referencia: pagoForm.referencia.trim() || null,
      notas: pagoForm.notas.trim() || null,
      created_by: user?.id || null,
    })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    const nuevoTotal = totalPagado + montoPago
    const nuevoStatus = nuevoTotal >= cuenta.monto ? 'Pagada' : 'Parcialmente Pagada'
    const { error: updateError } = await supabase
      .from('cuentas_pagar')
      .update({ status: nuevoStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      toast.error(updateError.message)
      setSaving(false)
      return
    }

    toast.success('Pago registrado')
    setShowPagoForm(false)
    setPagoForm({ monto: '', metodo_pago: 'Transferencia', referencia: '', fecha_pago: new Date().toISOString().split('T')[0], notas: '' })
    setSaving(false)
    load()
  }

  const anular = async () => {
    if (!cuenta) return
    const { error } = await supabase.from('cuentas_pagar').update({ status: 'Anulada', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Cuenta anulada')
    load()
  }

  if (loading) return <PageSkeleton cards={2} rows={4} />
  if (!cuenta) return null

  const overdue = ['Pendiente', 'Parcialmente Pagada'].includes(cuenta.status) && !!cuenta.fecha_vencimiento && new Date(cuenta.fecha_vencimiento + 'T00:00:00') < new Date()
  const displayStatus = overdue && cuenta.status === 'Pendiente' ? 'Vencida' : cuenta.status

  const setP = (f: keyof typeof pagoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setPagoForm((p) => ({ ...p, [f]: e.target.value }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <Link href="/accounts-payable" className="hover:underline">Cuentas por pagar</Link>{' / '}
            <Link href={`/suppliers/${(cuenta.proveedores as any)?.id}`} className="text-slate-700 hover:underline dark:text-slate-300">
              {(cuenta.proveedores as any)?.nombre}
            </Link>
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{cuenta.descripcion}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[displayStatus] ?? ''}`}>{displayStatus}</span>
            {cuenta.numero_factura_proveedor && <span className="text-sm text-slate-500">Factura: {cuenta.numero_factura_proveedor}</span>}
          </div>
        </div>
        <button type="button" onClick={() => router.push('/accounts-payable')} className={secondaryButtonClass}>Volver</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
          <p className="text-xs text-slate-500">Monto total</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{fmtMoney(Number(cuenta.monto), cuenta.moneda)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Pagado</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmtMoney(totalPagado, cuenta.moneda)}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${saldoPendiente > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'}`}>
          <p className={`text-xs ${saldoPendiente > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>Saldo pendiente</p>
          <p className={`mt-1 text-xl font-bold ${saldoPendiente > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>
            {fmtMoney(saldoPendiente, cuenta.moneda)}
          </p>
        </div>
      </div>

      <section className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Informacion</h2>
        <div className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
          {[
            ['Proveedor', (cuenta.proveedores as any)?.nombre],
            ['Tipo proveedor', (cuenta.proveedores as any)?.tipo],
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
              <Link href={`/quotations/${(cuenta.quotations as any).id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {(cuenta.quotations as any).quotation_number || 'Ver cotizacion'}
              </Link>
            </div>
          )}
          {cuenta.bookings && (
            <div className="flex gap-2">
              <span className="w-32 shrink-0 font-medium text-slate-500">Booking:</span>
              <span className="text-slate-800 dark:text-slate-200">{(cuenta.bookings as any).booking_number}</span>
            </div>
          )}
          {cuenta.notas && (
            <div className="mt-1 rounded-xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300 md:col-span-2">{cuenta.notas}</div>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pagos registrados</h2>
          {cuenta.status !== 'Pagada' && cuenta.status !== 'Anulada' && (
            <button type="button" onClick={() => setShowPagoForm(!showPagoForm)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
              <Plus className="h-3.5 w-3.5" />
              Registrar pago
            </button>
          )}
        </div>

        {showPagoForm && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto <span className="text-red-400">*</span></label>
                <input type="number" step="0.01" max={saldoPendiente} value={pagoForm.monto} onChange={setP('monto')} className={fieldClass}
                  placeholder={`Max. ${fmtMoney(saldoPendiente, cuenta.moneda)}`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fecha de pago</label>
                <input type="date" value={pagoForm.fecha_pago} onChange={setP('fecha_pago')} className={fieldClass} />
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
              <button type="button" onClick={registrarPago} disabled={saving} className={`${primaryButtonClass} disabled:opacity-50`}>
                {saving ? 'Guardando...' : 'Confirmar pago'}
              </button>
              <button type="button" onClick={() => setShowPagoForm(false)} className={secondaryButtonClass}>Cancelar</button>
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
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmtMoney(Number(p.monto), p.moneda)}</p>
                    <p className="text-xs text-slate-400">{fmtDate(p.fecha_pago)} / {p.metodo_pago || 'Sin metodo'} {p.referencia ? `/ ${p.referencia}` : ''}</p>
                  </div>
                </div>
                {p.notas && <p className="text-xs text-slate-400">{p.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {cuenta.status !== 'Pagada' && cuenta.status !== 'Anulada' && (
        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-red-600 dark:text-red-400">Zona de riesgo</h2>
          <button type="button" onClick={() => setConfirmAnularOpen(true)}
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
            Anular cuenta por pagar
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirmAnularOpen}
        onOpenChange={setConfirmAnularOpen}
        title="Anular cuenta por pagar"
        description="Esta cuenta quedara marcada como anulada y ya no aceptara pagos nuevos."
        confirmLabel="Anular"
        danger
        onConfirm={anular}
      />
    </div>
  )
}
