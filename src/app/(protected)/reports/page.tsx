'use client'

import { useEffect, useMemo, useState } from 'react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import {
  BarChart3,
  CalendarDays,
  Download,
  FileDown,
  Filter,
  RefreshCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { ReportPdf, type ReportPdfColumn, type ReportPdfData, type ReportPdfRow } from '@/src/components/pdf/report-pdf'

type ReportId = 'commercial' | 'operations' | 'billing' | 'receivable' | 'payable' | 'overdue'

type Join<T> = T | T[] | null

type ClientJoin = { id: string | null; nombre: string | null }
type ProfileJoin = { id: string | null; nombre: string | null; apellido: string | null; email: string | null }

type QuotationRow = {
  id: string
  quotation_number: string | null
  numero_cotizacion?: string | null
  created_at: string | null
  status: string | null
  quote_type: string | null
  tipo_transporte: string | null
  total_sale: number | string | null
  profit_amount: number | string | null
  gp_percentage: number | string | null
  clientes: Join<ClientJoin>
  created_by_profile: Join<ProfileJoin>
}

type ShippingInstructionRow = {
  id: string
  routing_number: string | null
  booking_number: string | null
  shipment_status: string | null
  operational_status: string | null
  created_at: string | null
  quotation: Join<{
    quotation_number: string | null
    quote_type: string | null
    tipo_transporte: string | null
    clientes: Join<ClientJoin>
    created_by_profile: Join<ProfileJoin>
  }>
}

type BookingRow = {
  id: string
  booking_number: string | null
  carrier: string | null
  eta: string | null
  actual_eta: string | null
  shipment_status: string | null
  created_at: string | null
  shipping_instruction: Join<{
    routing_number: string | null
    quotation: Join<{
      quote_type: string | null
      tipo_transporte: string | null
      clientes: Join<ClientJoin>
      created_by_profile: Join<ProfileJoin>
    }>
  }>
}

type InvoiceRow = {
  id: string
  invoice_number: string | null
  invoice_type: string
  status: string
  cliente_id: string | null
  cliente_nombre: string | null
  issue_date: string | null
  due_date: string | null
  total: number | string | null
  currency: string
}

type PayableRow = {
  id: string
  descripcion: string
  numero_factura_proveedor: string | null
  monto: number | string
  moneda: string
  fecha_factura: string | null
  fecha_vencimiento: string | null
  status: string
  pagos_proveedor?: { monto: number | string; fecha_pago: string | null }[]
  proveedores: Join<{ id: string; nombre: string; tipo: string }>
  quotations: Join<{ quotation_number: string | null; numero_cotizacion: string | null }>
}

type ReportRow = ReportPdfRow & {
  __date?: string
  __client?: string
  __seller?: string
  __service?: string
  __status?: string
  __currency?: string
  __amount?: number
}

