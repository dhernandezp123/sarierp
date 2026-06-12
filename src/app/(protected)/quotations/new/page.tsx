'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { pdf } from '@react-pdf/renderer'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import QuotationPDF from '../../../../components/pdf/quotation-pdf'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { MiamiQuotationSection } from '@/src/components/quotations/MiamiQuotationSection'
import { useMiamiQuotation } from '@/src/hooks/useMiamiQuotation'
import {
  serviceProducts,
  tradeDirections,
  usesClientRates,
} from '@/src/lib/quotation-products'

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
}

type ContainerLine = {
  container_type_id: string
  container_type_name: string
  quantity: number
  notes: string | null
}

export default function NewQuotationPage() {
  const { profile } = useUser()
  const defaultValidUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const todayString = new Date().toISOString().split('T')[0]

  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [containerTypes, setContainerTypes] = useState<any[]>([])
  const [cargoLines, setCargoLines] = useState<CargoDimensionLine[]>([
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
    },
  ])
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [editingContainerLineIndex, setEditingContainerLineIndex] =
    useState<number | null>(null)
  const [containerLineForm, setContainerLineForm] = useState({
    container_type_id: '',
    container_type_name: '',
    quantity: '1',
    notes: '',
  })
  const initialFormData = {
    cliente_id: '',

    trade_direction: 'import',
    service_product: '',
    quote_type: '',
    valid_until: defaultValidUntil,

    contact_name: '',
    contact_email: '',
    contact_phone: '',
    contact_state: '',
    contact_country: '',
    preferred_carrier: '',
    transit_time: '',
    target_rate: '',
    commercial_value: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',
    delivery_address: '',

    container_type: '',
    container_qty: '',
    package_type: '',
    package_details: '',
    peso_kg: '',
    gross_weight: '',
    volumen_cbm: '',
    cantidad_bultos: '',
    commodity: '',

    requires_insurance: false,
    fob_value: '',
    freight_value: '',
    insurance_markup_percentage: '10',
    insurance_rate: '1.0',
    insurance_cost: '0',

    observaciones: '',
    pricing_notes: '',
    client_notes: '',
  }

  const [formData, setFormData] = useState(initialFormData)

  useEffect(() => {
    fetchClientes()
    fetchCatalogs()
  }, [])

  const fetchPricingUsers = async () => {
    const { data: pricingUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('rol', 'Pricing')
      .eq('is_active', true)

    return pricingUsers || []
  }

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_asignado_fkey (
          id,
          nombre,
          apellido
        )
      `)
      .is('deleted_at', null)
      .order('nombre', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setClientes(data || [])
  }

  const fetchCatalogs = async () => {
    const { data: countriesData, error: countriesError } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (countriesError) {
      toast.error(countriesError.message)
      return
    }

    const { data: portsData, error: portsError } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    if (portsError) {
      toast.error(portsError.message)
      return
    }

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
    setContainerTypes(containerTypesData || [])
  }

  const calculateInsurance = (data: any) => {
    const fob = Number(data.fob_value || 0)
    const freight = Number(data.freight_value || 0)
    const markup = Number(data.insurance_markup_percentage || 0)
    const rate = Number(data.insurance_rate || 0)

    const cost =
      ((fob + freight) * (1 + markup / 100)) * (rate / 100)

    return cost.toFixed(2)
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target

    const updatedData = {
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }

    if (
      name === 'fob_value' ||
      name === 'freight_value' ||
      name === 'insurance_markup_percentage' ||
      name === 'insurance_rate' ||
      name === 'requires_insurance'
    ) {
      updatedData.insurance_cost = calculateInsurance(updatedData)
    }

    setFormData(updatedData)
  }

  const handleClienteChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const clienteId = e.target.value

    const selectedCliente = clientes.find(
      (cliente) => cliente.id === clienteId
    )

    const updatedData = {
      ...formData,
      cliente_id: clienteId,
      contact_name: selectedCliente?.nombre || '',
      contact_email: selectedCliente?.email_1 || '',
      contact_phone: selectedCliente?.telefono || '',
      contact_state: selectedCliente?.departamento_estado || '',
      contact_country: selectedCliente?.pais || '',
      origen: selectedCliente?.origen_frecuente || formData.origen,
      insurance_rate:
        selectedCliente?.seguro_porcentaje?.toString() || '1.0',
    }

    updatedData.insurance_cost = calculateInsurance(updatedData)

    setFormData(updatedData)
  }

  const resetContainerLineForm = () => {
    setContainerLineForm({
      container_type_id: '',
      container_type_name: '',
      quantity: '1',
      notes: '',
    })
  }

  const handleAddContainerLine = () => {
    if (!containerLineForm.container_type_id) {
      toast.error('Selecciona un tipo de contenedor')
      return
    }

    const selectedType = containerTypes.find(
      (type) => type.id === containerLineForm.container_type_id
    )

    const line = {
      container_type_id: containerLineForm.container_type_id,
      container_type_name:
        selectedType?.name || containerLineForm.container_type_name,
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

  const handleEditContainerLine = (index: number) => {
    const line = containerLines[index]
    if (!line) return

    setContainerLineForm({
      container_type_id: line.container_type_id,
      container_type_name: line.container_type_name,
      quantity: String(line.quantity || 1),
      notes: line.notes || '',
    })
    setEditingContainerLineIndex(index)
  }

  const handleRemoveContainerLine = (index: number) => {
    setContainerLines((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    )

    if (editingContainerLineIndex === index) {
      setEditingContainerLineIndex(null)
      resetContainerLineForm()
    }
  }

  const clearContainerLines = () => {
    setContainerLines([])
    setEditingContainerLineIndex(null)
    resetContainerLineForm()
  }

  const handleSubmit = async (status: string) => {
    if (!formData.cliente_id) {
      toast.error('Debes seleccionar un cliente')
      return
    }

    if (!formData.service_product) {
      toast.error('Debes seleccionar el producto / servicio')
      return
    }

    if (!formData.trade_direction) {
      toast.error('Debes seleccionar la dirección comercial')
      return
    }

    const submitIsMiamiFlow = usesClientRates(formData.service_product)

    if (formData.service_product === 'miami_lcl' && miami.lclEstimated <= 0) {
      toast.error('Ingresa FT3 o libras para calcular la tarifa Miami LCL')
      return
    }

    if (formData.service_product === 'miami_air' && miami.airEstimated <= 0) {
      toast.error('Ingresa KG para calcular la tarifa Miami Aéreo')
      return
    }

    const initialStatus = submitIsMiamiFlow
      ? 'Pricing Aprobado'
      : 'Pendiente de Fijar Precios'

    if (initialStatus === 'Pendiente de Fijar Precios') {
      if (!formData.tipo_transporte) {
        toast.error('Debes seleccionar el tipo de transporte')
        return
      }

      if (!formData.quote_type) {
        toast.error('Debes seleccionar el tipo de cotización')
        return
      }

      if (requiresContainerLines && containerLines.length === 0) {
        toast.error('Agrega al menos una línea de contenedor/unidad')
        return
      }

      if (requiresCargoLines && cargoLines.length === 0) {
        toast.error('Agrega al menos una línea de carga')
        return
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (formData.valid_until) {
      const validUntilDate = new Date(formData.valid_until)
      validUntilDate.setHours(0, 0, 0, 0)

      if (validUntilDate < today) {
        toast.error('La fecha de validez no puede ser anterior a hoy')
        return
      }
    }

    const validUntil =
      formData.valid_until ||
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

    try {
      setLoading(true)

      const { data: quotation, error } = await supabase.from('quotations').insert([
        {
          cliente_id: formData.cliente_id,

          trade_direction: formData.trade_direction,
          service_product: formData.service_product || null,
          quote_type: formData.quote_type,
          valid_until: validUntil,

          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,

          preferred_carrier: formData.preferred_carrier,
          transit_time: formData.transit_time || null,
          target_rate: Number(formData.target_rate),
          commercial_value: Number(formData.commercial_value),

          incoterm: formData.incoterm,
          tipo_transporte: formData.tipo_transporte,

          origen: formData.origen,
          destino: formData.destino,
          puerto_origen: formData.puerto_origen,
          puerto_destino: formData.puerto_destino,
          pickup_address: formData.pickup_address,
          delivery_address: formData.delivery_address,

          container_type: formData.container_type,
          container_qty: Number(formData.container_qty || 0),
          package_type: formData.package_type,
          package_details: formData.package_details,
          peso_kg: submitIsMiamiFlow || requiresCargoLines
            ? totalCargoKg > 0
              ? totalCargoKg
              : null
            : Number(formData.peso_kg),
          peso_lbs:
            submitIsMiamiFlow || requiresCargoLines
              ? totalCargoWeight > 0
                ? totalCargoWeight
                : null
              : null,
          gross_weight: Number(formData.gross_weight),
          volumen_cbm: submitIsMiamiFlow || requiresCargoLines
            ? totalCargoCbm > 0
              ? totalCargoCbm
              : null
            : Number(formData.volumen_cbm),
          volumen_ft3:
            submitIsMiamiFlow || requiresCargoLines
              ? totalCargoFt3 > 0
                ? totalCargoFt3
                : null
              : null,
          cantidad_bultos:
            submitIsMiamiFlow || requiresCargoLines
              ? cargoLines.reduce(
                  (sum, line) => sum + Number(line.quantity || 0),
                  0
                )
              : Number(formData.cantidad_bultos),
          commodity: formData.commodity,

          requires_insurance: formData.requires_insurance,
          fob_value: Number(formData.fob_value),
          freight_value: Number(formData.freight_value),
          insurance_markup_percentage: Number(
            formData.insurance_markup_percentage
          ),
          insurance_rate: Number(formData.insurance_rate),
          insurance_cost: Number(formData.insurance_cost),

          pricing_notes: formData.pricing_notes || null,
          client_notes: submitIsMiamiFlow ? formData.client_notes || null : null,
          status: initialStatus,
          created_by: profile?.id,
          created_at: new Date().toISOString(),
        },
      ]).select('id, quotation_number').single()

      if (error) {
        toast.error(error.message)
        return
      }

      if (requiresContainerLines && containerLines.length > 0) {
        const rows = containerLines.map((line) => ({
          quotation_id: quotation.id,
          container_type_id: line.container_type_id,
          container_type_name: line.container_type_name,
          quantity: line.quantity,
          notes: line.notes,
        }))

        const { error: containerError } = await supabase
          .from('quotation_containers')
          .insert(rows)

        if (containerError) {
          toast.error(
            'La cotización se creó, pero no se guardaron los contenedores'
          )
          return
        }
      }

      const autoItems = miami.buildMiamiPricingItems(quotation.id)

      if (autoItems.length > 0) {
        const { error: pricingItemsError } = await supabase
          .from('pricing_items')
          .insert(autoItems)

        if (pricingItemsError) {
          toast.error(
            'La cotización se creó, pero no se pudieron aplicar las tarifas'
          )
          return
        }
      }

      const cargoRows = (submitIsMiamiFlow || requiresCargoLines ? cargoLines : [])
        .filter((line) => {
          return (
            Number(line.quantity || 0) > 0 &&
            Number(line.length || 0) > 0 &&
            Number(line.width || 0) > 0 &&
            Number(line.height || 0) > 0
          )
        })
        .map((line) => ({
          quotation_id: quotation.id,
          quantity: Number(line.quantity || 1),
          package_type: line.packageType,
          length: Number(line.length || 0),
          width: Number(line.width || 0),
          height: Number(line.height || 0),
          dimension_unit: line.dimensionUnit,
          weight_lbs: getLineUnitWeightLbs(line),
          ft3: calculateLineFt3(line),
          cbm: calculateLineCbm(line),
        }))

      if (cargoRows.length > 0) {
        const { error: cargoLinesError } = await supabase
          .from('quotation_cargo_lines')
          .insert(cargoRows)

        if (cargoLinesError) {
          toast.error(
            'La cotización se creó, pero no se pudo guardar el detalle de carga'
          )
          return
        }
      }

      toast.success('Cotización creada correctamente')

      if (initialStatus === 'Pendiente de Fijar Precios') {
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

        if (quotation) {
          await createActivityLog({
            module: 'quotations',
            action: 'send_to_pricing',
            entityType: 'quotation',
            entityId: quotation.id,
            description: `Cotización ${
              quotation.quotation_number || quotation.id
            } enviada a Pricing`,
            metadata: {
              status: initialStatus,
              cliente_id: formData.cliente_id,
            },
          })
        }
      }

      setFormData(initialFormData)
      setContainerLines([])
      setEditingContainerLineIndex(null)
      resetContainerLineForm()

      await fetchCatalogs()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
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

  const requiresContainerLines =
    formData.quote_type === 'FCL' || formData.quote_type === 'FTL'

  const requiresCargoLines =
    formData.quote_type === 'LCL' ||
    formData.quote_type === 'LTL' ||
    formData.quote_type === 'Consolidado' ||
    formData.quote_type === 'Courier'

  const fieldClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950 dark:disabled:bg-slate-900 dark:disabled:text-slate-500'

  const cardClass =
    'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]'

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
    const quantity = Number(line.quantity || 0)
    if (!quantity) return 0

    return getCbmPerUnit(line) * quantity
  }

  const calculateLineFt3 = (line: CargoDimensionLine) => {
    return calculateLineCbm(line) * 35.3147
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

  const miami = useMiamiQuotation({
    clienteId: formData.cliente_id,
    serviceProduct: formData.service_product,
    incoterm: formData.incoterm,
    totalCargoFt3,
    totalCargoCbm,
    totalCargoWeight,
    createdBy: profile?.id,
  })

  const isMiamiFlow = miami.isMiamiFlow

  const buildPreviewCargoLines = () => {
    return cargoLines
      .filter((line) => {
        return (
          Number(line.quantity || 0) > 0 &&
          Number(line.length || 0) > 0 &&
          Number(line.width || 0) > 0 &&
          Number(line.height || 0) > 0
        )
      })
      .map((line) => ({
        quantity: Number(line.quantity || 1),
        package_type: line.packageType,
        length: Number(line.length || 0),
        width: Number(line.width || 0),
        height: Number(line.height || 0),
        dimension_unit: line.dimensionUnit,
        weight_lbs: getLineUnitWeightLbs(line),
        ft3: calculateLineFt3(line),
        cbm: calculateLineCbm(line),
      }))
  }

  const buildDraftQuotation = () => {
    const selectedCliente = clientes.find(
      (cliente) => cliente.id === formData.cliente_id
    )

    const validUntil =
      formData.valid_until ||
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

    return {
      ...formData,
      id: 'preview',
      quotation_number: 'PREVIEW',
      cliente: selectedCliente || null,
      clientes: selectedCliente || null,
      created_by_profile: profile
        ? {
            nombre: profile.nombre,
            apellido: profile.apellido,
          }
        : null,
      status: 'Pricing Aprobado',
      valid_until: validUntil,
      created_at: new Date().toISOString(),
      tipo_transporte:
        formData.tipo_transporte ||
        (formData.service_product === 'miami_air' ? 'Aéreo' : 'Marítima'),
      quote_type:
        formData.quote_type ||
        (formData.service_product === 'miami_air' ? 'Consolidado' : 'LCL'),
      origen: formData.origen || 'Miami, FL',
      destino: formData.destino || formData.contact_country || 'Honduras',
      puerto_origen: formData.puerto_origen || 'Miami',
      puerto_destino: formData.puerto_destino || 'San Pedro Sula',
      transit_time: formData.transit_time || 'N/A',
      peso_kg: totalCargoKg > 0 ? totalCargoKg : null,
      gross_weight: Number(formData.gross_weight || 0),
      volumen_cbm: totalCargoCbm > 0 ? totalCargoCbm : null,
      cantidad_bultos: cargoLines.reduce(
        (sum, line) => sum + Number(line.quantity || 0),
        0
      ),
      commercial_value: Number(formData.commercial_value || 0),
      pricing_notes: formData.pricing_notes,
      client_notes: formData.client_notes,
    }
  }

  const handlePreviewMiamiPdf = async () => {
    if (!miami.canUseMiamiCalculator) return

    if (formData.service_product === 'miami_lcl' && miami.lclEstimated <= 0) {
      toast.error('Ingresa FT3 o libras para previsualizar el PDF')
      return
    }

    if (formData.service_product === 'miami_air' && miami.airEstimated <= 0) {
      toast.error('Ingresa KG para previsualizar el PDF')
      return
    }

    const blob = await pdf(
      <QuotationPDF
        quotation={buildDraftQuotation()}
        selectedAgent={null}
        pricingItems={miami.buildMiamiPreviewItems()}
        quotationContainers={[]}
        cargoLines={buildPreviewCargoLines()}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <>
      <div className="max-w-6xl">
        <h1 className="text-4xl font-bold mb-8">
          Nueva Cotización
        </h1>

        <div className="space-y-8">
          <section className={cardClass}>
            <h2 className="text-xl font-semibold mb-4">
              Información General
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <ClienteCombobox
                clientes={clientes}
                value={formData.cliente_id}
                onChange={(id) => {
                  handleClienteChange({
                    target: { name: 'cliente_id', value: id },
                  } as React.ChangeEvent<HTMLSelectElement>)
                }}
                placeholder="Seleccionar cliente"
                className={fieldClass}
              />

              <input
                value={new Date().toLocaleDateString('es-HN')}
                disabled
                className={fieldClass}
              />

              <select
                name="incoterm"
                value={formData.incoterm}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Seleccionar Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-xl font-semibold mb-4">
              Contacto del Cliente
            </h2>

            <div className="grid grid-cols-4 gap-4">
              <input
                name="contact_name"
                placeholder="Contacto"
                value={formData.contact_name}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="contact_email"
                placeholder="Email"
                value={formData.contact_email}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="contact_phone"
                placeholder="Teléfono"
                value={formData.contact_phone}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="contact_country"
                placeholder="País"
                value={formData.contact_country}
                disabled
                className={fieldClass}
              />

              <input
                name="contact_state"
                placeholder="Departamento / Estado"
                value={formData.contact_state || ''}
                disabled
                className={fieldClass}
              />
            </div>
          </section>

          <div className={cardClass}>
            <h2 className="text-lg font-semibold mb-4">
              Producto Comercial
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <select
                name="trade_direction"
                value={formData.trade_direction}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Dirección Comercial</option>

                {tradeDirections.map((direction) => (
                  <option key={direction.value} value={direction.value}>
                    {direction.label}
                  </option>
                ))}
              </select>

              <select
                name="service_product"
                value={formData.service_product}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Producto / Servicio</option>

                {serviceProducts.map((product) => (
                  <option key={product.value} value={product.value}>
                    {product.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

            <MiamiQuotationSection
              formData={formData}
              handleChange={handleChange}
              fieldClass={fieldClass}
              cardClass={cardClass}
              todayString={todayString}
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

          {!isMiamiFlow && (
          <div className={cardClass}>
            <h2 className="text-lg font-semibold mb-4">
              Tipo de Cotización
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <select
                className={fieldClass}
                value={formData.tipo_transporte}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    tipo_transporte: e.target.value,
                    quote_type: '',
                  })
                  clearContainerLines()
                }}
              >
                <option value="">Seleccionar transporte</option>
                <option value="Aéreo">Aéreo</option>
                <option value="Marítima">Marítima</option>
                <option value="Terrestre">Terrestre</option>
              </select>

              <select
                className={fieldClass}
                value={formData.quote_type}
                onChange={(e) => {
                  setFormData({ ...formData, quote_type: e.target.value })

                  if (e.target.value !== 'FCL' && e.target.value !== 'FTL') {
                    clearContainerLines()
                  }
                }}
                disabled={!formData.tipo_transporte}
              >
                <option value="">Seleccionar tipo</option>

                {(quoteTypeOptions[formData.tipo_transporte] || []).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          )}

          {false && (
          <section>
            <h2 className="text-xl font-semibold mb-4">
              Información General
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <select
                name="cliente_id"
                value={formData.cliente_id}
                onChange={handleClienteChange}
                className={fieldClass}
              >
                <option value="">Seleccionar cliente</option>

                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.codigo_cliente} - {cliente.nombre}
                  </option>
                ))}
              </select>

              

              <input
                value={new Date().toLocaleDateString('es-HN')}
                disabled
                className={fieldClass}
              />

              <select
                name="incoterm"
                value={formData.incoterm}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Seleccionar Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>

              
            </div>
          </section>
          )}


          {!isMiamiFlow && (
          <>
          <section className={cardClass}>
            <h2 className="text-xl font-semibold mb-4">
              Información del Embarque
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <input
                list="countries"
                name="origen"
                placeholder="País de origen"
                value={formData.origen}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                list="countries"
                name="destino"
                placeholder="País de destino"
                value={formData.destino}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                list="originPorts"
                name="puerto_origen"
                placeholder="Puerto origen"
                value={formData.puerto_origen}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                list="destinationPorts"
                name="puerto_destino"
                placeholder="Puerto destino"
                value={formData.puerto_destino}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="preferred_carrier"
                placeholder="Carrier de preferencia"
                value={formData.preferred_carrier || ''}
                onChange={handleChange}
                className={fieldClass}
              />

<input
  name="target_rate"
  placeholder="Target $"
  value={formData.target_rate || ''}
  onChange={handleChange}
  className={fieldClass}
/>

              <textarea
                className={`${fieldClass} min-h-24 col-span-2`}
                placeholder="Dirección de recolección EXW"
                value={formData.pickup_address}
                onChange={(e) =>
                  setFormData({ ...formData, pickup_address: e.target.value })
                }
              />

              <textarea
                className={`${fieldClass} min-h-24 col-span-2`}
                placeholder="Dirección de entrega"
                value={formData.delivery_address}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_address: e.target.value })
                }
              />
              <datalist id="countries">
                {countries.map((country) => (
                  <option
                    key={country.id}
                    value={country.name}
                  />
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
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-xl font-semibold mb-4">
              Información de Carga
            </h2>

            <div className="grid grid-cols-3 gap-4">
              {requiresContainerLines ? (
                <div className="col-span-3 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <select
                      value={containerLineForm.container_type_id}
                      onChange={(e) => {
                        const selectedType = containerTypes.find(
                          (type) => type.id === e.target.value
                        )

                        setContainerLineForm({
                          ...containerLineForm,
                          container_type_id: e.target.value,
                          container_type_name: selectedType?.name || '',
                        })
                      }}
                      className={fieldClass}
                    >
                      <option value="">Tipo de contenedor / unidad</option>

                      {containerTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>

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

                    <button
                      type="button"
                      onClick={handleAddContainerLine}
                      className="h-12 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                    >
                      {editingContainerLineIndex !== null
                        ? 'Actualizar'
                        : 'Agregar'}
                    </button>
                  </div>

                  {containerLines.length > 0 && (
                    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-950/60">
                      {containerLines.map((line, index) => (
                        <div
                          key={`${line.container_type_id}-${index}`}
                          className="flex items-center justify-between gap-4 p-3"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {line.container_type_name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              Cantidad: {line.quantity}
                              {line.notes ? ` · ${line.notes}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => handleEditContainerLine(index)}
                              className="text-sm font-semibold text-blue-600 dark:text-blue-300"
                            >
                              Modificar
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveContainerLine(index)}
                              className="text-sm font-semibold text-red-700 dark:text-red-300"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : !requiresCargoLines ? (
                <>
                  <select
                    name="container_type"
                    value={formData.container_type}
                    onChange={handleChange}
                    className={fieldClass}
                  >
                    <option value="">Tipo de contenedor / unidad</option>
                    <option value="Contenedor 20FR">Contenedor 20FR</option>
                    <option value="Contenedor 20DR">Contenedor 20DR</option>
                    <option value="Contenedor 20OT">Contenedor 20OT</option>
                    <option value="Contenedor 40DR">Contenedor 40DR</option>
                    <option value="Contenedor 40HC">Contenedor 40HC</option>
                    <option value="Contenedor 40FR">Contenedor 40FR</option>
                    <option value="Contenedor 45-102DR">
                      Contenedor 45-102DR
                    </option>
                    <option value="Contenedor 40HR">Contenedor 40HR</option>
                    <option value="Contenedor 40OT">Contenedor 40OT</option>
                    <option value="Contenedor 40NOR">Contenedor 40NOR</option>
                    <option value="Contenedor 20OT OH">Contenedor 20OT OH</option>
                    <option value="Contenedor 53'">Contenedor 53'</option>
                    <option value="Contenedor 20GP">Contenedor 20GP</option>
                    <option value="Camion 8 tons">Camion 8 tons</option>
                    <option value="Contenedor 48' FTL">
                      Contenedor 48' FTL
                    </option>
                  </select>

                  <input
                    className={fieldClass}
                    placeholder="Cantidad de contenedores / unidades"
                    value={formData.container_qty}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        container_qty: e.target.value,
                      })
                    }
                  />
                </>
              ) : null}

              {requiresCargoLines && (
                <div className="col-span-3 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        Detalle de carga
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
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
                          },
                        ])
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Agregar línea
                    </button>
                  </div>

                  {cargoLines.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                      Sin líneas de carga.
                    </div>
                  )}

                  {cargoLines.length > 0 && (
                    <div className="space-y-3">
                      {cargoLines.map((line, idx) => {
                        const lineFt3 = calculateLineFt3(line)
                        const lineCbm = calculateLineCbm(line)
                        const lineWeightUnit = getCargoWeightUnit(line)
                        const lineTotalLbs = getLineTotalWeightLbs(line)
                        const lineTotalKg = getLineTotalWeightKg(line)

                        return (
                          <div
                            key={line.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/60"
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
                                className="text-sm font-semibold text-red-700 dark:text-red-300"
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

                              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
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
                    <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                        Peso KG
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {formatNumber(totalCargoKg, 2)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                        Peso LBS
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {formatNumber(totalCargoWeight, 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                        FT3
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {formatNumber(totalCargoFt3, 2)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                        CBM
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                        {formatNumber(totalCargoCbm, 3)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!requiresCargoLines && (
              <>
              <select
                className={fieldClass}
                value={formData.package_type}
                onChange={(e) =>
                  setFormData({ ...formData, package_type: e.target.value })
                }
              >
                <option value="">Tipo de empaque</option>
                <option value="Cajas">Cajas</option>
                <option value="Pallets">Pallets</option>
                <option value="Envases">Envases</option>
                <option value="Tubos">Tubos</option>
                <option value="Cajas metálicas">Cajas metálicas</option>
                <option value="Cilindros">Cilindros</option>
                <option value="Rollos">Rollos</option>
                <option value="Sacos">Sacos</option>
                <option value="Granel">Granel</option>
                <option value="Otro">Otro</option>
              </select>

              <input
                name="peso_kg"
                placeholder="Peso KG"
                value={formData.peso_kg}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="gross_weight"
                placeholder="Peso bruto"
                value={formData.gross_weight}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="volumen_cbm"
                placeholder="CBM"
                value={formData.volumen_cbm}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="cantidad_bultos"
                placeholder="Bultos"
                value={formData.cantidad_bultos}
                onChange={handleChange}
                className={fieldClass}
              />
              </>
              )}

              <input
                name="commodity"
                placeholder="Mercancía"
                value={formData.commodity}
                onChange={handleChange}
                className={fieldClass}
              />

              <textarea
                className={`${fieldClass} min-h-24 col-span-3`}
                placeholder="Detalles del empaque / dimensiones / observaciones de carga"
                value={formData.package_details}
                onChange={(e) =>
                  setFormData({ ...formData, package_details: e.target.value })
                }
              />
            </div>
          </section>

          </>
          )}

          <section className={cardClass}>
  <h2 className="text-xl font-semibold mb-4">
    Seguro de Carga
  </h2>

  <label className="flex items-center gap-2 mb-4">
    <input
      type="checkbox"
      name="requires_insurance"
      checked={formData.requires_insurance}
      onChange={handleChange}
    />
    Cliente solicita seguro de carga
  </label>

  {formData.requires_insurance && (
    <input
      name="commercial_value"
      placeholder="Valor comercial / Valor FOB"
      value={formData.commercial_value}
      onChange={handleChange}
      className={fieldClass}
    />
  )}
</section>

          {!isMiamiFlow && (
          <section className={cardClass}>
            <h2 className="text-xl font-semibold mb-4">
              Observaciones para Pricing
            </h2>

            <textarea
              name="pricing_notes"
              value={formData.pricing_notes}
              onChange={handleChange}
              className={`${fieldClass} min-h-32`}
            />
          </section>
          )}

          {isMiamiFlow && (
            <div className={cardClass}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Observaciones para Cliente (PDF)
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Estas observaciones aparecerán en la cotización enviada al cliente.
              </p>

              <textarea
                name="client_notes"
                value={formData.client_notes}
                onChange={handleChange}
                className={`${fieldClass} mt-4 min-h-[140px]`}
                placeholder="Ej: Tarifa sujeta a disponibilidad, no incluye aduanas..."
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            {isMiamiFlow && (
              <button
                type="button"
                onClick={handlePreviewMiamiPdf}
                disabled={!miami.canUseMiamiCalculator}
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Previsualizar PDF
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSubmit('Borrador')}
              disabled={loading}
              className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Guardar Cotización
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('Pendiente de Fijar Precios')}
              disabled={loading}
              className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              {isMiamiFlow ? 'Crear cotización aprobada' : 'Enviar a Pricing'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}



