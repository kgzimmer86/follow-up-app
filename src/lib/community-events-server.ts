import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { CommunityEvent } from './community-events'

export async function campaignEvents(campaignId: string): Promise<CommunityEvent[]> {
  const client = await createClient()
  const events: CommunityEvent[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('community_events')
      .select('id,campaign_id,name,event_date,location,details,is_open,revision')
      .eq('campaign_id', campaignId).order('event_date', { ascending: false }).order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    events.push(...data)
    if (data.length < 500) return events
  }
}
