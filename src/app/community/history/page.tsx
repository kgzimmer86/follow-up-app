import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { DiscipleBackButton } from '@/components/follow-up/disciple-back-button'

export default async function CommunityHistoryPage() {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery />
  if (!access.user || !access.profile?.is_active || !['staff', 'admin'].includes(access.profile.role)) redirect('/community')

  // Use the signed-in client: group visibility remains governed by existing RLS.
  const client = await createClient()
  const { data: campaigns, error } = await client.from('follow_up_campaigns')
    .select('id,label').eq('status', 'archived').order('starts_on', { ascending: false })
  if (error) throw new Error(error.message)

  return <main className="mx-auto max-w-[980px] px-[18px] py-6 md:px-7">
    <DiscipleBackButton href="/community" />
    <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#15223a] md:text-3xl">Community History</h2>
    <p className="mt-2 text-sm leading-relaxed text-[#667085]">Choose a previous school year to view your area’s groups, attendance, and statistics. Archived years are read-only.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {campaigns?.map((campaign) => <Link key={campaign.id} href={`/community?campaign=${campaign.id}`} className="rounded-[22px] border border-[#e4e7ec] bg-white p-5 shadow-sm transition hover:border-[#b2ccff] hover:bg-[#fbfdff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3]">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#667085]">Archived school year</span>
        <h3 className="mt-1 break-words text-xl font-extrabold text-[#15223a]">{campaign.label}</h3>
        <p className="mt-3 text-sm font-bold text-[#175cd3]">View groups <span aria-hidden="true">→</span></p>
      </Link>)}
    </div>
    {!campaigns?.length && <p className="mt-5 rounded-2xl border border-[#e4e7ec] bg-white p-6 text-sm text-[#667085]">No previous school years have been archived yet.</p>}
  </main>
}
