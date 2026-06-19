'use client'

import type React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password) {
      toast.info('Completa todos los campos.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    const normalizedNombre = nombre.trim()
    const normalizedApellido = apellido.trim()
    const normalizedEmail = email.trim().toLowerCase()

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          nombre: normalizedNombre,
          apellido: normalizedApellido,
          email: normalizedEmail,
        },
      },
    })

    if (error || !data.user) {
      setLoading(false)
      toast.error(error?.message || 'No se pudo crear la solicitud.')
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        nombre: normalizedNombre,
        apellido: normalizedApellido,
        email: normalizedEmail,
        rol: 'Ventas',
        status: 'Pendiente',
        is_active: true,
      })

    if (profileError) {
      setLoading(false)
      toast.error('No se pudo crear el perfil', {
        description: profileError.message,
      })
      return
    }

    await supabase.auth.signOut()

    setLoading(false)
    toast.success('Solicitud enviada', {
      description: 'Un administrador debe aprobar tu acceso.',
    })

    setTimeout(() => {
      router.push('/login')
    }, 1200)
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
        <div className="flex min-h-screen items-center justify-center px-6 py-20">
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

              <h1 className="text-2xl font-bold text-white">
                Solicitar acceso
              </h1>
              <p className="mt-2 text-sm tracking-wide text-slate-400">
                ERP Logístico-Comercial Versión 1.0
              </p>
              <p className="mt-3 text-sm text-slate-300">
                Tu cuenta deberá ser aprobada por un administrador.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <input
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Apellido"
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                autoComplete="email"
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete="new-password"
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar contraseña"
                autoComplete="new-password"
                className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-white placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
              />

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-xl bg-yellow-400 font-semibold text-slate-950 shadow-lg shadow-yellow-500/20 transition-all duration-200 hover:scale-[1.01] hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Enviando solicitud...' : 'Enviar solicitud'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-300">
              ¿Ya tienes cuenta?{' '}
              <Link
                href="/login"
                className="font-semibold text-yellow-300 hover:underline"
              >
                Iniciar sesión
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
