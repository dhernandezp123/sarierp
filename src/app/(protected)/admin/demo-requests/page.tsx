'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CalendarClock, Inbox, Mail, Phone, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { IS_DEMO_ENVIRONMENT } from '@/src/lib/demo-environment'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

const LEAD_STATUSES = [
  'Nueva',
  'Contactada',
  'Demo programada',
  'Convertida',
  'Cerrada',
] as const

type LeadStatus = (typeof LEAD_STATUSES)[number]

type DemoRequest = {
  id: string
  nombre: string
  empresa: string
  email: string
  telefono: string | null
  status: LeadStatus
  notes: string | null
  contacted_at: string | null
  created_at: string
  updated_at: string
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusClass(status: LeadStatus) {
  if (status === 'Nueva') return 'bg-blue-100 text-blue-700'
  if (status === 'Contactada') return 'bg-amber-100 text-amber-700'
  if (status === 'Demo programada') return 'bg-purple-100 text-purple-700'
  if (status === 'Convertida') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
}

export default function DemoRequestsPage() {
  const router = useRouter()
  const { profile } = useUser()
  const canViewRequests = Boolean(
    profile?.rol === 'Admin'
      && profile.is_platform_admin === true
      && profile.is_demo_user !== true
      && !IS_DEMO_ENVIRONMENT
  )
  const [requests, setRequests] = useState<DemoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todas' | LeadStatus>('Todas')
  const [selected, setSelected] = useState<DemoRequest | null>(null)
  const [editStatus, setEditStatus] = useState<LeadStatus>('Nueva')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchRequests = useCallback(async () => {
    if (!canViewRequests) return { data: null, error: null }
    return supabase
      .from('leads')
      .select('id, nombre, empresa, email, telefono, status, notes, contacted_at, created_at, updated_at')
      .order('created_at', { ascending: false })
  }, [canViewRequests])

  const loadRequests = useCallback(async () => {
    const { data, error } = await fetchRequests()

    if (error) {
      toast.error('No se pudieron cargar las solicitudes de demo')
    } else {
      setRequests((data ?? []) as DemoRequest[])
    }
    setLoading(false)
  }, [fetchRequests])

  useEffect(() => {
    if (!profile) return
    if (!canViewRequests) {
      router.replace('/dashboard')
      return
    }

    let active = true
    void fetchRequests().then(({ data, error }) => {
      if (!active) return
      if (error) {
        toast.error('No se pudieron cargar las solicitudes de demo')
      } else {
        setRequests((data ?? []) as DemoRequest[])
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [canViewRequests, fetchRequests, profile, router])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requests.filter((request) => {
      const matchesStatus = statusFilter === 'Todas' || request.status === statusFilter
      const matchesSearch = !query || [
        request.nombre,
        request.empresa,
        request.email,
        request.telefono ?? '',
      ].some((value) => value.toLowerCase().includes(query))
      return matchesStatus && matchesSearch
    })
  }, [requests, search, statusFilter])

  const openRequest = (request: DemoRequest) => {
    setSelected(request)
    setEditStatus(request.status)
    setNotes(request.notes ?? '')
  }

  const saveRequest = async () => {
    if (!selected || saving) return
    setSaving(true)

    const shouldSetContactedAt =
      editStatus !== 'Nueva' && selected.contacted_at === null
    const { error } = await supabase
      .from('leads')
      .update({
        status: editStatus,
        notes: notes.trim() || null,
        contacted_at: shouldSetContactedAt
          ? new Date().toISOString()
          : selected.contacted_at,
      })
      .eq('id', selected.id)

    if (error) {
      toast.error('No se pudo actualizar la solicitud')
      setSaving(false)
      return
    }

    toast.success('Solicitud actualizada')
    setSelected(null)
    setSaving(false)
    await loadRequests()
  }

  if (!canViewRequests) return null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Hernova Systems
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
          <Inbox className="h-7 w-7 text-[#0038BD]" />
          Solicitudes de Demo
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Bandeja privada de prospectos recibidos desde forwarders.app.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Total', requests.length],
          ['Nuevas', requests.filter((item) => item.status === 'Nueva').length],
          ['Demos programadas', requests.filter((item) => item.status === 'Demo programada').length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nombre, empresa, correo o teléfono"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'Todas' | LeadStatus)}
          className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="Todas">Todos los estados</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={5} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-300">
                <tr>
                  <th className="px-4 py-3">Prospecto</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Recibida</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No hay solicitudes con estos filtros.</td></tr>
                ) : filtered.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{request.nombre}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />{request.empresa}</p>
                    </td>
                    <td className="px-4 py-4">
                      <a href={`mailto:${request.email}`} className="flex items-center gap-1.5 text-xs text-blue-700 hover:underline dark:text-blue-300"><Mail className="h-3.5 w-3.5" />{request.email}</a>
                      {request.telefono && <a href={`tel:${request.telefono}`} className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 hover:underline"><Phone className="h-3.5 w-3.5" />{request.telefono}</a>}
                    </td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>{request.status}</span></td>
                    <td className="px-4 py-4 text-xs text-slate-500">{formatDateTime(request.created_at)}</td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => openRequest(request)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Revisar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.nombre}</DialogTitle>
            <DialogDescription>{selected?.empresa} · recibida {formatDateTime(selected?.created_at ?? null)}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-blue-700 hover:underline"><Mail className="h-4 w-4" />{selected.email}</a>
                <span className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" />{selected.telefono || 'Sin teléfono'}</span>
                <span className="flex items-center gap-2 text-slate-600 sm:col-span-2"><CalendarClock className="h-4 w-4" />Contactada: {formatDateTime(selected.contacted_at)}</span>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Estado</span>
                <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as LeadStatus)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                  {LEAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Notas internas</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} maxLength={2000} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Próximo paso, fecha acordada o contexto comercial..." />
              </label>
            </div>
          )}

          <DialogFooter>
            <button type="button" onClick={() => setSelected(null)} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Cancelar</button>
            <button type="button" onClick={saveRequest} disabled={saving} className="h-10 rounded-xl bg-[#0038BD] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar seguimiento'}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
