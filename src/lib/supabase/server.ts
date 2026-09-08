import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient({ freshReads = false }: { freshReads?: boolean } = {}) {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Account-check retries must reach Supabase rather than reuse a failed
      // GET from Next's render cache. Other callers keep their existing setup.
      global: freshReads ? {
        fetch: (input, init) => fetch(input, {
          ...init,
          cache: 'no-store',
          signal: init?.signal ?? (input instanceof Request ? input.signal : new AbortController().signal),
        }),
      } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot always write cookies.
            // Our auth proxy will handle session refresh.
          }
        },
      },
    }
  )
}
