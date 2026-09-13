import { notFound, redirect } from 'next/navigation'
import { ContactResultsPage, type ContactResultsSearchParams } from '@/components/follow-up/contact-results-page'
import { createClient } from '@/lib/supabase/server'

export default async function GroupContactsPage({ params, searchParams }: {
  params: Promise<{ groupId: string; segment: string }>
  searchParams: Promise<ContactResultsSearchParams>
}) {
  const { groupId, segment } = await params
  const labels: Record<string, string> = { involved: 'Involved', attended: 'Latest attendance', ever: 'Ever attended', roster: 'Current roster' }
  if (!/^[\da-f-]{36}$/i.test(groupId) || !Object.hasOwn(labels, segment)) notFound()
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/')
  // RLS must authorize the group before any roster or contact data is loaded.
  const { data: group, error } = await client.from('community_groups').select('*').eq('id', groupId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!group) notFound()
  const { data: campaign, error: campaignError } = await client.from('follow_up_campaigns').select('status').eq('id', group.campaign_id).single()
  if (campaignError) throw new Error(campaignError.message)
  const backHref = `/community/groups/${groupId}`
  if (campaign.status !== 'active') redirect(backHref)
  return <ContactResultsPage view="area" basePath={`${backHref}/contacts/${segment}`} searchParams={await searchParams}
    communityScope={{ groupId, segment, campaignId: group.campaign_id, title: `${group.name} · ${labels[segment]}`, backHref }} />
}
