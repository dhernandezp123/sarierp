import type { Metadata } from 'next'
import { ForwardersLanding } from '@/src/components/marketing/ForwardersLanding'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://forwarders.app',
  },
}

export default function Home() {
  return <ForwardersLanding />
}
