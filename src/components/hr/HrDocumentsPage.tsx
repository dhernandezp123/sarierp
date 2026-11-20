'use client'
import { useCallback, useRef, useState } from 'react'
import { FileCheck2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, formatDateTime, toDateInputValue } from '@/src/lib/format'
import { canManageHr, canUseHrSelfService } from '@/src/lib/hr'
import { HR_DOCUMENT_MAX_BYTES, type HrCertificate, type HrSignedDocument } from '@/src/lib/hr-documents'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField } from '@/src/components/ui/form-field'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { HrNavigation, useReturnFocus, useScopedLoad } from './HrShared'

export function HrDocumentsPage() {
  const { user, profile, loading: userLoading } = useUser(), manager = canManageHr(profile), allowed = canUseHrSelfService(profile)
  const tenant = profile?.tenant_id || '', context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const [upload, setUpload] = useState<HrCertificate | null>(null)
  const loader = useCallback(async () => {
    const [certificates, documents] = await Promise.all([
      readAllReportRows<HrCertificate>((a, b) => supabase.from('hr_certificates').select('id,employee_id,request_id,kind,certificate_number,snapshot,created_at').eq('tenant_id', tenant).order('created_at', { ascending: false }).order('id').range(a, b), { label: 'constancias' }),
      readAllReportRows<HrSignedDocument>((a, b) => supabase.from('hr_signed_documents').select('id,certificate_id,version,file_name,mime_type,size_bytes,signed_on,sha256,created_at').eq('tenant_id', tenant).order('created_at', { ascending: false }).order('id').range(a, b), { label: 'documentos firmados' }),
    ])
    return { certificates, documents }
  }, [tenant])
  const { data, error, loading, reload } = useScopedLoad(context, allowed && !!tenant, loader)
  if (userLoading) return null
  if (!allowed) return <div className={cardClass}>Tu usuario no tiene acceso a documentos de RRHH.</div>
  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Constancias y documentos" icon={FileCheck2}
      description="Constancias emitidas al aprobar una ausencia, autorizar acumulación o suspenderla. Cada PDF conserva los datos del acto; las decisiones posteriores se consultan en las solicitudes." />
    <HrNavigation manager={manager} />
    {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
    {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando documentos…</p> : data && !error && (!data.certificates.length ? <div className={cardClass}><p className="text-sm text-slate-500">Sin constancias emitidas desde la activación de este módulo.</p></div>
      : <ul className="space-y-4">{data.certificates.map(c => {
        const versions = data.documents.filter(d => d.certificate_id === c.id).sort((a, b) => b.version - a.version)
        return <li key={c.id} className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">{c.certificate_number} · {c.kind}</h2><p className="text-sm">{c.snapshot.employee.employee_code} · {c.snapshot.employee.name}</p><p className="text-xs text-slate-500">Emitida {formatDateTime(c.created_at)}</p></div>
            <div className="flex flex-wrap gap-2"><a className={secondaryButtonClass} href={`/api/hr/certificates/${c.id}`} target="_blank" rel="noopener noreferrer">Descargar constancia PDF</a>
              {manager && <button type="button" className={primaryButtonClass} onClick={() => setUpload(c)}>Registrar firmado</button>}</div>
          </div>
          {!versions.length ? <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">Pendiente de documento firmado.{!manager && ' Entrega la constancia firmada a Administración para su registro.'}</p>
            : <ul className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">{versions.map(d => <li key={d.id} className="flex flex-wrap justify-between gap-2">
              <span>Versión {d.version} · firma registrada {formatDate(d.signed_on)} · {d.file_name}</span><a className="font-medium text-[#B3282D] hover:underline" href={`/api/hr/documents/${d.id}`} target="_blank" rel="noopener noreferrer">Abrir firmado</a>
            </li>)}</ul>}
        </li>
      })}</ul>)}
    {upload && manager && <SignedUploadDialog certificate={upload} onClose={() => setUpload(null)} onSaved={() => { setUpload(null); void reload() }} />}
  </div>
}

function SignedUploadDialog({ certificate, onClose, onSaved }: { certificate: HrCertificate; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null), [signedOn, setSignedOn] = useState(toDateInputValue()), [attested, setAttested] = useState(false), [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID()), returnFocus = useReturnFocus()
  const problem = !file ? 'Selecciona el documento firmado.' : file.size < 1 || file.size > HR_DOCUMENT_MAX_BYTES ? 'Archivo de hasta 10 MB.' : !signedOn || signedOn > toDateInputValue() ? 'Indica una fecha de firma válida, no futura.' : !attested ? 'Confirma que el archivo contiene las firmas correspondientes.' : ''
  async function save() {
    if (problem || !file || busy) return
    setBusy(true)
    const form = new FormData()
    form.set('file', file); form.set('certificate_id', certificate.id); form.set('request_id', requestId.current); form.set('signed_on', signedOn); form.set('attested', 'true')
    try {
      const response = await fetch('/api/hr/documents', { method: 'POST', body: form }), body = await response.json()
      if (!response.ok) throw new Error(body.error || 'No se pudo registrar el documento.')
      toast.success('Documento firmado registrado'); onSaved()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo registrar el documento. Puedes reintentar.') }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="grid-cols-1 sm:max-w-lg" onCloseAutoFocus={returnFocus}>
    <DialogTitle>Registrar documento firmado</DialogTitle><DialogDescription>{certificate.certificate_number} · {certificate.snapshot.employee.name}. Cada carga conserva una versión privada; el registro no verifica una firma electrónica.</DialogDescription>
    <div className="space-y-4">
      <FormField label="Archivo firmado" required hint="PDF, PNG o JPEG, hasta 10 MB."><input type="file" accept="application/pdf,image/png,image/jpeg" className={fieldClass} disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); requestId.current = crypto.randomUUID() }} /></FormField>
      <FormField label="Fecha de firma" required><input type="date" className={fieldClass} value={signedOn} max={toDateInputValue()} disabled={busy} onChange={e => { setSignedOn(e.target.value); requestId.current = crypto.randomUUID() }} /></FormField>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={attested} disabled={busy} onChange={e => setAttested(e.target.checked)} /><span>Confirmo que el archivo corresponde a esta constancia y contiene las firmas correspondientes.</span></label>
      {problem && <p className="text-sm text-slate-500">{problem}</p>}
    </div>
    <div className="flex justify-end gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Volver</button><button type="button" className={primaryButtonClass} disabled={busy || !!problem} onClick={() => void save()}>{busy ? 'Registrando…' : 'Guardar firmado'}</button></div>
  </DialogContent></Dialog>
}
