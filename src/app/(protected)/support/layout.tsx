import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { createClient } from '@/src/lib/supabase/server'

export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('support_settings')
    .select('enabled')
    .eq('singleton', true)
    .maybeSingle()

  if (settings?.enabled !== true) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
          <LifeBuoy className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-950 dark:text-white">
          Mesa de ayuda no habilitada
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Esta instalación todavía utiliza los canales de soporte por correo,
          WhatsApp y llamada telefónica.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Volver al dashboard
        </Link>
      </div>
    )
  }

  return children
}
