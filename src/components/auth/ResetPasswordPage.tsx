'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { TenantBrand } from '@/src/components/tenant/TenantBrand'
import { useTenant } from '@/src/components/tenant/TenantProvider'
import { profileMatchesTenant } from '@/src/lib/tenant-context'
import { passwordValidationError, recoveryTokens } from '@/src/lib/password-recovery'

export default function ResetPasswordPage({ portal = false }: { portal?: boolean }) {
  const router = useRouter()
  const tenant = useTenant()
  const recoveryClient = useRef<SupabaseClient | null>(null)
  const receivedTokens = useRef<ReturnType<typeof recoveryTokens>>(null)
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkError, setCheckError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loginPath, setLoginPath] = useState(portal ? '/portal/login' : '/login')

  useEffect(() => {
    const receiveLink = () => {
      recoveryClient.current = null
      receivedTokens.current = null
      setHasSession(false)
      setChecking(true)
      setCheckError(false)
      setRevision(value => value + 1)
    }
    window.addEventListener('hashchange', receiveLink)
    return () => window.removeEventListener('hashchange', receiveLink)
  }, [])

  useEffect(() => {
    let active = true
    const validate = async () => {
      receivedTokens.current ||= recoveryTokens(window.location.hash)
      const tokens = receivedTokens.current
      const hasError = /(?:^#|&)(?:error|error_code)=/.test(window.location.hash)
      const params = new URLSearchParams(window.location.search)
      const pkceRecovery = params.get('recovery') === '1' && Boolean(params.get('account'))
      if (hasError || (!tokens && !pkceRecovery)) {
        if (active) { setHasSession(false); setChecking(false) }
        return
      }
      if (!recoveryClient.current) {
        recoveryClient.current = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      }
      const client = recoveryClient.current
      if (tokens) {
        window.history.replaceState(window.history.state, '', window.location.pathname)
        const { error } = await client.auth.setSession(tokens)
        if (error) { if (active) { setHasSession(false); setChecking(false) }; return }
      } else {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!session || session.user.id !== params.get('account')) {
          if (active) { setHasSession(false); setChecking(false) }
          return
        }
        const { error: sessionError } = await client.auth.setSession(session)
        if (sessionError) throw sessionError
      }
      const { data, error } = await client.auth.getUser()
      if (!active) return
      if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401) throw error
      if (data.user) {
        const { data: profile, error: profileError } = await client.from('profiles')
          .select('tenant_id, rol').eq('id', data.user.id).maybeSingle()
        if (!active) return
        if (profileError) throw profileError
        if (!profileMatchesTenant(profile?.tenant_id, tenant)) {
          await client.auth.signOut({ scope: 'local' })
          if (active) { setHasSession(false); setChecking(false) }
          return
        }
        setLoginPath(profile?.rol === 'Cliente' ? '/portal/login' : '/login')
      }
      setCheckError(false)
      setHasSession(Boolean(data.user))
      setChecking(false)
    }
    void validate().catch(() => { if (active) { setCheckError(true); setChecking(false) } })
    return () => { active = false }
  }, [revision, tenant])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || !hasSession || checking) return
    const validationError = passwordValidationError(password, confirmPassword)
    if (validationError) { toast.error(validationError); return }

    setSaving(true)
    try {
      const client = recoveryClient.current
      if (!client) return
      const { data: { user }, error: authError } = await client.auth.getUser()
      if (authError || !user) { setHasSession(false); toast.error('El enlace expiró. Solicita uno nuevo.'); return }
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('tenant_id, rol').eq('id', user.id).maybeSingle()
      if (profileError || !profileMatchesTenant(profile?.tenant_id, tenant)) {
        setHasSession(false); toast.error('No se pudo validar la cuenta de esta empresa.'); return
      }
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        toast.error('No se pudo actualizar la contraseña', {
          description: error.message,
        })
        return
      }

      await client.auth.signOut()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user.id === user.id) await supabase.auth.signOut({ scope: 'local' })
      toast.success('Contraseña actualizada')
      setHasSession(false)
      setPassword('')
      setConfirmPassword('')
      router.replace(profile?.rol === 'Cliente' ? '/portal/login' : '/login')
      router.refresh()
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
          <div className="mb-5"><TenantBrand compact /></div>
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
              <Link href={loginPath === '/portal/login' ? '/portal/forgot-password' : '/forgot-password'} className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
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
