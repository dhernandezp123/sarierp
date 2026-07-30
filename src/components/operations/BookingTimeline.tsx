'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, MapPin, MessageSquarePlus } from 'lucide-react'
import { cardClass, fieldClass, secondaryButtonClass } from '@/src/lib/ui-classes'

export type BookingTimelineEvent = {
  id: string
  shipment_id: string
  shipping_instruction_id: string
  booking_id: string | null
  booking_container_id: string | null
  event_code: string
  event_label: string
  occurred_at: string
  location: string | null
  notes: string | null
  metadata: Record<string, unknown>
  source_system: 'manual' | 'transition' | 'legacy' | 'system' | 'readiness'
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

type BookingTimelineProps = {
  events: BookingTimelineEvent[]
  loading?: boolean
  addingNote?: boolean
  onAddNote: (input: {
    eventLabel: string
    occurredAt: string
    location: string
    notes: string
  }) => Promise<boolean>
}

const sourceLabels: Record<BookingTimelineEvent['source_system'], string> = {
  manual: 'Manual',
  transition: 'Transición',
  legacy: 'Migrado desde legacy',
  system: 'Sistema',
  readiness: 'Readiness 5C',
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

function toLocalDateTimeInput(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function formatScheduleDate(value: unknown) {
  if (typeof value !== 'string' || !value) return 'sin fecha'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function scheduleChangeSummary(metadata: Record<string, unknown>) {
  const previous = metadata.previous_schedule
  const next = metadata.new_schedule
  if (
    !previous ||
    !next ||
    typeof previous !== 'object' ||
    typeof next !== 'object'
  ) {
    return []
  }

  const before = previous as Record<string, unknown>
  const after = next as Record<string, unknown>
  const changes: string[] = []
  if (before.etd !== after.etd) {
    changes.push(
      `ETD cambió de ${formatScheduleDate(before.etd)} a ${formatScheduleDate(after.etd)}`
    )
  }
  if (before.eta !== after.eta) {
    changes.push(
      `ETA cambió de ${formatScheduleDate(before.eta)} a ${formatScheduleDate(after.eta)}`
    )
  }
  if (before.vessel_name !== after.vessel_name) {
    changes.push(
      `Vessel cambió de ${String(before.vessel_name || 'sin nave')} a ${String(after.vessel_name || 'sin nave')}`
    )
  }
  if (before.voyage !== after.voyage) {
    changes.push(
      `Voyage cambió de ${String(before.voyage || 'sin viaje')} a ${String(after.voyage || 'sin viaje')}`
    )
  }
  if (before.carrier !== after.carrier) {
    changes.push(
      `Carrier cambió de ${String(before.carrier || 'sin carrier')} a ${String(after.carrier || 'sin carrier')}`
    )
  }
  return changes
}

function readinessEventSummary(
  eventCode: string,
  metadata: Record<string, unknown>
) {
  const lines: string[] = []

  if (eventCode.startsWith('CUTOFF_')) {
    const dueAt = metadata.due_at
    if (typeof dueAt === 'string') {
      lines.push(
        `Fecha límite: ${formatDateTime(dueAt)}${
          typeof metadata.timezone === 'string'
            ? ` · ${metadata.timezone}`
            : ''
        }`
      )
    }
    if (typeof metadata.reason === 'string') {
      lines.push(`Motivo: ${metadata.reason}`)
    }
  }

  if (eventCode.startsWith('VGM_')) {
    if (
      typeof metadata.gross_mass === 'number' ||
      typeof metadata.gross_mass === 'string'
    ) {
      lines.push(
        `Masa: ${String(metadata.gross_mass)} ${String(metadata.unit || '')}`.trim()
      )
    }
    if (typeof metadata.status === 'string') {
      lines.push(`Estado VGM: ${metadata.status}`)
    }
    if (typeof metadata.reference_or_reason === 'string') {
      lines.push(`Referencia / motivo: ${metadata.reference_or_reason}`)
    }
  }

  if (eventCode === 'READINESS_BLOCKED') {
    const requirements = Array.isArray(metadata.missing_requirements)
      ? metadata.missing_requirements
      : []
    const labels = requirements
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === 'object'
      )
      .filter((value) => value.blocking === true)
      .map((value) => String(value.label || value.code || 'Requisito pendiente'))
    if (labels.length > 0) {
      lines.push(`Bloqueos: ${labels.join(', ')}`)
    }
  }

  if (eventCode.includes('EXCEPTION')) {
    if (typeof metadata.requirement_code === 'string') {
      lines.push(`Requisito: ${metadata.requirement_code}`)
    }
    if (typeof metadata.reason === 'string') {
      lines.push(`Motivo: ${metadata.reason}`)
    }
    if (typeof metadata.expires_at === 'string') {
      lines.push(`Vence: ${formatDateTime(metadata.expires_at)}`)
    }
  }

  return lines
}

export function BookingTimeline({
  events,
  loading = false,
  addingNote = false,
  onAddNote,
}: BookingTimelineProps) {
  const [descending, setDescending] = useState(true)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [eventLabel, setEventLabel] = useState('Nota operativa')
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInput())
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const difference =
          new Date(right.occurred_at).getTime() -
          new Date(left.occurred_at).getTime()
        return descending ? difference : -difference
      }),
    [descending, events]
  )

  const submitNote = async () => {
    const created = await onAddNote({
      eventLabel,
      occurredAt,
      location,
      notes,
    })

    if (!created) return

    setEventLabel('Nota operativa')
    setOccurredAt(toLocalDateTimeInput())
    setLocation('')
    setNotes('')
    setShowNoteForm(false)
  }

  return (
    <section className={cardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Timeline operativo
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Historial canónico del booking y eventos generales de su SI.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDescending((current) => !current)}
            className={secondaryButtonClass}
          >
            {descending ? (
              <ArrowDown className="mr-2 inline h-4 w-4" />
            ) : (
              <ArrowUp className="mr-2 inline h-4 w-4" />
            )}
            {descending ? 'Más recientes' : 'Cronológico'}
          </button>
          <button
            type="button"
            onClick={() => setShowNoteForm((current) => !current)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <MessageSquarePlus className="mr-2 inline h-4 w-4" />
            Nueva nota
          </button>
        </div>
      </div>

      {showNoteForm && (
        <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Etiqueta
            <input
              value={eventLabel}
              onChange={(event) => setEventLabel(event.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Fecha y hora de ocurrencia
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Ubicación
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 md:col-span-2">
            Notas
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className={`${fieldClass} mt-1 min-h-24`}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => setShowNoteForm(false)}
              disabled={addingNote}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitNote}
              disabled={addingNote}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addingNote ? 'Registrando...' : 'Registrar nota'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cargando timeline...
          </p>
        ) : sortedEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Aún no hay eventos operativos.
          </p>
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-6 dark:border-slate-700">
            {sortedEvents.map((event) => {
              const unresolved =
                event.metadata?.migration_resolution ===
                'unresolved_multi_booking'
              const scheduleChanges = scheduleChangeSummary(event.metadata)
              const readinessChanges = readinessEventSummary(
                event.event_code,
                event.metadata
              )

              return (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[1.75rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600 dark:border-slate-900" />
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {event.event_label}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Ocurrió {formatDateTime(event.occurred_at)}
                          {' · '}
                          Registrado {formatDateTime(event.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {sourceLabels[event.source_system]}
                        </span>
                        {event.booking_container_id && (
                          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            Contenedor
                          </span>
                        )}
                        {!event.booking_id && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Evento general de SI
                          </span>
                        )}
                        {unresolved && (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Booking no resuelto
                          </span>
                        )}
                      </div>
                    </div>

                    {event.location && (
                      <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </p>
                    )}
                    {event.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                        {event.notes}
                      </p>
                    )}
                    {scheduleChanges.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                        {scheduleChanges.map((change) => (
                          <li key={change}>• {change}</li>
                        ))}
                      </ul>
                    )}
                    {readinessChanges.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                        {readinessChanges.map((change) => (
                          <li key={change}>• {change}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Registrado por {event.created_by_name || 'Sistema / usuario no disponible'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
