'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Download, FileText, Lock, Trash2, Upload } from 'lucide-react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { supabase } from '@/src/lib/supabase/client'
import ArrivalNoticePdf, { type ArrivalNoticeData } from '@/src/components/pdf/arrival-notice-pdf'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import {
  cardClass,
  fieldClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import {
  COMPANY_BRANDING_SELECT,
  type CompanyBranding,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'

type ClienteJoin = {
  nombre: string | null
  direccion: string | null
  ciudad: string | null
  pais: string | null
  telefono: string | null
  email_1: string | null
  rtn: string | null
  contacto: string | null
}

type QuotationJoin = {
  id: string
  incoterm: string | null
  transit_time: string | null
  preferred_carrier: string | null
  origen: string | null
  destino: string | null
  tipo_transporte: string | null
  quote_type: string | null
  cliente: ClienteJoin | ClienteJoin[] | null
}

type ContainerAllocation = {
  container_type: string
  quantity: number
}

type BookingContainerRow = {
  id?: string
  container_type: string
  quantity: number | ''
  notes: string
}

type BookingDocument = {
  id: string
  booking_id: string
  document_type: string
  file_name: string
  file_url: string
  notes: string | null
  uploaded_by: string | null
  created_at: string | null
}

type ProfileRow = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
}

type RoutingData = {
  id: string
  quotation_id: string | null
  routing_number: string
  container_type: string | null
  container_qty: number | null
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  quotation: QuotationJoin | QuotationJoin[] | null
}

type BookingData = {
  id: string
  shipping_instruction_id: string
  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  original_eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  tracking_url: string | null
  shipment_status: string | null
  estimated_transit_days: number | null
  real_transit_days: number | null
  free_days: number | null
  remaining_free_days: number | null
  freight_terms: string | null
  release_type: string | null
  hbl_freight_visibility: string | null
  printed_at_destination: boolean | null
  operational_comments: string | null
}

type SelectedAgentQuote = {
  carrier?: string | null
  transit_time?: string | number | null
  transit?: string | number | null
  free_days_destination?: string | number | null
  free_days?: string | number | null
  dias_libres?: string | number | null
}

type BillOfLading = {
  id: string
  bl_type: 'MBL' | 'HBL'
  parent_bl_id: string | null
  bl_number: string | null
  status: string
  release_type: string | null
  carrier: string | null
  vessel_name: string | null
  etd: string | null
  created_at: string | null
}

const bookingStatusOptions = [
  'Booking Solicitado',
  'Booking Confirmado',
  'Documentación Pendiente',
  'Listo para Embarque',
  'Embarcado',
  'En Tránsito',
  'Arribado',
  'Finalizado',
]

const BOOKING_DOCUMENT_BUCKET = 'booking-documents'

const bookingDocumentTypes = [
  'Booking Confirmation',
  'Master BL',
  'House BL',
  'Arrival Notice',
  'Packing List',
  'Commercial Invoice',
  'Carrier Invoice',
  'Supplier Invoice',
  'Other',
]

const readonlyFieldClass = cn(
  fieldClass,
  'cursor-default border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-200 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
)

const fieldHintClass = {
  cotizacion:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  shipping:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  referencia:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
} as const

type FieldHint = keyof typeof fieldHintClass

function resolveJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function SectionCard({
  title,
  children,
  gridClassName = 'md:grid-cols-2',
}: {
  title: string
  children: React.ReactNode
  gridClassName?: string
}) {
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      <div className={`mt-5 grid gap-4 ${gridClassName}`}>{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
  readonlySource,
}: {
  label: string
  children: React.ReactNode
  readonlySource?: FieldHint
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {readonlySource && <Lock className="h-3 w-3" />}
        {readonlySource && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
              fieldHintClass[readonlySource]
            )}
          >
            {readonlySource === 'cotizacion' ? 'cotizacion' : readonlySource}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

function clientAddress(client: ClienteJoin | null) {
  if (!client) return ''
  return [client.direccion, client.ciudad, client.pais].filter(Boolean).join(', ')
}

function normalizeContainerType(value: string) {
  return value.trim().toLowerCase()
}

function groupContainers(containers: ContainerAllocation[]) {
  return containers.reduce<Record<string, ContainerAllocation>>((acc, container) => {
    const type = container.container_type.trim()
    if (!type) return acc

    const key = normalizeContainerType(type)
    acc[key] = {
      container_type: acc[key]?.container_type || type,
      quantity: (acc[key]?.quantity || 0) + Number(container.quantity || 0),
    }

    return acc
  }, {})
}

function containerQuantityFor(containers: ContainerAllocation[], type: string) {
  const grouped = groupContainers(containers)
  return grouped[normalizeContainerType(type)]?.quantity || 0
}

function formatContainerSummary(containers: ContainerAllocation[]) {
  const grouped = Object.values(groupContainers(containers))
  if (grouped.length === 0) return 'Sin asignar'

  return grouped
    .map((container) => `${container.quantity} x ${container.container_type}`)
    .join(', ')
}

function formatDisplayDate(value: string | null) {
  if (!value) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}

function profileDisplayName(profile: ProfileRow | undefined) {
  if (!profile) return 'N/A'

  const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim()
  return fullName || profile.email || 'N/A'
}

export default function RoutingBookingChildPage() {
  const params = useParams<{ id: string; bookingId: string }>()
  const router = useRouter()
  const { profile } = useUser()
  const id = params.id
  const bookingId = params.bookingId

  const [routing, setRouting] = useState<RoutingData | null>(null)
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgentQuote | null>(null)
  const [availableContainers, setAvailableContainers] = useState<ContainerAllocation[]>([])
  const [assignedInOtherBookings, setAssignedInOtherBookings] = useState<ContainerAllocation[]>([])
  const [containerRows, setContainerRows] = useState<BookingContainerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingContainers, setSavingContainers] = useState(false)
  const [bookingDocuments, setBookingDocuments] = useState<BookingDocument[]>([])
  const [documentUserNames, setDocumentUserNames] = useState<Record<string, string>>({})
  const [documentType, setDocumentType] = useState(bookingDocumentTypes[0])
  const [documentNotes, setDocumentNotes] = useState('')
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [documentPendingDelete, setDocumentPendingDelete] =
    useState<BookingDocument | null>(null)
  const [billsOfLading, setBillsOfLading] = useState<BillOfLading[]>([])
  const [loadingBLs, setLoadingBLs] = useState(false)
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))

  const loadBillsOfLading = async (targetBookingId = bookingId) => {
    setLoadingBLs(true)
    const { data, error } = await supabase
      .from('bills_of_lading')
      .select('id, bl_type, parent_bl_id, bl_number, status, release_type, carrier, vessel_name, etd, created_at')
      .eq('booking_id', targetBookingId)
      .order('created_at', { ascending: true })

    setLoadingBLs(false)

    if (error) {
      toast.error('No se pudieron cargar los BLs')
      return
    }

    setBillsOfLading((data || []) as BillOfLading[])
  }

  const loadBookingDocuments = async (targetBookingId = bookingId) => {
    const { data, error } = await supabase
      .from('booking_documents')
      .select('*')
      .eq('booking_id', targetBookingId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('No se pudieron cargar los documentos del booking')
      setBookingDocuments([])
      setDocumentUserNames({})
      return
    }

    const documents = (data || []) as BookingDocument[]
    setBookingDocuments(documents)

    const userIds = Array.from(
      new Set(
        documents
          .map((document) => document.uploaded_by)
          .filter((userId): userId is string => Boolean(userId))
      )
    )

    if (userIds.length === 0) {
      setDocumentUserNames({})
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, email')
      .in('id', userIds)

    if (profilesError) {
      setDocumentUserNames({})
      return
    }

    const namesById = ((profilesData || []) as ProfileRow[]).reduce<Record<string, string>>(
      (acc, profile) => {
        acc[profile.id] = profileDisplayName(profile)
        return acc
      },
      {}
    )

    setDocumentUserNames(namesById)
  }

  const loadData = async () => {
    setLoading(true)

    const { data: routingData, error: routingError } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        quotation_id,
        routing_number,
        container_type,
        container_qty,
        supplier_name,
        supplier_contact,
        supplier_email,
        quotation:quotations (
          id,
          incoterm,
          transit_time,
          preferred_carrier,
          origen,
          destino,
          tipo_transporte,
          quote_type,
          cliente:clientes (
            nombre,
            direccion,
            ciudad,
            pais,
            telefono,
            email_1,
            rtn,
            contacto
          )
        )
      `)
      .eq('id', id)
      .single()

    if (routingError || !routingData) {
      toast.error(routingError?.message || 'Shipping Instruction no encontrada')
      setLoading(false)
      return
    }

    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('shipping_instruction_id', id)
      .single()

    if (bookingError || !bookingData) {
      toast.error(bookingError?.message || 'Booking no encontrado')
      setRouting(routingData as RoutingData)
      setBooking(null)
      setBookingDocuments([])
      setDocumentUserNames({})
      setLoading(false)
      return
    }

    const { data: companyData } = await supabase
      .from('company_settings')
      .select(COMPANY_BRANDING_SELECT)
      .limit(1)
      .maybeSingle()

    setCompanyBranding(normalizeCompanyBranding(companyData))

    const quotation = resolveJoin((routingData as RoutingData).quotation)
    const quotationId = (routingData as RoutingData).quotation_id || quotation?.id
    let quotedContainers: ContainerAllocation[] = []

    if (quotationId) {
      const { data: agentQuoteData } = await supabase
        .from('agent_quotes')
        .select('*')
        .eq('quotation_id', quotationId)
        .eq('is_selected', true)
        .maybeSingle()

      setSelectedAgent(agentQuoteData)

      const { data: quotationContainersData, error: quotationContainersError } = await supabase
        .from('quotation_containers')
        .select('container_type_name, quantity')
        .eq('quotation_id', quotationId)

      if (quotationContainersError) {
      }

      quotedContainers = (quotationContainersData || [])
        .map((container: any) => ({
          container_type: container.container_type_name || '',
          quantity: Number(container.quantity || 0),
        }))
        .filter((container) => container.container_type && container.quantity > 0)
    } else {
      setSelectedAgent(null)
    }

    if (quotedContainers.length === 0) {
      const routingContainerType = (routingData as RoutingData).container_type?.trim()
      const routingContainerQty = Number((routingData as RoutingData).container_qty || 0)

      if (routingContainerType && routingContainerQty > 0) {
        quotedContainers = [{
          container_type: routingContainerType,
          quantity: routingContainerQty,
        }]
      }
    }

    const { data: currentContainersData, error: currentContainersError } = await supabase
      .from('booking_containers')
      .select('id, container_type, quantity, notes, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })

    if (currentContainersError) {
      toast.error('No se pudieron cargar los contenedores del booking')
    }

    const { data: siblingBookingsData, error: siblingBookingsError } = await supabase
      .from('bookings')
      .select('id')
      .eq('shipping_instruction_id', id)
      .neq('id', bookingId)

    if (siblingBookingsError) {
      toast.error('No se pudieron cargar los bookings relacionados')
    }

    const siblingBookingIds = (siblingBookingsData || []).map((item) => item.id)
    let assignedByOthers: ContainerAllocation[] = []

    if (siblingBookingIds.length > 0) {
      const { data: otherContainersData, error: otherContainersError } = await supabase
        .from('booking_containers')
        .select('container_type, quantity')
        .in('booking_id', siblingBookingIds)

      if (otherContainersError) {
        toast.error('No se pudieron cargar los contenedores asignados en otros bookings')
      }

      assignedByOthers = (otherContainersData || [])
        .map((container) => ({
          container_type: container.container_type || '',
          quantity: Number(container.quantity || 0),
        }))
        .filter((container) => container.container_type && container.quantity > 0)
    }

    setRouting(routingData as RoutingData)
    setBooking(bookingData as BookingData)
    setAvailableContainers(quotedContainers)
    setAssignedInOtherBookings(Object.values(groupContainers(assignedByOthers)))
    setContainerRows(
      (currentContainersData || []).map((container: any) => ({
        id: container.id,
        container_type: container.container_type || '',
        quantity: Number(container.quantity || 0),
        notes: container.notes || '',
      }))
    )
    await loadBookingDocuments((bookingData as BookingData).id)
    await loadBillsOfLading((bookingData as BookingData).id)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [id, bookingId])

  const recordBookingActivity = async ({
    action,
    description,
    metadata,
  }: {
    action: string
    description: string
    metadata?: Record<string, unknown>
  }) => {
    if (!booking) return

    try {
      await createActivityLog({
        module: 'operations_booking',
        action,
        entityType: 'booking',
        entityId: booking.id,
        description,
        metadata: {
          shipping_instruction_id: id,
          routing_number: routing?.routing_number,
          booking_id: booking.id,
          booking_number: booking.booking_number,
          ...metadata,
        },
      })
    } catch (error) {
    }
  }

  const saveBooking = async () => {
    if (!booking) return

    setSaving(true)

    const { error } = await supabase
      .from('bookings')
      .update({
        booking_number: booking.booking_number,
        carrier_booking: booking.carrier_booking,
        master_bl: booking.master_bl,
        house_bl: booking.house_bl,
        carrier: booking.carrier,
        vessel_name: booking.vessel_name,
        voyage: booking.voyage,
        etd: booking.etd,
        eta: booking.eta,
        original_eta: booking.original_eta,
        actual_etd: booking.actual_etd,
        actual_eta: booking.actual_eta,
        tracking_url: booking.tracking_url,
        shipment_status: booking.shipment_status,
        estimated_transit_days: booking.estimated_transit_days,
        real_transit_days: booking.real_transit_days,
        free_days: booking.free_days,
        remaining_free_days: booking.remaining_free_days,
        freight_terms: booking.freight_terms,
        release_type: booking.release_type,
        hbl_freight_visibility: booking.hbl_freight_visibility,
        printed_at_destination: booking.printed_at_destination,
        operational_comments: booking.operational_comments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('shipping_instruction_id', id)

    setSaving(false)

    if (error) {
      toast.error(error.message || 'No se pudo guardar el booking')
      return
    }

    await recordBookingActivity({
      action: booking.shipment_status === 'Booking Confirmado'
        ? 'booking_confirmed'
        : 'booking_child_updated',
      description: `Booking actualizado para ${routing?.routing_number || id}`,
      metadata: {
        shipment_status: booking.shipment_status,
      },
    })

    toast.success('Booking actualizado')
  }

  const addContainerRow = () => {
    setContainerRows([
      ...containerRows,
      {
        container_type: availableContainers[0]?.container_type || '',
        quantity: 1,
        notes: '',
      },
    ])
  }

  const updateContainerRow = (
    index: number,
    field: keyof BookingContainerRow,
    value: string
  ) => {
    setContainerRows((currentRows) =>
      currentRows.map((row, rowIndex) => {
        if (rowIndex !== index) return row

        return {
          ...row,
          [field]: field === 'quantity' ? (value ? Number(value) : '') : value,
        }
      })
    )
  }

  const removeContainerRow = (index: number) => {
    setContainerRows((currentRows) =>
      currentRows.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  const validateContainerRows = () => {
    const currentAllocations = containerRows
      .map((row) => ({
        container_type: row.container_type,
        quantity: Number(row.quantity || 0),
      }))
      .filter((row) => row.container_type.trim() && row.quantity > 0)
    const groupedCurrent = Object.values(groupContainers(currentAllocations))

    for (const allocation of groupedCurrent) {
      const totalQuoted = containerQuantityFor(availableContainers, allocation.container_type)
      const assignedElsewhere = containerQuantityFor(
        assignedInOtherBookings,
        allocation.container_type
      )
      const availableForThisBooking = Math.max(totalQuoted - assignedElsewhere, 0)

      if (totalQuoted <= 0) {
        toast.error(`El tipo ${allocation.container_type} no existe en la cotizacion/SI`)
        return false
      }

      if (allocation.quantity > availableForThisBooking) {
        toast.error(
          `No puedes asignar mas de ${availableForThisBooking} x ${allocation.container_type}`
        )
        return false
      }
    }

    return true
  }

  const saveBookingContainers = async () => {
    if (!booking) return
    if (!validateContainerRows()) return

    setSavingContainers(true)

    const rowsToInsert = containerRows
      .map((row) => ({
        container_type: row.container_type.trim(),
        quantity: Number(row.quantity || 0),
        notes: row.notes.trim() || null,
      }))
      .filter((row) => row.container_type && row.quantity > 0)

    const { error: replaceError } = await supabase.rpc('replace_booking_containers', {
      p_booking_id: booking.id,
      p_containers: rowsToInsert,
    })

    if (replaceError) {
      setSavingContainers(false)
      toast.error(replaceError.message || 'No se pudieron guardar los contenedores del booking')
      return
    }

    setSavingContainers(false)
    await recordBookingActivity({
      action: 'booking_containers_assigned',
      description: `Contenedores asignados para ${routing?.routing_number || id}`,
      metadata: {
        containers: rowsToInsert.map((row) => ({
          container_type: row.container_type,
          quantity: row.quantity,
        })),
        total_containers: rowsToInsert.reduce(
          (total, row) => total + Number(row.quantity || 0),
          0
        ),
      },
    })
    toast.success('Contenedores del booking guardados')
    await loadData()
  }

  const uploadBookingDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!booking) return

    const fileInput = event.currentTarget.elements.namedItem('documentFile') as HTMLInputElement | null
    const file = fileInput?.files?.[0]

    if (!file) {
      toast.error('Selecciona un archivo para subir')
      return
    }

    setUploadingDocument(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setUploadingDocument(false)
      toast.error('Sesión no válida. Vuelve a iniciar sesión.')
      return
    }

    const filePath = `${booking.id}/${Date.now()}-${sanitizeFileName(file.name)}`

    const { error: uploadError } = await supabase.storage
      .from(BOOKING_DOCUMENT_BUCKET)
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      setUploadingDocument(false)
      toast.error(uploadError.message || 'No se pudo subir el documento')
      return
    }

    const { error: insertError } = await supabase
      .from('booking_documents')
      .insert({
        booking_id: booking.id,
        document_type: documentType,
        file_name: file.name,
        file_url: filePath,
        notes: documentNotes.trim() || null,
        uploaded_by: user.id,
      })

    setUploadingDocument(false)

    if (insertError) {
      const { error: cleanupError } = await supabase.storage
        .from(BOOKING_DOCUMENT_BUCKET)
        .remove([filePath])

      if (cleanupError) {
      }

      toast.error(insertError.message || 'No se pudo registrar el documento')
      return
    }

    setDocumentType(bookingDocumentTypes[0])
    setDocumentNotes('')
    if (fileInput) fileInput.value = ''

    await recordBookingActivity({
      action: 'booking_document_uploaded',
      description: `Documento ${documentType} adjuntado al booking`,
      metadata: {
        document_type: documentType,
        file_name: file.name,
      },
    })

    toast.success('Documento adjuntado')
    await loadBookingDocuments(booking.id)
  }

  const downloadBookingDocument = async (document: BookingDocument) => {
    setDownloadingDocumentId(document.id)

    const { data, error } = await supabase.storage
      .from(BOOKING_DOCUMENT_BUCKET)
      .createSignedUrl(document.file_url, 60)

    setDownloadingDocumentId(null)

    if (error || !data?.signedUrl) {
      toast.error('No se pudo descargar el documento', {
        description: error?.message,
      })
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const deleteBookingDocument = async (document: BookingDocument) => {
    setDeletingDocumentId(document.id)

    const { error: removeError } = await supabase.storage
      .from(BOOKING_DOCUMENT_BUCKET)
      .remove([document.file_url])

    if (removeError) {
      toast.error('No se pudo eliminar el archivo del Storage', {
        description: 'Se intentara quitar el registro del booking.',
      })
    }

    const { error: deleteError } = await supabase
      .from('booking_documents')
      .delete()
      .eq('id', document.id)

    setDeletingDocumentId(null)
    setDocumentPendingDelete(null)

    if (deleteError) {
      toast.error('No se pudo eliminar el documento', {
        description: deleteError.message,
      })
      return
    }

    await recordBookingActivity({
      action: 'booking_document_deleted',
      description: `Documento ${document.document_type} eliminado del booking`,
      metadata: {
        document_type: document.document_type,
        file_name: document.file_name,
      },
    })

    toast.success('Documento eliminado')
    await loadBookingDocuments(document.booking_id)
  }

  if (loading) return <PageSkeleton cards={4} rows={4} />

  if (!routing) {
    return <p className="text-sm text-red-500">Shipping Instruction no encontrada.</p>
  }

  if (!booking) {
    return (
      <div>
        <p className="text-sm text-red-500">Booking no encontrado.</p>
        <button
          type="button"
          onClick={() => router.push(`/operations/shipping-instructions/${id}`)}
          className={`${secondaryButtonClass} mt-4`}
        >
          Volver a Shipping Instruction
        </button>
      </div>
    )
  }

  const quotation = resolveJoin(routing.quotation)
  const client = quotation ? resolveJoin(quotation.cliente) : null
  const normalizedTransport = `${quotation?.tipo_transporte || ''} ${quotation?.quote_type || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const houseDocumentLabel = normalizedTransport.includes('aereo')
    ? 'AWB'
    : normalizedTransport.includes('terrestre') || normalizedTransport.includes('ftl')
      ? 'Carta Porte'
      : 'HBL'
  const consigneeName = client?.nombre || ''
  const consigneeTaxId = client?.rtn || ''
  const consigneeAddress = clientAddress(client)
  const consigneeContact = client?.contacto || ''
  const consigneeEmail = client?.email_1 || ''
  const consigneePhone = client?.telefono || ''
  const shipperName = routing.supplier_name || ''
  const shipperContact = routing.supplier_contact || ''
  const shipperEmail = routing.supplier_email || ''
  const incotermReference = quotation?.incoterm || ''
  const selectedAgentTransit =
    selectedAgent?.transit_time || selectedAgent?.transit || quotation?.transit_time || ''
  const bookingTitle = booking.booking_number
    ? `Booking ${booking.booking_number}`
    : 'Nuevo Booking'
  const availableForThisBooking = Object.values(groupContainers(availableContainers))
    .map((container) => ({
      container_type: container.container_type,
      quantity: Math.max(
        container.quantity - containerQuantityFor(assignedInOtherBookings, container.container_type),
        0
      ),
    }))
    .filter((container) => container.quantity > 0)

  return (
    <div>
      {(() => {
        const isArrived = ['Arribado', 'Finalizado'].includes(booking.shipment_status || '')
        const issuedHBL = billsOfLading.find((bl) => bl.bl_type === 'HBL' && bl.status === 'Emitido')
        const arrivalNoticeData: ArrivalNoticeData = {
          si_number: routing.routing_number,
          booking_number: booking.booking_number,
          carrier_booking: booking.carrier_booking,
          master_bl: booking.master_bl,
          house_bl: issuedHBL?.bl_number || booking.house_bl,
          carrier: booking.carrier,
          vessel_name: booking.vessel_name,
          voyage: booking.voyage,
          etd: booking.etd,
          eta: booking.eta,
          actual_eta: booking.actual_eta,
          port_of_loading: quotation?.origen || null,
          port_of_discharge: quotation?.destino || null,
          free_days: booking.free_days,
          remaining_free_days: booking.remaining_free_days,
          freight_terms: booking.freight_terms,
          release_type: booking.release_type,
          consignee: consigneeName,
          consignee_address: consigneeAddress,
          consignee_tax_id: consigneeTaxId,
          consignee_contact: consigneeContact,
          consignee_email: consigneeEmail,
          consignee_phone: consigneePhone,
          description_of_goods: null,
          number_of_packages: null,
          package_type: null,
          gross_weight_kg: null,
          measurement_cbm: null,
          containers: containerRows
            .filter((c) => c.container_type)
            .map((c) => ({
              container_number: null,
              seal_number: null,
              container_type: c.container_type,
              quantity: typeof c.quantity === 'number' ? c.quantity : null,
            })),
          issued_by_name: profile ? `${profile.nombre || ''} ${profile.apellido || ''}`.trim() : null,
        }
        return (
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {bookingTitle}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Shipping Instruction {routing.routing_number}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isArrived && (
                <PDFDownloadLink
                  document={<ArrivalNoticePdf data={arrivalNoticeData} company={companyBranding} />}
                  fileName={`Aviso-Llegada-${booking.booking_number || bookingId}.pdf`}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {({ loading: pdfLoading }) => (
                    <>
                      <Download className="h-4 w-4" />
                      {pdfLoading ? 'Generando...' : 'Aviso de Llegada'}
                    </>
                  )}
                </PDFDownloadLink>
              )}
              <button
                type="button"
                onClick={() => router.push(`/operations/shipping-instructions/${id}`)}
                className={secondaryButtonClass}
              >
                Volver a SI
              </button>
            </div>
          </div>
        )
      })()}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Referencia Operativa">
            <Field label="Carrier / Naviera" readonlySource="referencia">
              <input value={booking.carrier || ''} readOnly className={readonlyFieldClass} />
            </Field>

            <Field label="Incoterm" readonlySource="cotizacion">
              <input value={incotermReference} readOnly className={readonlyFieldClass} />
            </Field>

            <Field label="Transit Time" readonlySource="cotizacion">
              <input value={selectedAgentTransit} readOnly className={readonlyFieldClass} />
            </Field>

            <Field label="Booking Number">
              <input
                value={booking.booking_number || ''}
                onChange={(e) => setBooking({ ...booking, booking_number: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Carrier Booking">
              <input
                value={booking.carrier_booking || ''}
                onChange={(e) => setBooking({ ...booking, carrier_booking: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Shipment Status">
              <select
                value={booking.shipment_status || 'Booking Solicitado'}
                onChange={(e) => setBooking({ ...booking, shipment_status: e.target.value })}
                className={fieldClass}
              >
                {bookingStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
          </SectionCard>

          <SectionCard title="Documentacion">
            <Field label="Master BL">
              <input
                value={booking.master_bl || ''}
                onChange={(e) => setBooking({ ...booking, master_bl: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="House BL">
              <input
                value={booking.house_bl || ''}
                onChange={(e) => setBooking({ ...booking, house_bl: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </SectionCard>
        </div>

        <SectionCard title="BL / Routing" gridClassName="md:grid-cols-2 lg:grid-cols-4">
          <Field label="Freight Terms">
            <select
              value={booking.freight_terms || ''}
              onChange={(e) => setBooking({ ...booking, freight_terms: e.target.value })}
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="Collect">Collect</option>
              <option value="Prepaid">Prepaid</option>
            </select>
          </Field>

          <Field label="Release Type">
            <select
              value={booking.release_type || ''}
              onChange={(e) => setBooking({ ...booking, release_type: e.target.value })}
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="Express Release">Express Release</option>
              <option value="Original BL">Original BL</option>
            </select>
          </Field>

          <Field label="HBL Freight Visibility">
            <select
              value={booking.hbl_freight_visibility || ''}
              onChange={(e) =>
                setBooking({ ...booking, hbl_freight_visibility: e.target.value })
              }
              className={fieldClass}
            >
              <option value="">Seleccionar</option>
              <option value="No Freight Charges">No mostrar flete</option>
              <option value="Show Freight Charges">Mostrar flete</option>
            </select>
          </Field>

          <div className="flex items-center gap-3 pt-6">
            <input
              id="printed-at-destination"
              type="checkbox"
              checked={booking.printed_at_destination || false}
              onChange={(e) =>
                setBooking({ ...booking, printed_at_destination: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            <label
              htmlFor="printed-at-destination"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Printed at Destination
            </label>
          </div>

          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Shipper
            </p>
          </div>

          <Field label="Shipper" readonlySource="shipping">
            <input value={shipperName} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Shipper Contact" readonlySource="shipping">
            <input value={shipperContact} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Shipper Email" readonlySource="shipping">
            <input value={shipperEmail} readOnly className={readonlyFieldClass} />
          </Field>

          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Consignee
            </p>
          </div>

          <Field label="Consignee" readonlySource="cotizacion">
            <input value={consigneeName} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Consignee Tax ID" readonlySource="cotizacion">
            <input value={consigneeTaxId} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Consignee Address" readonlySource="cotizacion">
            <input value={consigneeAddress} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Consignee Contact" readonlySource="cotizacion">
            <input value={consigneeContact} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Consignee Email" readonlySource="cotizacion">
            <input value={consigneeEmail} readOnly className={readonlyFieldClass} />
          </Field>

          <Field label="Consignee Phone" readonlySource="cotizacion">
            <input value={consigneePhone} readOnly className={readonlyFieldClass} />
          </Field>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Navegacion / Transito">
            <Field label="Carrier">
              <input
                value={booking.carrier || ''}
                onChange={(e) => setBooking({ ...booking, carrier: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Vessel Name">
              <input
                value={booking.vessel_name || ''}
                onChange={(e) => setBooking({ ...booking, vessel_name: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Voyage">
              <input
                value={booking.voyage || ''}
                onChange={(e) => setBooking({ ...booking, voyage: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Estimated Transit Days">
              <input
                type="number"
                value={booking.estimated_transit_days ?? ''}
                onChange={(e) =>
                  setBooking({
                    ...booking,
                    estimated_transit_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>

            <Field label="Real Transit Days">
              <input
                type="number"
                value={booking.real_transit_days ?? ''}
                onChange={(e) =>
                  setBooking({
                    ...booking,
                    real_transit_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Fechas Operativas">
            <Field label="ETD">
              <input
                type="date"
                value={booking.etd || ''}
                onChange={(e) => setBooking({ ...booking, etd: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="ETA">
              <input
                type="date"
                value={booking.eta || ''}
                onChange={(e) => setBooking({ ...booking, eta: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Original ETA">
              <input
                type="date"
                value={booking.original_eta || ''}
                onChange={(e) => setBooking({ ...booking, original_eta: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Actual ETD">
              <input
                type="date"
                value={booking.actual_etd || ''}
                onChange={(e) => setBooking({ ...booking, actual_etd: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Actual ETA">
              <input
                type="date"
                value={booking.actual_eta || ''}
                onChange={(e) => setBooking({ ...booking, actual_eta: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </SectionCard>
        </div>

        <section className={cardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Contenedores asignados a este booking
              </h2>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total cotizado
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {formatContainerSummary(availableContainers)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Asignado en otros bookings
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {formatContainerSummary(assignedInOtherBookings)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Disponible para este booking
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {formatContainerSummary(availableForThisBooking)}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={addContainerRow}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              Agregar contenedor
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Tipo de contenedor</th>
                  <th className="pr-4">Cantidad</th>
                  <th className="pr-4">Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {containerRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border-t border-slate-100 py-6 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
                    >
                      Sin contenedores asignados.
                    </td>
                  </tr>
                ) : (
                  containerRows.map((row, index) => (
                    <tr
                      key={row.id || index}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-3 pr-4">
                        <select
                          value={row.container_type}
                          onChange={(e) =>
                            updateContainerRow(index, 'container_type', e.target.value)
                          }
                          className={fieldClass}
                        >
                          <option value="">Seleccionar</option>
                          {availableContainers.map((container) => (
                            <option
                              key={container.container_type}
                              value={container.container_type}
                            >
                              {container.container_type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-4">
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) =>
                            updateContainerRow(index, 'quantity', e.target.value)
                          }
                          className={`${fieldClass} w-28`}
                        />
                      </td>
                      <td className="pr-4">
                        <input
                          value={row.notes}
                          onChange={(e) => updateContainerRow(index, 'notes', e.target.value)}
                          className={fieldClass}
                        />
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => removeContainerRow(index)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={saveBookingContainers}
              disabled={savingContainers}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingContainers ? 'Guardando...' : 'Guardar contenedores'}
            </button>
          </div>
        </section>

        <section className={cardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Documentos
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Bucket esperado en Supabase Storage: {BOOKING_DOCUMENT_BUCKET}
              </p>
            </div>
          </div>

          <form
            onSubmit={uploadBookingDocument}
            className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70 md:grid-cols-2 lg:grid-cols-4"
          >
            <Field label="Tipo">
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                className={fieldClass}
              >
                {bookingDocumentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Archivo">
              <input
                name="documentFile"
                type="file"
                className={fieldClass}
              />
            </Field>

            <Field label="Notas">
              <input
                value={documentNotes}
                onChange={(event) => setDocumentNotes(event.target.value)}
                className={fieldClass}
                placeholder="Opcional"
              />
            </Field>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={uploadingDocument}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {uploadingDocument ? 'Subiendo...' : 'Subir documento'}
              </button>
            </div>
          </form>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Tipo</th>
                  <th className="pr-4">Archivo</th>
                  <th className="pr-4">Fecha</th>
                  <th className="pr-4">Usuario</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {bookingDocuments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="border-t border-slate-100 py-6 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
                    >
                      Sin documentos adjuntos.
                    </td>
                  </tr>
                ) : (
                  bookingDocuments.map((document) => (
                    <tr
                      key={document.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                        {document.document_type}
                      </td>
                      <td className="pr-4">
                        <div className="flex min-w-64 items-start gap-2 text-slate-700 dark:text-slate-200">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <div>
                            <p className="break-all">{document.file_name}</p>
                            {document.notes && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {document.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-300">
                        {formatDisplayDate(document.created_at)}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-300">
                        {document.uploaded_by
                          ? documentUserNames[document.uploaded_by] || 'N/A'
                          : 'N/A'}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => downloadBookingDocument(document)}
                            disabled={downloadingDocumentId === document.id}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Descargar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDocumentPendingDelete(document)}
                            disabled={deletingDocumentId === document.id}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Tracking y Control">
            <Field label="Tracking URL">
              <input
                value={booking.tracking_url || ''}
                onChange={(e) => setBooking({ ...booking, tracking_url: e.target.value })}
                className={fieldClass}
              />
            </Field>

            <Field label="Free Days">
              <input
                type="number"
                value={booking.free_days ?? ''}
                onChange={(e) =>
                  setBooking({
                    ...booking,
                    free_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>

            <Field label="Remaining Free Days">
              <input
                type="number"
                value={booking.remaining_free_days ?? ''}
                onChange={(e) =>
                  setBooking({
                    ...booking,
                    remaining_free_days: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={fieldClass}
              />
            </Field>
          </SectionCard>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Comentarios Operativos
            </h2>
            <textarea
              rows={6}
              value={booking.operational_comments || ''}
              onChange={(e) =>
                setBooking({ ...booking, operational_comments: e.target.value })
              }
              className={`${fieldClass} mt-5 min-h-36`}
            />
          </section>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={saveBooking}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Booking'}
        </button>
      </div>

      {/* Bills of Lading */}
      <section className={`${cardClass} mt-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Bills of Lading
          </h2>
          {booking.booking_number && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/new?type=MBL`
                )
              }
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Crear MBL
            </button>
          )}
        </div>

        {loadingBLs ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : billsOfLading.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {booking.booking_number
              ? 'No hay BLs registrados. Crea el MBL para iniciar el proceso.'
              : 'Confirma el Booking Number antes de crear el MBL.'}
          </p>
        ) : (
          <div className="space-y-3">
            {billsOfLading
              .filter((bl) => bl.bl_type === 'MBL')
              .map((mbl) => {
                const hbls = billsOfLading.filter(
                  (bl) => bl.bl_type === 'HBL' && bl.parent_bl_id === mbl.id
                )
                return (
                  <div
                    key={mbl.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          MBL
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {mbl.bl_number || 'Sin número'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {mbl.carrier || '—'} · {mbl.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {mbl.status === 'MBL Validado' && (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/new?type=HBL&parentBlId=${mbl.id}`
                              )
                            }
                            className="rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          >
                            + Crear {houseDocumentLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/${mbl.id}`
                            )
                          }
                          className={secondaryButtonClass}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>

                    {hbls.length > 0 && (
                      <div className="border-t border-slate-100 dark:border-slate-800">
                        {hbls.map((hbl) => (
                          <div
                            key={hbl.id}
                            className="flex items-center justify-between px-4 py-3 pl-10"
                          >
                            <div className="flex items-center gap-3">
                              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                HBL
                              </span>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {hbl.bl_number || 'Sin número'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {hbl.status} · {hbl.release_type || '—'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/${hbl.id}`
                                )
                              }
                              className={secondaryButtonClass}
                            >
                              Abrir
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(documentPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingDocumentId) {
            setDocumentPendingDelete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que deseas eliminar este documento? Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {documentPendingDelete && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Archivo
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">
                  {documentPendingDelete.file_name}
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDocumentPendingDelete(null)}
                  disabled={Boolean(deletingDocumentId)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => deleteBookingDocument(documentPendingDelete)}
                  disabled={Boolean(deletingDocumentId)}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingDocumentId
                    ? 'Eliminando...'
                    : 'Eliminar documento'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
