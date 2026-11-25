'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, fieldLabelClass } from '@/src/lib/ui-classes'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import { OperationDialogContent } from '@/src/components/operations/OperationDialog'
import { operationPrimaryButtonClass, operationSecondaryButtonClass } from '@/src/components/operations/OperationsWorkspace'

export type ReadinessRequirement = {
  id: string | null
  code: string
  label: string
  scope: string
  required: boolean
  status: 'COMPLETED' | 'BLOCKED' | 'AUTHORIZED_EXCEPTION' | 'NOT_APPLICABLE'
  blocking: boolean
  completed_at: string | null
  completed_by: string | null
  details: Record<string, unknown>
}

export type BookingReadinessEvaluation = {
  booking_id: string
  shipment_id: string
  mode: string
  lifecycle_status: string
  excluded: boolean
  ready: boolean
  blocking_count: number
  warning_count: number
  requirements: ReadinessRequirement[]
  overdue_cutoffs: Array<{
    id: string
    code: string
    label: string
    container_id: string | null
    due_at: string
    timezone: string | null
    status: string
  }>
  missing_vgm_containers: Array<{
    booking_container_id: string
    container_type: string | null
    quantity: number
    container_reference: string | null
    reason: string
  }>
  authorized_exceptions: Array<{
    id: string
    requirement_code: string
    reason: string
    approved_at: string
    expires_at: string | null
  }>
  evaluated_at: string
}

type BookingContainer = {
  id?: string
  container_type: string
  quantity: number | ''
  notes: string
}

type BookingCutoff = {
  id: string
  booking_container_id: string | null
  booking_schedule_revision_id: string | null
  cutoff_code: string
  cutoff_label: string
  due_at: string
  timezone: string | null
  source: string
  source_reference: string | null
  status: string
  completed_at: string | null
  waived_at: string | null
  waiver_reason: string | null
  notes: string | null
  superseded_by_cutoff_id: string | null
  updated_at: string
}

type VgmRecord = {
  id: string
  booking_container_id: string
  version_number: number
  gross_mass: number
  unit: 'KG' | 'LB'
  verification_method: string
  weighed_at: string | null
  submitted_at: string | null
  submission_reference: string | null
  status: string
  notes: string | null
  updated_at: string
}

type CutoffForm = {
  code: string
  label: string
  dueAt: string
  timezone: string
  containerId: string
  sourceReference: string
  notes: string
  reason: string
}

type VgmRow = {
  grossMass: string
  unit: 'KG' | 'LB'
  method: string
  weighedAt: string
}

const vgmMethodOptions = [
  ['METHOD_1', 'Método 1 (contenedor lleno)'],
  ['METHOD_2', 'Método 2 (suma de carga)'],
  ['CARRIER_PROVIDED', 'Provista por naviera'],
  ['OTHER', 'Otro'],
] as const

const vgmStatusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  VERIFIED: 'Verificada',
  SUBMITTED: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
}

function vgmMethodLabel(value: string) {
  return vgmMethodOptions.find(([option]) => option === value)?.[1] || value
}

function emptyVgmRow(): VgmRow {
  return { grossMass: '', unit: 'KG', method: 'METHOD_2', weighedAt: localDateTimeValue() }
}

const cutoffOptions = [
  ['SHIPPING_INSTRUCTIONS', 'Shipping Instructions'],
  ['DOCUMENTATION', 'Documentación'],
  ['VGM', 'VGM'],
  ['CY', 'CY'],
  ['GATE_IN', 'Gate In'],
  ['CARGO_DELIVERY', 'Entrega de carga'],
  ['CUSTOMS', 'Customs'],
  ['AMS', 'AMS'],
  ['ENS', 'ENS'],
  ['PORT', 'Puerto'],
  ['TERMINAL_RECEIVING', 'Recepción terminal'],
  ['EMPTY_PICKUP', 'Retiro de vacío'],
  ['FULL_RETURN', 'Retorno lleno'],
  ['OTHER', 'Otro'],
] as const

const readinessStatusLabel: Record<string, string> = {
  COMPLETED: 'Completo',
  BLOCKED: 'Pendiente',
  AUTHORIZED_EXCEPTION: 'Autorizado por excepción',
  NOT_APPLICABLE: 'No aplica',
}

