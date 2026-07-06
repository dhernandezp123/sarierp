import type { SupabaseClient } from '@supabase/supabase-js'

export type ClientePayload = {
  nombre: string
  contacto?: string
  nit?: string
  telefono?: string
  direccion?: string
  ciudad?: string
  departamento_estado?: string
  pais?: string
  email_1?: string
  email_2?: string
  email_3?: string
  observaciones?: string
  tipo_persona?: string
  condicion_pago?: string
  dias_credito?: number
  tipo_cliente?: string
  vendedor_asignado?: string
  origen_frecuente?: string
  preferred_miami_rate_destination?: string
  asegura_carga?: boolean
  seguro_porcentaje?: number | null
  notas_tarifas?: string
}

export type CreatedCliente = {
  id: string
  codigo_cliente: string | null
  nombre: string
}

// Crea el cliente, registra el evento en cliente_history y devuelve el
// registro creado (con su codigo generado). Si `vendedor_asignado` viene
// vacio, se asigna el usuario autenticado, igual que en /clientes/nuevo.
export async function createClienteRecord(
  supabase: SupabaseClient,
  payload: ClientePayload,
  changedBy?: string | null
): Promise<{ cliente: CreatedCliente | null; error: string | null }> {
  if (!payload.nombre?.trim()) {
    return { cliente: null, error: 'El nombre del cliente es obligatorio' }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { cliente: null, error: 'No se pudo validar el usuario autenticado.' }
  }

  const vendedorAsignado = payload.vendedor_asignado || user.id

  const { error } = await supabase.from('clientes').insert([
    {
      ...payload,
      vendedor_asignado: vendedorAsignado,
    },
  ])

  if (error) {
    return { cliente: null, error: error.message }
  }

  const { data: createdCliente } = await supabase
    .from('clientes')
    .select('id, codigo_cliente, nombre')
    .eq('vendedor_asignado', vendedorAsignado)
    .eq('nombre', payload.nombre)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (createdCliente) {
    await supabase.from('cliente_history').insert([
      {
        cliente_id: createdCliente.id,
        changed_by: changedBy,
        action: 'Cliente creado',
        notes: `Cliente ${createdCliente.codigo_cliente} creado`,
      },
    ])
  }

  return { cliente: createdCliente, error: null }
}
