import { supabase } from '@/src/lib/supabase/client'

export async function checkAndNotifyExpiredTarifas() {
  // La RPC comprueba Admin/Pricing y tenant, reserva cada tarifa y escribe
  // todos sus avisos junto al marcador de vencimiento en una transaccion.
  const { error } = await supabase.rpc('notify_expired_agent_quotes_for_current_tenant')
  if (error) throw error
}
