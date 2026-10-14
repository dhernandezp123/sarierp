/** Callers supply fixed column names; values stay literal in LIKE and PostgREST. */
export function literalTextFilter(fields: string[], value: string) {
  const literal = value.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, char => '\\' + char)
  const pattern = JSON.stringify(`%${literal}%`)
  return fields.map(field => `${field}.ilike.${pattern}`).join(',')
}
