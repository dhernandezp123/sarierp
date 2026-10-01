/** Respuestas vacías, HTML o mal formadas también deben pasar por la auditoría de fallo. */
export async function readEmailProviderResponse(response: Response): Promise<{ id?: string; message: string }> {
  const fallback = `Resend respondió ${response.status} sin una confirmación válida`
  try {
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { message: fallback }
    const data = payload as Record<string, unknown>
    const error = data.error && typeof data.error === 'object'
      ? data.error as Record<string, unknown>
      : null
    return {
      id: typeof data.id === 'string' && data.id.trim() ? data.id : undefined,
      message: typeof data.message === 'string'
        ? data.message
        : typeof error?.message === 'string' ? error.message : fallback,
    }
  } catch {
    return { message: fallback }
  }
}
