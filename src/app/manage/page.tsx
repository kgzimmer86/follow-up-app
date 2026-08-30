import Link from 'next/link'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

type ManageArea = {
  id: string
  name: string
  area_type: string
  contacts: number | string
  attempted: number | string
  engaged: number | string
  go_backs: number | string
  involved: number | string
  assigned: number | string
  interested_unassigned: number | string
  never_attempted: number | string
  stale_go_backs: number | string
  new_believers_unassigned: number | string
  leaders: number | string
}

type MovementAttention = {
  interested_unassigned: number | string
  never_attempted: number | string
  stale_go_backs: number | string
  new_believers_unassigned: number | string
  no_address: number | string
}

type ManageWorkspace = {
  areas: ManageArea[]
  movement_attention: MovementAttention
}

const campusOrder = [
  'Central Campus',
  'The Hill',
  'North Campus',
  'The Village',
]

const affinityOrder = [
  'BIPOC',
  'International',
  'South Asian American',
  'Greek Life',
]

export default async function ManagePage() {
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
    'get_manage_ministry_areas'
  )

  if (error) {
    throw new Error(error.message)
  }

  const workspace = data as ManageWorkspace

  const campusAreas = [...workspace.areas]
    .filter(
      (area) =>
        area.area_type === 'campus_region'
    )
    .sort(
      (a, b) =>
        orderIndex(campusOrder, a.name) -
        orderIndex(campusOrder, b.name)
    )

  const affinityAreas = [...workspace.areas]
    .filter(
      (area) =>
        area.area_type === 'affinity'
    )
    .sort(
      (a, b) =>
        orderIndex(affinityOrder, a.name) -
        orderIndex(affinityOrder, b.name)
    )

  return (
    <main className="mx-auto max-w-[1080px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
            Staff Management
          </p>

          <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
            Manage Follow Up
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
            See where follow-up is moving,
            where coverage is thin, and where
            leaders may need help.
          </p>

          <ManageTabs
            role={profile.role}
            active="areas"
          />
        </div>

        <div className="p-5 md:p-6">
          <section>
            <div className="mb-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                Movement Attention
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                What needs attention
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <AttentionCard
                value={toNumber(
                  workspace
                    .movement_attention
                    .interested_unassigned
                )}
                label="interested + unassigned"
                tone="warn"
                href="/assign-contacts?queue=interested_unassigned"
              />

              <AttentionCard
                value={toNumber(
                  workspace
                    .movement_attention
                    .never_attempted
                )}
                label="never attempted"
                tone="warn"
                href="/assign-contacts?queue=never_attempted"
              />

              <AttentionCard
                value={toNumber(
                  workspace
                    .movement_attention
                    .stale_go_backs
                )}
                label="Go Backs quiet 7+ days"
                tone="blue"
                href="/assign-contacts?queue=stale_go_backs"
              />

              <AttentionCard
                value={toNumber(
                  workspace
                    .movement_attention
                    .new_believers_unassigned
                )}
                label="new believers unassigned"
                tone="green"
                href="/assign-contacts?queue=new_believers_unassigned"
              />

            </div>
          </section>

          <section className="mt-8">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                Geographic Follow Up
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                Campus areas
              </h2>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                Each campus area rolls up its
                residence halls and off-campus
                location bucket.
              </p>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {campusAreas.map((area) => (
                <AreaCard
                  key={area.id}
                  area={area}
                />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                Contextualized Ministry
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                Affinity ministries
              </h2>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                These contacts remain in their
                geographic area while also being
                visible to the appropriate
                contextualized ministry.
              </p>
            </div>

            {affinityAreas.length === 0 ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-6 text-sm text-[#667085]">
                No active affinity ministry
                areas are configured.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {affinityAreas.map((area) => (
                  <AreaCard
                    key={area.id}
                    area={area}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}


function AreaCard({
  area,
}: {
  area: ManageArea
}) {
  const contacts = toNumber(area.contacts)
  const attempted = toNumber(area.attempted)
  const engaged = toNumber(area.engaged)
  const assigned = toNumber(area.assigned)

  const attemptedPct = percentage(
    attempted,
    contacts
  )

  const engagedPct = percentage(
    engaged,
    contacts
  )

  const assignedPct = percentage(
    assigned,
    contacts
  )

  const interestedUnassigned = toNumber(
    area.interested_unassigned
  )

  const neverAttempted = toNumber(
    area.never_attempted
  )

  const staleGoBacks = toNumber(
    area.stale_go_backs
  )

  const newBelieversUnassigned = toNumber(
    area.new_believers_unassigned
  )

  return (
    <Link
      href={`/manage/areas/${area.id}`}
      className="block rounded-[20px] border border-[#e4e7ec] bg-white p-4 shadow-[0_1px_5px_rgba(16,24,40,0.03)] transition hover:border-[#98a2b3] hover:shadow-[0_6px_18px_rgba(16,24,40,0.07)] md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#175cd3]">
            {area.area_type === 'affinity'
              ? 'Affinity ministry'
              : 'Campus area'}
          </p>

          <h3 className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-[#15223a]">
            {area.name}
          </h3>
        </div>

        <span className="rounded-full bg-[#eef4ff] px-2.5 py-1.5 text-[10px] font-extrabold text-[#3538cd]">
          {toNumber(area.leaders)}{' '}
          {toNumber(area.leaders) === 1
            ? 'leader'
            : 'leaders'}
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
          value={toNumber(area.go_backs)}
          label="Go Backs"
        />

        <SmallMetric
          value={toNumber(area.involved)}
          label="Involved"
        />
      </div>

      <div className="mt-4 space-y-3">
        <CoverageRow
          label="Attempted"
          value={attemptedPct}
        />

        <CoverageRow
          label="Engaged"
          value={engagedPct}
        />

        <CoverageRow
          label="Assigned"
          value={assignedPct}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef0f3] pt-4">
        {interestedUnassigned > 0 && (
          <AttentionPill>
            {interestedUnassigned} interested
            + unassigned
          </AttentionPill>
        )}

        {neverAttempted > 0 && (
          <AttentionPill>
            {neverAttempted} never attempted
          </AttentionPill>
        )}

        {staleGoBacks > 0 && (
          <AttentionPill tone="blue">
            {staleGoBacks} stale Go{' '}
            {staleGoBacks === 1
              ? 'Back'
              : 'Backs'}
          </AttentionPill>
        )}

        {newBelieversUnassigned > 0 && (
          <AttentionPill tone="green">
            {newBelieversUnassigned} new{' '}
            {newBelieversUnassigned === 1
              ? 'believer'
              : 'believers'}{' '}
            unassigned
          </AttentionPill>
        )}

        {interestedUnassigned === 0 &&
          neverAttempted === 0 &&
          staleGoBacks === 0 &&
          newBelieversUnassigned === 0 && (
            <span className="rounded-full bg-[#ecfdf3] px-2.5 py-1.5 text-[10px] font-extrabold text-[#027a48]">
              No urgent coverage flags
            </span>
          )}
      </div>

      <div className="mt-4 flex items-center justify-end text-[11px] font-extrabold text-[#175cd3]">
        View area →
      </div>
    </Link>
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
  tone:
    | 'warn'
    | 'blue'
    | 'green'
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
        'group rounded-[14px] border px-3.5 py-3 transition hover:-translate-y-0.5 hover:shadow-[0_5px_14px_rgba(16,24,40,0.08)]',
        classes[tone],
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[24px] font-black leading-none tracking-[-0.04em]">
          {value}
        </div>

        <span
          aria-hidden="true"
          className="text-xs font-black opacity-55 transition group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          →
        </span>
      </div>

      <div className="mt-1.5 text-[10px] font-extrabold leading-4">
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

function AttentionPill({
  children,
  tone = 'warn',
}: {
  children: ReactNode
  tone?: 'warn' | 'blue' | 'green'
}) {
  const classes = {
    warn:
      'bg-[#fff8eb] text-[#b54708]',
    blue:
      'bg-[#eef4ff] text-[#3538cd]',
    green:
      'bg-[#ecfdf3] text-[#027a48]',
  }

  return (
    <span
      className={[
        'rounded-full px-2.5 py-1.5 text-[10px] font-extrabold',
        classes[tone],
      ].join(' ')}
    >
      {children}
    </span>
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

function orderIndex(
  order: string[],
  name: string
) {
  const index = order.indexOf(name)

  return index === -1
    ? order.length
    : index
}
