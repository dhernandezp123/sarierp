'use client'

import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile) return
    void loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cliente_id])

  const loadData = async () => {
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

    if (settingsResult.data) {
      const d = settingsResult.data as any
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
      setCodigoCliente((clienteResult.data as any).codigo_cliente ?? null)
      setClienteNombre((clienteResult.data as any).nombre ?? null)
    }

    setLoading(false)
  }

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

  const copyAddress = () => {
    const text = buildLines().join('\n')
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Dirección copiada al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = buildLines()
  const isReady = address && address.address_line

  if (loading) return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dirección en Miami</h1>
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

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Esta dirección es administrada por Sari Express. Úsala para indicar a tus proveedores dónde enviar tus paquetes.
      </p>
    </div>
  )
}
