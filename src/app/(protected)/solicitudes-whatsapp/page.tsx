'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FilePlus2, MessageSquare, UserPlus } from 'lucide-react'
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
import { quotationHrefForRole, suggestClients, whatsappConversionHref } from '@/src/lib/whatsapp-conversion'
import { searchClients, type ClientOption } from '@/src/lib/client-search'

type QuoteRequest = {
  id: string; codigo: string; cliente: string; modalidad: string; origen: string; destino: string; mercancia: string
  peso: string | null; volumen: string | null; medidas: string | null; bultos: string | null; incoterm: string | null; valor_declarado: string | null; notas: string | null
  texto_original: string; solicitado_por_id: string; estado: WhatsappRequestStatus; creado_en: string
  estado_actualizado_en: string | null
  quotation_id: string | null
}
type Person = { id: string; nombre: string | null; apellido: string | null; rol?: string | null }

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

  const [state, setState] = useState<{ context: string; requests: QuoteRequest[]; people: Map<string, Person>; quotations: Map<string, string | null>; error: string } | null>(null)
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
        .select('id,codigo,cliente,modalidad,origen,destino,mercancia,peso,volumen,medidas,bultos,incoterm,valor_declarado,notas,texto_original,solicitado_por_id,estado,creado_en,estado_actualizado_en,quotation_id')
        .eq('tenant_id', tenantId).order('creado_en', { ascending: false }).order('id').range(from, to), { label: 'las solicitudes', isCurrent })
      const ids = [...new Set(requests.map(request => request.solicitado_por_id))]
      const people = new Map<string, Person>()
      if (ids.length) {
        const { data, error } = await supabase.from('profiles').select('id,nombre,apellido,rol').eq('tenant_id', tenantId).in('id', ids)
        if (error) throw new Error('No se pudieron cargar los vendedores. Reintenta la consulta.')
        for (const person of data || []) people.set(person.id, person)
      }
      // Número de las cotizaciones creadas desde una solicitud (WA-04); RLS decide cuáles se ven.
      const quotationIds = requests.map(request => request.quotation_id).filter((id): id is string => Boolean(id))
      const quotations = new Map<string, string | null>()
      if (quotationIds.length) {
        const { data, error } = await supabase.from('quotations').select('id,quotation_number').in('id', quotationIds)
        if (error) throw new Error('No se pudieron cargar las cotizaciones vinculadas. Reintenta la consulta.')
        for (const quotation of data || []) quotations.set(quotation.id, quotation.quotation_number)
      }
      if (isCurrent()) setState({ context, requests, people, quotations, error: '' })
    } catch (error) {
      if (isCurrent()) setState({ context, requests: [], people: new Map(), quotations: new Map(), error: (error as Error).message })
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
              <td className="py-3 pr-4"><StatusBadge status={request.estado} />{request.quotation_id && <p className="mt-1 whitespace-nowrap text-xs text-slate-500">{current.quotations.get(request.quotation_id) || 'Cotización creada'}</p>}</td>
              <td className="py-3 text-right"><button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setSelectedId(request.id)}>Ver detalle</button></td>
            </tr>)}</tbody>
          </table>
            <Pagination page={page} pageSize={size} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1) }} />
          </div>}
    </div>
    {selected && current && <RequestDialog request={selected} seller={personName(current.people.get(selected.solicitado_por_id))} sellerIsPricing={current.people.get(selected.solicitado_por_id)?.rol === 'Pricing'} canChangeStatus={canChangeStatus}
      quotationNumber={selected.quotation_id ? current.quotations.get(selected.quotation_id) ?? null : null} tenantId={tenantId} role={role}
      onClose={() => setSelectedId(null)} onSaved={() => void load()} />}
  </div>
}

