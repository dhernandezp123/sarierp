import Link from 'next/link'
import { LogisticsTerms } from '@/src/components/legal/LogisticsTerms'

export const metadata = {
  title: 'Condiciones del portal y servicio logístico — Sari Express',
  description: 'Condiciones de acceso, contratación, carga y privacidad del portal de clientes.',
}

export default function LogisticsTermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl">
        <Link href="/portal/register" className="mb-6 inline-block text-sm text-blue-700 underline underline-offset-4 dark:text-blue-300">Volver a solicitar acceso</Link>
        <LogisticsTerms />
      </div>
    </main>
  )
}
