'use client'
import { useRouter } from 'next/navigation'
import { SupplierForm } from '@/src/components/suppliers/SupplierForm'
import { requestFormNavigation } from '@/src/components/ui/UnsavedChangesGuard'
export default function NewSupplierPage(){
 const router=useRouter()
 return <div className="mx-auto max-w-2xl space-y-6"><h1 className="text-2xl font-bold">Nuevo proveedor</h1>
  <SupplierForm onCreated={id=>router.push('/suppliers/'+id)} onCancel={()=>requestFormNavigation(()=>router.push('/suppliers'))}/></div>
}
