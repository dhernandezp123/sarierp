'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'
import {
  PDFDownloadLink,
} from '@react-pdf/renderer'

import QuotationPDF from '../../../components/pdf/quotation-pdf'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

import { Badge } from '../../../components/ui/badge'

export default function QuotationDetailPage() {
  const { profile } = useUser()
  const params = useParams()

  const [quotation, setQuotation] = useState<any>(null)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)

  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchData(params.id as string)
    }
  }, [params.id])

  const fetchData = async (id: string) => {
    const { data: quoteData } = await supabase
      .from('quotations')
.select(`
  *,
  clientes (
    codigo_cliente,
    nombre,
    nit,
    telefono,
    email_1,
    ciudad,
    pais,
    condicion_pago,
    dias_credito
  )
`)
      .eq('id', id)
      .single()

    const { data: agentData } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    const { data: validationData } = await supabase
      .from('cost_validations')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    const { data: statusHistoryData } = await supabase
      .from('quotation_status_history')
      .select(`
        *,
        profiles:changed_by (
          nombre,
          apellido
        )
      `)
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    setQuotation(quoteData) 
    const { data: selectedPricing } = await supabase
  .from('agent_quotes')
  .select('*')
  .eq('quotation_id', id)
  .eq('selected', true)
  .single()

    setSelectedAgent(selectedPricing)
    setAgentQuotes(agentData || [])
    setValidations(validationData || [])
    setStatusHistory(statusHistoryData || [])
    setLoading(false)
  }

  if (loading) {
    return <p className="p-8">Cargando detalle...</p>
  }

  if (!quotation) {
    return <p className="p-8">Cotización no encontrada.</p>
  }

  return (
  <AppLayout role={profile?.rol || 'Ventas'}>
    <div className="space-y-6">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">
            {quotation.quotation_number || 'Sin número'}
          </h1>

          <p className="text-gray-500 mt-2">
            Detalle de Cotización
          </p>
        </div>

        <PDFDownloadLink
          document={
            <QuotationPDF
              quotation={quotation}
              selectedAgent={selectedAgent}
            />
          }
          fileName={`${quotation?.quotation_number || 'cotizacion'}.pdf`}
          className="bg-zinc-950 text-white px-5 py-3 rounded-xl hover:bg-zinc-800 transition"
        >
          {({ loading }) =>
            loading ? 'Generando PDF...' : 'Descargar PDF'
          }
        </PDFDownloadLink>
      </div>

      <Tabs defaultValue="resumen" className="space-y-6">
  <TabsList className="bg-white border rounded-xl p-1">
    <TabsTrigger value="resumen">Resumen</TabsTrigger>
    <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
    <TabsTrigger value="validaciones">Validaciones</TabsTrigger>
    <TabsTrigger value="historial">Historial</TabsTrigger>
  </TabsList>

  <TabsContent value="resumen">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                <p>
                  <strong>Estado:</strong>{' '}
                  <Badge>{quotation.status || 'Sin estado'}</Badge>
                </p>

                <p>
                  <strong>Cliente:</strong>{' '}
                  {quotation.clientes
                    ? `${quotation.clientes.codigo_cliente} — ${quotation.clientes.nombre}`
                    : 'Sin cliente'}
                </p>

                <p><strong>Teléfono:</strong> {quotation.clientes?.telefono || 'N/A'}</p>
                <p><strong>Email:</strong> {quotation.clientes?.email_1 || 'N/A'}</p>
                <p>
                  <strong>Ubicación:</strong>{' '}
                  {quotation.clientes
                    ? `${quotation.clientes.ciudad || 'N/A'}, ${quotation.clientes.pais || 'N/A'}`
                    : 'N/A'}
                </p>
                <p><strong>Condición:</strong> {quotation.clientes?.condicion_pago || 'N/A'}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalles del Embarque</CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                <p><strong>Tipo:</strong> {quotation.quote_type || 'N/A'}</p>
                <p><strong>Incoterm:</strong> {quotation.incoterm || 'N/A'}</p>
                <p><strong>Transporte:</strong> {quotation.tipo_transporte || 'N/A'}</p>
                <p><strong>Origen:</strong> {quotation.origen || 'N/A'}</p>
                <p><strong>Destino:</strong> {quotation.destino || 'N/A'}</p>
                <p><strong>Puerto Origen:</strong> {quotation.puerto_origen || 'N/A'}</p>
                <p><strong>Puerto Destino:</strong> {quotation.puerto_destino || 'N/A'}</p>
                <p><strong>Contenedor:</strong> {quotation.container_type || 'N/A'}</p>
                <p><strong>Peso:</strong> {quotation.peso_kg || 'N/A'} KG</p>
                <p><strong>CBM:</strong> {quotation.volumen_cbm || 'N/A'}</p>
                <p><strong>Bultos:</strong> {quotation.cantidad_bultos || 'N/A'}</p>
                <p><strong>Mercancía:</strong> {quotation.commodity || 'N/A'}</p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Observaciones</CardTitle>
              </CardHeader>

              <CardContent>
                <p>{quotation.observaciones || 'Sin observaciones'}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tarifas">
          <Card>
            <CardHeader>
              <CardTitle>Tarifas de Agentes</CardTitle>
            </CardHeader>

            <CardContent>
              {agentQuotes.length === 0 ? (
                <p className="text-gray-500">
                  No hay tarifas registradas.
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
                            <Badge className="bg-green-600 text-white">Sí</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validaciones">
          <Card>
            <CardHeader>
              <CardTitle>Validaciones de Costos</CardTitle>
            </CardHeader>

            <CardContent>
              {validations.length === 0 ? (
                <p className="text-gray-500">
                  No hay validaciones registradas.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-white">
                    <tr>
                      <th className="p-3">Cotizado</th>
                      <th className="p-3">Facturado</th>
                      <th className="p-3">Diferencia</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Observaciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {validations.map((validation) => (
                      <tr key={validation.id} className="border-b">
                        <td className="p-3">{validation.quoted_cost}</td>
                        <td className="p-3">{validation.invoiced_cost}</td>
                        <td className="p-3">{validation.difference}</td>
                        <td className="p-3">{validation.status}</td>
                        <td className="p-3">{validation.observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Estados</CardTitle>
            </CardHeader>

            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-gray-500">
                  No hay cambios de estado registrados.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-white">
                    <tr>
                      <th className="p-3">Estado Anterior</th>
                      <th className="p-3">Nuevo Estado</th>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Fecha</th>
                    </tr>
                  </thead>

                  <tbody>
                    {statusHistory.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-3">
                          {item.old_status || 'Sin estado'}
                        </td>

                        <td className="p-3">
                          {item.new_status}
                        </td>

                        <td className="p-3">
                          {item.profiles
                            ? `${item.profiles.nombre} ${item.profiles.apellido}`
                            : 'Usuario no registrado'}
                        </td>

                        <td className="p-3">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </AppLayout>
)
}