import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/src/lib/supabase/server'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('rol, status, is_active')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.rol !== 'Admin' || profile?.status !== 'Aprobado' || profile?.is_active !== true) {
      return NextResponse.json({ error: 'Solo Admin puede consultar las conexiones' }, { status: 403, headers })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Consulta de conexiones no disponible' }, { status: 503, headers })
    }

    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const users: { id: string; last_sign_in_at: string | null }[] = []
    let page = 1
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) {
        return NextResponse.json({ error: 'No se pudieron consultar las conexiones' }, { status: 502, headers })
      }
      // Auth contiene datos privados; devolver únicamente el ID y la fecha.
      users.push(...data.users.map(({ id, last_sign_in_at }) => ({
        id,
        last_sign_in_at: last_sign_in_at ?? null,
      })))
      if (data.users.length === 0 || (!data.nextPage && data.users.length < 1000)) break
      page += 1
    }

    return NextResponse.json({ users }, { headers })
  } catch {
    return NextResponse.json({ error: 'No se pudieron consultar las conexiones' }, { status: 500, headers })
  }
}
