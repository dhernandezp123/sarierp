import type { MetadataRoute } from 'next'
import { PLATFORM_ORIGIN } from '@/src/lib/platform-branding'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: PLATFORM_ORIGIN,
      lastModified: '2026-09-24',
      changeFrequency: 'monthly',
      priority: 1,
      images: [`${PLATFORM_ORIGIN}/product/cotizacion-rentabilidad.webp`],
    },
    {
      url: `${PLATFORM_ORIGIN}/politicas`,
      lastModified: '2026-09-24',
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]
}
