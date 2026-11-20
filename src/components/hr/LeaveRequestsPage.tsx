'use client'
import { useCallback, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate } from '@/src/lib/format'
import { cardClass, fieldClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_LEAVE_STATUSES, HR_LEAVE_TYPES, canManageHr, employeeFullName, type HrEmployee, type HrLeaveRequest } from '@/src/lib/hr'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { HrNavigation, LeaveFlags, LeaveStatusBadge, formatLeaveRange, useReturnFocus, useScopedLoad } from './HrShared'

type Decision = 'Aprobada' | 'Rechazada' | 'Cancelada'
const decisionCopy: Record<Decision, { title: string; action: string; notesRequired: boolean }> = {
  Aprobada: { title: 'Aprobar solicitud', action: 'Aprobar', notesRequired: false },
  Rechazada: { title: 'Rechazar solicitud', action: 'Rechazar', notesRequired: true },
  Cancelada: { title: 'Cancelar solicitud', action: 'Cancelar solicitud', notesRequired: false },
}

export function LeaveRequestsPage() {
  const { user, profile, loading: userLoading } = useUser()
  const manager = canManageHr(profile), tenant = profile?.tenant_id || ''
  const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async () => {
    const [employees, requests] = await Promise.all([
      readAllReportRows<HrEmployee>((a, b) => supabase.from('hr_employees').select('*').eq('tenant_id', tenant).order('id').range(a, b), { label: 'empleados' }),
      readAllReportRows<HrLeaveRequest>((a, b) => supabase.from('hr_leave_requests').select('*').eq('tenant_id', tenant).order('start_date', { ascending: false }).order('id').range(a, b), { label: 'solicitudes' }),
    ])
    return { employees, requests }
  }, [tenant])
  const { data, error, loading, reload } = useScopedLoad(context, manager && !!tenant, loader)
  const [status, setStatus] = useState('Pendiente'), [type, setType] = useState(''), [query, setQuery] = useState('')
  const [page, setPage] = useState(1), [size, setSize] = useState(25)
  const [review, setReview] = useState<{ request: HrLeaveRequest; decision: Decision } | null>(null)
  const [suspending, setSuspending] = useState<HrLeaveRequest | null>(null)
  const employees = useMemo(() => new Map((data?.employees || []).map(employee => [employee.id, employee])), [data])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    return (data?.requests || []).filter(request => (!status || request.status === status) && (!type || request.leave_type === type)
      && (!term || employeeFullName(employees.get(request.employee_id)).toLocaleLowerCase('es').includes(term)))
  }, [data, employees, status, type, query])
  const visible = filtered.slice((page - 1) * size, page * size)

  if (userLoading) return null
  if (!manager) return <div className={cardClass}>Solo Administración puede revisar solicitudes.</div>

  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Vacaciones y permisos" icon={CalendarDays}
      description="Revisa las solicitudes del personal. Las vacaciones pendientes reservan saldo hasta que se aprueban, rechazan o cancelan." />
    <HrNavigation manager />
    <div className={cardClass}>
      <div className="mb-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Empleado" className="lg:col-span-2"><input className={fieldClassSm} value={query} placeholder="Buscar por nombre" onChange={event => { setQuery(event.target.value); setPage(1) }} /></FormField>
        <FormField label="Estado" as="div"><CompactSelect aria-label="Estado" value={status} onValueChange={value => { setStatus(value); setPage(1) }}
          options={[{ value: '', label: 'Todos' }, ...HR_LEAVE_STATUSES.map(value => ({ value, label: value }))]} /></FormField>
        <FormField label="Tipo" as="div"><CompactSelect aria-label="Tipo" value={type} onValueChange={value => { setType(value); setPage(1) }}
          options={[{ value: '', label: 'Todos' }, ...HR_LEAVE_TYPES.map(value => ({ value, label: value }))]} /></FormField>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando solicitudes…</p>
        : !filtered.length ? <EmptyState title="Sin solicitudes" description={status === 'Pendiente' ? 'No hay solicitudes por revisar.' : 'Ajusta los filtros para ver otras solicitudes.'} />
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-4">Empleado</th><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Fechas</th><th className="py-2 pr-4 text-right">Días</th>
              <th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Solicitada</th><th className="py-2" /></tr></thead>
            <tbody>{visible.map(request => {
              const employee = employees.get(request.employee_id)
              return <tr key={request.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{employeeFullName(employee) || '—'}<p className="text-xs font-normal text-slate-500">{employee?.job_title}</p></td>
                <td className="py-3 pr-4">{request.leave_type}<LeaveFlags request={request} />{request.reason && <p className="max-w-xs text-xs text-slate-500">{request.reason}</p>}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{formatLeaveRange(request.start_date, request.end_date)}</td>
                <td className="py-3 pr-4 text-right">{request.business_days}</td>
                <td className="py-3 pr-4"><LeaveStatusBadge status={request.status} />{request.review_notes && <p className="mt-1 max-w-xs text-xs text-slate-500">{request.review_notes}</p>}
                  {request.suspension_notes && <p className="mt-1 max-w-xs text-xs text-orange-700 dark:text-orange-300">Suspendida: {request.suspension_notes}</p>}</td>
                <td className="py-3 pr-4">{formatDate(request.created_at)}</td>
                <td className="py-3 text-right"><div className="flex justify-end gap-3 whitespace-nowrap">
                  {request.status === 'Pendiente' && <>
                    <button type="button" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300" onClick={() => setReview({ request, decision: 'Aprobada' })}>Aprobar</button>
                    <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setReview({ request, decision: 'Rechazada' })}>Rechazar</button>
                  </>}
                  {request.status === 'Aprobada' && request.end_date > request.start_date && <button type="button" className="text-sm font-medium text-orange-700 hover:underline dark:text-orange-300" onClick={() => setSuspending(request)}>Suspender</button>}
                  {(request.status === 'Pendiente' || request.status === 'Aprobada') && <button type="button" className="text-sm font-medium text-slate-600 hover:underline dark:text-slate-300" onClick={() => setReview({ request, decision: 'Cancelada' })}>Cancelar</button>}
                </div></td>
              </tr>
            })}</tbody>
          </table>
            <Pagination page={page} pageSize={size} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1) }} />
          </div>}
    </div>
    {review && data && <ReviewDialog request={review.request} decision={review.decision} employee={employees.get(review.request.employee_id)}
      onClose={() => setReview(null)} onSaved={() => { setReview(null); void reload() }} />}
    {suspending && <SuspendDialog request={suspending} employee={employees.get(suspending.employee_id)} onClose={() => setSuspending(null)} onSaved={() => { setSuspending(null); void reload() }} />}
  </div>
}

