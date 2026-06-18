'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'

const clientRateCatalog = [
  { code: 'small_maritimo_min_lcl_1000_lbs_45_ft3', label: 'Small Mínimo LCL 1000 lbs / 45 ft3', category: 'Small Marítimo', unit: 'flat' },
  { code: 'minimo_maritimo_2mil_lbs_90_ft3', label: 'Mínimo LCL 2 mil lbs / 90 ft3', category: 'Mínimo Marítimo', unit: 'flat' },
  { code: 'lcl_maritimo_sps_ft3', label: 'LCL Marítimo SPS - FT3', category: 'LCL Marítimo', unit: 'FT3' },
  { code: 'lcl_maritimo_sps_lbs', label: 'LCL Marítimo SPS - LBS', category: 'LCL Marítimo', unit: 'LBS' },
  { code: 'consolidado_aereo_kg', label: 'Consolidado Aéreo - KG', category: 'Consolidado Aéreo', unit: 'KG' },
  { code: 'delivery_miami', label: 'DELIVERY / Miami', category: 'Consolidado Aéreo', unit: 'flat' },
  { code: 'documentos_manejo', label: 'Documentos / Manejo', category: 'Otros Cargos', unit: 'flat' },
  { code: 'desconsolidar', label: 'Desconsolidación', category: 'Otros Cargos', unit: 'flat' },
  { code: 'bl', label: 'BL', category: 'Otros Cargos', unit: 'flat' },
  { code: 'guia', label: 'Guía', category: 'Otros Cargos', unit: 'flat' },
  { code: 'sed', label: 'SED', category: 'Otros Cargos', unit: 'flat' },
  { code: 'recolectas_internas', label: 'Recolectas Internas', category: 'Otros Cargos', unit: 'flat' },
  { code: 'fumigacion', label: 'Fumigación', category: 'Otros Cargos', unit: 'flat' },
  { code: 'pallet_embalaje', label: 'Pallet Embalaje', category: 'Otros Cargos', unit: 'flat' },
  { code: 'segregacion', label: 'Segregación', category: 'Otros Cargos', unit: 'flat' },
  { code: 'in_and_out', label: 'In and Out', category: 'Otros Cargos', unit: 'flat' },
  { code: 'equipo_especial', label: 'Equipo Especial', category: 'Otros Cargos', unit: 'flat' },
  { code: 'oversize', label: 'Oversize', category: 'Otros Cargos', unit: 'flat' },
  { code: 'embalaje_madera', label: 'Embalaje Madera', category: 'Otros Cargos', unit: 'flat' },
  { code: 'hazmat_imo_charge_line', label: 'Hazmat IMO Charge Line', category: 'Otros Cargos', unit: 'flat' },
  { code: 'declaracion_imo', label: 'Declaración IMO', category: 'Otros Cargos', unit: 'flat' },
  { code: 'certificado_imo', label: 'Certificado IMO', category: 'Otros Cargos', unit: 'flat' },
  { code: 'bonded_fcl_proveedor', label: 'Bonded FCL Proveedor', category: 'Otros Cargos', unit: 'flat' },
  { code: 'bonded_documentacion_7512', label: 'Bonded Documentación 7512', category: 'Otros Cargos', unit: 'flat' },
]

const MIAMI_DESTINATION_RATE_CODES = new Set([
  'lcl_maritimo_sps_ft3',
  'lcl_maritimo_sps_lbs',
  'small_maritimo_min_lcl_1000_lbs_45_ft3',
  'minimo_maritimo_2mil_lbs_90_ft3',
  'consolidado_aereo_kg',
])

type ClientRate = {
  id?: string
  cliente_id: string
  rate_code: string
  rate_label: string
  category: string
  unit: string | null
  currency: string
  amount: number
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
  miami_rate_destination?: string | null
  notes: string | null
}

const getMiamiRateDestinationLabel = (value: string | null | undefined) => {
  if (value === 'TGU') return 'Tegucigalpa'
  return 'San Pedro Sula'
}

