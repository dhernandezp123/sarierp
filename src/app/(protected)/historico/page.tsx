'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table'

const statuses = [
  'Borrador',
  'Pendiente de Fijar Precios',
  'Enviada al Cliente',
  'En Negociación',
  'Ganada',
  'Perdida',
  'Tarifa Alta',
  'Enviada tarde',
  'No tenemos agente',
]

function getStatusColor(status: string) {
  switch (status) {
    case 'Borrador':
      return 'bg-slate-200 text-slate-700'

    case 'Pendiente de Fijar Precios':
      return 'bg-gray-700 text-white'

    case 'Ganada':
      return 'bg-green-600 text-white'

    case 'Perdida':
      return 'bg-red-600 text-white'

    case 'Propuesta':
      return 'bg-blue-600 text-white'

    case 'Seguimiento':
      return 'bg-orange-500 text-white'

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

const getQuoteTypeColor = (quoteType?: string) => {
  switch (quoteType) {
    case 'FCL':
      return 'bg-blue-100 text-blue-800'

    case 'LCL':
      return 'bg-cyan-100 text-cyan-800'

    case 'FTL':
      return 'bg-green-100 text-green-800'

    case 'LTL':
      return 'bg-emerald-100 text-emerald-800'

    case 'Courier':
      return 'bg-violet-100 text-violet-800'

    case 'Consolidado':
      return 'bg-purple-100 text-purple-800'

    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export default function HistoricoPage() {
  const { profile } = useUser()

  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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

  const filteredQuotations = quotations.filter((quote) => {
    const search = searchTerm.toLowerCase().trim()

    const matchesStatus =
      statusFilter === 'Todos' || quote.status === statusFilter

    const quoteDate = quote.created_at
      ? quote.created_at.slice(0, 10)
      : ''

    const matchesDateFrom =
      !dateFrom || quoteDate >= dateFrom

    const matchesDateTo =
      !dateTo || quoteDate <= dateTo

    const matchesSearch =
      !search ||
      quote.quotation_number?.toLowerCase().includes(search) ||
      quote.clientes?.nombre?.toLowerCase().includes(search) ||
      quote.origen?.toLowerCase().includes(search) ||
      quote.destino?.toLowerCase().includes(search) ||
      quote.quote_type?.toLowerCase().includes(search)

    return matchesStatus && matchesDateFrom && matchesDateTo && matchesSearch
  })

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
    <>

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
          <div className="flex flex-wrap items-center gap-3 mb-4 p-4">
            <label className="text-sm font-semibold text-gray-600">
              Filtrar por estado:
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-xl px-3 py-2"
            >
              <option value="Todos">Todos</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cotización, cliente, origen, destino..."
              className="border rounded-xl px-3 py-2 min-w-[320px]"
            />

            <label className="text-sm font-semibold text-gray-600 ml-2">
              Desde:
            </label>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />

            <label className="text-sm font-semibold text-gray-600">
              Hasta:
            </label>

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-xl px-3 py-2"
            />

            <button
              type="button"
              onClick={() => {
                setStatusFilter('Todos')
                setDateFrom('')
                setDateTo('')
                setSearchTerm('')
              }}
              className="rounded-xl border px-4 py-2 font-semibold hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          </div>

          <p className="text-sm text-gray-500 px-4 pb-4">
            Mostrando {filteredQuotations.length} de {quotations.length} cotizaciones
          </p>

          {loading ? (

            <p className="p-6">
              Cargando cotizaciones...
            </p>

          ) : filteredQuotations.length === 0 ? (

            <div className="p-8 text-center text-gray-500">
              No se encontraron cotizaciones con los filtros aplicados.
            </div>

          ) : (

            <Table>

              <TableHeader>

                <TableRow className="bg-zinc-950 hover:bg-zinc-950">

                  <TableHead className="text-white whitespace-nowrap">
                    Fecha
                  </TableHead>

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
                    Tipo
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Incoterm
                  </TableHead>

                  <TableHead className="px-4 py-3 text-left text-white whitespace-nowrap">
                    Estado
                  </TableHead>

                  <TableHead className="px-4 py-3 text-left text-white whitespace-nowrap">
                    Cambiar estado
                  </TableHead>

                  <TableHead className="text-white whitespace-nowrap">
                    Detalle
                  </TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {filteredQuotations.map((quote) => (

                  <TableRow
                    key={quote.id}
                    className="hover:bg-gray-50"
                  >

                    <TableCell className="whitespace-nowrap">
                      {quote.created_at
                        ? new Date(quote.created_at).toLocaleDateString('es-HN')
                        : 'N/A'}
                    </TableCell>

                    <TableCell className="font-bold whitespace-nowrap">
                      {quote.quotation_number || 'Sin número'}
                    </TableCell>

                    <TableCell className="min-w-[220px]">
                      {quote.clientes?.nombre || 'Sin cliente'}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.origen}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.destino}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${getQuoteTypeColor(
                          quote.quote_type
                        )}`}
                      >
                        {quote.quote_type || 'N/A'}
                      </span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {quote.incoterm}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(
                          quote.status
                        )}`}
                      >
                        {quote.status || 'Solicitud'}
                      </span>
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <select
                        value={quote.status || ''}
                        onChange={(e) =>
                          updateStatus(
                            quote.id,
                            e.target.value
                          )
                        }
                        className="border rounded-lg px-3 py-2"
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

    </>
  )
}
