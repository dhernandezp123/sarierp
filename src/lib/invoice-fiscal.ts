import { calculateTaxAmount } from './tax'

export type TaxTreatment = 'Gravada' | 'Exenta' | 'Exonerada'
export type FiscalMode = TaxTreatment | 'Mixta'
export type CurrencyConversion = { currency: string; rate: number; operation: 'multiply' | 'divide' }
export const referenceCurrencies = ['HNL', 'USD', 'EUR', 'GBP', 'CAD', 'MXN', 'GTQ', 'CRC'] as const
export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

export function convertMoney(amount: number, conversion: CurrencyConversion) {
  if (!Number.isFinite(amount) || !Number.isFinite(conversion.rate) || conversion.rate <= 0
    || !['multiply','divide'].includes(conversion.operation)) throw new Error('Revisa la tasa y operación de conversión.')
  return roundMoney(conversion.operation === 'multiply' ? amount * conversion.rate : amount / conversion.rate)
}

export function invoiceLineAmounts(quantity: number, unitPrice: number, discount = 0, conversion?: CurrencyConversion) {
  if (![quantity, unitPrice, discount].every(Number.isFinite) || quantity < 0 || unitPrice < 0
    || discount < 0 || roundMoney(discount) !== discount || discount > roundMoney(quantity * unitPrice)) {
    throw new Error('El descuento debe estar entre cero y el importe bruto de la línea, con dos decimales.')
  }
  const price = conversion ? convertMoney(unitPrice, conversion) : unitPrice
  const appliedDiscount = conversion ? convertMoney(discount, conversion) : discount
  const gross = roundMoney(quantity * price)
  if (appliedDiscount > gross) throw new Error('El descuento supera el importe convertido de la línea.')
  return { unitPrice: price, gross, discount: appliedDiscount, net: roundMoney(gross - appliedDiscount) }
}

export function calculateInvoiceFiscal(lines: { amount: number; isv_rate: number; tax_treatment?: TaxTreatment }[], mode: FiscalMode) {
  let exempt = 0, exonerated = 0, taxable15 = 0, taxable18 = 0
  for (const line of lines) {
    const amount = roundMoney(line.amount)
    if (!Number.isFinite(amount) || amount < 0 || ![0,15,18].includes(line.isv_rate)) throw new Error('Línea fiscal inválida.')
    const treatment = mode === 'Exonerada' || mode === 'Exenta' ? mode : line.tax_treatment || (line.isv_rate ? 'Gravada' : 'Exenta')
    if (treatment === 'Exonerada') exonerated += amount
    else if (treatment === 'Exenta') exempt += amount
    else if (line.isv_rate === 15) taxable15 += amount
    else if (line.isv_rate === 18) taxable18 += amount
    else throw new Error('Selecciona 15% o 18% para una línea gravada.')
  }
  const tax15 = roundMoney(calculateTaxAmount(true, taxable15, 15))
  const tax18 = roundMoney(calculateTaxAmount(true, taxable18, 18))
  const subtotal = roundMoney(exempt + exonerated + taxable15 + taxable18)
  const count = [exempt, exonerated, taxable15 + taxable18].filter(value => value > 0).length
  const classification: FiscalMode = count > 1 ? 'Mixta' : exonerated > 0 ? 'Exonerada' : taxable15 + taxable18 > 0 ? 'Gravada' : 'Exenta'
  return { exempt: roundMoney(exempt), exonerated: roundMoney(exonerated), taxable15: roundMoney(taxable15), taxable18: roundMoney(taxable18), tax15, tax18,
    subtotal, tax: roundMoney(tax15 + tax18), total: roundMoney(subtotal + tax15 + tax18), classification }
}
