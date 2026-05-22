'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'

import { Badge } from '../../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

function PricingComparisonContent() {
  const { profile } = useUser()
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quoteId')

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [quoteSearch, setQuoteSearch] = useState('')

  const [agents, setAgents] = useState<any[]>([])
  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [containerRateLines, setContainerRateLines] = useState<any[]>([])

  const [agentForm, setAgentForm] = useState({
    agent_id: '',
    agente_nombre: '',
    ocean_freight: '',
    exw_cost: '',
    mbl_fee: '',
    profit_per_container: '',
    containers_qty: '1',
    free_days_destination: '',
    carrier: '',
    transshipment: '',
    moneda: 'USD',
    transit_time: '',
    valid_until: '',
  })

  const [pricingForm, setPricingForm] = useState({
    item_type: 'Flete',
    description: '',
    cost_amount: '',
    sale_amount: '',
    quantity: '1',
    taxable: false,
    currency: 'USD',
    supplier: '',
    notes: '',
  })

  const [editingPricingItemId, setEditingPricingItemId] = useState<string | null>(null)
  const [editingAgentQuoteId, setEditingAgentQuoteId] = useState<string | null>(null)

  const [editingPricingItemForm, setEditingPricingItemForm] =
    useState<any>(null)

  useEffect(() => {
    fetchQuotations()
    fetchAgents()
  }, [quoteId])

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          codigo_cliente,
          nombre
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setQuotations(data || [])

    if (quoteId) {
      const quote = data?.find((q) => q.id === quoteId)
      if (quote) {
        await handleSelectQuote(quote)
      }
    }
  }

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    setAgents(data || [])
  }

  const fetchAgentQuotes = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setAgentQuotes(data || [])
  }

  const fetchPricingItems = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setPricingItems(data || [])
  }

  const fetchQuotationContainers = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setQuotationContainers(data || [])
  }

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)
    await fetchAgentQuotes(quote.id)
    await fetchPricingItems(quote.id)
    await fetchQuotationContainers(quote.id)
  }

  const handleAgentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setAgentForm({
      ...agentForm,
      [e.target.name]: e.target.value,
    })
  }

  const handlePricingChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setPricingForm({
      ...pricingForm,
      [e.target.name]: e.target.value,
    })
  }

  const getTotalContainersQty = (fallbackQty?: string | number) =>
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(fallbackQty || agentForm.containers_qty || 1)

  const getTotalOceanFreight = () =>
    containerRateLines.length > 0
      ? containerRateLines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.ocean_freight || 0),
          0
        )
      : Number(agentForm.ocean_freight || 0)

  const handleEditAgentQuote = async (quote: any) => {
    setEditingAgentQuoteId(quote.id)

    setAgentForm({
      agent_id: quote.agent_id || '',
      agente_nombre: quote.agente_nombre || '',
      ocean_freight: String(quote.ocean_freight || quote.costo || ''),
      exw_cost: String(quote.exw_cost || ''),
      mbl_fee: String(quote.mbl_fee || ''),
      profit_per_container: String(quote.profit_per_container || ''),
      containers_qty: String(quote.containers_qty || '1'),
      free_days_destination: String(quote.free_days_destination || ''),
      carrier: quote.carrier || '',
      transshipment: quote.transshipment || '',
      moneda: quote.moneda || 'USD',
      transit_time: quote.transit_time || '',
      valid_until: quote.valid_until || '',
    })

    const { data: containerRatesData, error: containerRatesError } =
      await supabase
        .from('agent_quote_container_rates')
        .select('*')
        .eq('agent_quote_id', quote.id)
        .order('created_at', { ascending: true })

    if (containerRatesError) {
      alert(containerRatesError.message)
      return
    }

    setContainerRateLines(containerRatesData || [])
  }

  const saveAgentQuote = async () => {
    if (!selectedQuote) {
      alert('Selecciona una cotización primero')
      return
    }

    const reason = await requestChangeReason(
      editingAgentQuoteId ? 'Actualizar tarifa de agente' : 'Agregar tarifa de agente'
    )

    if (reason === null) return

    const totalContainersQty = getTotalContainersQty()
    const totalOceanFreight = getTotalOceanFreight()

    const suggestedSale =
      totalOceanFreight +
      Number(agentForm.exw_cost || 0) +
      Number(agentForm.mbl_fee || 0) +
      Number(agentForm.profit_per_container || 0) * totalContainersQty

    const agentQuotePayload = {
      agent_id: agentForm.agent_id || null,
      agente_nombre: agentForm.agente_nombre,
      costo: totalOceanFreight,
      ocean_freight: totalOceanFreight,
      exw_cost: Number(agentForm.exw_cost || 0),
      mbl_fee: Number(agentForm.mbl_fee || 0),
      profit_per_container: Number(agentForm.profit_per_container || 0),
      containers_qty: Number(agentForm.containers_qty || 1),
      free_days_destination: Number(agentForm.free_days_destination || 0),
      carrier: agentForm.carrier,
      transshipment: agentForm.transshipment,
      moneda: agentForm.moneda,
      transit_time: agentForm.transit_time,
      valid_until: agentForm.valid_until || null,
      suggested_sale: suggestedSale,
    }

    const { data: savedAgentQuote, error } = editingAgentQuoteId
      ? await supabase
          .from('agent_quotes')
          .update(agentQuotePayload)
          .eq('id', editingAgentQuoteId)
          .select()
          .single()
      : await supabase
          .from('agent_quotes')
          .insert({
            quotation_id: selectedQuote.id,
            ...agentQuotePayload,
            is_selected: false,
          })
          .select()
          .single()

    if (error) {
      alert(error.message)
      return
    }

    if (quotationContainers.length > 0 && containerRateLines.length > 0) {
      await supabase
        .from('agent_quote_container_rates')
        .delete()
        .eq('agent_quote_id', savedAgentQuote.id)

      const ratePayload = containerRateLines.map((line) => ({
        agent_quote_id: savedAgentQuote.id,
        quotation_container_id: line.quotation_container_id,
        container_type_name: line.container_type_name,
        quantity: Number(line.quantity || 0),
        ocean_freight: Number(line.ocean_freight || 0),
        total_ocean_freight:
          Number(line.quantity || 0) * Number(line.ocean_freight || 0),
      }))

      const { error: ratesError } = await supabase
        .from('agent_quote_container_rates')
        .insert(ratePayload)

      if (ratesError) {
        alert(ratesError.message)
        return
      }
    }

    await supabase
      .from('quotations')
      .update({ status: 'Pendiente de Fijar Precios' })
      .eq('id', selectedQuote.id)

    alert(
      editingAgentQuoteId
        ? 'Tarifa de agente actualizada'
        : 'Tarifa de agente agregada'
    )

    setAgentForm({
      agent_id: '',
      agente_nombre: '',
      ocean_freight: '',
      exw_cost: '',
      mbl_fee: '',
      profit_per_container: '',
      containers_qty: '1',
      free_days_destination: '',
      carrier: '',
      transshipment: '',
      moneda: 'USD',
      transit_time: '',
      valid_until: '',
    })

    setContainerRateLines([])
    setEditingAgentQuoteId(null)

    await fetchAgentQuotes(selectedQuote.id)
    await fetchQuotations()
  }

  const selectAgentQuote = async (agentQuoteId: string) => {
    if (!selectedQuote) return

    let selectedAgentQuote = agentQuotes.find((quote) => quote.id === agentQuoteId)

    if (!selectedAgentQuote) {
      const { data, error: agentQuoteError } = await supabase
        .from('agent_quotes')
        .select('*')
        .eq('id', agentQuoteId)
        .single()

      if (agentQuoteError) {
        alert(agentQuoteError.message)
        return
      }

      selectedAgentQuote = data
    }

    const reason = await requestChangeReason('Regenerar pricing')

    if (reason === null) return

    const shouldReplacePricing = window.confirm(
      '¿Deseas reemplazar el pricing actual con la tarifa seleccionada?\n\nEsto eliminará las líneas actuales de pricing y generará nuevas automáticamente.'
    )

    if (shouldReplacePricing) {
      await supabase
        .from('pricing_items')
        .delete()
        .eq('quotation_id', selectedQuote.id)
    }

    await supabase
      .from('agent_quotes')
      .update({ is_selected: false })
      .eq('quotation_id', selectedQuote.id)

    const { error } = await supabase
      .from('agent_quotes')
      .update({ is_selected: true })
      .eq('id', agentQuoteId)

    if (error) {
      alert(error.message)
      return
    }

    const updatedQuoteFields = {
      valid_until:
        selectedAgentQuote.valid_until || selectedQuote.valid_until || null,
      preferred_carrier:
        selectedAgentQuote.carrier || selectedQuote.preferred_carrier || null,
      transit_time:
        selectedAgentQuote.transit_time || selectedQuote.transit_time || null,
      transshipment:
        selectedAgentQuote.transshipment || selectedQuote.transshipment || null,
    }

    const { error: quotationUpdateError } = await supabase
      .from('quotations')
      .update(updatedQuoteFields)
      .eq('id', selectedQuote.id)

    if (quotationUpdateError) {
      alert(quotationUpdateError.message)
      return
    }

    setSelectedQuote({
      ...selectedQuote,
      ...updatedQuoteFields,
    })

    await fetchQuotations()

    const currency = selectedAgentQuote.moneda || 'USD'
    const supplier = selectedAgentQuote.agente_nombre || ''
    const containersQty =
      quotationContainers.length > 0
        ? quotationContainers.reduce(
            (sum, container) => sum + Number(container.quantity || 0),
            0
          )
        : Number(selectedAgentQuote.containers_qty || 1)
    const oceanFreight = Number(
      selectedAgentQuote.ocean_freight || selectedAgentQuote.costo || 0
    )
    const exwCost = Number(selectedAgentQuote.exw_cost || 0)
    const mblFee = Number(selectedAgentQuote.mbl_fee || 0)
    const totalProfit =
      Number(selectedAgentQuote.profit_per_container || 0) * containersQty

    const { data: containerRatesData, error: containerRatesError } =
      await supabase
        .from('agent_quote_container_rates')
        .select('*')
        .eq('agent_quote_id', agentQuoteId)
        .order('created_at', { ascending: true })

    if (containerRatesError) {
      alert(containerRatesError.message)
      return
    }

    const agentProfitPerContainer =
      Number(selectedAgentQuote.profit_per_container || 0)

    const mblPerContainer =
      containersQty > 0 ? Number(selectedAgentQuote.mbl_fee || 0) / containersQty : 0

    const oceanFreightLines =
      containerRatesData && containerRatesData.length > 0
        ? containerRatesData.map((rate) => {
            const unitOceanFreight =
              Number(rate.ocean_freight || 0) +
              agentProfitPerContainer +
              mblPerContainer

            const quantity = Number(rate.quantity || 1)

            return {
              quotation_id: selectedQuote.id,
              item_type: 'Flete',
              description: `Ocean Freight ${rate.container_type_name}`,
              cost_amount: unitOceanFreight,
              sale_amount: unitOceanFreight,
              quantity,
              taxable: false,
              tax_rate: 15,
              tax_amount: 0,
              total_amount: unitOceanFreight * quantity,
              currency,
              supplier,
              notes: '',
              created_by: profile?.id,
            }
          })
        : [
            {
              quotation_id: selectedQuote.id,
              item_type: 'Flete',
              description: 'Ocean Freight',
              cost_amount: oceanFreight + mblFee + totalProfit,
              sale_amount: oceanFreight + mblFee + totalProfit,
              quantity: 1,
              taxable: false,
              tax_rate: 15,
              tax_amount: 0,
              total_amount: oceanFreight + mblFee + totalProfit,
              currency,
              supplier,
              notes: '',
              created_by: profile?.id,
            },
          ]

    const pricingLines = [
      ...oceanFreightLines,
      {
        quotation_id: selectedQuote.id,
        item_type: 'Origen',
        description: 'EXW',
        cost_amount: exwCost,
        sale_amount: exwCost,
        quantity: 1,
        taxable: false,
        tax_rate: 15,
        tax_amount: 0,
        total_amount: exwCost,
        currency,
        supplier,
        notes: '',
        created_by: profile?.id,
      },
    ]

    if (shouldReplacePricing) {
      const { error: pricingError } = await supabase
        .from('pricing_items')
        .insert(pricingLines)

      if (pricingError) {
        alert(pricingError.message)
        return
      }
    }

    alert('Tarifa seleccionada')

    await fetchAgentQuotes(selectedQuote.id)
    await fetchPricingItems(selectedQuote.id)
  }

  const savePricingItem = async () => {
    if (!selectedQuote) {
      alert('Selecciona una cotización primero')
      return
    }

    if (!pricingForm.description) {
      alert('La descripción es obligatoria')
      return
    }

    const reason = await requestChangeReason('Agregar cargo adicional')

    if (reason === null) return

    const { error } = await supabase.from('pricing_items').insert([
      {
        quotation_id: selectedQuote.id,
        item_type: pricingForm.item_type,
        description: pricingForm.description,
        cost_amount: Number(pricingForm.cost_amount || 0),
        sale_amount: Number(pricingForm.sale_amount || 0),
        quantity: quantity,
        taxable: pricingForm.taxable,
        tax_rate: 15,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: pricingForm.currency,
        supplier: pricingForm.supplier,
        notes: pricingForm.notes,
        created_by: profile?.id,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    alert('Línea de pricing agregada')

    setPricingForm({
      item_type: 'Flete',
      description: '',
      cost_amount: '',
      sale_amount: '',
      quantity: '1',
      taxable: false,
      currency: 'USD',
      supplier: '',
      notes: '',
    })

    await fetchPricingItems(selectedQuote.id)
  }

  const deletePricingItem = async (itemId: string) => {
    const reason = await requestChangeReason('Eliminar línea de cotización')

    if (reason === null) return

    const { error } = await supabase
      .from('pricing_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      alert(error.message)
      return
    }

    if (selectedQuote) {
      await fetchPricingItems(selectedQuote.id)
    }
  }

  const startEditingPricingItem = (item: any) => {
    setEditingPricingItemId(item.id)

    setEditingPricingItemForm({
      description: item.description || '',
      quantity: item.quantity || 1,
      sale_amount: item.sale_amount || 0,
      cost_amount: item.cost_amount || 0,
      provider: item.provider || item.supplier || '',
      notes: item.notes || '',
    })
  }

  const cancelEditingPricingItem = () => {
    setEditingPricingItemId(null)
    setEditingPricingItemForm(null)
  }

  const updatePricingItem = async (item: any) => {
    if (!selectedQuote) return
    if (!editingPricingItemForm) return

    const reason = await requestChangeReason('Modificar línea de cotización')

    if (reason === null) return

    const quantity = Number(editingPricingItemForm.quantity || 1)
    const saleAmount = Number(editingPricingItemForm.sale_amount || 0)
    const subtotal = saleAmount * quantity
    const taxAmount = item.taxable ? subtotal * 0.15 : 0
    const totalAmount = subtotal + taxAmount

    const { error } = await supabase
      .from('pricing_items')
      .update({
        description: editingPricingItemForm.description,
        quantity,
        cost_amount: Number(editingPricingItemForm.cost_amount || 0),
        sale_amount: saleAmount,
        supplier: editingPricingItemForm.provider,
        notes: editingPricingItemForm.notes,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      })
      .eq('id', item.id)

    if (error) {
      alert(error.message)
      return
    }

    setEditingPricingItemId(null)
    setEditingPricingItemForm(null)

    await fetchPricingItems(selectedQuote.id)
  }

  const approvePricing = async () => {
    if (!selectedQuote) return

    const { error } = await supabase
      .from('quotations')
      .update({
        total_cost: totalCost,
        total_sale: totalSale,
        profit_amount: profit,
        gp_percentage: gpPercentage,
        pricing_approved: true,
        pricing_approved_by: profile?.id,
        pricing_approved_at: new Date().toISOString(),
      })
      .eq('id', selectedQuote.id)

    if (error) {
      alert(error.message)
      return
    }

    await createActivityLog({
      module: 'pricing',
      action: 'pricing_approved',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Pricing aprobó la cotización ${
        selectedQuote.quotation_number || selectedQuote.id
      }`,
    })

    if (selectedQuote.created_by) {
      await createNotification({
        userId: selectedQuote.created_by,
        title: 'Pricing aprobado',
        message: `La cotización ${
          selectedQuote.quotation_number || ''
        } fue aprobada por Pricing.`,
        type: 'success',
      })
    }

    alert('Pricing aprobado correctamente')

    await fetchQuotations()

    setSelectedQuote({
      ...selectedQuote,
      total_cost: totalCost,
      total_sale: totalSale,
      profit_amount: profit,
      gp_percentage: gpPercentage,
      pricing_approved: true,
    })
  }

  const markAsSentToClient = async () => {
    const approvePricing = async () => {
  if (!selectedQuote) return

  const { error } = await supabase
    .from('quotations')
    .update({
      total_cost: totalCost,
      total_sale: totalSale,
      profit_amount: profit,
      gp_percentage: gpPercentage,
      pricing_approved: true,
      pricing_approved_by: profile?.id,
      pricing_approved_at: new Date().toISOString(),
    })
    .eq('id', selectedQuote.id)

  if (error) {
    alert(error.message)
    return
  }

  alert('Pricing aprobado correctamente')

  await fetchQuotations()

  setSelectedQuote({
    ...selectedQuote,
    total_cost: totalCost,
    total_sale: totalSale,
    profit_amount: profit,
    gp_percentage: gpPercentage,
    pricing_approved: true,
  })
}

    const { error } = await supabase
      .from('quotations')
      .update({ status: 'Enviada al Cliente' })
      .eq('id', selectedQuote.id)

    if (error) {
      alert(error.message)
      return
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: selectedQuote.id,
        old_status: selectedQuote.status,
        new_status: 'Enviada al Cliente',
        changed_by: profile?.id,
      },
    ])

    alert('Cotización marcada como Enviada al Cliente')

    await fetchQuotations()

    await createActivityLog({
      module: 'pricing',
      action: 'sent_to_client',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Cotización ${
        selectedQuote.quotation_number || selectedQuote.id
      } marcada como enviada al cliente`,
    })

    if (selectedQuote.created_by) {
      await createNotification({
        userId: selectedQuote.created_by,
        title: 'Cotización enviada al cliente',
        message: `La cotización ${
          selectedQuote.quotation_number || ''
        } fue marcada como enviada al cliente.`,
        type: 'info',
      })
    }

    setSelectedQuote({
      ...selectedQuote,
      status: 'Enviada al Cliente',
    })
  }

  const totalCost = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
    0
  )

  const totalSale = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
    0
  )

  const totalProfit = totalSale - totalCost
  const profit = totalProfit

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const quantity = Number(pricingForm.quantity || 1)

  const subtotal =
    Number(pricingForm.sale_amount || 0) * quantity

  const taxAmount =
    pricingForm.taxable
      ? subtotal * 0.15
      : 0

  const totalAmount = subtotal + taxAmount

  const gpPercentage =
    totalSale > 0 ? (totalProfit / totalSale) * 100 : 0

  const targetRate = Number(selectedQuote?.target_rate || 0)

  const targetRateDifference =
    targetRate > 0 ? totalSale - targetRate : 0

  const targetRateDifferencePercentage =
    targetRate > 0 ? (targetRateDifference / targetRate) * 100 : 0

const profitabilityStatus =
  gpPercentage >= 15
    ? 'Rentabilidad saludable'
    : gpPercentage >= 8
    ? 'Rentabilidad baja'
    : 'Rentabilidad crítica'

const profitabilityColor =
  gpPercentage >= 15
    ? 'bg-green-600 text-white'
    : gpPercentage >= 8
    ? 'bg-orange-500 text-white'
    : 'bg-red-600 text-white'

  const totalContainersQty =
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(agentForm.containers_qty || 1)

  const totalOceanFreight =
    containerRateLines.length > 0
      ? containerRateLines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.ocean_freight || 0),
          0
        )
      : Number(agentForm.ocean_freight || 0)

  const agentTotalCost =
    totalOceanFreight +
    Number(agentForm.exw_cost || 0) +
    Number(agentForm.mbl_fee || 0) +
    Number(agentForm.profit_per_container || 0) * totalContainersQty

  const suggestedSales = [8, 10, 15, 20, 25].map((margin) => ({
    margin,
    sale: agentTotalCost * (1 + margin / 100),
  }))

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case 'Ganada':
        return 'bg-green-600 text-white'

      case 'Perdida':
        return 'bg-red-600 text-white'

      case 'Propuesta':
        return 'bg-blue-600 text-white'

      case 'Seguimiento':
        return 'bg-orange-500 text-white'

      case 'Pendiente de Fijar Precios':
        return 'bg-gray-700 text-white'

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

  const filteredQuotations = quotations.filter((quote) => {
    const search = quoteSearch.toLowerCase().trim()

    return (
      !search ||
      quote.quotation_number?.toLowerCase().includes(search) ||
      quote.clientes?.nombre?.toLowerCase().includes(search) ||
      quote.origen?.toLowerCase().includes(search) ||
      quote.destino?.toLowerCase().includes(search)
    )
  })

  const requiresChangeReason = [
    'Enviada al Cliente',
    'Ganada',
  ].includes(selectedQuote?.status || '')

  const requestChangeReason = async (changeType: string) => {
    if (!selectedQuote) return null

    if (!requiresChangeReason) return ''

    const reason = window.prompt(
      'Esta cotización ya fue enviada/aprobada. Ingresa el motivo del cambio:'
    )

    if (!reason || !reason.trim()) {
      alert('Debes ingresar un motivo para realizar este cambio.')
      return null
    }

    const { error } = await supabase.from('quotation_change_logs').insert([
      {
        quotation_id: selectedQuote.id,
        change_type: changeType,
        reason: reason.trim(),
        changed_by: profile?.id,
      },
    ])

    if (error) {
      alert(error.message)
      return null
    }

    return reason.trim()
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold">
            Comparativo de Tarifas / Pricing
          </h1>

          <p className="text-gray-500 mt-2">
            Agrega tarifas de agentes, construye venta final y valida rentabilidad.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seleccionar cotización</CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={quoteSearch}
                onChange={(e) => setQuoteSearch(e.target.value)}
                placeholder="Buscar por cotización, cliente, origen o destino..."
                className="border rounded-xl px-3 py-2"
              />

              <select
                value={selectedQuote?.id || ''}
                onChange={(e) => {
                  const quote = quotations.find((q) => q.id === e.target.value)
                  if (quote) handleSelectQuote(quote)
                }}
                className="border rounded-xl px-3 py-2"
              >
                <option value="">Seleccionar cotización</option>

                {filteredQuotations.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.quotation_number || 'Sin número'} -{' '}
                    {quote.clientes?.nombre || 'Sin cliente'} - {quote.origen}{' '}
                    a {quote.destino}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

            {!selectedQuote ? (
              <Card>
                <CardContent className="p-8 text-gray-500">
                  Selecciona una cotización para trabajar pricing.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedQuote.quotation_number} - {selectedQuote.origen} a {selectedQuote.destino}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Estado</p>
                      <Badge>{selectedQuote.status}</Badge>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Target</p>
                      <p className="font-bold">
                        USD {selectedQuote.target_rate || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Naviera preferida</p>
                      <p className="font-bold">
                        {selectedQuote.preferred_carrier || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Contenedor</p>
                      <p className="font-bold">
                        {quotationContainers.length > 0
                          ? quotationContainers
                              .map(
                                (container) =>
                                  `${container.quantity} x ${container.container_type_name}`
                              )
                              .join(', ')
                          : selectedQuote.container_type || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Total unidades: {totalContainersQty}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Construcción de Tarifa</CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Agente
                      </label>

                      <select
                        value={agentForm.agent_id}
                        onChange={(e) => {
                          const agentId = e.target.value
                          const selectedAgent = agents.find((a) => a.id === agentId)

                          setAgentForm({
                            ...agentForm,
                            agent_id: agentId,
                            agente_nombre: selectedAgent?.name || '',
                            profit_per_container: String(
                              selectedAgent?.profit_per_container || 0
                            ),
                            mbl_fee: String(selectedAgent?.mbl_fee || 0),
                            moneda: selectedAgent?.currency || 'USD',
                          })
                        }}
                        className="border rounded-xl px-3 py-2 w-full"
                      >
                        <option value="">Seleccionar agente/proveedor</option>

                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} - {agent.type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {quotationContainers.length > 0 && (
                      <div className="col-span-2 md:col-span-3 xl:col-span-6 rounded-xl border p-4 space-y-3">
                        <p className="font-semibold">
                          Costos del proveedor por contenedor
                        </p>

                        {quotationContainers.map((container) => {
                          const currentLine = containerRateLines.find(
                            (line) => line.quotation_container_id === container.id
                          )

                          return (
                            <div
                              key={container.id}
                              className="grid grid-cols-4 gap-3 items-center"
                            >
                              <div>
                                <p className="font-semibold">
                                  {container.container_type_name}
                                </p>
                                <p className="text-sm text-gray-500">
                                  Cantidad: {container.quantity}
                                </p>
                              </div>

                              <input
                                type="number"
                                placeholder="Costo unitario proveedor"
                                value={currentLine?.ocean_freight || ''}
                                onChange={(e) => {
                                  const value = e.target.value

                                  setContainerRateLines((prev) => {
                                    const exists = prev.some(
                                      (line) =>
                                        line.quotation_container_id === container.id
                                    )

                                    if (exists) {
                                      return prev.map((line) =>
                                        line.quotation_container_id === container.id
                                          ? { ...line, ocean_freight: value }
                                          : line
                                      )
                                    }

                                    return [
                                      ...prev,
                                      {
                                        quotation_container_id: container.id,
                                        container_type_name: container.container_type_name,
                                        quantity: container.quantity,
                                        ocean_freight: value,
                                      },
                                    ]
                                  })
                                }}
                                className="border rounded-xl px-3 py-2 w-full"
                              />

                              <p className="font-bold">
                                USD{' '}
                                {formatCurrency(
                                  Number(container.quantity || 0) *
                                    Number(currentLine?.ocean_freight || 0)
                                )}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {quotationContainers.length === 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1">
                          Costo proveedor
                        </label>

                        <input
                          name="ocean_freight"
                          placeholder="Ocean Freight"
                          value={agentForm.ocean_freight}
                          onChange={handleAgentChange}
                          className="border rounded-xl px-3 py-2 w-full"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Moneda
                      </label>

                      <select
                        name="moneda"
                        value={agentForm.moneda}
                        onChange={handleAgentChange}
                        className="border rounded-xl px-3 py-2 w-full"
                      >
                        <option value="USD">USD</option>
                        <option value="HNL">HNL</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Tránsito
                      </label>

                      <input
                        name="transit_time"
                        placeholder="Tránsito"
                        value={agentForm.transit_time}
                        onChange={handleAgentChange}
                        className="border rounded-xl px-3 py-2 w-full"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Carrier
                      </label>

                      <input
                        className="border rounded-xl px-3 py-2 w-full"
                        placeholder="Carrier / Naviera"
                        value={agentForm.carrier}
                        onChange={(e) =>
                          setAgentForm({ ...agentForm, carrier: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Transbordo
                      </label>

                      <select
                        className="border rounded-xl px-3 py-2 w-full"
                        value={agentForm.transshipment}
                        onChange={(e) =>
                          setAgentForm({ ...agentForm, transshipment: e.target.value })
                        }
                      >
                        <option value="">Transbordo</option>
                        <option value="Directo">Directo</option>
                        <option value="Sí">Sí</option>
                        <option value="Via Panamá">Via Panamá</option>
                        <option value="Via Cartagena">Via Cartagena</option>
                        <option value="Via Kingston">Via Kingston</option>
                        <option value="Via Miami">Via Miami</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Días libres
                      </label>

                      <input
                        className="border rounded-xl px-3 py-2 w-full"
                        placeholder="Días libres destino"
                        value={agentForm.free_days_destination}
                        onChange={(e) =>
                          setAgentForm({
                            ...agentForm,
                            free_days_destination: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        Vigencia tarifa
                      </label>
                      <input
                        type="date"
                        name="valid_until"
                        value={agentForm.valid_until}
                        onChange={handleAgentChange}
                        className="border rounded-xl px-3 py-2 w-full"
                      />
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 col-span-2 md:col-span-3 xl:col-span-6">
                      <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                        Costo base Sari
                      </p>

                      <p className="mt-2 text-3xl font-bold text-emerald-700">
                        {agentForm.moneda || 'USD'}{' '}
                        {agentTotalCost.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>

                      <div className="mt-5 grid grid-cols-5 gap-3">
                        {suggestedSales.map((item) => (
                          <div
                            key={item.margin}
                            className="rounded-xl bg-white border border-emerald-100 p-3"
                          >
                            <p className="text-xs text-gray-500">
                              +{item.margin}%
                            </p>

                            <p className="mt-1 font-bold text-emerald-700">
                              {agentForm.moneda || 'USD'}{' '}
                              {item.sale.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={saveAgentQuote}
                      className="bg-zinc-950 text-white px-6 py-3 rounded-xl col-span-2 md:col-span-3 xl:col-span-6"
                    >
                      {editingAgentQuoteId ? 'Actualizar Tarifa' : 'Guardar Tarifa'}
                    </button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tarifas de Agentes</CardTitle>
                  </CardHeader>

                  <CardContent>
                    {agentQuotes.length === 0 ? (
                      <p className="text-gray-500">
                        No hay tarifas de agentes registradas.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-left text-sm">
                          <thead className="bg-zinc-950 text-white">
                            <tr>
                              <th className="p-3">Agente</th>
                              <th className="p-3">Carrier</th>
                              <th className="p-3">Costo Base</th>
                              <th className="p-3">EXW</th>
                              <th className="p-3">MBL</th>
                              <th className="p-3">Profit/Cont.</th>
                              <th className="p-3">Costo Final Sari</th>
                              <th className="p-3">Cont.</th>
                              <th className="p-3">Venta Sugerida</th>
                              <th className="p-3">Tránsito</th>
                              <th className="p-3">Días Libres</th>
                              <th className="p-3">Seleccionar</th>
                            </tr>
                          </thead>

                          <tbody>
                            {agentQuotes.map((quote) => {
                              const containersQty =
                                quotationContainers.length > 0
                                  ? quotationContainers.reduce(
                                      (sum, container) =>
                                        sum + Number(container.quantity || 0),
                                      0
                                    )
                                  : Number(quote.containers_qty || 1)

                              const finalSariCost =
                                Number(quote.ocean_freight || 0) +
                                Number(quote.exw_cost || 0) +
                                Number(quote.mbl_fee || 0) +
                                Number(quote.profit_per_container || 0) * containersQty

                              return (
                                <tr key={quote.id} className="border-b">
                                  <td className="p-3">{quote.agente_nombre}</td>
                                  <td className="p-3">{quote.carrier || 'N/A'}</td>
                                  <td className="p-3">
                                    {quote.moneda} {Number(quote.ocean_freight || quote.costo || 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    {quote.moneda} {Number(quote.exw_cost || 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    {quote.moneda} {Number(quote.mbl_fee || 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    {quote.moneda} {Number(quote.profit_per_container || 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    USD {formatCurrency(finalSariCost)}
                                  </td>
                                  <td className="p-3">{quote.containers_qty || 1}</td>
                                  <td className="p-3">
                                    {quote.moneda} {Number(quote.suggested_sale || 0).toFixed(2)}
                                  </td>
                                  <td className="p-3">{quote.transit_time || 'N/A'}</td>
                                  <td className="p-3">{quote.free_days_destination || 0}</td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleEditAgentQuote(quote)}
                                        className="p-2 rounded-lg border hover:bg-gray-100"
                                      >
                                        <Pencil size={16} />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => selectAgentQuote(quote.id)}
                                        className={
                                          quote.is_selected
                                            ? 'text-green-600 font-semibold'
                                            : 'text-blue-600 font-semibold'
                                        }
                                      >
                                        {quote.is_selected ? 'Regenerar Pricing' : 'Seleccionar'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Detalle de Venta al Cliente</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <select
                        name="item_type"
                        value={pricingForm.item_type}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      >
                        <option value="Flete">Flete</option>
                        <option value="Origen">Origen</option>
                        <option value="Destino">Destino</option>
                        <option value="Seguro">Seguro</option>
                        <option value="Documentación">Documentación</option>
                        <option value="Aduana">Aduana</option>
                        <option value="Inland">Inland</option>
                        <option value="Profit">Profit</option>
                        <option value="Otro">Otro</option>
                      </select>

                      <input
                        name="description"
                        placeholder="Descripción"
                        value={pricingForm.description}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        name="cost_amount"
                        placeholder="Costo"
                        value={pricingForm.cost_amount}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        type="number"
                        placeholder="QTY"
                        value={pricingForm.quantity}
                        onChange={(e) =>
                          setPricingForm({
                            ...pricingForm,
                            quantity: e.target.value,
                          })
                        }
                        className="border p-3 rounded-xl"
                      />

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pricingForm.taxable}
                          onChange={(e) =>
                            setPricingForm({
                              ...pricingForm,
                              taxable: e.target.checked,
                            })
                          }
                        />

                        Gravable ISV 15%
                      </label>

                      <input
                        name="sale_amount"
                        placeholder="Venta"
                        value={pricingForm.sale_amount}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <select
                        name="currency"
                        value={pricingForm.currency}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      >
                        <option value="USD">USD</option>
                        <option value="HNL">HNL</option>
                      </select>

                      <input
                        name="supplier"
                        placeholder="Proveedor"
                        value={pricingForm.supplier}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        name="notes"
                        placeholder="Notas"
                        value={pricingForm.notes}
                        onChange={handlePricingChange}
                        className="border p-3 rounded col-span-2"
                      />

                      <button
                        onClick={savePricingItem}
                        className="bg-zinc-950 text-white px-6 py-3 rounded-xl col-span-4"
                      >
                        Agregar Cargo Adicional
                      </button>
                    </div>

                    <div className="bg-zinc-100 rounded-xl p-4 text-sm">
                      <p>Subtotal: USD {subtotal.toFixed(2)}</p>

                      <p>ISV: USD {taxAmount.toFixed(2)}</p>

                      <p className="font-bold text-lg mt-2">
                        Total: USD {totalAmount.toFixed(2)}
                      </p>
                    </div>

                    <h3 className="text-lg font-semibold">
                      Líneas de Cotización
                    </h3>

                    {pricingItems.length === 0 ? (
                      <p className="text-gray-500">
                        No hay líneas de cotización.
                      </p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-2 text-xs uppercase text-gray-500">Descripción</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Proveedor</th>
                            <th className="p-2 text-xs uppercase text-gray-500">QTY</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Costo Unit.</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Costo Total</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Venta Unit.</th>
                            <th className="p-2 text-xs uppercase text-gray-500">ISV</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Venta Total</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Margen</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {pricingItems.map((item) => {
                            const qty = Number(item.quantity || 1)
                            const subtotal = qty * Number(item.sale_amount || 0)
                            const tax = item.taxable ? subtotal * 0.15 : 0
                            const total = subtotal + tax
                            const currency = item.currency || 'USD'
                            const costSubtotal =
                              qty * Number(item.cost_amount || 0)
                            const saleSubtotal =
                              qty * Number(item.sale_amount || 0)
                            const editingCost =
                              Number(editingPricingItemForm?.cost_amount || 0)
                            const editingSale =
                              Number(editingPricingItemForm?.sale_amount || 0)
                            const editingQty =
                              Number(editingPricingItemForm?.quantity || 0)
                            const displayCostSubtotal =
                              editingPricingItemId === item.id
                                ? editingCost * editingQty
                                : costSubtotal
                            const displaySaleSubtotal =
                              editingPricingItemId === item.id
                                ? editingSale * editingQty
                                : saleSubtotal
                            const displayMargin =
                              displaySaleSubtotal - displayCostSubtotal
                            const margin = displayMargin

                            return (
                              <tr
                                key={item.id}
                                className={`border-b ${
                                  margin < 0
                                    ? 'bg-red-50'
                                    : margin === 0
                                    ? 'bg-yellow-50'
                                    : ''
                                }`}
                              >
                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      value={editingPricingItemForm?.description || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          description: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    item.description
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {item.supplier || 'N/A'}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      value={editingPricingItemForm?.quantity || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          quantity: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-20"
                                    />
                                  ) : (
                                    item.quantity
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      value={editingPricingItemForm?.cost_amount || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          cost_amount: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    `USD ${formatCurrency(item.cost_amount || 0)}`
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  USD {formatCurrency(displayCostSubtotal)}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      value={editingPricingItemForm?.sale_amount || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          sale_amount: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    `USD ${formatCurrency(item.sale_amount)}`
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {currency} {tax.toFixed(2)}
                                </td>

                                <td className="p-2 text-sm font-bold">
                                  {editingPricingItemId === item.id
                                    ? `USD ${formatCurrency(displaySaleSubtotal)}`
                                    : `USD ${formatCurrency(item.total_amount)}`
                                  }
                                </td>

                                <td className="p-2 text-sm font-semibold">
                                  <span
                                    className={`font-semibold ${
                                      margin > 0
                                        ? 'text-green-600'
                                        : margin < 0
                                        ? 'text-red-600'
                                        : 'text-yellow-600'
                                    }`}
                                  >
                                    USD {formatCurrency(margin)}
                                  </span>
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => updatePricingItem(item)}
                                        className="text-green-600 font-medium"
                                      >
                                        Guardar
                                      </button>

                                      <button
                                        onClick={cancelEditingPricingItem}
                                        className="text-gray-500 font-medium"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-3">
                                      <button
                                        onClick={() => startEditingPricingItem(item)}
                                        className="text-blue-600 font-medium"
                                      >
                                        Modificar
                                      </button>

                                      <button
                                        onClick={() => deletePricingItem(item.id)}
                                        className="text-red-600 font-medium"
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                
<div className="flex justify-end gap-4">
  <button
    onClick={approvePricing}
    className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition"
  >
    Aprobar Pricing
  </button>

  <button
    onClick={markAsSentToClient}
    className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-green-700 transition"
  >
    Marcar como Enviada al Cliente
  </button>
</div>

                <Card className="bg-white shadow-md">
                  <CardHeader>
                    <CardTitle>Resumen Comercial</CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Costo Base Sari</p>
                      <p className="text-xl font-bold">
                        USD {formatCurrency(totalCost)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Venta Cliente</p>
                      <p className="text-xl font-bold">
                        USD {formatCurrency(totalSale)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Profit</p>
                      <p
                        className={`text-xl font-bold ${
                          profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        USD {formatCurrency(profit)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">GP %</p>
                      <p
                        className={`text-xl font-bold ${
                          gpPercentage >= 15
                            ? 'text-green-600'
                            : gpPercentage >= 8
                            ? 'text-orange-500'
                            : 'text-red-600'
                        }`}
                      >
                        {gpPercentage.toFixed(2)}%
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Target Cliente</p>
                      <p className="text-xl font-bold">
                        {targetRate > 0
                          ? `USD ${formatCurrency(targetRate)}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Vs Target</p>

                      {targetRate > 0 ? (
                        <>
                          <p
                            className={`text-xl font-bold ${
                              targetRateDifference <= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}
                          >
                            {targetRateDifference <= 0 ? '-' : '+'} USD{' '}
                            {formatCurrency(Math.abs(targetRateDifference))}
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            {targetRateDifference <= 0
                              ? `${Math.abs(targetRateDifferencePercentage).toFixed(2)}% abajo`
                              : `${targetRateDifferencePercentage.toFixed(2)}% arriba`}
                          </p>
                        </>
                      ) : (
                        <p className="text-xl font-bold">N/A</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </div>
      </div>
    </>
  )
}

export default function PricingComparisonPage() {
  return (
    <Suspense fallback={<p className="p-8">Cargando pricing...</p>}>
      <PricingComparisonContent />
    </Suspense>
  )
}

