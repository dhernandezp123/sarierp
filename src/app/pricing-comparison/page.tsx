'use client'

import { useEffect, useState } from 'react'

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

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)
    await fetchAgentQuotes(quote.id)
    await fetchPricingItems(quote.id)
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

  const saveAgentQuote = async () => {
    if (!selectedQuote) {
      alert('Selecciona una cotización primero')
      return
    }

    const suggestedSale =
      Number(agentForm.ocean_freight || 0) +
      Number(agentForm.exw_cost || 0) +
      Number(agentForm.mbl_fee || 0) +
      Number(agentForm.profit_per_container || 0) *
        Number(agentForm.containers_qty || 1)

    const { error } = await supabase.from('agent_quotes').insert([
      {
        quotation_id: selectedQuote.id,
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
        suggested_sale: suggestedSale,
        moneda: agentForm.moneda,
        transit_time: agentForm.transit_time,
        is_selected: false,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    await supabase
      .from('quotations')
      .update({ status: 'Pendiente de Fijar Precios' })
      .eq('id', selectedQuote.id)

    alert('Tarifa de agente agregada')

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
      moneda: 'USD',
      transit_time: '',
    })

    await fetchAgentQuotes(selectedQuote.id)
    await fetchQuotations()
  }

  const selectAgentQuote = async (agentQuoteId: string) => {
    if (!selectedQuote) return

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

    alert('Tarifa seleccionada')

    await fetchAgentQuotes(selectedQuote.id)
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

const targetDifference =
  targetRate > 0 ? totalSale - targetRate : 0

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

const targetStatus =
  targetRate === 0
    ? 'Sin target'
    : totalSale <= targetRate
    ? 'Dentro del target'
    : 'Sobre target'

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

                  <Badge className="mt-2">
                    {quote.status || 'Sin estado'}
                  </Badge>
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
                        {selectedQuote.container_type || 'N/A'}
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
                        ${totalCost.toFixed(2)}
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
                        ${totalSale.toFixed(2)}
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
                        ${profit.toFixed(2)}
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

                      <p className="text-2xl font-bold mt-2">
                        {targetRate > 0
                          ? `$${targetRate.toFixed(2)}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-sm text-gray-500">
                        Comparación Target
                      </p>

                      <p
                        className={`text-2xl font-bold mt-2 ${
                          targetRate === 0
                            ? 'text-gray-500'
                            : targetDifference <= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {targetRate === 0
                          ? 'Sin target'
                          : targetDifference <= 0
                          ? `-$${Math.abs(targetDifference).toFixed(2)}`
                          : `+$${targetDifference.toFixed(2)}`}
                      </p>

                      <p className="text-sm text-gray-500 mt-1">
                        {targetStatus}
                      </p>
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

                    <button
                      onClick={saveAgentQuote}
                      className="bg-zinc-950 text-white px-6 py-3 rounded-xl col-span-4"
                    >
                      Guardar Tarifa
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
                                  <button
                                    onClick={() => selectAgentQuote(quote.id)}
                                    className="bg-zinc-950 text-white px-4 py-2 rounded-lg"
                                  >
                                    Seleccionar
                                  </button>
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
