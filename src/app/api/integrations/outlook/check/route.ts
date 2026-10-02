import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase/server'
import { SARI_MAILBOX, OUTLOOK_INTAKE_STANDBY } from '@/src/lib/mail-intake'
import { intakeAdminClient, isIntakeDemo, outlookToken, graphRequest } from '@/src/lib/server/outlook-intake'

export async function POST() {
  if (OUTLOOK_INTAKE_STANDBY) return NextResponse.json({ error: 'Integración de Outlook en espera' }, { status: 503 })
  try {
    const client = await createClient()
    const { data: auth, error: authError } = await client.auth.getUser()
    if (authError || !auth.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    // RLS permits only an approved, active tenant administrator to see this row.
    const { data: settings, error } = await client.from('mail_intake_settings').select('mailbox').single()
    if (error || settings?.mailbox !== SARI_MAILBOX) return NextResponse.json({ error: 'Integración no disponible' }, { status: 403 })
    if (await isIntakeDemo(intakeAdminClient())) return NextResponse.json({ error: 'Conexión bloqueada en Demo' }, { status: 403 })
    const token = await outlookToken()
    const response = await graphRequest(token, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SARI_MAILBOX)}/mailFolders/inbox?$select=id,displayName`)
    if (!response.ok) throw new Error(`No se pudo acceder al buzón (${response.status})`)
    return NextResponse.json({ ok: true, message: 'Lectura del buzón autorizada. No se enviaron correos; falta verificar Mail.Send con el administrador.' })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo comprobar la conexión' }, { status: 503 })
  }
}
