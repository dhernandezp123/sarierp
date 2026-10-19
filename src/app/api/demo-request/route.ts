import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validateDemoLead } from '@/src/lib/demo-lead'
import { PLATFORM_HOSTNAME } from '@/src/lib/tenant-host'
import { PLATFORM_ORIGIN } from '@/src/lib/platform-branding'

export const runtime = 'nodejs'
const responseHeaders = { 'Cache-Control': 'no-store' }
const maxBodyBytes = 4096

export async function POST(request: Request) {
  if (new URL(request.url).hostname !== PLATFORM_HOSTNAME) {
    return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404, headers: responseHeaders })
  }
  if (request.headers.get('origin') !== PLATFORM_ORIGIN) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403, headers: responseHeaders })
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    return NextResponse.json({ error: 'Envía los datos en formato JSON' }, { status: 415, headers: responseHeaders })
  }
  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400, headers: responseHeaders })

  try {
    let size = 0
    let body = ''
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBodyBytes) {
        await reader.cancel()
        return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413, headers: responseHeaders })
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
    const payload: unknown = (() => { try { return JSON.parse(body) } catch { return null } })()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400, headers: responseHeaders })
    }
    if ('website' in payload && (typeof payload.website !== 'string' || payload.website.trim())) {
      return NextResponse.json({ ok: true }, { status: 202, headers: responseHeaders })
    }
    const { lead, errors, valid } = validateDemoLead(payload)
    if (!valid) return NextResponse.json({ error: 'Revisa los campos del formulario', fields: errors }, { status: 400, headers: responseHeaders })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Demo request unavailable')
    // Vercel overwrites this header at its edge; never trust arbitrary forwarded headers off Vercel.
    const ip = process.env.VERCEL === '1'
      ? request.headers.get('x-vercel-forwarded-for')?.trim()
      : process.env.NODE_ENV !== 'production' ? '127.0.0.1' : null
    if (!ip || !isIP(ip)) throw new Error('Demo request unavailable')
    const day = new Date().toISOString().slice(0, 10)
    const requestKey = createHmac('sha256', key).update(`demo-request:${day}:${ip}`).digest('hex')
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await admin.rpc('submit_demo_lead', { p_lead: lead, p_request_key: requestKey })
    if (error || typeof data !== 'boolean') throw new Error('Demo request unavailable')
    if (!data) {
      return NextResponse.json({ error: 'Espera unos minutos antes de volver a intentarlo' }, {
        status: 429, headers: { ...responseHeaders, 'Retry-After': '900' },
      })
    }
    return NextResponse.json({ ok: true }, { status: 202, headers: responseHeaders })
  } catch {
    return NextResponse.json({ error: 'No se pudo enviar. Intenta de nuevo o contáctanos directamente.' }, { status: 503, headers: responseHeaders })
  } finally {
    reader.releaseLock()
  }
}
