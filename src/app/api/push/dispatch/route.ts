import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { pushBody, validPushEndpoint, type PushSnapshot } from '@/lib/push'

export const runtime = 'nodejs'
export const maxDuration = 60

type Job = { id: string; lease: string; endpoint: string; p256dh: string; auth: string; snapshot: PushSnapshot; sentAt: number }

export async function POST(request: Request) {
  const startedAt = Date.now()
  const secret = process.env.PUSH_CRON_SECRET
  const supplied = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return new Response('Unauthorized', { status: 401 })
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!publicKey || !privateKey || !subject || !serviceKey || !url) return new Response('Push is not configured', { status: 503 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) } })
  const { data, error } = await db.rpc('follow_up_push_claim')
  if (error) return new Response('Could not claim notifications', { status: 503 })
  const jobs = (data || []) as Job[]
  let sent = 0, expired = 0, retry = 0, ackErrors = 0
  // Bounded concurrency and timeout fit within the route's duration. A lease
  // recovers interrupted runs; success is acknowledged only after push accepts.
  for (let offset = 0; offset < jobs.length; offset += 10) {
    // Leave enough time for this batch's provider and acknowledgement timeout.
    // Unstarted jobs retain their lease and become eligible again in two minutes.
    if (Date.now() - startedAt > 38000) { retry += jobs.length - offset; break }
    await Promise.all(jobs.slice(offset, offset + 10).map(async job => {
      let result: 'sent' | 'expired' | 'retry' = 'retry'
      if (!validPushEndpoint(job.endpoint)) result = 'expired'
      else try {
        await webpush.sendNotification({ endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
          JSON.stringify({ subscriptionId: job.id, sentAt: job.sentAt, count: job.snapshot.total, body: pushBody(job.snapshot) }),
          { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, timeout: 5000, topic: 'follow-up-attention', urgency: 'normal' })
        result = 'sent'
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) result = 'expired'
        // Never log endpoint URLs, subscription keys, or provider response bodies.
      }
      if (result === 'sent') sent++
      else if (result === 'expired') expired++
      else retry++
      const { error: ackError } = await db.rpc('follow_up_push_finish', {
        p_id: job.id, p_lease: job.lease, p_fingerprint: job.snapshot.fingerprint, p_result: result,
      })
      if (ackError) ackErrors++
    }))
  }
  return Response.json({ checkedChanges: jobs.length, sent, expired, retry, ackErrors }, { status: ackErrors || retry ? 503 : 200 })
}
