'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { PortalError } from '@/src/components/portal/PortalFeedback'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkError, setCheckError] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401) throw error
      setCheckError(false)
      setHasSession(Boolean(data.user))
      setChecking(false)
    }).catch(() => { if (active) { setCheckError(true); setChecking(false) } })
    return () => { active = false }
  }, [revision])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        toast.error('No se pudo actualizar la contraseña', {
          description: error.message,
        })
        return
      }

      await supabase.auth.signOut()
      toast.success('Contraseña actualizada')
      router.replace('/portal/login')
    } catch {
      toast.error('No se pudo conectar. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  if (checkError) return <div className="mx-auto max-w-md px-4 py-12"><PortalError message="No pudimos validar el enlace. Revisa tu conexión e intenta nuevamente." onRetry={() => setRevision(value => value + 1)} /></div>
  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-[#020817]">Validando enlace...</div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#020817]">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/25">
            <LockKeyhole className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Crear nueva contraseña
          </h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!hasSession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                El enlace no es válido o ya expiró.
              </p>
              <Link href="/portal/forgot-password" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Solicitar un enlace nuevo
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña (mínimo 8 caracteres)</span><input aria-label="Contraseña (mínimo 8 caracteres)" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nueva contraseña" autoComplete="new-password" required autoFocus className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Confirmar contraseña</span><input aria-label="Confirmar contraseña" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar contraseña" autoComplete="new-password" required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <button type="submit" disabled={saving} className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
            <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="py-2 text-sm font-semibold text-blue-600 dark:text-blue-400">{showPassword ? "Ocultar contraseñas" : "Mostrar contraseñas"}</button></form>
          )}
        </div>
      </div>
    </div>
  )
}
