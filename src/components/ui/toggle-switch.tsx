'use client'

export function ToggleSwitch({ checked, onChange, disabled = false, label }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label}
    onClick={onChange} disabled={disabled}
    className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
    <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
}
