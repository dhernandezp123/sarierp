import { roundMoney } from './invoice-fiscal'

export type CustomerMovement = {
  id: string; movement_date: string; created_at: string; currency: string; kind: string
  debit: number; credit: number; reference: string; description: string
  invoice_id: string | null; receipt_id: string | null; reconstructed: boolean
}

/** Filters affect visible detail only. The opening, running and closing balances
 * always include every movement in this customer's currency. */
export function customerStatement(movements: CustomerMovement[], from: string, to: string, currency: string, kinds: string[] = []) {
  if (!from || !to || from > to) throw new Error('Revisa el período del estado de cuenta.')
  const ordered = movements.filter(m => m.currency === currency && m.movement_date <= to)
    .sort((a,b) => a.movement_date.localeCompare(b.movement_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  let opening = 0, balance = 0, debit = 0, credit = 0
  const rows: (CustomerMovement & { balance: number })[] = []
  for (const movement of ordered) {
    const charge = Number(movement.debit), payment = Number(movement.credit)
    if (!Number.isFinite(charge) || !Number.isFinite(payment)) throw new Error('Hay un movimiento con importe inválido.')
    balance = roundMoney(balance + charge - payment)
    if (movement.movement_date < from) { opening = balance; continue }
    debit = roundMoney(debit + charge); credit = roundMoney(credit + payment)
    if (!kinds.length || kinds.includes(movement.kind)) rows.push({ ...movement, balance })
  }
  return { opening, closing: balance, debit, credit, rows, reconstructed: ordered.some(m => m.reconstructed), filtered: kinds.length > 0 }
}
