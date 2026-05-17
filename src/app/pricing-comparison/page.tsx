'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Pencil } from 'lucide-react'

import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'

export default function PricingComparisonPage() {
  const { profile } = useUser()

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)

  const [agents, setAgents] = useState<any[]>([])
  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])

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

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingAgentQuoteId, setEditingAgentQuoteId] = useState<string | null>(null)

  const [editPricingForm, setEditPricingForm] = useState({
    cost_amount: '',
    sale_amount: '',
  })

  useEffect(() => {
    fetchQuotations()
    fetchAgents()
  }, [])

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

  const handleEditAgentQuote = (quote: any) => {
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
    })
  }

  const saveAgentQuote = async () => {
    if (!selectedQuote) {
      alert('Selecciona una cotización primero')
      return
    }

    const totalContainersQty = getTotalContainersQty()

    const suggestedSale =
      Number(agentForm.ocean_freight || 0) +
      Number(agentForm.exw_cost || 0) +
      Number(agentForm.mbl_fee || 0) +
      Number(agentForm.profit_per_container || 0) * totalContainersQty

    const agentQuotePayload = {
      agent_id: agentForm.agent_id || null,
      agente_nombre: agentForm.agente_nombre,
      costo: Number(agentForm.ocean_freight || 0),
      ocean_freight: Number(agentForm.ocean_freight || 0),
      exw_cost: Number(agentForm.exw_cost || 0),
      mbl_fee: Number(agentForm.mbl_fee || 0),
      profit_per_container: Number(agentForm.profit_per_container || 0),
      containers_qty: Number(agentForm.containers_qty || 1),
      free_days_destination: Number(agentForm.free_days_destination || 0),
      carrier: agentForm.carrier,
      transshipment: agentForm.transshipment,
      moneda: agentForm.moneda,
      transit_time: agentForm.transit_time,
      suggested_sale: suggestedSale,
    }

    const { error } = editingAgentQuoteId
      ? await supabase
          .from('agent_quotes')
          .update(agentQuotePayload)
          .eq('id', editingAgentQuoteId)
      : await supabase
          .from('agent_quotes')
          .insert({
            quotation_id: selectedQuote.id,
            ...agentQuotePayload,
            is_selected: false,
          })

    if (error) {
      alert(error.message)
      return
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
    })

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

    const currency = selectedAgentQuote.moneda || 'USD'
    const supplier = selectedAgentQuote.agente_nombre || ''
    const containersQty = getTotalContainersQty(selectedAgentQuote.containers_qty)
    const oceanFreight = Number(
      selectedAgentQuote.ocean_freight || selectedAgentQuote.costo || 0
    )
    const exwCost = Number(selectedAgentQuote.exw_cost || 0)
    const mblFee = Number(selectedAgentQuote.mbl_fee || 0)
    const profit = Number(selectedAgentQuote.profit_per_container || 0)
    const totalProfit = profit * containersQty

    const pricingLines = [
      {
        quotation_id: selectedQuote.id,
        item_type: 'Flete',
        description: 'Ocean Freight',
        cost_amount: oceanFreight,
        sale_amount: oceanFreight,
        quantity: 1,
        taxable: false,
        tax_rate: 15,
        tax_amount: 0,
        total_amount: oceanFreight,
        currency,
        supplier,
        notes: '',
        created_by: profile?.id,
      },
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
      {
        quotation_id: selectedQuote.id,
        item_type: 'Documentación',
        description: 'MBL',
        cost_amount: mblFee,
        sale_amount: mblFee,
        quantity: 1,
        taxable: false,
        tax_rate: 15,
        tax_amount: 0,
        total_amount: mblFee,
        currency,
        supplier,
        notes: '',
        created_by: profile?.id,
      },
      {
        quotation_id: selectedQuote.id,
        item_type: 'Profit',
        description: `Profit (${containersQty} cont.)`,
        cost_amount: 0,
        sale_amount: totalProfit,
        quantity: 1,
        taxable: false,
        tax_rate: 15,
        tax_amount: 0,
        total_amount: totalProfit,
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
    setEditingItemId(item.id)

    setEditPricingForm({
      cost_amount: item.cost_amount?.toString() || '',
      sale_amount: item.sale_amount?.toString() || '',
    })
  }

  const cancelEditingPricingItem = () => {
    setEditingItemId(null)

    setEditPricingForm({
      cost_amount: '',
      sale_amount: '',
    })
  }

  const updatePricingItem = async (item: any) => {
    if (!selectedQuote) return

    const quantity = Number(item.quantity || 1)
    const saleAmount = Number(editPricingForm.sale_amount || 0)
    const subtotal = saleAmount * quantity
    const taxAmount = item.taxable ? subtotal * 0.15 : 0
    const totalAmount = subtotal + taxAmount

    const { error } = await supabase
      .from('pricing_items')
      .update({
        cost_amount: Number(editPricingForm.cost_amount || 0),
        sale_amount: saleAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      })
      .eq('id', item.id)

    if (error) {
      alert(error.message)
      return
    }

    setEditingItemId(null)

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

    setSelectedQuote({
      ...selectedQuote,
      status: 'Enviada al Cliente',
    })
  }

  const totalCost = pricingItems.reduce(
    (sum, item) => sum + Number(item.cost_amount || 0),
    0
  )

  const totalSale = pricingItems.reduce(
    (sum, item) => sum + Number(item.sale_amount || 0),
    0
  )

  const profit = totalSale - totalCost

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
    totalSale > 0 ? (profit / totalSale) * 100 : 0

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

  const agentTotalCost =
    Number(agentForm.ocean_freight || 0) +
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

      case 'En NegociaciÃ³n':
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

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold">
            Comparativo de Tarifas / Pricing
          </h1>

          <p className="text-gray-500 mt-2">
            Agrega tarifas de agentes, construye venta final y valida rentabilidad.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Cotizaciones</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {quotations.map((quote) => (
                <button
                  key={quote.id}
                  onClick={() => handleSelectQuote(quote)}
                  className={`w-full text-left border rounded-xl p-4 hover:bg-gray-50 transition ${
                    selectedQuote?.id === quote.id
                      ? 'border-zinc-950 bg-gray-50'
                      : ''
                  }`}
                >
                  <p className="font-bold">
                    {quote.quotation_number || 'Sin número'}
                  </p>

                  <p className="text-sm text-gray-500">
                    {quote.clientes
                      ? quote.clientes.nombre
                      : 'Sin cliente'}
                  </p>

                  <p className="text-sm text-gray-500">
                    {quote.origen} → {quote.destino}
                  </p>

                  <span
                    className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                      quote.status || ''
                    )}`}
                  >
                    {quote.status || 'Sin estado'}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="col-span-2 space-y-6">
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
                      {selectedQuote.quotation_number} — {selectedQuote.origen} → {selectedQuote.destino}
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

                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-gray-500">
                        Costo Total
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className="text-3xl font-bold">
                        USD {formatCurrency(totalCost)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-gray-500">
                        Venta Total
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className="text-3xl font-bold">
                        USD {formatCurrency(totalSale)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-gray-500">
                        Profit
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p className={`text-3xl font-bold ${
                        profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        USD {formatCurrency(profit)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-gray-500">
                        GP %
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      <p
                        className={`text-3xl font-bold ${
                          gpPercentage >= 15
                            ? 'text-green-600'
                            : gpPercentage >= 8
                            ? 'text-orange-500'
                            : 'text-red-600'
                        }`}
                      >
                        {gpPercentage.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Análisis Comercial
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border p-4">
                      <p className="text-sm text-gray-500">
                        Rentabilidad
                      </p>

                      <Badge className={`mt-2 ${profitabilityColor}`}>
                        {profitabilityStatus}
                      </Badge>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-sm text-gray-500">
                        Target Cliente
                      </p>

                      <p className="text-2xl font-bold">
                        {targetRate > 0
                          ? `USD ${formatCurrency(targetRate)}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-sm text-gray-500">
                        Comparación Target
                      </p>

                      {targetRate > 0 ? (
                        <div>
                          <p
                            className={`text-2xl font-bold ${
                              targetRateDifference <= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}
                          >
                            {targetRateDifference <= 0 ? '-' : '+'} USD{' '}
                            {formatCurrency(Math.abs(targetRateDifference))}
                          </p>

                          <p className="text-sm text-slate-500 mt-1">
                            {targetRateDifference <= 0
                              ? `${Math.abs(targetRateDifferencePercentage).toFixed(2)}% por debajo o dentro del target`
                              : `${targetRateDifferencePercentage.toFixed(2)}% arriba del target`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold">N/A</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Agregar Tarifa de Agente</CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-4 gap-4">
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
                      className="border rounded-xl px-3 py-2"
                    >
                      <option value="">Seleccionar agente/proveedor</option>

                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} — {agent.type}
                        </option>
                      ))}
                    </select>

                    <input
                      name="ocean_freight"
                      placeholder="Ocean Freight"
                      value={agentForm.ocean_freight}
                      onChange={handleAgentChange}
                      className="border p-3 rounded"
                    />

                    <select
                      name="moneda"
                      value={agentForm.moneda}
                      onChange={handleAgentChange}
                      className="border p-3 rounded"
                    >
                      <option value="USD">USD</option>
                      <option value="HNL">HNL</option>
                    </select>

                    <input
                      name="transit_time"
                      placeholder="Tránsito"
                      value={agentForm.transit_time}
                      onChange={handleAgentChange}
                      className="border p-3 rounded"
                    />

                    <input
                      className="border rounded-xl px-3 py-2"
                      placeholder="Carrier / Naviera"
                      value={agentForm.carrier}
                      onChange={(e) =>
                        setAgentForm({ ...agentForm, carrier: e.target.value })
                      }
                    />

                    <select
                      className="border rounded-xl px-3 py-2"
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

                    <input
                      className="border rounded-xl px-3 py-2"
                      placeholder="Días libres destino"
                      value={agentForm.free_days_destination}
                      onChange={(e) =>
                        setAgentForm({
                          ...agentForm,
                          free_days_destination: e.target.value,
                        })
                      }
                    />

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 col-span-4">
                      <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                        Costo Total Sari
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
                      className="bg-zinc-950 text-white px-6 py-3 rounded-xl col-span-4"
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
                              <th className="p-3">Ocean Freight</th>
                              <th className="p-3">EXW</th>
                              <th className="p-3">MBL</th>
                              <th className="p-3">Profit/Cont.</th>
                              <th className="p-3">Cont.</th>
                              <th className="p-3">Venta Sugerida</th>
                              <th className="p-3">Tránsito</th>
                              <th className="p-3">Días Libres</th>
                              <th className="p-3">Seleccionar</th>
                            </tr>
                          </thead>

                          <tbody>
                            {agentQuotes.map((quote) => (
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

                                    {quote.is_selected ? (
                                      <div className="flex items-center gap-1 text-green-600 font-semibold text-sm">
                                        <CheckCircle size={16} />
                                        Seleccionada
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => selectAgentQuote(quote.id)}
                                        className="px-3 py-1 rounded-lg bg-black text-white text-sm"
                                      >
                                        Seleccionar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pricing Engine</CardTitle>
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
                        Agregar Línea
                      </button>
                    </div>

                    <div className="bg-zinc-100 rounded-xl p-4 text-sm">
                      <p>Subtotal: USD {subtotal.toFixed(2)}</p>

                      <p>ISV: USD {taxAmount.toFixed(2)}</p>

                      <p className="font-bold text-lg mt-2">
                        Total: USD {totalAmount.toFixed(2)}
                      </p>
                    </div>

                    {pricingItems.length === 0 ? (
                      <p className="text-gray-500">
                        No hay líneas de pricing.
                      </p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-3">Descripción</th>
                            <th className="p-3">Proveedor</th>
                            <th className="p-3">QTY</th>
                            <th className="p-3">Valor</th>
                            <th className="p-3">ISV</th>
                            <th className="p-3">Total</th>
                            <th className="p-3">Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {pricingItems.map((item) => {
                            const qty = Number(item.quantity || 1)
                            const subtotal = qty * Number(item.sale_amount || 0)
                            const tax = item.taxable ? subtotal * 0.15 : 0
                            const total = subtotal + tax
                            const currency = item.currency || 'USD'

                            return (
                              <tr key={item.id} className="border-b">
                                <td className="p-3">{item.description}</td>

                                <td className="p-3">
                                  {item.supplier || 'N/A'}
                                </td>

                                <td className="p-3">{qty}</td>

                                <td className="p-3">
                                  {currency} {Number(item.sale_amount || 0).toFixed(2)}
                                </td>

                                <td className="p-3">
                                  {currency} {tax.toFixed(2)}
                                </td>

                                <td className="p-3 font-bold">
                                  {currency} {total.toFixed(2)}
                                </td>

                                <td className="p-3">
                                  {editingItemId === item.id ? (
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
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
