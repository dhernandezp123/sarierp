'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { BillOfLadingEditor } from '@/src/components/operations/BillOfLadingEditor'

export default function BLPage() {
  const params = useParams<{ id: string; bookingId: string; blId: string }>()
  const searchParams = useSearchParams()

  return (
    <BillOfLadingEditor
      key={params.blId}
      shippingInstructionId={params.id}
      bookingId={params.bookingId}
      blId={params.blId}
      type={(searchParams.get('type') as 'MBL' | 'HBL') || 'MBL'}
      parentBlId={searchParams.get('parentBlId')}
    />
  )
}
