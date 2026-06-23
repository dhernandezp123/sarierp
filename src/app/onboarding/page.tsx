'use client'

import type React from 'react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function OnboardingPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Supabase JS picks up the invite token from the URL fragment automatically.
    // We subscribe to the onAuthStateChange event to catch the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          // Check if profile already completed
          const { data: profile } = await supabase
            .from('profiles')
            .select('nombre, apellido, status, rol')
            .eq('id', session.user.id)
            .single()

          if (profile?.nombre && profile?.apellido && profile?.status === 'Aprobado') {
            router.push(profile.rol === 'Cliente' ? '/portal' : '/dashboard')
            return
          }

          setAuthUser(session.user)
          setChecking(false)
          return
        }
      }
      if (event === 'INITIAL_SESSION') {
        if (!session?.user) {
          // No active session — redirect to login
          setChecking(false)
          router.push('/login')
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nombre.trim() || !apellido.trim()) {
      toast.error('Nombre y apellido son requeridos')
      return
    }

    if (!authUser) return

    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: authUser.email,
      })
      .eq('id', authUser.id)

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('rol, status')
      .eq('id', authUser.id)
      .single()

    if (profile?.status === 'Aprobado') {
      toast.success('¡Perfil configurado! Bienvenido.')
      router.push(profile.rol === 'Cliente' ? '/portal' : '/dashboard')
      return
    }

    await supabase.auth.signOut()
    toast.success('Perfil completado', {
      description: 'Tu cuenta de cliente aún debe ser vinculada y aprobada.',
    })
    router.push('/portal/login')
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Configurando tu acceso...</p>
        </div>
      </div>
    )
  }

  if (!authUser) return null

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.15),transparent_35%)]" />

      <div className="relative min-h-screen bg-gradient-to-r from-[#020617]/95 via-[#020617]/80 to-[#020617]/20">
        <div className="flex min-h-screen items-center justify-center px-6 py-20">
          <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-slate-950/45 p-10 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="mb-8 text-center">
              <Image
                src="/logo/sari-logo.png"
                alt="Sari Express"
                width={256}
                height={140}
                priority
                className="mx-auto mb-8 h-auto w-56 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              />
              <h1 className="text-2xl font-bold text-white">Completa tu perfil</h1>
              <p className="mt-2 text-sm text-slate-400">
                Fuiste invitado como <span className="font-semibold text-yellow-300">{authUser.user_metadata?.rol || 'Usuario'}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">{authUser.email}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                autoComplete="given-name"
                required
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <input
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Apellido"
                autoComplete="family-name"
                required
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <button
                type="submit"
                disabled={saving}
                className="h-14 w-full rounded-xl bg-yellow-400 font-semibold text-slate-950 shadow-lg shadow-yellow-500/20 transition-all duration-200 hover:scale-[1.01] hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Ingresar al ERP'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              © 2026 Sari Express ERP — Freight Management Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
