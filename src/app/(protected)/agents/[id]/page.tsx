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
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Agent | null>(null)

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
        setFormData(data)
      }

      setLoading(false)
    }

    if (id) loadAgent()
  }, [id])

  const saveAgent = async () => {
    if (!formData) return

    setSaving(true)

    const { error } = await supabase
      .from('agents')
      .update({
        name: formData.name,
        type: formData.type,
        country: formData.country,
        city: formData.city,
        contact_name: formData.contact_name,
        email: formData.email,
        phone: formData.phone,
        profit_per_container: formData.profit_per_container,
        mbl_fee: formData.mbl_fee,
        currency: formData.currency,
        notes: formData.notes,
      })
      .eq('id', formData.id)

    setSaving(false)

    if (error) {
      alert('No se pudo guardar el agente')
      console.error(error)
      return
    }

    setAgent(formData)
    setEditing(false)
  }

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

        <div className="flex gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Editar
            </button>
          ) : (
            <button
              type="button"
              onClick={saveAgent}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push('/agents')}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Volver
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Información general
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <EditableInfo
            label="Tipo"
            value={formData?.type || agent.type}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) => (prev ? { ...prev, type: value } : prev))
            }
          />
          <EditableInfo
            label="País"
            value={formData?.country || agent.country}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) => (prev ? { ...prev, country: value } : prev))
            }
          />
          <EditableInfo
            label="Ciudad"
            value={formData?.city || agent.city}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) => (prev ? { ...prev, city: value } : prev))
            }
          />
          <EditableInfo
            label="Contacto"
            value={formData?.contact_name || agent.contact_name}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) =>
                prev ? { ...prev, contact_name: value } : prev
              )
            }
          />
          <EditableInfo
            label="Email"
            value={formData?.email || agent.email}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) => (prev ? { ...prev, email: value } : prev))
            }
          />
          <EditableInfo
            label="Teléfono"
            value={formData?.phone || agent.phone}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) => (prev ? { ...prev, phone: value } : prev))
            }
          />
          <EditableInfo
            label="Profit / Cont."
            value={formData?.profit_per_container ?? agent.profit_per_container}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) =>
                prev
                  ? { ...prev, profit_per_container: Number(value || 0) }
                  : prev
              )
            }
          />
          <EditableInfo
            label="MBL Fee"
            value={formData?.mbl_fee ?? agent.mbl_fee}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) =>
                prev ? { ...prev, mbl_fee: Number(value || 0) } : prev
              )
            }
          />
          <EditableInfo
            label="Moneda"
            value={formData?.currency || agent.currency}
            editing={editing}
            onChange={(value) =>
              setFormData((prev) =>
                prev ? { ...prev, currency: value } : prev
              )
            }
          />
        </div>

        <div className="mt-6">
          <p className="text-xs text-slate-500">Notas</p>
          {editing ? (
            <textarea
              value={formData?.notes || ''}
              onChange={(e) =>
                setFormData((prev) =>
                  prev ? { ...prev, notes: e.target.value } : prev
                )
              }
              className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-900">
              {agent.notes || 'Sin notas'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function EditableInfo({
  label,
  value,
  editing,
  onChange,
}: {
  label: string
  value: string | number | null
  editing: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>

      {editing ? (
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : (
        <p className="mt-1 font-semibold text-slate-900">
          {value || 'N/A'}
        </p>
      )}
    </div>
  )
}
