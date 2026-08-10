'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ExternalLink,
  FileText,
  FileUp,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { formatMiamiDateTime } from '@/src/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

type PackageDetail = {
  id: string
  tracking_number: string
  carrier: string | null
  warehouse_number: string | null
  weight_lbs: number | null
  weight_kg: number | null
  length_in: number | null
  width_in: number | null
  height_in: number | null
  ft3: number | null
  cbm: number | null
  description: string | null
  photos: string[] | null
  status: string
  tipo_carga: string | null
  cargo_status: string | null
  cargo_status_updated_at: string | null
  received_at: string
  assigned_at: string | null
  notes: string | null
}

type Incidencia = {
  id: string
  tipo: string
  descripcion: string | null
  status: string
  resolucion: string | null
  created_at: string
}

type PackageEvent = {
  id: string
  event_type: string
  old_status: string | null
  new_status: string | null
  notes: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

type PackageDocument = {
  id: string
  document_type: string
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  status: 'Recibida' | 'Requiere corrección' | 'Reemplazada'
  review_notes: string | null
  created_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CARGO_STEPS = [
  'Recibido en Miami',
  'En Consolidación',
  'En Tránsito',
  'Llegado Honduras',
  'Entregado',
] as const

type CargoStep = typeof CARGO_STEPS[number]

const CARGO_STEP_LABELS: Record<CargoStep, string> = {
  'Recibido en Miami':  'Recibido en Miami',
  'En Consolidación':   'En Consolidación',
  'En Tránsito':        'En Tránsito a Honduras',
  'Llegado Honduras':   'Llegado a Honduras',
  'Entregado':          'Entregado',
}

const statusConfig: Record<string, { label: string; color: string }> = {
  'Sin asignar':    { label: 'Pendiente de asignar', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  'Asignado':       { label: 'En bodega Miami',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  'Entregado':      { label: 'Entregado',             color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'Con incidencia': { label: 'Con incidencia',        color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

const TIPO_CARGA_COLOR: Record<string, string> = {
  'Paquetería':         'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'LCL':                'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Aéreo Consolidado':  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

const PACKAGE_DOCUMENT_BUCKET = 'miami-package-documents'
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalPaqueteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { profile } = useUser()
  const [pkg, setPkg] = useState<PackageDetail | null>(null)
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [events, setEvents] = useState<PackageEvent[]>([])
  const [documents, setDocuments] = useState<PackageDocument[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadInputKey, setUploadInputKey] = useState(0)

  const loadData = async (clientId: string) => {
    setLoading(true)
    const [
      { data: pkgData, error },
      { data: incData },
      { data: eventData },
      { data: documentData },
    ] = await Promise.all([
      supabase
        .from('miami_packages')
        .select('*')
        .eq('id', id)
        .eq('cliente_id', clientId)
        .single(),
      supabase
        .from('miami_incidencias')
        .select('id, tipo, descripcion, status, resolucion, created_at')
        .eq('package_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('miami_package_events')
        .select('id, event_type, old_status, new_status, notes, created_at, metadata')
        .eq('package_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('miami_package_documents')
        .select('id, document_type, file_name, file_path, mime_type, file_size, status, review_notes, created_at')
        .eq('package_id', id)
        .order('created_at', { ascending: false }),
    ])

    if (error || !pkgData) {
      toast.error('Paquete no encontrado')
      router.replace('/portal/paquetes')
      return
    }

    setPkg(pkgData as PackageDetail)
    setIncidencias((incData ?? []) as Incidencia[])
    setEvents((eventData ?? []) as PackageEvent[])
    setDocuments((documentData ?? []) as PackageDocument[])

    // Generate signed URLs for photos
    if (pkgData.photos && pkgData.photos.length > 0) {
      const urls = await Promise.all(
        pkgData.photos.map(async (path: string) => {
          const { data } = await supabase.storage
            .from('miami-package-photos')
            .createSignedUrl(path, 3600)
          return data?.signedUrl ?? ''
        })
      )
      setPhotoUrls(urls.filter(Boolean))
    }

    setLoading(false)
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadData(clientId), 0)
    return () => window.clearTimeout(timeout)
  }, [id, profile?.cliente_id])

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get('section')
    const shouldFocusCommercialInvoice = requestedSection === 'factura-comercial'
      || window.location.hash === '#factura-comercial'

    if (loading || !shouldFocusCommercialInvoice) return
    document.getElementById('factura-comercial')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [loading])

  const openDocument = async (document: PackageDocument) => {
    const { data, error } = await supabase.storage
      .from(PACKAGE_DOCUMENT_BUCKET)
      .createSignedUrl(document.file_path, 60)

    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir la factura comercial')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const uploadCommercialInvoice = async () => {
    if (!pkg || !profile?.id || !profile.cliente_id || !selectedFile) return

    if (!ALLOWED_DOCUMENT_TYPES.has(selectedFile.type)) {
      toast.error('Adjunta un archivo PDF, JPG o PNG')
      return
    }

    if (selectedFile.size <= 0 || selectedFile.size > MAX_DOCUMENT_SIZE) {
      toast.error('El archivo debe pesar como máximo 10 MB')
      return
    }

    setUploading(true)
    const extension = selectedFile.type === 'application/pdf'
      ? 'pdf'
      : selectedFile.type === 'image/png'
        ? 'png'
        : 'jpg'
    const filePath = `${profile.cliente_id}/${pkg.id}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(PACKAGE_DOCUMENT_BUCKET)
      .upload(filePath, selectedFile, {
        contentType: selectedFile.type,
        upsert: false,
      })

    if (uploadError) {
      setUploading(false)
      toast.error('No se pudo subir la factura comercial', {
        description: uploadError.message,
      })
      return
    }

    const { error: documentError } = await supabase
      .from('miami_package_documents')
      .insert({
        package_id: pkg.id,
        document_type: 'Commercial Invoice',
        file_name: selectedFile.name,
        file_path: filePath,
        mime_type: selectedFile.type,
        file_size: selectedFile.size,
        status: 'Recibida',
        uploaded_by: profile.id,
      })

    if (documentError) {
      await supabase.storage.from(PACKAGE_DOCUMENT_BUCKET).remove([filePath])
      setUploading(false)
      toast.error('El archivo subió, pero no pudo registrarse', {
        description: documentError.message,
      })
      return
    }

    setSelectedFile(null)
    setUploadInputKey((value) => value + 1)
    await loadData(profile.cliente_id)
    setUploading(false)
    toast.success('Factura comercial recibida')
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
    </div>
  )

  if (!pkg) return null

  const cfg = statusConfig[pkg.status] ?? { label: pkg.status, color: 'bg-slate-100 text-slate-600' }
  const hasDims = pkg.length_in && pkg.width_in && pkg.height_in
  const tipoCargaColor = TIPO_CARGA_COLOR[pkg.tipo_carga ?? ''] ?? TIPO_CARGA_COLOR['Paquetería']
  const currentStepIdx = pkg.cargo_status
    ? CARGO_STEPS.indexOf(pkg.cargo_status as CargoStep)
    : -1

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate font-mono text-lg font-semibold text-slate-900 dark:text-white">{pkg.tracking_number}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
            {pkg.warehouse_number && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {pkg.warehouse_number}
              </span>
            )}
            {pkg.tipo_carga && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tipoCargaColor}`}>
                {pkg.tipo_carga}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cargo status timeline */}
      {currentStepIdx >= 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Seguimiento del envío
          </h2>
          <div className="relative">
            <div className="absolute left-[9px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-700" />
            <ol className="space-y-5">
              {CARGO_STEPS.map((step, idx) => {
                const done    = idx <= currentStepIdx
                const current = idx === currentStepIdx

                let dateLabel: string | null = null
                if (idx === 0) dateLabel = formatMiamiDateTime(pkg.received_at)
                else if (current && pkg.cargo_status_updated_at) dateLabel = formatMiamiDateTime(pkg.cargo_status_updated_at)

                return (
                  <li key={step} className="relative flex items-start gap-4 pl-7">
                    <span className="absolute left-0 top-0.5 z-10 bg-white dark:bg-slate-900">
                      {done ? (
                        <CheckCircle2 className={`h-[18px] w-[18px] ${current ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-500'}`} />
                      ) : (
                        <Circle className="h-[18px] w-[18px] text-slate-300 dark:text-slate-600" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-tight ${
                        done
                          ? current
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}>
                        {CARGO_STEP_LABELS[step]}
                        {current && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            ACTUAL
                          </span>
                        )}
                      </p>
                      {dateLabel && (
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{dateLabel}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Historial de movimientos
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((event) => {
              const shipmentNumber =
                typeof event.metadata?.shipment_number === 'string'
                  ? event.metadata.shipment_number
                  : null
              return (
                <div key={event.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {event.new_status || event.event_type}
                      </p>
                      {event.old_status && event.new_status && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {event.old_status} &gt; {event.new_status}
                        </p>
                      )}
                      {shipmentNumber && (
                        <p className="mt-0.5 font-mono text-xs text-blue-600 dark:text-blue-300">
                          {shipmentNumber}
                        </p>
                      )}
                      {event.notes && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.notes}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {formatMiamiDateTime(event.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Información del paquete</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <InfoRow label={pkg.tipo_carga === 'Aéreo Consolidado' ? 'AWB / Carrier' : 'Carrier'} value={pkg.carrier ?? '—'} />
          <InfoRow label="Recibido" value={formatMiamiDateTime(pkg.received_at)} />
          <InfoRow label="Peso" value={pkg.weight_lbs ? `${pkg.weight_lbs} lbs${pkg.weight_kg ? ` / ${pkg.weight_kg} kg` : ''}` : '—'} />
          <InfoRow label="Descripción" value={pkg.description ?? '—'} />
          {hasDims && (
            <>
              <InfoRow label="Dimensiones" value={`${pkg.length_in}" × ${pkg.width_in}" × ${pkg.height_in}"`} />
              <InfoRow label="Volumen" value={pkg.ft3 ? `${pkg.ft3.toFixed(3)} FT³ / ${pkg.cbm?.toFixed(4)} CBM` : '—'} />
            </>
          )}
          {pkg.assigned_at && (
            <InfoRow label="Asignado" value={formatMiamiDateTime(pkg.assigned_at)} />
          )}
        </div>
      </div>

      <div
        id="factura-comercial"
        className="rounded-2xl border border-slate-200 bg-white p-5 transition target:border-blue-400 target:ring-4 target:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:target:border-blue-500 dark:target:ring-blue-950/50"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900 dark:text-white">Factura comercial</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Adjunta la factura de tu compra para evitar retrasos durante la consolidación y el tránsito.
            </p>
          </div>
          {documents.length > 0 && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Recibida
            </span>
          )}
        </div>

        {documents.length > 0 && (
          <div className="mt-4 space-y-2">
            {documents.map((document, index) => (
              <div
                key={document.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {document.file_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {index === 0 ? 'Versión más reciente · ' : ''}{formatMiamiDateTime(document.created_at)}
                  </p>
                  {document.status === 'Requiere corrección' && document.review_notes && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Corrección solicitada: {document.review_notes}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openDocument(document)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Ver
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {documents.length > 0 ? 'Adjuntar una nueva versión' : 'Adjuntar documento'}
          </label>
          <input
            key={uploadInputKey}
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            disabled={uploading}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">PDF, JPG o PNG · máximo 10 MB.</p>
            <button
              type="button"
              onClick={uploadCommercialInvoice}
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Subiendo...' : 'Subir factura'}
            </button>
          </div>
        </div>
      </div>

      {/* Photos */}
      {photoUrls.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Fotos ({photoUrls.length})
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <ExternalLink className="h-5 w-5 text-white" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Incidencias */}
      {incidencias.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-white dark:border-red-900/40 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-red-100 px-5 py-4 dark:border-red-900/20">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Incidencias reportadas</h2>
          </div>
          <div className="divide-y divide-red-50 dark:divide-red-900/10">
            {incidencias.map(inc => (
              <div key={inc.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{inc.tipo}</p>
                    {inc.descripcion && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{inc.descripcion}</p>}
                    {inc.resolucion && (
                      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Resolución:</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">{inc.resolucion}</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <IncStatusBadge status={inc.status} />
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(inc.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report incident CTA */}
      {pkg.status !== 'Entregado' && incidencias.filter(i => i.status === 'Abierta' || i.status === 'En revisión').length === 0 && (
        <button
          type="button"
          onClick={() => router.push(`/portal/incidencias/nueva?packageId=${pkg.id}`)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Reportar problema con este paquete
        </button>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  )
}

function IncStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'Abierta':     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    'En revisión': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'Resuelta':    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    'Cerrada':     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[status] ?? colors['Cerrada']}`}>
      {status}
    </span>
  )
}
