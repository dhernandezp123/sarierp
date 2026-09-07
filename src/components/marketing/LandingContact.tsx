'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { PLATFORM_CONTACT_EMAIL } from '@/src/lib/platform-branding'

export function LandingContact() {
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    const lead = { nombre: form.nombre.trim(), empresa: form.empresa.trim(), email: form.email.trim(), telefono: form.telefono.trim() }
    setFormError('')
    if (!lead.nombre || !lead.empresa) {
      setFormError('Ingresa tu nombre y el nombre de tu empresa.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      setEmailError('Ingresa un correo válido.')
      return
    }
    setEmailError('')
    submittingRef.current = true
    setSubmitting(true)
    try {
      const { error } = await supabase.from('leads').insert([lead])
      if (error) throw error
      setSubmitted(true)
      toast.success('¡Mensaje recibido! Te contactaremos pronto.')
    } catch {
      const message = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo, o escríbenos por correo.'
      setFormError(message)
      toast.error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="min-w-0">
            {submitted ? (
              <div role="status" className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] p-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EF8E01]/20 text-[#EF8E01]">
                  <Check size={28} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">¡Mensaje recibido!</h3>
                <p className="mt-2 text-sm text-slate-300">Te contactaremos a la brevedad.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} aria-label="Solicitar una demo" aria-busy={submitting} className="flex min-w-0 flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="demo-nombre" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-200">
                    Tu nombre
                  <input
                    id="demo-nombre"
                    name="nombre"
                    autoComplete="name"
                    maxLength={120}
                    type="text"
                    placeholder="Tu nombre"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                  />
                  </label>
                  <label htmlFor="demo-empresa" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-200">
                    Empresa
                  <input
                    id="demo-empresa"
                    name="empresa"
                    autoComplete="organization"
                    maxLength={160}
                    type="text"
                    placeholder="Empresa"
                    required
                    value={form.empresa}
                    onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                  />
                  </label>
                </div>
                <label htmlFor="demo-email" className="text-sm font-medium text-slate-200">Correo electrónico</label>
                <input
                  id="demo-email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'demo-email-error' : undefined}
                  type="email"
                  placeholder="Correo electrónico"
                  required
                  value={form.email}
                  onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); if (emailError) setEmailError('') }}
                  className={`rounded-xl border bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:ring-1 ${
                    emailError
                      ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400/30'
                      : 'border-white/10 focus:border-[#EF8E01]/50 focus:ring-[#EF8E01]/30'
                  }`}
                />
                {emailError && <p id="demo-email-error" role="alert" className="-mt-1 text-xs text-red-300">{emailError}</p>}
                <label htmlFor="demo-telefono" className="text-sm font-medium text-slate-200">Teléfono (opcional)</label>
                <input
                  id="demo-telefono"
                  name="telefono"
                  autoComplete="tel"
                  maxLength={40}
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                />
                {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
                <p className="text-center text-xs font-medium text-slate-300">
                  Conversemos sobre tu operación · Sin compromiso
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0038BD] px-6 text-sm font-bold text-white shadow-lg shadow-[#0038BD]/25 transition hover:bg-[#002fa8] disabled:opacity-60"
                >
                  {submitting ? 'Enviando...' : 'Solicitar Demo'}
                  {!submitting && <ArrowRight className="ml-2" size={16} />}
                </button>
                <p className="text-center text-[11px] text-slate-300">
                  Usaremos tus datos para responder y coordinar tu demo. No te suscribes a publicidad.{' '}
                  <Link href="/politicas#solicitudes-demo" className="text-slate-300 underline underline-offset-2">Consulta cómo tratamos tus datos.</Link>
                </p>
                <p className="text-center text-xs text-slate-300">
                  O escríbenos a{' '}
                  <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="text-[#EF8E01] hover:underline">
                    {PLATFORM_CONTACT_EMAIL}
                  </a>
                </p>
              </form>
            )}
    </div>
  )
}
