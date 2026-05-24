'use client'

import type React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'

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
        password,
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
        alert('Tu usuario esta pendiente de aprobacion por un administrador.')
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
              <Image
                src="/logo/sari-logo.png"
                alt="Sari Express"
                width={256}
                height={140}
                priority
                className="mx-auto mb-10 h-auto w-64 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              />

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
                  placeholder="usuario@sariexpress.com"
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

            <p className="mt-6 text-center text-sm text-slate-300">
              Necesitas acceso?{' '}
              <Link
                href="/register"
                className="font-semibold text-yellow-300 hover:underline"
              >
                Solicitar acceso
              </Link>
            </p>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-xs leading-relaxed text-slate-400">
          <p>© 2026 Sari Express ERP</p>
          <p>Freight Management Platform by DHER Solutions</p>
        </div>
      </div>
    </div>
  )
}
