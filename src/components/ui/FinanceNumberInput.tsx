'use client'
import type { ComponentProps, InputHTMLAttributes } from 'react'
import { NumberInput } from './NumberInput'
import { fieldClassSm } from '@/src/lib/ui-classes'

export type FinanceNumericKind = 'quantity' | 'money' | 'percentage' | 'exchange' | 'integer'
type Presentation = { presentation?: 'standard'; presentationReason?: never; leadingCurrency?: never }
  | { presentation: 'featured'; presentationReason: string; leadingCurrency?: boolean }
type Props = Omit<ComponentProps<typeof NumberInput>, 'className' | 'style' | 'size'> & {
  numericKind: FinanceNumericKind; invalid?: boolean
} & Presentation

/** Geometry belongs to the financial standard, never to caller className/style. */
export function FinanceNumberInput({ numericKind, invalid, presentation = 'standard', presentationReason, leadingCurrency, ...props }: Props) {
  return <NumberInput {...props} data-finance-numeric={numericKind} data-finance-presentation={presentation}
    data-finance-presentation-reason={presentationReason}
    className={`${fieldClassSm} finance-number text-right tabular-nums read-only:bg-slate-50 dark:read-only:bg-slate-800 ${invalid ? 'border-rose-400' : ''} ${leadingCurrency ? 'pl-14' : ''} ${presentation === 'featured' ? 'text-lg font-semibold' : ''}`}
    style={{ width: 'var(--finance-number-width, 100%)', maxWidth: '100%', height: presentation === 'featured' ? '3.5rem' : '2.5rem' }} />
}

type CodeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'className' | 'style' | 'size'>
/** Correlatives are strings: keep leading zeroes instead of numeric coercion. */
export function FinanceNumericCodeInput(props: CodeProps) {
  return <input {...props} type="text" inputMode="numeric" data-finance-numeric="code" className={`${fieldClassSm} finance-number tabular-nums`}
    style={{width:'var(--finance-number-width, 100%)',maxWidth:'100%',height:'2.5rem'}} />
}

/** Imported document amounts retain their original comma/decimal text while editing. */
export function FinanceMoneyTextInput(props: CodeProps) {
  return <input {...props} type="text" inputMode="decimal" data-finance-numeric="money" className={`${fieldClassSm} finance-number text-right tabular-nums bg-amber-50 dark:bg-amber-950/30`}
    style={{width:'var(--finance-number-width, 100%)',maxWidth:'100%',height:'2.5rem'}} />
}
