'use client'
import { usePathname } from 'next/navigation'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { workspaceBreadcrumbs } from '@/src/lib/workspace-breadcrumbs'
export function WorkspaceBreadcrumbs(){
 const pathname=usePathname(),items=workspaceBreadcrumbs(pathname)
 return items.length?<div className="workspace-breadcrumbs mb-4"><Breadcrumbs key={pathname} items={items} automatic/></div>:null
}
