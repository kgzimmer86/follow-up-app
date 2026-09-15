import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { loadGroupData, type GroupDataOptions } from '@/lib/community-data'
import type { CommunityGroup } from '@/lib/community'

// Paginate history rather than silently truncating at Supabase's row cap.
export async function groupData(group: CommunityGroup, options: boolean | GroupDataOptions = true) {
  return loadGroupData(await createClient(), group, typeof options === 'boolean'
    ? { meetings: options, attendance: options, attention: options }
    : options)
}
