import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

type PageProps = {
  params: Promise<{
    areaId: string
  }>
}

type AreaInfo = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
  parent_name: string | null
}

type AreaMetrics = {
  contacts: number | string
  attempted: number | string
  engaged: number | string
  assigned: number | string
  go_backs: number | string
  involved: number | string
  interested_unassigned: number | string
  never_attempted: number | string
  stale_go_backs: number | string
  new_believers_unassigned: number | string
  interviews: number | string
  gospel_conversations: number | string
  received_christ: number | string
}

type LocationRow = {
  id: string
  name: string
  area_type: string
  contacts: number | string
  attempted: number | string
  engaged: number | string
  assigned: number | string
  go_backs: number | string
  interested_unassigned: number | string
}

type LeaderRow = {
  id: string
  display_name: string
  default_area_id: string | null
  default_area_name: string | null
  primary_contacts: number | string
  interactions: number | string
}

type AreaWorkspace = {
  area: AreaInfo
  metrics: AreaMetrics
  locations: LocationRow[]
  leaders: LeaderRow[]
}

export default async function ManageAreaPage({
  params,
}: PageProps) {
  const { areaId } = await params
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
    !['staff', 'admin'].includes(profile.role)
  ) {
    redirect('/')
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    'get_manage_ministry_area_detail',
    {
      p_area_id: areaId,
    }
  )

  if (error) {
    throw new Error(error.message)
  }

  const workspace = data as AreaWorkspace
  const metrics = workspace.metrics

  return (
    <main className="mx-auto max-w-[1080px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <Link
            href={
              workspace.area.parent_id
                ? `/manage/areas/${workspace.area.parent_id}`
                : '/manage'
            }
            className="inline-flex items-center text-xs font-extrabold text-[#175cd3] hover:underline"
          >
            ←{' '}
            {workspace.area.parent_name
              ? workspace.area.parent_name
              : 'Ministry Areas'}
          </Link>

          <div className="mt-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
              {areaTypeLabel(
                workspace.area.area_type
              )}
            </p>

            <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
              {workspace.area.name}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
              Coverage, follow-up needs, ministry
              activity, and leaders serving this
              area.
            </p>
          </div>

          <ManageTabs role={profile.role} active="areas" />
        </div>

        <div className="space-y-7 p-5 md:p-6">
          <section>
            <SectionHeading
              eyebrow="Needs Attention"
              title="Follow-up needs"
              description={`Where ${workspace.area.name} may need staff attention right now.`}
            />

            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <AttentionCard
                value={toNumber(
                  metrics.interested_unassigned
                )}
                label="interested + unassigned"
                tone="warn"
                href={`/assign-contacts?areaId=${workspace.area.id}&queue=interested_unassigned#assignment-search`}
              />

              <AttentionCard
                value={toNumber(
                  metrics.never_attempted
                )}
                label="never attempted"
                tone="warn"
                href={`/assign-contacts?areaId=${workspace.area.id}&queue=never_attempted#assignment-search`}
              />

              <AttentionCard
                value={toNumber(
                  metrics.stale_go_backs
                )}
                label="Go Backs quiet 7+ days"
                tone="blue"
                href={`/assign-contacts?areaId=${workspace.area.id}&queue=stale_go_backs#assignment-search`}
              />

              <AttentionCard
                value={toNumber(
                  metrics.new_believers_unassigned
                )}
                label="new believers unassigned"
                tone="green"
                href={`/assign-contacts?areaId=${workspace.area.id}&queue=new_believers_unassigned#assignment-search`}
              />
            </div>
          </section>

          {workspace.locations.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="Locations"
                title={`Locations in ${workspace.area.name}`}
                description="Open a location for a focused view of its follow-up coverage and needs."
              />

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {workspace.locations.map(
                  (location) => (
                    <LocationCard
                      key={location.id}
                      location={location}
                    />
                  )
                )}
              </div>
            </section>
          )}

          <section className="rounded-[18px] border border-[#d1fadf] bg-[#f6fef9] p-4 md:p-5">
            <SectionHeading
              eyebrow="God at Work"
              title={`What God has done in ${workspace.area.name}`}
            />

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <ActivityMetric
                value={toNumber(
                  metrics.interviews
                )}
                label="Interviews"
              />

              <ActivityMetric
                value={toNumber(
                  metrics.gospel_conversations
                )}
                label="Gospel conversations"
              />

              <ActivityMetric
                value={toNumber(
                  metrics.received_christ
                )}
                label="Received Christ"
              />
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <SectionHeading
                eyebrow="People"
                title={`Leaders serving ${workspace.area.name}`}
              />

              <Link
                href="/assign-contacts"
                className="shrink-0 text-xs font-extrabold text-[#175cd3] hover:underline"
              >
                Assign Contacts
              </Link>
            </div>

            {workspace.leaders.length === 0 ? (
              <div className="mt-3 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-6 text-center text-sm text-[#667085]">
                No Student Leaders are currently
                assigned to this area.
              </div>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {workspace.leaders.map(
                  (leader) => (
                    <LeaderCard
                      key={leader.id}
                      leader={leader}
                    />
                  )
                )}
              </div>
            )}
          </section>


        </div>
      </section>
    </main>
  )
}