const readinessModeLabel: Record<string, string> = {
  SEA_FCL: 'Marítimo FCL',
  SEA_LCL: 'Marítimo LCL',
  AIR: 'Aéreo',
  ROAD_FTL: 'Terrestre FTL',
  ROAD_LTL: 'Terrestre LTL',
}

const manualRequirementCodes = new Set(['CUSTOMS_FILING', 'CARGO_RECEIVED'])
const exceptionRequirementCodes = new Set([
  'SHIPPING_INSTRUCTIONS_SENT',
  'DOCUMENTATION_COMPLETE',
  'CUSTOMS_FILING',
  'GATE_IN_COMPLETE',
  'CARGO_RECEIVED',
  'BL_INSTRUCTIONS',
  'NO_BLOCKING_INCIDENTS',
])

function localDateTimeValue(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value?: string | null, timezone?: string | null) {
  if (!value) return 'N/A'
  try {
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || undefined,
      timeZoneName: 'short',
    }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  }
}

function remainingLabel(value: string) {
  const hours = (new Date(value).getTime() - Date.now()) / 3_600_000
  if (hours < 0) return `Vencido hace ${Math.ceil(Math.abs(hours))} h`
  if (hours < 24) return `${Math.max(Math.ceil(hours), 0)} h restantes`
  return `${Math.ceil(hours / 24)} días restantes`
}

function containerLabel(container?: BookingContainer) {
  if (!container) return 'Booking'
  return (
    container.notes?.trim() ||
    `${container.container_type || 'Contenedor'} · ${container.id?.slice(0, 8)}`
  )
}

