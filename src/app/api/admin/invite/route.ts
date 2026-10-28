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

function inviteName(value: unknown) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null
}

export async function POST(request: Request) {
  if (process.env.APP_ENV === 'demo' || process.env.NEXT_PUBLIC_APP_ENV === 'demo') {
    return NextResponse.json({ error: 'Las invitaciones están bloqueadas en Demo' }, { status: 403 })
  }
  try {
    const body = await request.json() as Record<string, unknown>
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const rol = typeof body.rol === 'string' ? body.rol : ''
    const nombre = inviteName(body.nombre)
    const apellido = inviteName(body.apellido)

    if (!email || !rol) {
      return NextResponse.json({ error: 'Email y rol son requeridos' }, { status: 400 })
    }

    if (!nombre || !apellido) {
      return NextResponse.json({ error: 'Nombre y apellido son requeridos y deben tener hasta 100 caracteres, sin saltos de línea' }, { status: 400 })
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
      .select('rol, status, is_active, tenant_id, is_platform_admin')
      .eq('id', authData.user.id)
      .single()

    if (
      profileError
      || profile?.rol !== 'Admin'
      || profile?.status !== 'Aprobado'
      || profile?.is_active !== true
      || profile?.is_platform_admin === true
      || !profile?.tenant_id
    ) {
      return NextResponse.json({ error: 'Solo Admin puede invitar usuarios' }, { status: 403 })
    }

    const { data: tenantDomain, error: domainError } = await supabaseAdmin
      .from('tenant_domains')
      .select('hostname')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .single()

    if (domainError || !tenantDomain?.hostname) {
      return NextResponse.json(
        { error: 'La empresa no tiene un dominio principal activo' },
        { status: 409 }
      )
    }

    const siteUrl = `https://${tenantDomain.hostname}`

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/onboarding`,
      data: { rol, invited_by_admin: true, tenant_id: profile.tenant_id, nombre, apellido },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { error: invitedProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: email.trim().toLowerCase(),
        nombre,
        apellido,
        tenant_id: profile.tenant_id,
        rol,
        status: rol === 'Cliente' ? 'Pendiente' : 'Aprobado',
        is_active: true,
        approved_at: rol === 'Cliente' ? null : new Date().toISOString(),
        approved_by: rol === 'Cliente' ? null : authData.user.id,
      })
      .eq('id', data.user.id)
      .select('id')
      .single()

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
