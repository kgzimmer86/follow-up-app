import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppAccess } from '@/lib/supabase/access'

export default async function NotificationsPage() {
  const access = await getAppAccess()
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const db = await createClient()
  const [contacts, community] = await Promise.all([
    db.rpc('get_my_contact_attention'), db.rpc('community_workspace_counts'),
  ])
  const items = [
    { title: 'My Contacts', href: '/contacts', count: contacts.error ? null : contacts.data?.total },
    { title: 'My Invitations', href: '/community/invites', count: community.error ? null : community.data?.initial },
    { title: 'Groups I lead', href: '/community', count: community.error ? null : community.data?.groups },
  ]
  return <main className="mx-auto max-w-[760px] px-[18px] py-6">
    <h1 className="text-3xl font-extrabold tracking-tight text-[#15223a]">Your attention items</h1>
    <p className="mt-2 text-sm leading-6 text-[#667085]">Current counts may have changed since your notification. Group follow-ups include only groups you lead.</p>
    <div className="mt-5 grid gap-3">{items.map(item => <Link key={item.title} href={item.href} className="flex items-center justify-between rounded-[20px] border border-[#e4e7ec] bg-white p-5 font-bold text-[#15223a]">
      <span>{item.title}</span><span>{item.count ?? 'Unavailable'} →</span>
    </Link>)}</div>
    <Link href="/profile" className="mt-5 inline-block text-sm font-bold text-[#175cd3] underline">Manage phone notifications</Link>
  </main>
}
