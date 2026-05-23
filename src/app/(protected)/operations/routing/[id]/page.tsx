'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { supabase } from '@/src/lib/supabase/client'

type OperationsUser = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
}

type ShippingInstruction = {
  id: string
  routing_number: string
  status: string
  shipment_status: string
  created_by: string | null
  operations_assigned_to: string | null

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

  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null

  etd: string | null
  eta: string | null

  free_days: string | null

  shipper: string | null
  consignee: string | null
  notify_party: string | null

  validated_at: string | null
  validated_by: string | null
}

export default function RoutingDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { profile } = useUser()

  const [routing, setRouting] = useState<ShippingInstruction | null>(null)
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([])
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [loading, setLoading] = useState(true)

  const canAssignRouting = profile?.rol === 'Admin' || profile?.rol === 'Operaciones'

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

  const loadOperationsUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, email')
      .eq('rol', 'Operaciones')
      .eq('is_active', true)

    if (!error && data) {
      setOperationsUsers(data)
    }
  }

  const saveRouting = async () => {
    if (!routing) return

    setSaving(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        supplier_name: routing.supplier_name,
        supplier_contact: routing.supplier_contact,
        supplier_email: routing.supplier_email,
        supplier_phone: routing.supplier_phone,
        supplier_address: routing.supplier_address,

        booking_number: routing.booking_number,
        carrier_booking: routing.carrier_booking,
        master_bl: routing.master_bl,
        house_bl: routing.house_bl,

        etd: routing.etd,
        eta: routing.eta,

        free_days: routing.free_days,

        shipper: routing.shipper,
        consignee: routing.consignee,
        notify_party: routing.notify_party,

        special_instructions: routing.special_instructions,
      })
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      toast.error('No se pudo guardar el routing')
      return
    }

    toast.success('Routing actualizado')
  }

  const validateRouting = async () => {
    if (!routing) return

    setValidating(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast.error('No se pudo validar el usuario')
      setValidating(false)
      return
    }

    const requiredFields = [
      routing.supplier_name,
      routing.supplier_contact,
      routing.supplier_email,
      routing.agent_name,
      routing.agent_email,
      routing.container_qty,
      routing.container_type,
    ]

    const hasMissingFields = requiredFields.some(
      (field) => !field || field === ''
    )

    if (hasMissingFields) {
      toast.error('Completa los datos obligatorios antes de validar.')
      setValidating(false)
      return
    }

    const validatedAt = new Date().toISOString()

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        shipment_status: 'Validada',
        validated_at: validatedAt,
        validated_by: user.id,
      })
      .eq('id', routing.id)

    setValidating(false)

    if (error) {
      toast.error('No se pudo validar el routing')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'routing_validated',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Routing ${routing.routing_number} validado`,
    })

    if (routing.created_by) {
      await createNotification({
        userId: routing.created_by,
        title: 'Routing Validado',
        message: `Operaciones validó el routing ${routing.routing_number}`,
        type: 'success',
      })
    }

    setRouting({
      ...routing,
      shipment_status: 'Validada',
      validated_at: validatedAt,
      validated_by: user.id,
    })

    toast.success('Routing validado correctamente')
  }

  const assignOperationsUser = async (userId: string) => {
    if (!routing) return

    if (!canAssignRouting) {
      toast.error('No tienes permisos para asignar este routing')
      return
    }

    setAssigning(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        operations_assigned_to: userId || null,
      })
      .eq('id', routing.id)

    setAssigning(false)

    if (error) {
      toast.error('No se pudo asignar el operativo')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'routing_assigned',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Routing ${routing.routing_number} asignado a operaciones`,
      metadata: {
        assigned_to: userId,
      },
    })

    if (userId) {
      await createNotification({
        userId,
        title: 'Routing asignado',
        message: `Se te asignó el routing ${routing.routing_number}`,
        type: 'info',
      })
    }

    setRouting({
      ...routing,
      operations_assigned_to: userId || null,
    })

    toast.success('Operativo asignado')
  }

  useEffect(() => {
    loadRouting()
    loadOperationsUsers()
  }, [id])

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando Routing...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Routing no encontrado.</p>
  }

  const inputClassName =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900'

  const updateRouting = (field: keyof ShippingInstruction, value: string) => {
    setRouting({
      ...routing,
      [field]: value,
    })
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
        {canAssignRouting && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Asignación Operativa
            </h2>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Selecciona el operativo responsable de gestionar este routing.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Operativo asignado
              </label>

              <select
                value={routing.operations_assigned_to || ''}
                onChange={(e) => assignOperationsUser(e.target.value)}
                disabled={assigning}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Sin asignar</option>

                {operationsUsers.map((user) => {
                  const name =
                    user.nombre || user.apellido
                      ? `${user.nombre || ''} ${user.apellido || ''}`.trim()
                      : user.email || 'Usuario operativo'

                  return (
                    <option key={user.id} value={user.id}>
                      {name}
                    </option>
                  )
                })}
              </select>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Proveedor / Origen
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Proveedor
              </label>
              <input
                value={routing.supplier_name || ''}
                onChange={(e) => updateRouting('supplier_name', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Contacto
              </label>
              <input
                value={routing.supplier_contact || ''}
                onChange={(e) => updateRouting('supplier_contact', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Email
              </label>
              <input
                value={routing.supplier_email || ''}
                onChange={(e) => updateRouting('supplier_email', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Teléfono
              </label>
              <input
                value={routing.supplier_phone || ''}
                onChange={(e) => updateRouting('supplier_phone', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Dirección
              </label>
              <input
                value={routing.supplier_address || ''}
                onChange={(e) => updateRouting('supplier_address', e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Agente / Operación
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Booking Number
              </label>
              <input
                value={routing.booking_number || ''}
                onChange={(e) => updateRouting('booking_number', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Carrier Booking
              </label>
              <input
                value={routing.carrier_booking || ''}
                onChange={(e) => updateRouting('carrier_booking', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Master BL
              </label>
              <input
                value={routing.master_bl || ''}
                onChange={(e) => updateRouting('master_bl', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                House BL
              </label>
              <input
                value={routing.house_bl || ''}
                onChange={(e) => updateRouting('house_bl', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ETD
              </label>
              <input
                value={routing.etd || ''}
                onChange={(e) => updateRouting('etd', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ETA
              </label>
              <input
                value={routing.eta || ''}
                onChange={(e) => updateRouting('eta', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Free Days
              </label>
              <input
                value={routing.free_days || ''}
                onChange={(e) => updateRouting('free_days', e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Routing
          </h2>

          <div className="mt-4 grid gap-3 text-sm lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Shipper
              </label>
              <input
                value={routing.shipper || ''}
                onChange={(e) => updateRouting('shipper', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Consignee
              </label>
              <input
                value={routing.consignee || ''}
                onChange={(e) => updateRouting('consignee', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Notify Party
              </label>
              <input
                value={routing.notify_party || ''}
                onChange={(e) => updateRouting('notify_party', e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={saveRouting}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {saving ? 'Guardando...' : 'Guardar Routing'}
        </button>

        <button
          onClick={validateRouting}
          disabled={
            validating || routing.shipment_status === 'Validada'
          }
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {routing.shipment_status === 'Validada'
            ? 'Routing Validado'
            : validating
              ? 'Validando...'
              : 'Validar Routing'}
        </button>
      </div>
    </div>
  )
}
