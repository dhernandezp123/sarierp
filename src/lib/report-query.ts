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

/** Bounded ID filters keep URLs small; each batch still reads every result page. */
export async function readReportRowsByIds<T>(
  ids: string[],
  readPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { label: string; key?: string; isCurrent?: () => boolean },
): Promise<T[]> {
  const unique = [...new Set(ids)]
  const rows: T[] = []
  const seen = new Set<unknown>()
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100)
    const result = await readAllReportRows((from, to) => readPage(batch, from, to), options)
    for (const row of result) {
      const id = (row as Record<string, unknown>)[options.key || 'id']
      if (seen.has(id)) throw new Error(`Los datos de ${options.label} cambiaron durante la carga. Reintenta la consulta.`)
      seen.add(id)
    }
    rows.push(...result)
  }
  if (options.isCurrent && !options.isCurrent()) throw new Error('Carga reemplazada')
  return rows
}
