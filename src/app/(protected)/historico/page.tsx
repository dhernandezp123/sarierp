'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../lib/supabase/client'
import { cn } from '../../../lib/utils'
import { allowedTransitions } from '@/src/lib/quotation-status'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import {
  fieldClass,
  cardClass,
  compactCardClass,
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
import { Pagination } from '@/src/components/ui/Pagination'

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

// ── Fase 19: columnas # Cont. y Vence ────────────────────────────────────────

function isFclFtl(quote: any): boolean {
  const t = (quote.quote_type || '').toLowerCase()
  const s = (quote.service_product || '').toLowerCase()
  return t.includes('fcl') || t.includes('ftl') || s.includes('fcl') || s.includes('ftl')
}

function getUnitCount(quote: any): string {
  if (isFclFtl(quote)) {
    const total = (quote.quotation_containers || []).reduce(
      (sum: number, c: any) => sum + Number(c.quantity || 0), 0
    )
    return total > 0 ? `${total} cont.` : '—'
  }
  const total = (quote.quotation_cargo_lines || []).reduce(
    (sum: number, c: any) => sum + Number(c.quantity || 0), 0
  )
  return total > 0 ? `${total} bts` : '—'
}

type ExpiryDisplay = { label: string; cls: string }

function getExpiryDisplay(quote: any): ExpiryDisplay | null {
  const selected = (quote.agent_quotes || []).find((aq: any) => aq.is_selected)
  if (!selected?.valid_until) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(selected.valid_until + 'T00:00:00')
  const diffDays = Math.floor((expiry.getTime() - today.getTime()) / 86400000)
  const label = expiry.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (diffDays < 0) return { label, cls: 'bg-red-100 text-red-700 ring-red-200' }
  if (diffDays <= 7) return { label, cls: 'bg-orange-100 text-orange-700 ring-orange-200' }
  return { label, cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  const router = useRouter()

  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const fetchQuotations = async () => {
    // Temporal: Ventas tambien ve todo.
    // Mas adelante aplicamos filtro por vendedor.
    let query = supabase
      .from('quotations')
      .select(`
        *,
        cliente:clientes(*),
        created_by_profile:profiles!quotations_created_by_fkey(*),
        agent_quotes(valid_until, is_selected),
        quotation_containers(quantity),
        quotation_cargo_lines(quantity)
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

  const paginatedQuotations = filteredQuotations.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

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
                  onClick={() => { setStatusFilter(option.value); setPage(1) }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    statusFilter === option.value
                      ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="min-w-[320px] flex-1">
              <input
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
              placeholder="Buscar cotización, cliente, origen, destino..."
                className={`${fieldClass} h-11 w-full md:w-[300px]`}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className={`${fieldClass} h-11 w-full md:w-[170px]`}
              />

              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
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
                  setPage(1)
                }}
                className={secondaryButtonClass}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            {filteredQuotations.length} cotizaciones
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

            <>
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

                  <TableHead className="w-[90px] text-white whitespace-nowrap">
                    # Unid.
                  </TableHead>

                  <TableHead className="w-[120px] text-white whitespace-nowrap">
                    Vence
                  </TableHead>

                  <TableHead className="w-[140px] px-4 py-3 text-left text-white whitespace-nowrap">
                    Estado
                  </TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {paginatedQuotations.map((quote) => (

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

                    <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                      {getUnitCount(quote)}
                    </TableCell>

                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const exp = getExpiryDisplay(quote)
                        if (!exp) return <span className="text-slate-300 text-xs">—</span>
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${exp.cls}`}>
                            {exp.label}
                          </span>
                        )
                      })()}
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

                  </TableRow>

                ))}

              </TableBody>

            </Table>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={filteredQuotations.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
            </>

          )}

        </div>

      </div>

    </>
  )
}
