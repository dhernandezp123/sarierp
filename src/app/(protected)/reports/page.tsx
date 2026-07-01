'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PDFDownloadLink, pdf } from '@react-pdf/renderer'
import {
  BarChart3,
  CalendarDays,
  Download,
  FileDown,
  Filter,
  Printer,
  RefreshCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { toDateInputValue } from '@/src/lib/format'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { ReportPdf, type ReportPdfColumn, type ReportPdfData, type ReportPdfRow } from '@/src/components/pdf/report-pdf'

type ReportId = 'commercial' | 'operations' | 'billing' | 'receivable' | 'payable' | 'overdue' | 'supplier_payments'
type DatePreset = 'month' | 'quarter' | 'year' | 'all' | 'custom'

type Join<T> = T | T[] | null

type ClientJoin = { id: string | null; nombre: string | null }
type ProfileJoin = { id: string | null; nombre: string | null; apellido: string | null; email: string | null }

type QuotationRow = {
  id: string
  quotation_number: string | null
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
  clientes: Join<{
    ciudad: string | null
    tipo_cliente: string | null
    vendedor_profile: Join<{ nombre: string | null; apellido: string | null }>
  }>
}

type ReceivableRow = {
  invoice_id: string
  invoice_number: string | null
  cliente_id: string | null
  cliente_nombre: string | null
  issue_date: string | null
  due_date: string | null
  currency: string
  original_total: number | string
  credit_notes: number | string
  debit_notes: number | string
  adjusted_total: number | string
  paid_total: number | string
  balance: number | string
  receivable_status: string
  days_overdue: number
}

type ProveedorPaymentRow = {
  id: string
  monto: number | string
  moneda: string
  fecha_pago: string | null
  metodo_pago: string | null
  cuentas_pagar: Join<{
    descripcion: string
    proveedores: Join<{ nombre: string; tipo: string }>
  }>
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
  quotations: Join<{ quotation_number: string | null }>
}

type ReportRow = ReportPdfRow & {
  __date?: string
  __client?: string
  __seller?: string
  __service?: string
  __status?: string
  __currency?: string
  __amount?: number
  __gp?: number
}

const REPORTS: { id: ReportId; label: string; scope: string; roles: string[] }[] = [
  { id: 'commercial', label: 'Comercial', scope: 'Cotizaciones, ventas, GP y vendedores', roles: ['Admin', 'Ventas', 'Pricing'] },
  { id: 'operations', label: 'Cargas', scope: 'Shipping instructions, bookings, carrier y ETA', roles: ['Admin', 'Operaciones'] },
  { id: 'billing', label: 'Facturación', scope: 'Facturas por cliente, tipo, ciudad, segmento y vendedor', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'receivable', label: 'Cuentas por cobrar', scope: 'Facturas enviadas/aprobadas/vencidas pendientes', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'payable', label: 'Cuentas por pagar', scope: 'Proveedores, saldos, pagos y vencimientos', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'overdue', label: 'Vencidas', scope: 'Facturas y cuentas por pagar vencidas con días', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
  { id: 'supplier_payments', label: 'Pagos a Proveedores', scope: 'Pagos por proveedor/tipo: mensual, trimestral, anual', roles: ['Admin', 'Finanzas', 'Contabilidad'] },
]

const STATUS_OPTIONS = ['Todos', 'Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente', 'Ganada', 'Perdida', 'Pendiente', 'Parcialmente Pagada', 'Pagada', 'Vencida', 'Enviada', 'Aprobada', 'Anulada']
const ALL = 'Todos'
const actionIconButtonClass = 'flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0b1220] dark:text-slate-200 dark:hover:bg-slate-800'

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

function quoteNumber(q: Pick<QuotationRow, 'quotation_number'>) {
  return q.quotation_number || '-'
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

function presetRange(preset: Exclude<DatePreset, 'custom'>) {
  const now = new Date()
  const to = toDateInputValue(now)

  if (preset === 'month') {
    return { from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  }
  if (preset === 'quarter') {
    return { from: toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to }
  }
  if (preset === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to }
  }

  return { from: '', to: '' }
}

function resolveDatePreset(dateFrom: string, dateTo: string): DatePreset {
  const presets: Exclude<DatePreset, 'custom'>[] = ['month', 'quarter', 'year', 'all']
  const match = presets.find((preset) => {
    const range = presetRange(preset)
    return range.from === dateFrom && range.to === dateTo
  })

  return match || 'custom'
}

function applyPreset(setDateFrom: (v: string) => void, setDateTo: (v: string) => void, preset: Exclude<DatePreset, 'custom'>) {
  const range = presetRange(preset)
  setDateFrom(range.from)
  setDateTo(range.to)
}

export default function ReportsPage() {
  const { profile, loading: userLoading } = useUser()
  const role = profile?.rol || ''
  const today = new Date()
  const [activeReport, setActiveReport] = useState<ReportId>('commercial')
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [dateTo, setDateTo] = useState(toDateInputValue(today))
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
  const [receivables, setReceivables] = useState<ReceivableRow[]>([])
  const [payables, setPayables] = useState<PayableRow[]>([])
  const [proveedorPayments, setProveedorPayments] = useState<ProveedorPaymentRow[]>([])

  const availableReports = useMemo(
    () => REPORTS.filter((report) => report.roles.includes(role)),
    [role]
  )

  useEffect(() => {
    if (userLoading) return
    if (availableReports.length > 0 && !availableReports.some((r) => r.id === activeReport)) {
      const timeout = window.setTimeout(() => setActiveReport(availableReports[0].id), 0)
      return () => window.clearTimeout(timeout)
    }
  }, [activeReport, availableReports, userLoading])

  const loadReports = useCallback(async () => {
    if (!role) return
    setLoading(true)

    const wantsCommercial = role === 'Admin' || role === 'Ventas' || role === 'Pricing'
    const wantsOperations = role === 'Admin' || role === 'Operaciones'
    const wantsFinance = role === 'Admin' || role === 'Finanzas' || role === 'Contabilidad'

    const tasks: PromiseLike<void>[] = []

    if (wantsCommercial) {
      tasks.push(
        supabase
          .from('invoice_receivables')
          .select('*')
          .order('due_date', { ascending: true, nullsFirst: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar cuentas por cobrar')
            setReceivables((data || []) as ReceivableRow[])
          })
      )
      tasks.push(
        supabase
          .from('quotations')
          .select(`
            id,
            quotation_number,
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
          .select(`
            id, invoice_number, invoice_type, status,
            cliente_id, cliente_nombre,
            issue_date, due_date, total, currency,
            clientes!cliente_id(
              ciudad,
              tipo_cliente,
              vendedor_profile:profiles!vendedor_asignado(nombre, apellido)
            )
          `)
          .is('deleted_at', null)
          .order('issue_date', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar facturas')
            setInvoices((data || []) as unknown as InvoiceRow[])
          })
      )
      tasks.push(
        supabase
          .from('cuentas_pagar')
          .select('id, descripcion, numero_factura_proveedor, monto, moneda, fecha_factura, fecha_vencimiento, status, pagos_proveedor(monto, fecha_pago), proveedores(id, nombre, tipo), quotations(quotation_number)')
          .order('fecha_vencimiento', { ascending: true })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar cuentas por pagar')
            setPayables((data || []) as unknown as PayableRow[])
          })
      )
      tasks.push(
        supabase
          .from('pagos_proveedor')
          .select(`
            id, monto, moneda, fecha_pago, metodo_pago,
            cuentas_pagar(
              descripcion,
              proveedores(nombre, tipo)
            )
          `)
          .order('fecha_pago', { ascending: false })
          .then(({ data, error }) => {
            if (error) toast.error('No se pudieron cargar pagos a proveedores')
            setProveedorPayments((data || []) as unknown as ProveedorPaymentRow[])
          })
      )
    }

    await Promise.all(tasks)
    setLoading(false)
  }, [role])

  useEffect(() => {
    if (userLoading) return
    const timeout = window.setTimeout(() => { void loadReports() }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadReports, userLoading])

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
          __gp: profit,
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
      return invoices.map((invoice) => {
        const cl = resolveJoin(invoice.clientes)
        const vp = resolveJoin(cl?.vendedor_profile)
        const vendedor = vp ? `${vp.nombre || ''} ${vp.apellido || ''}`.trim() : '-'
        return {
          __key: invoice.id,
          __date: invoice.issue_date || '',
          __client: invoice.cliente_nombre || 'Sin cliente',
          __seller: vendedor,
          __status: invoice.status,
          __currency: invoice.currency,
          __amount: Number(invoice.total || 0),
          numero: invoice.invoice_number || '-',
          tipo: invoice.invoice_type,
          cliente: invoice.cliente_nombre || 'Sin cliente',
          segmento: cl?.tipo_cliente || '-',
          ciudad: cl?.ciudad || '-',
          vendedor,
          emision: fmtDate(invoice.issue_date),
          estado: invoice.status,
          total: fmtMoney(Number(invoice.total || 0), invoice.currency),
        }
      })
    }

    if (activeReport === 'receivable') {
      return receivables
        .filter((receivable) => Number(receivable.balance) > 0)
        .map((receivable) => ({
          __key: receivable.invoice_id,
          __date: receivable.due_date || receivable.issue_date || '',
          __client: receivable.cliente_nombre || 'Sin cliente',
          __status: receivable.receivable_status,
          __currency: receivable.currency,
          __amount: Number(receivable.balance),
          numero: receivable.invoice_number || '-',
          cliente: receivable.cliente_nombre || 'Sin cliente',
          emision: fmtDate(receivable.issue_date),
          vencimiento: fmtDate(receivable.due_date),
          dias: receivable.days_overdue > 0 ? `${receivable.days_overdue} días` : '-',
          estado: receivable.receivable_status,
          factura: fmtMoney(Number(receivable.original_total), receivable.currency),
          notas: fmtMoney(Number(receivable.debit_notes) - Number(receivable.credit_notes), receivable.currency),
          pagado: fmtMoney(Number(receivable.paid_total), receivable.currency),
          saldo: fmtMoney(Number(receivable.balance), receivable.currency),
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
          cotizacion: quotation?.quotation_number || '-',
          descripcion: payable.descripcion,
          vencimiento: fmtDate(payable.fecha_vencimiento),
          estado: payable.status,
          saldo: fmtMoney(balance, payable.moneda),
        }
      })
    }

    if (activeReport === 'overdue') {
      return [
      ...receivables
        .filter((receivable) => Number(receivable.balance) > 0 && receivable.days_overdue > 0)
        .map((receivable) => ({
          __key: `ar-${receivable.invoice_id}`,
          __date: receivable.due_date || '',
          __client: receivable.cliente_nombre || 'Sin cliente',
          __status: receivable.receivable_status,
          __currency: receivable.currency,
          __amount: Number(receivable.balance),
          tipo: 'Por cobrar',
          tercero: receivable.cliente_nombre || 'Sin cliente',
          documento: receivable.invoice_number || '-',
          vencimiento: fmtDate(receivable.due_date),
          dias: `${receivable.days_overdue} días`,
          estado: receivable.receivable_status,
          monto: fmtMoney(Number(receivable.balance), receivable.currency),
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
            dias: `${daysOverdue(payable.fecha_vencimiento)} días`,
            estado: payable.status,
            monto: fmtMoney(balance, payable.moneda),
          }
        }),
      ]
    }

    if (activeReport === 'supplier_payments') {
      return proveedorPayments.map((pago) => {
        const cp = resolveJoin(pago.cuentas_pagar)
        const proveedor = resolveJoin(cp?.proveedores)
        const periodo = pago.fecha_pago ? pago.fecha_pago.slice(0, 7) : '-'
        const [yr, mo] = periodo !== '-' ? periodo.split('-') : ['', '']
        const periodoLabel = yr && mo ? `${mo}/${yr}` : '-'
        const monto = Number(pago.monto || 0)
        return {
          __key: pago.id,
          __date: pago.fecha_pago || '',
          __client: proveedor?.nombre || 'Sin proveedor',
          __currency: pago.moneda,
          __amount: monto,
          tipo: proveedor?.tipo || '-',
          proveedor: proveedor?.nombre || 'Sin proveedor',
          descripcion: cp?.descripcion || '-',
          periodo: periodoLabel,
          fecha: fmtDate(pago.fecha_pago),
          metodo: pago.metodo_pago || '-',
          monto: fmtMoney(monto, pago.moneda),
        }
      })
    }

    return []
  }, [activeReport, bookings, instructions, invoices, payables, proveedorPayments, quotations, receivables])

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
        { key: 'numero', label: 'Documento', width: '11%' },
        { key: 'tipo', label: 'Tipo', width: '10%' },
        { key: 'cliente', label: 'Cliente', width: '18%' },
        { key: 'segmento', label: 'Segmento', width: '10%' },
        { key: 'ciudad', label: 'Ciudad', width: '9%' },
        { key: 'vendedor', label: 'Vendedor', width: '11%' },
        { key: 'emision', label: 'Emisión', width: '9%' },
        { key: 'estado', label: 'Estado', width: '10%' },
        { key: 'total', label: 'Total', width: '12%', align: 'right' },
      ]
    }
    if (activeReport === 'receivable') {
      return [
        { key: 'numero', label: 'Factura', width: '12%' },
        { key: 'cliente', label: 'Cliente', width: '18%' },
        { key: 'vencimiento', label: 'Vence', width: '9%' },
        { key: 'dias', label: 'Días', width: '7%', align: 'right' },
        { key: 'estado', label: 'Estado', width: '11%' },
        { key: 'factura', label: 'Factura', width: '11%', align: 'right' },
        { key: 'notas', label: 'NC/ND', width: '10%', align: 'right' },
        { key: 'pagado', label: 'Pagado', width: '10%', align: 'right' },
        { key: 'saldo', label: 'Saldo', width: '12%', align: 'right' },
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
    if (activeReport === 'overdue') {
      return [
        { key: 'tipo', label: 'Tipo', width: '13%' },
        { key: 'tercero', label: 'Cliente / Proveedor', width: '27%' },
        { key: 'documento', label: 'Documento', width: '20%' },
        { key: 'vencimiento', label: 'Vence', width: '11%' },
        { key: 'dias', label: 'Días', width: '8%', align: 'right' },
        { key: 'estado', label: 'Estado', width: '10%' },
        { key: 'monto', label: 'Monto', width: '11%', align: 'right' },
      ]
    }
    if (activeReport === 'supplier_payments') {
      return [
        { key: 'tipo', label: 'Tipo Proveedor', width: '12%' },
        { key: 'proveedor', label: 'Proveedor', width: '20%' },
        { key: 'descripcion', label: 'Descripción / Servicio', width: '24%' },
        { key: 'periodo', label: 'Período', width: '9%' },
        { key: 'fecha', label: 'Fecha', width: '9%' },
        { key: 'metodo', label: 'Método', width: '11%' },
        { key: 'monto', label: 'Monto', width: '15%', align: 'right' },
      ]
    }
    return []
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

  // REP-001: los totales se agrupan por moneda; nunca sumar USD y HNL juntos.
  const totalsByCurrency = useMemo(() => {
    const acc = new Map<string, { amount: number; gp: number }>()
    rows.forEach((row) => {
      const currency = row.__currency || 'USD'
      const entry = acc.get(currency) ?? { amount: 0, gp: 0 }
      entry.amount += Number(row.__amount || 0)
      entry.gp += Number(row.__gp || 0)
      acc.set(currency, entry)
    })
    return acc
  }, [rows])

  const fmtTotalsByCurrency = (key: 'amount' | 'gp') => {
    if (totalsByCurrency.size === 0) {
      return fmtMoney(0, currencyFilter === ALL ? 'USD' : currencyFilter)
    }
    return Array.from(totalsByCurrency.entries())
      .map(([currency, totals]) => fmtMoney(totals[key], currency))
      .join(' · ')
  }

  // El margen promedio solo es representativo cuando hay una sola moneda.
  const singleCurrencyTotals = totalsByCurrency.size === 1
    ? Array.from(totalsByCurrency.values())[0]
    : null
  const avgMargen = singleCurrencyTotals && singleCurrencyTotals.amount > 0
    ? (singleCurrencyTotals.gp / singleCurrencyTotals.amount) * 100
    : 0
  const activeDatePreset = resolveDatePreset(dateFrom, dateTo)
  const activeFilterCount = [clientFilter, sellerFilter, serviceFilter, statusFilter, currencyFilter].filter((value) => value !== ALL).length + (activeDatePreset === 'custom' ? 1 : 0)
  const presetButtonClass = (preset: Exclude<DatePreset, 'custom'>) =>
    `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
      activeDatePreset === preset
        ? 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
    }`

  // Which columns show totals per report
  const totalColumnsConfig: Record<ReportId, string[]> = {
    commercial: ['venta', 'gp', 'margen'],
    operations: [],
    billing: ['total'],
    receivable: ['saldo'],
    payable: ['saldo'],
    overdue: ['monto'],
    supplier_payments: ['monto'],
  }
  const activeTotalColumns = totalColumnsConfig[activeReport]

  // Build totals row used by both table tfoot and PDF
  const pdfTotals: Record<string, string> = {}
  if (activeTotalColumns.length > 0) {
    columns.forEach((col, idx) => {
      if (col.key === 'gp') {
        pdfTotals[col.key] = fmtTotalsByCurrency('gp')
      } else if (col.key === 'margen') {
        pdfTotals[col.key] = rows.length > 0 && singleCurrencyTotals ? `${avgMargen.toFixed(1)}% prom.` : '-'
      } else if (activeTotalColumns.includes(col.key)) {
        pdfTotals[col.key] = fmtTotalsByCurrency('amount')
      } else if (idx === 0) {
        pdfTotals[col.key] = `${rows.length} registros`
      } else {
        pdfTotals[col.key] = ''
      }
    })
  }

  const dateRangeLabel = `${dateFrom ? fmtDate(dateFrom) : 'Inicio'} – ${dateTo ? fmtDate(dateTo) : 'Hoy'}`

  const pdfData: ReportPdfData = {
    title: `Reporte ${reportConfig.label}`,
    subtitle: reportConfig.scope,
    dateRange: dateRangeLabel,
    generatedAt: new Date().toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    filters: [
      `Período: ${dateRangeLabel}`,
      clientFilter !== ALL ? `Cliente/Proveedor: ${clientFilter}` : '',
      sellerFilter !== ALL ? `Vendedor: ${sellerFilter}` : '',
      serviceFilter !== ALL ? `Servicio: ${serviceFilter}` : '',
      statusFilter !== ALL ? `Estado: ${statusFilter}` : '',
      currencyFilter !== ALL ? `Moneda: ${currencyFilter}` : '',
    ].filter(Boolean),
    metrics: activeReport === 'commercial'
      ? [
          { label: 'Cotizaciones', value: String(rows.length) },
          { label: 'Venta total', value: fmtTotalsByCurrency('amount') },
          { label: 'GP total', value: fmtTotalsByCurrency('gp') },
          { label: 'Margen promedio', value: rows.length > 0 && singleCurrencyTotals ? `${avgMargen.toFixed(1)}%` : '-' },
        ]
      : [
          { label: 'Registros', value: String(rows.length) },
          { label: 'Monto total', value: fmtTotalsByCurrency('amount') },
          { label: 'Período', value: dateRangeLabel },
        ],
    columns,
    rows,
    totals: activeTotalColumns.length > 0 ? pdfTotals : undefined,
  }

  const [generatingPdf, setGeneratingPdf] = useState(false)

  const handleOpenPdf = async () => {
    setGeneratingPdf(true)
    try {
      const blob = await pdf(<ReportPdf data={pdfData} />).toBlob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } finally {
      setGeneratingPdf(false)
    }
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
    <div className="report-print-root space-y-5">
      <style>{`
        @media print {
          aside, header, footer, .report-print-hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
            overflow: visible !important;
          }
          body {
            background: #ffffff !important;
          }
          .report-print-root {
            color: #0f172a !important;
          }
          .report-print-section {
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
          .report-print-table {
            overflow: visible !important;
          }
        }
      `}</style>

      <div className="report-print-hidden flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
          <button type="button" onClick={loadReports} title="Actualizar" className={actionIconButtonClass}>
            <RefreshCcw className="h-4 w-4" />
            <span className="sr-only">Actualizar</span>
          </button>
          <button
            type="button"
            onClick={() => exportCSV(rows, columns, `reporte-${activeReport}.csv`)}
            title="Exportar CSV"
            className={actionIconButtonClass}
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={handleOpenPdf}
            title={generatingPdf ? 'Generando PDF...' : 'Abrir PDF en nueva pestaña'}
            disabled={generatingPdf}
            className={`${actionIconButtonClass} disabled:opacity-40`}
          >
            {generatingPdf
              ? <RefreshCcw className="h-4 w-4 animate-spin" />
              : <Printer className="h-4 w-4" />}
            <span className="sr-only">Abrir PDF</span>
          </button>
          <PDFDownloadLink
            document={<ReportPdf data={pdfData} />}
            fileName={`reporte-${activeReport}.pdf`}
            title="Descargar PDF"
            className={actionIconButtonClass}
          >
            {({ loading: pdfLoading }) => (
              <>
                <FileDown className="h-4 w-4" />
                <span className="sr-only">{pdfLoading ? 'Generando PDF...' : 'Descargar PDF'}</span>
              </>
            )}
          </PDFDownloadLink>
        </div>
      </div>

      <div className="report-print-hidden flex gap-2 overflow-x-auto pb-1">
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

      <section className={`${cardClass} report-print-hidden`}>
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Filtros</h2>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {activeFilterCount} activo{activeFilterCount !== 1 ? 's' : ''}
            </span>
          )}
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
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'month')} className={presetButtonClass('month')} aria-pressed={activeDatePreset === 'month'}>
            Mes
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'quarter')} className={presetButtonClass('quarter')} aria-pressed={activeDatePreset === 'quarter'}>
            Trimestre
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'year')} className={presetButtonClass('year')} aria-pressed={activeDatePreset === 'year'}>
            Año
          </button>
          <button type="button" onClick={() => applyPreset(setDateFrom, setDateTo, 'all')} className={presetButtonClass('all')} aria-pressed={activeDatePreset === 'all'}>
            Todo
          </button>
          {activeDatePreset === 'custom' && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              Personalizado
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className={`${fieldClass} h-10 w-28`}>
              {options.currencies.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="report-print-section grid gap-3 md:grid-cols-3">
        {pdfData.metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <section className={`${cardClass} report-print-section`}>
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
          <div className="report-print-table overflow-x-auto">
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
              {activeTotalColumns.length > 0 && rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/60">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 ${col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {pdfTotals[col.key] || ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
            {rows.length > 120 && (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400 dark:border-slate-800">
                Vista previa: 120 de {rows.length} filas. El CSV y PDF incluyen todas.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
