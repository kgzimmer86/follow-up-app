import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { createInteractionPhotoLink } from '@/lib/interaction-photo'

// Each actual visit gets a fresh private link, never a cached redirect.
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: {
  params: Promise<{ contactId: string; eventId: string }>
}) {
  const { contactId, eventId } = await params
  const contactHref = `/contacts/${encodeURIComponent(contactId)}`
  const retryHref = `${contactHref}/photos/${encodeURIComponent(eventId)}`
  const access = await getAppAccess()
  if (access.status === 'unavailable') return photoUnavailable(contactHref, retryHref)
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') return photoRedirect('/')

  let signedUrl: string | null
  try {
    signedUrl = await createInteractionPhotoLink(await createClient({ freshReads: true }), contactId, eventId)
  } catch {
    return photoUnavailable(contactHref, retryHref)
  }
  if (!signedUrl) return photoUnavailable(contactHref)
  return photoRedirect(signedUrl)
}

function photoRedirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  })
}

function photoUnavailable(contactHref: string, retryHref?: string) {
  // Paths contain only fixed segments and encodeURIComponent-encoded IDs.
  // A standalone response keeps the app startup shell out of photo requests.
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interview notes photo | Follow Up</title>
<style>body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#15223a}main{max-width:32rem;margin:auto;padding:2rem 1.25rem}section{border:1px solid #e4e7ec;border-radius:18px;padding:1.5rem}h1{font-size:1.25rem;margin:0}p{font-size:.875rem;line-height:1.5rem;color:#667085}nav{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-top:1.25rem}a{font-size:.875rem;font-weight:800;color:#175cd3}a.retry{background:#00274c;color:white;border-radius:11px;padding:.625rem 1rem;text-decoration:none}</style></head>
<body><main><section><h1>${retryHref ? 'We couldn’t open this photo.' : 'This photo is no longer available.'}</h1>
<p>${retryHref ? 'Please check your connection and try again.' : 'The interaction or its photo may have been removed.'}</p>
<nav>${retryHref ? `<a class="retry" href="${retryHref}">Try again</a>` : ''}<a href="${contactHref}">Back to contact</a></nav>
</section></main></body></html>`, {
    status: retryHref ? 503 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}
