'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { supabase } from '@/src/lib/supabase/client'
import { primaryButtonClass } from '@/src/lib/ui-classes'
import { CarrierBadge } from '@/src/components/ui/CarrierBadge'

type OperationsUser = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
}

const SI_READY_FOR_BOOKING = 'Listo para Booking'
const SI_PENDING_VALIDATION = 'Pendiente Validación'
const SI_VALIDATED = 'Validada'

type ShippingInstruction = {
  id: string
  routing_number: string
  status: string
  shipment_status: string
  operational_status: string | null
  created_by: string | null
  operations_assigned_to: string | null
  cliente?: any
  quotation?: any

  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
  supplier_address: string | null

  origin_address: string | null
  destination_address: string | null

  container_qty: number | null
  container_type: string | null

  carrier: string | null
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

  freight_terms: string | null
  release_type: string | null
  hbl_freight_visibility: string | null
  printed_at_destination: boolean | null

  shipper: string | null
  consignee: string | null
  consignee_tax_id: string | null
  consignee_address: string | null
  consignee_contact: string | null
  consignee_email: string | null
  consignee_phone: string | null
  notify_party: string | null
  notify_party_tax_id: string | null
  notify_party_address: string | null
  notify_party_contact: string | null
  notify_party_email: string | null
  notify_party_phone: string | null

  sales_observations: string | null
  sales_submitted_at: string | null

  validated_at: string | null
  validated_by: string | null
}

type SalesInitialInfoField =
  | 'supplier_name'
  | 'supplier_contact'
  | 'supplier_email'
  | 'supplier_phone'
  | 'supplier_address'
  | 'sales_observations'

const salesInitialInfoFields: SalesInitialInfoField[] = [
  'supplier_name',
  'supplier_contact',
  'supplier_email',
  'supplier_phone',
  'supplier_address',
  'sales_observations',
]

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {value || 'N/A'}
      </p>
    </div>
  )
}

function InfoContent({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {children}
      </div>
    </div>
  )
}

