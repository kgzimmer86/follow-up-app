import Link from 'next/link'
import {
  notFound,
  redirect,
} from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type PageProps = {
  params: Promise<{
    leaderId: string
  }>
}

type LeaderRow = {
  id: string
  display_name: string | null
  role: 'student_leader' | 'discipler'
  default_area_id: string | null
  default_area_name: string | null
  assigned_contacts: number | string
  engaged_contacts: number | string
  engagement_percent: number | string
  go_backs: number | string
  needs_attention: number | string
  interactions_this_week: number | string
  last_activity_at: string | null
  direct_disciple_count: number | string
}

type ContactRow = {
  id: string
  display_name: string
  status: string
  location_name: string | null
  house_name: string | null
  room_or_address: string | null
  location_resolution: string | null
  engaged: boolean
  never_attempted: boolean
  stale_go_back: boolean
  last_activity_at: string | null
}

type ActivityRow = {
  id: string
  contact_id: string
  contact_name: string
  event_type: string
  occurred_at: string
  notes: string | null
}

type DetailWorkspace = {
  leader: LeaderRow | null
  assigned_contacts: ContactRow[]
  recent_activity: ActivityRow[]
  disciples: LeaderRow[]
}

export default async function ManageLeaderDetailPage({
  params,
}: PageProps) {
  const { leaderId } = await params
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
    'get_manage_leader_detail',
    {
      p_leader_id: leaderId,
    }
  )

  if (error) {
    throw new Error(error.message)
  }

  const workspace =
    data as DetailWorkspace

  if (!workspace.leader) {
    notFound()
  }

  const leader = workspace.leader

  const assigned =
    toNumber(leader.assigned_contacts)

  const engaged =
    toNumber(leader.engaged_contacts)

  const engagement =
    clampPercent(
      toNumber(
        leader.engagement_percent
      )
    )

  const goBacks =
    toNumber(leader.go_backs)

  const attention =
    toNumber(
      leader.needs_attention
    )

  const interactionsThisWeek =
    toNumber(
      leader.interactions_this_week
    )

  const isDiscipler =
    leader.role === 'discipler'

  const attentionContacts =
    workspace.assigned_contacts.filter(
      (contact) =>
        contact.never_attempted ||
        contact.stale_go_back
    )

  const otherContacts =
    workspace.assigned_contacts.filter(
      (contact) =>
        !contact.never_attempted &&
        !contact.stale_go_back
    )

  return (
    <main className="mx-auto max-w-[1080px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <Link
            href="/manage/leaders"
            className="inline-flex items-center text-xs font-extrabold text-[#175cd3] hover:underline"
          >
            ← Leaders
          </Link>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
                  {leaderName(leader)}
                </h1>

                <RoleBadge
                  role={leader.role}
                />
              </div>

              <p className="mt-2 text-sm font-semibold text-[#667085]">
                {leader.default_area_name ??
                  'No default ministry area'}
              </p>
            </div>

            {attention > 0 && (
              <span className="rounded-full bg-[#fff8eb] px-3 py-2 text-xs font-extrabold text-[#b54708]">
                {attention}{' '}
                {attention === 1
                  ? 'contact needs'
                  : 'contacts need'}{' '}
                attention
              </span>
            )}
          </div>

          <ManageTabs role={profile.role} />
        </div>

        <div className="space-y-7 p-5 md:p-6">
          {isDiscipler && (
            <section>
              <SectionHeading
                eyebrow="Personal Follow Up"
                title="Their assigned contacts"
              />

              <div className="mt-4 rounded-[20px] border border-[#e4e7ec] bg-white p-4 md:p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                      Contact engagement
                    </div>

                    <div className="mt-1 text-lg font-extrabold text-[#15223a]">
                      {engaged} of {assigned}{' '}
                      assigned contacts engaged
                    </div>
                  </div>

                  <div className="text-2xl font-black text-[#15223a]">
                    {engagement}%
                  </div>
                </div>

                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#eef0f3]">
                  <div
                    className="h-full rounded-full bg-[#175cd3]"
                    style={{
                      width: `${engagement}%`,
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MetricCard
                    value={assigned}
                    label="Assigned"
                  />

                  <MetricCard
                    value={engaged}
                    label="Engaged"
                  />

                  <MetricCard
                    value={goBacks}
                    label="Go Backs"
                  />

                  <MetricCard
                    value={
                      interactionsThisWeek
                    }
                    label="Interactions this week"
                  />
                </div>

                <div className="mt-4 text-xs font-semibold text-[#667085]">
                  {leader.last_activity_at
                    ? `Last personal activity ${fullDate(
                        leader.last_activity_at
                      )}`
                    : 'No personal Follow Up activity recorded yet.'}
                </div>
              </div>
            </section>
          )}

          {attentionContacts.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="Needs Attention"
                title={`${attentionContacts.length} ${
                  attentionContacts.length === 1
                    ? 'contact needs'
                    : 'contacts need'
                } follow-up`}
              />

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                These contacts have either never
                been attempted or have a Go Back
                that has been quiet for 7+ days.
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {attentionContacts.map(
                  (contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      attention
                    />
                  )
                )}
              </div>
            </section>
          )}

          <section>
            <SectionHeading
              eyebrow={
                isDiscipler
                  ? 'Contacts'
                  : 'Personal Follow Up'
              }
              title={
                attentionContacts.length > 0
                  ? `Other assigned contacts (${otherContacts.length})`
                  : `${assigned} assigned ${
                      assigned === 1
                        ? 'contact'
                        : 'contacts'
                    }`
              }
            />

            {workspace.assigned_contacts.length ===
            0 ? (
              <EmptyState>
                No primary contacts are assigned
                to this leader.
              </EmptyState>
            ) : otherContacts.length === 0 &&
              attentionContacts.length > 0 ? (
              <EmptyState>
                All assigned contacts currently
                need attention.
              </EmptyState>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(attentionContacts.length > 0
                  ? otherContacts
                  : workspace.assigned_contacts
                ).map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeading
              eyebrow="Recent Activity"
              title="Their personal Follow Up"
            />

            {workspace.recent_activity.length ===
            0 ? (
              <EmptyState>
                No personal activity has been
                recorded yet.
              </EmptyState>
            ) : (
              <div className="mt-3 space-y-2.5">
                {workspace.recent_activity.map(
                  (activity) => (
                    <Link
                      key={activity.id}
                      href={`/contacts/${activity.contact_id}`}
                      className="block rounded-[16px] border border-[#e4e7ec] bg-white p-4 transition hover:border-[#98a2b3]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-extrabold text-[#15223a]">
                          {activity.event_type ===
                          'knock'
                            ? 'Knocked'
                            : 'Interaction'}{' '}
                          with{' '}
                          {
                            activity.contact_name
                          }
                        </div>

                        <div className="text-[11px] font-bold text-[#98a2b3]">
                          {fullDate(
                            activity.occurred_at
                          )}
                        </div>
                      </div>

                      {activity.notes && (
                        <p className="mt-2 text-sm leading-5 text-[#667085]">
                          {activity.notes}
                        </p>
                      )}
                    </Link>
                  )
                )}
              </div>
            )}
          </section>

          {isDiscipler && (
            <section>
              <SectionHeading
                eyebrow="Discipleship"
                title={`Their disciples (${workspace.disciples.length})`}
              />

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                These cards show each disciple&apos;s
                own Follow Up activity.
              </p>

              {workspace.disciples.length ===
              0 ? (
                <EmptyState>
                  No current disciples are assigned
                  to this Discipler.
                </EmptyState>
              ) : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {workspace.disciples.map(
                    (disciple) => (
                      <DiscipleCard
                        key={disciple.id}
                        disciple={disciple}
                      />
                    )
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </main>
  )
}

function ManageTabs({
  role,
}: {
  role: string
}) {
  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-1.5">
      <Link
        href="/manage"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Ministry Areas
      </Link>

      <Link
        href="/manage/leaders"
        className="shrink-0 rounded-[10px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white"
      >
        Leaders
      </Link>

      <Link
        href="/assign-contacts"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Assign Contacts
      </Link>

      <Link
        href="/manage/import-survey"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Import Survey
      </Link>

      {role === 'admin' && (
        <Link
          href="/admin/users"
          className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
        >
          Users
        </Link>
      )}
    </nav>
  )
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
        {title}
      </h2>
    </div>
  )
}

function MetricCard({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[14px] bg-[#f9fafb] px-3 py-3.5 text-center">
      <div className="text-xl font-black leading-none text-[#15223a]">
        {value}
      </div>

      <div className="mt-1.5 text-[10px] font-bold text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function ContactCard({
  contact,
  attention = false,
}: {
  contact: ContactRow
  attention?: boolean
}) {
  return (
    <Link
      href={`/contacts/${contact.id}`}
      className={[
        'rounded-[18px] border p-4 transition hover:shadow-[0_3px_12px_rgba(16,24,40,0.05)]',
        attention
          ? 'border-[#fedf89] bg-[#fffaf0] hover:border-[#fdb022]'
          : 'border-[#e4e7ec] bg-white hover:border-[#98a2b3]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold text-[#15223a]">
            {contact.display_name}
          </h3>

          <p className="mt-1 text-xs text-[#667085]">
            {contactLocation(contact)}
          </p>
        </div>

        <StatusBadge
          status={contact.status}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {contact.engaged && (
          <Pill
            label="Engaged"
            tone="green"
          />
        )}

        {contact.never_attempted && (
          <Pill
            label="Never attempted"
            tone="warn"
          />
        )}

        {contact.stale_go_back && (
          <Pill
            label="Go Back quiet 7+ days"
            tone="warn"
          />
        )}
      </div>

      <div className="mt-3 text-[11px] font-semibold text-[#98a2b3]">
        {contact.last_activity_at
          ? `Last activity ${fullDate(
              contact.last_activity_at
            )}`
          : 'No activity recorded'}
      </div>
    </Link>
  )
}

function DiscipleCard({
  disciple,
}: {
  disciple: LeaderRow
}) {
  const assigned =
    toNumber(disciple.assigned_contacts)

  const engaged =
    toNumber(disciple.engaged_contacts)

  const engagement =
    clampPercent(
      toNumber(
        disciple.engagement_percent
      )
    )

  const attention =
    toNumber(
      disciple.needs_attention
    )

  return (
    <Link
      href={`/manage/leaders/${disciple.id}`}
      className="block rounded-[20px] border border-[#e4e7ec] bg-white p-4 transition hover:border-[#98a2b3] hover:shadow-[0_4px_14px_rgba(16,24,40,0.06)] md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-[#15223a]">
              {leaderName(disciple)}
            </h3>

            <RoleBadge
              role={disciple.role}
            />
          </div>

          <p className="mt-1 text-xs font-semibold text-[#667085]">
            {disciple.default_area_name ??
              'No default ministry area'}
          </p>
        </div>

        {attention > 0 && (
          <span className="rounded-full bg-[#fff8eb] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708]">
            {attention} need
            {attention === 1
              ? 's'
              : ''}{' '}
            attention
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-sm font-extrabold text-[#15223a]">
          {engaged} of {assigned} engaged
        </div>

        <div className="text-lg font-black text-[#15223a]">
          {engagement}%
        </div>
      </div>

      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#eef0f3]">
        <div
          className="h-full rounded-full bg-[#175cd3]"
          style={{
            width: `${engagement}%`,
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricCard
          value={assigned}
          label="Assigned"
        />

        <MetricCard
          value={engaged}
          label="Engaged"
        />

        <MetricCard
          value={
            toNumber(
              disciple.go_backs
            )
          }
          label="Go Backs"
        />
      </div>

      <div className="mt-3 text-right text-[11px] font-extrabold text-[#175cd3]">
        View leader →
      </div>
    </Link>
  )
}

function RoleBadge({
  role,
}: {
  role:
    | 'student_leader'
    | 'discipler'
}) {
  if (role === 'discipler') {
    return (
      <span className="rounded-full bg-[#f4f3ff] px-2.5 py-1 text-[10px] font-extrabold text-[#5925dc]">
        Discipler
      </span>
    )
  }

  return (
    <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-extrabold text-[#3538cd]">
      Student Leader
    </span>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  const config =
    status === 'go_back'
      ? {
          label: 'Go Back',
          className:
            'bg-[#eef4ff] text-[#3538cd]',
        }
      : status === 'involved'
        ? {
            label: 'Involved',
            className:
              'bg-[#ecfdf3] text-[#027a48]',
          }
        : status ===
            'attempted_contact'
          ? {
              label: 'Attempted',
              className:
                'bg-[#fff4e5] text-[#9a4b00]',
            }
          : {
              label: 'Uncontacted',
              className:
                'bg-[#f2f4f7] text-[#475467]',
            }

  return (
    <span
      className={[
        'shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold',
        config.className,
      ].join(' ')}
    >
      {config.label}
    </span>
  )
}

function Pill({
  label,
  tone,
}: {
  label: string
  tone: 'green' | 'warn'
}) {
  return (
    <span
      className={[
        'rounded-full px-2.5 py-1 text-[10px] font-extrabold',
        tone === 'green'
          ? 'bg-[#ecfdf3] text-[#027a48]'
          : 'bg-[#fff8eb] text-[#b54708]',
      ].join(' ')}
    >
      {label}
    </span>
  )
}

function EmptyState({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mt-3 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-6 text-center text-sm text-[#667085]">
      {children}
    </div>
  )
}

function contactLocation(
  contact: ContactRow
) {
  if (
    contact.location_resolution ===
    'no_address'
  ) {
    return 'No address'
  }

  return (
    contact.room_or_address ||
    contact.house_name ||
    contact.location_name ||
    'Location not recorded'
  )
}

function leaderName(
  leader: LeaderRow
) {
  return (
    leader.display_name?.trim() ||
    'Unnamed leader'
  )
}

function clampPercent(
  value: number
) {
  return Math.max(
    0,
    Math.min(100, value)
  )
}

function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const parsed =
    Number(value ?? 0)

  return Number.isFinite(parsed)
    ? parsed
    : 0
}

function fullDate(
  value: string
) {
  const date = new Date(value)

  if (
    Number.isNaN(date.getTime())
  ) {
    return 'unknown'
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Detroit',
    }
  ).format(date)
}
