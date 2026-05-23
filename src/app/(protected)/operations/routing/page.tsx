'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'

import { supabase } from '@/src/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/src/components/ui/table'

type ShippingInstruction = {
  id: string
  routing_number: string | null
  status: string | null
  agent_name: string | null
  origin: string | null
  destination: string | null
  container_qty: number | null
  container_type: string | null
  created_at: string | null
  cliente?: {
    nombre: string | null
  } | null
  quotation?: {
    quotation_number: string | null
  } | null
}

export default function RoutingInboxPage() {
  const router = useRouter()
  const [items, setItems] = useState<ShippingInstruction[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

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
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    setItems((data || []) as ShippingInstruction[])
    setLoading(false)
  }

  useEffect(() => {
    loadRouting()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Routing / Shipping Instructions
        </h1>

        <p className="mt-2 text-gray-500 dark:text-slate-400">
          Bandeja operativa de instrucciones generadas
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        {loading ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            Cargando instrucciones...
          </p>
        ) : errorMessage ? (
          <p className="p-6 text-sm text-red-500">
            {errorMessage}
          </p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No hay Shipping Instructions generadas.
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-black dark:bg-[#081120]">
              <TableRow className="bg-black hover:bg-black dark:bg-[#081120] dark:hover:bg-[#081120]">
                <TableHead className="text-white">Routing</TableHead>
                <TableHead className="text-white">Cotización</TableHead>
                <TableHead className="text-white">Cliente</TableHead>
                <TableHead className="text-white">Ruta</TableHead>
                <TableHead className="text-white">Agente</TableHead>
                <TableHead className="text-white">Contenedor</TableHead>
                <TableHead className="text-white">Estado</TableHead>
                <TableHead className="text-white">Detalle</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {items.map((item) => (
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
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {item.status || 'Pendiente'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <button
                      type="button"
                      onClick={() => router.push(`/operations/routing/${item.id}`)}
                      title="Ver detalle"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-[#0b1220] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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
