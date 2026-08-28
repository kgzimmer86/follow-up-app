import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type GodAtWorkMetricsRow = {
  week_start: string
  week_spiritual_conversations: number
  total_spiritual_conversations: number
  week_gospel_conversations: number
  total_gospel_conversations: number
  week_received_christ: number
  total_received_christ: number
}

export default async function GodAtWorkPage() {
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
    profile.role === 'pending' ||
    !profile.is_active
  ) {
    redirect('/')
  }

  const {
    data: metricsData,
    error: metricsError,
  } = await supabase.rpc(
    'get_god_at_work_metrics'
  )

  if (metricsError) {
    throw new Error(metricsError.message)
  }

  const metrics =
    ((metricsData ?? [])[0] ??
      null) as GodAtWorkMetricsRow | null

  const weekStart =
    metrics?.week_start ?? null

  const cards = [
    {
      title: 'Spiritual Conversations',
      description:
        'Interactions where someone had a spiritual conversation, completed the interview, heard the gospel, or received Christ.',
      week:
        metrics?.week_spiritual_conversations ??
        0,
      total:
        metrics?.total_spiritual_conversations ??
        0,
      tone: 'blue',
    },
    {
      title: 'Gospel Conversations',
      description:
        'Interactions where the KGP was shared. Receiving Christ is included automatically.',
      week:
        metrics?.week_gospel_conversations ??
        0,
      total:
        metrics?.total_gospel_conversations ??
        0,
      tone: 'gold',
    },
    {
      title: 'Received Christ',
      description:
        'Students who have received Christ through Follow Up.',
      week:
        metrics?.week_received_christ ??
        0,
      total:
        metrics?.total_received_christ ??
        0,
      tone: 'green',
    },
  ] as const

  return (
    <main className="mx-auto max-w-[900px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
            Follow Up
          </p>

          <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
            God at Work
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
            Celebrate the conversations God is
            opening and the students who are
            responding to the gospel.
          </p>
        </div>

        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                This Week
              </div>

              <div className="mt-1 text-sm font-bold text-[#15223a]">
                {weekStart
                  ? `Since ${formatWeekStart(
                      weekStart
                    )}`
                  : 'Current week'}
              </div>
            </div>

            <div className="rounded-full bg-[#f2f4f7] px-3 py-1.5 text-[11px] font-bold text-[#667085]">
              Current Follow Up campaign
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                description={
                  card.description
                }
                week={card.week}
                total={card.total}
                tone={card.tone}
              />
            ))}
          </div>

          <div className="mt-5 rounded-[16px] border border-[#e4e7ec] bg-white px-4 py-3.5 text-xs leading-5 text-[#667085]">
            <strong className="text-[#15223a]">
              How these numbers work:
            </strong>{' '}
            each qualifying interaction counts
            once as a spiritual conversation,
            even when several spiritual milestones
            happen in the same conversation.
            Gospel conversations count KGP shares,
            and Received Christ counts distinct
            students.
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricCard({
  title,
  description,
  week,
  total,
  tone,
}: {
  title: string
  description: string
  week: number
  total: number
  tone: 'blue' | 'gold' | 'green'
}) {
  const classes =
    metricToneClasses(tone)

  return (
    <article
      className={[
        'overflow-hidden rounded-[20px] border bg-white',
        classes.border,
      ].join(' ')}
    >
      <div
        className={[
          'h-1.5',
          classes.bar,
        ].join(' ')}
      />

      <div className="p-4">
        <div className="text-sm font-extrabold text-[#15223a]">
          {title}
        </div>

        <div className="mt-4 flex items-end gap-2">
          <span
            className={[
              'text-[46px] font-black leading-none tracking-[-0.05em]',
              classes.number,
            ].join(' ')}
          >
            {week}
          </span>

          <span className="pb-1 text-xs font-bold text-[#667085]">
            this week
          </span>
        </div>

        <div className="mt-4 border-t border-[#eef0f3] pt-3">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#98a2b3]">
            Campaign Total
          </div>

          <div className="mt-0.5 text-xl font-extrabold text-[#15223a]">
            {total}
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-[#667085]">
          {description}
        </p>
      </div>
    </article>
  )
}

function metricToneClasses(
  tone: 'blue' | 'gold' | 'green'
) {
  switch (tone) {
    case 'gold':
      return {
        border: 'border-[#f4e8a6]',
        bar: 'bg-[#ffcb05]',
        number: 'text-[#8c5500]',
      }

    case 'green':
      return {
        border: 'border-[#abefc6]',
        bar: 'bg-[#13795b]',
        number: 'text-[#027a48]',
      }

    case 'blue':
    default:
      return {
        border: 'border-[#dbe8f8]',
        bar: 'bg-[#2f80ed]',
        number: 'text-[#175cd3]',
      }
  }
}

function formatWeekStart(
  value: string
) {
  const [year, month, day] =
    value.split('-').map(Number)

  const date = new Date(
    year,
    month - 1,
    day
  )

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
    }
  ).format(date)
}