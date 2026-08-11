import type { User } from '@supabase/supabase-js'

export type { User }

export type UserRole =
  | 'Admin'
  | 'Ventas'
  | 'Pricing'
  | 'Operaciones'
  | 'Contabilidad'
  | 'Finanzas'
  | 'Cliente'

export type UserStatus = 'Pendiente' | 'Aprobado' | 'Rechazado'

export type Profile = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: UserRole
  status: UserStatus
  is_active: boolean
  is_platform_admin?: boolean
  approved_at: string | null
  approved_by: string | null
  cliente_id: string | null
  avatar_url?: string | null
  created_at: string
  updated_at?: string
  tutorial_completed?: boolean | null
  is_demo_user?: boolean
  demo_expires_at?: string | null
  demo_access_grant_id?: string | null
}

export type SupportTicketStatus =
  | 'Nuevo'
  | 'En revisión'
  | 'Esperando al cliente'
  | 'En desarrollo'
  | 'Resuelto'
  | 'Cerrado'

export type SupportTicketPriority = 'Crítica' | 'Alta' | 'Normal'

export type SupportTicketCategory =
  | 'Error del sistema'
  | 'Consulta'
  | 'Configuración'
  | 'Capacitación'
  | 'Solicitud de cambio'
  | 'Mejora'
