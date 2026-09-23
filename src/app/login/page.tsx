'use client'

import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import {
  PLATFORM_ATTRIBUTION,
  PLATFORM_NAME,
} from '@/src/lib/platform-branding'
import { getLoginDestination } from '@/src/lib/auth-redirect'
import { TenantBrand } from '@/src/components/tenant/TenantBrand'
import { useTenant } from '@/src/components/tenant/TenantProvider'
import { profileMatchesAccessContext } from '@/src/lib/tenant-context'

export default function LoginPage() {
  const router = useRouter()
  const tenant = useTenant()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (loading) return

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      const user = data.user

      if (!user) {
        await supabase.auth.signOut()
        toast.error('Perfil de usuario no encontrado.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile) {
        await supabase.auth.signOut()
        toast.error('Perfil de usuario no encontrado.')
        return
      }

      if (!profileMatchesAccessContext(profile, tenant)) {
        await supabase.auth.signOut()
        toast.error(
          tenant
            ? 'Esta cuenta pertenece a otra empresa. Revisa el enlace de acceso.'
            : 'Este acceso es exclusivo para soporte autorizado de la plataforma.',
        )
        return
      }

      if (profile.status !== 'Aprobado') {
        await supabase.auth.signOut()
        toast.info('Tu usuario esta pendiente de aprobacion por un administrador.')
        return
      }

      if (!profile.is_active) {
        await supabase.auth.signOut()
        toast.error('Tu acceso al sistema ha sido desactivado.')
        return
      }

      const requestedPath = new URLSearchParams(window.location.search).get('next')
      const safePath = profile.is_platform_admin
        ? '/support'
        : getLoginDestination(profile.rol, requestedPath)
      router.push(safePath)
      router.refresh()
    } catch {
      toast.error('No se pudo conectar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/login-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.15),transparent_35%)]" />

      <div className="relative min-h-screen bg-gradient-to-r from-[#020617]/95 via-[#020617]/80 to-[#020617]/20">
        <div className="flex min-h-screen items-center px-10 py-20">
          <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-slate-950/45 p-10 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="mb-10 text-center">
              <div className="mb-10">
                {tenant ? (
                  <TenantBrand inverse />
                ) : (
                  <div>
                    <p className="text-2xl font-bold text-white">{PLATFORM_NAME}</p>
                    <p className="mt-2 text-sm text-slate-300">Acceso de soporte autorizado</p>
                  </div>
                )}
              </div>

              <p className="text-sm tracking-wide text-slate-400">
                ERP Logístico-Comercial Versión 1.0
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-white">
                  Correo electronico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
                  placeholder="usuario@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-white">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
                  placeholder="********"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-xl bg-yellow-400 font-semibold text-slate-950 shadow-lg shadow-yellow-500/20 transition-all duration-200 hover:scale-[1.01] hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>

            {tenant && (
              <p className="mt-6 text-center text-sm text-slate-300">
                Necesitas acceso?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-yellow-300 hover:underline"
                >
                  Solicitar acceso
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-xs leading-relaxed text-slate-400">
          <p>{PLATFORM_NAME}</p>
          <p>{PLATFORM_ATTRIBUTION}</p>
        </div>
      </div>
    </div>
  )
}
