'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '../../../lib/supabase/client'
import { cn } from '../../../lib/utils'
import { allowedTransitions } from '@/src/lib/quotation-status'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import {
  fieldClass,
  cardClass,
  compactCardClass,
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
} from '../../../components/ui/table'

const statusFilterOptions = [
  { label: 'Todos', value: 'Todos' },
  ...Object.keys(allowedTransitions).map((status) => ({
    label: status,
    value: status,
  })),
]

function getStatusColor(status: string) {
  switch (status) {
    case 'Borrador':
      return 'bg-slate-200 text-slate-700'

    case 'Pendiente de Fijar Precios':
      return 'bg-gray-700 text-white'

    case 'Pricing Aprobado':
      return 'bg-blue-600 text-white'

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

const getQuoteTypeBadgeClass = (type?: string | null) => {
  const value = (type || '').toLowerCase()

  if (value.includes('fcl')) return 'bg-blue-50 text-blue-700 ring-blue-200'
  if (value.includes('lcl')) return 'bg-violet-50 text-violet-700 ring-violet-200'
  if (value.includes('aéreo') || value.includes('air')) {
    return 'bg-sky-50 text-sky-700 ring-sky-200'
  }
  if (value.includes('terrestre')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (value.includes('courier')) return 'bg-cyan-50 text-cyan-700 ring-cyan-200'

  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

const getQuoteTypeLabel = (
  type?: string | null,
  service?: string | null
) => {
  const value = (type || service || '').toLowerCase()

  if (value === 'miami_lcl') return 'Miami Consolidado'
  if (value === 'miami_air') return 'Aéreo Consolidado'
  if (value === 'other_origin_lcl') return 'LCL'
  if (value === 'fcl') return 'FCL'
  if (value === 'consolidado') return 'Consolidado'

  return type || service || 'N/A'
}

const getStatusBadgeClass = (status?: string | null) => {
  if (status === 'Ganada') return 'bg-emerald-600 text-white'
  if (status === 'Perdida') return 'bg-red-600 text-white'
  if (status === 'Pricing Aprobado') return 'bg-blue-600 text-white'
  if (status === 'Enviada al Cliente') return 'bg-indigo-600 text-white'
  if (status === 'Pendiente de Fijar Precios') return 'bg-slate-700 text-white'
  if (status === 'Borrador') return 'bg-slate-100 text-slate-600'

  return 'bg-slate-100 text-slate-600'
}

export default function HistoricoPage() {
  const router = useRouter()

  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchQuotations = async () => {
    // Temporal: Ventas tambien ve todo.
    // Mas adelante aplicamos filtro por vendedor.
    let query = supabase
      .from('quotations')
      .select(`
        *,
        cliente:clientes(*),
        created_by_profile:profiles!quotations_created_by_fkey(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      toast.error(error.message)
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
      quote.cliente?.nombre?.toLowerCase().includes(search) ||
      quote.origen?.toLowerCase().includes(search) ||
      quote.destino?.toLowerCase().includes(search) ||
      quote.quote_type?.toLowerCase().includes(search) ||
      quote.service_product?.toLowerCase().includes(search) ||
      getQuoteTypeLabel(quote.quote_type, quote.service_product)
        .toLowerCase()
        .includes(search)

    return matchesStatus && matchesDateFrom && matchesDateTo && matchesSearch
  })

  const wonQuotationsCount = filteredQuotations.filter(
    (quote) => quote.status === 'Ganada'
  ).length
  const pendingQuotationsCount = filteredQuotations.filter((quote) =>
    ['Pricing', 'En Negociación', 'Pendiente de Fijar Precios'].includes(
      quote.status
    )
  ).length
  const sentQuotationsCount = filteredQuotations.filter(
    (quote) => quote.status === 'Enviada al Cliente'
  ).length

  return (
    <>

      <div className="space-y-6">

        <div>
          <h1 className="text-4xl font-bold">
            Cotizaciones
          </h1>

          <p className="text-gray-500 mt-2">
            Consulta, filtra y administra el estado comercial de cada cotización.
          </p>
        </div>

        <div className={`${compactCardClass} sticky top-6 z-20 relative`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    statusFilter === option.value
                      ? `${primaryButtonClass} rounded-full px-3 py-1.5 text-xs`
                      : `${secondaryButtonClass} rounded-full px-3 py-1.5 text-xs`
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="min-w-[320px] flex-1">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cotización, cliente, origen, destino..."
                className={`${fieldClass} h-11 w-full md:w-[300px]`}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${fieldClass} h-11 w-full md:w-[170px]`}
              />

              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${fieldClass} h-11 w-full md:w-[170px]`}
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('Todos')
                  setDateFrom('')
                  setDateTo('')
                  setSearchTerm('')
                }}
                className={secondaryButtonClass}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Mostrando {filteredQuotations.length} de {quotations.length} cotizaciones
          </p>
        </div>

        <div className="relative z-0 grid gap-4 md:grid-cols-4">
          <div className={compactCardClass}>
            <p className="text-sm text-slate-500">
              Cotizaciones
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {filteredQuotations.length}
            </p>
          </div>

          <div className={compactCardClass}>
            <p className="text-sm text-slate-500">
              Ganadas
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {wonQuotationsCount}
            </p>
          </div>

          <div className={compactCardClass}>
            <p className="text-sm text-slate-500">
              Pendientes
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {pendingQuotationsCount}
            </p>
          </div>

          <div className={compactCardClass}>
            <p className="text-sm text-slate-500">
              Enviadas al Cliente
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {sentQuotationsCount}
            </p>
          </div>
        </div>

        <div className={`${cardClass} overflow-x-auto p-0`}>

          {loading ? (

            <div className="p-6">
              <TableSkeleton rows={7} cols={7} />
            </div>

          ) : filteredQuotations.length === 0 ? (

            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No se encontraron cotizaciones con los filtros aplicados.
            </div>

          ) : (

            <Table>

              <TableHeader className="sticky top-0 z-10 bg-slate-950 text-white">

                <TableRow className="bg-slate-950 hover:bg-slate-950">

                  <TableHead className="w-[110px] text-white whitespace-nowrap">
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

                  <TableHead className="w-[110px] text-white whitespace-nowrap">
                    Tipo
                  </TableHead>

                  <TableHead className="w-[110px] text-white whitespace-nowrap">
                    Incoterm
                  </TableHead>

                  <TableHead className="w-[140px] px-4 py-3 text-left text-white whitespace-nowrap">
                    Estado
                  </TableHead>

                  <TableHead className="w-[90px] text-white whitespace-nowrap">
                    Detalle
                  </TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {filteredQuotations.map((quote) => (

                  <TableRow
                    key={quote.id}
                    onClick={() => router.push(`/quotations/${quote.id}`)}
                    className="cursor-pointer transition-all duration-150 hover:bg-slate-100/80"
                  >

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {quote.created_at
                        ? new Date(quote.created_at).toLocaleDateString('es-HN')
                        : 'N/A'}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-bold whitespace-nowrap">
                      {quote.quotation_number || 'Sin número'}
                    </TableCell>

                    <TableCell className="px-4 py-3 min-w-[220px]">
                      {quote.cliente?.nombre || 'Sin cliente'}
                    </TableCell>

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {quote.origen}
                    </TableCell>

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {quote.destino}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getQuoteTypeBadgeClass(
                          quote.quote_type || quote.service_product
                        )}`}
                      >
                        {getQuoteTypeLabel(
                          quote.quote_type,
                          quote.service_product
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {quote.incoterm}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClass(
                          quote.status
                        )}`}
                      >
                        {quote.status || 'Solicitud'}
                      </span>
                    </TableCell>

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/quotations/${quote.id}`)
                        }}
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

    </>
  )
}
