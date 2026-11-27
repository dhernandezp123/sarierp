'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { useTenantFeatures } from '@/src/components/tenant/TenantFeatures'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, formatDateTime } from '@/src/lib/format'
import { cardClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { WHATSAPP_REQUEST_STATUSES, whatsappStatusTone, type WhatsappRequestStatus } from '@/src/lib/whatsapp-intake'

type QuoteRequest = {
  id: string; codigo: string; cliente: string; modalidad: string; origen: string; destino: string; mercancia: string
  peso: string | null; volumen: string | null; bultos: string | null; incoterm: string | null; notas: string | null
  texto_original: string; solicitado_por_id: string; estado: WhatsappRequestStatus; creado_en: string
  estado_actualizado_en: string | null
}
type Person = { id: string; nombre: string | null; apellido: string | null }

const personName = (person?: Person) => person ? `${person.nombre || ''} ${person.apellido || ''}`.trim() || 'Sin nombre' : '—'

function StatusBadge({ status }: { status: WhatsappRequestStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${whatsappStatusTone[status] || ''}`}>{status}</span>
}

export default function WhatsappRequestsPage() {
  const { whatsappIntake } = useTenantFeatures()
  if (!whatsappIntake) return <div className={cardClass}>La recepción de solicitudes por WhatsApp no está habilitada para tu empresa.</div>
  return <WhatsappRequests />
}

function WhatsappRequests() {
  const { user, profile, loading: userLoading } = useUser()
  const role = profile?.rol
  const active = profile?.status === 'Aprobado' && profile.is_active === true
  const canView = active && (role === 'Admin' || role === 'Pricing' || role === 'Ventas')
  const canChangeStatus = active && (role === 'Admin' || role === 'Pricing')
  const tenantId = profile?.tenant_id || ''
  const context = `${user?.id}:${tenantId}:${role}:${active}`
  const owner = useRef('')

  const [state, setState] = useState<{ context: string; requests: QuoteRequest[]; people: Map<string, Person>; error: string } | null>(null)
  const [status, setStatus] = useState('Pendiente'), [query, setQuery] = useState('')
  const [page, setPage] = useState(1), [size, setSize] = useState(25)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canView || !tenantId) return
    owner.current = context
    const isCurrent = () => owner.current === context
    try {
      // RLS limita a Ventas a sus propias solicitudes.
      const requests = await readAllReportRows<QuoteRequest>((from, to) => supabase.from('solicitudes_cotizacion')
        .select('id,codigo,cliente,modalidad,origen,destino,mercancia,peso,volumen,bultos,incoterm,notas,texto_original,solicitado_por_id,estado,creado_en,estado_actualizado_en')
        .eq('tenant_id', tenantId).order('creado_en', { ascending: false }).order('id').range(from, to), { label: 'las solicitudes', isCurrent })
      const ids = [...new Set(requests.map(request => request.solicitado_por_id))]
      const people = new Map<string, Person>()
      if (ids.length) {
        const { data, error } = await supabase.from('profiles').select('id,nombre,apellido').eq('tenant_id', tenantId).in('id', ids)
        if (error) throw new Error('No se pudieron cargar los vendedores. Reintenta la consulta.')
        for (const person of data || []) people.set(person.id, person)
      }
      if (isCurrent()) setState({ context, requests, people, error: '' })
    } catch (error) {
      if (isCurrent()) setState({ context, requests: [], people: new Map(), error: (error as Error).message })
    }
  }, [canView, tenantId, context])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(timer); owner.current = '' }
  }, [load])

  const current = state?.context === context ? state : null
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    return (current?.requests || []).filter(request => (!status || request.estado === status) && (!term
      || [request.codigo, request.cliente, request.origen, request.destino, personName(current?.people.get(request.solicitado_por_id))]
        .some(value => value.toLocaleLowerCase('es').includes(term))))
  }, [current, status, query])
  const visible = filtered.slice((page - 1) * size, page * size)
  const selected = current?.requests.find(request => request.id === selectedId) || null

  if (userLoading) return null
  if (!canView) return <div className={cardClass}>Solo Admin, Pricing y Ventas pueden consultar las solicitudes de WhatsApp.</div>

  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Pricing" title="Solicitudes WhatsApp" icon={MessageSquare}
      description={role === 'Ventas' ? 'Solicitudes de cotización que enviaste por WhatsApp y su avance en Pricing.'
        : 'Solicitudes de cotización enviadas por el equipo comercial desde WhatsApp.'}
      actions={<button type="button" className={secondaryButtonClass} onClick={() => void load()}>Actualizar</button>} />
    <div className={cardClass}>
      <div className="mb-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Buscar" className="lg:col-span-2"><input className={fieldClassSm} value={query} placeholder="Código, cliente, vendedor, origen o destino" onChange={event => { setQuery(event.target.value); setPage(1) }} /></FormField>
        <FormField label="Estado" as="div"><CompactSelect aria-label="Estado" value={status} onValueChange={value => { setStatus(value); setPage(1) }}
          options={[{ value: '', label: 'Todos' }, ...WHATSAPP_REQUEST_STATUSES.map(value => ({ value, label: value }))]} /></FormField>
      </div>
      {current?.error && <p role="alert" className="mb-4 text-sm text-rose-600">{current.error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
      {!current ? <p className="py-10 text-center text-sm text-slate-500">Cargando solicitudes…</p>
        : !filtered.length ? <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sin solicitudes" description={status === 'Pendiente' && !query ? 'No hay solicitudes pendientes.' : 'Ajusta los filtros para ver otras solicitudes.'} />
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Vendedor</th><th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Modalidad</th><th className="py-2 pr-4">Origen → Destino</th><th className="py-2 pr-4">Estado</th><th className="py-2" /></tr></thead>
            <tbody>{visible.map(request => <tr key={request.id} className="border-b border-slate-100 align-top dark:border-slate-800">
              <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">{request.codigo}</td>
              <td className="py-3 pr-4 whitespace-nowrap">{formatDate(request.creado_en)}</td>
              <td className="py-3 pr-4">{personName(current.people.get(request.solicitado_por_id))}</td>
              <td className="py-3 pr-4">{request.cliente}</td>
              <td className="py-3 pr-4">{request.modalidad}</td>
              <td className="py-3 pr-4">{request.origen} → {request.destino}</td>
              <td className="py-3 pr-4"><StatusBadge status={request.estado} /></td>
              <td className="py-3 text-right"><button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setSelectedId(request.id)}>Ver detalle</button></td>
            </tr>)}</tbody>
          </table>
            <Pagination page={page} pageSize={size} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1) }} />
          </div>}
    </div>
    {selected && current && <RequestDialog request={selected} seller={personName(current.people.get(selected.solicitado_por_id))} canChangeStatus={canChangeStatus}
      onClose={() => setSelectedId(null)} onSaved={() => void load()} />}
  </div>
}

function RequestDialog({ request, seller, canChangeStatus, onClose, onSaved }: {
  request: QuoteRequest; seller: string; canChangeStatus: boolean; onClose: () => void; onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [origin] = useState(() => (typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null))
  // Se monta desde estado (sin DialogTrigger): devolver el foco al botón que lo abrió.
  const returnFocus = useCallback((event: Event) => {
    if (!origin || origin === document.body) return
    event.preventDefault()
    setTimeout(() => { if (origin.isConnected) origin.focus() }, 0)
  }, [origin])

  async function changeStatus(estado: WhatsappRequestStatus) {
    if (busy || estado === request.estado) return
    setBusy(true)
    const { error } = await supabase.rpc('whatsapp_set_quote_request_status', { p_id: request.id, p_estado: estado })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Solicitud ${request.codigo}: ${estado}`)
    onSaved()
  }

  const fields: [string, string | null][] = [
    ['Cliente', request.cliente], ['Vendedor', seller], ['Modalidad', request.modalidad], ['Incoterm', request.incoterm],
    ['Origen', request.origen], ['Destino', request.destino], ['Mercancía', request.mercancia], ['Peso', request.peso],
    ['Volumen', request.volumen], ['Bultos', request.bultos],
  ]

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 sm:max-w-2xl" onCloseAutoFocus={returnFocus}>
      <DialogTitle>Solicitud {request.codigo}</DialogTitle>
      <DialogDescription>Recibida el {formatDateTime(request.creado_en)}{request.estado_actualizado_en ? ` · estado actualizado el ${formatDateTime(request.estado_actualizado_en)}` : ''}</DialogDescription>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-500">Estado</span><StatusBadge status={request.estado} /></div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-0.5 text-slate-900 dark:text-white">{value || '—'}</dd></div>)}
        <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-900 dark:text-white">{request.notas || '—'}</dd></div>
      </dl>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Mensaje original</p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">{request.texto_original}</pre>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cerrar</button>
        {canChangeStatus && WHATSAPP_REQUEST_STATUSES.filter(estado => estado !== request.estado).map(estado =>
          <button key={estado} type="button" className={estado === 'Cotizada' ? primaryButtonClass : secondaryButtonClass} disabled={busy} onClick={() => void changeStatus(estado)}>
            {busy ? 'Guardando…' : `Marcar ${estado.toLowerCase()}`}</button>)}
      </div>
    </DialogContent>
  </Dialog>
}
