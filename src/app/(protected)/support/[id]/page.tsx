'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Save,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  formatAttachmentSize,
  formatSupportDateTime,
  resolveSupportProfile,
  supportProfileName,
  SUPPORT_ATTACHMENT_BUCKET,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportAttachment,
  type SupportMessage,
  type SupportProfileSummary,
  type SupportTicket,
} from '@/src/lib/support'
import {
  getSupportAttachmentValidationError,
  uploadSupportAttachments as uploadSupportAttachmentFiles,
} from '@/src/lib/support-attachments'
import type { SupportTicketPriority, SupportTicketStatus } from '@/src/types'

type SupportEvent = {
  id: number
  event_type: string
  from_value: string | null
  to_value: string | null
  created_at: string
  actor?: SupportProfileSummary | SupportProfileSummary[] | null
}

function eventLabel(event: SupportEvent) {
  if (event.event_type === 'created') return 'Ticket creado'
  if (event.event_type === 'message_added') return 'Nueva respuesta registrada'
  if (event.event_type === 'reopened') return 'Ticket reabierto por el cliente'
  if (event.event_type === 'status_changed') return `Estado: ${event.from_value} → ${event.to_value}`
  if (event.event_type === 'priority_changed') return `Prioridad: ${event.from_value} → ${event.to_value}`
  if (event.event_type === 'assignment_changed') return 'Responsable actualizado'
  return 'Actividad registrada'
}