export default function ClienteProfilePage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [cliente, setCliente] = useState<any>(null)
  const [quotations, setQuotations] = useState<any[]>([])
  const [clientNotes, setClientNotes] = useState<any[]>([])
  const [clientRates, setClientRates] = useState<Record<string, ClientRate>>({})
  const [savingRates, setSavingRates] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('resumen')

  useEffect(() => {
    if (id) {
      fetchCliente()
      fetchQuotations()
      fetchClientNotes()
    }
  }, [id])

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
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    setCliente(data)
    await loadClientRates(data?.preferred_miami_rate_destination || 'SPS')
    setLoading(false)
  }

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('cliente_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
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
      .eq('cliente_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      return
    }

    setClientNotes(data || [])
  }

  const saveClientNote = async () => {
    if (!newNote.trim()) {
      toast.info('Escribe una nota antes de guardar')
      return
    }

    const { error } = await supabase.from('client_notes').insert([
      {
        cliente_id: id,
        note: newNote.trim(),
        created_by: profile?.id,
      },
    ])

    if (error) {
      toast.error(error.message)
      return
    }

    setNewNote('')
    await fetchClientNotes()
  }

  const loadClientRates = async (activeDestination = 'SPS') => {
    if (!id) return

    const { data, error } = await supabase
      .from('client_rates')
      .select('*')
      .eq('cliente_id', id)
      .eq('is_active', true)
      .or(`miami_rate_destination.is.null,miami_rate_destination.eq.${activeDestination}`)

    if (error) {
      toast.error('No se pudieron cargar las tarifas')
      return
    }

    const mapped = Object.fromEntries(
      (data || []).map((rate) => [rate.rate_code, rate])
    ) as Record<string, ClientRate>

    setClientRates(mapped)
  }

  const updateClientRateAmount = (code: string, amount: string) => {
    const catalogItem = clientRateCatalog.find((item) => item.code === code)
    if (!catalogItem) return

    setClientRates((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] || {}),
        cliente_id: id,
        rate_code: catalogItem.code,
        rate_label: catalogItem.label,
        category: catalogItem.category,
        unit: catalogItem.unit,
        currency: 'USD',
        amount: amount === '' ? 0 : Number(amount),
        is_active: true,
        valid_from: null,
        valid_to: null,
        notes: null,
      },
    }))
  }

  const saveClientRates = async () => {
    if (!id) return

    setSavingRates(true)

    const activeDestination =
      cliente?.preferred_miami_rate_destination === 'TGU' ? 'TGU' : 'SPS'

    const rows = clientRateCatalog.map((item) => {
      const existing = clientRates[item.code]
      const isDestinationRate = MIAMI_DESTINATION_RATE_CODES.has(item.code)

      return {
        cliente_id: id,
        rate_code: item.code,
        rate_label: item.label,
        category: item.category,
        unit: item.unit,
        currency: existing?.currency || 'USD',
        amount: existing?.amount || 0,
        is_active: true,
        valid_from: existing?.valid_from || null,
        valid_to: existing?.valid_to || null,
        miami_rate_destination: isDestinationRate ? activeDestination : null,
        notes: existing?.notes || null,
      }
    })

    const destinationRateCodes = clientRateCatalog
      .filter((item) => MIAMI_DESTINATION_RATE_CODES.has(item.code))
      .map((item) => item.code)
    const globalRateCodes = clientRateCatalog
      .filter((item) => !MIAMI_DESTINATION_RATE_CODES.has(item.code))
      .map((item) => item.code)
    const destinationRows = rows.filter(
      (row) => row.miami_rate_destination === activeDestination
    )
    const globalRows = rows.filter((row) => row.miami_rate_destination === null)

    const { error: deleteDestinationError } = await supabase
      .from('client_rates')
      .delete()
      .eq('cliente_id', id)
      .eq('miami_rate_destination', activeDestination)
      .in('rate_code', destinationRateCodes)

    if (deleteDestinationError) {
      console.error('Error deleting destination client rates:', deleteDestinationError)
      toast.error(
        deleteDestinationError.message || 'No se pudieron guardar las tarifas'
      )
      setSavingRates(false)
      return
    }

    const { error: deleteGlobalError } = await supabase
      .from('client_rates')
      .delete()
      .eq('cliente_id', id)
      .is('miami_rate_destination', null)
      .in('rate_code', globalRateCodes)

    if (deleteGlobalError) {
      console.error('Error deleting global client rates:', deleteGlobalError)
      toast.error(deleteGlobalError.message || 'No se pudieron guardar las tarifas')
      setSavingRates(false)
      return
    }

    const { error: insertDestinationError } = await supabase
      .from('client_rates')
      .insert(destinationRows)

    if (insertDestinationError) {
      console.error('Error inserting destination client rates:', insertDestinationError)
      toast.error(
        insertDestinationError.message || 'No se pudieron guardar las tarifas'
      )
      setSavingRates(false)
      return
    }

    const { error: insertGlobalError } = await supabase
      .from('client_rates')
      .insert(globalRows)

    if (insertGlobalError) {
      console.error('Error inserting global client rates:', insertGlobalError)
      toast.error(insertGlobalError.message || 'No se pudieron guardar las tarifas')
      setSavingRates(false)
      return
    }

    toast.success('Tarifas del cliente guardadas')
    await loadClientRates(activeDestination)
    setSavingRates(false)
  }

  const archiveClient = async () => {
    if (!cliente?.id) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast.error('No se pudo validar el usuario')
      return
    }

    const { error } = await supabase
      .from('clientes')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', cliente.id)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module: 'clientes',
      action: 'soft_delete',
      entityType: 'cliente',
      entityId: cliente.id,
      description: `Cliente enviado a papelera: ${cliente.nombre}`,
    })

    toast.success('Cliente enviado a papelera')

    setTimeout(() => {
      router.push('/clientes')
    }, 1000)
  }

  if (loading) return <PageSkeleton cards={3} rows={4} />

  const insurancePercentage =
    cliente?.asegura_carga && cliente?.seguro_porcentaje !== null && cliente?.seguro_porcentaje !== undefined
      ? `${Number(cliente.seguro_porcentaje).toLocaleString('es-GT', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}%`
      : 'No aplica'

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

  function InfoRow({
    label,
    value,
  }: {
    label: string
    value?: string | null
  }) {
    return (
      <div className="flex items-start justify-between gap-4">
        <p className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-right text-sm font-medium text-slate-800 dark:text-slate-200">
          {value || 'N/A'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/clientes')}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver a clientes
          </button>

          <button
            type="button"
            onClick={() => router.push(`/clientes/${cliente.id}/edit`)}
            className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            Editar Cliente
          </button>

          <button
            type="button"
            onClick={archiveClient}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
            Enviar a papelera
          </button>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            {cliente?.nombre}
          </h1>

          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Perfil comercial del cliente
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            'resumen',
            'cotizaciones',
            'tarifas',
            'notas',
            'historial',
          ].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cotizaciones
            </p>

            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {quotations.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ganadas
            </p>

            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {
                quotations.filter(
                  (q) => q.status === 'Ganada'
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enviadas
            </p>

            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {
                quotations.filter(
                  (q) => q.status === 'Enviada al Cliente'
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Última Cotización
            </p>

            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
              {quotations[0]?.quotation_number || 'N/A'}
            </p>
          </div>
        </div>

        {activeTab === 'resumen' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Código
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  {cliente?.codigo_cliente || 'N/A'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  RTN / NIT
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  {cliente?.rtn || cliente?.nit || 'N/A'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Condición de pago
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  {cliente?.condicion_pago || 'Contado'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Vendedor asignado
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  {cliente?.vendedor
                    ? `${cliente.vendedor.nombre} ${cliente.vendedor.apellido}`
                    : 'Sin asignar'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                  Contacto
                </h3>
                <div className="space-y-3">
                  <InfoRow label="Persona de contacto" value={cliente?.contacto} />
                  <InfoRow label="Teléfono" value={cliente?.telefono} />
                  <InfoRow label="Email" value={cliente?.email_1} />
                  {cliente?.email_2 && (
                    <InfoRow label="Email 2" value={cliente.email_2} />
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                  Ubicación
                </h3>
                <div className="space-y-3">
                  <InfoRow label="País" value={cliente?.pais} />
                  <InfoRow
                    label="Departamento / Estado"
                    value={cliente?.departamento_estado}
                  />
                  <InfoRow label="Ciudad" value={cliente?.ciudad} />
                  <InfoRow label="Dirección" value={cliente?.direccion} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                  Clasificación comercial
                </h3>
                <div className="space-y-3">
                  <InfoRow label="Tipo de cliente" value={cliente?.tipo_cliente} />
                  <InfoRow label="Tipo de empresa" value={cliente?.tipo_persona} />
                  <InfoRow
                    label="Origen frecuente"
                    value={cliente?.origen_frecuente}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                  Logística y seguro
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Asegura carga
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        cliente?.asegura_carga
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {cliente?.asegura_carga ? 'Sí' : 'No'}
                    </span>
                  </div>

                  {cliente?.asegura_carga && (
                    <InfoRow
                      label="Porcentaje de seguro"
                      value={insurancePercentage}
                    />
                  )}

                  <InfoRow
                    label="Destino tarifario Miami"
                    value={getMiamiRateDestinationLabel(
                      cliente?.preferred_miami_rate_destination
                    )}
                  />
                </div>
              </div>
            </div>

            {(cliente?.observaciones || cliente?.notas_tarifas) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                  Observaciones
                </h3>
                <div className="space-y-4">
                  {cliente?.observaciones && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Observaciones generales
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {cliente.observaciones}
                      </p>
                    </div>
                  )}

                  {cliente?.notas_tarifas && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Notas de tarifas
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {cliente.notas_tarifas}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'cotizaciones' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Cotizaciones del Cliente
            </h2>

            {quotations.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                Este cliente todavía no tiene cotizaciones.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-slate-700 dark:text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
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
                      <tr key={quote.id} className="border-b border-slate-100 dark:border-slate-800">
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
                            className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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

        {activeTab === 'tarifas' && (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700/60">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Tarifas del Cliente
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Tarifas personalizadas aplicadas en cotizaciones de este cliente.
              </p>
            </div>

            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-slate-200 dark:lg:divide-slate-700/60">
              <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
                {Array.from(new Set(clientRateCatalog.map((r) => r.category)))
                  .filter((cat) => cat.toLowerCase() !== 'otros cargos')
                  .map((category) => {
                    const rates = clientRateCatalog.filter((r) => r.category === category)
                    return (
                      <div key={category}>
                        <div className="bg-slate-50 px-5 py-1.5 dark:bg-slate-800/40">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {category}
                          </span>
                        </div>
                        {rates.map((rate) => (
                          <div
                            key={rate.code}
                            className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-1.5 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                                {rate.label}
                              </span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                {rate.unit}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="text-xs text-slate-400 dark:text-slate-500">USD</span>
                              <input
                                type="number"
                                step="0.01"
                                value={clientRates[rate.code]?.amount ?? ''}
                                onChange={(e) => updateClientRateAmount(rate.code, e.target.value)}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
                {Array.from(new Set(clientRateCatalog.map((r) => r.category)))
                  .filter((cat) => cat.toLowerCase() === 'otros cargos')
                  .map((category) => {
                    const rates = clientRateCatalog.filter((r) => r.category === category)
                    return (
                      <div key={category}>
                        <div className="bg-slate-50 px-5 py-1.5 dark:bg-slate-800/40">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {category}
                          </span>
                        </div>
                        {rates.map((rate) => (
                          <div
                            key={rate.code}
                            className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-1.5 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                                {rate.label}
                              </span>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                {rate.unit}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="text-xs text-slate-400 dark:text-slate-500">USD</span>
                              <input
                                type="number"
                                step="0.01"
                                value={clientRates[rate.code]?.amount ?? ''}
                                onChange={(e) => updateClientRateAmount(rate.code, e.target.value)}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-right text-sm font-medium text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-700/60">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Los cambios se aplican a cotizaciones nuevas de este cliente.
              </p>
              <button
                type="button"
                onClick={saveClientRates}
                disabled={savingRates}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingRates ? 'Guardando...' : 'Guardar tarifas'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'notas' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Notas Comerciales
            </h2>

            <div className="space-y-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escribe una nota comercial..."
                className="min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-400 dark:focus:ring-slate-400/20"
              />

              <button
                type="button"
                onClick={saveClientNote}
                className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Guardar Nota
              </button>

              {clientNotes.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">
                  No hay notas comerciales registradas.
                </p>
              ) : (
                <div className="space-y-3">
                  {clientNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                        {note.note}
                      </p>

                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Historial del Cliente
            </h2>

            {clientTimeline.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                No hay historial disponible.
              </p>
            ) : (
              <div className="space-y-4">
                {clientTimeline.map((event: any, index: number) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="mt-1 h-3 w-3 rounded-full bg-slate-700 dark:bg-slate-300" />

                      {index !== clientTimeline.length - 1 && (
                        <div className="min-h-[40px] w-px flex-1 bg-slate-300 dark:bg-slate-700" />
                      )}
                    </div>

                    <div className="flex-1 rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {event.type}
                          </p>

                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {event.description}
                          </p>
                        </div>

                        <p className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
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
    </>
  )
}

