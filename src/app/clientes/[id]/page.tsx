'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'

export default function ClienteProfilePage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [cliente, setCliente] = useState<any>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [clientNotes, setClientNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('resumen')

  useEffect(() => {
    if (params.id) {
      fetchCliente()
      fetchQuotations()
      fetchClientNotes()
    }
  }, [params.id])

  const fetchCliente = async () => {
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
      .eq('id', params.id as string)
      .single()

    if (error) {
      alert(error.message)
      return
    }

    console.log('Cliente cargado en perfil:', data)
    console.log('Telefono cargado en perfil:', data?.telefono)

    setCliente(data)
    setLoading(false)
  }

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('cliente_id', params.id as string)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setQuotations(data || [])
  }

  const fetchClientNotes = async () => {
    const { data, error } = await supabase
      .from('client_notes')
      .select(`
        *,
        profiles (
          nombre,
          apellido
        )
      `)
      .eq('cliente_id', params.id as string)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setClientNotes(data || [])
  }

  const saveClientNote = async () => {
    if (!newNote.trim()) {
      alert('Escribe una nota antes de guardar')
      return
    }

    const { error } = await supabase.from('client_notes').insert([
      {
        cliente_id: params.id as string,
        note: newNote.trim(),
        created_by: profile?.id,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    setNewNote('')
    await fetchClientNotes()
  }

  if (loading) {
    return <div className="p-8">Cargando cliente...</div>
  }

  const clientTimeline = [
    cliente?.created_at && {
      type: 'Cliente creado',
      description: 'El cliente fue registrado en el sistema.',
      date: cliente.created_at,
    },

    ...quotations.map((quote) => ({
      type: `Cotización ${quote.status || 'creada'}`,
      description: `${quote.quotation_number || 'Sin número'} — ${
        quote.origen || 'N/A'
      } → ${quote.destino || 'N/A'}`,
      date: quote.created_at,
    })),

    ...clientNotes.map((note) => ({
      type: 'Nota comercial',
      description: note.note,
      date: note.created_at,
    })),
  ]
    .filter(Boolean)
    .sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    )

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/clientes')}
            className="rounded-xl border px-4 py-2 font-semibold"
          >
            Volver a clientes
          </button>

          <button
            type="button"
            onClick={() => router.push(`/clientes/${cliente.id}/edit`)}
            className="rounded-xl bg-black px-5 py-3 text-white font-semibold"
          >
            Editar Cliente
          </button>
        </div>

        <div>
          <h1 className="text-4xl font-bold">
            {cliente?.nombre}
          </h1>

          <p className="text-gray-500 mt-2">
            Perfil comercial del cliente
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            'resumen',
            'cotizaciones',
            'notas',
            'historial',
          ].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? 'bg-black text-white'
                  : 'border bg-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Cotizaciones
            </p>

            <p className="text-3xl font-bold">
              {quotations.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Ganadas
            </p>

            <p className="text-3xl font-bold">
              {
                quotations.filter(
                  (q) => q.status === 'Ganada'
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Enviadas
            </p>

            <p className="text-3xl font-bold">
              {
                quotations.filter(
                  (q) => q.status === 'Enviada al Cliente'
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Última Cotización
            </p>

            <p className="text-sm font-bold mt-2">
              {quotations[0]?.quotation_number || 'N/A'}
            </p>
          </div>
        </div>

        {activeTab === 'resumen' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-gray-500">Código</p>
                <p className="font-bold">{cliente?.codigo_cliente || 'N/A'}</p>
              </div>

              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-gray-500">RTN / NIT / RUC</p>
                <p className="font-bold">
                  {cliente?.rtn || cliente?.nit || cliente?.ruc || 'N/A'}
                </p>
              </div>

              <div className="rounded-2xl border bg-white p-5">
                <p className="text-sm text-gray-500">Condición de pago</p>
                <p className="font-bold">
                  {cliente?.condicion_pago ||
                    cliente?.payment_terms ||
                    'Contado'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-bold mb-4">
                Información del Cliente
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{cliente?.email_1 || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Persona de contacto</p>
                  <p className="font-medium">{cliente?.contacto || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Teléfono</p>
                  <p className="font-medium">{cliente?.telefono || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Tipo de cliente</p>
                  <p className="font-medium">{cliente?.tipo_cliente || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Ciudad</p>
                  <p className="font-medium">{cliente?.ciudad || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Asegura carga</p>
                  <p className="font-medium">{cliente?.asegura_carga ? 'Sí' : 'No'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Vendedor asignado
                  </p>

                  <p className="font-medium">
                    {cliente?.vendedor
                      ? `${cliente.vendedor.nombre} ${cliente.vendedor.apellido}`
                      : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">País</p>
                  <p className="font-medium">{cliente?.pais || 'N/A'}</p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Dirección</p>
                  <p className="font-medium">{cliente?.direccion || 'N/A'}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'cotizaciones' && (
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Cotizaciones del Cliente
            </h2>

            {quotations.length === 0 ? (
              <p className="text-gray-500">
                Este cliente todavía no tiene cotizaciones.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="p-3">No.</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Ruta</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {quotations.map((quote) => (
                      <tr key={quote.id} className="border-b">
                        <td className="p-3 font-semibold">
                          {quote.quotation_number || 'Sin número'}
                        </td>

                        <td className="p-3">
                          {quote.quote_type || 'N/A'}
                        </td>

                        <td className="p-3">
                          {quote.origen || 'N/A'} → {quote.destino || 'N/A'}
                        </td>

                        <td className="p-3">
                          {quote.status || 'N/A'}
                        </td>

                        <td className="p-3">
                          {quote.created_at
                            ? new Date(quote.created_at).toLocaleDateString()
                            : 'N/A'}
                        </td>

                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => router.push(`/quotations/${quote.id}`)}
                            className="rounded-xl border px-3 py-2 font-semibold"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notas' && (
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Notas Comerciales
            </h2>

            <div className="space-y-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escribe una nota comercial..."
                className="w-full rounded-xl border p-3 min-h-28"
              />

              <button
                type="button"
                onClick={saveClientNote}
                className="rounded-xl bg-black px-5 py-3 font-semibold text-white"
              >
                Guardar Nota
              </button>

              {clientNotes.length === 0 ? (
                <p className="text-gray-500">
                  No hay notas comerciales registradas.
                </p>
              ) : (
                <div className="space-y-3">
                  {clientNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border p-4">
                      <p className="text-sm whitespace-pre-wrap">
                        {note.note}
                      </p>

                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                        <p>
                          Por:{' '}
                          {note.profiles
                            ? `${note.profiles.nombre} ${note.profiles.apellido}`
                            : 'Usuario'}
                        </p>

                        <p>
                          {note.created_at
                            ? new Date(note.created_at).toLocaleString()
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Historial del Cliente
            </h2>

            {clientTimeline.length === 0 ? (
              <p className="text-gray-500">
                No hay historial disponible.
              </p>
            ) : (
              <div className="space-y-4">
                {clientTimeline.map((event: any, index: number) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-slate-700 mt-1" />

                      {index !== clientTimeline.length - 1 && (
                        <div className="w-px flex-1 bg-slate-300 min-h-[40px]" />
                      )}
                    </div>

                    <div className="flex-1 rounded-xl border p-3">
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">
                            {event.type}
                          </p>

                          <p className="text-sm text-gray-600 mt-1">
                            {event.description}
                          </p>
                        </div>

                        <p className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(event.date).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
