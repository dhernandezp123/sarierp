'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { toast.error('Correo o contraseña incorrectos'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol, status, is_active')
        .eq('id', data.user.id)
        .single()

      if (!profile || profile.status !== 'Aprobado' || !profile.is_active) {
        await supabase.auth.signOut()
        toast.error('Tu cuenta no está activa. Contacta a soporte.')
        return
      }

      // Staff goes to ERP, clients to portal
      router.replace(profile.rol === 'Cliente' ? '/portal' : '/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#020817]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/25">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mi Paquetería</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Rastrea y gestiona tus envíos desde Miami
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                autoFocus
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          ¿Problemas para ingresar? Contacta a tu agente de carga.
        </p>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          ¿Aún no tienes acceso?{' '}
          <Link
            href="/portal/register"
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Solicitar cuenta
          </Link>
        </p>
      </div>
    </div>
  )
}
