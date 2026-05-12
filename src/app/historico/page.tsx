'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

import { Badge } from '../../components/ui/badge'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'

const statuses = [
  'Ganada',
  'Perdida',
  'Propuesta',
  'Seguimiento',
  'Pendiente de Fijar Precios',
  'Enviada al Cliente',
  'En Negociación',
  'Tarifa Alta',
  'Enviada tarde',
  'No tenemos agente',
]

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'Ganada':
      return 'bg-green-600 text-white'

    case 'Perdida':
      return 'bg-red-600 text-white'

    case 'Propuesta':
      return 'bg-blue-600 text-white'

    case 'Seguimiento':
      return 'bg-orange-500 text-white'

    case 'Pendiente de Fijar Precios':
      return 'bg-gray-700 text-white'

    case 'Enviada al Cliente':
      return 'bg-indigo-600 text-white'

    case 'En Negociación':
      return 'bg-yellow-500 text-black'

    case 'Tarifa Alta':
      return 'bg-rose-500 text-white'

    case 'Enviada tarde':
      return 'bg-purple-600 text-white'

    case 'No tenemos agente':
      return 'bg-zinc-800 text-white'

    default:
      return 'bg-gray-200 text-gray-700'
  }
}

export default function HistoricoPage() {
  const { profile } = useUser()

  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          codigo_cliente,
          nombre
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setQuotations(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchQuotations()
  }, [])

  const updateStatus = async (
    quoteId: string,
    newStatus: string
  ) => {
    const currentQuote = quotations.find(
      (quote) => quote.id === quoteId
    )

    const oldStatus = currentQuote?.status || null

    const { error } = await supabase
      .from('quotations')
      .update({ status: newStatus })
      .eq('id', quoteId)

    if (error) {
      alert(error.message)
      return
    }

    await supabase
      .from('quotation_status_history')
      .insert([
        {
          quotation_id: quoteId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: profile?.id,
        },
      ])

    await fetchQuotations()
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>

      <div className="space-y-6">

        <div>
          <h1 className="text-4xl font-bold">
            Histórico de Cotizaciones
          </h1>

          <p className="text-gray-500 mt-2">
            Consulta, filtra y administra el estado comercial de cada cotización.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">

          {loading ? (

            <p className="p-6">
              Cargando cotizaciones...
            </p>

          ) : (

            <Table>

              <TableHeader>

                <TableRow className="bg-zinc-950 hover:bg-zinc-950">

                  <TableHead className="text-white whitespace-nowrap">
                    No. Cotización
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Cliente
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Origen
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Destino
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Transporte
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Incoterm
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Peso KG
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Estado
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Cambiar Estado
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Detalle
                  </TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {quotations.map((quote) => (

                  <TableRow
                    key={quote.id}
                    className="hover:bg-gray-50"
                  >

                    <TableCell className="font-bold whitespace-nowrap">
                      {quote.quotation_number || 'Sin número'}
                    </TableCell>

                    <TableCell className="min-w-[220px]">
                      {quote.clientes
                        ? `${quote.clientes.codigo_cliente} — ${quote.clientes.nombre}`
                        : 'Sin cliente'}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.origen}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.destino}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.tipo_transporte}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.incoterm}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.peso_kg}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <Badge className={getStatusBadgeClass(quote.status)}>
                        {quote.status || 'Sin estado'}
                      </Badge>
                    </TableCell>

                    <TableCell className="min-w-[230px]">
                      <select
                        value={quote.status || ''}
                        onChange={(e) =>
                          updateStatus(
                            quote.id,
                            e.target.value
                          )
                        }
                        className="w-full border rounded-lg p-2 bg-white"
                      >
                        <option value="">
                          Sin estado
                        </option>

                        {statuses.map((status) => (

                          <option
                            key={status}
                            value={status}
                          >
                            {status}
                          </option>

                        ))}

                      </select>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/quotations/${quote.id}`}
                        className="inline-block bg-zinc-950 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition"
                      >
                        Ver Detalle
                      </Link>
                    </TableCell>

                  </TableRow>

                ))}

              </TableBody>

            </Table>

          )}

        </div>

      </div>

    </AppLayout>
  )
}