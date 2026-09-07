export const LEGAL_VERSION = '2026-09-07'
export type LegalAudience = 'erp' | 'portal'

export function signupLegalAcceptance(audience: LegalAudience, accepted: boolean) {
  if (!accepted) throw new Error('Debes aceptar las condiciones y leer el aviso de privacidad.')
  return { version: LEGAL_VERSION, audience, terms_accepted: true, privacy_read: true }
}
