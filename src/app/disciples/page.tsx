import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type DiscipleDashboardRow = {
  disciple_id: string
  display_name: string
  email: string | null
  role: string
  area_name: string | null
  direct_disciple_count: number | string
  chain_descendant_count: number | string
  primary_contacts: number | string
  week_interactions: number | string
  week_spiritual_conversations: number | string
  week_gospel_conversations: number | string
  go_backs: number | string
  unattempted: number | string
  stale_go_backs: number | string
  last_activity_at: string | null
}

export default async function DisciplesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (
    !profile ||
    !profile.is_active ||
    !['discipler', 'staff', 'admin'].includes(
      profile.role
    )
  ) {
    redirect('/')
  }

  const {
    data: dashboardData,
    error: dashboardError,
  } = await supabase.rpc(
    'get_my_disciples_dashboard'
  )

  if (dashboardError) {
    throw new Error(dashboardError.message)
  }

  const disciples =
    (dashboardData ?? []) as DiscipleDashboardRow[]

  const weekInteractions = disciples.reduce(
    (sum, disciple) =>
      sum +
      toNumber(
        disciple.week_interactions
      ),
    0
  )

  const needsAttention = disciples.reduce(
    (sum, disciple) =>
      sum +
      toNumber(disciple.unattempted) +
      toNumber(
        disciple.stale_go_backs
      ),
    0
  )

  return (
    <main className="mx-auto max-w-[980px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
                Discipleship & Coaching
              </p>

              <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
                My Disciples
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
                Help the people you disciple keep
                moving toward students with courage,
                care, and clarity.
              </p>
            </div>

            <Link
              href="/assign-contacts"
              className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#113a67]"
            >
              Assign Contacts
            </Link>
          </div>
        </div>

        <div className="p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              value={weekInteractions}
              label="team interactions this week"
            />

            <SummaryCard
              value={needsAttention}
              label="follow-up items needing attention"
              attention={
                needsAttention > 0
              }
            />
          </div>

          <div className="mt-7">
            <h2 className="text-lg font-extrabold tracking-[-0.02em] text-[#15223a]">
              My Disciples
            </h2>

            <p className="mt-1 text-xs leading-5 text-[#667085]">
              Your direct disciples are shown
              here. If someone disciples others,
              keep moving down their discipleship
              chain from their coaching page.
            </p>
          </div>

          {disciples.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-7 text-center">
              <div className="text-sm font-extrabold text-[#15223a]">
                No disciples assigned yet.
              </div>

              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#667085]">
                Once a current discipleship
                relationship is assigned to you,
                that person will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {disciples.map(
                (disciple) => (
                  <DiscipleCard
                    key={
                      disciple.disciple_id
                    }
                    disciple={disciple}
                  />
                )
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function SummaryCard({
  value,
  label,
  attention = false,
}: {
  value: number
  label: string
  attention?: boolean
}) {
  return (
    <div
      className={[
        'rounded-[18px] border p-5',
        attention
          ? 'border-[#fedf89] bg-[#fff8eb]'
          : 'border-[#e4e7ec] bg-white',
      ].join(' ')}
    >
      <div
        className={[
          'text-[36px] font-black leading-none tracking-[-0.04em]',
          attention
            ? 'text-[#b54708]'
            : 'text-[#15223a]',
        ].join(' ')}
      >
        {value}
      </div>

      <div className="mt-2 text-sm font-bold leading-5 text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function DiscipleCard({
  disciple,
}: {
  disciple: DiscipleDashboardRow
}) {
  const spiritual = toNumber(
    disciple.week_spiritual_conversations
  )
  const gospel = toNumber(
    disciple.week_gospel_conversations
  )
  const goBacks = toNumber(
    disciple.go_backs
  )
  const unattempted = toNumber(
    disciple.unattempted
  )
  const staleGoBacks = toNumber(
    disciple.stale_go_backs
  )
  const directDisciples = toNumber(
    disciple.direct_disciple_count
  )
  const chainDescendants = toNumber(
    disciple.chain_descendant_count
  )
  const attention =
    unattempted + staleGoBacks

  return (
    <Link
      href={`/disciples/${disciple.disciple_id}`}
      className="block overflow-hidden rounded-[20px] border border-[#e4e7ec] bg-white transition hover:border-[#b2ccff] hover:shadow-[0_4px_16px_rgba(16,24,40,0.06)]"
    >
      <article className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00274c] text-sm font-black text-white">
              {initials(
                disciple.display_name
              )}
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold text-[#15223a]">
                {disciple.display_name}
              </h3>

              <p className="mt-0.5 text-xs font-semibold text-[#667085]">
                {formatRole(
                  disciple.role
                )}
                {disciple.area_name
                  ? ` • ${disciple.area_name}`
                  : ''}
              </p>
            </div>
          </div>

          <span
            className={[
              'shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold',
              attention > 0
                ? 'bg-[#fff3cd] text-[#8c5500]'
                : 'bg-[#ecfdf3] text-[#027a48]',
            ].join(' ')}
          >
            {attention > 0
              ? 'Needs attention'
              : 'Active'}
          </span>
        </div>

        {directDisciples > 0 && (
          <div className="mt-4 rounded-[13px] border border-[#dbe8f8] bg-[#f5f9ff] px-3 py-2.5">
            <div className="text-xs font-extrabold text-[#175cd3]">
              Discipleship chain
            </div>

            <div className="mt-1 text-xs leading-5 text-[#667085]">
              {directDisciples}{' '}
              direct{' '}
              {directDisciples === 1
                ? 'disciple'
                : 'disciples'}
              {chainDescendants > 0
                ? ` • ${chainDescendants} ${
                    chainDescendants === 1
                      ? 'person'
                      : 'people'
                  } farther down the chain`
                : ''}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric
            value={spiritual}
            label="Spiritual convos"
          />

          <Metric
            value={gospel}
            label="Gospel convos"
          />

          <Metric
            value={goBacks}
            label="Go Backs"
          />

          <Metric
            value={attention}
            label="Need attention"
            attention={
              attention > 0
            }
          />
        </div>

        {attention > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {unattempted > 0 && (
              <span className="rounded-full bg-[#fff8eb] px-2.5 py-1 text-[10px] font-extrabold text-[#b54708]">
                {unattempted} assigned,
                never attempted
              </span>
            )}

            {staleGoBacks > 0 && (
              <span className="rounded-full bg-[#fff8eb] px-2.5 py-1 text-[10px] font-extrabold text-[#b54708]">
                {staleGoBacks} Go{' '}
                {staleGoBacks === 1
                  ? 'Back'
                  : 'Backs'}{' '}
                quiet 7+ days
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0f3] pt-3">
          <span className="text-[11px] font-semibold text-[#98a2b3]">
            {disciple.last_activity_at
              ? `Last activity ${shortDate(
                  disciple.last_activity_at
                )}`
              : 'No activity recorded'}
          </span>

          <span className="text-xs font-extrabold text-[#175cd3]">
            View coaching →
          </span>
        </div>
      </article>
    </Link>
  )
}

function Metric({
  value,
  label,
  attention = false,
}: {
  value: number
  label: string
  attention?: boolean
}) {
  return (
    <div
      className={[
        'rounded-[13px] border px-3 py-3',
        attention
          ? 'border-[#fedf89] bg-[#fff8eb]'
          : 'border-[#eef0f3] bg-[#f9fafb]',
      ].join(' ')}
    >
      <div
        className={[
          'text-xl font-black leading-none',
          attention
            ? 'text-[#b54708]'
            : 'text-[#15223a]',
        ].join(' ')}
      >
        {value}
      </div>

      <div className="mt-1.5 text-[10px] font-bold leading-4 text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function toNumber(
  value: number | string | null | undefined
) {
  const parsed = Number(value ?? 0)

  return Number.isFinite(parsed)
    ? parsed
    : 0
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatRole(role: string) {
  switch (role) {
    case 'student_leader':
      return 'Student Leader'

    case 'discipler':
      return 'Discipler'

    case 'staff':
      return 'Staff'

    case 'admin':
      return 'Admin'

    default:
      return role
  }
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
    }
  ).format(new Date(value))
}