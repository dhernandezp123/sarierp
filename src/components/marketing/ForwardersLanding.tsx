import Link from 'next/link'
import { PLATFORM_ATTRIBUTION, PLATFORM_MARKETING_NAME, PLATFORM_ORIGIN } from '@/src/lib/platform-branding'
import { ClientPortalSection } from './ClientPortalSection'
import { ConnectedOperationHero } from './ConnectedOperationHero'
import { DemoConversionPanel } from './DemoConversionPanel'
import { FragmentationProblem } from './FragmentationProblem'
import { ImplementationPath } from './ImplementationPath'
import { LandingHeader } from './LandingHeader'
import { MarginStory } from './MarginStory'
import { MarketingFaq } from './MarketingFaq'
import { OperationJourney } from './OperationJourney'
import { ProductEvidence } from './ProductEvidence'
import { ProductShowcase } from './ProductShowcase'
import { TeamRoleSwitcher } from './TeamRoleSwitcher'
import { landingNavigation } from './landing-content'
import styles from './landing.module.css'

export function ForwardersLanding() {
  return (
    <div data-forwarders-landing className={`${styles.landing} min-h-screen bg-white text-[#07111F]`}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:text-[#0038BD] focus:shadow-lg">Saltar al contenido</a>
      <LandingHeader />
      <main>
        <ConnectedOperationHero />
        <ProductEvidence />
        <FragmentationProblem />
        <OperationJourney />

        <section id="producto" className="bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-20">
          <span id="funcionalidades" className="block" aria-hidden="true" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-9 grid gap-5 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-20">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">El software, sin mockups</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">Sigue la operación dentro del producto.</h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-slate-600">Recorre seis vistas reales del ambiente Demo. Avanza desde la cotización hasta el control financiero y la visibilidad permitida al cliente.</p>
            </div>
            <ProductShowcase />
          </div>
        </section>

        <MarginStory />
        <TeamRoleSwitcher />
        <ClientPortalSection />
        <ImplementationPath />
        <MarketingFaq />
        <DemoConversionPanel />
      </main>

      <footer className="border-t border-slate-200 bg-[#F7F9FC] px-5 py-9 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div>
              <p className="font-bold tracking-tight">{PLATFORM_MARKETING_NAME}</p>
              <p className="mt-1 text-xs leading-6 text-slate-600">{PLATFORM_ATTRIBUTION}</p>
            </div>
            <nav aria-label="Enlaces del pie de página" className="flex flex-wrap gap-x-6 gap-y-3">
              {landingNavigation.map((link) => <a key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-[#0038BD]">{link.label}</a>)}
            </nav>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 text-xs text-slate-600">
            <p>Creado por forwarders, para forwarders.</p>
            <Link href={`${PLATFORM_ORIGIN}/politicas`} className="underline underline-offset-4 hover:text-[#0038BD]">Términos y privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
