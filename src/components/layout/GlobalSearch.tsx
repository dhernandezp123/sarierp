'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/src/components/ui/dialog'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { searchRecords } from '@/src/lib/global-search'

export default function GlobalSearch() {
  const { user, profile, loading } = useUser()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<{ key: string; data: Awaited<ReturnType<typeof searchRecords>> } | null>(null)
  const allowed = !loading && !!user && profile?.id === user.id && !!profile.tenant_id && profile.status === 'Aprobado' && profile.is_active === true && !profile.is_platform_admin && profile.rol !== 'Cliente'
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${allowed}`
  const key = `${context}:${query.trim()}:${revision}`
  const data = snapshot?.key === key ? snapshot.data : null
  useEffect(() => {
    if (!open || !allowed || !profile?.tenant_id || query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void searchRecords(supabase, query, profile.rol, profile.tenant_id!, controller.signal).then(result => {
        if (!controller.signal.aborted) setSnapshot({ key, data: result })
      })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, allowed, profile?.tenant_id, profile?.rol, key, query])
  if (!allowed) return null
  return <div className="mx-2 flex min-w-0 flex-1 justify-center sm:mx-6">
    <Dialog open={open} onOpenChange={value => { setOpen(value); setQuery(''); setSnapshot(null) }}>
      <DialogTrigger asChild>
        <button type="button" aria-label="Buscar en el ERP" className="flex h-9 w-9 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 md:w-full md:max-w-md md:justify-start md:px-3 dark:border-slate-700 dark:hover:bg-slate-800">
          <Search className="h-4 w-4 shrink-0" /><span className="hidden truncate md:block">Buscar cotizaciones, bookings, clientes...</span>
        </button>
      </DialogTrigger>
      <DialogContent key={context} className="sm:max-w-2xl">
        <DialogTitle>Buscar en el ERP</DialogTitle>
        <DialogDescription>Busca texto en números, referencias, nombres, rutas y notas de cotizaciones. Solo registros accesibles para tu usuario.</DialogDescription>
        <label htmlFor="global-search" className="sr-only">Texto a buscar</label>
        <input id="global-search" type="search" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Escribe al menos 2 caracteres…" className="h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700" />
        <div aria-live="polite" className="text-xs text-slate-500">
          {query.trim().length < 2 ? 'Cotizaciones · Bookings · Instrucciones · Clientes · Agentes · Proveedores · Facturación' : !data ? 'Buscando…' : `${data.results.length} resultados`}
          {!!data?.failed.length && <p role="alert" className="mt-2 text-amber-700 dark:text-amber-300">No se pudo consultar: {data.failed.join(', ')}. <button type="button" className="underline" onClick={() => setRevision(v => v + 1)}>Reintentar</button></p>}
          {!!data?.limited.length && <p className="mt-2">Mostrando hasta 8 por tipo. Afina el texto para encontrar más coincidencias.</p>}
        </div>
        <div className="max-h-[50dvh] overflow-y-auto">
          {data?.results.map(result => <Link key={result.id} href={result.href} onClick={() => setOpen(false)} className="block rounded-lg p-3 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800">
            <span className="text-xs text-slate-500">{result.type}</span>
            <p className="break-words font-medium">{result.title}</p>
            <p className="break-words text-xs text-slate-500">{result.detail}</p>
          </Link>)}
          {data && !data.results.length && !data.failed.length && <p className="py-6 text-center text-sm text-slate-500">No se encontraron coincidencias. Prueba otro texto o referencia.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
