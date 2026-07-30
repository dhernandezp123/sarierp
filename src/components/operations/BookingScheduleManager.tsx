'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, History, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import {
  cardClass,
  fieldClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'

export type ScheduleBooking = {
  id: string
  shipping_instruction_id: string
  shipment_id: string | null
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  original_etd: string | null
  original_eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  routing_summary: string | null
  shipment_status: string | null
  booking_lifecycle_status: 'ACTIVE' | 'CANCELLED' | 'REPLACED'
  supersedes_booking_id: string | null
  replaced_by_booking_id: string | null
  cancellation_reason: string | null
  cancelled_at: string | null
  updated_at: string | null
}

type ScheduleRevision = {
  id: string
  revision_number: number
  revision_type:
    | 'INITIAL'
    | 'SCHEDULE_CHANGE'
    | 'ROLLOVER_SAME_BOOKING'
    | 'CARRIER_UPDATE'
    | 'ROUTING_CHANGE'
    | 'ADMIN_CORRECTION'
  carrier: string | null
  booking_number: string | null
  carrier_booking: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  routing_summary: string | null
  reason: string | null
  source: string
  effective_at: string
  client_notified_at: string | null
  created_by: string | null
  created_at: string
  metadata: Record<string, unknown>
}

type ActionKind = 'revise' | 'rollover' | 'replace' | 'cancel' | 'admin'

type ScheduleForm = {
  carrier: string
  bookingNumber: string
  carrierBooking: string
  vesselName: string
  voyage: string
  etd: string
  eta: string
  routingSummary: string
  reason: string
  targetStatus: string
  containerTreatment:
    | 'KEEP_WITH_OLD'
    | 'MOVE_UNASSIGNED'
    | 'MOVE_ALL_IF_NOT_PHYSICALLY_USED'
    | 'MANUAL'
  clientNotified: boolean
  allowException: boolean
}

const actionTitles: Record<ActionKind, string> = {
  revise: 'Revisar itinerario',
  rollover: 'Registrar rollover',
  replace: 'Reemplazar booking',
  cancel: 'Cancelar booking',
  admin: 'Corrección administrativa',
}

