import 'server-only'

import { cache } from 'react'
import { loadAppAccess } from '@/lib/app-access'
import { createClient } from '@/lib/supabase/server'

// Share one verified result between Home and its layout during this server
// render only. React's request cache never carries accounts across requests.
export const getAppAccess = cache(async () => {
  const access = await loadAppAccess(await createClient({ freshReads: true }))
  if (access.status === 'unavailable') {
    console.error('Follow Up could not verify account access after retrying.')
  }
  return access
})
