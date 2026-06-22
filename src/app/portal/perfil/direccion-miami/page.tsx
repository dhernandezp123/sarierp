'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Copy, CheckCircle2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type Address = {
  id?: string
  nombre_completo: string
  company_name: string
  address_line: string
  suite: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
}

const EMPTY: Address = {
  nombre_completo: '',
  company_name: '',
  address_line: '',
  suite: '',
  city: 'Miami',
  state: 'FL',
  zip: '',
  country: 'USA',
  phone: '',
}

export default function DireccionMiamiPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [address, setAddress] = useState<Address>(EMPTY)
  const [hasAddress, setHasAddress] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadAddress = async (clientId: string) => {
    const { data } = await supabase
      .from('client_addresses')
      .select('*')
      .eq('cliente_id', clientId)
      .eq('is_active', true)
      .maybeSingle()

    if (data) {
      setAddress({
        id: data.id,
        nombre_completo: data.nombre_completo ?? '',
        company_name:    data.company_name ?? '',
        address_line:    data.address_line ?? '',
        suite:           data.suite ?? '',
        city:            data.city ?? 'Miami',
        state:           data.state ?? 'FL',
        zip:             data.zip ?? '',
        country:         data.country ?? 'USA',
        phone:           data.phone ?? '',
      })
      setHasAddress(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadAddress(clientId), 0)
    return () => window.clearTimeout(timeout)
  }, [profile?.cliente_id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.cliente_id) { toast.error('No se encontró el cliente asociado'); return }
    if (!address.nombre_completo.trim()) { toast.error('El nombre es requerido'); return }
    if (!address.address_line.trim())   { toast.error('La dirección es requerida'); return }
    if (!address.zip.trim())            { toast.error('El ZIP es requerido'); return }

    setSaving(true)
    try {
      const payload = {
        cliente_id:      profile.cliente_id,
        nombre_completo: address.nombre_completo.trim(),
        company_name:    address.company_name.trim() || null,
        address_line:    address.address_line.trim(),
        suite:           address.suite.trim() || null,
        city:            address.city.trim() || 'Miami',
        state:           address.state.trim() || 'FL',
        zip:             address.zip.trim(),
        country:         address.country.trim() || 'USA',
        phone:           address.phone.trim() || null,
        is_active:       true,
      }

      if (hasAddress && address.id) {
        const { error } = await supabase.from('client_addresses').update(payload).eq('id', address.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('client_addresses').insert(payload).select('id').single()
        if (error) throw error
        setAddress(prev => ({ ...prev, id: data.id }))
        setHasAddress(true)
      }

      toast.success('Dirección guardada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const copyAddress = () => {
    const lines = [
      address.nombre_completo,
      address.company_name || null,
      address.suite ? `${address.address_line} Suite ${address.suite}` : address.address_line,
      `${address.city}, ${address.state} ${address.zip}`,
      address.country,
      address.phone ? `Tel: ${address.phone}` : null,
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(lines)
    setCopied(true)
    toast.success('Dirección copiada al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const set = (key: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress(prev => ({ ...prev, [key]: e.target.value }))

  const fieldClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  if (loading) return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dirección en Miami</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Usa esta dirección para tus compras en EE.UU.</p>
        </div>
      </div>

      {/* Address preview card */}
      {hasAddress && address.address_line && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Tu dirección de consignación</p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
            >
              {copied
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copiada</>
                : <><Copy className="h-3.5 w-3.5" /> Copiar</>
              }
            </button>
          </div>
          <div className="select-all rounded-xl bg-white/60 px-4 py-3 font-mono text-sm leading-relaxed text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="font-semibold">{address.nombre_completo}</p>
            {address.company_name && <p>{address.company_name}</p>}
            <p>{address.suite ? `${address.address_line} Suite ${address.suite}` : address.address_line}</p>
            <p>{address.city}, {address.state} {address.zip}</p>
            <p>{address.country}</p>
            {address.phone && <p>Tel: {address.phone}</p>}
          </div>
          <p className="mt-2 text-xs text-blue-500 dark:text-blue-400">
            Toca el recuadro blanco para seleccionar todo el texto, o usa el botón Copiar.
          </p>
        </div>
      )}

      {/* Edit form */}
      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">
          {hasAddress ? 'Editar dirección' : 'Agregar dirección'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Nombre completo <span className="text-red-500">*</span>
            </label>
            <input
              value={address.nombre_completo}
              onChange={set('nombre_completo')}
              placeholder="Nombre que aparecerá en el paquete"
              required
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Empresa (opcional)
            </label>
            <input
              value={address.company_name}
              onChange={set('company_name')}
              placeholder="Nombre de empresa si aplica"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              value={address.address_line}
              onChange={set('address_line')}
              placeholder="8350 NW 52nd Terrace"
              required
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Suite / Apto / Referencia
            </label>
            <input
              value={address.suite}
              onChange={set('suite')}
              placeholder="Suite 101"
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ciudad</label>
              <input value={address.city} onChange={set('city')} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Estado</label>
              <input value={address.state} onChange={set('state')} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                ZIP <span className="text-red-500">*</span>
              </label>
              <input value={address.zip} onChange={set('zip')} placeholder="33166" required className={fieldClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Teléfono</label>
            <input
              value={address.phone}
              onChange={set('phone')}
              placeholder="+1 (305) 000-0000"
              type="tel"
              className={fieldClass}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Guardando...' : hasAddress ? 'Actualizar dirección' : 'Guardar dirección'}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Comunica esta dirección a tus proveedores para recibir tus paquetes en Miami.
      </p>
    </div>
  )
}
