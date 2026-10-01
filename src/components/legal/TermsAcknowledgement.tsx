'use client'

import Link from 'next/link'
import { LEGAL_VERSION, type LegalAudience } from '@/src/lib/legal-documents'

export function TermsAcknowledgement({ audience, checked, onChange }: {
  audience: LegalAudience
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = `legal-${audience}`
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" required checked={checked}
          onChange={event => onChange(event.target.checked)} aria-describedby={`${id}-documents`}
          className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
        <label htmlFor={id}>Acepto las condiciones de uso del {audience === 'portal' ? 'portal' : 'software'} y declaro haber leído el aviso de privacidad, versión {LEGAL_VERSION}.</label>
      </div>
      <p id={`${id}-documents`} className="pl-7">
        <Link href={audience === 'portal' ? '/terminos-logisticos' : '/politicas'} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Leer condiciones y privacidad (nueva pestaña)</Link>
        {audience === 'portal' && <>{' · '}<Link href="/politicas" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Políticas del software (nueva pestaña)</Link></>}
      </p>
      <p className="pl-7 text-xs">Solicitar acceso no contrata un servicio de pago ni autoriza publicidad.</p>
    </div>
  )
}
