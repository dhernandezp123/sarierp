import type { Metadata } from 'next'
import { ForwardersLanding } from '@/src/components/marketing/ForwardersLanding'
import { landingQuestions } from '@/src/components/marketing/landing-content'
import {
  PLATFORM_MARKETING_NAME,
  PLATFORM_MARKETING_POSITIONING,
  PLATFORM_ORIGIN,
} from '@/src/lib/platform-branding'

const title = 'Forwarders.app | Software para Freight Forwarders'
const description =
  'Conecta cotizaciones, pricing, operaciones, documentos y rentabilidad en una plataforma moderna para freight forwarders, NVOCC y agencias de carga.'

export const metadata: Metadata = {
  metadataBase: new URL(PLATFORM_ORIGIN),
  title: { absolute: title },
  description,
  applicationName: PLATFORM_MARKETING_NAME,
  category: 'business software',
  keywords: [
    'freight forwarding software',
    'freight forwarder software',
    'freight management software',
    'freight forwarding system',
    'freight forwarding ERP',
    'NVOCC software',
    'software para agencias de carga',
    'quotation software for freight forwarders',
  ],
  alternates: {
    canonical: PLATFORM_ORIGIN,
  },
  openGraph: {
    type: 'website',
    locale: 'es_HN',
    url: PLATFORM_ORIGIN,
    siteName: PLATFORM_MARKETING_NAME,
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${PLATFORM_ORIGIN}/#website`,
      url: PLATFORM_ORIGIN,
      name: PLATFORM_MARKETING_NAME,
      description,
      inLanguage: 'es',
      publisher: {
        '@id': `${PLATFORM_ORIGIN}/#organization`,
      },
    },
    {
      '@type': 'Organization',
      '@id': `${PLATFORM_ORIGIN}/#organization`,
      name: 'Hernova Systems',
      url: PLATFORM_ORIGIN,
      logo: `${PLATFORM_ORIGIN}/brand/isotipo-color.png`,
      brand: {
        '@type': 'Brand',
        name: PLATFORM_MARKETING_NAME,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${PLATFORM_ORIGIN}/#software`,
      name: PLATFORM_MARKETING_NAME,
      alternateName: PLATFORM_MARKETING_POSITIONING,
      url: PLATFORM_ORIGIN,
      description,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Freight Forwarding Software',
      operatingSystem: 'Web',
      inLanguage: 'es',
      publisher: {
        '@id': `${PLATFORM_ORIGIN}/#organization`,
      },
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Freight forwarders, NVOCC y agencias de carga',
      },
      featureList: [
        'Cotizaciones y pricing para freight forwarders',
        'Shipments, Shipping Instructions, bookings y documentos',
        'Validación de costos, facturación y resultado financiero',
        'Portal de seguimiento para clientes',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${PLATFORM_ORIGIN}/#preguntas`,
      mainEntity: landingQuestions.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })),
    },
  ],
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <ForwardersLanding />
    </>
  )
}
