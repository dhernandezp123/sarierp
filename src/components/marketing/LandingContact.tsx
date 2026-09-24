'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { PLATFORM_CONTACT_EMAIL, PLATFORM_ORIGIN } from '@/src/lib/platform-branding'

type LeadField = 'nombre' | 'empresa' | 'email'

const inputClassName =
  'rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-[#EF8E01]/60 focus:ring-1 focus:ring-[#EF8E01]/30'

export function LandingContact() {
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LeadField, string>>>({})
  const [submitError, setSubmitError] = useState('')
  const submittingRef = useRef(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const empresaRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  function clearFieldError(field: LeadField) {
    if (!fieldErrors[field]) return
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return

    const lead = {
      nombre: form.nombre.trim(),
      empresa: form.empresa.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
    }
    const nextErrors: Partial<Record<LeadField, string>> = {}

    if (!lead.nombre) nextErrors.nombre = 'Ingresa tu nombre.'
    if (!lead.empresa) nextErrors.empresa = 'Ingresa el nombre de tu empresa.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      nextErrors.email = 'Ingresa un correo válido.'
    }

    setFieldErrors(nextErrors)
    setSubmitError('')

    const firstInvalidField = (['nombre', 'empresa', 'email'] as const).find((field) => nextErrors[field])
    if (firstInvalidField) {
      const fieldRefs = { nombre: nombreRef, empresa: empresaRef, email: emailRef }
      fieldRefs[firstInvalidField].current?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const { error } = await supabase.from('leads').insert([lead])
      if (error) throw error
      setSubmitted(true)
      toast.success('Solicitud recibida.')
    } catch {
      const message = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo, o escríbenos por correo.'
      setSubmitError(message)
      toast.error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[28rem] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.055] p-8 text-center sm:p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#16A36A]/20 text-[#5EE0A4]">
          <Check size={28} aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-[#FFB44B]">Solicitud registrada</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Gracias. Ya tenemos el contexto inicial.</h3>
        <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">Revisaremos la información enviada para coordinar el siguiente paso y preparar una conversación relevante para tu operación.</p>
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="mt-7 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[#FFB44B] underline underline-offset-4">
          {PLATFORM_CONTACT_EMAIL}
        </a>
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/15 sm:p-7">
      <div className="mb-6 border-b border-white/10 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#FFB44B]">Cuatro datos para empezar</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Solicita una demo con tu flujo.</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">Sin suscripción publicitaria. El alcance se confirma antes de contratar.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-label="Solicitar una demo" aria-busy={submitting} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="demo-nombre" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-200">
            Tu nombre
            <input
              ref={nombreRef}
              id="demo-nombre"
              name="nombre"
              autoComplete="name"
              maxLength={120}
              type="text"
              placeholder="Tu nombre"
              required
              aria-invalid={Boolean(fieldErrors.nombre)}
              aria-describedby={fieldErrors.nombre ? 'demo-nombre-error' : undefined}
              value={form.nombre}
              onChange={(event) => {
                setForm((current) => ({ ...current, nombre: event.target.value }))
                clearFieldError('nombre')
              }}
              className={inputClassName}
            />
            {fieldErrors.nombre ? <span id="demo-nombre-error" className="text-xs text-red-300">{fieldErrors.nombre}</span> : null}
          </label>

          <label htmlFor="demo-empresa" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-200">
            Empresa
            <input
              ref={empresaRef}
              id="demo-empresa"
              name="empresa"
              autoComplete="organization"
              maxLength={160}
              type="text"
              placeholder="Empresa"
              required
              aria-invalid={Boolean(fieldErrors.empresa)}
              aria-describedby={fieldErrors.empresa ? 'demo-empresa-error' : undefined}
              value={form.empresa}
              onChange={(event) => {
                setForm((current) => ({ ...current, empresa: event.target.value }))
                clearFieldError('empresa')
              }}
              className={inputClassName}
            />
            {fieldErrors.empresa ? <span id="demo-empresa-error" className="text-xs text-red-300">{fieldErrors.empresa}</span> : null}
          </label>
        </div>

        <label htmlFor="demo-email" className="flex flex-col gap-2 text-sm font-medium text-slate-200">
          Correo de trabajo
          <input
            ref={emailRef}
            id="demo-email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'demo-email-error' : undefined}
            type="email"
            placeholder="nombre@empresa.com"
            required
            value={form.email}
            onChange={(event) => {
              setForm((current) => ({ ...current, email: event.target.value }))
              clearFieldError('email')
            }}
            className={inputClassName}
          />
          {fieldErrors.email ? <span id="demo-email-error" className="text-xs text-red-300">{fieldErrors.email}</span> : null}
        </label>

        <label htmlFor="demo-telefono" className="flex flex-col gap-2 text-sm font-medium text-slate-200">
          <span>Teléfono <span className="font-normal text-slate-400">(opcional)</span></span>
          <input
            id="demo-telefono"
            name="telefono"
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            type="tel"
            placeholder="Código de país + número"
            value={form.telefono}
            onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
            className={inputClassName}
          />
        </label>

        <div aria-live="polite" className="min-h-5">
          {submitError ? <p role="alert" className="text-sm leading-5 text-red-300">{submitError}</p> : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0757E8] px-6 text-sm font-bold text-white shadow-lg shadow-[#0038BD]/25 transition hover:bg-[#0A4BC4] disabled:cursor-wait disabled:opacity-70"
        >
          {submitting ? <LoaderCircle className="mr-2 animate-spin motion-reduce:animate-none" size={17} aria-hidden="true" /> : null}
          {submitting ? 'Enviando solicitud…' : 'Ver una demo con mi flujo'}
          {!submitting ? <ArrowRight className="ml-2" size={16} aria-hidden="true" /> : null}
        </button>

        <p className="text-center text-[11px] leading-5 text-slate-300">
          Usaremos tus datos para responder y coordinar tu demo. No te suscribes a publicidad.{' '}
          <Link href={`${PLATFORM_ORIGIN}/politicas#solicitudes-demo`} className="underline underline-offset-2 hover:text-white">Consulta cómo tratamos tus datos.</Link>
        </p>
      </form>
    </div>
  )
}
