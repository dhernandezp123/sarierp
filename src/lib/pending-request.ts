export type RequestStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const pendingKeys = new Map<string, string>()

export function browserRequestStorage(): RequestStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage }
  catch { return undefined }
}

export function requestKey(name: string, storage = browserRequestStorage(), generate = () => crypto.randomUUID()) {
  let key = pendingKeys.get(name)
  try { key = storage?.getItem(name) || key } catch { /* Mantener clave en memoria. */ }
  if (!key) key = generate()
  pendingKeys.set(name, key)
  try { storage?.setItem(name, key) } catch { /* El reintento conserva la clave en memoria. */ }
  return key
}

export function pendingRequestKey(name: string, storage = browserRequestStorage()) {
  try { return storage?.getItem(name) || pendingKeys.get(name) || null }
  catch { return pendingKeys.get(name) || null }
}

/** Solo liberar al confirmar el resultado, sin borrar una solicitud más reciente. */
export function completeRequest(name: string, confirmedKey: string, storage = browserRequestStorage()) {
  if (pendingKeys.get(name) === confirmedKey) pendingKeys.delete(name)
  try { if (storage?.getItem(name) === confirmedKey) storage.removeItem(name) }
  catch { /* No alterar otra solicitud pendiente. */ }
}
