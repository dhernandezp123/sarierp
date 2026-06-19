'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine, X, Search, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'

const CARRIERS = ['UPS', 'FedEx', 'DHL', 'USPS', 'Amazon Logistics', 'OnTrac', 'LaserShip', 'Otro']

type ClienteOption = { id: string; nombre: string; codigo_cliente: string | null }

export default function MiamiIngresoPage() {
  const router = useRouter()
  const { user } = useUser()
  const trackingRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [assignClient, setAssignClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClienteOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClienteOption | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const [form, setForm] = useState({
    tracking_number: '',
    carrier: '',
    weight_lbs: '',
    length_in: '',
    width_in: '',
    height_in: '',
    description: '',
    notes: '',
  })

  // Auto-focus tracking on mount for scanner
  useEffect(() => { trackingRef.current?.focus() }, [])

  const ft3 = (() => {
    const l = parseFloat(form.length_in), w = parseFloat(form.width_in), h = parseFloat(form.height_in)
    return (l && w && h) ? ((l * w * h) / 1728).toFixed(4) : null
  })()

  const cbm = (() => {
    const l = parseFloat(form.length_in), w = parseFloat(form.width_in), h = parseFloat(form.height_in)
    return (l && w && h) ? ((l * w * h) * 0.000016387064).toFixed(6) : null
  })()

  // Client search
  useEffect(() => {
    if (!assignClient || clientSearch.trim().length < 2) { setClientResults([]); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, codigo_cliente')
        .ilike('nombre', `%${clientSearch}%`)
        .is('deleted_at', null)
        .limit(8)
      setClientResults((data ?? []) as ClienteOption[])
      setSearchOpen(true)
    }, 250)
    return () => clearTimeout(timeout)
  }, [clientSearch, assignClient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.tracking_number.trim()) { toast.error('El tracking es requerido'); return }

    setSaving(true)
    try {
      const weight_lbs = parseFloat(form.weight_lbs) || null
      const length_in  = parseFloat(form.length_in)  || null
      const width_in   = parseFloat(form.width_in)   || null
      const height_in  = parseFloat(form.height_in)  || null

      const { data: pkg, error } = await supabase
        .from('miami_packages')
        .insert({
          tracking_number: form.tracking_number.trim().toUpperCase(),
          carrier:         form.carrier || null,
          weight_lbs,
          weight_kg:       weight_lbs ? parseFloat((weight_lbs * 0.453592).toFixed(2)) : null,
          length_in,
          width_in,
          height_in,
          description:     form.description || null,
          notes:           form.notes || null,
          received_by:     user?.id ?? null,
          status:          'Sin asignar',
          cliente_id:      assignClient && selectedClient ? selectedClient.id : null,
        })
        .select('id')
        .single()

      if (error) throw error

      // If assigning to client immediately, generate WH number
      if (assignClient && selectedClient && pkg) {
        const { data: whData } = await supabase.rpc('next_warehouse_number')
        await supabase.from('miami_packages').update({
          warehouse_number: whData,
          status: 'Asignado',
          assigned_at: new Date().toISOString(),
          assigned_by: user?.id ?? null,
        }).eq('id', pkg.id)
      }

      toast.success('Paquete ingresado correctamente')

      // Reset form, keep carrier
      setForm(prev => ({ ...prev, tracking_number: '', weight_lbs: '', length_in: '', width_in: '', height_in: '', description: '', notes: '' }))
      setSelectedClient(null)
      setClientSearch('')
      setAssignClient(false)
      trackingRef.current?.focus()

    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar el paquete')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Miami Bodega', href: '/miami' }, { label: 'Ingreso Individual' }]} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Ingreso Individual</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Escanea o escribe el tracking. El campo se enfoca automáticamente.
          </p>
        </div>
        <button type="button" onClick={() => router.push('/miami/manifiestos/nuevo')} className={secondaryButtonClass}>
          Ingreso por lote
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Tracking e identificación</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Tracking — big field for scanner */}
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Número de tracking <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={trackingRef}
                  value={form.tracking_number}
                  onChange={set('tracking_number')}
                  placeholder="Escanea o escribe el tracking..."
                  className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-base font-mono font-semibold uppercase text-slate-900 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Carrier</label>
              <select value={form.carrier} onChange={set('carrier')} className={fieldClass}>
                <option value="">Seleccionar carrier...</option>
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Peso (lbs)</label>
              <input type="number" step="0.01" min="0" value={form.weight_lbs} onChange={set('weight_lbs')} placeholder="0.00" className={fieldClass} />
            </div>
          </div>
        </div>

        {/* Dimensiones */}
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Dimensiones (pulgadas)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['length_in', 'width_in', 'height_in'] as const).map((key, i) => (
              <div key={key}>
                <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  {['Largo', 'Ancho', 'Alto'][i]}
                </label>
                <input type="number" step="0.01" min="0" value={form[key]} onChange={set(key)} placeholder="0.00" className={fieldClass} />
              </div>
            ))}
          </div>

          {ft3 && (
            <div className="mt-4 flex gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/60">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">FT³</p>
                <p className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-white">{ft3}</p>
              </div>
              <div className="border-l border-slate-200 pl-4 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">CBM</p>
                <p className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-white">{cbm}</p>
              </div>
            </div>
          )}
        </div>

        {/* Descripción */}
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Descripción y notas</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Contenido / descripción</label>
              <input value={form.description} onChange={set('description')} placeholder="Descripción del contenido..." className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Notas internas</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Observaciones del operativo..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>
          </div>
        </div>

        {/* Asignar a cliente */}
        <div className={cardClass}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setAssignClient(!assignClient); setSelectedClient(null); setClientSearch('') }}
              className={`h-5 w-5 rounded border-2 transition ${assignClient ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'}`}
            >
              {assignClient && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
            </button>
            <span className="font-medium text-slate-900 dark:text-white">Asignar a cliente ahora</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">(opcional — también se puede hacer después)</span>
          </div>

          {assignClient && (
            <div className="relative mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Buscar cliente</label>
              {selectedClient ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-800 dark:text-emerald-200">{selectedClient.nombre}</p>
                    {selectedClient.codigo_cliente && <p className="text-xs text-emerald-600 dark:text-emerald-400">{selectedClient.codigo_cliente}</p>}
                  </div>
                  <button type="button" onClick={() => { setSelectedClient(null); setClientSearch('') }}>
                    <X className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Escribe el nombre del cliente..."
                    className={`${fieldClass} pl-9`}
                  />
                  {searchOpen && clientResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {clientResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClient(c); setClientSearch(c.nombre); setSearchOpen(false) }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.nombre}</p>
                            {c.codigo_cliente && <p className="text-xs text-slate-500">{c.codigo_cliente}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/miami')} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button type="submit" disabled={saving || !form.tracking_number.trim()} className={primaryButtonClass}>
            {saving ? 'Guardando...' : 'Guardar paquete'}
          </button>
        </div>
      </form>
    </div>
  )
}
