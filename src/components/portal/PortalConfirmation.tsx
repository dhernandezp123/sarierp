import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export function PortalConfirmation({ title, description, reference, href, action = 'Ver mis solicitudes' }: { title: string; description: string; reference?: string; href: string; action?: string }) {
  return <div role="status" className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-6 text-slate-900 dark:border-emerald-900 dark:bg-slate-900 dark:text-slate-100"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>{reference && <p className="break-all font-mono text-sm">Referencia: {reference}</p>}<Link href={href} className="inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">{action}</Link></div>
}
