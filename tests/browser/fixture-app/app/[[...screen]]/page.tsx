'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { UnsavedChangesGuard, requestFormNavigation, markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'
import { ManualInvoiceEditor } from '@/src/components/invoicing/ManualInvoiceEditor'
import { LandingContact } from '@/src/components/marketing/LandingContact'

export default function Fixture() {
  const pathname = usePathname(), router = useRouter()
  const [text, setText] = useState('')
  useEffect(() => { document.documentElement.dataset.auditPath = pathname }, [pathname])
  return <main><p>Fixture sintético aislado; sin credenciales ni escrituras reales.</p>
    <nav><Link href="/guard">Guard</Link> · <Link href="/manual">Manual</Link> · <Link href="/landing">Demo</Link> · <Link href="/away">Salir</Link></nav>
    {pathname === '/manual' ? <ManualInvoiceEditor /> : pathname === '/landing' ? <LandingContact />
      : pathname === '/guard' ? <><label>Filtro ajeno <input id="outside" /></label><section>
        <UnsavedChangesGuard /><label>Texto del formulario <input id="inside" value={text} onChange={e => setText(e.target.value)} /></label>
        <button id="cancel" onClick={() => requestFormNavigation(() => router.push('/away'))}>Cancelar edición</button>
        <button id="saved" onClick={() => markFormSaved()}>Simular guardado confirmado</button>
        <button id="failed" onClick={() => {}}>Simular guardado fallido</button>
      </section></> : <p id="away">Destino de navegación</p>}
  </main>
}
