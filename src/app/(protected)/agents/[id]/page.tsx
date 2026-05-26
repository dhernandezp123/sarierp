'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '@/src/lib/supabase/client'

type Agent = {
  id: string
  name: string | null
  type: string | null
  country: string | null
  city: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  profit_per_container: number | null
  mbl_fee: number | null
  currency: string | null
  notes: string | null
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAgent = async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error loading agent:', error)
      } else {
        setAgent(data)
      }

      setLoading(false)
    }

    if (id) loadAgent()
  }, [id])

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Cargando agente...</p>
  }

  if (!agent) {
    return <p className="p-6 text-sm text-red-600">Agente no encontrado.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {agent.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Perfil del agente/proveedor.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/agents')}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          Volver
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Información general
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Info label="Tipo" value={agent.type} />
          <Info label="País" value={agent.country} />
          <Info label="Ciudad" value={agent.city} />
          <Info label="Contacto" value={agent.contact_name} />
          <Info label="Email" value={agent.email} />
          <Info label="Teléfono" value={agent.phone} />
          <Info label="Profit / Cont." value={agent.profit_per_container} />
          <Info label="MBL Fee" value={agent.mbl_fee} />
          <Info label="Moneda" value={agent.currency} />
        </div>

        <div className="mt-6">
          <p className="text-xs text-slate-500">Notas</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {agent.notes || 'Sin notas'}
          </p>
        </div>
      </section>
    </div>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: string | number | null
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">
        {value || 'N/A'}
      </p>
    </div>
  )
}
