'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

export default function PortalRegisterPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading) return

    if (!nombre.trim() || !apellido.trim() || !company.trim() || !email.trim()) {
      toast.info('Completa nombre, apellido, empresa y correo.')
      return
    }

    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            requested_role: 'Cliente',
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            company: company.trim(),
            phone: phone.trim() || null,
          },
        },
      })

      if (error || !data.user) {
        toast.error(error?.message || 'No se pudo enviar la solicitud.')
        return
      }

      if (data.session) await supabase.auth.signOut()

      toast.success('Solicitud enviada', {
        description: 'Un administrador debe vincular y aprobar tu cuenta.',
      })
      router.replace('/portal/login')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-[#020817]">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/25">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Solicitar acceso de cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tu cuenta será revisada y vinculada por el equipo de Sari Express.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input className={fieldClass} value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre" autoComplete="given-name" required />
              <input className={fieldClass} value={apellido} onChange={(event) => setApellido(event.target.value)} placeholder="Apellido" autoComplete="family-name" required />
            </div>
            <input className={fieldClass} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Empresa o nombre comercial" autoComplete="organization" required />
            <input className={fieldClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono (opcional)" autoComplete="tel" />
            <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo electrónico" autoComplete="email" required />
            <input className={fieldClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña (mínimo 8 caracteres)" autoComplete="new-password" required />
            <input className={fieldClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar contraseña" autoComplete="new-password" required />
            <button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'Enviando solicitud...' : 'Solicitar acceso'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
          ¿Ya tienes cuenta?{' '}
          <Link href="/portal/login" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
