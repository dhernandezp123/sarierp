'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PortalConfirmation } from '@/src/components/portal/PortalConfirmation'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { reportMiamiIncident, MIAMI_INCIDENT_TYPES, INCIDENT_DESCRIPTION_LIMIT } from '@/src/lib/miami-incidents'

type PackageOption = {
  id: string
  tracking_number: string
  warehouse_number: string | null
  carrier: string | null
  status: string
}

const TIPOS = MIAMI_INCIDENT_TYPES

export default function NuevaIncidenciaPage() {
  const { user, profile, loading: userLoading } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('packageId')

  const clientId = profile?.cliente_id || ''
  const tenantId = profile?.tenant_id || ''
  const canReport = !!user && profile?.id === user.id && profile.rol === 'Cliente'
    && profile.status === 'Aprobado' && profile.is_active === true && !profile.is_platform_admin && !!clientId && !!tenantId
  const context = `${tenantId}:${user?.id || ''}:${clientId}:${canReport}`
  const version = useRef(0)
  const submitting = useRef(false)
  const [loadedContext, setLoadedContext] = useState('')
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [selectedPkg, setSelectedPkg] = useState<PackageOption | null>(null)
  const [tipo, setTipo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [confirmation, setConfirmation] = useState<{ context: string; tracking: string } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPackages = useCallback(async () => {
    const request = ++version.current
    const isCurrent = () => request === version.current
    if (userLoading || !canReport) return
    setLoadError(false)
    setLoading(true)
    try {
      const pkgs = await readAllReportRows<PackageOption>((from, to) => supabase.from('miami_packages')
        .select('id, tracking_number, warehouse_number, carrier, status')
        .eq('tenant_id', tenantId).eq('cliente_id', clientId).in('status', ['Asignado', 'Con incidencia'])
        .neq('cargo_status', 'Entregado').order('received_at', { ascending: false }).order('id').range(from, to),
      { label: 'paquetes disponibles', isCurrent })
      if (!isCurrent()) return
      setPackages(pkgs)
      setSelectedPkg(previous => pkgs.find(pkg => pkg.id === (previous?.id || preselectedId)) || null)
      setLoadedContext(context)
    } catch {
      if (isCurrent()) { setLoadError(true); setLoadedContext(context) }
    } finally { if (isCurrent()) setLoading(false) }
  }, [canReport, clientId, context, preselectedId, tenantId, userLoading])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPackages([]); setSelectedPkg(null); setTipo(''); setDescripcion('')
      setConfirmation(null); setSubmitError(''); setSaving(false)
      void loadPackages()
    }, 0)
    return () => { clearTimeout(timer); version.current += 1 }
  }, [loadPackages])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current || saving || !canReport || loadedContext !== context) return
    if (!selectedPkg || !tipo || !descripcion.trim()) { toast.error('Completa el paquete, tipo y descripción.'); return }
    submitting.current = true
    const request = version.current
    const isCurrent = () => request === version.current
    setSaving(true)
    setSubmitError('')
    try {
      const result = await reportMiamiIncident(supabase, { packageId: selectedPkg.id, tipo, descripcion },
        { userId: user!.id, tenantId, clientId }, isCurrent)
      if (!isCurrent()) return
      toast.success(result.already_applied ? 'El reporte ya estaba registrado' : 'Incidencia registrada')
      setConfirmation({ context, tracking: result.tracking_number })
    } catch (error) {
      if (isCurrent()) {
        const message = error instanceof Error ? error.message : 'No se confirmó el reporte. Consulta Incidencias antes de reintentar.'
        setSubmitError(message)
        toast.error(message)
      }
    } finally {
      submitting.current = false
      if (isCurrent()) setSaving(false)
    }
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  if (userLoading || !canReport) return <p role="status" className="p-6 text-sm">Preparando tu portal...</p>
  if (loadedContext !== context || loading) return <p role="status" className="p-6 text-sm">Cargando paquetes...</p>
  if (confirmation?.context === context) return <PortalConfirmation title="Incidencia registrada" description="Puedes consultar el estado y la respuesta del equipo en Incidencias. Conserva el tracking para cualquier consulta." reference={confirmation.tracking} href="/portal/incidencias" />
  if (loadError) return <PortalError onRetry={() => void loadPackages()} />
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver" onClick={() => router.push('/portal/incidencias')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reportar Problema</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Cuéntanos qué pasó con tu paquete</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && <p role="alert" className="rounded-xl border border-amber-300 p-3 text-sm">{submitError} <Link href="/portal/incidencias" className="font-semibold underline">Consultar Incidencias</Link></p>}
        <fieldset disabled={saving} className="space-y-4">
        {/* Package selector */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            ¿Con cuál paquete tienes el problema? <span className="text-red-500">*</span>
          </label>

          <select id="incident-package" aria-label="Paquete relacionado" value={selectedPkg?.id || ''} onChange={event => setSelectedPkg(packages.find(pkg => pkg.id === event.target.value) || null)} required disabled={loading} className={fieldClass}><option value="">{loading ? 'Cargando paquetes…' : 'Selecciona un paquete'}</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.tracking_number} · {pkg.warehouse_number || pkg.carrier}</option>)}</select><Link href="/portal/contacto" className="mt-3 block text-xs font-semibold text-blue-600 dark:text-blue-400">¿El paquete ya fue entregado o no aparece? Contactar al equipo</Link>
        </div>

        {/* Tipo de problema */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            ¿Qué tipo de problema es? <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS.map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={tipo === t}
                onClick={() => setTipo(t)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${
                  tipo === t
                    ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                <AlertTriangle className={`h-4 w-4 shrink-0 ${tipo === t ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            Describe el problema con detalle <span className="text-red-500">*</span>
          </label>
          <textarea aria-label="Descripción del problema" maxLength={INCIDENT_DESCRIPTION_LIMIT}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={4}
            placeholder="Ej: El paquete llegó con el exterior golpeado, la caja estaba abierta y faltaban 2 artículos..."
            required
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
          />
          <p className="mt-2 text-xs text-slate-400">Mientras más detalles des, más rápido podemos ayudarte.</p>
        </div>

        <Link href="/portal/contacto" className="block text-sm font-semibold text-blue-600 dark:text-blue-400">Canales para enviar fotos al equipo</Link>
        {/* Note about photos */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Si tienes fotos del problema, puedes enviarlas directamente a tu agente de carga por WhatsApp o correo electrónico junto con el número de tracking.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            aria-label="Volver" onClick={() => router.push('/portal/incidencias')}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !selectedPkg || !tipo || !descripcion.trim() || descripcion.trim().length > INCIDENT_DESCRIPTION_LIMIT}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Enviando...' : 'Reportar problema'}
          </button>
        </div>
        </fieldset>
      </form>
    </div>
  )
}
