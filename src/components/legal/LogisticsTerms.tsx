import Link from 'next/link'
import document from '@/public/legal/logistics-2026-09-07.json'

export function LogisticsTerms() {
  return (
    <article className="space-y-6 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{document.title}</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Versión {document.version} · Edición {document.edition}. {document.effective}</p>
      </header>
      <nav aria-label="Contenido de las condiciones logísticas" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-blue-700 dark:text-blue-300">
        {document.sections.map(section => <a key={section.id} href={`#${section.id}`} className="underline underline-offset-4">{section.title}</a>)}
      </nav>
      {document.sections.map(section => (
        <section id={section.id} key={section.id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:p-7">
          <h2 className="mb-3 text-lg font-semibold">{section.title}</h2>
          {section.body.split('\n\n').map((paragraph, index) => <p key={index} className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{paragraph}</p>)}
        </section>
      ))}
      <footer className="flex flex-wrap gap-4 text-sm text-blue-700 underline underline-offset-4 dark:text-blue-300">
        <Link href="/politicas">Privacidad y términos del software</Link>
        <a href="/legal/logistics-2026-09-07.json" download>Descargar esta versión</a>
        <a href="/legal/logistics-2026-06.json" download>Consultar versión anterior (junio de 2026)</a>
      </footer>
    </article>
  )
}