function statusClasses(status: string) {
  if (['COMPLETED', 'ACCEPTED', 'SUBMITTED'].includes(status)) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  }
  if (['BLOCKED', 'MISSED', 'REJECTED'].includes(status)) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  }
  if (['AUTHORIZED_EXCEPTION', 'WAIVED', 'VERIFIED'].includes(status)) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export function BookingReadinessPanel({
  bookingId,
  shipmentId,
  containers,
  userRole,
  onEvaluationChange,
}: {
  bookingId: string
  shipmentId: string | null
  containers: BookingContainer[]
  userRole?: string | null
  onEvaluationChange?: (evaluation: BookingReadinessEvaluation | null) => void
}) {
  const [evaluation, setEvaluation] = useState<BookingReadinessEvaluation | null>(null)
  const [cutoffs, setCutoffs] = useState<BookingCutoff[]>([])
  const [vgmRecords, setVgmRecords] = useState<VgmRecord[]>([])
  const [latestRevisionId, setLatestRevisionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cutoffOpen, setCutoffOpen] = useState(false)
  const [cutoffForm, setCutoffForm] = useState<CutoffForm>(() => ({
    code: 'DOCUMENTATION',
    label: 'Documentación',
    dueAt: localDateTimeValue(new Date(Date.now() + 24 * 3_600_000)),
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Tegucigalpa',
    containerId: '',
    sourceReference: '',
    notes: '',
    reason: '',
  }))
  const [cutoffAction, setCutoffAction] = useState<{
    kind: 'complete' | 'waive' | 'cancel'
    cutoff: BookingCutoff
  } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [exceptionExpiry, setExceptionExpiry] = useState('')
  const [requirementAction, setRequirementAction] = useState<{
    kind: 'complete' | 'waive'
    requirement: ReadinessRequirement
  } | null>(null)
  const [vgmRows, setVgmRows] = useState<Record<string, VgmRow>>({})
  const [vgmAction, setVgmAction] = useState<{
    kind: 'submit' | 'reject' | 'supersede'
    record: VgmRecord
  } | null>(null)

  const canManage = userRole === 'Admin' || userRole === 'Operaciones'
  const isAdmin = userRole === 'Admin'

  const load = useCallback(async () => {
    setLoading(true)
    const [readinessResult, cutoffResult, vgmResult, revisionResult] =
      await Promise.all([
        supabase.rpc('evaluate_booking_readiness', { p_booking_id: bookingId }),
        supabase
          .from('booking_cutoffs')
          .select(
            'id, booking_container_id, booking_schedule_revision_id, cutoff_code, cutoff_label, due_at, timezone, source, source_reference, status, completed_at, waived_at, waiver_reason, notes, superseded_by_cutoff_id, updated_at'
          )
          .eq('booking_id', bookingId)
          .order('due_at', { ascending: true }),
        supabase
          .from('container_vgm_records')
          .select(
            'id, booking_container_id, version_number, gross_mass, unit, verification_method, weighed_at, submitted_at, submission_reference, status, notes, updated_at'
          )
          .eq('booking_id', bookingId)
          .order('version_number', { ascending: false }),
        supabase
          .from('booking_schedule_revisions')
          .select('id')
          .eq('booking_id', bookingId)
          .order('revision_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    setLoading(false)

    if (readinessResult.error) {
      toast.error('No se pudo evaluar el readiness', {
        description: readinessResult.error.message,
      })
      setEvaluation(null)
      onEvaluationChange?.(null)
    } else {
      const value = readinessResult.data as BookingReadinessEvaluation
      setEvaluation(value)
      onEvaluationChange?.(value)
    }

    if (cutoffResult.error) {
      toast.error('No se pudieron cargar los cut-offs')
    } else {
      setCutoffs((cutoffResult.data || []) as BookingCutoff[])
    }

    if (vgmResult.error) {
      toast.error('No se pudieron cargar los registros VGM')
    } else {
      setVgmRecords((vgmResult.data || []) as VgmRecord[])
    }

    setLatestRevisionId(revisionResult.data?.id || null)
  }, [bookingId, onEvaluationChange])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const currentCutoffs = useMemo(
    () => cutoffs.filter((cutoff) => !cutoff.superseded_by_cutoff_id),
    [cutoffs]
  )

  const activeVgmByContainer = useMemo(() => {
    return vgmRecords.reduce<Record<string, VgmRecord>>((acc, record) => {
      if (
        !acc[record.booking_container_id] &&
        !['SUPERSEDED', 'REJECTED'].includes(record.status)
      ) {
        acc[record.booking_container_id] = record
      }
      return acc
    }, {})
  }, [vgmRecords])

  const pendingVgmContainers = containers.filter((container) => {
    if (!container.id || Number(container.quantity) !== 1) return false
    const record = activeVgmByContainer[container.id]
    return !record || !['SUBMITTED', 'ACCEPTED'].includes(record.status)
  })
  const readyVgmRows = pendingVgmContainers
    .map((container) => ({ containerId: container.id!, row: vgmRows[container.id!] }))
    .filter((item): item is { containerId: string; row: VgmRow } => Boolean(item.row && Number(item.row.grossMass) > 0))

  const readinessPercent = useMemo(() => {
    const applicable =
      evaluation?.requirements.filter((requirement) => requirement.required) || []
    if (applicable.length === 0) return 0
    const satisfied = applicable.filter((requirement) =>
      ['COMPLETED', 'AUTHORIZED_EXCEPTION'].includes(requirement.status)
    ).length
    return Math.round((satisfied / applicable.length) * 100)
  }, [evaluation])

  const saveCutoff = async () => {
    if (!shipmentId) {
      toast.error('El booking todavía no tiene shipment canónico')
      return
    }
    if (!cutoffForm.label.trim() || !cutoffForm.dueAt || !cutoffForm.timezone) {
      toast.error('Completa tipo, fecha, hora y timezone')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('create_or_replace_booking_cutoff', {
      p_booking_id: bookingId,
      p_booking_container_id: cutoffForm.containerId || null,
      p_cutoff_code: cutoffForm.code,
      p_cutoff_label: cutoffForm.label.trim(),
      p_due_at: new Date(cutoffForm.dueAt).toISOString(),
      p_timezone: cutoffForm.timezone.trim(),
      p_source: 'MANUAL',
      p_source_reference: cutoffForm.sourceReference.trim() || null,
      p_booking_schedule_revision_id: latestRevisionId,
      p_reason: cutoffForm.reason.trim() || null,
      p_notes: cutoffForm.notes.trim() || null,
      p_metadata: { client_visible: true },
      p_allow_completed_replacement: false,
    })
    setSaving(false)

    if (error) {
      toast.error('No se pudo guardar el cut-off', {
        description: error.message,
      })
      return
    }

    setCutoffOpen(false)
    toast.success('Cut-off guardado')
    await load()
  }

  const runCutoffAction = async () => {
    if (!cutoffAction) return
    if (
      cutoffAction.kind !== 'complete' &&
      !actionReason.trim()
    ) {
      toast.error('El motivo es obligatorio')
      return
    }

    setSaving(true)
    const { error } =
      cutoffAction.kind === 'complete'
        ? await supabase.rpc('complete_booking_cutoff', {
            p_cutoff_id: cutoffAction.cutoff.id,
            p_expected_updated_at: cutoffAction.cutoff.updated_at,
            p_notes: actionReason.trim() || null,
          })
        : cutoffAction.kind === 'waive'
          ? await supabase.rpc('waive_booking_cutoff', {
              p_cutoff_id: cutoffAction.cutoff.id,
              p_expected_updated_at: cutoffAction.cutoff.updated_at,
              p_reason: actionReason.trim(),
              p_expires_at: exceptionExpiry
                ? new Date(exceptionExpiry).toISOString()
                : null,
            })
          : await supabase.rpc('cancel_booking_cutoff', {
              p_cutoff_id: cutoffAction.cutoff.id,
              p_expected_updated_at: cutoffAction.cutoff.updated_at,
              p_reason: actionReason.trim(),
            })
    setSaving(false)

    if (error) {
      toast.error('No se pudo actualizar el cut-off', {
        description: error.message,
      })
      return
    }

    setCutoffAction(null)
    setActionReason('')
    setExceptionExpiry('')
    toast.success('Cut-off actualizado')
    await load()
  }

  const runRequirementAction = async () => {
    if (!requirementAction) return
    if (!requirementAction.requirement.id) return
    if (requirementAction.kind === 'waive' && !actionReason.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }

    setSaving(true)
    const requirementRow = await supabase
      .from('booking_readiness_requirements')
      .select('updated_at')
      .eq('id', requirementAction.requirement.id)
      .single()

    if (requirementRow.error || !requirementRow.data) {
      setSaving(false)
      toast.error('No se pudo verificar la versión del requisito')
      return
    }

    const { error } =
      requirementAction.kind === 'complete'
        ? await supabase.rpc('complete_booking_readiness_requirement', {
            p_requirement_id: requirementAction.requirement.id,
            p_expected_updated_at: requirementRow.data.updated_at,
            p_source_entity_type: 'MANUAL_OPERATIONAL_EVIDENCE',
            p_source_entity_id: null,
            p_validation_details: { completed_from: 'booking_detail' },
          })
        : await supabase.rpc('authorize_booking_readiness_exception', {
            p_requirement_id: requirementAction.requirement.id,
            p_expected_updated_at: requirementRow.data.updated_at,
            p_reason: actionReason.trim(),
            p_expires_at: exceptionExpiry
              ? new Date(exceptionExpiry).toISOString()
              : null,
            p_metadata: { source: 'booking_detail' },
          })
    setSaving(false)

    if (error) {
      toast.error('No se pudo actualizar el requisito', {
        description: error.message,
      })
      return
    }

    setRequirementAction(null)
    setActionReason('')
    setExceptionExpiry('')
    toast.success(
      requirementAction.kind === 'complete'
        ? 'Requisito completado'
        : 'Excepción autorizada'
    )
    await load()
  }

  // Una sola acción: borrador, verificación y envío de todas las filas completas.
  const submitVgmBatch = async () => {
    if (readyVgmRows.length === 0) {
      toast.error('Ingresa la masa bruta de al menos un contenedor')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('submit_booking_vgm_batch', {
      p_booking_id: bookingId,
      p_rows: readyVgmRows.map(({ containerId, row }) => ({
        booking_container_id: containerId,
        gross_mass: Number(row.grossMass),
        unit: row.unit,
        verification_method: row.method,
        weighed_at: row.weighedAt ? new Date(row.weighedAt).toISOString() : null,
      })),
      p_submission_reference: null,
    })
    setSaving(false)

    if (error) {
      toast.error('No se envió ninguna VGM', { description: error.message })
      return
    }

    const sent = Number((data as { submitted?: number } | null)?.submitted || 0)
    setVgmRows({})
    toast.success(sent === 1 ? 'VGM enviada' : `${sent} VGM enviadas`)
    await load()
  }

  const acceptVgm = async (record: VgmRecord) => {
    setSaving(true)
    const result = await supabase.rpc('accept_container_vgm', {
      p_vgm_id: record.id,
      p_expected_updated_at: record.updated_at,
    })
    setSaving(false)

    if (result.error) {
      toast.error('No se pudo cambiar la VGM', {
        description: result.error.message,
      })
      return
    }

    toast.success('Estado VGM actualizado')
    await load()
  }

  const runVgmReasonAction = async () => {
    if (!vgmAction || !actionReason.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }
    setSaving(true)
    const result =
      vgmAction.kind === 'reject'
        ? await supabase.rpc('reject_container_vgm', {
            p_vgm_id: vgmAction.record.id,
            p_expected_updated_at: vgmAction.record.updated_at,
            p_reason: actionReason.trim(),
          })
        : await supabase.rpc('supersede_container_vgm', {
            p_vgm_id: vgmAction.record.id,
            p_expected_updated_at: vgmAction.record.updated_at,
            p_reason: actionReason.trim(),
          })
    setSaving(false)

    if (result.error) {
      toast.error('No se pudo actualizar la VGM', {
        description: result.error.message,
      })
      return
    }

    setVgmAction(null)
    setActionReason('')
    toast.success('VGM actualizada')
    await load()
  }

  if (loading) {
    return (
      <section className={cardClass}>
        <p className="text-sm text-slate-500">Evaluando readiness...</p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Readiness previo al embarque
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {readinessModeLabel[evaluation?.mode || ''] || 'Modalidad sin definir'} ·{' '}
              {readinessPercent}% de requisitos satisfechos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                evaluation?.ready
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              }`}
            >
              {evaluation?.ready
                ? 'Listo para embarcar'
                : `${evaluation?.blocking_count || 0} bloqueo${evaluation?.blocking_count === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Actualizar readiness"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(evaluation?.requirements || []).map((requirement) => (
            <div
              key={requirement.code}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {requirement.label}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClasses(
                    requirement.status
                  )}`}
                >
                  {readinessStatusLabel[requirement.status] || requirement.status}
                </span>
              </div>
              {canManage &&
                requirement.status === 'BLOCKED' &&
                requirement.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {manualRequirementCodes.has(requirement.code) && (
                      <button
                        type="button"
                        onClick={() =>
                          setRequirementAction({ kind: 'complete', requirement })
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Completar
                      </button>
                    )}
                    {isAdmin && exceptionRequirementCodes.has(requirement.code) && (
                      <button
                        type="button"
                        onClick={() =>
                          setRequirementAction({ kind: 'waive', requirement })
                        }
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        Autorizar excepción
                      </button>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>

        {(evaluation?.overdue_cutoffs.length || 0) > 0 && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Cut-offs vencidos
            </div>
            <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
              {evaluation?.overdue_cutoffs.map((cutoff) => (
                <li key={cutoff.id}>
                  {cutoff.label}: {formatDateTime(cutoff.due_at, cutoff.timezone)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Cut-offs operativos
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Fechas con timezone y revisión de itinerario asociada.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCutoffOpen(true)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Agregar cut-off
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {currentCutoffs.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-950/60">
              No hay cut-offs vigentes. El sistema no inventa fechas desde ETD.
            </p>
          ) : (
            currentCutoffs.map((cutoff) => {
              const container = containers.find(
                (item) => item.id === cutoff.booking_container_id
              )
              const overdue =
                cutoff.status === 'PENDING' &&
                Boolean(evaluation?.evaluated_at) &&
                new Date(cutoff.due_at).getTime() <=
                  new Date(evaluation?.evaluated_at || cutoff.due_at).getTime()
              return (
                <div
                  key={cutoff.id}
                  className={`rounded-xl border p-4 ${
                    overdue
                      ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/10'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {cutoff.cutoff_label}
                        </p>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClasses(
                            overdue ? 'MISSED' : cutoff.status
                          )}`}
                        >
                          {overdue ? 'VENCIDO' : cutoff.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        {formatDateTime(cutoff.due_at, cutoff.timezone)}
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          overdue ? 'text-red-600' : 'text-slate-500'
                        }`}
                      >
                        {remainingLabel(cutoff.due_at)} ·{' '}
                        {containerLabel(container)} · {cutoff.source}
                      </p>
                      {cutoff.booking_schedule_revision_id && (
                        <p className="mt-1 text-xs text-slate-500">
                          Revisión: {cutoff.booking_schedule_revision_id.slice(0, 8)}
                        </p>
                      )}
                    </div>
                    {canManage &&
                      ['PENDING', 'MISSED'].includes(cutoff.status) && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCutoffAction({ kind: 'complete', cutoff })
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Completar
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() =>
                                setCutoffAction({ kind: 'waive', cutoff })
                              }
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Excepción
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setCutoffAction({ kind: 'cancel', cutoff })
                            }
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {evaluation?.mode === 'SEA_FCL' && (
        <section className={cardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Scale aria-hidden="true" className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  VGM por contenedor
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Completa la masa de cada contenedor y envía todas juntas. La verificación queda registrada con el método de pesaje y tu usuario.
              </p>
            </div>
            {canManage && pendingVgmContainers.length > 0 && (
              <button
                type="button"
                onClick={() => void submitVgmBatch()}
                disabled={saving || readyVgmRows.length === 0}
                className={operationPrimaryButtonClass}
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {saving ? 'Enviando...' : `Enviar VGM${readyVgmRows.length ? ` (${readyVgmRows.length})` : ''}`}
              </button>
            )}
          </div>

          {containers.filter((container) => container.id).length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              Asigna contenedores antes de registrar VGM.
            </p>
          ) : (
            <div className="relative mt-4 overflow-x-auto" role="region" aria-label="VGM por contenedor" tabIndex={0}>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Contenedor</th>
                    <th scope="col" className="pr-3">Estado</th>
                    <th scope="col" className="pr-3">Masa bruta</th>
                    <th scope="col" className="pr-3">Unidad</th>
                    <th scope="col" className="pr-3">Método</th>
                    <th scope="col" className="pr-3">Fecha de pesaje</th>
                    <th scope="col"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {containers
                    .filter((container) => container.id)
                    .map((container) => {
                      const record = activeVgmByContainer[container.id!]
                      const sent = record && ['SUBMITTED', 'ACCEPTED'].includes(record.status)
                      const editable = canManage && !sent && Number(container.quantity) === 1
                      const row = vgmRows[container.id!] || emptyVgmRow()
                      const setRow = (patch: Partial<VgmRow>) =>
                        setVgmRows((current) => ({ ...current, [container.id!]: { ...(current[container.id!] || emptyVgmRow()), ...patch } }))
                      return (
                        <tr key={container.id} className="border-t border-slate-100 align-middle dark:border-slate-800">
                          <th scope="row" className="py-2 pr-3 text-left font-semibold text-slate-900 dark:text-white">
                            {containerLabel(container)}
                            <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{container.container_type}</span>
                          </th>
                          <td className="pr-3">
                            <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ${statusClasses(record?.status || 'BLOCKED')}`}>
                              {record ? vgmStatusLabel[record.status] || record.status : 'Sin VGM'}
                            </span>
                          </td>
                          {editable ? (
                            <>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  inputMode="decimal"
                                  aria-label={`Masa bruta de ${containerLabel(container)}`}
                                  value={row.grossMass}
                                  onChange={(event) => setRow({ grossMass: event.target.value })}
                                  className={`${fieldClass} h-10 w-32 tabular-nums`}
                                />
                              </td>
                              <td className="pr-3">
                                <select aria-label="Unidad" value={row.unit} onChange={(event) => setRow({ unit: event.target.value as 'KG' | 'LB' })} className={`${fieldClass} h-10 w-24`}>
                                  <option value="KG">KG</option>
                                  <option value="LB">LB</option>
                                </select>
                              </td>
                              <td className="pr-3">
                                <select aria-label="Método" value={row.method} onChange={(event) => setRow({ method: event.target.value })} className={`${fieldClass} h-10 w-44`}>
                                  {vgmMethodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              </td>
                              <td className="pr-3">
                                <input
                                  type="datetime-local"
                                  aria-label="Fecha de pesaje"
                                  value={row.weighedAt}
                                  onChange={(event) => setRow({ weighedAt: event.target.value })}
                                  className={`${fieldClass} h-10 w-52`}
                                />
                              </td>
                            </>
                          ) : (
                            <td colSpan={4} className="py-2 pr-3 text-slate-700 dark:text-slate-300">
                              {record ? (
                                <span className="tabular-nums">
                                  <span className="font-semibold">{Number(record.gross_mass).toLocaleString('en-US')} {record.unit}</span>
                                  {' · '}{vgmMethodLabel(record.verification_method)}
                                  {record.submitted_at ? ` · enviada ${formatDateTime(record.submitted_at)}` : ''}
                                </span>
                              ) : Number(container.quantity) !== 1 ? (
                                <span className="text-amber-700 dark:text-amber-300">Divide la fila en contenedores de 1 unidad para registrar VGM.</span>
                              ) : '—'}
                            </td>
                          )}
                          <td className="py-2 text-right">
                            {canManage && record && (
                              <div className="flex flex-wrap justify-end gap-2">
                                {record.status === 'SUBMITTED' && (
                                  <>
                                    <button type="button" onClick={() => void acceptVgm(record)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                                      Aceptada por naviera
                                    </button>
                                    <button type="button" onClick={() => setVgmAction({ kind: 'reject', record })} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30">
                                      Rechazada
                                    </button>
                                  </>
                                )}
                                {sent && (
                                  <button type="button" onClick={() => setVgmAction({ kind: 'supersede', record })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                    Corregir
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Dialog open={cutoffOpen} onOpenChange={setCutoffOpen}>
        <OperationDialogContent size="lg" icon={CalendarClock} tone="sky" eyebrow="Readiness · Cut-offs">
          <DialogHeader>
            <DialogTitle>Agregar o reemplazar cut-off</DialogTitle>
            <DialogDescription>
              El mismo código y alcance crea una nueva versión y conserva la anterior.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Tipo</span>
              <select
                value={cutoffForm.code}
                onChange={(event) => {
                  const option = cutoffOptions.find(
                    ([code]) => code === event.target.value
                  )
                  setCutoffForm((current) => ({
                    ...current,
                    code: event.target.value,
                    label: option?.[1] || current.label,
                  }))
                }}
                className={fieldClass}
              >
                {cutoffOptions.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Etiqueta</span>
              <input
                value={cutoffForm.label}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Fecha y hora</span>
              <input
                type="datetime-local"
                value={cutoffForm.dueAt}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Timezone IANA</span>
              <input
                value={cutoffForm.timezone}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                placeholder="America/Tegucigalpa"
                className={fieldClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Alcance</span>
              <select
                value={cutoffForm.containerId}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    containerId: event.target.value,
                  }))
                }
                className={fieldClass}
              >
                <option value="">Booking completo</option>
                {containers
                  .filter((container) => container.id)
                  .map((container) => (
                    <option key={container.id} value={container.id}>
                      {containerLabel(container)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Referencia de origen</span>
              <input
                value={cutoffForm.sourceReference}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    sourceReference: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">
              <span className={fieldLabelClass}>Motivo del cambio</span>
              <input
                value={cutoffForm.reason}
                onChange={(event) =>
                  setCutoffForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Obligatorio al reemplazar un cut-off vigente"
                className={fieldClass}
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCutoffOpen(false)}
              className={operationSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveCutoff()}
              disabled={saving}
              className={operationPrimaryButtonClass}
            >
              {saving ? 'Guardando...' : 'Guardar cut-off'}
            </button>
          </DialogFooter>
        </OperationDialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cutoffAction || requirementAction || vgmAction)}
        onOpenChange={(open) => {
          if (!open) {
            setCutoffAction(null)
            setRequirementAction(null)
            setVgmAction(null)
            setActionReason('')
            setExceptionExpiry('')
          }
        }}
      >
        <OperationDialogContent icon={ShieldCheck} tone="amber" eyebrow="Readiness">
          <DialogHeader>
            <DialogTitle>Confirmar acción operativa</DialogTitle>
            <DialogDescription>
              La acción conservará before/after en activity log y timeline.
            </DialogDescription>
          </DialogHeader>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <span className={fieldLabelClass}>Motivo o nota</span>
            <textarea
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              className={`${fieldClass} min-h-24`}
            />
          </label>
          {(cutoffAction?.kind === 'waive' ||
            requirementAction?.kind === 'waive') && (
            <label className="flex min-w-0 flex-col gap-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className={fieldLabelClass}>Vence la excepción (opcional)</span>
              <input
                type="datetime-local"
                value={exceptionExpiry}
                onChange={(event) => setExceptionExpiry(event.target.value)}
                className={fieldClass}
              />
            </label>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setCutoffAction(null)
                setRequirementAction(null)
                setVgmAction(null)
              }}
              className={operationSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() =>
                cutoffAction
                  ? void runCutoffAction()
                  : requirementAction
                    ? void runRequirementAction()
                    : void runVgmReasonAction()
              }
              disabled={saving}
              className={operationPrimaryButtonClass}
            >
              {saving ? 'Procesando...' : 'Confirmar'}
            </button>
          </DialogFooter>
        </OperationDialogContent>
      </Dialog>


    </div>
  )
}
