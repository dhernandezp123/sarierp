import { createBrowserClient } from '@supabase/ssr'

export function fetchWithoutHttpCache(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  return fetch(input, {
    ...init,
    cache: 'no-store',
  })
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: fetchWithoutHttpCache,
    },
  }
)
