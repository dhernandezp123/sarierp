'use client'

import { getCargoStructure } from '@/src/lib/quotation-products'

export type DuplicateCargoNoticeData = {
  sourceQuoteType: string
  summary: string[]
}

/** Carga de la cotización origen que la copia no conserva en su estructura actual. */
export function DuplicateCargoNotice({
  notice,
  quoteType,
}: {
  notice: DuplicateCargoNoticeData
  quoteType: string
}) {
  const structure = getCargoStructure(quoteType)

  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <p className="font-semibold">
        Parte de la carga de la cotización origen no se trasladó
      </p>
      <p className="mt-1">
        La cotización origen era {notice.sourceQuoteType} y esta copia es{' '}
        {quoteType || 'de modalidad por definir'} según su producto.
        Estos datos no están en el formulario:
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {notice.summary.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-2">
        {structure === 'containers'
          ? 'Agrega los contenedores correspondientes antes de enviar a Pricing.'
          : structure === 'loose'
            ? 'Ingresa las líneas de carga con cantidad, volumen y peso antes de enviar a Pricing.'
            : 'Elige la modalidad e ingresa la carga antes de enviar a Pricing.'}
      </p>
    </div>
  )
}
