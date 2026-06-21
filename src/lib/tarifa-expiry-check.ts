import { supabase } from '@/src/lib/supabase/client'
import { createNotification } from '@/src/lib/notifications'

type ExpiredQuoteRow = {
  id: string
  valid_until: string
  quotations: {
    id: string
    quotation_number: string | null
    status: string | null
  } | {
    id: string
    quotation_number: string | null
    status: string | null
  }[] | null
}

export async function checkAndNotifyExpiredTarifas() {
  const today = new Date().toISOString().split('T')[0]

  // Fetch expired, selected, unnotified agent quotes with their quotation
  const { data: expiredQuotes, error: expiredError } = await supabase
    .from('agent_quotes')
    .select('id, valid_until, quotations(id, quotation_number, status)')
    .lt('valid_until', today)
    .is('expiry_notified_at', null)
    .eq('is_selected', true)

  if (expiredError) throw expiredError
  if (!expiredQuotes || expiredQuotes.length === 0) return

  // Filter to only quotations still in 'Cotizada' status
  const relevant = (expiredQuotes as ExpiredQuoteRow[]).filter((aq) => {
    const q = Array.isArray(aq.quotations) ? aq.quotations[0] : aq.quotations
    return q?.status === 'Cotizada'
  })

  if (relevant.length === 0) return

  // Get all Pricing users to notify
  const { data: pricingUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('rol', 'Pricing')
    .eq('is_active', true)
    .eq('status', 'Aprobado')

  if (!pricingUsers || pricingUsers.length === 0) return

  for (const aq of relevant) {
    const quotation = Array.isArray(aq.quotations) ? aq.quotations[0] : aq.quotations
    if (!quotation) continue

    const [year, month, day] = aq.valid_until.split('-')
    const fechaFmt = `${day}/${month}/${year}`

    const { data: claimed, error: claimError } = await supabase
      .from('agent_quotes')
      .update({ expiry_notified_at: new Date().toISOString() })
      .eq('id', aq.id)
      .is('expiry_notified_at', null)
      .select('id')
      .maybeSingle()

    if (claimError) throw claimError
    if (!claimed) continue

    try {
      const results = await Promise.all(
        pricingUsers.map((u) =>
          createNotification({
            userId: u.id,
            title: 'Tarifa vencida en cotización activa',
            message: `La tarifa seleccionada de la cotización ${quotation.quotation_number || quotation.id} venció el ${fechaFmt}. Actualizar antes de aprobar.`,
            type: 'warning',
          })
        )
      )
      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error
    } catch (error) {
      await supabase
        .from('agent_quotes')
        .update({ expiry_notified_at: null })
        .eq('id', aq.id)
      throw error
    }
  }
}
