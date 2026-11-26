import test from 'node:test'
import assert from 'node:assert/strict'
import { auditFinanceSource, checkFinanceTree } from '../scripts/check-finance-ui.mjs'
import loadTs from './load-ts.mjs'

const header = `import { FinanceNumberInput as Amount } from '@/src/components/ui/FinanceNumberInput';`
test('financial standard rejects raw controls and caller geometry, including aliases', () => {
  for (const source of [
    '<input type="number"/>', '<input inputMode="decimal"/>', '<input type={"number"}/>', '<input type={numeric ? "number" : "text"}/>',
    `import { NumberInput as N } from '@/src/components/ui/NumberInput';`,
    `${header}<Amount/>`, `${header}<Amount numericKind="money" className="w-full"/>`,
    `${header}<Amount numericKind="money" style={{width:999}}/>`,
    `${header}<Amount numericKind="money" {...props}/>`,
    `${header}<Amount numericKind="money" presentation="featured"/>`,
  ]) assert.ok(auditFinanceSource(source).length, source)
})
test('financial standard accepts explicit semantic fields and documented featured amount', () => {
  assert.deepEqual(auditFinanceSource(`${header}<Amount numericKind="quantity" min={1} step={1}/>`), [])
  assert.deepEqual(auditFinanceSource(`${header}<Amount numericKind="money" presentation="featured" presentationReason="Main receipt amount"/>`), [])
  assert.deepEqual(checkFinanceTree(), [])
})
test('shared controls own geometry and preserve numeric props and text correlatives', () => {
  const { FinanceNumberInput, FinanceNumericCodeInput, FinanceMoneyTextInput } = loadTs('src/components/ui/FinanceNumberInput.tsx')
  const onChange = () => {}
  const field = FinanceNumberInput({numericKind:'money',value:'12.50',step:'0.01',min:0,onChange})
  assert.equal(field.props.style.height, '2.5rem')
  assert.equal(field.props.style.width, 'var(--finance-number-width, 100%)')
  assert.equal(field.props.onChange, onChange)
  assert.equal(field.props.step, '0.01')
  assert.equal(field.props.value, '12.50')
  assert.equal(FinanceNumericCodeInput({value:'000001'}).props.value, '000001')
  const money = FinanceMoneyTextInput({value:'3,300.00'})
  assert.equal(money.props.type, 'text')
  assert.equal(money.props.value, '3,300.00')
})
