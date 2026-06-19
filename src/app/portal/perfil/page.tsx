'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, KeyRound, User, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

export default function PortalPerfilPage() {
  const { user, profile } = useUser()
  const [changingPwd, setChangingPwd] = useState(false)
  const [pwd, setPwd] = useState({ new: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.new !== pwd.confirm) { toast.error('Las contraseñas no coinciden'); return }
    if (pwd.new.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd.new })
      if (error) throw error
      toast.success('Contraseña actualizada correctamente')
      setChangingPwd(false)
      setPwd({ new: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cambiar contraseña')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mi Perfil</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Administra tu cuenta y configuraciones</p>
      </div>

      {/* Account info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Información de cuenta</h2>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{profile?.nombre ?? '—'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Correo electrónico</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{user?.email ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Miami address link */}
      <Link
        href="/portal/perfil/direccion-miami"
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50">
          <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">Dirección en Miami</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Gestiona tu dirección de consignación para compras en EE.UU.</p>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </Link>

      {/* Change password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <KeyRound className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Contraseña</h2>
          </div>
          {!changingPwd && (
            <button
              type="button"
              onClick={() => setChangingPwd(true)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cambiar
            </button>
          )}
        </div>

        {changingPwd ? (
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nueva contraseña</label>
              <input
                type="password"
                value={pwd.new}
                onChange={e => setPwd(prev => ({ ...prev, new: e.target.value }))}
                placeholder="••••••••"
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={pwd.confirm}
                onChange={e => setPwd(prev => ({ ...prev, confirm: e.target.value }))}
                placeholder="••••••••"
                required
                className={fieldClass}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setChangingPwd(false); setPwd({ new: '', confirm: '' }) }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">••••••••••••</p>
        )}
      </div>
    </div>
  )
}
