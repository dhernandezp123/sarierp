'use client'

import type React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

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
        password
      })

      if (error) {
        alert(error.message)
        return
      }

      const user = data.user

      if (!user) {
        await supabase.auth.signOut()
        alert('Perfil de usuario no encontrado.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile) {
        await supabase.auth.signOut()
        alert('Perfil de usuario no encontrado.')
        return
      }

      if (profile.status !== 'Aprobado') {
        await supabase.auth.signOut()
        alert('Tu usuario está pendiente de aprobación por un administrador.')
        return
      }

      if (!profile.is_active) {
        await supabase.auth.signOut()
        alert('Tu acceso al sistema ha sido desactivado.')
        return
      }

      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#7f1d1d_0,#57534e_42%,#FFFFFF_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl border border-white/10">
        <div className="mb-8 text-center">
          <Image
            src="/logo/sari-logo.png"
            alt="Sari Express"
            width={220}
            height={120}
            priority
            className="mx-auto h-auto w-56 object-contain"
          />

          <p className="mt-2 text-sm text-slate-500">
            ERP logístico comercial y financiero
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="usuario@sariexpress.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Necesitas acceso?{' '}
          <Link href="/register" className="font-semibold text-slate-900 hover:underline">
            Solicitar acceso
          </Link>
        </p>
      </div>
    </div>
  )
}
