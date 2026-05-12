'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

export default function CostValidationPage() {
  const { profile } = useUser()

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [selectedAgentQuote, setSelectedAgentQuote] = useState<any>(null)
  const [invoicedCost, setInvoicedCost] = useState('')
  const [observations, setObservations] = useState('')

  useEffect(() => {
    fetchQuotations()
  }, [])

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('status', 'Ganada')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setQuotations(data || [])
  }

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)

    const { data, error } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', quote.id)
      .eq('is_selected', true)
      .single()

    if (error) {
      alert('No hay tarifa seleccionada para esta cotización')
      setSelectedAgentQuote(null)
      return
    }

    setSelectedAgentQuote(data)
  }

  const handleSaveValidation = async () => {
    if (!selectedQuote || !selectedAgentQuote) {
      alert('Selecciona una cotización con tarifa seleccionada')
      return
    }

    const quotedCost = Number(selectedAgentQuote.costo)
    const invoiceCost = Number(invoicedCost)
    const difference = invoiceCost - quotedCost

    let status = 'Coincide'

    if (difference !== 0) {
      status = 'Diferencia'
    }

    const { error } = await supabase.from('cost_validations').insert([
      {
        quotation_id: selectedQuote.id,
        agent_quote_id: selectedAgentQuote.id,
        quoted_cost: quotedCost,
        invoiced_cost: invoiceCost,
        difference,
        status,
        observations,
        validated_by: profile?.id,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    await supabase
      .from('quotations')
      .update({ status: 'Validada' })
      .eq('id', selectedQuote.id)

    alert('Validación guardada')

    setInvoicedCost('')
    setObservations('')
    setSelectedQuote(null)
    setSelectedAgentQuote(null)

    await fetchQuotations()
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <h1 className="text-4xl font-bold mb-8">Validación de Costos</h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold mb-4">Cotizaciones Ganadas</h2>

          <div className="space-y-3">
            {quotations.length === 0 && (
              <p className="text-gray-500">
                No hay cotizaciones ganadas pendientes de validar.
              </p>
            )}

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
          <h2 className="text-xl font-bold mb-4">Validar Factura</h2>

          {selectedAgentQuote ? (
            <>
              <div className="bg-gray-100 rounded-lg p-4 mb-6">
                <p className="font-bold">Agente:</p>
                <p>{selectedAgentQuote.agente_nombre}</p>

                <p className="mt-4 font-bold">Costo Cotizado:</p>
                <p>
                  {selectedAgentQuote.moneda} {selectedAgentQuote.costo}
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="number"
                  placeholder="Costo facturado"
                  value={invoicedCost}
                  onChange={(e) => setInvoicedCost(e.target.value)}
                  className="w-full border p-3 rounded"
                />

                <textarea
                  placeholder="Observaciones"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full border p-3 rounded h-32"
                />

                <button
                  onClick={handleSaveValidation}
                  className="bg-black text-white px-6 py-3 rounded-xl"
                >
                  Guardar Validación
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500">
              Selecciona una cotización enviada.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}