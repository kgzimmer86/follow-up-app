import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { PersonalReportHeader } from '@/components/follow-up/personal-report-header'
import { personalReportPeriod } from '@/lib/personal-reports'
import { followUpActivityLabel, textPurposeSummary, type TextAttemptDetails } from '@/lib/text-attempts'

type Activity = TextAttemptDetails & {
  id: string; contact_id: string; contact_name: string; event_type: string; occurred_at: string; notes: string | null
  had_spiritual_conversation: boolean; interview_completed: boolean; kgp_shared: boolean
  received_christ: boolean; invited_to_community_group: boolean; has_photo: boolean
}

const actions = [
  ['had_spiritual_conversation', 'Spiritual conversation'], ['interview_completed', 'Interview completed'],
  ['kgp_shared', 'KGP shared'], ['received_christ', 'Received Christ'], ['invited_to_community_group', 'Invited to CG'],
] as const

export default async function MyActivityPage({ searchParams }: {
  searchParams: Promise<{ period?: string | string[]; page?: string }>
}) {
  const params = await searchParams
  const period = personalReportPeriod(params.period)
  const parsedPage = Number(params.page ?? 1)
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 100000 ? parsedPage : 1
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery />
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const { data, error } = await (await createClient()).rpc('get_my_personal_activity', { p_period: period, p_offset: (page - 1) * 25 })
  if (error || !data) return <LoadRecovery />
  const result = data as { has_campaign: boolean; has_more: boolean; activity: Activity[] }
  const returnTo = `/my-activity?period=${period}&page=${page}`
  return (
    <main className="mx-auto w-full max-w-[980px] px-[18px] py-[18px] md:px-7 md:py-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <PersonalReportHeader page="activity" period={period} />
        <div className="p-5 md:p-6">
          {!result.has_campaign ? <p className="text-sm text-[#667085]">There is no active Follow Up campaign.</p> : <>
            {!result.activity.length ? <p className="text-sm text-[#667085]">{page === 1 ? 'No activity logged for this period yet.' : 'No activity on this page.'}</p> : (
              <div className="relative">
                <div aria-hidden="true" className="absolute bottom-3 left-[9px] top-3 w-px bg-[#e4e7ec]" />
                <div className="grid gap-4">
                  {result.activity.map((entry) => (
                    <article key={entry.id} id={`activity-${entry.id}`} className="relative scroll-mt-28 pl-7">
                      <div aria-hidden="true" className={`absolute left-[2px] top-1.5 h-4 w-4 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.06)] ${entry.event_type === 'knock' ? 'bg-[#ffcb05]' : entry.event_type === 'text_attempt' ? 'bg-[#98a2b3]' : 'bg-[#13795b]'}`} />
                      <div className="min-w-0 rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h2 className="min-w-0 break-words text-sm font-extrabold text-[#15223a]">
                            {followUpActivityLabel(entry.event_type)} with{' '}
                            <Link prefetch={false} href={`/contacts/${entry.contact_id}?${new URLSearchParams({ tab: 'history', from: `${returnTo}#activity-${entry.id}` })}`} className="text-[#175cd3] hover:underline">{entry.contact_name}</Link>
                          </h2>
                          <time dateTime={entry.occurred_at} className="text-[11px] font-semibold text-[#667085]">
                            {new Date(entry.occurred_at).toLocaleString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </time>
                        </div>
                        {entry.event_type === 'text_attempt' && <p className="mt-2 break-words text-sm leading-6 text-[#475467]">{textPurposeSummary(entry.text_purposes, entry.text_event_name)}</p>}
                        {entry.event_type === 'interaction' && <div className="mt-2 flex flex-wrap gap-1.5">
                          {actions.filter(([key]) => entry[key]).map(([key, label]) => <span key={key} className="rounded-full border border-[#d0d5dd] bg-white px-2 py-1 text-[10px] font-extrabold text-[#475467]">{label}</span>)}
                        </div>}
                        {entry.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#475467]">{entry.notes}</p>}
                        {entry.has_photo && <a href={`/contacts/${entry.contact_id}/photos/${entry.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-extrabold text-[#175cd3] hover:underline">View interview notes photo</a>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {(page > 1 || result.has_more) && <nav aria-label="Activity pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-[#175cd3]">
              {page > 1 ? <Link prefetch={false} href={`/my-activity?period=${period}&page=${page - 1}`}>← Newer</Link> : <span />}
              <span className="text-xs text-[#667085]">Page {page}</span>
              {result.has_more ? <Link prefetch={false} href={`/my-activity?period=${period}&page=${page + 1}`}>Older →</Link> : <span />}
            </nav>}
          </>}
        </div>
      </section>
    </main>
  )
}
