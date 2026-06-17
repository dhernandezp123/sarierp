'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../../../lib/supabase/client'
import { useUser } from '../../../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { canTransition } from '@/src/lib/quotation-status'
import { serviceProducts } from '@/src/lib/quotation-products'
import { useMiamiQuotation } from '@/src/hooks/useMiamiQuotation'
import { MiamiQuotationSection } from '@/src/components/quotations/MiamiQuotationSection'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

type CargoDimensionLine = {
  id: string
  quantity: string
  packageType: 'Caja' | 'Pallet' | 'Pieza'
  length: string
  width: string
  height: string
  dimensionUnit: 'in' | 'cm' | 'mm' | 'm'
  weight: string
  weightUnit?: 'lbs' | 'kg'
  volumeMode?: 'dimensions' | 'manual'
  manualCbm?: string | number
}

type ContainerLine = {
  container_type_id: string
  container_type_name: string
  quantity: number
  notes: string | null
}

type PricingItem = {
  id?: string
  description: string | null
  item_type: string | null
  quantity: number | string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  total_amount?: number | string | null
  taxable?: boolean | null
}

export default function EditQuotationPage() {
  const { profile, loading: userLoading } = useUser()
  const params = useParams()
  const router = useRouter()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isOperations = role === 'Operaciones'
  const isPricing = role === 'Pricing'
  const isFinance = role === 'Finanzas' || role === 'Contabilidad'

  const canEditPricing =
    isAdmin || isPricing
  const canEditCostValidation =
    isAdmin || isFinance
  const canEditFinance =
    isAdmin || isFinance
  const canEditQuotes =
    isAdmin || isSales || isOperations

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendPricingDialogOpen, setSendPricingDialogOpen] = useState(false)
  const [savingAfterEdit, setSavingAfterEdit] = useState(false)
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [packageTypes, setPackageTypes] = useState<any[]>([])
  const [containerTypes, setContainerTypes] = useState<any[]>([])
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [cargoLines, setCargoLines] = useState<CargoDimensionLine[]>([])
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([])
  const [editingContainerLineIndex, setEditingContainerLineIndex] =
    useState<number | null>(null)
  const [containerLineForm, setContainerLineForm] = useState({
    container_type_id: '',
    container_type_name: '',
    quantity: '1',
    notes: '',
  })

  const [formData, setFormData] = useState({
    cliente_id: '',
    status: '',
    service_product: '',
    quote_type: '',
    valid_until: '',

    contact_name: '',
    contact_email: '',
    contact_phone: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',
    delivery_address: '',

    preferred_carrier: '',
    transit_time: '',
    target_rate: '',

    container_type: '',
    package_type: '',
    package_details: '',
    peso_kg: '',
    gross_weight: '',
    volumen_cbm: '',
    cantidad_bultos: '',
    commodity: '',

    requires_insurance: false,
    commercial_value: '',

    pricing_notes: '',
    client_notes: '',
    observaciones: '',
  })

  useEffect(() => {
    if (userLoading) return

    if (!canEditQuotes) {
      setLoading(false)
      return
    }

    fetchCatalogs()

    if (params.id) {
      fetchQuotation(params.id as string)
      fetchContainerLines(params.id as string)
      fetchCargoLines(params.id as string)
      fetchPricingItems(params.id as string)
    }
  }, [params.id, userLoading, canEditQuotes])

  const fetchPricingUsers = async () => {
    const { data: pricingUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('rol', 'Pricing')
      .eq('is_active', true)

    return pricingUsers || []
  }

  const AccessDenied = () => (
    <>
      <div className={cardClass}>
        <h1 className="text-2xl font-bold">
          Acceso restringido
        </h1>

        <p className="text-gray-500 mt-2">
          No tienes permiso para ver este módulo.
        </p>
      </div>
    </>
  )

  const fetchCatalogs = async () => {
    const { data: countriesData } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: portsData } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: packageTypesData } = await supabase
      .from('package_types')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: containerTypesData, error: containerTypesError } =
      await supabase
        .from('container_types')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

    if (containerTypesError) {
      toast.error(containerTypesError.message)
      return
    }

    setCountries(countriesData || [])
    setPorts(portsData || [])
    setPackageTypes(packageTypesData || [])
    setContainerTypes(containerTypesData || [])
  }

  const fetchQuotation = async (id: string) => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    setFormData({
      cliente_id: data.cliente_id || '',
      status: data.status || '',
      service_product: data.service_product || '',
      quote_type: data.quote_type || '',
      valid_until: data.valid_until || '',

      contact_name: data.contact_name || '',
      contact_email: data.contact_email || '',
      contact_phone: data.contact_phone || '',

      incoterm: data.incoterm || '',
      tipo_transporte: data.tipo_transporte || '',

      origen: data.origen || '',
      destino: data.destino || '',
      puerto_origen: data.puerto_origen || '',
      puerto_destino: data.puerto_destino || '',
      pickup_address: data.pickup_address || '',
      delivery_address: data.delivery_address || '',

      preferred_carrier: data.preferred_carrier || '',
      transit_time: data.transit_time || '',
      target_rate: data.target_rate && Number(data.target_rate) !== 0 ? data.target_rate.toString() : '',

      container_type: data.container_type || '',
      package_type: data.package_type || '',
      package_details: data.package_details || '',
      peso_kg: data.peso_kg && Number(data.peso_kg) !== 0 ? data.peso_kg.toString() : '',
      gross_weight: data.gross_weight && Number(data.gross_weight) !== 0 ? data.gross_weight.toString() : '',
      volumen_cbm: data.volumen_cbm && Number(data.volumen_cbm) !== 0 ? data.volumen_cbm.toString() : '',
      cantidad_bultos: data.cantidad_bultos && Number(data.cantidad_bultos) !== 0 ? data.cantidad_bultos.toString() : '',
      commodity: data.commodity || '',

      requires_insurance: data.requires_insurance || false,
      commercial_value: data.commercial_value?.toString() || '',

      pricing_notes:
        data.pricing_notes || data.notes || data.observaciones || '',
      client_notes: data.client_notes || '',
      observaciones: data.observaciones || '',
    })

    setLoading(false)
  }

  const fetchPricingItems = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setPricingItems((data || []) as PricingItem[])
  }

  const fetchContainerLines = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setContainerLines(
      (data || []).map((line) => ({
        container_type_id: line.container_type_id || '',
        container_type_name: line.container_type_name || '',
        quantity: Number(line.quantity || 1),
        notes: line.notes || null,
      }))
    )
  }

  const fetchCargoLines = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_cargo_lines')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setCargoLines(
      (data || []).map((line) => {
        const hasDimensions =
          Number(line.length || 0) > 0 &&
          Number(line.width || 0) > 0 &&
          Number(line.height || 0) > 0
        const hasSavedCbm = Number(line.cbm || 0) > 0
        const volumeMode = !hasDimensions && hasSavedCbm ? 'manual' : 'dimensions'

        return {
          id: line.id || crypto.randomUUID(),
          quantity: String(line.quantity || 1),
          packageType: line.package_type || 'Caja',
          length: line.length ? String(line.length) : '',
          width: line.width ? String(line.width) : '',
          height: line.height ? String(line.height) : '',
          dimensionUnit: line.dimension_unit || 'in',
          weight: line.weight_lbs ? String(line.weight_lbs) : '',
          weightUnit: 'lbs',
          volumeMode,
          manualCbm: volumeMode === 'manual' ? String(line.cbm || '') : '',
        }
      })
    )
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target

    setFormData({
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    })
  }

  const handleServiceProductChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const serviceProduct = e.target.value

    setFormData((prev) => ({
      ...prev,
      service_product: serviceProduct,
      ...(serviceProduct === 'miami_lcl'
        ? {
            tipo_transporte: 'Marítima',
            quote_type: 'LCL',
          }
        : {}),
      ...(serviceProduct === 'miami_air'
        ? {
            tipo_transporte: 'Aéreo',
            quote_type: 'Consolidado',
          }
        : {}),
    }))
  }

  const resetContainerLineForm = () => {
    setContainerLineForm({
      container_type_id: '',
      container_type_name: '',
      quantity: '1',
      notes: '',
    })
  }

  const saveContainerLine = () => {
    if (!containerLineForm.container_type_id) {
      toast.error('Selecciona un tipo de contenedor')
      return
    }

    const selectedContainer = containerTypes.find(
      (container) => container.id === containerLineForm.container_type_id
    )

    const line = {
      container_type_id: containerLineForm.container_type_id,
      container_type_name:
        selectedContainer?.name || containerLineForm.container_type_name,
      quantity: Number(containerLineForm.quantity || 1),
      notes: containerLineForm.notes || null,
    }

    if (editingContainerLineIndex !== null) {
      setContainerLines((prev) =>
        prev.map((item, index) =>
          index === editingContainerLineIndex ? line : item
        )
      )
      setEditingContainerLineIndex(null)
    } else {
      setContainerLines((prev) => [...prev, line])
    }

    resetContainerLineForm()
  }

  const editContainerLine = (index: number) => {
    const line = containerLines[index]
    if (!line) return

    setContainerLineForm({
      container_type_id: line.container_type_id || '',
      container_type_name: line.container_type_name || '',
      quantity: String(line.quantity || 1),
      notes: line.notes || '',
    })
    setEditingContainerLineIndex(index)
  }

  const deleteContainerLine = (index: number) => {
    setContainerLines((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    )

    if (editingContainerLineIndex === index) {
      setEditingContainerLineIndex(null)
      resetContainerLineForm()
    }
  }

  const getCbmPerUnit = (line: CargoDimensionLine) => {
    const length = Number(line.length || 0)
    const width = Number(line.width || 0)
    const height = Number(line.height || 0)

    if (!length || !width || !height) return 0

    if (line.dimensionUnit === 'in') {
      return (length * width * height) / 61023.7441
    }

    if (line.dimensionUnit === 'cm') {
      return (length * width * height) / 1_000_000
    }

    if (line.dimensionUnit === 'mm') {
      return (length * width * height) / 1_000_000_000
    }

    if (line.dimensionUnit === 'm') {
      return length * width * height
    }

    return 0
  }

  const calculateLineCbm = (line: CargoDimensionLine) => {
    if ((line.volumeMode || 'dimensions') === 'manual') {
      return Number(line.manualCbm || 0)
    }

    const quantity = Number(line.quantity || 0)
    if (!quantity) return 0

    return getCbmPerUnit(line) * quantity
  }

  const calculateLineFt3 = (line: CargoDimensionLine) => {
    return calculateLineCbm(line) * 35.3147
  }

  const getCargoVolumeMode = (line: CargoDimensionLine) =>
    line.volumeMode || 'dimensions'

  const hasLineVolume = (line: CargoDimensionLine) => {
    if (getCargoVolumeMode(line) === 'manual') {
      return Number(line.manualCbm || 0) > 0
    }

    return (
      Number(line.length || 0) > 0 &&
      Number(line.width || 0) > 0 &&
      Number(line.height || 0) > 0
    )
  }

  const getCargoWeightUnit = (line: CargoDimensionLine) =>
    line.weightUnit || 'lbs'

  const getLineUnitWeightLbs = (line: CargoDimensionLine) => {
    const weight = Number(line.weight || 0)
    return getCargoWeightUnit(line) === 'kg' ? weight * 2.20462 : weight
  }

  const getLineUnitWeightKg = (line: CargoDimensionLine) => {
    const weight = Number(line.weight || 0)
    return getCargoWeightUnit(line) === 'kg' ? weight : weight / 2.20462
  }

  const getLineTotalWeightLbs = (line: CargoDimensionLine) =>
    getLineUnitWeightLbs(line) * Number(line.quantity || 0)

  const getLineTotalWeightKg = (line: CargoDimensionLine) =>
    getLineUnitWeightKg(line) * Number(line.quantity || 0)

  const handleSendToPricing = async () => {
    if (!params.id) return

    const oldStatus = formData.status || 'Borrador'
    const nextStatus = 'Pendiente de Fijar Precios'

    if (oldStatus === 'Ganada') {
      toast.error('Usa la acción "Reabrir para Repricing" desde el detalle de la cotización.')
      return
    }

    if (!canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    if (!formData.commodity.trim()) {
      toast.error('Debes ingresar Commodity/Descripción de la carga')
      return
    }

    if (!formData.tipo_transporte) {
      toast.error('Debes seleccionar el tipo de transporte')
      return
    }

    if (!formData.quote_type) {
      toast.error('Debes seleccionar el tipo de cotización')
      return
    }

    if (requiresContainerLines && containerLines.length === 0) {
      toast.error('Debes agregar al menos un contenedor/unidad')
      return
    }

    const { error } = await supabase
      .from('quotations')
      .update({ status: nextStatus })
      .eq('id', params.id as string)

    if (error) {
      toast.error(error.message)
      return
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: params.id as string,
        old_status: oldStatus,
        new_status: nextStatus,
        changed_by: profile?.id,
      },
    ])

    const quotationId = params.id as string
    const pricingUsers = await fetchPricingUsers()

    await Promise.all(
      pricingUsers.map((pricingUser) =>
        createNotification({
          userId: pricingUser.id,
          title: 'Nueva cotización para pricing',
          message: 'Se recibió una nueva solicitud de cotización.',
          type: 'info',
        })
      )
    )

    await createActivityLog({
      module: 'quotations',
      action: 'resend_to_pricing',
      entityType: 'quotation',
      entityId: quotationId,
      description: 'Cotización actualizada y enviada nuevamente a Pricing',
    })

    setFormData({
      ...formData,
      status: nextStatus,
    })

    toast.success('Cotización enviada a Pricing correctamente')
    router.push(`/quotations/${params.id}`)
  }

  const handleSave = async () => {
    if (!params.id) return

    if (!formData.commodity.trim()) {
      toast.error('Debes ingresar Commodity/Descripción de la carga')
      return
    }

    const saveRequiresContainerLines =
      formData.quote_type === 'FCL' || formData.quote_type === 'FTL'
    const saveRequiresLooseCargo =
      formData.quote_type === 'LCL' ||
      formData.quote_type === 'LTL' ||
      formData.quote_type === 'Consolidado' ||
      formData.quote_type === 'Courier' ||
      formData.service_product === 'miami_lcl' ||
      formData.service_product === 'miami_air'

    if (saveRequiresContainerLines && containerLines.length === 0) {
      toast.error('Debes agregar al menos un contenedor/unidad')
      return
    }

    if (saveRequiresLooseCargo && cargoLines.length === 0) {
      toast.error('Debes agregar al menos una línea de carga')
      return
    }

    const quotationId = params.id as string
    const saveIsMiamiFlow =
      formData.service_product === 'miami_lcl' ||
      formData.service_product === 'miami_air'

    if (formData.service_product === 'miami_lcl' && miami.lclEstimated <= 0) {
      toast.error('Ingresa FT3 o libras para calcular la tarifa Miami LCL')
      return
    }

    if (formData.service_product === 'miami_air' && miami.airEstimated <= 0) {
      toast.error('Ingresa KG para calcular la tarifa Miami Aereo')
      return
    }

    const miamiPricingItems = saveIsMiamiFlow
      ? miami.buildMiamiPricingItems(quotationId)
      : []
    const miamiTotalCost = miamiPricingItems.reduce(
      (sum, item) =>
        sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
      0
    )
    const miamiTotalSale = miamiPricingItems.reduce(
      (sum, item) =>
        sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
      0
    )
    const miamiProfit = miamiTotalSale - miamiTotalCost
    const miamiGpPercentage =
      miamiTotalSale > 0 ? (miamiProfit / miamiTotalSale) * 100 : 0

    setSaving(true)

    try {
      const quotationPayload = {
        service_product: formData.service_product || null,
        quote_type: formData.quote_type,
        valid_until: formData.valid_until || null,

        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,

        incoterm: formData.incoterm,
        tipo_transporte: formData.tipo_transporte,

        origen: formData.origen,
        destino: formData.destino,
        puerto_origen: formData.puerto_origen,
        puerto_destino: formData.puerto_destino,
        pickup_address: formData.pickup_address,
        delivery_address: formData.delivery_address,

        preferred_carrier: formData.preferred_carrier,
        transit_time: formData.transit_time || null,
        target_rate: Number(formData.target_rate || 0),

        container_type: formData.container_type,
        package_type: formData.package_type,
        package_details: formData.package_details,
        peso_kg: saveRequiresLooseCargo
          ? totalCargoKg > 0
            ? totalCargoKg
            : null
          : Number(formData.peso_kg || 0),
        peso_lbs: saveRequiresLooseCargo
          ? totalCargoWeight > 0
            ? totalCargoWeight
            : null
          : null,
        gross_weight: Number(formData.gross_weight || 0),
        volumen_cbm: saveRequiresLooseCargo
          ? totalCargoCbm > 0
            ? totalCargoCbm
            : null
          : Number(formData.volumen_cbm || 0),
        volumen_ft3: saveRequiresLooseCargo
          ? totalCargoFt3 > 0
            ? totalCargoFt3
            : null
          : null,
        cantidad_bultos: saveRequiresLooseCargo
          ? totalCargoPackages
          : Number(formData.cantidad_bultos || 0),
        commodity: formData.commodity,

        requires_insurance: formData.requires_insurance,
        commercial_value: Number(formData.commercial_value || 0),

        pricing_notes: formData.pricing_notes || null,
        ...(isMiamiFlow
          ? { client_notes: formData.client_notes || null }
          : {}),
        ...(saveIsMiamiFlow
          ? {
              status: 'Pricing Aprobado',
              total_cost: miamiTotalCost,
              total_sale: miamiTotalSale,
              profit_amount: miamiProfit,
              gp_percentage: miamiGpPercentage,
              pricing_approved: true,
              pricing_approved_by: profile?.id,
              pricing_approved_at: new Date().toISOString(),
            }
          : {}),
      }

      const { error } = await supabase
        .from('quotations')
        .update(quotationPayload)
        .eq('id', quotationId)

      if (error) {
        toast.error(error.message)
        return
      }

      if (saveRequiresContainerLines) {
        const { error: cargoDeleteError } = await supabase
          .from('quotation_cargo_lines')
          .delete()
          .eq('quotation_id', quotationId)

        if (cargoDeleteError) {
          toast.error('No se pudieron reemplazar las líneas de carga')
          return
        }

        const { error: containerDeleteError } = await supabase
          .from('quotation_containers')
          .delete()
          .eq('quotation_id', quotationId)

        if (containerDeleteError) {
          toast.error(containerDeleteError.message)
          return
        }

        const rows = containerLines.map((line) => ({
          quotation_id: quotationId,
          container_type_id: line.container_type_id,
          container_type_name: line.container_type_name,
          quantity: Number(line.quantity || 1),
          notes: line.notes || null,
        }))

        const { error: containerInsertError } = await supabase
          .from('quotation_containers')
          .insert(rows)

        if (containerInsertError) {
          toast.error(containerInsertError.message)
          return
        }
      }

      if (saveRequiresLooseCargo) {
        const { error: containerDeleteError } = await supabase
          .from('quotation_containers')
          .delete()
          .eq('quotation_id', quotationId)

        if (containerDeleteError) {
          toast.error(containerDeleteError.message)
          return
        }

        const { error: cargoDeleteError } = await supabase
          .from('quotation_cargo_lines')
          .delete()
          .eq('quotation_id', quotationId)

        if (cargoDeleteError) {
          toast.error('No se pudieron reemplazar las líneas de carga')
          return
        }

        const rows = cargoLines.map((line) => ({
          quotation_id: quotationId,
          package_type: line.packageType,
          quantity: Number(line.quantity || 0),
          length: Number(line.length || 0),
          width: Number(line.width || 0),
          height: Number(line.height || 0),
          dimension_unit: line.dimensionUnit,
          weight_lbs: getLineUnitWeightLbs(line),
          ft3: calculateLineFt3(line),
          cbm: calculateLineCbm(line),
        }))

        const { error: cargoInsertError } = await supabase
          .from('quotation_cargo_lines')
          .insert(rows)

        if (cargoInsertError) {
          toast.error(cargoInsertError.message)
          return
        }
      }

      if (saveIsMiamiFlow) {
        const { error: pricingDeleteError } = await supabase
          .from('pricing_items')
          .delete()
          .eq('quotation_id', quotationId)

        if (pricingDeleteError) {
          toast.error('No se pudieron reemplazar los cargos Miami')
          return
        }

        if (miamiPricingItems.length > 0) {
          const { error: pricingInsertError } = await supabase
            .from('pricing_items')
            .insert(miamiPricingItems)

          if (pricingInsertError) {
            toast.error(pricingInsertError.message)
            return
          }

          setPricingItems(miamiPricingItems as PricingItem[])
        } else {
          setPricingItems([])
        }
      }

      toast.success('Cambios guardados correctamente')

      if (!saveIsMiamiFlow && formData.status === 'Borrador') {
        setSendPricingDialogOpen(true)
        return
      }
      router.push(`/quotations/${params.id}`)
    } finally {
      setSaving(false)
    }
  }

  const totalCargoFt3 = cargoLines.reduce(
    (sum, line) => sum + calculateLineFt3(line),
    0
  )

  const totalCargoCbm = cargoLines.reduce(
    (sum, line) => sum + calculateLineCbm(line),
    0
  )

  const totalCargoWeight = cargoLines.reduce(
    (sum, line) => sum + getLineTotalWeightLbs(line),
    0
  )

  const totalCargoKg = cargoLines.reduce(
    (sum, line) => sum + getLineTotalWeightKg(line),
    0
  )
  const totalCargoPackages = cargoLines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0
  )

  const miami = useMiamiQuotation({
    clienteId: formData.cliente_id,
    serviceProduct: formData.service_product,
    incoterm: formData.incoterm,
    totalCargoFt3,
    totalCargoCbm,
    totalCargoWeight,
    createdBy: profile?.id,
    initialPricingItems: pricingItems,
  })

  if (userLoading || loading) {
    return <div className="p-8">Cargando cotización...</div>
  }

  if (!canEditQuotes) {
    return <AccessDenied />
  }

  const originCountry = countries.find(
    (country) => country.name === formData.origen
  )

  const destinationCountry = countries.find(
    (country) => country.name === formData.destino
  )

  const originPorts = originCountry
    ? ports.filter((port) => port.country_id === originCountry.id)
    : ports

  const destinationPorts = destinationCountry
    ? ports.filter((port) => port.country_id === destinationCountry.id)
    : ports

  const quoteTypeOptions: Record<string, string[]> = {
    'Aéreo': ['Courier', 'Consolidado'],
    'Marítima': ['LCL', 'FCL'],
    Terrestre: ['LTL', 'FTL'],
  }

  const packageTypeOptions =
    packageTypes.length > 0
      ? packageTypes.map((packageType) => packageType.name)
      : [
          'Cajas',
          'Pallets',
          'Envases',
          'Tubos',
          'Cajas metálicas',
          'Cilindros',
          'Rollos',
          'Sacos',
          'Granel',
          'Otro',
        ]

  const formLabelClass =
    'text-xs font-medium text-slate-500 dark:text-slate-400'
  const sectionTitleClass = 'text-xl font-bold text-slate-900'

  const fieldGroupClass = 'flex flex-col gap-1.5'
  const compactFieldClass = `${fieldClass} md:max-w-[180px]`
  const moneyFieldClass = `${fieldClass} md:max-w-[220px]`
  const dateFieldClass = `${fieldClass} md:max-w-[220px]`
  const shortTextFieldClass = `${fieldClass} md:max-w-[260px]`
  const mediumFieldClass = `${fieldClass} md:max-w-xl`

  const requiresContainerLines =
    formData.quote_type === 'FCL' || formData.quote_type === 'FTL'

  const isMiamiFlow = miami.isMiamiFlow

  const requiresLooseCargo =
    formData.quote_type === 'LCL' ||
    formData.quote_type === 'LTL' ||
    formData.quote_type === 'Consolidado' ||
    formData.quote_type === 'Courier' ||
    isMiamiFlow

  return (
    <>
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold">Editar Cotización</h1>
          <p className="text-gray-500 mt-2">
            Modifica datos de la cotización sin recrear el flujo completo.
          </p>
        </div>

        <div className={cardClass}>
          <div className="space-y-8">
          {!canEditQuotes && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Modo lectura: tu rol no tiene permisos para editar cotizaciones.
            </p>
          )}

          <fieldset disabled={!canEditQuotes} className="contents">
          <section>
            <h2 className="text-xl font-bold mb-4">Información General</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Transporte</label>
              <select
                name="tipo_transporte"
                value={formData.tipo_transporte || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tipo_transporte: e.target.value,
                    quote_type: '',
                  })
                }
                className={fieldClass}
              >
                <option value="">Transporte</option>
                <option value="Aéreo">Aéreo</option>
                <option value="Marítima">Marítima</option>
                <option value="Terrestre">Terrestre</option>
              </select>
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Tipo de cotización</label>
              <select
                name="quote_type"
                value={formData.quote_type || ''}
                onChange={handleChange}
                disabled={!formData.tipo_transporte}
                className={fieldClass}
              >
                <option value="">Tipo de cotización</option>

                {(quoteTypeOptions[formData.tipo_transporte] || []).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              </div>

              {isMiamiFlow && (
                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Producto / servicio Miami</label>
                <select
                  name="service_product"
                  value={formData.service_product || ''}
                  onChange={handleServiceProductChange}
                  className={fieldClass}
                >
                  {serviceProducts
                    .filter((product) =>
                      ['miami_lcl', 'miami_air'].includes(product.value)
                    )
                    .map((product) => (
                      <option key={product.value} value={product.value}>
                        {product.label}
                      </option>
                    ))}
                </select>
                </div>
              )}

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Válida hasta</label>
              <input
                type="date"
                name="valid_until"
                value={formData.valid_until || ''}
                onChange={handleChange}
                className={dateFieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Incoterm</label>
              <select
                name="incoterm"
                value={formData.incoterm || ''}
                onChange={handleChange}
                className={compactFieldClass}
              >
                <option value="">Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Nombre de contacto</label>
              <input
                name="contact_name"
                placeholder="Nombre de contacto"
                value={formData.contact_name || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Email de contacto</label>
              <input
                name="contact_email"
                placeholder="Email de contacto"
                value={formData.contact_email || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Teléfono de contacto</label>
              <input
                name="contact_phone"
                placeholder="Teléfono de contacto"
                value={formData.contact_phone || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

            </div>
          </section>

          <section className="pt-3">
            <h2 className="text-xl font-bold mb-4">Ruta</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Origen</label>
                <input list="countries" name="origen" placeholder="Origen" value={formData.origen || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Destino</label>
                <input list="countries" name="destino" placeholder="Destino" value={formData.destino || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Puerto origen</label>
                <input list="originPorts" name="puerto_origen" placeholder="Puerto origen" value={formData.puerto_origen || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Puerto destino</label>
                <input list="destinationPorts" name="puerto_destino" placeholder="Puerto destino" value={formData.puerto_destino || ''} onChange={handleChange} className={fieldClass} />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Dirección de entrega</label>
              <textarea
                name="delivery_address"
                placeholder="Dirección de entrega"
                value={formData.delivery_address || ''}
                onChange={handleChange}
                className={`${fieldClass} min-h-12`}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Naviera de preferencia</label>
              <input
                name="preferred_carrier"
                placeholder="Naviera de preferencia"
                value={formData.preferred_carrier || ''}
                onChange={handleChange}
                className={shortTextFieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Tiempo de tránsito</label>
              <input
                name="transit_time"
                placeholder="Tiempo de tránsito"
                value={formData.transit_time || ''}
                onChange={handleChange}
                className={compactFieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Target rate</label>
              <input
                name="target_rate"
                placeholder="Target rate"
                value={formData.target_rate || ''}
                onChange={handleChange}
                className={moneyFieldClass}
              />
              </div>

              {formData.incoterm === 'EXW' && (
                <div className={`${fieldGroupClass} md:col-span-2`}>
                  <label className={formLabelClass}>Dirección de recolección EXW</label>
                <textarea
                  name="pickup_address"
                  placeholder="Dirección de recolección EXW"
                  value={formData.pickup_address || ''}
                  onChange={handleChange}
                  className={`${fieldClass} min-h-12`}
                />
                </div>
              )}
            </div>
          </section>

          <section className="pt-3">
            <h2 className="text-xl font-bold mb-4">Carga</h2>

            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className={fieldGroupClass}>
                    <label className={formLabelClass}>Commodity / descripción de la carga</label>
                    <input
                      name="commodity"
                      placeholder="Commodity/Descripción de la carga *"
                      value={formData.commodity || ''}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className={fieldGroupClass}>
                    <label className={formLabelClass}>Tipo de empaque</label>
                    <select
                      name="package_type"
                      value={formData.package_type || ''}
                      onChange={handleChange}
                      className={fieldClass}
                    >
                      <option value="">Seleccionar</option>
                      {packageTypeOptions.map((packageType) => (
                        <option key={packageType} value={packageType}>
                          {packageType}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Detalles del empaque / observaciones de carga</label>
                  <textarea
                    name="package_details"
                    placeholder="Detalles del empaque / dimensiones / observaciones de carga"
                    value={formData.package_details || ''}
                    onChange={handleChange}
                    className={`${fieldClass} min-h-[132px]`}
                  />
                </div>
              </div>

              {requiresContainerLines && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className={fieldGroupClass}>
                      <label className={formLabelClass}>Tipo de contenedor / unidad</label>
                    <select
                      value={containerLineForm.container_type_id}
                      onChange={(e) => {
                        const selectedContainer = containerTypes.find(
                          (container) => container.id === e.target.value
                        )

                        setContainerLineForm({
                          ...containerLineForm,
                          container_type_id: e.target.value,
                          container_type_name: selectedContainer?.name || '',
                        })
                      }}
                      className={fieldClass}
                    >
                      <option value="">Tipo de contenedor / unidad</option>

                      {containerTypes.map((container) => (
                        <option key={container.id} value={container.id}>
                          {container.name}
                        </option>
                      ))}
                    </select>
                    </div>

                    <div className={fieldGroupClass}>
                      <label className={formLabelClass}>Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Cantidad"
                      value={containerLineForm.quantity}
                      onChange={(e) =>
                        setContainerLineForm({
                          ...containerLineForm,
                          quantity: e.target.value,
                        })
                      }
                      className={fieldClass}
                    />
                    </div>

                    <div className={fieldGroupClass}>
                      <label className={formLabelClass}>Notas</label>
                    <input
                      placeholder="Notas"
                      value={containerLineForm.notes}
                      onChange={(e) =>
                        setContainerLineForm({
                          ...containerLineForm,
                          notes: e.target.value,
                        })
                      }
                      className={fieldClass}
                    />
                    </div>

                    <button
                      type="button"
                      onClick={saveContainerLine}
                      className={primaryButtonClass}
                    >
                      {editingContainerLineIndex !== null
                        ? 'Actualizar'
                        : 'Agregar'}
                    </button>
                  </div>

                  {containerLines.length > 0 && (
                    <div className="divide-y rounded-xl border border-slate-200 bg-white">
                      {containerLines.map((line, index) => (
                        <div
                          key={`${line.container_type_id}-${index}`}
                          className="flex items-center justify-between gap-4 p-3"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {line.container_type_name}
                            </p>
                            <p className="text-sm text-slate-500">
                              Cantidad: {line.quantity}
                              {line.notes ? ` · ${line.notes}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => editContainerLine(index)}
                              className={secondaryButtonClass}
                            >
                              Modificar
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteContainerLine(index)}
                              className={secondaryButtonClass}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {requiresLooseCargo && !isMiamiFlow && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Detalle de carga
                      </h3>
                      <p className="text-sm text-slate-500">
                        Ingresa paquetes, peso y dimensiones para calcular totales informativos.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCargoLines((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            quantity: '1',
                            packageType: 'Caja',
                            length: '',
                            width: '',
                            height: '',
                            dimensionUnit: 'in',
                            weight: '',
                            weightUnit: 'lbs',
                            volumeMode: 'dimensions',
                            manualCbm: '',
                          },
                        ])
                      }
                      className={secondaryButtonClass}
                    >
                      Agregar línea
                    </button>
                  </div>

                  {cargoLines.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                      Sin líneas de carga.
                    </div>
                  )}

                  {cargoLines.length > 0 && (
                    <div className="space-y-3">
                      {cargoLines.map((line, idx) => {
                        const lineFt3 = calculateLineFt3(line)
                        const lineCbm = calculateLineCbm(line)
                        const lineWeightUnit = getCargoWeightUnit(line)
                        const lineVolumeMode = getCargoVolumeMode(line)
                        const lineTotalLbs = getLineTotalWeightLbs(line)
                        const lineTotalKg = getLineTotalWeightKg(line)

                        return (
                          <div
                            key={line.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-600">
                                Línea #{idx + 1}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  setCargoLines((prev) =>
                                    prev.filter((item) => item.id !== line.id)
                                  )
                                }
                                className={secondaryButtonClass}
                              >
                                Quitar
                              </button>
                            </div>

                            <div className="grid gap-3 md:grid-cols-4">
                              <select
                                value={line.packageType}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? {
                                            ...item,
                                            packageType:
                                              e.target.value as CargoDimensionLine['packageType'],
                                          }
                                        : item
                                    )
                                  )
                                }
                                className={fieldClass}
                              >
                                <option>Caja</option>
                                <option>Pallet</option>
                                <option>Pieza</option>
                              </select>

                              <input
                                type="number"
                                min="1"
                                placeholder="Cantidad"
                                value={line.quantity}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, quantity: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                className={fieldClass}
                              />

                              <select
                                value={lineVolumeMode}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? {
                                            ...item,
                                            volumeMode:
                                              e.target.value as CargoDimensionLine['volumeMode'],
                                          }
                                        : item
                                    )
                                  )
                                }
                                className={fieldClass}
                              >
                                <option value="dimensions">
                                  Calcular por dimensiones
                                </option>
                                <option value="manual">
                                  Ingresar CBM manual
                                </option>
                              </select>

                              {lineVolumeMode === 'dimensions' ? (
                                <select
                                  value={line.dimensionUnit}
                                  onChange={(e) =>
                                    setCargoLines((prev) =>
                                      prev.map((item) =>
                                        item.id === line.id
                                          ? {
                                              ...item,
                                              dimensionUnit:
                                                e.target.value as CargoDimensionLine['dimensionUnit'],
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className={fieldClass}
                                >
                                  <option value="in">Pulgadas (in)</option>
                                  <option value="cm">Centímetros (cm)</option>
                                  <option value="mm">Milímetros (mm)</option>
                                  <option value="m">Metros (m)</option>
                                </select>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="CBM total de la línea"
                                    value={line.manualCbm || ''}
                                    onChange={(e) =>
                                      setCargoLines((prev) =>
                                        prev.map((item) =>
                                          item.id === line.id
                                            ? {
                                                ...item,
                                                manualCbm: e.target.value,
                                              }
                                            : item
                                        )
                                      )
                                    }
                                    className={fieldClass}
                                  />
                                  <span className="text-xs text-slate-500">
                                    CBM total de la línea
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-[1fr_92px] gap-2">
                                <input
                                  type="number"
                                  placeholder={`Peso unitario ${lineWeightUnit}`}
                                  value={line.weight}
                                  onChange={(e) =>
                                    setCargoLines((prev) =>
                                      prev.map((item) =>
                                        item.id === line.id
                                          ? { ...item, weight: e.target.value }
                                          : item
                                      )
                                    )
                                  }
                                  className={fieldClass}
                                />

                                <select
                                  value={lineWeightUnit}
                                  onChange={(e) =>
                                    setCargoLines((prev) =>
                                      prev.map((item) =>
                                        item.id === line.id
                                          ? {
                                              ...item,
                                              weightUnit:
                                                e.target.value as CargoDimensionLine['weightUnit'],
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className={fieldClass}
                                >
                                  <option value="lbs">LBS</option>
                                  <option value="kg">KG</option>
                                </select>
                              </div>

                              {lineVolumeMode === 'dimensions' && (
                                <>
                                  <input
                                    type="number"
                                    placeholder="Largo"
                                    value={line.length}
                                    onChange={(e) =>
                                      setCargoLines((prev) =>
                                        prev.map((item) =>
                                          item.id === line.id
                                            ? { ...item, length: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    className={fieldClass}
                                  />

                                  <input
                                    type="number"
                                    placeholder="Ancho"
                                    value={line.width}
                                    onChange={(e) =>
                                      setCargoLines((prev) =>
                                        prev.map((item) =>
                                          item.id === line.id
                                            ? { ...item, width: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    className={fieldClass}
                                  />

                                  <input
                                    type="number"
                                    placeholder="Alto"
                                    value={line.height}
                                    onChange={(e) =>
                                      setCargoLines((prev) =>
                                        prev.map((item) =>
                                          item.id === line.id
                                            ? { ...item, height: e.target.value }
                                            : item
                                        )
                                      )
                                    }
                                    className={fieldClass}
                                  />
                                </>
                              )}

                              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                                KG {formatNumber(lineTotalKg, 2)} · LBS{' '}
                                {formatNumber(lineTotalLbs, 0)} · FT3{' '}
                                {formatNumber(lineFt3, 2)} · CBM{' '}
                                {formatNumber(lineCbm, 3)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Peso KG
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatNumber(totalCargoKg, 2)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Peso LBS
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatNumber(totalCargoWeight, 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        FT3
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatNumber(totalCargoFt3, 2)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        CBM
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatNumber(totalCargoCbm, 3)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <MiamiQuotationSection
                formData={formData}
                handleChange={handleChange}
                fieldClass={fieldClass}
                cardClass={cardClass}
                todayString={new Date().toISOString().split('T')[0]}
                cargoLines={cargoLines}
                setCargoLines={setCargoLines}
                calculateLineCbm={calculateLineCbm}
                calculateLineFt3={calculateLineFt3}
                totalCargoFt3={totalCargoFt3}
                totalCargoCbm={totalCargoCbm}
                totalCargoWeight={totalCargoWeight}
                formatNumber={formatNumber}
                miami={miami}
              />
            </div>
          </section>

          <section className="pt-6">
            <h2 className="text-xl font-bold mb-4">Seguro de Carga</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  name="requires_insurance"
                  checked={formData.requires_insurance}
                  onChange={handleChange}
                />
                <span className="text-sm font-medium text-slate-700">
                  Cliente solicita seguro de carga
                </span>
              </label>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500">
                  Valor FOB / valor comercial (USD)
                </label>
                <input
                  name="commercial_value"
                  placeholder="0.00"
                  value={formData.commercial_value || ''}
                  onChange={handleChange}
                  className={moneyFieldClass}
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Pricing usa este valor FOB para calcular el seguro de carga.
            </p>
          </section>

          <div className={`grid gap-4 ${isMiamiFlow ? 'lg:grid-cols-2' : ''}`}>
            <section className={cardClass}>
              <h2 className={`${sectionTitleClass} mb-4`}>
                Observaciones internas para Pricing
              </h2>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Notas internas para Pricing</label>
                <textarea
                  name="pricing_notes"
                  value={formData.pricing_notes || ''}
                  onChange={handleChange}
                  className={`${fieldClass} min-h-36`}
                />
              </div>
            </section>

            {isMiamiFlow && (
              <section className={cardClass}>
                <h2 className={`${sectionTitleClass} mb-4`}>
                  Observaciones para Cliente (PDF)
                </h2>

                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Notas comerciales para el PDF</label>
                  <textarea
                    name="client_notes"
                    value={formData.client_notes || ''}
                    onChange={handleChange}
                    className={`${fieldClass} min-h-36`}
                    placeholder="Ej: Tarifa sujeta a disponibilidad, no incluye aduanas..."
                  />
                </div>
              </section>
            )}
          </div>

          <datalist id="countries">
            {countries.map((country) => (
              <option key={country.id} value={country.name} />
            ))}
          </datalist>

          <datalist id="originPorts">
            {originPorts.map((port) => (
              <option key={port.id} value={port.name} />
            ))}
          </datalist>

          <datalist id="destinationPorts">
            {destinationPorts.map((port) => (
              <option key={port.id} value={port.name} />
            ))}
          </datalist>
          </fieldset>

          <div className="flex justify-end gap-4">
            <button
              onClick={() => router.push(`/quotations/${params.id}`)}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>

            {canEditQuotes && formData.status === 'Borrador' && (
              <button
                onClick={handleSendToPricing}
                disabled={saving}
                className={primaryButtonClass}
              >
                Enviar a Pricing
              </button>
            )}

            {canEditQuotes && (
              <button
                onClick={handleSave}
                disabled={saving}
                className={primaryButtonClass}
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
      <Dialog
        open={sendPricingDialogOpen}
        onOpenChange={setSendPricingDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar cotización a Pricing</DialogTitle>
            <DialogDescription>
              Los cambios fueron guardados correctamente. ¿Deseas enviar esta cotización al equipo de Pricing?
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSendPricingDialogOpen(false)}
              className={secondaryButtonClass}
            >
              No, continuar editando
            </button>

            <button
              type="button"
              disabled={savingAfterEdit}
              onClick={async () => {
                setSavingAfterEdit(true)

                await handleSendToPricing()

                setSavingAfterEdit(false)
                setSendPricingDialogOpen(false)
              }}
              className={primaryButtonClass}
            >
              {savingAfterEdit ? 'Enviando...' : 'Sí, enviar a Pricing'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

