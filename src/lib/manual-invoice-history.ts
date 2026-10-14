import type { SavedManualInvoice } from './manual-invoice'

export function mergeManualInvoicePage(previous: SavedManualInvoice[], page: {
  documents: SavedManualInvoice[]; total: number; nextOffset: number; hasMore: boolean
}, offset: number) {
  if (!Array.isArray(page.documents) || !Number.isSafeInteger(page.total) || page.total < 0
    || previous.length !== offset || page.nextOffset !== offset + page.documents.length
    || page.hasMore !== (page.nextOffset < page.total) || page.nextOffset > page.total
    || (page.hasMore && page.documents.length === 0)) {
    throw new Error('El historial cambio o no se pudo cargar completo. Actualiza para reintentar.')
  }
  const ids = new Set(previous.map(row => row.id))
  for (const row of page.documents) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw new Error('El historial cambio durante la carga. Actualiza para reintentar.')
    }
    ids.add(row.id)
  }
  return { ...page, documents: [...previous, ...page.documents] }
}
