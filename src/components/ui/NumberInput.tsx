'use client'

import { useState, type InputHTMLAttributes, type Ref } from 'react'

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  type?: 'number'
  value?: string | number | null
  ref?: Ref<HTMLInputElement>
}

/** Keep the text being edited while a numeric parent normalizes its value. */
export function NumberInput({ value, onChange, onBlur, ref, ...props }: NumberInputProps) {
  const [draft, setDraft] = useState<{ text: string; source: string } | null>(null)
  const incoming = String(value ?? '')
  const matchesDraft = draft && (incoming === draft.source || incoming === draft.text
    || Number(incoming) === Number(draft.text))
  const display = draft && matchesDraft && !props.disabled && !props.readOnly ? draft.text : incoming

  return <input
    {...props}
    ref={ref}
    type="number"
    value={value === undefined ? undefined : display}
    onChange={event => {
      if (value !== undefined) setDraft({ text: event.target.value, source: incoming })
      onChange?.(event)
    }}
    onBlur={event => {
      setDraft(null)
      onBlur?.(event)
    }}
  />
}
