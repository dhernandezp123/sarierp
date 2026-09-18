import { calendarDaysUntil } from '@/src/lib/format'

export type UserTaskStatus = 'Pendiente' | 'Completada'
export type UserTaskPriority = 'Baja' | 'Media' | 'Alta'
export type UserTaskView = 'pending' | 'overdue' | 'completed'
export type UserTaskModule = 'general' | 'sales' | 'operations' | 'agents' | 'invoicing'
export type UserTaskEntityType =
  | 'customer'
  | 'lead'
  | 'sales_activity'
  | 'quotation'
  | 'shipping_instruction'
  | 'booking'
  | 'bill_of_lading'
  | 'agent'
  | 'invoice'

export type UserTask = {
  id: string
  title: string
  notes: string | null
  status: UserTaskStatus
  priority: UserTaskPriority
  due_date: string | null
  entity_type: UserTaskEntityType | null
  entity_id: string | null
  entity_label: string | null
  source_module: UserTaskModule
  source_path: string | null
  completed_at: string | null
  updated_at: string | null
}

const moduleLabels: Record<UserTaskModule, string> = {
  general: 'General',
  sales: 'Ventas',
  operations: 'Operaciones',
  agents: 'Agentes',
  invoicing: 'Facturación',
}

const allowedPrefixes: Record<UserTaskEntityType, string[]> = {
  customer: ['/customers/', '/clientes/'],
  lead: ['/ventas'],
  sales_activity: ['/ventas'],
  quotation: ['/quotations/', '/pricing/'],
  shipping_instruction: ['/operations/shipping-instructions/'],
  booking: ['/operations/shipping-instructions/'],
  bill_of_lading: ['/operations/shipping-instructions/'],
  agent: ['/agents/'],
  invoice: ['/invoicing/'],
}

export function userTaskModuleLabel(module: UserTaskModule) {
  return moduleLabels[module] || moduleLabels.general
}

export function userTaskSourceHref(task: Pick<UserTask, 'entity_type' | 'source_path'>) {
  if (!task.entity_type || !task.source_path) return null
  if (
    !task.source_path.startsWith('/')
    || task.source_path.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(task.source_path)
  ) return null

  try {
    const base = 'https://forwarders.app'
    const url = new URL(task.source_path, base)
    if (url.origin !== base) return null
    if (!allowedPrefixes[task.entity_type].some((prefix) => url.pathname.startsWith(prefix))) {
      return null
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function isUserTaskOverdue(task: Pick<UserTask, 'status' | 'due_date'>, today = new Date()) {
  if (task.status !== 'Pendiente' || !task.due_date) return false
  return (calendarDaysUntil(task.due_date, today) ?? 0) < 0
}

export function filterUserTasks(tasks: UserTask[], view: UserTaskView, today = new Date()) {
  return tasks.filter((task) => {
    if (view === 'completed') return task.status === 'Completada'
    if (task.status !== 'Pendiente') return false
    return view === 'pending' || isUserTaskOverdue(task, today)
  })
}
