export const RECOVERY_CALLBACK_PATH = '/auth/callback?next=/portal/reset-password'
export const RECOVERY_REQUEST_MESSAGE = 'Si el correo está registrado en esta empresa, recibirás un enlace de recuperación. Revisa también spam o promociones.'

export function recoveryDestination(value: string | null) {
  return value === '/portal/reset-password' ? '/portal/reset-password' : '/reset-password'
}

/** Recovery issued by an administrator cannot use a verifier stored in their browser. */
export function recoveryTokens(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.get('type') !== 'recovery' || params.has('error') || params.has('error_code')) return null
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

export function passwordValidationError(password: string, confirmation: string) {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (password !== confirmation) return 'Las contraseñas no coinciden.'
  return null
}
