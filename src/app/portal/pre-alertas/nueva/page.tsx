'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

const CARRIERS = ['UPS', 'FedEx', 'DHL', 'USPS', 'Amazon Logistics', 'OnTrac', 'LaserShip', 'Otro']

export default function NuevaPreAlertaPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tracking_number: '',
    carrier: '',
    description: '',
    expected_date: '',
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.tracking_number.trim()) { toast.error('El tracking es requerido'); return }
    if (!profile?.cliente_id) { toast.error('Error de sesión'); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('miami_pre_alerts').insert({
        cliente_id:      profile.cliente_id,
        tracking_number: form.tracking_number.trim().toUpperCase(),
        carrier:         form.carrier || null,
        description:     form.description.trim() || null,
        expected_date:   form.expected_date || null,
        status:          'Pendiente',
      })

      if (error) throw error

      toast.success('Pre-alerta registrada correctamente')
      router.replace('/portal/pre-alertas')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Nueva Pre-alerta</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Notifica que un paquete viene en camino a Miami</p>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 dark:border-blue-900/30 dark:bg-blue-950/20">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>¿Para qué sirve?</strong> Al registrar el tracking de tu compra, el equipo de bodega puede identificar tu paquete cuando llegue y asignarlo a tu cuenta automáticamente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-4">
          {/* Tracking */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Número de tracking <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.tracking_number}
                onChange={set('tracking_number')}
                placeholder="Copia el tracking de tu compra..."
                required
                autoFocus
                className={`${fieldClass} pl-9 font-mono uppercase`}
                autoComplete="off"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Encuéntralo en el correo de confirmación de tu compra o en la tienda.</p>
          </div>

          {/* Carrier */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Courier / Transportista
            </label>
            <select value={form.carrier} onChange={set('carrier')} className={fieldClass}>
              <option value="">Seleccionar (opcional)...</option>
              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              ¿Qué es? (descripción del contenido)
            </label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Ej: Zapatos Nike talla 10, color negro..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
            />
          </div>

          {/* Expected date */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Fecha estimada de llegada
            </label>
            <input
              type="date"
              value={form.expected_date}
              onChange={set('expected_date')}
              min={new Date().toISOString().split('T')[0]}
              className={fieldClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.tracking_number.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Registrar pre-alerta'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