function ReviewDialog({ request, decision, employee, onClose, onSaved }: {
  request: HrLeaveRequest; decision: Decision; employee?: HrEmployee; onClose: () => void; onSaved: () => void
}) {
  const [notes, setNotes] = useState(''), [busy, setBusy] = useState(false)
  const returnFocus = useReturnFocus()
  const copy = decisionCopy[decision]
  async function confirm() {
    if (busy || (copy.notesRequired && !notes.trim())) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_review_leave', { p_id: request.id, p_decision: decision, p_notes: notes.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Solicitud ${decision.toLowerCase()}`)
    onSaved()
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 sm:max-w-md" onCloseAutoFocus={returnFocus}>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogDescription>{employeeFullName(employee)} · {request.leave_type} · {formatLeaveRange(request.start_date, request.end_date)} ({request.business_days} día(s) hábiles)</DialogDescription>
      {decision === 'Aprobada' && request.leave_type === 'Vacaciones' && <p className="text-sm text-slate-600 dark:text-slate-300">Al aprobar se revalida el saldo vigente y se asignan los días a los períodos más antiguos.<LeaveFlags request={request} /></p>}
      <FormField label={copy.notesRequired ? 'Motivo del rechazo' : 'Nota'} required={copy.notesRequired}>
        <textarea className={`${fieldClass} h-24 py-3`} maxLength={1000} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} /></FormField>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Volver</button>
        <button type="button" className={primaryButtonClass} disabled={busy || (copy.notesRequired && !notes.trim())} onClick={() => void confirm()}>{busy ? 'Guardando…' : copy.action}</button>
      </div>
    </DialogContent>
  </Dialog>
}

/** Art. 351: suspensión por urgencia; los días no gozados vuelven al saldo. */
function SuspendDialog({ request, employee, onClose, onSaved }: { request: HrLeaveRequest; employee?: HrEmployee; onClose: () => void; onSaved: () => void }) {
  const [returnDate, setReturnDate] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false)
  const returnFocus = useReturnFocus()
  const minimum = new Date(`${request.start_date}T00:00:00`); minimum.setDate(minimum.getDate() + 1)
  const min = `${minimum.getFullYear()}-${String(minimum.getMonth() + 1).padStart(2, '0')}-${String(minimum.getDate()).padStart(2, '0')}`
  const problem = !returnDate ? 'Indica la fecha de reintegro' : returnDate < min || returnDate > request.end_date ? 'El reintegro debe ser después del primer día y dentro de la solicitud' : !notes.trim() ? 'Indica el motivo' : ''
  async function confirm() {
    if (problem || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_suspend_leave', { p_id: request.id, p_return_date: returnDate, p_notes: notes.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Vacaciones suspendidas; los días no gozados volvieron al saldo')
    onSaved()
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 sm:max-w-md" onCloseAutoFocus={returnFocus}>
      <DialogTitle>Suspender por urgencia</DialogTitle>
      <DialogDescription>{employeeFullName(employee)} · {formatLeaveRange(request.start_date, request.end_date)}. El trabajador conserva el derecho a reanudar los días no gozados (Art. 351); los gastos extraordinarios corren por cuenta del patrono.</DialogDescription>
      <div className="grid gap-4">
        <FormField label="Fecha de reintegro" required><input type="date" className={fieldClass} disabled={busy} min={min} max={request.end_date} value={returnDate} onChange={event => setReturnDate(event.target.value)} /></FormField>
        <FormField label="Motivo de la urgencia" required><textarea className={`${fieldClass} h-24 py-3`} maxLength={1000} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} /></FormField>
      </div>
      {problem && returnDate && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Volver</button>
        <button type="button" className={primaryButtonClass} disabled={busy || !!problem} onClick={() => void confirm()}>{busy ? 'Guardando…' : 'Suspender'}</button>
      </div>
    </DialogContent>
  </Dialog>
}
