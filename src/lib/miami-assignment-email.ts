import { supabase } from '@/src/lib/supabase/client'

type AssignmentEmailResult = {
  ok: boolean
  sent?: boolean
  alreadySent?: boolean
  skipped?: boolean
  error?: string
}

export async function sendMiamiPackageAssignmentEmail(
  packageId: string
): Promise<AssignmentEmailResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  if (!accessToken) {
    return { ok: false, error: 'No hay una sesión válida para enviar el aviso' }
  }

  try {
    const response = await fetch('/api/miami/package-assignment-email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ packageId }),
    })
    const payload = await response.json() as AssignmentEmailResult

    return {
      ...payload,
      ok: response.ok && payload.ok !== false,
      error: response.ok ? payload.error : payload.error || 'No se pudo enviar el aviso por correo',
    }
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servicio de correo' }
  }
}
