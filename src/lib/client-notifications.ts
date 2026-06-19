import { supabase } from '@/src/lib/supabase/client'

export async function notifyClientPackageAssigned({
  clienteId,
  packageId,
  trackingNumber,
  warehouseNumber,
}: {
  clienteId: string
  packageId: string
  trackingNumber: string
  warehouseNumber: string
}) {
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('rol', 'Cliente')
    .maybeSingle()

  if (!clientProfile) return

  await supabase.from('client_notifications').insert({
    profile_id:  clientProfile.id,
    title:       'Paquete recibido en bodega',
    body:        `Tu paquete ${trackingNumber} llegó a bodega Miami. Número asignado: ${warehouseNumber}.`,
    type:        'paquete',
    entity_type: 'miami_packages',
    entity_id:   packageId,
  })
}
