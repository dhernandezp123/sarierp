'use client'
import { useCallback } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { formatDate, formatDateTime } from '@/src/lib/format'
import { readAllReportRows } from '@/src/lib/report-query'
import { employeeFullName, type HrEmployee } from '@/src/lib/hr'
import type { HrHistoryEntry } from '@/src/lib/hr-report'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { useReturnFocus, useScopedLoad } from './HrShared'

const labels: Record<string, string> = { employee_code: 'Código', first_name: 'Nombres', last_name: 'Apellidos', national_id: 'Identidad', birth_date: 'Nacimiento', email: 'Correo', phone: 'Teléfono', address: 'Dirección', emergency_contact_name: 'Contacto de emergencia', emergency_contact_phone: 'Teléfono de emergencia', department: 'Departamento', job_title: 'Cargo', manager_id: 'Jefe directo', hire_date: 'Ingreso', contract_type: 'Contrato', status: 'Estado', termination_date: 'Salida', work_schedule: 'Jornada', vacation_days_override: 'Mínimo de vacaciones', profile_id: 'Usuario ERP' }
const value = (key: string, input: unknown, names: Map<string, string>) => input == null || input === '' ? '—'
  : key === 'profile_id' || key === 'manager_id' ? names.get(String(input)) ?? 'Usuario o empleado no disponible'
    : key.endsWith('_date') ? formatDate(String(input)) : String(input)

export function HrHistoryDialog({ employee, names, onClose }: { employee: HrEmployee; names: Map<string, string>; onClose: () => void }) {
  const { user, profile } = useUser(), returnFocus = useReturnFocus()
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.status}:${profile?.is_active}:${employee.id}`
  const loader = useCallback(() => readAllReportRows<HrHistoryEntry>((a, b) => supabase.from('hr_employee_history').select('id,revision,action,changes,created_at,created_by')
    .eq('employee_id', employee.id).order('revision', { ascending: false }).order('id').range(a, b), { label: 'historial de ficha' }), [employee.id])
  const { data, error, loading, reload } = useScopedLoad(context, true, loader)
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="grid-cols-1 max-h-[90dvh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={returnFocus}>
      <DialogTitle>Historial de ficha · {employeeFullName(employee)}</DialogTitle>
      <DialogDescription>Cambios registrados desde la activación del historial. Los movimientos de vacaciones se consultan en Vacaciones.</DialogDescription>
      {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="text-sm text-slate-500">Cargando historial…</p> : data && !error && (!data.length ? <p className="text-sm text-slate-500">Sin cambios registrados desde la activación del historial.</p> : <ol className="space-y-5">
        {data.map(entry => <li key={entry.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <p className="mb-3 text-sm font-semibold">{entry.action} · revisión {entry.revision} · {formatDateTime(entry.created_at)}</p>
          <dl className="space-y-3 text-sm">{Object.entries(entry.changes).filter(([, change]) => entry.action !== 'Creación' || (change.after != null && change.after !== '')).map(([key, change]) => <div key={key} className={`grid min-w-0 gap-1 ${entry.action === 'Creación' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            <dt className="text-slate-500">{labels[key] ?? key}</dt>
            {entry.action !== 'Creación' && <dd className="break-words text-slate-500"><span className="mr-1 text-xs">Antes:</span>{value(key, change.before, names)}</dd>}
            <dd className="break-words font-medium">{entry.action !== 'Creación' && <span className="mr-1 text-xs font-normal text-slate-500">Después:</span>}{value(key, change.after, names)}</dd>
          </div>)}</dl>
          <p className="mt-3 break-words text-xs text-slate-500">Autor: {entry.created_by ? names.get(entry.created_by) ?? 'Usuario ERP' : 'Sistema'}</p>
        </li>)}
      </ol>)}
    </DialogContent>
  </Dialog>
}
