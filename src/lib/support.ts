import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/src/types'

export const SUPPORT_TICKET_CATEGORIES: SupportTicketCategory[] = [
  'Error del sistema',
  'Consulta',
  'Configuración',
  'Capacitación',
  'Solicitud de cambio',
  'Mejora',
]

export const SUPPORT_TICKET_PRIORITIES: SupportTicketPriority[] = [
  'Crítica',
  'Alta',
  'Normal',
]

export const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = [
  'Nuevo',
  'En revisión',
  'Esperando al cliente',
  'En desarrollo',
  'Resuelto',
  'Cerrado',
]

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments'
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const

export type SupportProfileSummary = {
  id?: string
  nombre: string | null
  apellido: string | null
  email: string | null
  is_platform_admin?: boolean
}

export type SupportTicket = {
  id: string
  ticket_number: string
  subject: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  status: SupportTicketStatus
  created_by: string
  assigned_to: string | null
  source_path: string | null
  source_module: string | null
  browser_info: string | null
  last_activity_at: string
  first_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  creator?: SupportProfileSummary | SupportProfileSummary[] | null
  assignee?: SupportProfileSummary | SupportProfileSummary[] | null
}

export type SupportMessage = {
  id: string
  ticket_id: string
  author_id: string
  body: string
  is_internal: boolean
  created_at: string
  author?: SupportProfileSummary | SupportProfileSummary[] | null
}

export type SupportAttachment = {
  id: string
  ticket_id: string
  message_id: string | null
  uploaded_by: string
  file_name: string
  file_path: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export function resolveSupportProfile(
  value: SupportProfileSummary | SupportProfileSummary[] | null | undefined
) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export function supportProfileName(
  value: SupportProfileSummary | SupportProfileSummary[] | null | undefined,
  fallback = 'Usuario'
) {
  const profile = resolveSupportProfile(value)
  const fullName = `${profile?.nombre ?? ''} ${profile?.apellido ?? ''}`.trim()
  return fullName || profile?.email || fallback
}

export function formatSupportDateTime(value: string | null | undefined) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function sanitizeSupportFileName(name: string) {
  const extensionIndex = name.lastIndexOf('.')
  const extension = extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : ''
  const base = (extensionIndex >= 0 ? name.slice(0, extensionIndex) : name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  return `${base || 'archivo'}${extension}`
}
