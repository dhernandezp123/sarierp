import Link from 'next/link'
import { PortalPrintButton } from '@/src/components/portal/PortalPrintButton'
import { LogisticsTerms } from '@/src/components/legal/LogisticsTerms'

export default function TerminosPage() {
  return (
    <div className="space-y-5">
      <Link href="/portal" className="inline-block text-sm text-blue-700 underline underline-offset-4 dark:text-blue-300">Volver al portal</Link>
      <PortalPrintButton />
      <LogisticsTerms />
    </div>
  )
}
