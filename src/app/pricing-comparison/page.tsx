'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

export default function PricingComparisonPage() {
  const { profile } = useUser()

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [agentQuotes, setAgentQuotes] = useState<any[]>([])

  const [formData, setFormData] = useState({
    agente_nombre: '',
    costo: '',
    moneda: 'USD',
    transit_time: '',
  })

  useEffect(() => {
    fetchQuotations()
  }, [])

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
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

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)
    await fetchAgentQuotes(quote.id)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
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
        agente_nombre: formData.agente_nombre,
        costo: Number(formData.costo),
        moneda: formData.moneda,
        transit_time: formData.transit_time,
        is_selected: false,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    await supabase
      .from('quotations')
      .update({ status: 'Pricing' })
      .eq('id', selectedQuote.id)

    alert('Tarifa agregada correctamente')

    setFormData({
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

    await supabase
      .from('quotations')
      .update({ status: 'Enviada' })
      .eq('id', selectedQuote.id)

    alert('Tarifa seleccionada y cotización enviada')

    await fetchAgentQuotes(selectedQuote.id)
    await fetchQuotations()
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <h1 className="text-4xl font-bold mb-8">
        Comparativo de Tarifas
      </h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-4">
            Cotizaciones
          </h2>

          <div className="space-y-3">
            {quotations.map((quote) => (
              <button
                key={quote.id}
                onClick={() => handleSelectQuote(quote)}
                className="w-full text-left border rounded-lg p-4 hover:bg-gray-100"
              >
                <p className="font-bold">
                  {quote.origen} → {quote.destino}
                </p>

                <p className="text-sm text-gray-500">
                  {quote.tipo_transporte} | {quote.incoterm} | {quote.status}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-4">
            Agregar Tarifa de Agente
          </h2>

          {selectedQuote ? (
            <>
              <div className="mb-6 rounded-lg bg-gray-100 p-4">
                <p className="font-bold">Cotización seleccionada:</p>
                <p>
                  {selectedQuote.origen} → {selectedQuote.destino}
                </p>
              </div>

              <div className="space-y-4">
                <input
                  name="agente_nombre"
                  placeholder="Nombre del agente"
                  value={formData.agente_nombre}
                  onChange={handleChange}
                  className="w-full border p-3 rounded"
                />

                <input
                  name="costo"
                  placeholder="Costo"
                  value={formData.costo}
                  onChange={handleChange}
                  className="w-full border p-3 rounded"
                />

                <select
                  name="moneda"
                  value={formData.moneda}
                  onChange={handleChange}
                  className="w-full border p-3 rounded"
                >
                  <option value="USD">USD</option>
                  <option value="HNL">HNL</option>
                </select>

                <input
                  name="transit_time"
                  placeholder="Transit time"
                  value={formData.transit_time}
                  onChange={handleChange}
                  className="w-full border p-3 rounded"
                />

                <button
                  onClick={saveAgentQuote}
                  className="bg-black text-white px-6 py-3 rounded-xl"
                >
                  Guardar Tarifa
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-bold mb-4">
                  Tarifas guardadas
                </h3>

                <div className="space-y-3">
                  {agentQuotes.length === 0 && (
                    <p className="text-gray-500">
                      No hay tarifas guardadas para esta cotización.
                    </p>
                  )}

                  {agentQuotes.map((agentQuote) => (
                    <div
                      key={agentQuote.id}
                      className="border rounded-lg p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold">
                          {agentQuote.agente_nombre}
                        </p>

                        <p className="text-sm text-gray-500">
                          {agentQuote.moneda} {agentQuote.costo} |{' '}
                          {agentQuote.transit_time}
                        </p>

                        {agentQuote.is_selected && (
                          <p className="text-green-600 font-bold mt-2">
                            Seleccionado
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => selectAgentQuote(agentQuote.id)}
                        className="bg-gray-900 text-white px-4 py-2 rounded"
                      >
                        Seleccionar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-500">
              Selecciona una cotización para agregar tarifas.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}