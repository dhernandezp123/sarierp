'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { validateDemoLead, type DemoLead, type LeadField } from '@/src/lib/demo-lead'
import { PLATFORM_CONTACT_EMAIL, PLATFORM_ORIGIN } from '@/src/lib/platform-branding'
import { emitMeasurement, measureOperation } from '@/src/lib/browser/measurements'

const inputClassName =
  'rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white placeholder-slate-400 outline-none transition focus:border-[#EF8E01]/60 focus:ring-1 focus:ring-[#EF8E01]/30'

export function LandingContact() {
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '', website: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedLead, setSubmittedLead] = useState<DemoLead | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LeadField, string>>>({})
  const [submitError, setSubmitError] = useState('')
  const submittingRef = useRef(false)
  const formStarted = useRef(false)
  const nombreRef = useRef<HTMLInputElement>(null)
  const empresaRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const telefonoRef = useRef<HTMLInputElement>(null)

  function clearFieldError(field: LeadField) {
    if (!fieldErrors[field]) return
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return

    if (form.website.trim()) {
      setSubmitted(true)
      return
    }
    const { lead, errors: nextErrors } = validateDemoLead(form)

    setFieldErrors(nextErrors)
    setSubmitError('')

    const firstInvalidField = (['nombre', 'empresa', 'email', 'telefono'] as const).find((field) => nextErrors[field])
    if (firstInvalidField) {
      const fieldRefs = { nombre: nombreRef, empresa: empresaRef, email: emailRef, telefono: telefonoRef }
      fieldRefs[firstInvalidField].current?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      await measureOperation('demo_submit', async () => {
        const response = await fetch('/api/demo-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...lead, website: form.website }),
        })
        if (response.status === 429) throw new Error('DEMO_RATE_LIMIT')
        const result = await response.json().catch(() => null)
        if (!response.ok || result?.ok !== true) throw new Error('DEMO_UNAVAILABLE')
      })
      setSubmittedLead(lead)
      setSubmitted(true)
      toast.success('Solicitud recibida.', { id: 'demo-request' })
    } catch (error) {
      const message = error instanceof Error && error.message === 'DEMO_RATE_LIMIT'
        ? 'Recibimos varias solicitudes desde tu conexión. Espera unos minutos o contáctanos por correo o WhatsApp.'
        : 'No se pudo enviar. Revisa tu conexión e intenta de nuevo, o escríbenos por correo.'
      setSubmitError(message)
      toast.error(message, { id: 'demo-request' })
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
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          {submittedLead ? `¡Listo, ${submittedLead.nombre.split(/\s+/)[0]}! Recibimos tus datos.` : 'Gracias. Recibimos tu solicitud.'}
        </h3>
        <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">
          Nos pondremos en contacto contigo para coordinar la sesión y preparar una demostración enfocada en el flujo de{' '}
          <strong className="font-semibold text-white">{submittedLead?.empresa || 'tu empresa'}</strong>.
        </p>
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="mt-7 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-[#FFB44B] underline underline-offset-4">
          {PLATFORM_CONTACT_EMAIL}
        </a>
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/15 sm:p-7">
      <div className="mb-6 border-b border-white/10 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#FFB44B]">Agenda en 1 minuto</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Solicita una demo con tu flujo.</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">Sesión personalizada 1 a 1 para evaluar tus modalidades y operación.</p>
      </div>

      <form onSubmit={handleSubmit} onInput={() => {
        if (!formStarted.current) { formStarted.current = true; emitMeasurement({ name: 'demo_form', stage: 'started' }) }
      }} noValidate aria-label="Solicitar una demo" aria-busy={submitting} className="flex min-w-0 flex-col gap-4">
        <div aria-hidden="true" className="hidden">
          <label htmlFor="demo-website">Sitio web</label>
          <input id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" maxLength={120} value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="demo-nombre" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-200">
            Tu nombre
            <input
              ref={nombreRef}
              disabled={submitting}
              id="demo-nombre"
              name="nombre"
              autoComplete="name"
              maxLength={120}
              type="text"
              placeholder="Ej. Carlos Mendoza"
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
            Agencia o empresa
            <input
              ref={empresaRef}
              disabled={submitting}
              id="demo-empresa"
              name="empresa"
              autoComplete="organization"
              maxLength={160}
              type="text"
              placeholder="Nombre de tu empresa"
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
            disabled={submitting}
            id="demo-email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'demo-email-error' : undefined}
            type="email"
            placeholder="nombre@tuagencia.com"
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
          <span>WhatsApp o teléfono <span className="font-normal text-slate-400">(opcional, agiliza la coordinación)</span></span>
          <input
            ref={telefonoRef}
            disabled={submitting}
            id="demo-telefono"
            name="telefono"
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            aria-invalid={Boolean(fieldErrors.telefono)}
            aria-describedby={fieldErrors.telefono ? 'demo-telefono-error' : undefined}
            type="tel"
            placeholder="Código de país + número"
            value={form.telefono}
            onChange={(event) => {
              setForm((current) => ({ ...current, telefono: event.target.value }))
              clearFieldError('telefono')
            }}
            className={inputClassName}
          />
          {fieldErrors.telefono ? <span id="demo-telefono-error" className="text-xs text-red-300">{fieldErrors.telefono}</span> : null}
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
          {submitting ? 'Enviando solicitud…' : 'Agendar demo con mi flujo'}
          {!submitting ? <ArrowRight className="ml-2" size={16} aria-hidden="true" /> : null}
        </button>

        <p className="text-center text-[11px] leading-5 text-slate-300">
          Usaremos tus datos únicamente para coordinar tu demo. Cero spam.{' '}
          <Link href={`${PLATFORM_ORIGIN}/politicas#solicitudes-demo`} className="underline underline-offset-2 hover:text-white">Privacidad y datos.</Link>
        </p>
      </form>
    </div>
  )
}
