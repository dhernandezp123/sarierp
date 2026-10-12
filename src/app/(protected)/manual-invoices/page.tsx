import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import { readTenantHeaders } from '@/src/lib/tenant-context'
import { MANUAL_INVOICE_ROLES } from '@/src/lib/manual-invoice'
import { ManualInvoiceEditor } from '@/src/components/invoicing/ManualInvoiceEditor'

export default async function ManualInvoicesPage() {
  const tenant = readTenantHeaders(await headers())
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol,tenant_id,status,is_active,is_platform_admin').eq('id', user.id).maybeSingle()
  if (!profile || profile.status !== 'Aprobado' || profile.is_active !== true || profile.is_platform_admin === true
    || !MANUAL_INVOICE_ROLES.includes(profile.rol) || tenant?.hostname !== 'sari.forwarders.app' || profile.tenant_id !== tenant.id) redirect('/dashboard')
  return <ManualInvoiceEditor />
}
