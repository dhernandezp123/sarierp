'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useUser } from '@/src/hooks/useUser'
import { mergeManualInvoicePage } from '@/src/lib/manual-invoice-history'
import { Download, Eye, FileScan, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { UnsavedChangesGuard } from '@/src/components/ui/UnsavedChangesGuard'
import { measureOperation } from '@/src/lib/browser/measurements'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import { cardClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { formatDateTime, formatMoney } from '@/src/lib/format'
import type { OcrProgress } from '@/src/lib/browser/manual-invoice-ocr'
import { blankManualInvoice, formatManualInvoiceDate, MANUAL_INVOICE_MAX_BYTES, MANUAL_INVOICE_MIMES, manualInvoiceCents, manualInvoiceFields,
  manualInvoiceFileName, manualInvoiceTotal, validateManualInvoice, type ManualInvoiceData, type ManualInvoiceDateOrder, type ManualInvoiceField, type SavedManualInvoice } from '@/src/lib/manual-invoice'

async function readResponse(response: Response) {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la solicitud.')
  return body
}

export function ManualInvoiceEditor() {
  const { user, profile } = useUser()
  const context = (profile?.tenant_id || '') + ':' + (user?.id || '')
  const historyVersion = useRef(0)
  const activeHistoryContext = useRef<string | null>(context)
  const historyRows = useRef<SavedManualInvoice[]>([])
  const historyQuery = useRef('')
  const [historySearch, setHistorySearch] = useState('')
  const [appliedHistorySearch, setAppliedHistorySearch] = useState('')
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [data, setData] = useState<ManualInvoiceData>(blankManualInvoice)
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [preview, setPreview] = useState<{ url: string; snapshot: string } | null>(null)
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({ message: '', percent: 0 })
  const [recognizedText, setRecognizedText] = useState('')
  const scanController = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState<'ocr' | 'save' | 'pdf' | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [sourceTotal, setSourceTotal] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState<SavedManualInvoice[]>([])
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [tab, setTab] = useState('editor')
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const snapshot = JSON.stringify(data)
  const total = manualInvoiceTotal(data)
  const sourceCents = manualInvoiceCents(sourceTotal)
  const totalMismatch = sourceCents !== null && sourceCents !== Math.round(total * 100)
  const previewCurrent = preview?.snapshot === snapshot

  const reloadHistory = useCallback(async (append = false, offset = 0, search = historyQuery.current) => {
    if (activeHistoryContext.current !== context) return
    const version = ++historyVersion.current
    setLoadingHistory(true)
    if (!append) historyQuery.current = search
    try {
      const params = new URLSearchParams({ offset: String(offset), pageSize: '25', search })
      const body = await readResponse(await fetch('/api/manual-invoices?' + params.toString(), { cache: 'no-store' }))
      if (historyVersion.current !== version || activeHistoryContext.current !== context) return
      const page = mergeManualInvoicePage(append ? historyRows.current : [], body, offset)
      historyRows.current = page.documents
      setHistory(page.documents)
      setHistoryTotal(page.total)
      setHistoryOffset(page.nextOffset)
      setHistoryHasMore(page.hasMore)
      setAppliedHistorySearch(search)
      setHistoryError('')
    } catch (error) {
      if (historyVersion.current === version) setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el historial.')
    } finally { if (historyVersion.current === version) setLoadingHistory(false) }
  }, [context])

  useEffect(() => {
    activeHistoryContext.current = context
    const timer = setTimeout(() => { void reloadHistory(false, 0, '') }, 0)
    return () => { clearTimeout(timer); activeHistoryContext.current = null; historyVersion.current += 1 }
  }, [reloadHistory, context])

  useEffect(() => () => { scanController.current?.abort() }, [])

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl) }, [sourceUrl])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  function change(next: ManualInvoiceData) {
    setData(next); setReviewed(false); setDirty(true)
  }
  function replaceDocument(action: () => void) {
    if (dirty) setPendingAction(() => action)
    else action()
  }
  function reset() {
    setData(blankManualInvoice()); setFile(null); setSourceUrl(''); setWarnings([]); setSourceTotal(''); setReviewed(false)
    setPreview(null); setSavedSnapshot(''); setDirty(false); setTab('editor')
    setRecognizedText(''); setOcrProgress({ message: '', percent: 0 })
    if (fileInput.current) fileInput.current.value = ''
  }
  function selectFile(selected: File | undefined) {
    if (!selected) return
    if (fileInput.current) fileInput.current.value = ''
    if (!MANUAL_INVOICE_MIMES.includes(selected.type) || selected.size <= 0 || selected.size > MANUAL_INVOICE_MAX_BYTES) {
      toast.error('Selecciona un PDF, JPG, PNG o WEBP de hasta 3 MB.'); return
    }
    replaceDocument(() => { reset(); setData({ ...blankManualInvoice(), date_format: data.date_format }); setFile(selected); setSourceUrl(URL.createObjectURL(selected)) })
  }
  async function scan() {
    if (!file || busy) return
    const controller = new AbortController()
    scanController.current = controller
    setBusy('ocr')
    setOcrProgress({ message: 'Preparando lectura…', percent: 0 })
    try {
      const { readInvoiceInBrowser } = await import('@/src/lib/browser/manual-invoice-ocr')
      if (controller.signal.aborted) return
      const body = await readInvoiceInBrowser(file, data.date_format, setOcrProgress, controller.signal)
      if (controller.signal.aborted) return
      const extracted = validateManualInvoice(body.data, false)
      setRecognizedText(body.text); setWarnings(body.warnings)
      if (!extracted.invoice_number && !extracted.bill_to_name && !extracted.items.length) throw new Error('No se identificó una factura legible. Prueba otra foto o completa los campos manualmente.')
      change({ ...extracted, items: extracted.items.length ? extracted.items : [{ description: '', amount: '' }] })
      setWarnings(body.warnings); setSourceTotal(body.source_total); setPreview(null); setSavedSnapshot('')
      toast.success('Lectura lista. Revisa los campos amarillos antes de generar el PDF.')
    } catch (error) {
      if (controller.signal.aborted) toast.info('Lectura cancelada. Tus campos se conservaron.')
      else toast.error(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
    }
    finally { if (scanController.current === controller) { scanController.current = null; setBusy(null) } }
  }
  async function save() {
    if (busy) return
    setBusy('save')
    try {
      const checked = validateManualInvoice(data)
      const body = await readResponse(await fetch('/api/manual-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checked) }))
      if (!body.document?.id) throw new Error('No se pudo confirmar el documento guardado.')
      setSavedSnapshot(snapshot); setDirty(false)
      toast.success('Factura guardada como documento independiente.')
      await reloadHistory()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar la factura.') }
    finally { setBusy(null) }
  }
  async function makePdf(download = false) {
    if (busy) return
    // Reserve the tab during the click, before asynchronous PDF generation.
    const pdfWindow = download ? null : window.open('about:blank', '_blank')
    if (!download && !pdfWindow) { toast.error('El navegador bloqueó la pestaña. Permite las ventanas emergentes o usa Descargar PDF.'); return }
    if (pdfWindow) pdfWindow.opener = null
    setBusy('pdf')
    try {
      const checked = validateManualInvoice(data)
      let url = previewCurrent && preview ? preview.url : ''
      if (!url) {
        const blob = await measureOperation('manual_invoice_pdf', async () => {
          const { createManualInvoiceBlob } = await import('@/src/components/pdf/manual-invoice-pdf')
          return createManualInvoiceBlob(checked)
        })
        url = URL.createObjectURL(blob)
        setPreview({ url, snapshot })
      }
      if (pdfWindow && !pdfWindow.closed) pdfWindow.location.replace(url)
      if (download) {
        const link = document.createElement('a'); link.href = url; link.download = manualInvoiceFileName(checked)
        document.body.appendChild(link); link.click(); link.remove()
      }
    } catch (error) { pdfWindow?.close(); toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF.') }
    finally { setBusy(null) }
  }
  function openSaved(document: SavedManualInvoice) {
    replaceDocument(() => {
      try {
        const loaded = validateManualInvoice(document.data)
        reset(); setData(loaded); setSavedSnapshot(JSON.stringify(loaded)); setReviewed(false)
        toast.success('Documento abierto. Los cambios se guardarán como una nueva versión.')
      } catch { toast.error('El documento guardado contiene datos no válidos.') }
    })
  }
  const field = (key: ManualInvoiceField) => {
    const definition = manualInvoiceFields.find(([name]) => name === key)!
    const isDate = key === 'issue_date' || key === 'due_date'
    return <label key={key} className="block space-y-1 text-sm font-medium">
      <span>{definition[1]}</span>
      <input type={isDate ? 'date' : 'text'} value={data[key]} maxLength={definition[2]} disabled={Boolean(busy)}
        onChange={(event) => change({ ...data, [key]: event.target.value })}
        className={`${fieldClassSm} !border-amber-300 !bg-amber-50 dark:!border-amber-700 dark:!bg-amber-950/30`} />
      {isDate && data[key] && <span className="block text-xs text-slate-500">En el PDF: {formatManualInvoiceDate(data[key], data.date_format)}</span>}
    </label>
  }
  const section = (title: string, fields: ManualInvoiceField[]) => <fieldset className={cardClass}>
    <legend className="px-2 font-semibold">{title}</legend><div className="grid gap-3 sm:grid-cols-2">{fields.map(field)}</div>
  </fieldset>

  return <div className="mx-auto max-w-7xl space-y-6 p-4 text-slate-900 dark:text-slate-100 sm:p-6">
    <UnsavedChangesGuard dirty={dirty} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><FileScan aria-hidden="true" /> Scanner / Generador de factura manual</h1>
        <p className="mt-1 text-sm text-slate-500">SARI USA · Documentos independientes · PDF con el formato de la plantilla</p></div>
      <button className={secondaryButtonClass} disabled={Boolean(busy)} onClick={() => replaceDocument(reset)}>Nueva factura</button>
    </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList><TabsTrigger value="editor">Scanner y edición</TabsTrigger><TabsTrigger value="history">Historial</TabsTrigger></TabsList>
      <TabsContent value="history">
        <div className={cardClass}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Versiones guardadas. Al editar se conserva el documento anterior.</p>
          <button onClick={() => void reloadHistory()} disabled={loadingHistory || Boolean(busy)} className={secondaryButtonClass}>Actualizar</button></div>
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void reloadHistory(false, 0, historySearch.trim()) }}>
            <label className="flex-1 text-sm">Buscar factura o cliente<input value={historySearch} maxLength={120} onChange={event => setHistorySearch(event.target.value)} className={fieldClassSm} /></label>
            <button type="submit" disabled={loadingHistory || Boolean(busy)} className={secondaryButtonClass}>Buscar</button>
          </form>
          {!loadingHistory && !historyError && <p className="mb-3 text-sm text-slate-500">Mostrando {history.length} de {historyTotal} versiones.</p>}
          {loadingHistory ? <p role="status">Cargando historial…</p> : historyError ? <p role="alert" className="text-red-600">{historyError}</p> : history.length ?
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Factura</th><th className="p-3">Cliente</th><th className="p-3">Total</th><th className="p-3">Guardada</th><th className="p-3">Documento</th></tr></thead>
              <tbody>{history.map((document) => <tr key={document.id} className="border-b border-slate-200 dark:border-slate-800"><td className="p-3">{document.invoice_number}</td><td className="p-3">{document.client_name}</td><td className="whitespace-nowrap p-3">{formatMoney(document.total, 'USD')}</td><td className="whitespace-nowrap p-3">{formatDateTime(document.created_at)}</td><td className="p-3"><button className={secondaryButtonClass} disabled={Boolean(busy)} onClick={() => openSaved(document)}>Abrir</button></td></tr>)}</tbody></table></div>
            : <p className="text-sm text-slate-500">{appliedHistorySearch ? 'No hay versiones que coincidan con la busqueda.' : 'Todavía no hay facturas guardadas.'}</p>}
          {!historyError && historyHasMore && <button type="button" disabled={loadingHistory || Boolean(busy)} onClick={() => void reloadHistory(true, historyOffset)} className={secondaryButtonClass}>Cargar mas versiones</button>}
        </div>
      </TabsContent>
      <TabsContent value="editor" className="space-y-6">
        <div className={cardClass}>
          <h2 className="mb-2 font-semibold">1. Carga un documento o completa la factura manualmente</h2>
          <p className="mb-4 text-sm text-slate-500">PDF o foto (JPG, PNG, WEBP), hasta 3 MB y 5 páginas de una sola factura. El original se usa para comparar y no se guarda en el historial.</p>
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 space-y-1 text-sm font-medium"><span className="block">Factura original</span>
            <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={Boolean(busy)} className={`${fieldClassSm} h-auto py-2`} onChange={(event) => selectFile(event.target.files?.[0])} /></label>
            <label className="space-y-1 text-sm font-medium"><span className="block">Formato de fechas (OCR y PDF)</span><select value={data.date_format} disabled={Boolean(busy)} onChange={(event) => change({ ...data, date_format: event.target.value as ManualInvoiceDateOrder })} className={fieldClassSm}>
              <option value="mdy">MM/DD/YYYY · SARI USA</option><option value="dmy">DD/MM/YYYY</option>
            </select></label>
            <button className={`${primaryButtonClass} flex items-center gap-2`} disabled={!file || Boolean(busy)} onClick={() => dirty ? setPendingAction(() => () => { void scan() }) : void scan()}>
              {busy === 'ocr' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileScan className="h-4 w-4" />} {busy === 'ocr' ? 'Leyendo…' : 'Leer con OCR'}</button>
            {busy === 'ocr' && <button className={secondaryButtonClass} onClick={() => scanController.current?.abort()}>Cancelar lectura</button>}
          </div>
          <p className="mt-2 text-sm text-slate-500">El formato se guarda con la factura y se aplica al PDF. Cambiarlo conserva las fechas ingresadas; para reinterpretar el original, vuelve a leerlo con OCR.</p>
          {file && <p className="mt-2 break-all text-sm">Archivo cargado: {file.name}</p>}
          {busy === 'ocr' && <div className="mt-3 space-y-1"><p role="status" className="text-sm">{ocrProgress.message} {ocrProgress.percent}%</p><progress aria-label="Progreso de lectura" className="h-2 w-full" max={100} value={ocrProgress.percent} /></div>}
        </div>
        {warnings.length > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Observaciones de la lectura</p><ul className="mt-2 list-inside list-disc">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
        {recognizedText && <details className={cardClass}><summary className="cursor-pointer font-semibold">Ver texto reconocido</summary><label className="mt-3 block space-y-1 text-sm"><span>Texto de apoyo para completar datos que no se ubicaron</span><textarea readOnly rows={8} value={recognizedText} className={`${fieldClassSm} h-auto py-2`} /></label></details>}
        <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className="space-y-4"><h2 className="font-semibold">2. Revisa y edita los campos amarillos</h2>
            {section('Factura', ['invoice_number', 'issue_date', 'due_date', 'file_number', 'customer_reference'])}
            {section('Bill to', ['bill_to_name', 'bill_to_address', 'bill_to_city'])}
            {section('Embarque', ['shipper', 'consignee', 'carrier', 'goods_description', 'hbl', 'mbl', 'origin', 'destination', 'charges_term', 'pieces', 'weight_lb'])}
            {section('Referencias', ['booking_number', 'container_size', 'container_number', 'consol_number'])}
            <div className={cardClass}><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Description of Charges</h3><button aria-label="Agregar cargo" className={secondaryButtonClass} disabled={Boolean(busy) || data.items.length >= 100} onClick={() => change({ ...data, items: [...data.items, { description: '', amount: '' }] })}><Plus size={16} /></button></div>
              <div className="space-y-3">{data.items.map((item, index) => <div key={index} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] flex-1 space-y-1 text-sm"><span>Descripción {index + 1}</span><input value={item.description} maxLength={180} disabled={Boolean(busy)} className={`${fieldClassSm} !bg-amber-50 dark:!bg-amber-950/30`} onChange={(event) => change({ ...data, items: data.items.map((line, n) => n === index ? { ...line, description: event.target.value } : line) })} /></label>
                <label className="w-32 space-y-1 text-sm"><span>Importe USD</span><input inputMode="decimal" value={item.amount} disabled={Boolean(busy)} maxLength={20} placeholder="3,300.00" className={`${fieldClassSm} !bg-amber-50 dark:!bg-amber-950/30`} onChange={(event) => change({ ...data, items: data.items.map((line, n) => n === index ? { ...line, amount: event.target.value } : line) })} /></label>
                <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Eliminar cargo ${index + 1}`} disabled={Boolean(busy) || data.items.length === 1} onClick={() => change({ ...data, items: data.items.filter((_, n) => n !== index) })}><Trash2 size={18} /></button>
              </div>)}</div>
              <label className="mt-4 block space-y-1 text-sm"><span>Warehouse Receipts (un WR por línea, sin el prefijo WR #)</span><textarea rows={5} disabled={Boolean(busy)} className={`${fieldClassSm} h-auto py-2 !bg-amber-50 dark:!bg-amber-950/30`} value={data.warehouse_receipts.join('\n')} onChange={(event) => change({ ...data, warehouse_receipts: event.target.value.split('\n') })} /></label>
              <p className="mt-4 text-right text-lg font-bold">Total Amount: {formatMoney(total, 'USD')}</p>
              {sourceTotal && <p className="mt-2 text-right text-sm">Total leído del original: {sourceCents === null ? 'No interpretable; revisar original' : formatMoney(sourceCents / 100, 'USD')}</p>}
              {totalMismatch && <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-300">El total de los cargos difiere del original. Revisa los importes o confirma que el cambio es intencional.</p>}
            </div>
            <div className={cardClass}><h2 className="font-semibold">3. Guarda o genera el PDF</h2>
              <label className="my-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} disabled={Boolean(busy)} onChange={(event) => setReviewed(event.target.checked)} /><span>Revisé los campos, los cargos y el total de esta factura.</span></label>
              <div className="flex flex-wrap gap-2"><button className={`${primaryButtonClass} flex items-center gap-2`} disabled={!reviewed || Boolean(busy) || savedSnapshot === snapshot} onClick={save}><Save size={16} />{busy === 'save' ? 'Guardando…' : savedSnapshot === snapshot ? 'Guardada' : 'Guardar documento'}</button>
                <button className={`${secondaryButtonClass} flex items-center gap-2`} disabled={!reviewed || Boolean(busy)} onClick={() => makePdf()}><Eye size={16} />Visualizar PDF</button>
                <button className={`${secondaryButtonClass} flex items-center gap-2`} disabled={!reviewed || Boolean(busy)} onClick={() => makePdf(true)}><Download size={16} />Descargar PDF</button></div>
              {busy === 'pdf' && <p role="status" className="mt-2 text-sm">Generando PDF…</p>}
            </div>
          </div>
          <div className="space-y-4 xl:sticky xl:top-4">
            {file && sourceUrl && <div className={cardClass}><h2 className="mb-3 font-semibold">Documento original</h2>
              {file.type === 'application/pdf' ? <iframe title="Factura original" src={sourceUrl} className="h-[550px] w-full rounded-lg bg-slate-100" />
                : <a href={sourceUrl} target="_blank" rel="noreferrer"><Image unoptimized width={800} height={1100} src={sourceUrl} alt="Factura original cargada para comparar" className="max-h-[600px] w-full rounded-lg object-contain" /></a>}
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-600 underline">Abrir original</a>
            </div>}
            <div className={cardClass}><h2 className="mb-3 font-semibold">PDF generado</h2>
              {preview && previewCurrent ? <><iframe title="PDF generado de SARI USA" src={preview.url} className="h-[650px] w-full rounded-lg bg-slate-100" /><a href={preview.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-600 underline">Abrir PDF</a></>
                : <p className="text-sm text-slate-500">{preview ? 'Los datos cambiaron. Genera una nueva vista previa.' : 'Completa y revisa los campos, luego selecciona Visualizar PDF para abrirlo en otra pestaña. El PDF conserva la plantilla sin resaltados amarillos.'}</p>}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
    <ConfirmDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) setPendingAction(null) }} title="Reemplazar los datos actuales" description="Hay cambios sin guardar. Esta acción reemplazará los campos del documento actual." confirmLabel="Reemplazar" onConfirm={() => pendingAction?.()} />
  </div>
}
