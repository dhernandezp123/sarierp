'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Clock, Download, FileText, History, Mail, Plus, Printer, Send, Trash2, Upload, X } from 'lucide-react'
import { PDFDownloadLink, pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { buildTenantStoragePath, isTenantResourceStoragePath } from '@/src/lib/storage-paths'
import { createActivityLog } from '@/src/lib/activity-logger'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import HouseBLPdf, { type HBLData } from '@/src/components/pdf/house-bl-pdf'
import AWBPdf, { type AWBData } from '@/src/components/pdf/awb-pdf'
import CartaPortePdf, { type CartaPorteData } from '@/src/components/pdf/carta-porte-pdf'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { BLValidationPanel } from '@/src/components/operations/BLValidationPanel'
import {
  buildQuotationCargoDefaults,
  getBlConsistencyWarnings,
  getBlReadiness,
  inheritParentMblData,
  isBlValidationExceptionMatch,
  type BlConsistencyField,
  type BlConsistencyWarning,
  type BlValidationException,
  type BlValidationSources,
} from '@/src/lib/bl-document-workflow'
import {
  type CompanyBranding,
  getCompanyTradeName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import { loadCurrentCompanySettings } from '@/src/lib/company-settings'

const BOOKING_DOCUMENTS_BUCKET = 'booking-documents'
const BOOKING_DOCUMENTS_STORAGE_MARKERS = [
  `/storage/v1/object/public/${BOOKING_DOCUMENTS_BUCKET}/`,
  `/storage/v1/object/sign/${BOOKING_DOCUMENTS_BUCKET}/`,
  `/storage/v1/object/authenticated/${BOOKING_DOCUMENTS_BUCKET}/`,
]

type BLForm = {
  bl_type: 'MBL' | 'HBL'
  parent_bl_id: string | null
  bl_number: string
  status: string
  release_type: string
  originals_count: number
  copies_count: number
  freight_terms: string
  hbl_freight_visibility: string
  bl_date: string
  issue_date: string
  release_date: string
  shipper: string
  shipper_address: string
  consignee: string
  consignee_address: string
  consignee_tax_id: string
  consignee_contact: string
  consignee_email: string
  notify_party: string
  notify_party_address: string
  notify_party_tax_id: string
  notify_party_contact: string
  notify_party_email: string
  place_of_receipt: string
  port_of_loading: string
  port_of_discharge: string
  place_of_delivery: string
  carrier: string
  vessel_name: string
  voyage: string
  etd: string
  eta: string
  description_of_goods: string
  marks_and_numbers: string
  number_of_packages: string
  package_type: string
  gross_weight_kg: string
  measurement_cbm: string
  special_instructions: string
  printed_at_destination: boolean
  draft_file_url: string
  draft_file_name: string
  placa_camion: string
  nombre_operador: string
}

const defaultForm: BLForm = {
  bl_type: 'MBL',
  parent_bl_id: null,
  bl_number: '',
  status: 'MBL Draft',
  release_type: '',
  originals_count: 3,
  copies_count: 3,
  freight_terms: 'Prepaid',
  hbl_freight_visibility: 'No Freight Charges',
  bl_date: '',
  issue_date: '',
  release_date: '',
  shipper: '',
  shipper_address: '',
  consignee: '',
  consignee_address: '',
  consignee_tax_id: '',
  consignee_contact: '',
  consignee_email: '',
  notify_party: '',
  notify_party_address: '',
  notify_party_tax_id: '',
  notify_party_contact: '',
  notify_party_email: '',
  place_of_receipt: '',
  port_of_loading: '',
  port_of_discharge: '',
  place_of_delivery: '',
  carrier: '',
  vessel_name: '',
  voyage: '',
  etd: '',
  eta: '',
  description_of_goods: '',
  marks_and_numbers: '',
  number_of_packages: '',
  package_type: '',
  gross_weight_kg: '',
  measurement_cbm: '',
  special_instructions: '',
  printed_at_destination: true,
  draft_file_url: '',
  draft_file_name: '',
  placa_camion: '',
  nombre_operador: '',
}

const TRACKED_FIELDS: (keyof BLForm)[] = [
  'bl_number', 'release_type', 'freight_terms', 'bl_date',
  'carrier', 'vessel_name', 'voyage', 'etd', 'eta',
  'consignee', 'consignee_address', 'consignee_email',
  'shipper', 'notify_party', 'port_of_loading', 'port_of_discharge',
  'description_of_goods', 'gross_weight_kg', 'measurement_cbm',
  'special_instructions',
]

const STATUS_FLOW: Record<string, { next: string; label: string; color: string } | null> = {
  'MBL Draft': { next: 'MBL Validado', label: 'Validar MBL', color: 'bg-emerald-600 hover:bg-emerald-700' },
  'MBL Validado': null,
  'HBL Draft': { next: 'Pendiente Aprobación Cliente', label: 'Enviar al Cliente', color: 'bg-violet-600 hover:bg-violet-700' },
  'Pendiente Aprobación Cliente': { next: 'Aprobado por Cliente', label: 'Registrar Aprobación', color: 'bg-blue-600 hover:bg-blue-700' },
  'Aprobado por Cliente': { next: 'Emitido', label: 'Emitir HBL', color: 'bg-emerald-600 hover:bg-emerald-700' },
  'Emitido': { next: 'Liberado', label: 'Registrar Liberación', color: 'bg-slate-700 hover:bg-slate-800' },
  'Liberado': null,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  )
}

function SectionCard({ title, children, cols = 2 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <section className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className={`grid gap-4 md:grid-cols-${cols}`}>{children}</div>
    </section>
  )
}

type BLContainer = {
  id?: string
  container_number: string
  seal_number: string
  container_type: string
  quantity: number | ''
  gross_weight_kg: string
  measurement_cbm: string
  notes: string
}

type Amendment = {
  id: string
  amendment_number: number
  notes: string | null
  changed_fields: Record<string, string> | null
  status_before: string | null
  status_after: string | null
  created_at: string
}

type DraftSend = {
  id: string
  sent_to: string
  sent_at: string
  notes: string | null
}

type DocumentContext = {
  routingNumber: string
  bookingNumber: string
}

type ExceptionAction =
  | { kind: 'justify'; warning: BlConsistencyWarning }
  | { kind: 'revoke'; exception: BlValidationException }

function formToHBLData(
  form: BLForm,
  condiciones: string | null,
  containers: BLContainer[]
): HBLData {
  return {
    status: form.status || null,
    bl_number: form.bl_number || null,
    bl_date: form.bl_date || null,
    release_type: form.release_type || null,
    originals_count: form.originals_count,
    copies_count: form.copies_count,
    freight_terms: form.freight_terms || null,
    hbl_freight_visibility: form.hbl_freight_visibility || null,
    issue_date: form.issue_date || null,
    shipper: form.shipper || null,
    shipper_address: form.shipper_address || null,
    consignee: form.consignee || null,
    consignee_address: form.consignee_address || null,
    consignee_tax_id: form.consignee_tax_id || null,
    consignee_contact: form.consignee_contact || null,
    consignee_email: form.consignee_email || null,
    notify_party: form.notify_party || null,
    notify_party_address: form.notify_party_address || null,
    notify_party_tax_id: form.notify_party_tax_id || null,
    notify_party_contact: form.notify_party_contact || null,
    notify_party_email: form.notify_party_email || null,
    place_of_receipt: form.place_of_receipt || null,
    port_of_loading: form.port_of_loading || null,
    port_of_discharge: form.port_of_discharge || null,
    place_of_delivery: form.place_of_delivery || null,
    carrier: form.carrier || null,
    vessel_name: form.vessel_name || null,
    voyage: form.voyage || null,
    etd: form.etd || null,
    eta: form.eta || null,
    description_of_goods: form.description_of_goods || null,
    marks_and_numbers: form.marks_and_numbers || null,
    number_of_packages: form.number_of_packages ? Number(form.number_of_packages) : null,
    package_type: form.package_type || null,
    gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
    measurement_cbm: form.measurement_cbm ? Number(form.measurement_cbm) : null,
    special_instructions: form.special_instructions || null,
    printed_at_destination: form.printed_at_destination,
    condiciones,
    containers: containers.map((container) => ({
      container_number: container.container_number || null,
      seal_number: container.seal_number || null,
      container_type: container.container_type || null,
      quantity: container.quantity === '' ? null : Number(container.quantity),
      gross_weight_kg: container.gross_weight_kg ? Number(container.gross_weight_kg) : null,
      measurement_cbm: container.measurement_cbm ? Number(container.measurement_cbm) : null,
      notes: container.notes || null,
    })),
  }
}

function formToAWBData(form: BLForm, condiciones: string | null): AWBData {
  return {
    awb_number: form.bl_number || null,
    awb_date: form.bl_date || null,
    issue_date: form.issue_date || null,
    shipper: form.shipper || null,
    shipper_address: form.shipper_address || null,
    consignee: form.consignee || null,
    consignee_address: form.consignee_address || null,
    consignee_tax_id: form.consignee_tax_id || null,
    consignee_contact: form.consignee_contact || null,
    consignee_email: form.consignee_email || null,
    notify_party: form.notify_party || null,
    notify_party_address: form.notify_party_address || null,
    airport_of_departure: form.port_of_loading || null,
    airport_of_destination: form.port_of_discharge || null,
    place_of_delivery: form.place_of_delivery || null,
    airline: form.carrier || null,
    flight_number: form.voyage || null,
    etd: form.etd || null,
    eta: form.eta || null,
    description_of_goods: form.description_of_goods || null,
    marks_and_numbers: form.marks_and_numbers || null,
    number_of_packages: form.number_of_packages ? Number(form.number_of_packages) : null,
    package_type: form.package_type || null,
    gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
    measurement_cbm: form.measurement_cbm ? Number(form.measurement_cbm) : null,
    special_instructions: form.special_instructions || null,
    condiciones,
  }
}

function formToCartaPorteData(form: BLForm, condiciones: string | null): CartaPorteData {
  return {
    numero: form.bl_number || null,
    fecha: form.bl_date || null,
    issue_date: form.issue_date || null,
    shipper: form.shipper || null,
    shipper_address: form.shipper_address || null,
    consignee: form.consignee || null,
    consignee_address: form.consignee_address || null,
    consignee_tax_id: form.consignee_tax_id || null,
    consignee_contact: form.consignee_contact || null,
    consignee_email: form.consignee_email || null,
    origin: form.port_of_loading || form.place_of_receipt || null,
    destination: form.port_of_discharge || null,
    place_of_delivery: form.place_of_delivery || null,
    carrier: form.carrier || null,
    placa_camion: form.placa_camion || null,
    nombre_operador: form.nombre_operador || null,
    description_of_goods: form.description_of_goods || null,
    marks_and_numbers: form.marks_and_numbers || null,
    number_of_packages: form.number_of_packages ? Number(form.number_of_packages) : null,
    package_type: form.package_type || null,
    gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
    measurement_cbm: form.measurement_cbm ? Number(form.measurement_cbm) : null,
    special_instructions: form.special_instructions || null,
    condiciones,
  }
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}

function normalizeBookingDocumentPath(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return ''

  const storageMarker = BOOKING_DOCUMENTS_STORAGE_MARKERS.find((marker) =>
    trimmedValue.includes(marker)
  )

  if (storageMarker) {
    const encodedPath = (trimmedValue.split(storageMarker)[1] || '').split(/[?#]/, 1)[0]

    try {
      return decodeURIComponent(encodedPath)
    } catch {
      return ''
    }
  }

  if (/^https?:\/\//i.test(trimmedValue)) return ''

  return trimmedValue.replace(/^\/+/, '')
}

function statusBadgeClass(status: string) {
  if (status === 'MBL Draft' || status === 'HBL Draft') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (status === 'MBL Validado') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'Pendiente Aprobación Cliente') return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
  if (status === 'Aprobado por Cliente') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  if (status === 'Emitido') return 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
  if (status === 'Liberado') return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export default function BLPage() {
  const params = useParams<{ id: string; bookingId: string; blId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, profile } = useUser()

  const { id, bookingId, blId } = params
  const isNew = blId === 'new'
  const typeParam = (searchParams.get('type') as 'MBL' | 'HBL') || 'MBL'
  const parentBlIdParam = searchParams.get('parentBlId') || null

  const [form, setForm] = useState<BLForm>({ ...defaultForm, bl_type: typeParam, parent_bl_id: parentBlIdParam, status: typeParam === 'HBL' ? 'HBL Draft' : 'MBL Draft' })
  const [tipoTransporte, setTipoTransporte] = useState<string>('')
  const [condicionesBL, setCondicionesBL] = useState<string | null>(null)
  const [condicionesAWB, setCondicionesAWB] = useState<string | null>(null)
  const [condicionesCP, setCondicionesCP] = useState<string | null>(null)
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [uploadingDraft, setUploadingDraft] = useState(false)
  const [openingDraft, setOpeningDraft] = useState(false)
  const [printingDraft, setPrintingDraft] = useState(false)
  const [containers, setContainers] = useState<BLContainer[]>([])
  const [savingContainers, setSavingContainers] = useState(false)
  const [containerPendingRemoval, setContainerPendingRemoval] = useState<{
    index: number
    label: string
    persisted: boolean
  } | null>(null)
  const [amendments, setAmendments] = useState<Amendment[]>([])
  const [draftSends, setDraftSends] = useState<DraftSend[]>([])
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [amendmentNote, setAmendmentNote] = useState('')
  const [sendingDraft, setSendingDraft] = useState(false)
  const [bookingUpdatedAt, setBookingUpdatedAt] = useState<string | null>(null)
  const [documentUpdatedAt, setDocumentUpdatedAt] = useState<string | null>(null)
  const [documentContext, setDocumentContext] = useState<DocumentContext>({
    routingNumber: '',
    bookingNumber: '',
  })
  const [validationSources, setValidationSources] = useState<BlValidationSources>({
    operational: {},
    commercial: {},
  })
  const [validationExceptions, setValidationExceptions] = useState<BlValidationException[]>([])
  const [exceptionAction, setExceptionAction] = useState<ExceptionAction | null>(null)
  const [exceptionReason, setExceptionReason] = useState('')
  const [savingException, setSavingException] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savedFormRef = useRef<BLForm | null>(null)

  const set = (field: keyof BLForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const syncBookingBlCache = async (
    changes: { master_bl?: string; house_bl?: string }
  ) => {
    let expectedUpdatedAt = bookingUpdatedAt

    if (!expectedUpdatedAt) {
      const { data: currentBooking, error: bookingVersionError } = await supabase
        .from('bookings')
        .select('updated_at')
        .eq('id', bookingId)
        .eq('shipping_instruction_id', id)
        .single()

      if (bookingVersionError || !currentBooking?.updated_at) return false
      expectedUpdatedAt = currentBooking.updated_at
    }

    const { data, error } = await supabase.rpc('update_booking_canonical', {
      p_booking_id: bookingId,
      p_shipping_instruction_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_changes: changes,
    })

    if (error) {
      return false
    }

    const updatedBooking = Array.isArray(data) ? data[0] : data
    if (!updatedBooking?.updated_at) return false

    setBookingUpdatedAt(updatedBooking.updated_at)
    return true
  }

  const loadData = async () => {
    setLoading(true)

    // Load booking + SI for pre-fill
    const [
      { data: bookingData, error: bookingError },
      { data: settingsData },
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id, booking_number, carrier_booking, carrier, vessel_name, voyage, etd, eta, freight_terms, release_type,
          hbl_freight_visibility, printed_at_destination, updated_at,
          shipping_instruction:shipping_instructions!bookings_shipping_instruction_id_fkey (
            id, routing_number, supplier_name, supplier_contact, supplier_email, supplier_address,
            origin_address, destination_address, special_instructions,
            shipper, consignee, consignee_tax_id, consignee_address, consignee_contact, consignee_email,
            notify_party, notify_party_tax_id, notify_party_address, notify_party_contact, notify_party_email,
            quotation:quotations (
              id, incoterm, puerto_origen, puerto_destino, tipo_transporte, service_product, quote_type,
              commodity, package_details, peso_kg, gross_weight, volumen_cbm, cantidad_bultos, package_type,
              cliente:clientes (nombre, direccion, ciudad, pais, rtn, contacto, email_1)
            )
          )
        `)
        .eq('id', bookingId)
        .single(),
      loadCurrentCompanySettings(supabase),
    ])

    if (bookingError || !bookingData) {
      toast.error(bookingError?.message || 'Booking no encontrado')
      setLoading(false)
      return
    }

    if (settingsData) {
      setCompanyBranding(normalizeCompanyBranding(settingsData))
      setCondicionesBL(settingsData.condiciones_bl ?? null)
      setCondicionesAWB(settingsData.condiciones_awb ?? null)
      setCondicionesCP(settingsData.condiciones_carta_porte ?? null)
    }

    setBookingUpdatedAt(bookingData.updated_at)

    // Extract tipo_transporte from quotation
    const siForType = Array.isArray(bookingData?.shipping_instruction) ? bookingData.shipping_instruction[0] : bookingData?.shipping_instruction
    const quotationForType = Array.isArray(siForType?.quotation) ? siForType.quotation[0] : siForType?.quotation
    const clientForValidation = Array.isArray(quotationForType?.cliente) ? quotationForType.cliente[0] : quotationForType?.cliente
    const quotationId = quotationForType?.id || null
    const { data: cargoLines } = quotationId
      ? await supabase
          .from('quotation_cargo_lines')
          .select('quantity, package_type, weight_lbs, cbm')
          .eq('quotation_id', quotationId)
          .order('created_at', { ascending: true })
      : { data: [] }
    const cargoDefaults = buildQuotationCargoDefaults(quotationForType, cargoLines || [])
    const baseValidationSources: BlValidationSources = {
      operational: {
        carrier: bookingData.carrier,
        vessel_name: bookingData.vessel_name,
        voyage: bookingData.voyage,
        etd: bookingData.etd?.split('T')[0] || null,
        eta: bookingData.eta?.split('T')[0] || null,
        port_of_loading: quotationForType?.puerto_origen || siForType?.origin_address || null,
        port_of_discharge: quotationForType?.puerto_destino || siForType?.destination_address || null,
        description_of_goods: cargoDefaults.description_of_goods || null,
        number_of_packages: cargoDefaults.number_of_packages || null,
        package_type: cargoDefaults.package_type || null,
        gross_weight_kg: cargoDefaults.gross_weight_kg || null,
        measurement_cbm: cargoDefaults.measurement_cbm || null,
        freight_terms: bookingData.freight_terms,
        release_type: bookingData.release_type,
      },
      commercial: {
        shipper: siForType?.shipper || siForType?.supplier_name || null,
        shipper_address: siForType?.supplier_address || null,
        consignee: siForType?.consignee || clientForValidation?.nombre || null,
        consignee_address:
          siForType?.consignee_address ||
          [clientForValidation?.direccion, clientForValidation?.ciudad, clientForValidation?.pais]
            .filter(Boolean)
            .join(', ') ||
          null,
        notify_party: siForType?.notify_party || null,
        notify_party_address: siForType?.notify_party_address || null,
      },
    }
    setValidationSources(baseValidationSources)
    setTipoTransporte(quotationForType?.tipo_transporte ?? '')
    setDocumentContext({
      routingNumber: siForType?.routing_number || '',
      bookingNumber: bookingData.booking_number || bookingData.carrier_booking || '',
    })

    if (!isNew) {
      // Load existing BL
      const { data: blData, error: blError } = await supabase
        .from('bills_of_lading')
        .select('*')
        .eq('id', blId)
        .single()

      if (blError || !blData) {
        toast.error('BL no encontrado')
        setLoading(false)
        return
      }

      // Load containers
      const { data: containerData } = await supabase
        .from('bl_containers')
        .select('*')
        .eq('bl_id', blId)
        .order('created_at', { ascending: true })

      setContainers(
        (containerData || []).map((c) => ({
          id: c.id,
          container_number: c.container_number || '',
          seal_number: c.seal_number || '',
          container_type: c.container_type || '',
          quantity: Number(c.quantity || 1),
          gross_weight_kg: c.gross_weight_kg ? String(c.gross_weight_kg) : '',
          measurement_cbm: c.measurement_cbm ? String(c.measurement_cbm) : '',
          notes: c.notes || '',
        }))
      )

      const loadedForm: BLForm = {
        bl_type: blData.bl_type as 'MBL' | 'HBL',
        parent_bl_id: blData.parent_bl_id || null,
        bl_number: blData.bl_number || '',
        status: blData.status || '',
        release_type: blData.release_type || '',
        originals_count: blData.originals_count ?? 3,
        copies_count: blData.copies_count ?? 3,
        freight_terms: blData.freight_terms || 'Prepaid',
        hbl_freight_visibility: blData.hbl_freight_visibility || 'No Freight Charges',
        bl_date: blData.bl_date || '',
        issue_date: blData.issue_date || '',
        release_date: blData.release_date || '',
        shipper: blData.shipper || '',
        shipper_address: blData.shipper_address || '',
        consignee: blData.consignee || '',
        consignee_address: blData.consignee_address || '',
        consignee_tax_id: blData.consignee_tax_id || '',
        consignee_contact: blData.consignee_contact || '',
        consignee_email: blData.consignee_email || '',
        notify_party: blData.notify_party || '',
        notify_party_address: blData.notify_party_address || '',
        notify_party_tax_id: blData.notify_party_tax_id || '',
        notify_party_contact: blData.notify_party_contact || '',
        notify_party_email: blData.notify_party_email || '',
        place_of_receipt: blData.place_of_receipt || '',
        port_of_loading: blData.port_of_loading || '',
        port_of_discharge: blData.port_of_discharge || '',
        place_of_delivery: blData.place_of_delivery || '',
        carrier: blData.carrier || '',
        vessel_name: blData.vessel_name || '',
        voyage: blData.voyage || '',
        etd: blData.etd || '',
        eta: blData.eta || '',
        description_of_goods: blData.description_of_goods || '',
        marks_and_numbers: blData.marks_and_numbers || '',
        number_of_packages: blData.number_of_packages ? String(blData.number_of_packages) : '',
        package_type: blData.package_type || '',
        gross_weight_kg: blData.gross_weight_kg ? String(blData.gross_weight_kg) : '',
        measurement_cbm: blData.measurement_cbm ? String(blData.measurement_cbm) : '',
        special_instructions: blData.special_instructions || '',
        printed_at_destination: blData.printed_at_destination ?? true,
        draft_file_url: normalizeBookingDocumentPath(blData.draft_file_url || ''),
        draft_file_name: blData.draft_file_name || '',
        placa_camion: blData.placa_camion || '',
        nombre_operador: blData.nombre_operador || '',
      }
      setForm(loadedForm)
      savedFormRef.current = loadedForm
      setDocumentUpdatedAt(blData.updated_at || null)

      if (loadedForm.bl_type === 'HBL' && loadedForm.parent_bl_id) {
        const { data: parentBL } = await supabase
          .from('bills_of_lading')
          .select('*')
          .eq('id', loadedForm.parent_bl_id)
          .eq('booking_id', bookingId)
          .eq('bl_type', 'MBL')
          .maybeSingle()

        setValidationSources({
          ...baseValidationSources,
          parentMbl: parentBL
            ? {
                ...parentBL,
                number_of_packages: parentBL.number_of_packages ? String(parentBL.number_of_packages) : null,
                gross_weight_kg: parentBL.gross_weight_kg ? String(parentBL.gross_weight_kg) : null,
                measurement_cbm: parentBL.measurement_cbm ? String(parentBL.measurement_cbm) : null,
              }
            : null,
        })
      } else {
        setValidationSources(baseValidationSources)
      }

      // Load amendment history
      const [{ data: amendData }, { data: sendData }, { data: exceptionData }] = await Promise.all([
        supabase.from('bl_amendments').select('*').eq('bl_id', blId).order('amendment_number', { ascending: true }),
        supabase.from('bl_draft_sends').select('*').eq('bl_id', blId).order('sent_at', { ascending: false }),
        supabase.from('bl_validation_exceptions').select('*').eq('bl_id', blId).order('created_at', { ascending: false }),
      ])
      setAmendments((amendData || []) as Amendment[])
      setDraftSends((sendData || []) as DraftSend[])
      setValidationExceptions((exceptionData || []) as BlValidationException[])

      setLoading(false)
      return
    }

    // New BL — pre-fill from booking and SI
    const booking = bookingData
    const si = Array.isArray(booking?.shipping_instruction) ? booking.shipping_instruction[0] : booking?.shipping_instruction
    const quotation = Array.isArray(si?.quotation) ? si.quotation[0] : si?.quotation
    const client = Array.isArray(quotation?.cliente) ? quotation.cliente[0] : quotation?.cliente
    const prefilled: Partial<BLForm> = {
      carrier: booking?.carrier || '',
      vessel_name: booking?.vessel_name || '',
      voyage: booking?.voyage || '',
      etd: booking?.etd?.split('T')[0] || '',
      eta: booking?.eta?.split('T')[0] || '',
      freight_terms: (booking?.freight_terms as string) || 'Prepaid',
      release_type: (booking?.release_type as string) || '',
      hbl_freight_visibility: booking?.hbl_freight_visibility || 'No Freight Charges',
      printed_at_destination: booking?.printed_at_destination ?? true,
      shipper: si?.shipper || si?.supplier_name || '',
      shipper_address: si?.supplier_address || '',
      consignee: si?.consignee || client?.nombre || '',
      consignee_address: si?.consignee_address || [client?.direccion, client?.ciudad, client?.pais].filter(Boolean).join(', '),
      consignee_tax_id: si?.consignee_tax_id || client?.rtn || '',
      consignee_contact: si?.consignee_contact || client?.contacto || '',
      consignee_email: si?.consignee_email || client?.email_1 || '',
      notify_party: si?.notify_party || '',
      notify_party_address: si?.notify_party_address || '',
      notify_party_tax_id: si?.notify_party_tax_id || '',
      notify_party_contact: si?.notify_party_contact || '',
      notify_party_email: si?.notify_party_email || '',
      port_of_loading: (quotation?.puerto_origen as string) || si?.origin_address || '',
      port_of_discharge: (quotation?.puerto_destino as string) || si?.destination_address || '',
      special_instructions: si?.special_instructions || '',
      ...cargoDefaults,
    }

    if (typeParam === 'HBL' && parentBlIdParam) {
      // Pre-fill from parent MBL
      const { data: parentBL } = await supabase
        .from('bills_of_lading')
        .select('*')
        .eq('id', parentBlIdParam)
        .single()

      if (parentBL) {
        Object.assign(prefilled, inheritParentMblData(prefilled, {
          ...parentBL,
          number_of_packages: parentBL.number_of_packages ? String(parentBL.number_of_packages) : '',
          gross_weight_kg: parentBL.gross_weight_kg ? String(parentBL.gross_weight_kg) : '',
          measurement_cbm: parentBL.measurement_cbm ? String(parentBL.measurement_cbm) : '',
        }))
        setValidationSources({
          ...baseValidationSources,
          parentMbl: {
            ...parentBL,
            number_of_packages: parentBL.number_of_packages ? String(parentBL.number_of_packages) : null,
            gross_weight_kg: parentBL.gross_weight_kg ? String(parentBL.gross_weight_kg) : null,
            measurement_cbm: parentBL.measurement_cbm ? String(parentBL.measurement_cbm) : null,
          },
        })
      }
    } else {
      setValidationSources(baseValidationSources)
    }

    setForm((prev) => ({ ...prev, ...prefilled }))
    setLoading(false)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timeout)
    // loadData se reinicia cuando cambia la identidad canónica de la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, bookingId, blId])

  const saveBL = async () => {
    if (!isNew && form.bl_type === 'HBL' && ['Emitido', 'Liberado'].includes(form.status)) {
      toast.error('El HBL emitido está protegido y ya no admite cambios.')
      return
    }

    setSaving(true)

    const blNumber = form.bl_number || null

    const payload = {
      bl_number: blNumber,
      release_type: form.release_type || null,
      originals_count: form.originals_count,
      copies_count: form.copies_count,
      freight_terms: form.freight_terms || null,
      hbl_freight_visibility: form.hbl_freight_visibility || null,
      bl_date: form.bl_date || null,
      shipper: form.shipper || null,
      shipper_address: form.shipper_address || null,
      consignee: form.consignee || null,
      consignee_address: form.consignee_address || null,
      consignee_tax_id: form.consignee_tax_id || null,
      consignee_contact: form.consignee_contact || null,
      consignee_email: form.consignee_email || null,
      notify_party: form.notify_party || null,
      notify_party_address: form.notify_party_address || null,
      notify_party_tax_id: form.notify_party_tax_id || null,
      notify_party_contact: form.notify_party_contact || null,
      notify_party_email: form.notify_party_email || null,
      place_of_receipt: form.place_of_receipt || null,
      port_of_loading: form.port_of_loading || null,
      port_of_discharge: form.port_of_discharge || null,
      place_of_delivery: form.place_of_delivery || null,
      carrier: form.carrier || null,
      vessel_name: form.vessel_name || null,
      voyage: form.voyage || null,
      etd: form.etd || null,
      eta: form.eta || null,
      description_of_goods: form.description_of_goods || null,
      marks_and_numbers: form.marks_and_numbers || null,
      number_of_packages: form.number_of_packages ? Number(form.number_of_packages) : null,
      package_type: form.package_type || null,
      gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
      measurement_cbm: form.measurement_cbm ? Number(form.measurement_cbm) : null,
      special_instructions: form.special_instructions || null,
      printed_at_destination: form.printed_at_destination,
      draft_file_url: normalizeBookingDocumentPath(form.draft_file_url) || null,
      draft_file_name: form.draft_file_name || null,
      placa_camion: form.placa_camion || null,
      nombre_operador: form.nombre_operador || null,
      updated_at: new Date().toISOString(),
    }

    if (isNew) {
      const newBlId = crypto.randomUUID()
      const { data: createdBL, error } = await supabase
        .from('bills_of_lading')
        .insert({
          id: newBlId,
          booking_id: bookingId,
          shipping_instruction_id: id,
          bl_type: form.bl_type,
          parent_bl_id: form.parent_bl_id || null,
          status: form.status,
          ...payload,
          created_by: user?.id || null,
        })
        .select('id, bl_number')
        .single()

      setSaving(false)

      if (error) {
        toast.error(error?.message || 'Error al crear el BL')
        return
      }

      toast.success(`${form.bl_type} creado${createdBL?.bl_number ? ` · ${createdBL.bl_number}` : ''}`)
      await createActivityLog({
        module: 'operations_bl',
        action: 'create',
        entityType: 'bill_of_lading',
        entityId: newBlId,
        description: `${form.bl_type} creado para booking ${bookingId}`,
        metadata: { bl_type: form.bl_type, booking_id: bookingId, shipping_instruction_id: id },
      })

      router.replace(`/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/${newBlId}`)
      return
    }

    const { data: updatedBL, error } = await supabase
      .from('bills_of_lading')
      .update(payload)
      .eq('id', blId)
      .select('updated_at')
      .single()

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setDocumentUpdatedAt(updatedBL?.updated_at || null)

    // Sync bl_number back to bookings for legacy display.
    let bookingCacheSynced = true
    if (form.bl_number) {
      if (form.bl_type === 'MBL') {
        bookingCacheSynced = await syncBookingBlCache({ master_bl: form.bl_number })
      } else if (form.bl_type === 'HBL' && ['Emitido', 'Liberado'].includes(form.status)) {
        bookingCacheSynced = await syncBookingBlCache({ house_bl: form.bl_number })
      }
    }

    if (bookingCacheSynced) {
      toast.success('BL guardado')
    } else {
      toast.warning('BL guardado. No se pudo actualizar su referencia en el resumen del booking; recarga la página e intenta guardar nuevamente.')
    }
    await createActivityLog({
      module: 'operations_bl',
      action: 'update',
      entityType: 'bill_of_lading',
      entityId: blId,
      description: `${form.bl_type} actualizado`,
      metadata: { status: form.status, booking_id: bookingId },
    })

    // Log amendment
    await logAmendment(form)
  }

  const logAmendment = async (currentForm: BLForm) => {
    const before = savedFormRef.current
    const changed: Record<string, string> = {}
    if (before) {
      for (const field of TRACKED_FIELDS) {
        const prev = String(before[field] ?? '')
        const next = String(currentForm[field] ?? '')
        if (prev !== next) changed[field] = `${prev || '(vacío)'} → ${next || '(vacío)'}`
      }
    }
    if (Object.keys(changed).length === 0 && !amendmentNote.trim()) {
      savedFormRef.current = currentForm
      return
    }
    const nextNum = amendments.length + 1
    const { data: inserted } = await supabase
      .from('bl_amendments')
      .insert({
        bl_id: blId,
        amendment_number: nextNum,
        notes: amendmentNote.trim() || null,
        changed_fields: Object.keys(changed).length > 0 ? changed : null,
        status_before: before?.status || null,
        status_after: currentForm.status || null,
        created_by: user?.id || null,
      })
      .select('*')
      .single()
    if (inserted) {
      setAmendments((prev) => [...prev, inserted as Amendment])
    }
    savedFormRef.current = currentForm
    setAmendmentNote('')
  }

  const logDraftSend = async () => {
    if (!form.consignee_email) {
      toast.error('El consignatario no tiene email registrado')
      return
    }
    setSendingDraft(true)
    const { data: inserted } = await supabase
      .from('bl_draft_sends')
      .insert({
        bl_id: blId,
        sent_to: form.consignee_email,
        sent_by: user?.id || null,
        notes: `Draft enviado para ${form.bl_number || 'BL sin número'}`,
      })
      .select('*')
      .single()
    if (inserted) {
      setDraftSends((prev) => [inserted as DraftSend, ...prev])
      toast.success(`Envío registrado a ${form.consignee_email}`)
    }
    setSendingDraft(false)
    setShowEmailModal(false)
  }

  const saveContainers = async () => {
    if (isNew) return
    setSavingContainers(true)

    const rows = containers.filter((c) => c.container_number || c.container_type)
    const { error } = await supabase.rpc('replace_bl_containers', {
      p_bl_id: blId,
      p_containers: rows.map((c) => ({
        container_number: c.container_number || null,
        seal_number: c.seal_number || null,
        container_type: c.container_type || null,
        quantity: c.quantity ? Number(c.quantity) : 1,
        gross_weight_kg: c.gross_weight_kg ? Number(c.gross_weight_kg) : null,
        measurement_cbm: c.measurement_cbm ? Number(c.measurement_cbm) : null,
        notes: c.notes || null,
      })),
    })

    if (error) {
      toast.error(error.message)
      setSavingContainers(false)
      return
    }

    setSavingContainers(false)
    toast.success('Contenedores guardados')
  }

  const requestContainerRemoval = (container: BLContainer, index: number) => {
    setContainerPendingRemoval({
      index,
      label:
        container.container_number.trim() ||
        container.container_type.trim() ||
        `fila ${index + 1}`,
      persisted: Boolean(container.id),
    })
  }

  const confirmContainerRemoval = () => {
    if (!containerPendingRemoval) return

    setContainers((current) =>
      current.filter((_, index) => index !== containerPendingRemoval.index)
    )
    setContainerPendingRemoval(null)
  }

  const advanceStatus = async () => {
    const transition = STATUS_FLOW[form.status]
    if (!transition) return

    const readiness = getBlReadiness(form, tipoTransporte, transition.next)
    if (readiness.blocking.length > 0) {
      toast.error(
        `Completa antes de avanzar: ${readiness.blocking.map(({ label }) => label).join(', ')}`
      )
      return
    }

    if (['MBL Validado', 'Emitido'].includes(transition.next)) {
      const unresolvedDifferences = getBlConsistencyWarnings(form, validationSources)
        .filter((warning) => warning.kind === 'source_mismatch')
        .filter((warning) =>
          !validationExceptions.some((exception) =>
            isBlValidationExceptionMatch(exception, warning)
          )
        )

      if (unresolvedDifferences.length > 0) {
        toast.error(
          `Corrige o justifica antes de finalizar: ${unresolvedDifferences
            .map(({ label }) => label)
            .join(', ')}`
        )
        return
      }
    }

    if (!documentUpdatedAt) {
      toast.error('No se pudo verificar la versión del documento. Recarga la página.')
      return
    }

    if (savedFormRef.current && JSON.stringify(savedFormRef.current) !== JSON.stringify(form)) {
      toast.error('Guarda los cambios del documento antes de avanzar su estado.')
      return
    }

    setTransitioning(true)

    const { data, error } = await supabase.rpc('transition_bill_of_lading', {
      p_bl_id: blId,
      p_expected_status: form.status,
      p_target_status: transition.next,
      p_expected_updated_at: documentUpdatedAt,
    })

    setTransitioning(false)

    if (error) {
      toast.error(error.message)
      return
    }

    const result = data as {
      bill_of_lading?: {
        status?: string
        issue_date?: string | null
        release_date?: string | null
        updated_at?: string | null
      }
      amendment?: Amendment
      booking_updated_at?: string | null
    } | null
    const transitionedBL = result?.bill_of_lading
    const updatedForm: BLForm = {
      ...form,
      status: transitionedBL?.status || transition.next,
      issue_date: transitionedBL?.issue_date || form.issue_date,
      release_date: transitionedBL?.release_date || form.release_date,
    }

    setForm(updatedForm)
    savedFormRef.current = updatedForm
    setDocumentUpdatedAt(transitionedBL?.updated_at || null)
    if (result?.booking_updated_at) setBookingUpdatedAt(result.booking_updated_at)
    if (result?.amendment) setAmendments((current) => [...current, result.amendment!])
    toast.success(`Estado actualizado: ${updatedForm.status}`)
  }

  const closeExceptionDialog = () => {
    if (savingException) return
    setExceptionAction(null)
    setExceptionReason('')
  }

  const submitExceptionAction = async () => {
    if (!exceptionAction) return
    const reason = exceptionReason.trim()
    if (reason.length < 8) {
      toast.error('Escribe un motivo de al menos 8 caracteres.')
      return
    }

    setSavingException(true)

    if (exceptionAction.kind === 'justify') {
      const warning = exceptionAction.warning
      const { data, error } = await supabase.rpc('acknowledge_bl_validation_exception', {
        p_bl_id: blId,
        p_field_name: warning.field,
        p_document_value: warning.documentValue,
        p_source_value: warning.sourceValue,
        p_source_label: warning.sourceLabel,
        p_reason: reason,
      })

      setSavingException(false)
      if (error) {
        toast.error(error.message)
        return
      }

      const inserted = data as BlValidationException
      setValidationExceptions((current) => [
        inserted,
        ...current.map((exception) =>
          exception.status === 'ACTIVE' && exception.field_name === inserted.field_name
            ? {
                ...exception,
                status: 'SUPERSEDED' as const,
                closed_at: inserted.created_at,
                closed_by: user?.id || null,
                closure_reason: 'Reemplazada por una nueva justificación para el campo',
              }
            : exception
        ),
      ])
      toast.success('Diferencia documental justificada')
    } else {
      const { data, error } = await supabase.rpc('revoke_bl_validation_exception', {
        p_exception_id: exceptionAction.exception.id,
        p_reason: reason,
      })

      setSavingException(false)
      if (error) {
        toast.error(error.message)
        return
      }

      const revoked = data as BlValidationException
      setValidationExceptions((current) =>
        current.map((exception) => exception.id === revoked.id ? revoked : exception)
      )
      toast.success('Excepción revocada; la diferencia requiere revisión nuevamente')
    }

    setExceptionAction(null)
    setExceptionReason('')
  }

  const uploadDraftFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!profile?.tenant_id) {
      toast.error('Tu perfil no tiene una empresa asignada')
      return
    }

    setUploadingDraft(true)
    const safeName = sanitizeFileName(file.name)
    const path = buildTenantStoragePath(
      profile.tenant_id,
      bookingId,
      'bl-drafts',
      isNew ? 'new' : blId,
      `${Date.now()}-${safeName}`,
    )

    const { error: uploadError } = await supabase.storage
      .from(BOOKING_DOCUMENTS_BUCKET)
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error(`Error al subir: ${uploadError.message}`)
      setUploadingDraft(false)
      return
    }

    setForm((prev) => ({
      ...prev,
      draft_file_url: path,
      draft_file_name: file.name,
    }))
    setUploadingDraft(false)
    toast.success('Archivo subido')

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openDraftFile = async () => {
    const path = normalizeBookingDocumentPath(form.draft_file_url)

    if (!path || !profile?.tenant_id || !isTenantResourceStoragePath(path, profile.tenant_id, bookingId)) {
      toast.error('La ruta del Draft MBL no es válida')
      return
    }

    setOpeningDraft(true)
    const { data, error } = await supabase.storage
      .from(BOOKING_DOCUMENTS_BUCKET)
      .createSignedUrl(path, 60)
    setOpeningDraft(false)

    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'No se pudo abrir el Draft MBL')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const openPrintWindow = () => {
    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      toast.error('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes e intenta nuevamente.')
      return null
    }

    printWindow.document.title = 'Preparando documento'
    printWindow.document.body.textContent = 'Preparando documento para imprimir...'
    return printWindow
  }

  const sendBlobToPrintWindow = (printWindow: Window, blob: Blob) => {
    const objectUrl = URL.createObjectURL(blob)

    printWindow.location.replace(objectUrl)
    printWindow.opener = null
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  const printUploadedMBLDraft = async () => {
    const path = normalizeBookingDocumentPath(form.draft_file_url)

    if (!path || !profile?.tenant_id || !isTenantResourceStoragePath(path, profile.tenant_id, bookingId)) {
      toast.error('Sube y guarda el Draft MBL del agente antes de imprimirlo.')
      return
    }

    const printWindow = openPrintWindow()
    if (!printWindow) return

    setPrintingDraft(true)
    try {
      const { data, error } = await supabase.storage
        .from(BOOKING_DOCUMENTS_BUCKET)
        .createSignedUrl(path, 60)

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'No se pudo abrir el Draft MBL')
      }

      printWindow.location.replace(data.signedUrl)
      printWindow.opener = null
    } catch (error) {
      printWindow.close()
      toast.error(error instanceof Error ? error.message : 'No se pudo imprimir el Draft MBL')
    } finally {
      setPrintingDraft(false)
    }
  }

  const printGeneratedHBL = async () => {
    const printWindow = openPrintWindow()
    if (!printWindow) return

    setPrintingDraft(true)
    try {
      const blob = await pdf(
        <HouseBLPdf
          bl={formToHBLData(form, condicionesBL, containers)}
          company={companyBranding}
        />
      ).toBlob()

      sendBlobToPrintWindow(printWindow, blob)
    } catch {
      printWindow.close()
      toast.error('No se pudo generar el HBL para impresión.')
    } finally {
      setPrintingDraft(false)
    }
  }

  if (loading) return <PageSkeleton cards={2} rows={4} />

  const transition = isNew ? null : STATUS_FLOW[form.status]
  const blLabel = form.bl_type === 'MBL'
    ? 'Master BL'
    : tipoTransporte === 'Aéreo'
      ? 'AWB'
      : tipoTransporte === 'Terrestre'
        ? 'Carta Porte'
        : 'House BL'
  const canSendDraft = !isNew && form.bl_type === 'HBL' && ['HBL Draft', 'Pendiente Aprobación Cliente'].includes(form.status)
  const isDocumentLocked = !isNew && form.bl_type === 'HBL' && ['Emitido', 'Liberado'].includes(form.status)

  const fmtDate = (d: string) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

  const emailSubject = `Revisión Draft HBL — ${form.bl_number || 'Pendiente'}`
  const emailBody = [
    `Estimado/a ${form.consignee || 'cliente'},`,
    '',
    'Adjunto encontrará el borrador del House Bill of Lading para su revisión y aprobación.',
    '',
    `BL #:              ${form.bl_number || 'Pendiente'}`,
    `Puerto de Carga:   ${form.port_of_loading || '-'}`,
    `Puerto de Descarga:${form.port_of_discharge || '-'}`,
    `Buque / Viaje:     ${[form.vessel_name, form.voyage].filter(Boolean).join(' / ') || '-'}`,
    `ETD:               ${fmtDate(form.etd)}`,
    '',
    'Por favor revise la información y confírmenos su aprobación, o notifíquenos si requiere algún ajuste.',
    '',
    'Saludos,',
    `${getCompanyTradeName(companyBranding)} — Operaciones`,
  ].join('\n')

  const mailtoLink = form.consignee_email
    ? `mailto:${form.consignee_email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : ''
  const currentTransition = STATUS_FLOW[form.status]
  const readiness = currentTransition
    ? getBlReadiness(form, tipoTransporte, currentTransition.next)
    : { blocking: [], warnings: [] }
  const consistencyWarnings = isDocumentLocked
    ? []
    : getBlConsistencyWarnings(form, validationSources)
  const useValidationSource = (field: BlConsistencyField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">

      <Breadcrumbs
        items={[
          { label: 'Shipping Instructions', href: '/operations/shipping-instructions' },
          {
            label: documentContext.routingNumber || 'Shipping Instruction',
            href: `/operations/shipping-instructions/${id}`,
          },
          {
            label: documentContext.bookingNumber || 'Booking',
            href: `/operations/shipping-instructions/${id}/bookings/${bookingId}`,
          },
          { label: isNew ? `Nuevo ${blLabel}` : form.bl_number || blLabel },
        ]}
      />

      {/* Email Draft Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${cardClass} w-full max-w-2xl`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Enviar Draft al Cliente</h2>
              <button type="button" onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 space-y-1 rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
              <p className="font-medium text-blue-800 dark:text-blue-300">Para: <span className="font-normal">{form.consignee_email || '(sin email)'}</span></p>
              <p className="font-medium text-blue-800 dark:text-blue-300">Asunto: <span className="font-normal">{emailSubject}</span></p>
            </div>

            <textarea
              readOnly
              rows={16}
              value={emailBody}
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />

            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Recuerda adjuntar el PDF del draft al correo electrónico.
            </p>

            <div className="flex flex-wrap gap-3">
              {mailtoLink && (
                <a
                  href={mailtoLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Mail className="h-4 w-4" />
                  Abrir en correo
                </a>
              )}
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(emailBody)
                  toast.success('Mensaje copiado')
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Copiar mensaje
              </button>
              <button
                type="button"
                onClick={logDraftSend}
                disabled={sendingDraft || !form.consignee_email}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sendingDraft ? 'Registrando...' : 'Registrar envío'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="ml-auto rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isNew ? `Nuevo ${blLabel}` : `${blLabel} · ${form.bl_number || 'Sin número'}`}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            SI {documentContext.routingNumber || 'sin número'} · Booking {documentContext.bookingNumber || 'sin número confirmado'}
          </p>
          {!isNew && (
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(form.status)}`}>
              {form.status}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {form.bl_type === 'MBL' && (
            <button
              type="button"
              onClick={printUploadedMBLDraft}
              disabled={printingDraft || !form.draft_file_url}
              title={form.draft_file_url ? 'Imprimir Draft MBL' : 'Sube el Draft MBL del agente para imprimirlo'}
              className={`${secondaryButtonClass} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Printer className="h-4 w-4" />
              {printingDraft ? 'Preparando...' : 'Imprimir Draft MBL'}
            </button>
          )}
          {form.bl_type === 'HBL' && tipoTransporte !== 'Aéreo' && tipoTransporte !== 'Terrestre' && (
            <button
              type="button"
              onClick={printGeneratedHBL}
              disabled={printingDraft}
              title="Imprimir HBL Draft"
              className={`${secondaryButtonClass} inline-flex items-center gap-2 disabled:opacity-50`}
            >
              <Printer className="h-4 w-4" />
              {printingDraft
                ? 'Preparando...'
                : form.status === 'Emitido' || form.status === 'Liberado'
                  ? 'Imprimir HBL'
                  : 'Imprimir HBL Draft'}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(`/operations/shipping-instructions/${id}/bookings/${bookingId}`)}
            className={secondaryButtonClass}
          >
            Volver al Booking
          </button>
        </div>
      </div>

      <BLValidationPanel
        transitionLabel={currentTransition?.label || null}
        blocking={readiness.blocking}
        recommended={readiness.warnings}
        consistencyWarnings={consistencyWarnings}
        validationExceptions={validationExceptions}
        locked={isDocumentLocked}
        canManageExceptions={!isNew && !isDocumentLocked}
        onUseSource={useValidationSource}
        onJustify={(warning) => {
          setExceptionAction({ kind: 'justify', warning })
          setExceptionReason('')
        }}
        onRevoke={(exception) => {
          setExceptionAction({ kind: 'revoke', exception })
          setExceptionReason('')
        }}
      />

      {/* MBL Draft Upload */}
      {form.bl_type === 'MBL' && (
        <section className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Draft MBL del Agente
          </h2>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={uploadDraftFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingDraft}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              {uploadingDraft ? 'Subiendo...' : 'Subir Draft MBL'}
            </button>
            {form.draft_file_url && (
              <button
                type="button"
                onClick={openDraftFile}
                disabled={openingDraft}
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                <FileText className="h-4 w-4" />
                {openingDraft ? 'Abriendo...' : form.draft_file_name || 'Ver archivo'}
              </button>
            )}
          </div>
        </section>
      )}

      {isDocumentLocked && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          Este HBL está emitido y sus datos documentales están protegidos. Solo puede registrarse su liberación.
        </div>
      )}

      <fieldset disabled={isDocumentLocked} className="contents">

      {/* Identificación */}
      <SectionCard title="Identificación" cols={3}>
        <Field label="Número de BL">
          <input
            value={form.bl_number}
            onChange={set('bl_number')}
            className={fieldClass}
            placeholder={
              isNew && form.bl_type === 'HBL'
                ? 'Se generará automáticamente (SARI-HBL-...)'
                : 'MOLU1234567'
            }
          />
        </Field>
        <Field label="Fecha BL">
          <input type="date" value={form.bl_date} onChange={set('bl_date')} className={fieldClass} />
        </Field>
        <Field label="Tipo de Liberación">
          <select value={form.release_type} onChange={set('release_type')} className={fieldClass}>
            <option value="">Seleccionar...</option>
            <option value="Express Release">Express Release</option>
            <option value="Original BL">Original BL</option>
          </select>
        </Field>
        <Field label="Flete">
          <select value={form.freight_terms} onChange={set('freight_terms')} className={fieldClass}>
            <option value="Prepaid">Prepaid</option>
            <option value="Collect">Collect</option>
          </select>
        </Field>
        {form.bl_type === 'HBL' && (
          <Field label="Visibilidad Flete en HBL">
            <select value={form.hbl_freight_visibility} onChange={set('hbl_freight_visibility')} className={fieldClass}>
              <option value="No Freight Charges">No Freight Charges</option>
              <option value="As Arranged">As Arranged</option>
              <option value="Freight Amount">Freight Amount</option>
            </select>
          </Field>
        )}
        <Field label="Originales">
          <input type="number" min={0} value={form.originals_count} onChange={set('originals_count')} className={fieldClass} />
        </Field>
        <Field label="Copias">
          <input type="number" min={0} value={form.copies_count} onChange={set('copies_count')} className={fieldClass} />
        </Field>
        <div className="flex items-center gap-2 pt-5">
          <input
            id="printed_at_destination"
            type="checkbox"
            checked={form.printed_at_destination}
            onChange={(e) => setForm((prev) => ({ ...prev, printed_at_destination: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          <label htmlFor="printed_at_destination" className="text-sm text-slate-700 dark:text-slate-200">
            Impreso en destino
          </label>
        </div>
      </SectionCard>

      {/* Partes */}
      <SectionCard title="Shipper (Exportador)" cols={2}>
        <Field label="Nombre">
          <input value={form.shipper} onChange={set('shipper')} className={fieldClass} />
        </Field>
        <Field label="Dirección">
          <input value={form.shipper_address} onChange={set('shipper_address')} className={fieldClass} />
        </Field>
      </SectionCard>

      <SectionCard title="Consignee (Importador)" cols={2}>
        <Field label="Nombre">
          <input value={form.consignee} onChange={set('consignee')} className={fieldClass} />
        </Field>
        <Field label="Dirección">
          <input value={form.consignee_address} onChange={set('consignee_address')} className={fieldClass} />
        </Field>
        <Field label="RTN / Tax ID">
          <input value={form.consignee_tax_id} onChange={set('consignee_tax_id')} className={fieldClass} />
        </Field>
        <Field label="Contacto">
          <input value={form.consignee_contact} onChange={set('consignee_contact')} className={fieldClass} />
        </Field>
        <Field label="Email">
          <input value={form.consignee_email} onChange={set('consignee_email')} className={fieldClass} />
        </Field>
      </SectionCard>

      <SectionCard title="Notify Party" cols={2}>
        <Field label="Nombre">
          <input value={form.notify_party} onChange={set('notify_party')} className={fieldClass} />
        </Field>
        <Field label="Dirección">
          <input value={form.notify_party_address} onChange={set('notify_party_address')} className={fieldClass} />
        </Field>
        <Field label="RTN / Tax ID">
          <input value={form.notify_party_tax_id} onChange={set('notify_party_tax_id')} className={fieldClass} />
        </Field>
        <Field label="Contacto">
          <input value={form.notify_party_contact} onChange={set('notify_party_contact')} className={fieldClass} />
        </Field>
        <Field label="Email">
          <input value={form.notify_party_email} onChange={set('notify_party_email')} className={fieldClass} />
        </Field>
      </SectionCard>

      {/* Ruta */}
      <SectionCard title="Ruta" cols={2}>
        <Field label="Place of Receipt">
          <input value={form.place_of_receipt} onChange={set('place_of_receipt')} className={fieldClass} />
        </Field>
        <Field label="Port of Loading">
          <input value={form.port_of_loading} onChange={set('port_of_loading')} className={fieldClass} />
        </Field>
        <Field label="Port of Discharge">
          <input value={form.port_of_discharge} onChange={set('port_of_discharge')} className={fieldClass} />
        </Field>
        <Field label="Place of Delivery">
          <input value={form.place_of_delivery} onChange={set('place_of_delivery')} className={fieldClass} />
        </Field>
      </SectionCard>

      {/* Buque / Vuelo / Transporte */}
      <SectionCard
        title={
          tipoTransporte === 'Aéreo' ? 'Vuelo' :
          tipoTransporte === 'Terrestre' ? 'Transporte Terrestre' :
          'Buque / Vuelo'
        }
        cols={2}
      >
        <Field label={tipoTransporte === 'Terrestre' ? 'Transportista' : 'Carrier / Aerolínea'}>
          <input value={form.carrier} onChange={set('carrier')} className={fieldClass} />
        </Field>
        {tipoTransporte === 'Terrestre' ? (
          <>
            <Field label="Placa del Camión">
              <input value={form.placa_camion} onChange={set('placa_camion')} className={fieldClass} placeholder="Ej. HN-1234" />
            </Field>
            <Field label="Nombre del Operador">
              <input value={form.nombre_operador} onChange={set('nombre_operador')} className={fieldClass} placeholder="Nombre completo del conductor" />
            </Field>
          </>
        ) : (
          <>
            <Field label={tipoTransporte === 'Aéreo' ? 'Número de vuelo' : 'Nombre del Buque'}>
              <input
                value={tipoTransporte === 'Aéreo' ? form.voyage : form.vessel_name}
                onChange={tipoTransporte === 'Aéreo' ? set('voyage') : set('vessel_name')}
                className={fieldClass}
              />
            </Field>
            {tipoTransporte !== 'Aéreo' && (
              <Field label="Voyage">
                <input value={form.voyage} onChange={set('voyage')} className={fieldClass} />
              </Field>
            )}
          </>
        )}
        <Field label="ETD">
          <input type="date" value={form.etd} onChange={set('etd')} className={fieldClass} />
        </Field>
        <Field label="ETA">
          <input type="date" value={form.eta} onChange={set('eta')} className={fieldClass} />
        </Field>
      </SectionCard>

      {/* Mercancía */}
      <SectionCard title="Descripción de Mercancía" cols={2}>
        <div className="md:col-span-2">
          <Field label="Descripción">
            <textarea
              rows={4}
              value={form.description_of_goods}
              onChange={set('description_of_goods')}
              className={`${fieldClass} min-h-24`}
            />
          </Field>
        </div>
        <Field label="Marcas y Números">
          <input value={form.marks_and_numbers} onChange={set('marks_and_numbers')} className={fieldClass} />
        </Field>
        <Field label="Cantidad de Bultos">
          <input type="number" min={0} value={form.number_of_packages} onChange={set('number_of_packages')} className={fieldClass} />
        </Field>
        <Field label="Tipo de Bulto">
          <input value={form.package_type} onChange={set('package_type')} className={fieldClass} placeholder="Cajas, Pallets, etc." />
        </Field>
        <Field label="Peso Bruto (KG)">
          <input type="number" step="0.01" min={0} value={form.gross_weight_kg} onChange={set('gross_weight_kg')} className={fieldClass} />
        </Field>
        <Field label="Volumen (CBM)">
          <input type="number" step="0.001" min={0} value={form.measurement_cbm} onChange={set('measurement_cbm')} className={fieldClass} />
        </Field>
      </SectionCard>

      {/* Contenedores (FCL) */}
      {!isNew && (
        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Contenedores
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setContainers((prev) => [
                    ...prev,
                    { container_number: '', seal_number: '', container_type: '', quantity: 1, gross_weight_kg: '', measurement_cbm: '', notes: '' },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
              <button
                type="button"
                onClick={saveContainers}
                disabled={savingContainers}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingContainers ? 'Guardando...' : 'Guardar contenedores'}
              </button>
            </div>
          </div>

          {containers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sin contenedores. Usa &quot;Agregar&quot; para FCL.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Contenedor #', 'Precinto', 'Tipo', 'Qty', 'KG', 'CBM', 'Notas', ''].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left font-semibold text-slate-500 dark:text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                      {(
                        [
                          ['container_number', 'ABCU1234567'],
                          ['seal_number', 'SL123'],
                          ['container_type', '20GP / 40HC'],
                        ] as const
                      ).map(([field, ph]) => (
                        <td key={field} className="pr-2 py-1">
                          <input
                            value={c[field]}
                            onChange={(e) => {
                              const updated = [...containers]
                              updated[i] = { ...updated[i], [field]: e.target.value }
                              setContainers(updated)
                            }}
                            placeholder={ph}
                            className={`${fieldClass} text-xs`}
                          />
                        </td>
                      ))}
                      <td className="pr-2 py-1 w-16">
                        <input
                          type="number"
                          min={1}
                          value={c.quantity}
                          onChange={(e) => {
                            const updated = [...containers]
                            updated[i] = { ...updated[i], quantity: e.target.value === '' ? '' : Number(e.target.value) }
                            setContainers(updated)
                          }}
                          className={`${fieldClass} text-xs`}
                        />
                      </td>
                      {(['gross_weight_kg', 'measurement_cbm'] as const).map((field) => (
                        <td key={field} className="pr-2 py-1 w-24">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={c[field]}
                            onChange={(e) => {
                              const updated = [...containers]
                              updated[i] = { ...updated[i], [field]: e.target.value }
                              setContainers(updated)
                            }}
                            className={`${fieldClass} text-xs`}
                          />
                        </td>
                      ))}
                      <td className="pr-2 py-1">
                        <input
                          value={c.notes}
                          onChange={(e) => {
                            const updated = [...containers]
                            updated[i] = { ...updated[i], notes: e.target.value }
                            setContainers(updated)
                          }}
                          className={`${fieldClass} text-xs`}
                        />
                      </td>
                      <td className="py-1">
                        <button
                          type="button"
                          onClick={() => requestContainerRemoval(c, i)}
                          aria-label={`Quitar contenedor ${c.container_number || i + 1}`}
                          title="Quitar contenedor"
                          className="inline-flex h-8 w-8 items-center justify-center text-red-500 transition hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(containerPendingRemoval)}
        onOpenChange={(open) => {
          if (!open) setContainerPendingRemoval(null)
        }}
        title="Quitar contenedor"
        description={
          containerPendingRemoval
            ? `¿Deseas quitar ${containerPendingRemoval.label} del borrador? ${
                containerPendingRemoval.persisted
                  ? 'El contenedor se eliminará definitivamente cuando guardes los contenedores.'
                  : 'La fila todavía no ha sido guardada.'
              }`
            : undefined
        }
        confirmLabel="Quitar contenedor"
        danger
        onConfirm={confirmContainerRemoval}
      />

      {/* Instrucciones especiales */}
      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Instrucciones Especiales
        </h2>
        <textarea
          rows={3}
          value={form.special_instructions}
          onChange={set('special_instructions')}
          className={`${fieldClass} min-h-20`}
          placeholder="Instrucciones adicionales para el BL..."
        />
      </section>

      {/* Fechas de emisión / liberación (solo en edición) */}
      {!isNew && (
        <SectionCard title="Fechas de Control" cols={3}>
          <Field label="Fecha de Emisión">
            <input type="date" value={form.issue_date} disabled className={fieldClass} />
          </Field>
          <Field label="Fecha de Liberación">
            <input type="date" value={form.release_date} disabled className={fieldClass} />
          </Field>
        </SectionCard>
      )}

      {/* Nota de enmienda (solo en edición) */}
      {!isNew && (
        <section className={cardClass}>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Nota de este cambio <span className="text-slate-400">(opcional — queda registrada en el historial)</span>
          </label>
          <input
            value={amendmentNote}
            onChange={(e) => setAmendmentNote(e.target.value)}
            className={fieldClass}
            placeholder="Ej: Corrección de peso, cambio de consignatario..."
          />
        </section>
      )}

      </fieldset>

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={saveBL}
            disabled={saving || isDocumentLocked}
            className={`${primaryButtonClass} disabled:opacity-50`}
          >
            {saving ? 'Guardando...' : isNew ? `Crear ${blLabel}` : 'Guardar'}
          </button>

          {canSendDraft && (
            <button
              type="button"
              onClick={() => setShowEmailModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <Mail className="h-4 w-4" />
              Enviar Draft al Cliente
            </button>
          )}
        </div>

        {!isNew && transition && (
          <button
            type="button"
            onClick={advanceStatus}
            disabled={transitioning}
            className={`rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${transition.color}`}
          >
            {transitioning ? 'Procesando...' : transition.label}
          </button>
        )}

        {!isNew && form.status === 'Emitido' && form.bl_type === 'HBL' && tipoTransporte === 'Aéreo' && (
          <PDFDownloadLink
            document={<AWBPdf awb={formToAWBData(form, condicionesAWB)} company={companyBranding} />}
            fileName={`AWB-${form.bl_number || blId}.pdf`}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {({ loading: pdfLoading }) => (
              <>
                <Download className="h-4 w-4" />
                {pdfLoading ? 'Generando...' : 'Descargar AWB PDF'}
              </>
            )}
          </PDFDownloadLink>
        )}
        {!isNew && form.status === 'Emitido' && form.bl_type === 'HBL' && tipoTransporte === 'Terrestre' && (
          <PDFDownloadLink
            document={<CartaPortePdf cp={formToCartaPorteData(form, condicionesCP)} company={companyBranding} />}
            fileName={`CartaPorte-${form.bl_number || blId}.pdf`}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {({ loading: pdfLoading }) => (
              <>
                <Download className="h-4 w-4" />
                {pdfLoading ? 'Generando...' : 'Descargar Carta Porte PDF'}
              </>
            )}
          </PDFDownloadLink>
        )}
        {!isNew && form.bl_type === 'HBL' && tipoTransporte !== 'Aéreo' && tipoTransporte !== 'Terrestre' && (
          <PDFDownloadLink
            document={<HouseBLPdf bl={formToHBLData(form, condicionesBL, containers)} company={companyBranding} />}
            fileName={`HBL-${form.bl_number || blId}.pdf`}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {({ loading: pdfLoading }) => (
              <>
                <Download className="h-4 w-4" />
                {pdfLoading
                  ? 'Generando...'
                  : form.status === 'Emitido' || form.status === 'Liberado'
                    ? 'Descargar HBL PDF'
                    : 'Descargar HBL Draft'}
              </>
            )}
          </PDFDownloadLink>
        )}
      </div>

      {/* Historial de enmiendas y envíos */}
      {!isNew && (amendments.length > 0 || draftSends.length > 0) && (
        <section className={cardClass}>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <History className="h-5 w-5 text-slate-400" />
            Historial
          </h2>

          {amendments.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Enmiendas</h3>
              <div className="space-y-3">
                {amendments.map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Enmienda #{a.amendment_number}</span>
                      <span>·</span>
                      <span>{new Date(a.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {a.notes && (
                      <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">{a.notes}</p>
                    )}
                    {a.changed_fields && Object.keys(a.changed_fields).length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {Object.entries(a.changed_fields).map(([field, change]) => (
                          <li key={field}>
                            <span className="font-medium">{field}:</span> {change}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {draftSends.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Envíos de Draft</h3>
              <div className="space-y-2">
                {draftSends.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <Send className="h-4 w-4 flex-shrink-0 text-violet-500" />
                    <div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{s.sent_to}</span>
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(s.sent_at).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <Dialog
        open={Boolean(exceptionAction)}
        onOpenChange={(open) => {
          if (!open) closeExceptionDialog()
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!savingException}>
          <DialogHeader>
            <DialogTitle>
              {exceptionAction?.kind === 'justify'
                ? 'Justificar diferencia documental'
                : 'Revocar excepción documental'}
            </DialogTitle>
            <DialogDescription>
              {exceptionAction?.kind === 'justify'
                ? 'La justificación quedará vinculada a los valores comparados y registrada en la bitácora.'
                : 'La diferencia volverá a mostrarse como pendiente de revisión. El historial anterior no se elimina.'}
            </DialogDescription>
          </DialogHeader>

          {exceptionAction?.kind === 'justify' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="font-semibold text-slate-900 dark:text-white">
                {exceptionAction.warning.label}
              </p>
              <p className="mt-1 break-words text-slate-600 dark:text-slate-300">
                Documento: {exceptionAction.warning.documentValue}
              </p>
              <p className="mt-0.5 break-words text-slate-500 dark:text-slate-400">
                {exceptionAction.warning.sourceLabel}: {exceptionAction.warning.sourceValue}
              </p>
            </div>
          )}

          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {exceptionAction?.kind === 'justify' ? 'Justificación' : 'Motivo de revocación'}
            <textarea
              rows={4}
              maxLength={2000}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              className={`${fieldClass} mt-1 min-h-24`}
              placeholder={
                exceptionAction?.kind === 'justify'
                  ? 'Ej: Switch BL autorizado por el cliente el 18/09/2026...'
                  : 'Explica por qué la excepción ya no es válida...'
              }
              disabled={savingException}
              autoFocus
            />
            <span className="mt-1 block text-slate-400">
              Mínimo 8 caracteres. No incluyas datos sensibles innecesarios.
            </span>
          </label>

          <DialogFooter>
            <button
              type="button"
              onClick={closeExceptionDialog}
              disabled={savingException}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitExceptionAction}
              disabled={savingException || exceptionReason.trim().length < 8}
              className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {savingException
                ? 'Guardando...'
                : exceptionAction?.kind === 'justify'
                  ? 'Guardar justificación'
                  : 'Revocar excepción'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
