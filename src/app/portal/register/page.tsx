'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { PortalConfirmation } from '@/src/components/portal/PortalConfirmation'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { TermsAcknowledgement } from '@/src/components/legal/TermsAcknowledgement'
import { signupLegalAcceptance } from '@/src/lib/legal-documents'
import { useTenant } from '@/src/components/tenant/TenantProvider'
import { TenantBrand } from '@/src/components/tenant/TenantBrand'

export default function PortalRegisterPage() {
  const tenant = useTenant()
  const [sent, setSent] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const submittingRef = useRef(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    if (!termsAccepted) {
      toast.info('Lee y acepta las condiciones antes de solicitar acceso.')
      return
    }

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
    submittingRef.current = true
    try {
      if (!tenant) {
        toast.error('No se pudo validar la empresa de este enlace.')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            requested_role: 'Cliente',
            legal_acceptance: signupLegalAcceptance('portal', termsAccepted),
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            company: company.trim(),
            phone: phone.trim() || null,
            tenant_hostname: tenant.hostname,
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
      setSent(true)
    } catch {
      toast.error('No se pudo completar la solicitud. Revisa tu conexión e intenta nuevamente.')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400'

  if (sent) return <div className="mx-auto w-full max-w-md px-4 py-12"><PortalConfirmation title="Solicitud de acceso enviada" description="El equipo revisará y vinculará tu cuenta. Si recibes un correo de confirmación, sigue sus instrucciones. Podrás ingresar cuando tu acceso esté aprobado." href="/portal/login" action="Volver a iniciar sesión" /></div>
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-[#020817]">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mb-5"><TenantBrand compact /></div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/25">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Solicitar acceso de cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tu cuenta será revisada y vinculada por el equipo de {tenant?.tradeName || 'tu empresa'}.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre</span><input aria-label="Nombre" className={fieldClass} value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre" autoComplete="given-name" required /></label>
              <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Apellido</span><input aria-label="Apellido" className={fieldClass} value={apellido} onChange={(event) => setApellido(event.target.value)} placeholder="Apellido" autoComplete="family-name" required /></label>
            </div>
            <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empresa o nombre comercial</span><input aria-label="Empresa o nombre comercial" className={fieldClass} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Empresa o nombre comercial" autoComplete="organization" required /></label>
            <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono (opcional)</span><input aria-label="Teléfono (opcional)" className={fieldClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono (opcional)" autoComplete="tel" /></label>
            <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</span><input aria-label="Correo electrónico" className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Correo electrónico" autoComplete="email" required /></label>
            <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña (mínimo 8 caracteres)</span><input aria-label="Contraseña (mínimo 8 caracteres)" className={fieldClass} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña (mínimo 8 caracteres)" autoComplete="new-password" required /></label>
            <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Confirmar contraseña</span><input aria-label="Confirmar contraseña" className={fieldClass} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar contraseña" autoComplete="new-password" required /></label>
            <div className="text-slate-700 dark:text-slate-200"><TermsAcknowledgement audience="portal" checked={termsAccepted} onChange={setTermsAccepted} /></div>
            <button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'Enviando solicitud...' : 'Solicitar acceso'}
            </button>
          <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="py-2 text-sm font-semibold text-blue-600 dark:text-blue-400">{showPassword ? "Ocultar contraseñas" : "Mostrar contraseñas"}</button></form>
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
