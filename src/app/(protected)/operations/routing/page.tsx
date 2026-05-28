'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'

import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  fieldClass,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/src/components/ui/table'

const shippingInstructionStatuses = [
  'Pendiente de Validación',
  'Asignado',
  'Listo para Booking',
  'En Booking',
] as const

type RoutingItem = {
  id: string
  routing_number: string
  shipment_status: string
  agent_name: string | null
  created_at: string
  operations_assigned_to: string | null

  status: string | null
  origin: string | null
  destination: string | null
  container_qty: number | null
  container_type: string | null

  cliente?: {
    nombre: string | null
  } | null

  quotation?: {
    quotation_number: string | null
  } | null

  assigned_user?: {
    nombre: string | null
    apellido: string | null
  } | null
}

function getShippingInstructionStatus(status?: string | null) {
  if (status === 'Pendiente Validación') return 'Pendiente de Validación'
  if (status === 'Validada') return 'Listo para Booking'

  return status || 'Pendiente de Validación'
}

export default function RoutingInboxPage() {
  const router = useRouter()
  const { profile } = useUser()

  const [routingList, setRoutingList] = useState<RoutingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [assignmentFilter, setAssignmentFilter] = useState('Todos')

  const loadRouting = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        *,
        cliente:clientes (
          nombre
        ),
        quotation:quotations (
          quotation_number
        ),
        assigned_user:profiles!shipping_instructions_operations_assigned_to_fkey (
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    setRoutingList((data || []) as RoutingItem[])
    setLoading(false)
  }

  useEffect(() => {
    loadRouting()
  }, [])

  const filteredRouting = routingList.filter((item) => {
    const query = search.toLowerCase()

    const matchesSearch =
      item.routing_number?.toLowerCase().includes(query) ||
      item.agent_name?.toLowerCase().includes(query) ||
      item.cliente?.nombre?.toLowerCase().includes(query)

    const siStatus = getShippingInstructionStatus(item.shipment_status)

    const matchesStatus =
      statusFilter === 'Todos' ||
      siStatus === statusFilter

    const matchesAssignment =
      assignmentFilter === 'Todos' ||

      (assignmentFilter === 'Sin asignar' &&
        !item.operations_assigned_to) ||

      (assignmentFilter === 'Mis asignados' &&
        item.operations_assigned_to === profile?.id) ||

      (assignmentFilter === 'Pendientes' &&
        siStatus === 'Pendiente de Validación') ||


      (assignmentFilter === 'Listos para Booking' &&
        siStatus === 'Listo para Booking')

    return matchesSearch && matchesStatus && matchesAssignment
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Shipping Instructions
        </h1>

        <p className="mt-2 text-gray-500 dark:text-slate-400">
          Gestiona las instrucciones operativas enviadas por ventas antes de crear el booking.
        </p>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar RT, cliente o agente..."
          className={fieldClass}
        />

        <select
          value={assignmentFilter}
          onChange={(e) => setAssignmentFilter(e.target.value)}
          className={fieldClass}
        >
          <option value="Todos">Todos</option>
          <option value="Sin asignar">Sin asignar</option>
          <option value="Mis asignados">Mis asignados</option>
          <option value="Pendientes">Pendientes</option>
          <option value="Listos para Booking">Listos para Booking</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={fieldClass}
        >
          <option value="Todos">Todos los estados</option>

          {shippingInstructionStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className={`${cardClass} overflow-x-auto p-0`}>
        {loading ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            Cargando instrucciones...
          </p>
        ) : errorMessage ? (
          <p className="p-6 text-sm text-red-500">
            {errorMessage}
          </p>
        ) : filteredRouting.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No hay Shipping Instructions generadas.
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-black dark:bg-[#081120]">
              <TableRow className="bg-black hover:bg-black dark:bg-[#081120] dark:hover:bg-[#081120]">
                <TableHead className="text-white">SI</TableHead>
                <TableHead className="text-white">Cotización</TableHead>
                <TableHead className="text-white">Cliente</TableHead>
                <TableHead className="text-white">Ruta</TableHead>
                <TableHead className="text-white">Agente</TableHead>
                <TableHead className="text-white">Contenedor</TableHead>
                <TableHead className="text-white">Asignado a</TableHead>
                <TableHead className="text-white">Estado operativo</TableHead>
                <TableHead className="text-white">Estado</TableHead>
                <TableHead className="text-white">Detalle</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredRouting.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold">
                    {item.routing_number || item.id}
                  </TableCell>

                  <TableCell>
                    {item.quotation?.quotation_number || 'N/A'}
                  </TableCell>

                  <TableCell>
                    {item.cliente?.nombre || 'N/A'}
                  </TableCell>

                  <TableCell>
                    {item.origin || 'N/A'} - {item.destination || 'N/A'}
                  </TableCell>

                  <TableCell>
                    {item.agent_name || 'N/A'}
                  </TableCell>

                  <TableCell>
                    {item.container_qty || 'N/A'} {item.container_type || ''}
                  </TableCell>

                  <TableCell>
                    {item.assigned_user
                      ? `${item.assigned_user.nombre || ''} ${item.assigned_user.apellido || ''}`.trim()
                      : 'Sin asignar'}
                  </TableCell>

                  <TableCell>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {getShippingInstructionStatus(item.shipment_status)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {item.status || 'Pendiente'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <button
                      type="button"
                      onClick={() => router.push(`/operations/routing/${item.id}`)}
                      title="Abrir SI"
                      className={`${secondaryButtonClass} inline-flex h-9 w-9 items-center justify-center p-0`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