function RequestDialog({ request, seller, sellerIsPricing, canChangeStatus, quotationNumber, tenantId, role, onClose, onSaved }: {
  request: QuoteRequest; seller: string; sellerIsPricing: boolean; canChangeStatus: boolean; quotationNumber: string | null; tenantId: string; role: string | null | undefined; onClose: () => void; onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [converting, setConverting] = useState(false)
  const converted = Boolean(request.quotation_id)
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
    ['Volumen', request.volumen], ['Medidas', request.medidas], ['Bultos', request.bultos], ['Valor declarado', request.valor_declarado],
  ]

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 sm:max-w-2xl" onCloseAutoFocus={returnFocus}>
      <DialogTitle>Solicitud {request.codigo}</DialogTitle>
      <DialogDescription>Recibida el {formatDateTime(request.creado_en)}{request.estado_actualizado_en ? ` · estado actualizado el ${formatDateTime(request.estado_actualizado_en)}` : ''}</DialogDescription>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-500">Estado</span><StatusBadge status={request.estado} />
        {request.quotation_id && <Link href={quotationHrefForRole(role, request.quotation_id)} className="text-sm font-medium text-[#B3282D] underline dark:text-rose-300">
          Ver cotización {quotationNumber || ''}</Link>}</div>
      {converting && !converted && <ClientPicker request={request} seller={seller} sellerIsPricing={sellerIsPricing} tenantId={tenantId} onCancel={() => setConverting(false)} />}
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
        {canChangeStatus && !converted && !converting && <button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} disabled={busy} onClick={() => setConverting(true)}>
          <FilePlus2 size={16} aria-hidden="true" />Convertir en cotización</button>}
        {canChangeStatus && !converted && WHATSAPP_REQUEST_STATUSES.filter(estado => estado !== request.estado && estado !== 'Cotizada').map(estado =>
          <button key={estado} type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void changeStatus(estado)}>
            {busy ? 'Guardando…' : `Marcar ${estado.toLowerCase()}`}</button>)}
      </div>
    </DialogContent>
  </Dialog>
}

type ClientRow = ClientOption & { id: string; nombre: string | null }

/** WA-04: elegir el cliente de la cotización; sugiere los parecidos al nombre escrito por el vendedor. */
function ClientPicker({ request, seller, sellerIsPricing, tenantId, onCancel }: { request: QuoteRequest; seller: string; sellerIsPricing: boolean; tenantId: string; onCancel: () => void }) {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error: loadError } = await supabase.from('clientes').select('id,nombre,codigo_cliente,rtn')
        .eq('tenant_id', tenantId).is('deleted_at', null).order('nombre').limit(5000)
      if (!active) return
      if (loadError) setError('No se pudieron cargar los clientes.')
      else setClients(data || [])
    })()
    return () => { active = false }
  }, [tenantId])
  const suggestions = useMemo(() => suggestClients(clients || [], request.cliente), [clients, request.cliente])
  const results = useMemo(() => query.trim() ? searchClients(clients || [], query).slice(0, 8) : [], [clients, query])
  const choose = (client: ClientRow | 'new') => router.push(whatsappConversionHref(request.id, client))
  const row = (client: ClientRow, hint?: string) => <li key={client.id}>
    <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => choose(client)}>
      <span className="font-medium text-slate-900 dark:text-white">{client.nombre}{client.codigo_cliente && <span className="ml-2 text-xs font-normal text-slate-500">{client.codigo_cliente}</span>}</span>
      {hint && <span className="shrink-0 text-xs text-slate-500">{hint}</span>}
    </button></li>
  return <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
    <p className="text-sm font-semibold text-slate-900 dark:text-white">Cliente de la cotización</p>
    <p className="mt-1 text-xs text-slate-500">{seller} escribió “{request.cliente}”. {sellerIsPricing
      ? 'Como la pidió Pricing, la cotización quedará a nombre del vendedor asignado al cliente; si no tiene uno válido o el cliente es nuevo, lo eliges en el formulario.'
      : `La cotización y, si lo creas, el cliente quedarán a nombre de ${seller}.`}</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {!clients && !error && <p className="mt-3 text-sm text-slate-500">Buscando clientes…</p>}
    {clients && <>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Coincidencias</p>
      {suggestions.length ? <ul className="mt-1 space-y-1">{suggestions.map(item => row(item.client, item.score >= 0.9 ? 'Coincide' : 'Parecido'))}</ul>
        : <p className="mt-1 text-sm text-slate-500">No hay clientes con un nombre parecido.</p>}
      <FormField label="Buscar otro cliente" className="mt-3"><input className={fieldClassSm} value={query} placeholder="Nombre, código o RTN" onChange={event => setQuery(event.target.value)} /></FormField>
      {results.length > 0 && <ul className="mt-1 space-y-1">{results.map(client => row(client))}</ul>}
    </>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" className={secondaryButtonClass} onClick={onCancel}>Volver</button>
      <button type="button" className={`${secondaryButtonClass} inline-flex items-center gap-2`} onClick={() => choose('new')}><UserPlus size={16} aria-hidden="true" />Crear cliente nuevo</button>
    </div>
  </section>
}
