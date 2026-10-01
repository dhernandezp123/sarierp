type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/** Read until an empty page, even when the API caps responses below our page size. */
export async function readAllReportRows<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { label, key = 'id', isCurrent = () => true, pageSize = 500 }: {
    label: string; key?: string; isCurrent?: () => boolean; pageSize?: number
  },
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<unknown>()
  while (isCurrent()) {
    const { data, error } = await readPage(rows.length, rows.length + pageSize - 1)
    if (!isCurrent()) throw new Error('Carga reemplazada')
    if (error) throw new Error(`No se pudo cargar ${label}. Reintenta la consulta.`)
    if (!data?.length) return rows
    for (const row of data) {
      const id = (row as Record<string, unknown>)[key]
      if (id == null || seen.has(id)) throw new Error(`Los datos de ${label} cambiaron durante la carga. Actualiza el reporte.`)
      seen.add(id)
    }
    rows.push(...data)
  }
  throw new Error('Carga reemplazada')
}
