export type ClientOption = {
  id: string
  codigo_cliente?: string | null
  nombre?: string | null
  rtn?: string | null
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
}

export function searchClients<T extends ClientOption>(clients: T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return clients
  return clients.filter(client => {
    const searchable = normalize(`${client.nombre || ''} ${client.codigo_cliente || ''} ${client.rtn || ''} ${(client.rtn || '').replace(/\D/g, '')}`)
    return words.every(word => searchable.includes(word))
  })
}

export function clientInitials(name?: string | null) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es') || 'CL'
}
