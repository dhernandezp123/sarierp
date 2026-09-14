'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { PortalButton } from './PortalUI'

export function PortalError({ onRetry, message = 'No pudimos cargar esta información. Revisa tu conexión e intenta nuevamente.' }: { onRetry: () => void; message?: string }) {
  return <div role="alert" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><p className="flex items-start gap-2"><AlertTriangle className="h-5 w-5 shrink-0" />{message}</p><PortalButton variant="secondary" onClick={onRetry}>Reintentar</PortalButton></div>
}

export function PortalUnlinked() {
  return <div role="status" className="space-y-3 rounded-2xl border border-slate-200 p-5 text-sm dark:border-slate-700"><h1 className="font-semibold">Estamos preparando tu cuenta</h1><p>El equipo debe vincular tu acceso con tu código de cliente para mostrar tu carga.</p><Link className="inline-block font-semibold text-blue-600 dark:text-blue-400" href="/portal/contacto">Contactar al equipo</Link></div>
}
