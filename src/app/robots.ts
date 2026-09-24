import type { MetadataRoute } from 'next'
import { PLATFORM_ORIGIN } from '@/src/lib/platform-branding'

const privatePaths = [
  '/api/',
  '/auth/',
  '/accounts-payable',
  '/admin/',
  '/agents',
  '/alerts',
  '/catalogs',
  '/clientes',
  '/cost-validation',
  '/dashboard',
  '/financial-dashboard',
  '/historico',
  '/init',
  '/invoicing',
  '/login',
  '/miami',
  '/onboarding',
  '/operations/',
  '/portal/',
  '/pricing-comparison',
  '/profile',
  '/quotations/',
  '/register',
  '/reports',
  '/settings/',
  '/suppliers',
  '/support',
  '/ventas',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/politicas'],
      disallow: privatePaths,
    },
    sitemap: `${PLATFORM_ORIGIN}/sitemap.xml`,
    host: PLATFORM_ORIGIN,
  }
}
