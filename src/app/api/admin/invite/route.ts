import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const INVITABLE_ROLES = [
  'Admin',
  'Ventas',
  'Pricing',
  'Operaciones',
  'Contabilidad',
  'Finanzas',
  'Cliente',
] as const

export async function POST(request: Request) {
  try {
    const { email, rol } = (await request.json()) as { email: string; rol: string }

    if (!email || !rol) {
      return NextResponse.json({ error: 'Email y rol son requeridos' }, { status: 400 })
    }

    if (!INVITABLE_ROLES.includes(rol as (typeof INVITABLE_ROLES)[number])) {
      return NextResponse.json({ error: 'Rol invalido' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY no esta configurada en el servidor' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('rol, status, is_active')
      .eq('id', authData.user.id)
      .single()

    if (profileError || profile?.rol !== 'Admin' || profile?.status !== 'Aprobado' || profile?.is_active === false) {
      return NextResponse.json({ error: 'Solo Admin puede invitar usuarios' }, { status: 403 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/onboarding`,
      data: { rol, invited_by_admin: true },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { error: invitedProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: email.trim().toLowerCase(),
        rol,
        status: rol === 'Cliente' ? 'Pendiente' : 'Aprobado',
        is_active: true,
        approved_at: rol === 'Cliente' ? null : new Date().toISOString(),
        approved_by: rol === 'Cliente' ? null : authData.user.id,
      })
      .eq('id', data.user.id)

    if (invitedProfileError) {
      return NextResponse.json(
        {
          error:
            'La invitación fue enviada, pero no se pudo preparar el perfil: '
            + invitedProfileError.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ userId: data.user.id })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
