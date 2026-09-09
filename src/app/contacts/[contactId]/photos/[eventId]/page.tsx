import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { createInteractionPhotoLink } from '@/lib/interaction-photo'

// Each actual visit gets a fresh private link, never a cached redirect.
export const dynamic = 'force-dynamic'

export default async function InteractionPhotoPage({ params }: {
  params: Promise<{ contactId: string; eventId: string }>
}) {
  const { contactId, eventId } = await params
  const contactHref = `/contacts/${encodeURIComponent(contactId)}`
  const retryHref = `${contactHref}/photos/${encodeURIComponent(eventId)}`
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <PhotoUnavailable contactHref={contactHref} retryHref={retryHref} />
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')

  let signedUrl: string | null
  try {
    signedUrl = await createInteractionPhotoLink(await createClient({ freshReads: true }), contactId, eventId)
  } catch {
    return <PhotoUnavailable contactHref={contactHref} retryHref={retryHref} />
  }
  if (!signedUrl) return <PhotoUnavailable contactHref={contactHref} />
  redirect(signedUrl)
}

function PhotoUnavailable({ contactHref, retryHref }: { contactHref: string; retryHref?: string }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <div className="rounded-[18px] border border-[#e4e7ec] bg-white p-6">
        <h1 className="text-xl font-extrabold text-[#15223a]">
          {retryHref ? 'We couldn’t open this photo.' : 'This photo is no longer available.'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">
          {retryHref ? 'Please check your connection and try again.' : 'The interaction or its photo may have been removed.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm font-extrabold">
          {retryHref && <a href={retryHref} className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-white">Try again</a>}
          <a href={contactHref} className="text-[#175cd3] hover:underline">Back to contact</a>
        </div>
      </div>
    </main>
  )
}
