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
import { fieldClass, cardClass } from '@/src/lib/ui-classes'

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
      dimensionUnit: 'm',
      weight: '',
      weightUnit: 'lbs',
      volumeMode: 'dimensions',
      manualCbm: '',
    },
  ])
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [duplicateSource, setDuplicateSource] = useState<{
    id: string
    quotation_number: string | null
  } | null>(null)
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
  const [submitted, setSubmitted] = useState(false)

  // Returns red border class if field is required, form was submitted, and value is empty
  const reqClass = (value: string) =>
    submitted && !value
      ? 'border-red-400 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-700'
      : ''

  useEffect(() => {
    fetchClientes()
    fetchCatalogs()
  }, [])

  useEffect(() => {
    const duplicateFromId = new URLSearchParams(window.location.search).get(
      'duplicateFrom'
    )

    if (duplicateFromId) {
      loadDuplicateSource(duplicateFromId)
    }
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

  const toFormString = (value: unknown) =>
    value === null || value === undefined ? '' : String(value)

  const getReusableValidUntil = (value?: string | null) => {
    if (!value) return defaultValidUntil

    const dateValue = value.split('T')[0]
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const validUntilDate = new Date(dateValue)
    validUntilDate.setHours(0, 0, 0, 0)

    return validUntilDate < today ? defaultValidUntil : dateValue
  }

  const toPackageType = (
    value?: string | null
  ): CargoDimensionLine['packageType'] => {
    if (value === 'Pallet' || value === 'Pieza') return value
    return 'Caja'
  }

  const loadDuplicateSource = async (quotationId: string) => {
    setLoading(true)

    try {
      const [
        { data: sourceQuote, error: quoteError },
        { data: sourceContainers, error: containerError },
        { data: sourceCargoLines, error: cargoError },
      ] = await Promise.all([
        supabase
          .from('quotations')
          .select('*')
          .eq('id', quotationId)
          .is('deleted_at', null)
          .single(),
        supabase
          .from('quotation_containers')
          .select('*')
          .eq('quotation_id', quotationId)
          .order('created_at', { ascending: true }),
        supabase
          .from('quotation_cargo_lines')
          .select('*')
          .eq('quotation_id', quotationId)
          .order('created_at', { ascending: true }),
      ])

      if (quoteError || !sourceQuote) {
        toast.error('No se pudo cargar la cotización a duplicar')
        return
      }

      if (containerError) {
        toast.error(containerError.message)
      }

      if (cargoError) {
        toast.error(cargoError.message)
      }

      setDuplicateSource({
        id: sourceQuote.id,
        quotation_number: sourceQuote.quotation_number,
      })
      setFormData({
        cliente_id: toFormString(sourceQuote.cliente_id),
        trade_direction: sourceQuote.trade_direction || 'import',
        service_product: sourceQuote.service_product || '',
        quote_type: sourceQuote.quote_type || '',
        valid_until: getReusableValidUntil(sourceQuote.valid_until),
        contact_name: sourceQuote.contact_name || '',
        contact_email: sourceQuote.contact_email || '',
        contact_phone: sourceQuote.contact_phone || '',
        contact_state: sourceQuote.contact_state || '',
        contact_country: sourceQuote.contact_country || '',
        preferred_carrier: sourceQuote.preferred_carrier || '',
        transit_time: toFormString(sourceQuote.transit_time),
        target_rate: toFormString(sourceQuote.target_rate),
        commercial_value: toFormString(
          sourceQuote.commercial_value || sourceQuote.fob_value
        ),
        incoterm: sourceQuote.incoterm || '',
        tipo_transporte: sourceQuote.tipo_transporte || '',
        origen: sourceQuote.origen || '',
        destino: sourceQuote.destino || '',
        puerto_origen: sourceQuote.puerto_origen || '',
        puerto_destino: sourceQuote.puerto_destino || '',
        pickup_address: sourceQuote.pickup_address || '',
        delivery_address: sourceQuote.delivery_address || '',
        container_type: sourceQuote.container_type || '',
        container_qty: toFormString(sourceQuote.container_qty),
        package_type: sourceQuote.package_type || '',
        package_details: sourceQuote.package_details || '',
        peso_kg: toFormString(sourceQuote.peso_kg),
        gross_weight: toFormString(sourceQuote.gross_weight),
        volumen_cbm: toFormString(sourceQuote.volumen_cbm),
        cantidad_bultos: toFormString(sourceQuote.cantidad_bultos),
        commodity: sourceQuote.commodity || '',
        requires_insurance: Boolean(sourceQuote.requires_insurance),
        fob_value: toFormString(sourceQuote.fob_value),
        freight_value: toFormString(sourceQuote.freight_value),
        insurance_markup_percentage: toFormString(
          sourceQuote.insurance_markup_percentage || 10
        ),
        insurance_rate: toFormString(sourceQuote.insurance_rate || 1),
        insurance_cost: toFormString(sourceQuote.insurance_cost || 0),
        observaciones: sourceQuote.observaciones || '',
        pricing_notes: sourceQuote.pricing_notes || '',
        client_notes: sourceQuote.client_notes || '',
      })

      setContainerLines(
        (sourceContainers || []).map((line: any) => ({
          container_type_id: line.container_type_id || '',
          container_type_name:
            line.container_type_name || line.container_type || '',
          quantity: Number(line.quantity || 1),
          notes: line.notes || null,
        }))
      )

      const copiedCargoLines = (sourceCargoLines || []).map((line: any) => {
        const cbm = Number(line.cbm || 0)
        const hasDimensions =
          Number(line.length || 0) > 0 &&
          Number(line.width || 0) > 0 &&
          Number(line.height || 0) > 0

        return {
          id: crypto.randomUUID(),
          quantity: toFormString(line.quantity || 1),
          packageType: toPackageType(line.package_type),
          length: toFormString(line.length),
          width: toFormString(line.width),
          height: toFormString(line.height),
          dimensionUnit: line.dimension_unit || 'm',
          weight: toFormString(line.weight_lbs),
          weightUnit: 'lbs',
          volumeMode: hasDimensions ? 'dimensions' : 'manual',
          manualCbm: hasDimensions ? '' : toFormString(cbm),
        } satisfies CargoDimensionLine
      })

      if (copiedCargoLines.length > 0) {
        setCargoLines(copiedCargoLines)
      }

      toast.success('Cotización cargada para duplicar')
    } finally {
      setLoading(false)
    }
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

  const handleServiceProductChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const serviceProduct = e.target.value
    const isMiamiProduct = usesClientRates(serviceProduct)

    setFormData((prev) => ({
      ...prev,
      service_product: serviceProduct,
      tipo_transporte: isMiamiProduct
        ? serviceProduct === 'miami_air'
          ? 'Aéreo'
          : 'Marítima'
        : prev.tipo_transporte,
      quote_type: isMiamiProduct
        ? serviceProduct === 'miami_air'
          ? 'Consolidado'
          : 'LCL'
        : prev.quote_type,
      origen: isMiamiProduct ? prev.origen || 'Miami, FL' : prev.origen,
      puerto_origen: isMiamiProduct
        ? prev.puerto_origen || 'Miami'
        : prev.puerto_origen,
    }))

    if (isMiamiProduct) {
      clearContainerLines()

      setCargoLines((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: crypto.randomUUID(),
                quantity: '1',
                packageType: 'Caja',
                length: '',
                width: '',
                height: '',
                dimensionUnit: 'm',
                weight: '',
                weightUnit: 'lbs',
                volumeMode: 'dimensions',
                manualCbm: '',
              },
            ]
      )
    }
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
    setSubmitted(true)

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
          observaciones: formData.observaciones || null,
          client_notes: submitIsMiamiFlow ? formData.client_notes || null : null,
          duplicated_from: duplicateSource?.id || null,
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
            hasLineVolume(line)
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

      if (duplicateSource && quotation) {
        await createActivityLog({
          module: 'quotations',
          action: 'quotation_duplicated',
          entityType: 'quotation',
          entityId: quotation.id,
          description: `Cotización duplicada desde ${
            duplicateSource.quotation_number || duplicateSource.id
          }`,
          metadata: {
            sourceQuotationId: duplicateSource.id,
            sourceQuotationNumber: duplicateSource.quotation_number,
          },
        })
      }

      setFormData(initialFormData)
      setContainerLines([])
      setDuplicateSource(null)
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

  const moneyFieldClass = `${fieldClass} md:max-w-[180px]`
  const dateFieldClass = `${fieldClass} md:max-w-[220px]`

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

  const calculateLineCbm = (line: CargoDimensionLine) => {
    if (getCargoVolumeMode(line) === 'manual') {
      return Number(line.manualCbm || 0)
    }

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
          hasLineVolume(line)
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
      <div className="max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {duplicateSource ? 'Duplicar Cotización' : 'Nueva Cotización'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {duplicateSource
                ? `Edita la información copiada de ${
                    duplicateSource.quotation_number || 'la cotización origen'
                  } antes de enviarla a Pricing.`
                : 'Completa los datos para generar la cotización.'}
            </p>
          </div>
        </div>

        {duplicateSource && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            Esta nueva cotización quedará vinculada a{' '}
            {duplicateSource.quotation_number || 'la cotización origen'}.
          </div>
        )}

        <section className={cardClass}>
          <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Información General
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Cliente <span className="text-red-400">*</span>
              </label>
              <ClienteCombobox
                clientes={clientes}
                value={formData.cliente_id}
                onChange={(id) => {
                  handleClienteChange({
                    target: { name: 'cliente_id', value: id },
                  } as React.ChangeEvent<HTMLSelectElement>)
                }}
                placeholder="Seleccionar cliente"
                className={`${fieldClass} ${reqClass(formData.cliente_id)}`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Fecha de creación
              </label>
              <input
                value={new Date().toLocaleDateString('es-HN')}
                disabled
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Incoterm
              </label>
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Válida hasta
              </label>
              <input
                type="date"
                name="valid_until"
                value={formData.valid_until}
                min={todayString}
                onChange={handleChange}
                className={dateFieldClass}
              />
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Contacto del Cliente
            </h2>
            {formData.cliente_id && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Auto-llenado desde el perfil del cliente
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nombre de contacto
              </label>
              <input
                name="contact_name"
                placeholder="Nombre del contacto"
                value={formData.contact_name}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Email
              </label>
              <input
                name="contact_email"
                type="email"
                placeholder="email@empresa.com"
                value={formData.contact_email}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Teléfono
              </label>
              <input
                name="contact_phone"
                placeholder="+504 0000-0000"
                value={formData.contact_phone}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                País
              </label>
              <input
                name="contact_country"
                placeholder="País"
                value={formData.contact_country}
                disabled
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Departamento / Estado
              </label>
              <input
                name="contact_state"
                placeholder="Departamento / Estado"
                value={formData.contact_state || ''}
                disabled
                className={fieldClass}
              />
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Producto Comercial
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Dirección comercial <span className="text-red-400">*</span>
              </label>
              <select
                name="trade_direction"
                value={formData.trade_direction}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Seleccionar dirección</option>
                {tradeDirections.map((direction) => (
                  <option key={direction.value} value={direction.value}>
                    {direction.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Producto / Servicio <span className="text-red-400">*</span>
              </label>
              <select
                name="service_product"
                value={formData.service_product}
                onChange={handleServiceProductChange}
                className={`${fieldClass} ${reqClass(formData.service_product)}`}
              >
                <option value="">Seleccionar producto</option>
                {serviceProducts.map((product) => (
                  <option key={product.value} value={product.value}>
                    {product.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

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
            <section className={cardClass}>
              <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tipo de Cotización
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tipo de transporte <span className="text-red-400">*</span>
                  </label>
                  <select
                    className={`${fieldClass} ${reqClass(formData.tipo_transporte)}`}
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
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Modalidad <span className="text-red-400">*</span>
                  </label>
                  <select
                    className={`${fieldClass} ${reqClass(formData.quote_type)}`}
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
            </section>
          )}


          {!isMiamiFlow && (
            <>
              <section className={cardClass}>
                <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ruta
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      País de origen
                    </label>
                    <input
                      list="countries"
                      name="origen"
                      placeholder="Ej. China"
                      value={formData.origen}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      País de destino
                    </label>
                    <input
                      list="countries"
                      name="destino"
                      placeholder="Ej. Honduras"
                      value={formData.destino}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Puerto origen
                    </label>
                    <input
                      list="originPorts"
                      name="puerto_origen"
                      placeholder="Ej. Shanghai"
                      value={formData.puerto_origen}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Puerto destino
                    </label>
                    <input
                      list="destinationPorts"
                      name="puerto_destino"
                      placeholder="Ej. Puerto Cortés"
                      value={formData.puerto_destino}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Carrier de preferencia
                    </label>
                    <input
                      name="preferred_carrier"
                      placeholder="Ej. MSC, Hapag-Lloyd"
                      value={formData.preferred_carrier || ''}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Target rate (USD)
                    </label>
                    <input
                      name="target_rate"
                      placeholder="0.00"
                      value={formData.target_rate || ''}
                      onChange={handleChange}
                      className={moneyFieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Dirección de recolección EXW
                    </label>
                    <textarea
                      className={`${fieldClass} min-h-20`}
                      placeholder="Dirección completa de recolección"
                      value={formData.pickup_address}
                      onChange={(e) =>
                        setFormData({ ...formData, pickup_address: e.target.value })
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Dirección de entrega
                    </label>
                    <textarea
                      className={`${fieldClass} min-h-20`}
                      placeholder="Dirección completa de entrega"
                      value={formData.delivery_address}
                      onChange={(e) =>
                        setFormData({ ...formData, delivery_address: e.target.value })
                      }
                    />
                  </div>

                </div>
              </section>

              <section className={cardClass}>
                <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Carga
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {requiresContainerLines ? (
                <div className="col-span-full space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
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
                <div className="col-span-full space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
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
                            dimensionUnit: 'm',
                            weight: '',
                            weightUnit: 'lbs',
                            volumeMode: 'dimensions',
                            manualCbm: '',
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
                        const lineVolumeMode = getCargoVolumeMode(line)
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
                                step="any"
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
                                    step="any"
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
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    CBM total de la línea
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-[1fr_92px] gap-2">
                                <input
                                  type="number"
                                  step="any"
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
                                    step="any"
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
                                    step="any"
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
                                    step="any"
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
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tipo de empaque
                    </label>
                    <select
                      className={fieldClass}
                      value={formData.package_type}
                      onChange={(e) =>
                        setFormData({ ...formData, package_type: e.target.value })
                      }
                    >
                      <option value="">Seleccionar</option>
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
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Peso KG
                    </label>
                    <input
                      name="peso_kg"
                      placeholder="0.00"
                      value={formData.peso_kg}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Peso bruto
                    </label>
                    <input
                      name="gross_weight"
                      placeholder="0.00"
                      value={formData.gross_weight}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      CBM
                    </label>
                    <input
                      name="volumen_cbm"
                      placeholder="0.000"
                      value={formData.volumen_cbm}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Bultos
                    </label>
                    <input
                      name="cantidad_bultos"
                      placeholder="0"
                      value={formData.cantidad_bultos}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Mercancía / Commodity
                </label>
                <input
                  name="commodity"
                  placeholder="Descripción de la mercancía"
                  value={formData.commodity}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Detalles del empaque / observaciones de carga
                </label>
                <textarea
                  className={`${fieldClass} min-h-24`}
                  placeholder="Dimensiones, notas de embalaje, condiciones especiales..."
                  value={formData.package_details}
                  onChange={(e) =>
                    setFormData({ ...formData, package_details: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          </>
          )}

          <section className={cardClass}>
            <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Seguro de Carga
              </h2>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                name="requires_insurance"
                checked={formData.requires_insurance}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300"
              />
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Cliente solicita seguro de carga
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Se calculará el costo del seguro sobre el valor FOB
                </p>
              </div>
            </label>

            {formData.requires_insurance && (
              <div className="mt-4 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Valor comercial / Valor FOB (USD)
                </label>
                <input
                  name="commercial_value"
                  placeholder="0.00"
                  value={formData.commercial_value}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </div>
            )}
          </section>

          {!isMiamiFlow && (
            <section className={cardClass}>
              <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Observaciones internas para Pricing
                </h2>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Notas internas que verá el equipo de Pricing al revisar la cotización.
                </p>
              </div>
              <textarea
                name="pricing_notes"
                value={formData.pricing_notes}
                onChange={handleChange}
                rows={4}
                placeholder="Ej: Cliente requiere tarifa urgente, manejar con APS Express..."
                className={`${fieldClass} min-h-28 resize-y`}
              />
            </section>
          )}

          {isMiamiFlow && (
            <section className={cardClass}>
              <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Observaciones para Cliente (PDF)
                </h2>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Estas observaciones aparecerán en la cotización enviada al cliente.
                </p>
              </div>
              <textarea
                name="client_notes"
                value={formData.client_notes}
                onChange={handleChange}
                rows={4}
                placeholder="Ej: Tarifa sujeta a disponibilidad, no incluye aduanas..."
                className={`${fieldClass} min-h-28 resize-y`}
              />
            </section>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              El número de cotización se genera automáticamente al guardar.
            </p>

            <div className="flex items-center gap-2">
            {isMiamiFlow && (
              <button
                type="button"
                onClick={handlePreviewMiamiPdf}
                disabled={!miami.canUseMiamiCalculator}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Previsualizar PDF
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSubmit('Borrador')}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Guardar cotización
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('Pendiente de Fijar Precios')}
              disabled={loading}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {loading
                ? 'Enviando...'
                : isMiamiFlow
                  ? 'Crear cotización aprobada'
                  : 'Enviar a Pricing'}
            </button>
            </div>
          </div>
      </div>
    </>
  )
}



