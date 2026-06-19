'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Truck, Plus, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type PickupRequest = {
  id: string
  pickup_address: string
  contact_name: string | null
  contact_phone: string | null
  scheduled_date: string | null
  description: string | null
  status: string
  created_at: string
}

const statusColors: Record<string, string> = {
  'Pendiente':   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Confirmado':  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Completado':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Cancelado':   'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export default function PickupPage() {
  const { user, profile } = useUser()
  const router = useRouter()
  const [requests, setRequests] = useState<PickupRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    pickup_address: '',
    contact_name: '',
    contact_phone: '',
    scheduled_date: '',
    description: '',
  })

  useEffect(() => {
    if (!user) return
    loadRequests()
  }, [user])

  const loadRequests = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('client_pickup_requests')
      .select('id, pickup_address, contact_name, contact_phone, scheduled_date, description, status, created_at')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as PickupRequest[])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.pickup_address.trim()) { toast.error('La dirección de recogida es requerida'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('client_pickup_requests').insert({
        profile_id:      user.id,
        cliente_id:      profile?.cliente_id ?? null,
        pickup_address:  form.pickup_address.trim(),
        contact_name:    form.contact_name.trim() || null,
        contact_phone:   form.contact_phone.trim() || null,
        scheduled_date:  form.scheduled_date || null,
        description:     form.description.trim() || null,
        status:          'Pendiente',
      })
      if (error) throw error
      toast.success('Solicitud de recogida enviada. Te confirmaremos pronto.')
      setShowForm(false)
      setForm({ pickup_address: '', contact_name: '', contact_phone: '', scheduled_date: '', description: '' })
      await loadRequests()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al enviar solicitud')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Solicitud de Recogida</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Coordina la recolección de tus paquetes</p>
          </div>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </button>
        )}
      </div>

      {/* New request form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-blue-200 bg-white p-5 dark:border-blue-900/40 dark:bg-slate-900">
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Nueva solicitud de recogida</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Dirección de recogida <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.pickup_address}
                onChange={set('pickup_address')}
                rows={2}
                placeholder="Dirección completa donde recogeremos los paquetes..."
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Nombre de contacto</label>
                <input value={form.contact_name} onChange={set('contact_name')} placeholder="Quien entrega" className={fieldClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Teléfono de contacto</label>
                <input type="tel" value={form.contact_phone} onChange={set('contact_phone')} placeholder="+504 0000-0000" className={fieldClass} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Fecha preferida</label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={set('scheduled_date')}
                min={new Date().toISOString().split('T')[0]}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Descripción de la carga</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={2}
                placeholder="Ej: 3 cajas, aproximadamente 20 lbs, contiene ropa..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* History */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Mis solicitudes</h2>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Truck className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Aún no tienes solicitudes de recogida</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {requests.map(r => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.pickup_address}</p>
                    {r.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{r.description}</p>}
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      {r.scheduled_date
                        ? new Date(r.scheduled_date).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : `Creada ${new Date(r.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`
                      }
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[r.status] ?? statusColors['Pendiente']}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
