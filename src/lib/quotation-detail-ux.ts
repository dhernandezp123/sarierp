import type { QuotationCommercialOption } from './quotation-options'

/** Explain the existing detail-page guards before the user attempts a transition. */
export function quotationTransitionHint(next: string, options: Pick<QuotationCommercialOption, 'status'>[]) {
  if (next === 'Enviada al Cliente' && options.length > 0) {
    return 'Pricing debe ofrecer las opciones desde el comparativo de tarifas.'
  }
  if (next === 'Ganada' && options.length > 0 && !options.some((option) => option.status === 'Aceptada')) {
    return 'Registra la elección del cliente en una de las opciones ofrecidas.'
  }
  return null
}

/** Only return to the quotation list; never accept an external URL as navigation. */
export function quotationListHref(value?: string | null) {
  if (!value || !/^\/(?:historico|ventas)(?:\?|$)/.test(value)) return '/historico'
  try {
    const url = new URL(value, 'https://forwarders.app')
    if (url.pathname === '/ventas') {
      const query = new URLSearchParams()
      const work = url.searchParams.get('work')
      const workSearch = url.searchParams.get('workSearch')
      if (work) query.set('work', work)
      if (workSearch) query.set('workSearch', workSearch)
      return '/ventas' + (query.size ? '?' + query.toString() : '')
    }
    if (url.pathname !== '/historico') return '/historico'
    const query = new URLSearchParams()
    for (const key of ['status', 'from', 'to', 'search', 'page', 'pageSize']) {
      const param = url.searchParams.get(key)
      if (param) query.set(key, param)
    }
    return '/historico' + (query.size ? '?' + query.toString() : '')
  } catch { return '/historico' }
}