const REPORTS: { id: ReportId; label: string; scope: string; roles: string[] }[] = [
  { id: 'commercial', label: 'Comercial', scope: 'Cotizaciones, ventas, GP y vendedores', roles: ['Admin', 'Ventas', 'Pricing'] },
  { id: 'operations', label: 'Cargas', scope: 'Shipping instructions, bookings, carrier y ETA', roles: ['Admin', 'Operaciones'] },
  { id: 'billing', label: 'Facturacion', scope: 'Facturas, notas, estados y montos emitidos', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'receivable', label: 'Cuentas por cobrar', scope: 'Facturas enviadas/aprobadas/vencidas pendientes', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'payable', label: 'Cuentas por pagar', scope: 'Proveedores, saldos, pagos y vencimientos', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'overdue', label: 'Vencidas', scope: 'Facturas y cuentas por pagar vencidas con dias', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
]

const STATUS_OPTIONS = ['Todos', 'Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente', 'Ganada', 'Perdida', 'Pendiente', 'Parcialmente Pagada', 'Pagada', 'Vencida', 'Enviada', 'Aprobada', 'Anulada']
const ALL = 'Todos'

function resolveJoin<T>(value: Join<T> | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function fmtMoney(value: number, currency = 'USD') {
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(value?: string | null) {
  if (!value) return '-'
  const datePart = value.slice(0, 10)
  const [year, month, day] = datePart.split('-')
  if (!year || !month || !day) return '-'
  return `${day}/${month}/${year}`
}

function daysOverdue(value?: string | null) {
  if (!value) return 0
  const due = new Date(value.slice(0, 10) + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
}

function clientName(value: Join<ClientJoin> | undefined) {
  return resolveJoin(value)?.nombre || 'Sin cliente'
}

function sellerName(value: Join<ProfileJoin> | undefined) {
  const seller = resolveJoin(value)
  const fullName = `${seller?.nombre || ''} ${seller?.apellido || ''}`.trim()
  return fullName || seller?.email || 'Sin vendedor'
}

function quoteNumber(q: Pick<QuotationRow, 'quotation_number' | 'numero_cotizacion'>) {
  return q.quotation_number || q.numero_cotizacion || '-'
}

function serviceLabel(quoteType?: string | null, transport?: string | null) {
  return [quoteType, transport].filter(Boolean).join(' / ') || 'Sin servicio'
}

function payableBalance(row: PayableRow) {
  const paid = (row.pagos_proveedor || []).reduce((sum, p) => sum + Number(p.monto || 0), 0)
  return Math.max(0, Number(row.monto || 0) - paid)
}

function exportCSV(rows: ReportRow[], columns: ReportPdfColumn[], filename: string) {
  if (rows.length === 0) {
    toast.info('No hay filas para exportar')
    return
  }

  const csv = [
    columns.map((c) => c.label).join(','),
    ...rows.map((row) =>
      columns.map((column) => `"${String(row[column.key] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function applyPreset(setDateFrom: (v: string) => void, setDateTo: (v: string) => void, preset: 'month' | 'quarter' | 'year' | 'all') {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  if (preset === 'month') setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  if (preset === 'quarter') setDateFrom(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10))
  if (preset === 'year') setDateFrom(`${now.getFullYear()}-01-01`)
  if (preset === 'all') setDateFrom('')
  setDateTo(preset === 'all' ? '' : to)
}

export default function ReportsPage() {
  const { profile, loading: userLoading } = useUser()
  const role = profile?.rol || ''
  const today = new Date()
  const [activeReport, setActiveReport] = useState<ReportId>('commercial')
  const [dateFrom, setDateFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10))
  const [clientFilter, setClientFilter] = useState(ALL)
  const [sellerFilter, setSellerFilter] = useState(ALL)
  const [serviceFilter, setServiceFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [currencyFilter, setCurrencyFilter] = useState(ALL)
  const [loading, setLoading] = useState(true)

  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [instructions, setInstructions] = useState<ShippingInstructionRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [payables, setPayables] = useState<PayableRow[]>([])

  const availableReports = useMemo(
    () => REPORTS.filter((report) => report.roles.includes(role)),
    [role]
  )

  useEffect(() => {
    if (userLoading) return
    if (availableReports.length > 0 && !availableReports.some((r) => r.id === activeReport)) {
      setActiveReport(availableReports[0].id)
    }
  }, [activeReport, availableReports, userLoading])

  const loadReports = async () => {
    if (!role) return
    setLoading(true)

    const wantsCommercial = role === 'Admin' || role === 'Ventas' || role === 'Pricing'
    const wantsOperations = role === 'Admin' || role === 'Operaciones'
    const wantsFinance = role === 'Admin' || role === 'Finanzas' || role === 'Contabilidad'

    const tasks: PromiseLike<void>[] = []

    if (wantsCommercial) {
      tasks.push(
        supabase
          .from('quotations')
          .select(`
            id,
            quotation_number,
            numero_cotizacion,
            created_at,
            status,
            quote_type,
            tipo_transporte,
            total_sale,
            profit_amount,
            gp_percentage,
            clientes ( id, nombre ),
            created_by_profile:profiles!quotations_created_by_fkey ( id, nombre, apellido, email )
          `)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar cotizaciones')
            setQuotations((data || []) as unknown as QuotationRow[])
          })
      )
    }

    if (wantsOperations) {
      tasks.push(
        supabase
          .from('shipping_instructions')
          .select(`
            id,
            routing_number,
            booking_number,
            shipment_status,
            operational_status,
            created_at,
            quotation:quotations (
              quotation_number,
              quote_type,
              tipo_transporte,
              clientes ( id, nombre ),
              created_by_profile:profiles!quotations_created_by_fkey ( id, nombre, apellido, email )
            )
          `)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar cargas')
            setInstructions((data || []) as unknown as ShippingInstructionRow[])
          })
      )
      tasks.push(
        supabase
          .from('bookings')
          .select(`
            id,
            booking_number,
            carrier,
            eta,
            actual_eta,
            shipment_status,
            created_at,
            shipping_instruction:shipping_instructions (
              routing_number,
              quotation:quotations (
                quote_type,
                tipo_transporte,
                clientes ( id, nombre ),
                created_by_profile:profiles!quotations_created_by_fkey ( id, nombre, apellido, email )
              )
            )
          `)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar bookings')
            setBookings((data || []) as unknown as BookingRow[])
          })
      )
    }

    if (wantsFinance) {
      tasks.push(
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_type, status, cliente_id, cliente_nombre, issue_date, due_date, total, currency')
          .is('deleted_at', null)
          .order('issue_date', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar facturas')
            setInvoices((data || []) as InvoiceRow[])
          })
      )
      tasks.push(
        supabase
          .from('cuentas_pagar')
          .select('id, descripcion, numero_factura_proveedor, monto, moneda, fecha_factura, fecha_vencimiento, status, pagos_proveedor(monto, fecha_pago), proveedores(id, nombre, tipo), quotations(quotation_number, numero_cotizacion)')
          .order('fecha_vencimiento', { ascending: true })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar cuentas por pagar')
            setPayables((data || []) as unknown as PayableRow[])
          })
      )
    }

    await Promise.all(tasks)
    setLoading(false)
  }

  useEffect(() => {
    if (userLoading) return
    loadReports()
  }, [userLoading, role])

  const reportConfig = REPORTS.find((report) => report.id === activeReport) || REPORTS[0]

  const baseRows = useMemo<ReportRow[]>(() => {
    if (activeReport === 'commercial') {
      return quotations.map((q) => {
        const client = clientName(q.clientes)
        const seller = sellerName(q.created_by_profile)
        const service = serviceLabel(q.quote_type, q.tipo_transporte)
        const sale = Number(q.total_sale || 0)
        const profit = Number(q.profit_amount || 0)
        const gp = sale > 0 ? (profit / sale) * 100 : Number(q.gp_percentage || 0)
        return {
          __key: q.id,
          __date: q.created_at?.slice(0, 10) || '',
          __client: client,
          __seller: seller,
          __service: service,
          __status: q.status || '',
          __currency: 'USD',
          __amount: sale,
          numero: quoteNumber(q),
          fecha: fmtDate(q.created_at),
          cliente: client,
          vendedor: seller,
          servicio: service,
          estado: q.status || '-',
          venta: fmtMoney(sale),
          gp: fmtMoney(profit),
          margen: `${gp.toFixed(1)}%`,
        }
      })
    }

    if (activeReport === 'operations') {
      const siRows: ReportRow[] = instructions.map((si) => {
        const q = resolveJoin(si.quotation)
        const client = clientName(q?.clientes)
        const seller = sellerName(q?.created_by_profile)
        const service = serviceLabel(q?.quote_type, q?.tipo_transporte)
        const status = si.operational_status || si.shipment_status || '-'
        return {
          __key: si.id,
          __date: si.created_at?.slice(0, 10) || '',
          __client: client,
          __seller: seller,
          __service: service,
          __status: status,
          tipo: 'Shipping Instruction',
          referencia: si.routing_number || si.booking_number || '-',
          fecha: fmtDate(si.created_at),
          cliente: client,
          vendedor: seller,
          servicio: service,
          carrier: '-',
          eta: '-',
          estado: status,
        }
      })

      const bookingRows: ReportRow[] = bookings.map((booking) => {
        const si = resolveJoin(booking.shipping_instruction)
        const q = resolveJoin(si?.quotation)
        const client = clientName(q?.clientes)
        const seller = sellerName(q?.created_by_profile)
        const service = serviceLabel(q?.quote_type, q?.tipo_transporte)
        return {
          __key: booking.id,
          __date: booking.created_at?.slice(0, 10) || '',
          __client: client,
          __seller: seller,
          __service: service,
          __status: booking.shipment_status || '',
          tipo: 'Booking',
          referencia: booking.booking_number || si?.routing_number || '-',
          fecha: fmtDate(booking.created_at),
          cliente: client,
          vendedor: seller,
          servicio: service,
          carrier: booking.carrier || '-',
          eta: fmtDate(booking.actual_eta || booking.eta),
          estado: booking.shipment_status || '-',
        }
      })

      return [...siRows, ...bookingRows]
    }

    if (activeReport === 'billing') {
      return invoices.map((invoice) => ({
        __key: invoice.id,
        __date: invoice.issue_date || '',
        __client: invoice.cliente_nombre || 'Sin cliente',
        __status: invoice.status,
        __currency: invoice.currency,
        __amount: Number(invoice.total || 0),
        numero: invoice.invoice_number || '-',
        tipo: invoice.invoice_type,
        cliente: invoice.cliente_nombre || 'Sin cliente',
        emision: fmtDate(invoice.issue_date),
        vencimiento: fmtDate(invoice.due_date),
        estado: invoice.status,
        total: fmtMoney(Number(invoice.total || 0), invoice.currency),
      }))
    }

    if (activeReport === 'receivable') {
      return invoices
        .filter((invoice) => ['Enviada', 'Aprobada', 'Vencida'].includes(invoice.status))
        .map((invoice) => ({
          __key: invoice.id,
          __date: invoice.due_date || invoice.issue_date || '',
          __client: invoice.cliente_nombre || 'Sin cliente',
          __status: invoice.status,
          __currency: invoice.currency,
          __amount: Number(invoice.total || 0),
          numero: invoice.invoice_number || '-',
          cliente: invoice.cliente_nombre || 'Sin cliente',
          emision: fmtDate(invoice.issue_date),
          vencimiento: fmtDate(invoice.due_date),
          dias: invoice.due_date ? daysOverdue(invoice.due_date) : 0,
          estado: invoice.status,
          saldo: fmtMoney(Number(invoice.total || 0), invoice.currency),
        }))
    }

    if (activeReport === 'payable') {
      return payables.map((payable) => {
        const supplier = resolveJoin(payable.proveedores)
        const quotation = resolveJoin(payable.quotations)
        const balance = payableBalance(payable)
        return {
          __key: payable.id,
          __date: payable.fecha_vencimiento || payable.fecha_factura || '',
          __client: supplier?.nombre || 'Sin proveedor',
          __status: payable.status,
          __currency: payable.moneda,
          __amount: balance,
          proveedor: supplier?.nombre || 'Sin proveedor',
          tipo: supplier?.tipo || '-',
          factura: payable.numero_factura_proveedor || '-',
          cotizacion: quotation?.quotation_number || quotation?.numero_cotizacion || '-',
          descripcion: payable.descripcion,
          vencimiento: fmtDate(payable.fecha_vencimiento),
          estado: payable.status,
          saldo: fmtMoney(balance, payable.moneda),
        }
      })
    }

    return [
      ...invoices
        .filter((invoice) => ['Enviada', 'Aprobada', 'Vencida'].includes(invoice.status) && daysOverdue(invoice.due_date) > 0)
        .map((invoice) => ({
          __key: `ar-${invoice.id}`,
          __date: invoice.due_date || '',
          __client: invoice.cliente_nombre || 'Sin cliente',
          __status: invoice.status,
          __currency: invoice.currency,
          __amount: Number(invoice.total || 0),
          tipo: 'Por cobrar',
          tercero: invoice.cliente_nombre || 'Sin cliente',
          documento: invoice.invoice_number || '-',
          vencimiento: fmtDate(invoice.due_date),
          dias: daysOverdue(invoice.due_date),
          estado: invoice.status,
          monto: fmtMoney(Number(invoice.total || 0), invoice.currency),
        })),
      ...payables
        .filter((payable) => ['Pendiente', 'Parcialmente Pagada', 'Vencida'].includes(payable.status) && daysOverdue(payable.fecha_vencimiento) > 0)
        .map((payable) => {
          const supplier = resolveJoin(payable.proveedores)
          const balance = payableBalance(payable)
          return {
            __key: `ap-${payable.id}`,
            __date: payable.fecha_vencimiento || '',
            __client: supplier?.nombre || 'Sin proveedor',
            __status: payable.status,
            __currency: payable.moneda,
            __amount: balance,
            tipo: 'Por pagar',
            tercero: supplier?.nombre || 'Sin proveedor',
            documento: payable.numero_factura_proveedor || payable.descripcion,
            vencimiento: fmtDate(payable.fecha_vencimiento),
            dias: daysOverdue(payable.fecha_vencimiento),
            estado: payable.status,
            monto: fmtMoney(balance, payable.moneda),
          }
        }),
    ]
  }, [activeReport, bookings, instructions, invoices, payables, quotations])

  const rows = useMemo(() => {
    return baseRows.filter((row) => {
      const rowDate = row.__date || ''
      if (dateFrom && rowDate && rowDate < dateFrom) return false
      if (dateTo && rowDate && rowDate > dateTo) return false
      if (clientFilter !== ALL && row.__client !== clientFilter) return false
      if (sellerFilter !== ALL && row.__seller !== sellerFilter) return false
      if (serviceFilter !== ALL && row.__service !== serviceFilter) return false
      if (statusFilter !== ALL && row.__status !== statusFilter) return false
      if (currencyFilter !== ALL && row.__currency !== currencyFilter) return false
      return true
    })
  }, [baseRows, clientFilter, currencyFilter, dateFrom, dateTo, sellerFilter, serviceFilter, statusFilter])

  const columns = useMemo<ReportPdfColumn[]>(() => {
    if (activeReport === 'commercial') {
      return [
        { key: 'numero', label: 'Cotizacion', width: '11%' },
        { key: 'fecha', label: 'Fecha', width: '9%' },
        { key: 'cliente', label: 'Cliente', width: '17%' },
        { key: 'vendedor', label: 'Vendedor', width: '14%' },
        { key: 'servicio', label: 'Servicio', width: '14%' },
        { key: 'estado', label: 'Estado', width: '12%' },
        { key: 'venta', label: 'Venta', width: '11%', align: 'right' },
        { key: 'gp', label: 'GP', width: '8%', align: 'right' },
        { key: 'margen', label: 'GP%', width: '4%', align: 'right' },
      ]
    }
    if (activeReport === 'operations') {
      return [
        { key: 'tipo', label: 'Tipo', width: '13%' },
        { key: 'referencia', label: 'Referencia', width: '13%' },
        { key: 'fecha', label: 'Fecha', width: '9%' },
        { key: 'cliente', label: 'Cliente', width: '18%' },
        { key: 'servicio', label: 'Servicio', width: '14%' },
        { key: 'carrier', label: 'Carrier', width: '12%' },
        { key: 'eta', label: 'ETA', width: '9%' },
        { key: 'estado', label: 'Estado', width: '12%' },
      ]
    }
    if (activeReport === 'billing') {
      return [
        { key: 'numero', label: 'Documento', width: '14%' },
        { key: 'tipo', label: 'Tipo', width: '12%' },
        { key: 'cliente', label: 'Cliente', width: '24%' },
        { key: 'emision', label: 'Emision', width: '10%' },
        { key: 'vencimiento', label: 'Vence', width: '10%' },
        { key: 'estado', label: 'Estado', width: '12%' },
        { key: 'total', label: 'Total', width: '18%', align: 'right' },
      ]
    }
    if (activeReport === 'receivable') {
      return [
        { key: 'numero', label: 'Factura', width: '16%' },
        { key: 'cliente', label: 'Cliente', width: '28%' },
        { key: 'emision', label: 'Emision', width: '11%' },
        { key: 'vencimiento', label: 'Vence', width: '11%' },
        { key: 'dias', label: 'Dias', width: '8%', align: 'right' },
        { key: 'estado', label: 'Estado', width: '12%' },
        { key: 'saldo', label: 'Saldo', width: '14%', align: 'right' },
      ]
    }
    if (activeReport === 'payable') {
      return [
        { key: 'proveedor', label: 'Proveedor', width: '20%' },
        { key: 'tipo', label: 'Tipo', width: '10%' },
        { key: 'factura', label: 'Factura', width: '13%' },
        { key: 'cotizacion', label: 'Cotizacion', width: '12%' },
        { key: 'descripcion', label: 'Descripcion', width: '19%' },
        { key: 'vencimiento', label: 'Vence', width: '10%' },
        { key: 'estado', label: 'Estado', width: '9%' },
        { key: 'saldo', label: 'Saldo', width: '7%', align: 'right' },
      ]
    }
    return [
      { key: 'tipo', label: 'Tipo', width: '13%' },
      { key: 'tercero', label: 'Cliente / Proveedor', width: '27%' },
      { key: 'documento', label: 'Documento', width: '20%' },
      { key: 'vencimiento', label: 'Vence', width: '11%' },
      { key: 'dias', label: 'Dias', width: '8%', align: 'right' },
      { key: 'estado', label: 'Estado', width: '10%' },
      { key: 'monto', label: 'Monto', width: '11%', align: 'right' },
    ]
  }, [activeReport])

  const options = useMemo(() => {
    const unique = (values: (string | undefined)[]) => [ALL, ...Array.from(new Set(values.filter(Boolean) as string[])).sort()]
    return {
      clients: unique(baseRows.map((row) => row.__client)),
      sellers: unique(baseRows.map((row) => row.__seller)),
      services: unique(baseRows.map((row) => row.__service)),
      statuses: unique([...baseRows.map((row) => row.__status), ...STATUS_OPTIONS.filter((s) => s !== ALL)]),
      currencies: unique(baseRows.map((row) => row.__currency)),
    }
  }, [baseRows])

  const totalAmount = rows.reduce((sum, row) => sum + Number(row.__amount || 0), 0)
  const currencyLabel = currencyFilter === ALL ? (rows[0]?.__currency || 'USD') : currencyFilter
  const pdfData: ReportPdfData = {
    title: `Reporte ${reportConfig.label}`,
    subtitle: reportConfig.scope,
    generatedAt: new Date().toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    filters: [
      `Fechas: ${dateFrom ? fmtDate(dateFrom) : 'Inicio'} - ${dateTo ? fmtDate(dateTo) : 'Hoy'}`,
      `Cliente/Proveedor: ${clientFilter}`,
      `Vendedor: ${sellerFilter}`,
      `Servicio: ${serviceFilter}`,
      `Estado: ${statusFilter}`,
      `Moneda: ${currencyFilter}`,
    ],
    metrics: [
      { label: 'Registros', value: String(rows.length) },
      { label: activeReport === 'commercial' ? 'Venta filtrada' : 'Monto filtrado', value: fmtMoney(totalAmount, currencyLabel) },
      { label: 'Reporte', value: reportConfig.label },
    ],
    columns,
    rows,
  }

  if (userLoading || loading) return <PageSkeleton cards={3} rows={7} />

  if (availableReports.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" />}
        title="Sin acceso a reportes"
        description="Tu rol no tiene reportes asignados."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Reporterias
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Reportes exportables</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Comercial, cargas, facturacion, cuentas por cobrar y cuentas por pagar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadReports} className={secondaryButtonClass}>
            <RefreshCcw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => exportCSV(rows, columns, `reporte-${activeReport}.csv`)}
            className={secondaryButtonClass}
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <PDFDownloadLink
            document={<ReportPdf data={pdfData} />}
            fileName={`reporte-${activeReport}.pdf`}
            className={primaryButtonClass}
          >
            {({ loading: pdfLoading }) => (
              <>
                <FileDown className="h-4 w-4" />
                {pdfLoading ? 'Generando...' : 'PDF'}
              </>
            )}
          </PDFDownloadLink>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {availableReports.map((report) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setActiveReport(report.id)}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              activeReport === report.id
                ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {report.label}
          </button>
        ))}
      </div>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filtros</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente / proveedor</label>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={fieldClass}>
              {options.clients.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Vendedor</label>
            <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className={fieldClass}>
              {options.sellers.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Servicio</label>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className={fieldClass}>
              {options.services.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Estado</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldClass}>
              {options.statuses.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'month')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            Mes
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'quarter')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            Trimestre
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'year')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            Año
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'all')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            Todo
          </button>
          <div className="ml-auto flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className={`${fieldClass} h-10 w-28`}>
              {options.currencies.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {pdfData.metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{reportConfig.label}</h2>
            <p className="text-xs text-slate-500">{reportConfig.scope}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {rows.length} filas
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Sin datos" description="Ajusta los filtros para ver resultados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {columns.map((column) => (
                    <th key={column.key} className={`px-3 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 120).map((row) => (
                  <tr key={String(row.__key)} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                    {columns.map((column) => (
                      <td key={column.key} className={`px-3 py-2.5 text-slate-700 dark:text-slate-300 ${column.align === 'right' ? 'text-right font-semibold' : ''}`}>
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 120 && (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400 dark:border-slate-800">
                Vista previa limitada a 120 filas. CSV incluye todas las filas filtradas.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