async function notifySupportEvent(payload: {
  ticketId: string
  eventType: 'message_added' | 'ticket_updated'
  messageId?: string
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return

  try {
    await fetch('/api/support/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // La respuesta queda guardada aunque el aviso por correo no esté disponible.
  }
}

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>()
  const ticketId = params.id
  const { user, profile } = useUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [events, setEvents] = useState<SupportEvent[]>([])
  const [platformAdmins, setPlatformAdmins] = useState<SupportProfileSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<SupportTicketStatus>('Nuevo')
  const [priority, setPriority] = useState<SupportTicketPriority>('Normal')
  const [assigneeId, setAssigneeId] = useState('')
  const [savingManagement, setSavingManagement] = useState(false)

  const isPlatformAdmin = profile?.is_platform_admin === true

  const loadTicket = useCallback(async () => {
    setLoading(true)
    const [ticketResult, messagesResult, attachmentsResult, eventsResult] = await Promise.all([
      supabase
        .from('support_tickets')
        .select(`
          id, ticket_number, subject, category, priority, status,
          created_by, assigned_to, source_path, source_module, browser_info,
          last_activity_at, first_response_at, resolved_at, closed_at,
          created_at, updated_at,
          creator:profiles!support_tickets_created_by_fkey(nombre, apellido, email, is_platform_admin),
          assignee:profiles!support_tickets_assigned_to_fkey(nombre, apellido, email, is_platform_admin)
        `)
        .eq('id', ticketId)
        .maybeSingle(),
      supabase
        .from('support_ticket_messages')
        .select(`
          id, ticket_id, author_id, body, is_internal, created_at,
          author:profiles!support_ticket_messages_author_id_fkey(nombre, apellido, email, is_platform_admin)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
      supabase
        .from('support_ticket_attachments')
        .select('id, ticket_id, message_id, uploaded_by, file_name, file_path, mime_type, size_bytes, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
      supabase
        .from('support_ticket_events')
        .select(`
          id, event_type, from_value, to_value, created_at,
          actor:profiles!support_ticket_events_actor_id_fkey(nombre, apellido, email)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (ticketResult.error || !ticketResult.data) {
      toast.error('No se encontró el ticket o no tienes acceso')
      setTicket(null)
    } else {
      const nextTicket = ticketResult.data as unknown as SupportTicket
      setTicket(nextTicket)
      setStatus(nextTicket.status)
      setPriority(nextTicket.priority)
      setAssigneeId(nextTicket.assigned_to ?? '')
    }

    if (messagesResult.error) toast.error('No se pudo cargar la conversación')
    if (attachmentsResult.error) toast.error('No se pudieron cargar los adjuntos')
    setMessages((messagesResult.data ?? []) as unknown as SupportMessage[])
    setAttachments((attachmentsResult.data ?? []) as SupportAttachment[])
    setEvents((eventsResult.data ?? []) as unknown as SupportEvent[])
    setLoading(false)
  }, [ticketId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTicket(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadTicket])

  useEffect(() => {
    if (!isPlatformAdmin) return

    const loadPlatformAdmins = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, email, is_platform_admin')
        .eq('is_platform_admin', true)
        .eq('status', 'Aprobado')
        .eq('is_active', true)
        .order('nombre')
      setPlatformAdmins((data ?? []) as SupportProfileSummary[])
    }
    void loadPlatformAdmins()
  }, [isPlatformAdmin])

  const attachmentsByMessage = useMemo(() => {
    const grouped = new Map<string, SupportAttachment[]>()
    attachments.forEach((attachment) => {
      if (!attachment.message_id) return
      const current = grouped.get(attachment.message_id) ?? []
      current.push(attachment)
      grouped.set(attachment.message_id, current)
    })
    return grouped
  }, [attachments])

  const validateFiles = (selectedFiles: File[]) => {
    const validationError = getSupportAttachmentValidationError(selectedFiles)
    if (!validationError) return true

    toast.error(validationError)
    return false
  }

  const handleFiles = (selected: FileList | null) => {
    const nextFiles = Array.from(selected ?? [])
    if (!validateFiles(nextFiles)) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFiles(nextFiles.slice(0, 5))
  }

  const uploadAttachments = async (messageId: string) => {
    if (!user || files.length === 0) return

    const result = await uploadSupportAttachmentFiles({
      ticketId,
      messageId,
      userId: user.id,
      files,
    })

    for (const fileName of result.failedFileNames) {
      toast.error(`No se pudo adjuntar ${fileName}`)
    }
  }

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    const cleanReply = reply.trim()
    if (!cleanReply) {
      toast.error('Escribe un mensaje antes de responder')
      return
    }
    if (!validateFiles(files)) return

    setSending(true)
    try {
      const { data, error } = await supabase.rpc('add_support_ticket_message', {
        p_ticket_id: ticketId,
        p_body: cleanReply,
        p_is_internal: isPlatformAdmin && isInternal,
      })

      if (error || !data) {
        toast.error(error?.message || 'No se pudo registrar la respuesta')
        return
      }

      await uploadAttachments(data as string)
      void notifySupportEvent({
        ticketId,
        eventType: 'message_added',
        messageId: data as string,
      })
      setReply('')
      setFiles([])
      setIsInternal(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success(isInternal ? 'Nota interna registrada' : 'Respuesta enviada')
      await loadTicket()
    } finally {
      setSending(false)
    }
  }

  const handleManage = async () => {
    if (!ticket || !isPlatformAdmin || savingManagement) return
    const normalizedAssignee = assigneeId || null
    if (
      status === ticket.status
      && priority === ticket.priority
      && normalizedAssignee === ticket.assigned_to
    ) {
      toast.info('No hay cambios administrativos pendientes')
      return
    }
    setSavingManagement(true)
    try {
      const { error } = await supabase.rpc('manage_support_ticket', {
        p_ticket_id: ticket.id,
        p_status: status,
        p_priority: priority,
        p_assigned_to: assigneeId || null,
        p_clear_assignee: !assigneeId,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      void notifySupportEvent({ ticketId, eventType: 'ticket_updated' })
      toast.success('Ticket actualizado')
      await loadTicket()
    } finally {
      setSavingManagement(false)
    }
  }

  const openAttachment = async (attachment: SupportAttachment) => {
    const { data, error } = await supabase.storage
      .from(SUPPORT_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.file_path, 60)
    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el archivo')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando ticket...</div>
  }

  if (!ticket) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#0b1220]">
        <LifeBuoyEmpty />
        <h1 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">Ticket no disponible</h1>
        <p className="mt-2 text-sm text-slate-500">No existe o no tienes permiso para consultarlo.</p>
        <Link href="/support" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Volver a soporte
        </Link>
      </div>
    )
  }

  const creator = resolveSupportProfile(ticket.creator)
  const closed = ticket.status === 'Cerrado'

  return (
    <div className="space-y-6">
      <div>
        <Link href="/support" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Volver a tickets
        </Link>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                {ticket.ticket_number}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ticket.category}
              </span>
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
                {ticket.status}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Creado por {supportProfileName(ticket.creator)} · {formatSupportDateTime(ticket.created_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                Conversación
              </h2>
            </div>

            <div className="space-y-4 p-5">
              {messages.map((message) => {
                const author = resolveSupportProfile(message.author)
                const fromSupport = author?.is_platform_admin === true
                const messageAttachments = attachmentsByMessage.get(message.id) ?? []
                return (
                  <article
                    key={message.id}
                    className={`rounded-2xl border p-4 ${message.is_internal
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                      : fromSupport
                        ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-full p-1.5 ${fromSupport ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                          {fromSupport ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{supportProfileName(message.author)}</p>
                          <p className="text-xs text-slate-500">{fromSupport ? 'Soporte Hernova' : 'Usuario del sistema'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {message.is_internal && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                            <LockKeyhole className="h-3.5 w-3.5" /> Nota interna
                          </span>
                        )}
                        {formatSupportDateTime(message.created_at)}
                      </div>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{message.body}</p>

                    {messageAttachments.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700">
                        {messageAttachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          >
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span>
                              <span className="block max-w-48 truncate font-semibold">{attachment.file_name}</span>
                              <span className="text-slate-400">{formatAttachmentSize(attachment.size_bytes)}</span>
                            </span>
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <form onSubmit={handleReply} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-950 dark:text-white">Responder</h2>
              {isPlatformAdmin && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(event) => setIsInternal(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Nota interna
                </label>
              )}
            </div>
            {closed ? (
              <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                Este ticket está cerrado. El Administrador Supremo debe reabrirlo para continuar la conversación.
              </p>
            ) : (
              <>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={5}
                  maxLength={10000}
                  placeholder={isInternal ? 'Esta nota solo será visible para Hernova Systems...' : 'Escribe tu respuesta...'}
                  className="mt-4 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />

                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900">
                        <span className="truncate text-slate-700 dark:text-slate-200">{file.name} · {formatAttachmentSize(file.size)}</span>
                        <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Quitar ${file.name}`}>
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(event) => handleFiles(event.target.files)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <Paperclip className="h-4 w-4" /> Adjuntar
                    </button>
                    <p className="mt-1 text-[11px] text-slate-400">PDF, PNG o JPG · máximo 10 MB · hasta 5 archivos</p>
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? 'Enviando...' : isInternal ? 'Guardar nota' : 'Enviar respuesta'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <aside className="space-y-5">
          {isPlatformAdmin && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                <h2 className="font-semibold text-slate-950 dark:text-white">Administración</h2>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Estado</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as SupportTicketStatus)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    {SUPPORT_TICKET_STATUSES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Prioridad</label>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as SupportTicketPriority)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    {SUPPORT_TICKET_PRIORITIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Responsable</label>
                  <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    <option value="">Sin asignar</option>
                    {platformAdmins.map((admin) => <option key={admin.id} value={admin.id}>{supportProfileName(admin)}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleManage()}
                  disabled={savingManagement}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {savingManagement ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
            <h2 className="font-semibold text-slate-950 dark:text-white">Información</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <InfoRow label="Solicitante" value={supportProfileName(creator)} />
              <InfoRow label="Correo" value={creator?.email || '—'} />
              <InfoRow label="Prioridad" value={ticket.priority} />
              <InfoRow label="Primera respuesta" value={formatSupportDateTime(ticket.first_response_at)} />
              <InfoRow label="Última actividad" value={formatSupportDateTime(ticket.last_activity_at)} />
              <InfoRow label="Responsable" value={supportProfileName(ticket.assignee, 'Sin asignar')} />
            </dl>
          </section>

          {isPlatformAdmin && ticket.source_path && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
              <h2 className="font-semibold text-slate-950 dark:text-white">Contexto técnico</h2>
              <p className="mt-3 break-all text-xs text-slate-500">{ticket.source_path}</p>
              {ticket.browser_info && <p className="mt-2 break-words text-[11px] text-slate-400">{ticket.browser_info}</p>}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
            <h2 className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
              <Clock3 className="h-4 w-4 text-slate-500" /> Historial
            </h2>
            <div className="mt-4 space-y-4">
              {events.slice(0, 12).map((event) => (
                <div key={event.id} className="border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{eventLabel(event)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {supportProfileName(event.actor)} · {formatSupportDateTime(event.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  )
}

function LifeBuoyEmpty() {
  return <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><MessageSquare className="h-6 w-6" /></div>
}
