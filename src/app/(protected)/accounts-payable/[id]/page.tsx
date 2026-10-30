'use client'
import { useParams } from 'next/navigation'
import { SupplierPayableDetail } from '@/src/components/accounting/SupplierPayableDetail'
export default function APDetailPage() {
 const { id } = useParams<{ id: string }>()
 return <SupplierPayableDetail key={id} id={id}/>
}
