'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/src/lib/supabase/client'

type ShippingInstruction = {
  id: string
  routing_number: string
  status: string
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
  supplier_address: string | null
  origin_address: string | null
  destination_address: string | null
  container_qty: number | null
  container_type: string | null
  agent_name: string | null
  agent_contact: string | null
  agent_email: string | null
  special_instructions: string | null
}

export default function RoutingDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [routing, setRouting] = useState<ShippingInstruction | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRouting = async () => {
    const { data, error } = await supabase
      .from('shipping_instructions')
      .select('*')
      .eq('id', id)
      .single()

    if (!error && data) {
      setRouting(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadRouting()
  }, [id])

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando Routing...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Routing no encontrado.</p>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Routing / Shipping Instructions {routing.routing_number}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Validación operativa previa al embarque.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Proveedor / Origen
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <p><strong>Proveedor:</strong> {routing.supplier_name || 'N/A'}</p>
            <p><strong>Contacto:</strong> {routing.supplier_contact || 'N/A'}</p>
            <p><strong>Email:</strong> {routing.supplier_email || 'N/A'}</p>
            <p><strong>Teléfono:</strong> {routing.supplier_phone || 'N/A'}</p>
            <p><strong>Dirección:</strong> {routing.supplier_address || routing.origin_address || 'N/A'}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Agente / Operación
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <p><strong>Agente:</strong> {routing.agent_name || 'N/A'}</p>
            <p><strong>Contacto:</strong> {routing.agent_contact || 'N/A'}</p>
            <p><strong>Email:</strong> {routing.agent_email || 'N/A'}</p>
            <p><strong>Contenedores:</strong> {routing.container_qty || 'N/A'} {routing.container_type || ''}</p>
            <p><strong>Estado:</strong> {routing.status}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
