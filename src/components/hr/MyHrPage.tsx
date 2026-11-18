'use client'
import { useCallback, useState } from 'react'
import { CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, IdCard, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate } from '@/src/lib/format'
import { cardClass, primaryButtonClass } from '@/src/lib/ui-classes'
import { canManageHr, canUseHrSelfService, employeeFullName, vacationBalance, type HrEmployee, type HrLeaveRequest } from '@/src/lib/hr'
import { FinancePageHeader, FinanceMetric } from '@/src/components/invoicing/FinanceWorkspace'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { HrNavigation, LeaveRequestDialog, LeaveStatusBadge, formatLeaveRange, useScopedLoad } from './HrShared'

export function MyHrPage() {
  const { user, profile, loading: userLoading } = useUser()
  const allowed = canUseHrSelfService(profile), tenant = profile?.tenant_id || '', userId = user?.id || ''
  const context = `${userId}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async () => {
    const { data: employee, error } = await supabase.from('hr_employees').select('*').eq('tenant_id', tenant).eq('profile_id', userId).maybeSingle<HrEmployee>()
    if (error) throw new Error('No se pudo cargar tu ficha. Reintenta la consulta.')
    if (!employee) return { employee: null, requests: [] as HrLeaveRequest[], manager: null as string | null }
    const [requests, manager] = await Promise.all([
      readAllReportRows<HrLeaveRequest>((a, b) => supabase.from('hr_leave_requests').select('*').eq('employee_id', employee.id).order('start_date', { ascending: false }).order('id').range(a, b), { label: 'tus solicitudes' }),
      // RLS no expone la ficha del jefe; la RPC devuelve solo su nombre.
      employee.manager_id ? supabase.rpc('hr_employee_manager_name', { p_employee_id: employee.id }).then(result => (result.data as string | null) || null) : Promise.resolve(null),
    ])
    return { employee, requests, manager }
  }, [tenant, userId])
  const { data, error, loading, reload } = useScopedLoad(context, allowed && !!tenant && !!userId, loader)
  const [requesting, setRequesting] = useState(false)
  const [cancelling, setCancelling] = useState<HrLeaveRequest | null>(null)
  const year = new Date().getFullYear()

  async function cancel(request: HrLeaveRequest) {
    setCancelling(null)
    const { error: rpcError } = await supabase.rpc('hr_review_leave', { p_id: request.id, p_decision: 'Cancelada', p_notes: '' })
    if (rpcError) { toast.error(rpcError.message); return }
    toast.success('Solicitud cancelada')
    void reload()
  }

  if (userLoading) return null
  if (!allowed) return <div className={cardClass}>Tu usuario no tiene acceso al autoservicio de Recursos Humanos.</div>
  const employee = data?.employee, balance = employee ? vacationBalance(employee, data.requests, year) : null

  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Mi ficha" icon={IdCard} description="Tus datos laborales, saldo de vacaciones y solicitudes."
      actions={employee?.status === 'Activo' && <button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} onClick={() => setRequesting(true)}><Plus size={16} aria-hidden="true" />Solicitar vacaciones o permiso</button>} />
    <HrNavigation manager={canManageHr(profile)} />
    {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
    {loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando tu ficha…</p>
      : !employee ? <div className={cardClass}><EmptyState title="Tu usuario no tiene ficha vinculada" description="Pide a Administración que vincule tu usuario del ERP a tu ficha de empleado." /></div>
        : <>
          {balance && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceMetric label={`Vacaciones ${year}`} value={`${balance.allowance} días`} icon={CalendarDays} />
            <FinanceMetric label="Tomadas" value={`${balance.used} días`} icon={CalendarCheck} tone="emerald" />
            <FinanceMetric label="Pendientes de aprobación" value={`${balance.pending} días`} icon={CalendarClock} tone="amber" />
            <FinanceMetric label="Disponibles" value={`${balance.available} días`} icon={CalendarPlus} />
          </div>}
          <section className={cardClass}>
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{employeeFullName(employee)} · {employee.employee_code}</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {([['Cargo', employee.job_title], ['Departamento', employee.department], ['Jefe directo', data.manager],
                ['Fecha de ingreso', formatDate(employee.hire_date)], ['Contrato', employee.contract_type], ['Estado', employee.status],
                ['Identidad', employee.national_id], ['Correo', employee.email], ['Teléfono', employee.phone],
                ['Dirección', employee.address], ['Contacto de emergencia', [employee.emergency_contact_name, employee.emergency_contact_phone].filter(Boolean).join(' · ')]] as const)
                .map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-slate-900 dark:text-white">{value || '—'}</dd></div>)}
            </dl>
            <p className="mt-4 text-xs text-slate-500">¿Algún dato es incorrecto? Solicita la corrección a Administración.</p>
          </section>
          <section className={cardClass}>
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Mis solicitudes</h2>
            {!data.requests.length ? <EmptyState title="Aún no tienes solicitudes" description="Tus solicitudes de vacaciones y permisos aparecerán aquí." />
              : <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Fechas</th><th className="py-2 pr-4 text-right">Días</th><th className="py-2 pr-4">Estado</th><th className="py-2" /></tr></thead>
                <tbody>{data.requests.map(request => <tr key={request.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="py-3 pr-4">{request.leave_type}{request.reason && <p className="text-xs text-slate-500">{request.reason}</p>}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatLeaveRange(request.start_date, request.end_date)}</td>
                  <td className="py-3 pr-4 text-right">{request.business_days}</td>
                  <td className="py-3 pr-4"><LeaveStatusBadge status={request.status} />{request.review_notes && <p className="mt-1 text-xs text-slate-500">{request.review_notes}</p>}</td>
                  <td className="py-3 text-right">{request.status === 'Pendiente' && <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setCancelling(request)}>Cancelar</button>}</td>
                </tr>)}</tbody>
              </table></div>}
          </section>
        </>}
    {requesting && employee && balance && <LeaveRequestDialog employeeId={employee.id} employeeName={employeeFullName(employee)} availableFor={target => vacationBalance(employee, data.requests, target).available}
      onClose={() => setRequesting(false)} onSaved={() => { setRequesting(false); void reload() }} />}
    <ConfirmDialog open={!!cancelling} onOpenChange={open => { if (!open) setCancelling(null) }} title="Cancelar solicitud"
      description={cancelling ? `${cancelling.leave_type} · ${formatLeaveRange(cancelling.start_date, cancelling.end_date)}. Los días reservados vuelven a tu saldo.` : ''}
      confirmLabel="Cancelar solicitud" cancelLabel="Volver" danger onConfirm={() => { if (cancelling) void cancel(cancelling) }} />
  </div>
}
