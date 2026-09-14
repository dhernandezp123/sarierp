'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { useRouter } from 'next/navigation'
import { MapPin, Copy, CheckCircle2, ChevronLeft, Info } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type MiamiAddress = {
  consignee: string
  address_line: string
  suite_prefix: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
}

export default function DireccionMiamiPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [address, setAddress] = useState<MiamiAddress | null>(null)
  const [codigoCliente, setCodigoCliente] = useState<string | null>(null)
  const [clienteNombre, setClienteNombre] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)



  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
    const [settingsResult, clienteResult] = await Promise.all([
      supabase
        .from('company_settings')
        .select('miami_consignee, miami_address_line, miami_suite_prefix, miami_city, miami_state, miami_zip, miami_country, miami_phone')
        .limit(1)
        .maybeSingle(),
      profile?.cliente_id
        ? supabase
            .from('clientes')
            .select('codigo_cliente, nombre')
            .eq('id', profile.cliente_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (settingsResult.error || clienteResult.error) throw settingsResult.error || clienteResult.error
    if (settingsResult.data) {
      const d = settingsResult.data
      setAddress({
        consignee:    d.miami_consignee    ?? '',
        address_line: d.miami_address_line ?? '',
        suite_prefix: d.miami_suite_prefix ?? '',
        city:         d.miami_city         ?? 'Miami',
        state:        d.miami_state        ?? 'FL',
        zip:          d.miami_zip          ?? '',
        country:      d.miami_country      ?? 'USA',
        phone:        d.miami_phone        ?? '',
      })
    }

    if (clienteResult.data) {
      setCodigoCliente(clienteResult.data.codigo_cliente ?? null)
      setClienteNombre(clienteResult.data.nombre ?? null)
    }

    } catch { setLoadError(true) } finally { setLoading(false) }
  }, [profile])

  useEffect(() => { if (!profile?.cliente_id) return; const timer = window.setTimeout(() => void loadData(), 0); return () => window.clearTimeout(timer) }, [profile?.cliente_id, loadData])


  const buildLines = (): string[] => {
    if (!address) return []
    const suite = address.suite_prefix
      ? `${address.suite_prefix}${codigoCliente ?? ''}`
      : (codigoCliente ?? '')

    return [
      clienteNombre,
      address.consignee || null,
      suite
        ? `${address.address_line} ${suite}`.trim()
        : address.address_line,
      `${address.city}, ${address.state} ${address.zip}`.trim(),
      address.country,
      address.phone ? `Tel: ${address.phone}` : null,
    ].filter((l): l is string => !!l && l.trim() !== '')
  }

  const copyAddress = async () => {
    const text = buildLines().join('\n')
    if (!text) return
    try { await navigator.clipboard.writeText(text) } catch { toast.error("No se pudo copiar. Selecciona el texto de la dirección."); return }
    setCopied(true)
    toast.success('Dirección copiada al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = buildLines()
  const isReady = Boolean(address?.address_line.trim() && address?.zip.trim() && codigoCliente?.trim())

  if (loading) return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  )

  if (loadError) return <PortalError onRetry={() => void loadData()} />
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver" onClick={() => router.push('/portal/perfil')}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Tu dirección para compras</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Usa esta dirección para tus compras en EE.UU.</p>
        </div>
      </div>

      {/* Address card */}
      {isReady ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Tu dirección de consignación
              </p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
            >
              {copied
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copiada</>
                : <><Copy className="h-3.5 w-3.5" /> Copiar</>
              }
            </button>
          </div>

          <div className="select-all rounded-xl bg-white/60 px-4 py-3 font-mono text-sm leading-relaxed text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            {lines.map((line, i) => (
              <p key={i} className={i === 0 ? 'font-semibold' : ''}>{line}</p>
            ))}
          </div>

          {address && <dl className="mt-4 space-y-3">{[['Dirección', address.address_line], ['Suite / código', address.suite_prefix + codigoCliente], ['Ciudad', address.city], ['Estado', address.state], ['Código postal', address.zip], ['País', address.country]].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3"><div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div><button type="button" aria-label={`Copiar ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); toast.success(label + ' copiado') } catch { toast.error('No se pudo copiar') } }} className="shrink-0 rounded-lg p-2 text-blue-600"><Copy className="h-4 w-4" /></button></div>)}</dl>}
          {codigoCliente && (
            <p className="mt-2 text-xs text-blue-500 dark:text-blue-400">
              Tu código de cliente es <span className="font-semibold">{codigoCliente}</span>. Aparece en la dirección como identificador de suite.
            </p>
          )}

          <p className="mt-1 text-xs text-blue-400 dark:text-blue-500">
            Toca el recuadro para seleccionar todo el texto, o usa el botón Copiar.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-950/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Dirección no disponible aún</p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Nuestro equipo está configurando tu dirección de recepción en Miami. Contáctanos si necesitas esta información con urgencia.
            </p>
          </div>
        </div>
      )}

      <Link href="/portal/contacto" className="block text-center text-sm font-semibold text-blue-600 dark:text-blue-400">Ayuda con mi dirección o código de cliente</Link>
      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Esta dirección es administrada por Sari Express. Úsala para indicar a tus proveedores dónde enviar tus paquetes.
      </p>
    </div>
  )
}