function LocationCard({
  location,
}: {
  location: LocationRow
}) {
  const contacts = toNumber(
    location.contacts
  )

  const attempted = toNumber(
    location.attempted
  )

  const engaged = toNumber(
    location.engaged
  )

  const assigned = toNumber(
    location.assigned
  )

  const goBacks = toNumber(
    location.go_backs
  )

  const interestedUnassigned =
    toNumber(
      location.interested_unassigned
    )

  return (
    <Link
      href={`/manage/areas/${location.id}`}
      className="block rounded-[20px] border border-[#e4e7ec] bg-white p-4 shadow-[0_1px_5px_rgba(16,24,40,0.03)] transition hover:border-[#98a2b3] hover:shadow-[0_6px_18px_rgba(16,24,40,0.07)] md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#175cd3]">
            Ministry location
          </p>

          <h3 className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-[#15223a]">
            {location.name}
          </h3>
        </div>

        <span className="text-xs font-extrabold text-[#175cd3]">
          View →
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <SmallMetric
          value={contacts}
          label="Contacts"
        />

        <SmallMetric
          value={engaged}
          label="Engaged"
        />

        <SmallMetric
          value={goBacks}
          label="Go Backs"
        />

        <SmallMetric
          value={assigned}
          label="Assigned"
        />
      </div>

      <div className="mt-4 space-y-3">
        <CoverageRow
          label="Attempted"
          value={percentage(
            attempted,
            contacts
          )}
        />

        <CoverageRow
          label="Engaged"
          value={percentage(
            engaged,
            contacts
          )}
        />

        <CoverageRow
          label="Assigned"
          value={percentage(
            assigned,
            contacts
          )}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef0f3] pt-4">
        {interestedUnassigned > 0 ? (
          <span className="rounded-full bg-[#fff8eb] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708]">
            {interestedUnassigned}{' '}
            interested + unassigned
          </span>
        ) : (
          <span className="rounded-full bg-[#ecfdf3] px-2.5 py-1.5 text-[10px] font-extrabold text-[#027a48]">
            No unassigned interested contacts
          </span>
        )}

        {goBacks > 0 && (
          <span className="rounded-full bg-[#eef4ff] px-2.5 py-1.5 text-[10px] font-extrabold text-[#3538cd]">
            {goBacks}{' '}
            {goBacks === 1
              ? 'Go Back'
              : 'Go Backs'}
          </span>
        )}
      </div>
    </Link>
  )
}

function LeaderCard({
  leader,
}: {
  leader: LeaderRow
}) {
  return (
    <Link
      href={`/disciples/${leader.id}`}
      className="block rounded-[16px] border border-[#e4e7ec] bg-white p-4 transition hover:border-[#98a2b3] hover:shadow-[0_5px_14px_rgba(16,24,40,0.06)]"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#00274c] text-xs font-black text-white">
          {initials(leader.display_name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold text-[#15223a]">
                {leader.display_name}
              </div>

              <div className="mt-0.5 text-[11px] text-[#667085]">
                {leader.default_area_name ||
                  'No default area'}
              </div>
            </div>

            <span className="shrink-0 text-[11px] font-extrabold text-[#175cd3]">
              Coaching →
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1.5 text-[10px] font-extrabold text-[#475467]">
              {toNumber(
                leader.primary_contacts
              )}{' '}
              primary
            </span>

            <span className="rounded-full bg-[#eef4ff] px-2.5 py-1.5 text-[10px] font-extrabold text-[#3538cd]">
              {toNumber(
                leader.interactions
              )}{' '}
              interactions
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-[#15223a]">
        {title}
      </h2>

      {description && (
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
          {description}
        </p>
      )}
    </div>
  )
}

function AttentionCard({
  value,
  label,
  tone,
  href,
}: {
  value: number
  label: string
  tone: 'warn' | 'blue' | 'green'
  href: string
}) {
  const classes = {
    warn:
      'border-[#fedf89] bg-[#fff8eb] text-[#b54708]',
    blue:
      'border-[#b2ccff] bg-[#eef4ff] text-[#3538cd]',
    green:
      'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]',
  }

  return (
    <Link
      href={href}
      className={[
        'group rounded-[14px] border px-3 py-3 transition hover:-translate-y-0.5 hover:shadow-[0_5px_14px_rgba(16,24,40,0.08)]',
        classes[tone],
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[22px] font-black leading-none tracking-[-0.04em]">
          {value}
        </div>

        <span
          aria-hidden="true"
          className="text-xs font-black opacity-55 transition group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          →
        </span>
      </div>

      <div className="mt-1.5 text-[9px] font-extrabold leading-4">
        {label}
      </div>
    </Link>
  )
}

function SmallMetric({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[12px] bg-[#f9fafb] px-2.5 py-3 text-center">
      <div className="text-lg font-black leading-none text-[#15223a]">
        {value}
      </div>

      <div className="mt-1.5 text-[9px] font-bold text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function ActivityMetric({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[14px] bg-[#f9fafb] px-3 py-4 text-center">
      <div className="text-xl font-black leading-none text-[#15223a]">
        {value}
      </div>

      <div className="mt-2 text-[9px] font-bold leading-4 text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function MiniMetric({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[11px] bg-[#f9fafb] px-2 py-2.5 text-center">
      <div className="text-sm font-black text-[#15223a]">
        {value}
      </div>

      <div className="mt-0.5 text-[8px] font-bold text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function CoverageRow({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="grid grid-cols-[70px_1fr_38px] items-center gap-2">
      <span className="text-[10px] font-extrabold text-[#667085]">
        {label}
      </span>

      <div className="h-2 overflow-hidden rounded-full bg-[#eef0f3]">
        <div
          className="h-full rounded-full bg-[#175cd3]"
          style={{
            width: `${value}%`,
          }}
        />
      </div>

      <span className="text-right text-[10px] font-extrabold text-[#475467]">
        {value}%
      </span>
    </div>
  )
}

function percentage(
  value: number,
  total: number
) {
  if (total === 0) {
    return 0
  }

  return Math.round(
    (value / total) * 100
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

function areaTypeLabel(
  areaType: string
) {
  switch (areaType) {
    case 'campus_region':
      return 'Campus Area'

    case 'affinity':
      return 'Affinity Ministry'

    default:
      return 'Ministry Location'
  }
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
