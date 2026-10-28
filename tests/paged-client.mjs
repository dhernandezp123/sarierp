// Read-only PostgREST fixture: applies filters before an artificially capped page.
export function pagedClient(tables, { cap = 50, fail = () => false, afterRead = () => {} } = {}) {
  const calls = []
  const client = {
    calls,
    from(table) { return query(table) },
    rpc(name) { return query(name) },
  }
  function query(table) {
    const filters = [], orders = []
    let start = 0, end = Infinity, maximum = Infinity, counted = false, textFilter = ''
    const execute = async () => {
      const call = { table, start, end, filters: [...filters], orders: [...orders], textFilter }
      calls.push(call)
      if (fail(call)) return { data: null, error: { message: 'fixture read failed' }, count: null }
      let rows = [...(tables[table] || [])]
      for (const filter of filters) rows = rows.filter(row => filter.kind === 'in' ? filter.value.includes(row[filter.field])
        : filter.kind === 'neq' ? row[filter.field] != null && row[filter.field] !== filter.value
        : (row[filter.field] ?? null) === filter.value)
      if (textFilter) {
        const match = textFilter.match(/\.ilike\.("(?:[^"\\]|\\.)*")/)
        const pattern = match ? JSON.parse(match[1]) : ''
        const text = pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase()
        rows = rows.filter(row => [row.invoice_number, row.client_name].some(value => String(value || '').toLowerCase().includes(text)))
      }
      for (const [field, ascending] of [...orders].reverse()) rows.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (ascending ? 1 : -1))
      const count = rows.length
      const data = rows.slice(start, Math.min(end + 1, start + cap, start + maximum))
      afterRead(call)
      return { data, error: null, count: counted ? count : null }
    }
    const q = {
      select(_columns, options) { counted = options?.count === 'exact'; return q },
      is(field, value) { filters.push({ kind: 'eq', field, value }); return q },
      eq(field, value) { filters.push({ kind: 'eq', field, value }); return q },
      neq(field, value) { filters.push({ kind: 'neq', field, value }); return q },
      in(field, value) { filters.push({ kind: 'in', field, value }); return q },
      or(value) { textFilter = value; return q },
      order(field, options = {}) { orders.push([field, options.ascending !== false]); return q },
      limit(value) { maximum = value; return q },
      range(from, to) { start = from; end = to; return execute() },
      then(resolve, reject) { return execute().then(resolve, reject) },
    }
    return q
  }
  return client
}
