import type { AccountingAccount } from './accounting'
export type PurchaseAccountSource = 'default' | 'manual' | 'service'
export function supplierExpenseAccounts(accounts: AccountingAccount[]) {
  return accounts.filter(a => a.active && a.postable && a.account_level === 'Auxiliar' && (a.kind === 'Gasto' || a.kind === 'Costo'))
}
export function applyPurchaseAccountDefault<T extends {account_id:string;account_source:PurchaseAccountSource}>(lines:T[],accountId:string):T[] {
  return lines.map(line => line.account_source === 'default' ? {...line,account_id:accountId} : line)
}
