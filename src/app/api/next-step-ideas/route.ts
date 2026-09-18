import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { generateNextStepIdeas } from '@/lib/next-step-ideas'

export const runtime = 'nodejs'
export const maxDuration = 60
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  // Test-only rollout. An explicit list of invented contact IDs is required;
  // enabling a preview flag alone never authorizes sending real records.
  if (process.env.NEXT_STEPS_AI_ENABLED !== 'true' || process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://tcbwepqkvnquxkbtaxcl.supabase.co') {
    return reply({ error: 'AI ideas are not enabled for this environment. You can write your own step.' }, 503)
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid request.' }, 403)
  const access = await getAppAccess()
  if (access.status === 'unavailable') return reply({ error: 'Couldn’t verify your account. Try again.' }, 503)
  if (!access.user || !access.profile?.is_active || !['admin','staff','discipler','student_leader'].includes(access.profile.role)) return reply({ error: 'Sign in with an approved account.' }, 403)
  let contactId: string
  try {
    const text = await request.text()
    if (text.length > 256) throw new Error('Invalid')
    const body = JSON.parse(text)
    if (typeof body.contactId !== 'string' || !uuid.test(body.contactId)) throw new Error('Invalid')
    contactId = body.contactId
  } catch { return reply({ error: 'Invalid contact.' }, 400) }
  const allowed = (process.env.NEXT_STEPS_AI_TEST_CONTACT_IDS ?? '').split(',').map(id => id.trim().toLowerCase())
  if (!allowed.includes(contactId.toLowerCase())) return reply({ error: 'AI testing is available only for designated fictional contacts. You can write your own step.' }, 403)
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_NEXT_STEPS_MODEL
  const guidance = process.env.NEXT_STEPS_MINISTRY_GUIDANCE
  if (!apiKey || !model || !guidance?.trim()) return reply({ error: 'AI ideas are awaiting private setup. You can write your own step.' }, 503)
  try {
    const db = await createClient({ freshReads: true })
    const { data: contact, error } = await db.from('follow_up_contacts')
      .select('id,student_id,campaign_id,primary_owner_id,status,year_at_um,jesus_interest,community_interest,interview_interest,interview_completed_at,kgp_shared_at,received_christ_at')
      .eq('id', contactId).maybeSingle()
    if (error) throw new Error('Unavailable')
    if (!contact || contact.primary_owner_id !== access.user.id) return reply({ error: 'Choose a contact assigned to you.' }, 403)
    const campaign = await db.from('follow_up_campaigns').select('status').eq('id', contact.campaign_id).maybeSingle()
    if (campaign.error) throw new Error('Unavailable')
    if (campaign.data?.status !== 'active') return reply({ error: 'This contact is not in an active campaign.' }, 403)
    // Fetch every history page, including old commitments. Refuse oversized
    // histories rather than silently discarding the oldest notes.
    const history: unknown[] = []
    for (let offset = 0; ; offset += 200) {
      const result = await db.from('follow_up_events')
        .select('event_type,occurred_at,notes,found_home,had_spiritual_conversation,interview_completed,kgp_shared,received_christ,invited_to_community_group,text_purposes,text_event_name')
        .eq('contact_id', contactId).order('occurred_at').order('id').range(offset, offset + 199)
      if (result.error) throw new Error('Unavailable')
      history.push(...(result.data ?? []))
      if (history.length > 1000) return reply({ error: 'This history needs staff review before AI suggestions. You can write your own step.' }, 422)
      if ((result.data?.length ?? 0) < 200) break
    }
    const [memberships, attendance, invitations] = await Promise.all([
      db.from('community_group_memberships').select('started_on,ended_on,community_groups!inner(name,campaign_id)').eq('student_id', contact.student_id).eq('community_groups.campaign_id', contact.campaign_id).limit(1000),
      db.from('community_group_attendance').select('is_present,community_group_meetings!inner(meeting_date,community_groups!inner(name,campaign_id))').eq('student_id', contact.student_id).eq('community_group_meetings.community_groups.campaign_id', contact.campaign_id).limit(1000),
      db.from('community_event_invitations').select('status,community_events!inner(name,event_date,campaign_id)').eq('student_id', contact.student_id).eq('community_events.campaign_id', contact.campaign_id).limit(1000),
    ])
    if ([memberships, attendance, invitations].some(result => result.error || (result.data?.length ?? 0) >= 1000)) throw new Error('Incomplete context')
    const { id: _id, student_id: _student, campaign_id: _campaign, primary_owner_id: _owner, ...survey } = contact
    void _id; void _student; void _campaign; void _owner
    const context = { asOf: new Date().toISOString(), contact: survey, history,
      community: { visibility: 'Only records the signed-in leader can access. Missing attendance is unknown.', memberships: memberships.data, attendance: attendance.data, invitations: invitations.data } }
    if (JSON.stringify(context).length > 100000) return reply({ error: 'This history is too long for this test. You can write your own step.' }, 422)
    const rate = await db.rpc('follow_up_next_step_ai_claim', { p_contact: contactId })
    if (rate.error) throw new Error('Unavailable')
    if (!rate.data) return reply({ error: 'Please wait a minute before requesting more ideas. Testing allows ten requests per hour.' }, 429)
    return reply({ ideas: await generateNextStepIdeas({ apiKey, model, guidance, context }) })
  } catch {
    // Never log contact context, guidance, credentials, or provider responses.
    return reply({ error: 'Couldn’t generate ideas right now. Try again, or write your own step.' }, 503)
  }
}
