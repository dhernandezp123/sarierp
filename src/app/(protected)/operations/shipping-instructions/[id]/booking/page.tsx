'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { secondaryButtonClass } from '@/src/lib/ui-classes'

type CompatibilityBooking = {
  id: string
  booking_number: string | null
  carrier_booking: string | null
  carrier: string | null
  shipment_status: string | null
  etd: string | null
  eta: string | null
  created_at: string | null
}

export default function LegacyBookingCompatibilityPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const shippingInstructionId = params.id
  const [bookings, setBookings] = useState<CompatibilityBooking[]>([])
  const [routingNumber, setRoutingNumber] = useState<string>('Shipping Instruction')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const resolveLegacyRoute = async () => {
      setLoading(true)

      const [{ data: routing, error: routingError }, { data, error }] =
        await Promise.all([
          supabase
            .from('shipping_instructions')
            .select('id, routing_number')
            .eq('id', shippingInstructionId)
            .single(),
          supabase
            .from('bookings')
            .select(`
              id,
              booking_number,
              carrier_booking,
              carrier,
              shipment_status,
              etd,
              eta,
              created_at
            `)
            .eq('shipping_instruction_id', shippingInstructionId)
            .order('created_at', { ascending: true }),
        ])

      if (!active) return

      if (routingError || !routing) {
        toast.error(routingError?.message || 'Shipping Instruction no encontrada')
        setLoading(false)
        return
      }

      setRoutingNumber(routing.routing_number)

      if (error) {
        toast.error(error.message || 'No se pudieron consultar los bookings')
        setLoading(false)
        return
      }

      const canonicalBookings = (data || []) as CompatibilityBooking[]

      if (canonicalBookings.length === 0) {
        router.replace(`/operations/shipping-instructions/${shippingInstructionId}`)
        return
      }

      if (canonicalBookings.length === 1) {
        router.replace(
          `/operations/shipping-instructions/${shippingInstructionId}/bookings/${canonicalBookings[0].id}`
        )
        return
      }

      setBookings(canonicalBookings)
      setLoading(false)
    }

    void resolveLegacyRoute()

    return () => {
      active = false
    }
  }, [router, shippingInstructionId])

  if (loading) {
    return <PageSkeleton cards={3} />
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Seleccionar booking
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {routingNumber} tiene varios bookings. Selecciona el que deseas abrir.
        </p>
      </div>

      <div className="grid gap-4">
        {bookings.map((booking) => (
          <Link
            key={booking.id}
            href={`/operations/shipping-instructions/${shippingInstructionId}/bookings/${booking.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-[#0b1220] dark:hover:border-blue-700"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {booking.booking_number ||
                    booking.carrier_booking ||
                    `Booking ${booking.id.slice(0, 8)}`}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {[booking.carrier, booking.etd, booking.eta]
                    .filter(Boolean)
                    .join(' · ') || 'Sin datos operativos'}
                </p>
              </div>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {booking.shipment_status || 'Booking Solicitado'}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Link
        href={`/operations/shipping-instructions/${shippingInstructionId}`}
        className={`${secondaryButtonClass} inline-flex px-4 py-2`}
      >
        Volver a la Shipping Instruction
      </Link>
    </div>
  )
}