const revisionLabels: Record<ScheduleRevision['revision_type'], string> = {
  INITIAL: 'Itinerario inicial',
  SCHEDULE_CHANGE: 'Itinerario actualizado',
  ROLLOVER_SAME_BOOKING: 'Rollover del mismo booking',
  CARRIER_UPDATE: 'Carrier actualizado',
  ROUTING_CHANGE: 'Ruta actualizada',
  ADMIN_CORRECTION: 'Corrección administrativa',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function emptyForm(booking: ScheduleBooking): ScheduleForm {
  return {
    carrier: booking.carrier || '',
    bookingNumber: booking.booking_number || '',
    carrierBooking: booking.carrier_booking || '',
    vesselName: booking.vessel_name || '',
    voyage: booking.voyage || '',
    etd: booking.etd || '',
    eta: booking.eta || '',
    routingSummary: booking.routing_summary || '',
    reason: '',
    targetStatus:
      booking.shipment_status === 'Listo para Embarque'
        ? 'Booking Confirmado'
        : booking.shipment_status || 'Booking Solicitado',
    containerTreatment: 'KEEP_WITH_OLD',
    clientNotified: false,
    allowException: false,
  }
}

function changedFields(booking: ScheduleBooking, form: ScheduleForm) {
  const changes: string[] = []
  if (form.carrier !== (booking.carrier || '')) changes.push('Carrier')
  if (form.bookingNumber !== (booking.booking_number || '')) changes.push('Booking number')
  if (form.carrierBooking !== (booking.carrier_booking || '')) changes.push('Carrier booking')
  if (form.vesselName !== (booking.vessel_name || '')) changes.push('Vessel')
  if (form.voyage !== (booking.voyage || '')) changes.push('Voyage')
  if (form.etd !== (booking.etd || '')) changes.push('ETD')
  if (form.eta !== (booking.eta || '')) changes.push('ETA')
  if (form.routingSummary !== (booking.routing_summary || '')) changes.push('Ruta')
  return changes
}

export function BookingScheduleManager({
  booking,
  userRole,
  onChanged,
  onReplaced,
}: {
  booking: ScheduleBooking
  userRole?: string | null
  onChanged: () => Promise<void>
  onReplaced: (newBookingId: string) => void
}) {
  const [revisions, setRevisions] = useState<ScheduleRevision[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<ActionKind | null>(null)
  const [form, setForm] = useState<ScheduleForm>(() => emptyForm(booking))
  const [submitting, setSubmitting] = useState(false)
  const isAdmin = userRole === 'Admin'
  const isActive = booking.booking_lifecycle_status === 'ACTIVE'
  const canNormalSchedule =
    isActive &&
    booking.shipment_status !== 'Finalizado' &&
    !booking.actual_etd
  const canRollover =
    canNormalSchedule &&
    !['Embarcado', 'En Tránsito', 'Arribado'].includes(
      booking.shipment_status || ''
    )
  const canCancel =
    isActive &&
    (
      isAdmin ||
      (
        !booking.actual_etd &&
        !['Embarcado', 'En Tránsito', 'Arribado', 'Finalizado'].includes(
          booking.shipment_status || ''
        )
      )
    )

  const loadHistory = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('booking_schedule_revisions')
      .select('*')
      .eq('booking_id', booking.id)
      .order('revision_number', { ascending: false })

    if (error) {
      toast.error(error.message || 'No se pudo cargar el historial de itinerario')
      setLoading(false)
      return
    }

    const rows = (data || []) as ScheduleRevision[]
    setRevisions(rows)
    const ids = Array.from(
      new Set(rows.map((row) => row.created_by).filter(Boolean) as string[])
    )
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, email')
        .in('id', ids)
      setUserNames(
        Object.fromEntries(
          (profiles || []).map((profile) => [
            profile.id,
            [profile.nombre, profile.apellido].filter(Boolean).join(' ') ||
              profile.email ||
              'Usuario',
          ])
        )
      )
    }
    setLoading(false)
  }, [booking.id])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadHistory])

  const latestRevision = revisions[0]
  const changes = useMemo(
    () => changedFields(booking, form),
    [booking, form]
  )

  const openAction = (nextAction: ActionKind) => {
    setForm(emptyForm(booking))
    setAction(nextAction)
  }

  const closeAction = () => {
    if (!submitting) setAction(null)
  }

  const submit = async () => {
    if (!action || !booking.updated_at) return
    if (!form.reason.trim()) {
      toast.error('Indica el motivo de la operación')
      return
    }

    setSubmitting(true)
    const notifiedAt = form.clientNotified ? new Date().toISOString() : null
    let result:
      | Awaited<ReturnType<typeof supabase.rpc>>
      | undefined

    if (action === 'revise') {
      result = await supabase.rpc('revise_booking_schedule', {
        p_booking_id: booking.id,
        p_expected_updated_at: booking.updated_at,
        p_reason: form.reason.trim(),
        p_carrier: form.carrier || null,
        p_vessel_name: form.vesselName || null,
        p_voyage: form.voyage || null,
        p_etd: form.etd || null,
        p_eta: form.eta || null,
        p_routing_summary: form.routingSummary || null,
        p_effective_at: new Date().toISOString(),
        p_client_notified_at: notifiedAt,
      })
    } else if (action === 'rollover') {
      result = await supabase.rpc('rollover_booking_schedule', {
        p_booking_id: booking.id,
        p_expected_updated_at: booking.updated_at,
        p_reason: form.reason.trim(),
        p_vessel_name: form.vesselName || null,
        p_voyage: form.voyage || null,
        p_etd: form.etd || null,
        p_eta: form.eta || null,
        p_routing_summary: form.routingSummary || null,
        p_target_status: form.targetStatus || null,
        p_effective_at: new Date().toISOString(),
        p_client_notified_at: notifiedAt,
      })
    } else if (action === 'replace') {
      result = await supabase.rpc('replace_booking', {
        p_old_booking_id: booking.id,
        p_expected_updated_at: booking.updated_at,
        p_new_carrier: form.carrier || null,
        p_new_booking_number: form.bookingNumber || null,
        p_new_carrier_booking: form.carrierBooking || null,
        p_new_vessel_name: form.vesselName || null,
        p_new_voyage: form.voyage || null,
        p_new_etd: form.etd || null,
        p_new_eta: form.eta || null,
        p_reason: form.reason.trim(),
        p_container_treatment: form.containerTreatment,
        p_new_routing_summary: form.routingSummary || null,
        p_allow_issued_bl_exception: isAdmin && form.allowException,
      })
    } else if (action === 'cancel') {
      result = await supabase.rpc('cancel_booking', {
        p_booking_id: booking.id,
        p_expected_updated_at: booking.updated_at,
        p_reason: form.reason.trim(),
        p_allow_post_departure_exception: isAdmin && form.allowException,
      })
    } else {
      result = await supabase.rpc('correct_booking_administrative', {
        p_booking_id: booking.id,
        p_expected_updated_at: booking.updated_at,
        p_reason: form.reason.trim(),
        p_changes: {
          booking_number: form.bookingNumber || null,
          carrier_booking: form.carrierBooking || null,
          carrier: form.carrier || null,
          vessel_name: form.vesselName || null,
          voyage: form.voyage || null,
          etd: form.etd || null,
          eta: form.eta || null,
          routing_summary: form.routingSummary || null,
        },
      })
    }

    setSubmitting(false)
    if (result.error) {
      toast.error(
        result.error.code === '40001'
          ? 'El booking cambió en otra sesión. Recarga e inténtalo nuevamente.'
          : result.error.message
      )
      return
    }

    const payload = result.data as {
      new_booking?: { id?: string }
    } | null
    setAction(null)
    toast.success(`${actionTitles[action]} registrado`)

    if (action === 'replace' && payload?.new_booking?.id) {
      onReplaced(payload.new_booking.id)
      return
    }

    await onChanged()
    await loadHistory()
  }

  return (
    <>
      <section className={cardClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Itinerario actual
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Las fechas originales permanecen inmutables; cada cambio vigente crea historial.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canNormalSchedule && (
              <button
                type="button"
                onClick={() => openAction('revise')}
                className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Revisar itinerario
              </button>
            )}
            {canRollover && (
              <button
                type="button"
                onClick={() => openAction('rollover')}
                className={secondaryButtonClass}
              >
                Registrar rollover
              </button>
            )}
            {isActive && !booking.actual_etd && booking.shipment_status !== 'Finalizado' && (
              <button
                type="button"
                onClick={() => openAction('replace')}
                className={secondaryButtonClass}
              >
                Reemplazar booking
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => openAction('cancel')}
                className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Cancelar booking
              </button>
            )}
            {isAdmin && booking.booking_lifecycle_status !== 'REPLACED' && (
              <button
                type="button"
                onClick={() => openAction('admin')}
                className={secondaryButtonClass}
              >
                Corrección Admin
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Carrier', booking.carrier || '—'],
            ['Booking', booking.booking_number || booking.carrier_booking || '—'],
            ['Vessel / Voyage', [booking.vessel_name, booking.voyage].filter(Boolean).join(' / ') || '—'],
            ['Ruta', booking.routing_summary || '—'],
            ['ETD original', formatDate(booking.original_etd)],
            ['ETD vigente', formatDate(booking.etd)],
            ['ETA original', formatDate(booking.original_eta)],
            ['ETA vigente', formatDate(booking.eta)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {value}
              </p>
            </div>
          ))}
        </div>

        {booking.booking_lifecycle_status !== 'ACTIVE' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Estado histórico: {booking.booking_lifecycle_status === 'REPLACED' ? 'Reemplazado' : 'Cancelado'}.
            {booking.cancellation_reason ? ` Motivo: ${booking.cancellation_reason}` : ''}
          </div>
        )}
      </section>

      <section className={`${cardClass} mt-6`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Historial de itinerario
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {revisions.length} revisión{revisions.length === 1 ? '' : 'es'}
              {latestRevision ? ` · Último cambio ${formatDateTime(latestRevision.created_at)}` : ''}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-500">Cargando historial...</p>
        ) : revisions.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">
            El booking aún no tiene un itinerario conocido.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {revisions.map((revision) => (
              <article
                key={revision.id}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Rev. {revision.revision_number} · {revisionLabels[revision.revision_type]}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Efectiva {formatDateTime(revision.effective_at)} · Registrada {formatDateTime(revision.created_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {revision.source}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                  {[revision.carrier, revision.vessel_name, revision.voyage]
                    .filter(Boolean)
                    .join(' · ') || 'Sin carrier/vessel/voyage'}
                  {' · '}ETD {formatDate(revision.etd)} · ETA {formatDate(revision.eta)}
                </p>
                {revision.reason && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Motivo: {revision.reason}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Registrado por {revision.created_by ? userNames[revision.created_by] || 'Usuario' : 'Sistema'}
                  {revision.client_notified_at
                    ? ` · Cliente notificado ${formatDateTime(revision.client_notified_at)}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{action ? actionTitles[action] : ''}</DialogTitle>
            <DialogDescription>
              {action === 'replace'
                ? 'Se creará otro booking y el actual quedará histórico. BL, documentos, tracking y fechas reales no se copiarán.'
                : action === 'cancel'
                  ? 'El booking se conservará como histórico y dejará de participar en cálculos activos.'
                  : action === 'admin'
                    ? 'Solo para errores de captura. No uses esta acción para ocultar un cambio operativo real.'
                    : 'Compara el itinerario vigente con el nuevo y documenta el motivo.'}
            </DialogDescription>
          </DialogHeader>

          {action && action !== 'cancel' && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700 dark:text-slate-300">
                Carrier
                <input
                  value={form.carrier}
                  onChange={(event) => setForm({ ...form, carrier: event.target.value })}
                  disabled={action === 'rollover'}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              {(action === 'replace' || action === 'admin') && (
                <>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Booking number
                    <input
                      value={form.bookingNumber}
                      onChange={(event) => setForm({ ...form, bookingNumber: event.target.value })}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Carrier booking
                    <input
                      value={form.carrierBooking}
                      onChange={(event) => setForm({ ...form, carrierBooking: event.target.value })}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                </>
              )}
              <label className="text-sm text-slate-700 dark:text-slate-300">
                Vessel
                <input
                  value={form.vesselName}
                  onChange={(event) => setForm({ ...form, vesselName: event.target.value })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-300">
                Voyage
                <input
                  value={form.voyage}
                  onChange={(event) => setForm({ ...form, voyage: event.target.value })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-300">
                ETD
                <input
                  type="date"
                  value={form.etd}
                  onChange={(event) => setForm({ ...form, etd: event.target.value })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-300">
                ETA
                <input
                  type="date"
                  value={form.eta}
                  onChange={(event) => setForm({ ...form, eta: event.target.value })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-300 md:col-span-2">
                Ruta / transbordo
                <input
                  value={form.routingSummary}
                  onChange={(event) => setForm({ ...form, routingSummary: event.target.value })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
            </div>
          )}

          {action === 'rollover' && booking.shipment_status === 'Listo para Embarque' && (
            <label className="mt-4 block text-sm text-slate-700 dark:text-slate-300">
              Estado después del rollover
              <select
                value={form.targetStatus}
                onChange={(event) => setForm({ ...form, targetStatus: event.target.value })}
                className={`${fieldClass} mt-1`}
              >
                <option value="Booking Confirmado">Booking Confirmado</option>
                <option value="Documentación Pendiente">Documentación Pendiente</option>
              </select>
            </label>
          )}

          {action === 'replace' && (
            <label className="mt-4 block text-sm text-slate-700 dark:text-slate-300">
              Tratamiento de contenedores
              <select
                value={form.containerTreatment}
                onChange={(event) =>
                  setForm({
                    ...form,
                    containerTreatment: event.target.value as ScheduleForm['containerTreatment'],
                  })
                }
                className={`${fieldClass} mt-1`}
              >
                <option value="KEEP_WITH_OLD">Conservar con el anterior (recomendado)</option>
                <option value="MOVE_UNASSIGNED">Mover solo sin eventos físicos</option>
                <option value="MOVE_ALL_IF_NOT_PHYSICALLY_USED">Mover todos si ninguno fue usado</option>
                <option value="MANUAL">Resolver manualmente</option>
              </select>
            </label>
          )}

          {changes.length > 1 && action !== 'cancel' && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Esta operación cambia {changes.length} campos: {changes.join(', ')}.
            </p>
          )}

          <label className="mt-4 block text-sm text-slate-700 dark:text-slate-300">
            Motivo obligatorio
            <textarea
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              rows={3}
              className={`${fieldClass} mt-1 min-h-24`}
            />
          </label>

          {(action === 'revise' || action === 'rollover') && (
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.clientNotified}
                onChange={(event) => setForm({ ...form, clientNotified: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              El cliente fue notificado de este cambio
            </label>
          )}

          {isAdmin && (action === 'replace' || action === 'cancel') && (
            <label className="mt-4 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <input
                type="checkbox"
                checked={form.allowException}
                onChange={(event) => setForm({ ...form, allowException: event.target.checked })}
                className="h-4 w-4 rounded border-red-300"
              />
              Confirmo la excepción administrativa y la revisión documental
            </label>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={closeAction}
              disabled={submitting}
              className={secondaryButtonClass}
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                action === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {action === 'rollover' && <RotateCcw className="mr-2 h-4 w-4" />}
              {action === 'cancel' && <XCircle className="mr-2 h-4 w-4" />}
              {submitting ? 'Procesando...' : 'Confirmar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
