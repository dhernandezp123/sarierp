import type { MetadataRoute } from 'next'
import { IS_DEMO_ENVIRONMENT } from '@/src/lib/demo-environment'

export default function robots(): MetadataRoute.Robots {
  if (IS_DEMO_ENVIRONMENT) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
  }
}