function formatDisplayDate(date?: string | null) {
  if (!date) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatContainerSummary(routing: ShippingInstruction) {
  const containerType = routing.container_type?.trim()
  const containerQty = routing.container_qty

  if (containerType && /^\d+\s*x\s+/i.test(containerType)) {
    return containerType
  }

  if (containerQty && containerType) {
    return `${containerQty} x ${containerType}`
  }

  if (containerType) {
    return containerType
  }

  return 'N/A'
}

export default function RoutingDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const { user, profile, loading: userLoading } = useUser()

  const [routing, setRouting] = useState<ShippingInstruction | null>(null)
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([])
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [loading, setLoading] = useState(true)

  const canManageRouting = profile?.rol === 'Admin' || profile?.rol === 'Operaciones'
  const canViewRouting =
    !!routing && (canManageRouting || routing.created_by === user?.id)
  const canSalesEditInitialInfo =
    profile?.rol === 'Ventas' &&
    routing?.created_by === user?.id &&
    !routing?.sales_submitted_at &&
    routing?.operational_status === SI_PENDING_VALIDATION
  const canEditInitialInfo = canManageRouting || canSalesEditInitialInfo

  const loadRouting = async () => {
    // TODO: Reforzar esta misma regla en Supabase RLS para shipping_instructions.
    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        *,
        cliente:clientes (*),
        quotation:quotations (*)
      `)
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
    if (!canManageRouting) {
      toast.error('No tienes permisos para editar esta Shipping Instruction')
      return
    }

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

        freight_terms: routing.freight_terms,
        release_type: routing.release_type,
        hbl_freight_visibility: routing.hbl_freight_visibility,
        printed_at_destination: routing.printed_at_destination,

        shipper: routing.shipper,
        consignee: routing.consignee,
        consignee_tax_id: routing.consignee_tax_id,
        consignee_address: routing.consignee_address,
        consignee_contact: routing.consignee_contact,
        consignee_email: routing.consignee_email,
        consignee_phone: routing.consignee_phone,

        notify_party: routing.notify_party,
        notify_party_tax_id: routing.notify_party_tax_id,
        notify_party_address: routing.notify_party_address,
        notify_party_contact: routing.notify_party_contact,
        notify_party_email: routing.notify_party_email,
        notify_party_phone: routing.notify_party_phone,

        sales_observations: routing.sales_observations,

        special_instructions: routing.special_instructions,
      })
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      console.error('Error saving routing:', error)
      toast.error(error.message || 'No se pudieron guardar las Shipping Instructions')
      return
    }

    toast.success('Shipping Instructions actualizadas')
  }

  const saveSalesInitialInfo = async (submitToOperations = false) => {
    if (!routing) return
    if (!canSalesEditInitialInfo) {
      toast.error('No tienes permisos para editar esta información')
      return
    }

    setSaving(true)

    const updateData: Record<string, any> = {
      supplier_name: routing.supplier_name,
      supplier_contact: routing.supplier_contact,
      supplier_email: routing.supplier_email,
      supplier_phone: routing.supplier_phone,
      supplier_address: routing.supplier_address,
      sales_observations: routing.sales_observations,
    }

    if (submitToOperations) {
      updateData.sales_submitted_at = new Date().toISOString()
      updateData.operational_status = SI_PENDING_VALIDATION
    }

    const { data, error } = await supabase
      .from('shipping_instructions')
      .update(updateData)
      .eq('id', routing.id)
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      toast.error(error.message || 'No se pudo guardar la información inicial')
      return
    }

    setRouting(data)
    toast.success(
      submitToOperations
        ? 'Información enviada a Operaciones'
        : 'Información inicial guardada'
    )
  }

  const validateRouting = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para validar esta Shipping Instruction')
      return
    }

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
      routing.supplier_address,
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
        shipment_status: SI_VALIDATED,
        operational_status: SI_READY_FOR_BOOKING,
        validated_at: validatedAt,
        validated_by: user.id,
      })
      .eq('id', routing.id)

    setValidating(false)

    if (error) {
      toast.error('No se pudo validar la Shipping Instruction')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_validated',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instructions ${routing.routing_number} validadas`,
    })

    if (routing.created_by) {
      await createNotification({
        userId: routing.created_by,
        title: 'Shipping Instructions validadas',
        message: `Operaciones validó la Shipping Instruction ${routing.routing_number}`,
        type: 'success',
      })
    }

    setRouting({
      ...routing,
      shipment_status: SI_VALIDATED,
      operational_status: SI_READY_FOR_BOOKING,
      validated_at: validatedAt,
      validated_by: user.id,
    })

    toast.success('Shipping Instructions listas para booking')
  }

  const assignOperationsUser = async (userId: string) => {
    if (!routing) return

    if (!canManageRouting) {
      toast.error('No tienes permisos para asignar esta Shipping Instruction')
      return
    }

    setAssigning(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        operations_assigned_to: userId || null,
        operational_status: userId ? 'Asignado' : SI_PENDING_VALIDATION,
      })
      .eq('id', routing.id)

    setAssigning(false)

    if (error) {
      toast.error('No se pudo asignar el operativo')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_assigned',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instructions ${routing.routing_number} asignadas a operaciones`,
      metadata: {
        assigned_to: userId,
      },
    })

    if (userId) {
      await createNotification({
        userId,
        title: 'Shipping Instructions asignadas',
        message: `Se te asignó la Shipping Instruction ${routing.routing_number}`,
        type: 'info',
      })
    }

    setRouting({
      ...routing,
      operations_assigned_to: userId || null,
      operational_status: userId ? 'Asignado' : SI_PENDING_VALIDATION,
    })

    toast.success('Operativo asignado')
  }

  const handleOpenBooking = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para crear o abrir booking desde esta Shipping Instruction')
      return
    }

    const hasBooking =
      !!routing.booking_number ||
      routing.operational_status === 'En Booking'

    if (!hasBooking) {
      const { error } = await supabase
        .from('shipping_instructions')
        .update({
          operational_status: 'En Booking',
          shipment_status: 'Booking Solicitado',
        })
        .eq('id', routing.id)

      if (error) {
        toast.error('No se pudo crear el booking')
        return
      }
    }

    router.push(`/operations/routing/${routing.id}/booking`)
  }

  useEffect(() => {
    loadRouting()
  }, [id])

  useEffect(() => {
    if (canManageRouting) {
      loadOperationsUsers()
    }
  }, [canManageRouting])

  if (loading || userLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando Shipping Instructions...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Shipping Instructions no encontradas.</p>
  }

  if (!canViewRouting) {
    return <p className="text-sm text-red-500">No tienes permisos para ver esta Shipping Instruction.</p>
  }

  const inputClassName =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900'

  const updateRouting = (field: keyof ShippingInstruction, value: string) => {
    const isSalesInitialInfoField = salesInitialInfoFields.includes(
      field as SalesInitialInfoField
    )

    if (!canManageRouting && !(canSalesEditInitialInfo && isSalesInitialInfoField)) {
      return
    }

    setRouting({
      ...routing,
      [field]: value,
    })
  }

  const canCreateBooking =
    canManageRouting && routing.operational_status === SI_READY_FOR_BOOKING

  const hasBooking =
    !!routing.booking_number ||
    routing.operational_status === 'En Booking'

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Shipping Instructions {routing.routing_number}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Validación operativa previa al booking.
          </p>
        </div>

        {canManageRouting && (
          <select
            value={routing.operations_assigned_to || ''}
            onChange={(e) => assignOperationsUser(e.target.value)}
            disabled={assigning}
            className="min-w-[260px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Sin asignar</option>
            {operationsUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {`${user.nombre || ''} ${user.apellido || ''}`.trim() || user.email}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Datos de Cotización
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Info label="No. Cotización" value={routing.quotation?.quotation_number} />
          <Info label="Cliente" value={routing.cliente?.nombre} />
          <Info label="Incoterm" value={routing.quotation?.incoterm} />
          <Info label="Negociación" value={routing.freight_terms} />
          <InfoContent label="Carrier / Naviera">
            {routing.carrier ? (
              <CarrierBadge code={routing.carrier} showName size="sm" />
            ) : (
              'N/A'
            )}
          </InfoContent>
          <Info label="Agente" value={routing.agent_name} />
          <Info label="Puerto Origen" value={routing.quotation?.puerto_origen} />
          <Info label="Puerto Destino" value={routing.quotation?.puerto_destino} />
          <Info
            label="Contenedores"
            value={formatContainerSummary(routing)}
          />
          <Info label="Días libres" value={routing.free_days} />
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Estado operativo" value={routing.operational_status || 'N/A'} />
          <Info label="Estado embarque" value={routing.shipment_status || 'N/A'} />
          <Info
            label="Envío a Operaciones"
            value={
              routing.sales_submitted_at
                ? `Enviada a Operaciones el ${formatDisplayDate(routing.sales_submitted_at)}`
                : profile?.rol === 'Ventas'
                  ? 'Completa la información inicial del proveedor y envíala a Operaciones.'
                  : 'Pendiente'
            }
          />
        </div>
      </section>

      {!canManageRouting && canSalesEditInitialInfo && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          Completa la información inicial del proveedor y envíala a Operaciones.
        </div>
      )}

      {!canManageRouting && routing.sales_submitted_at && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Información enviada a Operaciones. Ventas ya no puede modificar esta Shipping Instruction.
        </div>
      )}

      {!canManageRouting && !canSalesEditInitialInfo && !routing.sales_submitted_at && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Modo lectura: Ventas puede consultar la Shipping Instruction creada, pero las acciones operativas son de Operaciones/Admin.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Proveedor / Shipper Contact
          </h2>

          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Proveedor
              </label>
              <input
                value={routing.supplier_name || ''}
                onChange={(e) => updateRouting('supplier_name', e.target.value)}
                disabled={!canEditInitialInfo}
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
                disabled={!canEditInitialInfo}
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
                disabled={!canEditInitialInfo}
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
                disabled={!canEditInitialInfo}
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
                disabled={!canEditInitialInfo}
                className={inputClassName}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Comentarios / Remarks
          </h2>

          <textarea
            value={routing.sales_observations || ''}
            onChange={(e) => updateRouting('sales_observations', e.target.value)}
            disabled={!canEditInitialInfo}
            rows={10}
            placeholder="Notas comerciales, instrucciones del cliente, información adicional del proveedor..."
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </section>

        <section className="hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Instrucciones BL
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Freight Terms
              </label>

              <select
                value={routing.freight_terms || ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    freight_terms: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Seleccionar</option>
                <option value="Collect">Collect</option>
                <option value="Prepaid">Prepaid</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Release Type
              </label>

              <select
                value={routing.release_type || ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    release_type: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Seleccionar</option>
                <option value="Express Release">Express Release</option>
                <option value="Original BL">Original BL</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                HBL Freight Visibility
              </label>

              <select
                value={routing.hbl_freight_visibility || ''}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    hbl_freight_visibility: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Seleccionar</option>
                <option value="No Freight Charges">
                  No mostrar flete
                </option>
                <option value="Show Freight Charges">
                  Mostrar flete
                </option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                checked={routing.printed_at_destination || false}
                onChange={(e) =>
                  setRouting({
                    ...routing,
                    printed_at_destination: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-slate-300"
              />

              <label className="text-sm text-slate-700 dark:text-slate-300">
                Printed at destination
              </label>
            </div>
          </div>
        </section>

        <section className="hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Shipping Instructions
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

            <input
              value={routing.consignee_tax_id || ''}
              onChange={(e) => setRouting({ ...routing, consignee_tax_id: e.target.value })}
              placeholder="RTN / Tax ID Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_address || ''}
              onChange={(e) => setRouting({ ...routing, consignee_address: e.target.value })}
              placeholder="Dirección Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_contact || ''}
              onChange={(e) => setRouting({ ...routing, consignee_contact: e.target.value })}
              placeholder="Contacto Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_email || ''}
              onChange={(e) => setRouting({ ...routing, consignee_email: e.target.value })}
              placeholder="Email Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_phone || ''}
              onChange={(e) => setRouting({ ...routing, consignee_phone: e.target.value })}
              placeholder="Teléfono Consignee"
              className={inputClassName}
            />

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

            <input
              value={routing.notify_party_tax_id || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_tax_id: e.target.value })}
              placeholder="RTN / Tax ID Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_address || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_address: e.target.value })}
              placeholder="Dirección Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_contact || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_contact: e.target.value })}
              placeholder="Contacto Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_email || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_email: e.target.value })}
              placeholder="Email Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_phone || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_phone: e.target.value })}
              placeholder="Teléfono Notify Party"
              className={inputClassName}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {canSalesEditInitialInfo && (
          <button
            type="button"
            onClick={() => saveSalesInitialInfo(true)}
            disabled={saving}
            className={primaryButtonClass}
          >
            {saving ? 'Enviando...' : 'Enviar a Operaciones'}
          </button>
        )}

        {canManageRouting && (canCreateBooking || hasBooking) ? (
          <button
            type="button"
            onClick={handleOpenBooking}
            className={primaryButtonClass}
          >
            {hasBooking ? 'Abrir Booking' : 'Crear Booking'}
          </button>
        ) : null}

        {canManageRouting && (
          <>
            <button
              onClick={saveRouting}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {saving ? 'Guardando...' : 'Guardar Shipping Instructions'}
            </button>

            <button
              onClick={validateRouting}
              disabled={
                validating ||
                routing.operational_status === SI_READY_FOR_BOOKING ||
                routing.shipment_status === SI_VALIDATED
              }
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {routing.operational_status === SI_READY_FOR_BOOKING ||
              routing.shipment_status === SI_VALIDATED
                ? 'Listo para Booking'
                : validating
                  ? 'Validando...'
                  : 'Validar Shipping Instructions'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
