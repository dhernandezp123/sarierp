'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Download, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import HouseBLPdf, { type HBLData } from '@/src/components/pdf/house-bl-pdf'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'

const BOOKING_DOCUMENTS_BUCKET = 'booking-documents'

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
}

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

function formToHBLData(form: BLForm): HBLData {
  return {
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
  }
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
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
  const { user } = useUser()

  const { id, bookingId, blId } = params
  const isNew = blId === 'new'
  const typeParam = (searchParams.get('type') as 'MBL' | 'HBL') || 'MBL'
  const parentBlIdParam = searchParams.get('parentBlId') || null

  const [form, setForm] = useState<BLForm>({ ...defaultForm, bl_type: typeParam, parent_bl_id: parentBlIdParam, status: typeParam === 'HBL' ? 'HBL Draft' : 'MBL Draft' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [uploadingDraft, setUploadingDraft] = useState(false)
  const [containers, setContainers] = useState<BLContainer[]>([])
  const [savingContainers, setSavingContainers] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof BLForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const loadData = async () => {
    setLoading(true)

    // Load booking + SI for pre-fill
    const { data: bookingData } = await supabase
      .from('bookings')
      .select(`
        id, booking_number, carrier, vessel_name, voyage, etd, eta, freight_terms, release_type,
        shipping_instruction:shipping_instructions (
          id, routing_number, supplier_name, supplier_contact, supplier_email, origin_address, destination_address,
          quotation:quotations (
            id, incoterm, origin_port, destination_port,
            cliente:clientes (nombre, direccion, ciudad, pais, rtn, contacto, email_1)
          )
        )
      `)
      .eq('id', bookingId)
      .single()

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
        (containerData || []).map((c: any) => ({
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

      setForm({
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
        draft_file_url: blData.draft_file_url || '',
        draft_file_name: blData.draft_file_name || '',
      })

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
      shipper: si?.supplier_name || '',
      shipper_address: '',
      consignee: client?.nombre || '',
      consignee_address: [client?.direccion, client?.ciudad, client?.pais].filter(Boolean).join(', '),
      consignee_tax_id: client?.rtn || '',
      consignee_contact: client?.contacto || '',
      consignee_email: client?.email_1 || '',
      port_of_loading: (quotation?.origin_port as string) || si?.origin_address || '',
      port_of_discharge: (quotation?.destination_port as string) || si?.destination_address || '',
    }

    if (typeParam === 'HBL' && parentBlIdParam) {
      // Pre-fill from parent MBL
      const { data: parentBL } = await supabase
        .from('bills_of_lading')
        .select('*')
        .eq('id', parentBlIdParam)
        .single()

      if (parentBL) {
        Object.assign(prefilled, {
          bl_number: '',
          carrier: parentBL.carrier || prefilled.carrier,
          vessel_name: parentBL.vessel_name || prefilled.vessel_name,
          voyage: parentBL.voyage || prefilled.voyage,
          etd: parentBL.etd || prefilled.etd,
          eta: parentBL.eta || prefilled.eta,
          shipper: parentBL.shipper || prefilled.shipper,
          shipper_address: parentBL.shipper_address || '',
          consignee: parentBL.consignee || prefilled.consignee,
          consignee_address: parentBL.consignee_address || prefilled.consignee_address,
          consignee_tax_id: parentBL.consignee_tax_id || prefilled.consignee_tax_id,
          consignee_contact: parentBL.consignee_contact || prefilled.consignee_contact,
          consignee_email: parentBL.consignee_email || prefilled.consignee_email,
          notify_party: parentBL.notify_party || '',
          notify_party_address: parentBL.notify_party_address || '',
          notify_party_tax_id: parentBL.notify_party_tax_id || '',
          notify_party_contact: parentBL.notify_party_contact || '',
          notify_party_email: parentBL.notify_party_email || '',
          place_of_receipt: parentBL.place_of_receipt || '',
          port_of_loading: parentBL.port_of_loading || prefilled.port_of_loading,
          port_of_discharge: parentBL.port_of_discharge || prefilled.port_of_discharge,
          place_of_delivery: parentBL.place_of_delivery || '',
          description_of_goods: parentBL.description_of_goods || '',
          marks_and_numbers: parentBL.marks_and_numbers || '',
          number_of_packages: parentBL.number_of_packages ? String(parentBL.number_of_packages) : '',
          package_type: parentBL.package_type || '',
          gross_weight_kg: parentBL.gross_weight_kg ? String(parentBL.gross_weight_kg) : '',
          measurement_cbm: parentBL.measurement_cbm ? String(parentBL.measurement_cbm) : '',
        })
      }
    }

    setForm((prev) => ({ ...prev, ...prefilled }))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [id, bookingId, blId])

  const saveBL = async () => {
    setSaving(true)

    const payload = {
      booking_id: bookingId,
      shipping_instruction_id: id,
      bl_type: form.bl_type,
      parent_bl_id: form.parent_bl_id || null,
      bl_number: form.bl_number || null,
      status: form.status,
      release_type: form.release_type || null,
      originals_count: form.originals_count,
      copies_count: form.copies_count,
      freight_terms: form.freight_terms || null,
      hbl_freight_visibility: form.hbl_freight_visibility || null,
      bl_date: form.bl_date || null,
      issue_date: form.issue_date || null,
      release_date: form.release_date || null,
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
      draft_file_url: form.draft_file_url || null,
      draft_file_name: form.draft_file_name || null,
      updated_at: new Date().toISOString(),
    }

    if (isNew) {
      const { data, error } = await supabase
        .from('bills_of_lading')
        .insert({ ...payload, created_by: user?.id || null })
        .select('id')
        .single()

      setSaving(false)

      if (error || !data) {
        toast.error(error?.message || 'Error al crear el BL')
        return
      }

      toast.success(`${form.bl_type} creado`)
      await createActivityLog({
        module: 'operations_bl',
        action: 'create',
        entityType: 'bill_of_lading',
        entityId: data.id,
        description: `${form.bl_type} creado para booking ${bookingId}`,
        metadata: { bl_type: form.bl_type, booking_id: bookingId, shipping_instruction_id: id },
      })

      router.replace(`/operations/shipping-instructions/${id}/bookings/${bookingId}/bl/${data.id}`)
      return
    }

    const { error } = await supabase
      .from('bills_of_lading')
      .update(payload)
      .eq('id', blId)

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    // Sync bl_number back to bookings for legacy display
    if (form.bl_number) {
      if (form.bl_type === 'MBL') {
        await supabase.from('bookings').update({ master_bl: form.bl_number }).eq('id', bookingId)
      } else if (form.bl_type === 'HBL' && ['Emitido', 'Liberado'].includes(form.status)) {
        await supabase.from('bookings').update({ house_bl: form.bl_number }).eq('id', bookingId)
      }
    }

    toast.success('BL guardado')
    await createActivityLog({
      module: 'operations_bl',
      action: 'update',
      entityType: 'bill_of_lading',
      entityId: blId,
      description: `${form.bl_type} actualizado`,
      metadata: { status: form.status, booking_id: bookingId },
    })
  }

  const saveContainers = async () => {
    if (isNew) return
    setSavingContainers(true)

    // Delete existing and re-insert
    await supabase.from('bl_containers').delete().eq('bl_id', blId)

    const rows = containers.filter((c) => c.container_number || c.container_type)
    if (rows.length > 0) {
      const { error } = await supabase.from('bl_containers').insert(
        rows.map((c) => ({
          bl_id: blId,
          container_number: c.container_number || null,
          seal_number: c.seal_number || null,
          container_type: c.container_type || null,
          quantity: c.quantity ? Number(c.quantity) : 1,
          gross_weight_kg: c.gross_weight_kg ? Number(c.gross_weight_kg) : null,
          measurement_cbm: c.measurement_cbm ? Number(c.measurement_cbm) : null,
          notes: c.notes || null,
        }))
      )
      if (error) {
        toast.error(error.message)
        setSavingContainers(false)
        return
      }
    }

    setSavingContainers(false)
    toast.success('Contenedores guardados')
  }

  const advanceStatus = async () => {
    const transition = STATUS_FLOW[form.status]
    if (!transition) return

    setTransitioning(true)

    const extraFields: Record<string, unknown> = {
      status: transition.next,
      updated_at: new Date().toISOString(),
    }

    if (transition.next === 'Emitido') {
      extraFields.issued_by = user?.id || null
      extraFields.issue_date = new Date().toISOString().split('T')[0]
    }

    if (transition.next === 'Liberado') {
      extraFields.release_date = new Date().toISOString().split('T')[0]
    }

    if (transition.next === 'Aprobado por Cliente') {
      extraFields.client_approved_at = new Date().toISOString()
      extraFields.client_approved_by = user?.id || null
    }

    const { error } = await supabase
      .from('bills_of_lading')
      .update(extraFields)
      .eq('id', blId)

    setTransitioning(false)

    if (error) {
      toast.error(error.message)
      return
    }

    const newStatus = transition.next
    setForm((prev) => ({ ...prev, status: newStatus, ...Object.fromEntries(Object.entries(extraFields).filter(([k]) => k !== 'updated_at')) }))

    // Sync HBL number to bookings when issued
    if (newStatus === 'Emitido' && form.bl_type === 'HBL' && form.bl_number) {
      await supabase.from('bookings').update({ house_bl: form.bl_number }).eq('id', bookingId)
    }

    toast.success(`Estado actualizado: ${newStatus}`)

    await createActivityLog({
      module: 'operations_bl',
      action: 'status_change',
      entityType: 'bill_of_lading',
      entityId: blId,
      description: `${form.bl_type} pasó a "${transition.next}"`,
      metadata: { from: form.status, to: transition.next, booking_id: bookingId },
    })
  }

  const uploadDraftFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingDraft(true)
    const safeName = sanitizeFileName(file.name)
    const path = `bl-drafts/${isNew ? 'new' : blId}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from(BOOKING_DOCUMENTS_BUCKET)
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error(`Error al subir: ${uploadError.message}`)
      setUploadingDraft(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from(BOOKING_DOCUMENTS_BUCKET)
      .getPublicUrl(path)

    setForm((prev) => ({
      ...prev,
      draft_file_url: urlData.publicUrl,
      draft_file_name: file.name,
    }))
    setUploadingDraft(false)
    toast.success('Archivo subido')

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (loading) return <PageSkeleton cards={2} rows={4} />

  const transition = isNew ? null : STATUS_FLOW[form.status]
  const blLabel = form.bl_type === 'MBL' ? 'Master BL' : 'House BL'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isNew ? `Nuevo ${blLabel}` : `${blLabel} · ${form.bl_number || 'Sin número'}`}
          </h1>
          {!isNew && (
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(form.status)}`}>
              {form.status}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.push(`/operations/shipping-instructions/${id}/bookings/${bookingId}`)}
          className={secondaryButtonClass}
        >
          Volver al Booking
        </button>
      </div>

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
              <a
                href={form.draft_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                <FileText className="h-4 w-4" />
                {form.draft_file_name || 'Ver archivo'}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Identificación */}
      <SectionCard title="Identificación" cols={3}>
        <Field label="Número de BL">
          <input value={form.bl_number} onChange={set('bl_number')} className={fieldClass} placeholder="MOLU1234567" />
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

      {/* Buque */}
      <SectionCard title="Buque / Vuelo" cols={2}>
        <Field label="Carrier / Aerolínea">
          <input value={form.carrier} onChange={set('carrier')} className={fieldClass} />
        </Field>
        <Field label="Nombre del Buque / Vuelo">
          <input value={form.vessel_name} onChange={set('vessel_name')} className={fieldClass} />
        </Field>
        <Field label="Voyage / Número de vuelo">
          <input value={form.voyage} onChange={set('voyage')} className={fieldClass} />
        </Field>
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
              Sin contenedores. Usa "Agregar" para FCL.
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
                          onClick={() => setContainers((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:text-red-700"
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
            <input type="date" value={form.issue_date} onChange={set('issue_date')} className={fieldClass} />
          </Field>
          <Field label="Fecha de Liberación">
            <input type="date" value={form.release_date} onChange={set('release_date')} className={fieldClass} />
          </Field>
        </SectionCard>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={saveBL}
            disabled={saving}
            className={`${primaryButtonClass} disabled:opacity-50`}
          >
            {saving ? 'Guardando...' : isNew ? `Crear ${blLabel}` : 'Guardar'}
          </button>
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

        {!isNew && form.status === 'Emitido' && form.bl_type === 'HBL' && (
          <PDFDownloadLink
            document={<HouseBLPdf bl={formToHBLData(form)} />}
            fileName={`HBL-${form.bl_number || blId}.pdf`}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {({ loading: pdfLoading }) => (
              <>
                <Download className="h-4 w-4" />
                {pdfLoading ? 'Generando...' : 'Descargar HBL PDF'}
              </>
            )}
          </PDFDownloadLink>
        )}
      </div>
    </div>
  )
}
