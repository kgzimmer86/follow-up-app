import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { PersonalReportHeader } from '@/components/follow-up/personal-report-header'
import { personalReportPeriod } from '@/lib/personal-reports'

const metrics = [
  ['knocks', 'Knocks'], ['text_attempts', 'Text attempts'], ['interactions', 'Interactions'],
  ['spiritual_conversations', 'Spiritual conversations'], ['interviews_completed', 'Interviews completed'],
  ['kgp_shared', 'KGP shared'], ['received_christ', 'Received Christ'], ['cg_invitations', 'Invited to CG'],
] as const

type Stats = { has_campaign: boolean } & Record<typeof metrics[number][0], number>

export default async function MyStatsPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const period = personalReportPeriod((await searchParams).period)
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery />
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const { data, error } = await (await createClient()).rpc('get_my_personal_stats', { p_period: period })
  if (error || !data) return <LoadRecovery />
  const stats = data as Stats
  return (
    <main className="mx-auto w-full max-w-[980px] px-[18px] py-[18px] md:px-7 md:py-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <PersonalReportHeader page="stats" period={period} />
        <div className="p-5 md:p-6">
          {!stats.has_campaign ? <p className="text-sm text-[#667085]">There is no active Follow Up campaign.</p> : <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {metrics.map(([key, label]) => <div key={key} className="flex min-w-0 flex-col rounded-[16px] border border-[#e4e7ec] bg-white p-4">
                <dt className="mt-2 break-words text-xs font-bold leading-5 text-[#667085]">{label}</dt>
                <dd className="order-first text-3xl font-black tracking-[-0.04em] text-[#00274c]">{stats[key].toLocaleString('en-US')}</dd>
              </div>)}
            </dl>
            <p className="mt-4 text-xs leading-5 text-[#667085]">Counts reflect your logged events, not unique contacts. One interaction can include several actions. CG invitation texts count as text attempts.</p>
          </>}
        </div>
      </section>
    </main>
  )
}
