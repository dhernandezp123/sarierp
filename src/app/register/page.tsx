'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
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
      alert('Completa todos los campos.')
      return
    }

    if (password !== confirmPassword) {
      alert('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error || !data.user) {
      setLoading(false)
      alert(error?.message || 'No se pudo crear la solicitud.')
      return
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle()

    if (existingProfile) {
      await supabase.auth.signOut()
      setLoading(false)
      alert('Solicitud enviada. Un administrador debe aprobar tu acceso.')
      router.push('/login')
      return
    }

    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: data.user.id,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim().toLowerCase(),
        rol: 'Ventas',
        status: 'Pendiente',
      },
    ])

    if (profileError) {
      console.error('PROFILE INSERT ERROR:', profileError)
      setLoading(false)
      alert(`No se pudo crear el perfil: ${profileError.message}`)
      return
    }

    await supabase.auth.signOut()

    setLoading(false)
    alert('Solicitud enviada. Un administrador debe aprobar tu acceso.')
    router.push('/login')
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

          <h1 className="text-2xl font-bold text-slate-900">
            Solicitar acceso
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Tu cuenta deberá ser aprobada por un administrador.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />

          <input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            placeholder="Apellido"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Enviando solicitud...' : 'Enviar solicitud'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-semibold text-slate-900 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
