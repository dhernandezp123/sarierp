'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { createActivityLog } from '@/src/lib/activity-logger'
import { operationStatuses } from '@/src/lib/operation-status'
import { fieldClass } from '@/src/lib/ui'

type BookingRouting = {
  id: string
  routing_number: string
  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null
  etd: string | null
  eta: string | null
  free_days: string | null
  shipment_status: string | null
  reference_number: string | null
  vessel_name: string | null
  voyage: string | null
  tracking_url: string | null
  original_eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  eir_date: string | null
  estimated_transit_days: number | null
  real_transit_days: number | null
  remaining_free_days: number | null
  operational_comments: string | null
}

export default function RoutingBookingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [routing, setRouting] = useState<BookingRouting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadRouting = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        routing_number,
        booking_number,
        carrier_booking,
        master_bl,
        house_bl,
        etd,
        eta,
        free_days,
        shipment_status,
        reference_number,
        vessel_name,
        voyage,
        tracking_url,
        original_eta,
        actual_etd,
        actual_eta,
        eir_date,
        estimated_transit_days,
        real_transit_days,
        remaining_free_days,
        operational_comments
      `)
      .eq('id', id)
      .single()

    if (error) {
      toast.error(error.message)
    } else {
      setRouting(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadRouting()
  }, [id])

  const saveBooking = async () => {
    if (!routing) return

    setSaving(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        booking_number: routing.booking_number,
        carrier_booking: routing.carrier_booking,
        master_bl: routing.master_bl,
        house_bl: routing.house_bl,
        etd: routing.etd,
        eta: routing.eta,
        free_days: routing.free_days,
        shipment_status: routing.shipment_status,
        reference_number: routing.reference_number,
        vessel_name: routing.vessel_name,
        voyage: routing.voyage,
        tracking_url: routing.tracking_url,
        original_eta: routing.original_eta,
        actual_etd: routing.actual_etd,
        actual_eta: routing.actual_eta,
        eir_date: routing.eir_date,
        estimated_transit_days: routing.estimated_transit_days,
        real_transit_days: routing.real_transit_days,
        remaining_free_days: routing.remaining_free_days,
        operational_comments: routing.operational_comments,
      })
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module: 'operations_booking',
      action: 'booking_updated',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Booking actualizado para ${routing.routing_number}`,
    })

    toast.success('Booking actualizado')
  }

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando booking...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Booking no encontrado.</p>
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Booking Operativo {routing.routing_number}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Información operativa interna del embarque.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/operations/routing/${routing.id}`)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Volver al Routing
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Datos de Booking
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Booking Number
            </label>

            <input
              value={routing.booking_number || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  booking_number: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Carrier Booking
            </label>

            <input
              value={routing.carrier_booking || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  carrier_booking: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Master BL
            </label>

            <input
              value={routing.master_bl || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  master_bl: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              House BL
            </label>

            <input
              value={routing.house_bl || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  house_bl: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              ETD (Estimated Time Departure)
            </label>

            <input
              type="date"
              value={routing.etd || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  etd: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              ETA (Estimated Time Arrival)
            </label>

            <input
              type="date"
              value={routing.eta || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  eta: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Free Days
            </label>

            <input
              value={routing.free_days || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  free_days: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Shipment Status
            </label>

            <select
              value={routing.shipment_status || 'Pendiente Validación'}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  shipment_status: e.target.value,
                })
              }
              className={fieldClass}
            >
              {operationStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Reference Number
            </label>

            <input
              value={routing.reference_number || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  reference_number: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Vessel Name
            </label>

            <input
              value={routing.vessel_name || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  vessel_name: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Voyage
            </label>

            <input
              value={routing.voyage || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  voyage: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Tracking URL
            </label>

            <input
              value={routing.tracking_url || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  tracking_url: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Original ETA
            </label>

            <input
              type="date"
              value={routing.original_eta || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  original_eta: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Actual ETD
            </label>

            <input
              type="date"
              value={routing.actual_etd || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  actual_etd: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Actual ETA
            </label>

            <input
              type="date"
              value={routing.actual_eta || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  actual_eta: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              EIR Date
            </label>

            <input
              type="date"
              value={routing.eir_date || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  eir_date: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Estimated Transit Days
            </label>

            <input
              type="number"
              value={routing.estimated_transit_days || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  estimated_transit_days: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Real Transit Days
            </label>

            <input
              type="number"
              value={routing.real_transit_days || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  real_transit_days: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Remaining Free Days
            </label>

            <input
              type="number"
              value={routing.remaining_free_days || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  remaining_free_days: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={fieldClass}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Operational Comments
            </label>

            <textarea
              rows={6}
              value={routing.operational_comments || ''}
              onChange={(e) =>
                setRouting({
                  ...routing,
                  operational_comments: e.target.value,
                })
              }
              className={fieldClass}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={saveBooking}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Booking'}
          </button>
        </div>
      </section>
    </div>
  )
}
