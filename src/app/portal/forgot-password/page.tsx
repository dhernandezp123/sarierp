'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const invalidLink = searchParams.get('error') === 'invalid_link'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !email.trim()) return

    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/portal/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      )

      if (error) {
        toast.error('No se pudo enviar el correo', { description: error.message })
        return
      }

      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#020817]">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/25">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Recuperar contraseña
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Te enviaremos un enlace seguro para crear una nueva contraseña.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {invalidLink && (
            <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              El enlace expiró o ya fue utilizado. Solicita uno nuevo.
            </p>
          )}

          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Si el correo está registrado, recibirás un enlace de recuperación.
                Revisa también spam o promociones.
              </p>
              <button type="button" onClick={() => setSent(false)} className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Enviar nuevamente
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Correo electrónico"
                autoComplete="email"
                required
                autoFocus
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link href="/portal/login" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-[#020817]">
          Cargando recuperación...
        </div>
      )}
    >
      <ForgotPasswordForm />
    </Suspense>
  )
}
