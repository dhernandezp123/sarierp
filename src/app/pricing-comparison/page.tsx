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

  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])

  const [agentForm, setAgentForm] = useState({
    agente_nombre: '',
    costo: '',
    moneda: 'USD',
    transit_time: '',
  })

  const [pricingForm, setPricingForm] = useState({
    item_type: 'Flete',
    description: '',
    cost_amount: '',
    sale_amount: '',
    currency: 'USD',
    supplier: '',
    notes: '',
  })

  useEffect(() => {
    fetchQuotations()
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

    const { error } = await supabase.from('agent_quotes').insert([
      {
        quotation_id: selectedQuote.id,
        agente_nombre: agentForm.agente_nombre,
        costo: Number(agentForm.costo),
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
      agente_nombre: '',
      costo: '',
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

  const markAsSentToClient = async () => {
    if (!selectedQuote) return

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
                    <input
                      name="agente_nombre"
                      placeholder="Agente"
                      value={agentForm.agente_nombre}
                      onChange={handleAgentChange}
                      className="border p-3 rounded"
                    />

                    <input
                      name="costo"
                      placeholder="Costo"
                      value={agentForm.costo}
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
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-3">Agente</th>
                            <th className="p-3">Costo</th>
                            <th className="p-3">Moneda</th>
                            <th className="p-3">Tránsito</th>
                            <th className="p-3">Seleccionada</th>
                            <th className="p-3">Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {agentQuotes.map((agent) => (
                            <tr key={agent.id} className="border-b">
                              <td className="p-3">{agent.agente_nombre}</td>
                              <td className="p-3">{agent.costo}</td>
                              <td className="p-3">{agent.moneda}</td>
                              <td className="p-3">{agent.transit_time}</td>
                              <td className="p-3">
                                {agent.is_selected ? (
                                  <Badge className="bg-green-600 text-white">
                                    Sí
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    No
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => selectAgentQuote(agent.id)}
                                  className="bg-zinc-950 text-white px-4 py-2 rounded-lg"
                                >
                                  Seleccionar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

                    {pricingItems.length === 0 ? (
                      <p className="text-gray-500">
                        No hay líneas de pricing.
                      </p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Descripción</th>
                            <th className="p-3">Costo</th>
                            <th className="p-3">Venta</th>
                            <th className="p-3">Profit</th>
                            <th className="p-3">Proveedor</th>
                            <th className="p-3">Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {pricingItems.map((item) => (
                            <tr key={item.id} className="border-b">
                              <td className="p-3">{item.item_type}</td>
                              <td className="p-3">{item.description}</td>
                              <td className="p-3">
                                {item.currency} {item.cost_amount}
                              </td>
                              <td className="p-3">
                                {item.currency} {item.sale_amount}
                              </td>
                              <td className="p-3 font-bold">
                                {item.currency}{' '}
                                {(
                                  Number(item.sale_amount || 0) -
                                  Number(item.cost_amount || 0)
                                ).toFixed(2)}
                              </td>
                              <td className="p-3">
                                {item.supplier || 'N/A'}
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => deletePricingItem(item.id)}
                                  className="text-red-600 font-medium"
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end">
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