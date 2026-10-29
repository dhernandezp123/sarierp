import type { ReactNode } from 'react'
import { fieldLabelClass, fieldStackClass, formSectionTitleClass } from '@/src/lib/ui-classes'

/**
 * Campo de formulario: etiqueta arriba, control abajo (patrón de Cotizaciones).
 * Usa `as="div"` cuando el control ya tiene su propia etiqueta accesible
 * (CompactSelect, combobox) y no debe recibir los clics de la etiqueta.
 */
export function FormField({ label, required = false, hint, className = '', as = 'label', children }: {
  label: ReactNode; required?: boolean; hint?: ReactNode; className?: string; as?: 'label' | 'div'; children: ReactNode
}) {
  const Tag = as
  return <Tag className={`${fieldStackClass} ${className}`}>
    <span className={fieldLabelClass}>{label}{required && <span className="text-red-400"> *</span>}</span>
    {children}
    {hint && <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
  </Tag>
}

/** Bloque de formulario con título y línea divisoria, como en Cotizaciones. */
export function FormSection({ title, description, actions, children, className = '' }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return <section className={className}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div><h2 className={formSectionTitleClass}>{title}</h2>{description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>}</div>
      {actions}
    </div>
    {children}
  </section>
}
