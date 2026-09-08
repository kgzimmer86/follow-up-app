import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Keep this entry point beside src/app so Next.js runs session refresh
// before the page and its navigation independently check the user's access.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
