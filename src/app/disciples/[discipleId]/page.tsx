import Link from 'next/link'
import {
  notFound,
  redirect,
} from 'next/navigation'

import { DiscipleBackButton } from '@/components/follow-up/disciple-back-button'
import { DiscipleContactAssignment } from '@/components/follow-up/disciple-contact-assignment'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  params: Promise<{
    discipleId: string
  }>
}

type CoachingProfile = {
  id: string
  display_name: string
  email: string | null
  role: string
  area_name: string | null
}

type CoachingMetrics = {
  week_interactions: number
  week_spiritual_conversations: number
  week_gospel_conversations: number
  go_backs: number
  unattempted: number
  stale_go_backs: number
  direct_primary_contacts: number
  chain_people: number
}

type DirectDisciple = {
  id: string
  display_name: string
  email: string | null
  role: string
  area_name: string | null
  direct_disciple_count: number
}

type AssignedContact = {
  id: string
  display_name: string
  status: string
  location: string | null
  house_name: string | null
  room_or_address: string | null
  last_activity_at: string | null
}

type AttentionContact = {
  id: string
  display_name: string
  owner_name: string
  status: string
  attention_type:
    | 'unattempted'
    | 'stale_go_back'
  location: string | null
  house_name: string | null
  room_or_address: string | null
  last_activity_at: string | null
}

type RecentActivity = {
  id: string
  event_type: string
  occurred_at: string
  notes: string | null
  contact_id: string
  contact_name: string
  performer_id: string
  performer_name: string
  had_spiritual_conversation: boolean
  interview_completed: boolean
  kgp_shared: boolean
  received_christ: boolean
}

type CoachingDetail = {
  profile: CoachingProfile
  metrics: CoachingMetrics
  direct_disciples: DirectDisciple[]
  assigned_contacts: AssignedContact[]
  attention_contacts: AttentionContact[]
  recent_activity: RecentActivity[]
}

type TargetAssignmentCandidates = {
  can_assign: boolean
  target_area_id: string | null
  target_area_name: string | null
  contacts: {
    id: string
    display_name: string
    location_name: string | null
    house_name: string | null
    room_or_address: string | null
    location_resolution: string | null
    status: string
    jesus_interest: string | null
    community_interest: string | null
    interview_interest: string | null
  }[]
}

export default async function DiscipleDetailPage({
  params,
}: PageProps) {
  const { discipleId } = await params
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
    data,
    error,
  } = await supabase.rpc(
    'get_disciple_coaching_detail',
    {
      p_disciple_id: discipleId,
    }
  )

  if (error) {
    if (
      error.message.includes(
        'not in your discipleship chain'
      )
    ) {
      notFound()
    }

    throw new Error(error.message)
  }

  if (!data) {
    notFound()
  }

  const detail = data as CoachingDetail
  const person = detail.profile
  const metrics = detail.metrics

  const {
    data: assignmentCandidateData,
    error: assignmentCandidateError,
  } = await supabase.rpc(
    'get_disciple_assignment_candidates',
    {
      p_assignee_id: person.id,
    }
  )

  if (assignmentCandidateError) {
    throw new Error(
      assignmentCandidateError.message
    )
  }

  const assignmentCandidates =
    assignmentCandidateData as
      | TargetAssignmentCandidates
      | null

  const canAssignToPerson =
    Boolean(
      assignmentCandidates?.can_assign
    )

  const eligibleUnassignedContacts =
    assignmentCandidates?.contacts ?? []

  const assignmentAreaName =
    assignmentCandidates?.target_area_name ??
    null
  const needsAttention =
    Number(metrics.unattempted ?? 0) +
    Number(metrics.stale_go_backs ?? 0)

  const unattempted =
    detail.attention_contacts.filter(
      (contact) =>
        contact.attention_type ===
        'unattempted'
    )

  const staleGoBacks =
    detail.attention_contacts.filter(
      (contact) =>
        contact.attention_type ===
        'stale_go_back'
    )

  return (
    <main className="mx-auto max-w-[980px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <div className="mb-3">
        <DiscipleBackButton />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#00274c] text-sm font-black text-white md:h-14 md:w-14 md:text-base">
              {initials(
                person.display_name
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
                Coaching
              </p>

              <h1 className="mt-0.5 truncate text-[27px] font-extrabold tracking-[-0.035em] text-[#15223a] md:text-[32px]">
                {person.display_name}
              </h1>

              <p className="mt-1 text-xs font-semibold text-[#667085]">
                {formatRole(
                  person.role
                )}
                {person.area_name
                  ? ` • ${person.area_name}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric
              value={
                metrics.week_spiritual_conversations
              }
              label="Spiritual convos"
            />

            <Metric
              value={
                metrics.week_gospel_conversations
              }
              label="Gospel convos"
            />

            <Metric
              value={
                metrics.go_backs
              }
              label="Go Backs"
            />

            <Metric
              value={needsAttention}
              label="Need attention"
              attention={
                needsAttention > 0
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-[#667085]">
            <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1">
              {
                metrics.direct_primary_contacts
              }{' '}
              primary{' '}
              {metrics.direct_primary_contacts ===
              1
                ? 'contact'
                : 'contacts'}
            </span>

            <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1">
              {
                metrics.week_interactions
              }{' '}
              team{' '}
              {metrics.week_interactions === 1
                ? 'interaction'
                : 'interactions'}{' '}
              this week
            </span>

            {metrics.chain_people > 1 && (
              <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[#175cd3]">
                {
                  metrics.chain_people
                }{' '}
                people in this branch
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 md:p-6">
          <Panel title="Needs attention">
            <p className="mb-4 text-xs leading-5 text-[#667085]">
              These are the exact contacts in
              this discipleship branch that may
              need coaching or a next step.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <AttentionQueue
                title="Assigned, never attempted"
                count={unattempted.length}
                contacts={unattempted}
                emptyText="Nothing in this queue right now."
              />

              <AttentionQueue
                title="Go Backs quiet 7+ days"
                count={staleGoBacks.length}
                contacts={staleGoBacks}
                emptyText="No stale Go Backs right now."
              />
            </div>
          </Panel>

          {detail.direct_disciples.length >
            0 && (
            <Panel title="Their Disciples">
              <p className="mb-4 text-xs leading-5 text-[#667085]">
                Continue down the discipleship
                chain. Use Back at the top of
                each page to return to the person
                you came from.
              </p>

              <div className="grid gap-3">
                {detail.direct_disciples.map(
                  (disciple) => (
                    <Link
                      key={disciple.id}
                      href={`/disciples/${disciple.id}`}
                      className="rounded-[16px] border border-[#e4e7ec] bg-white p-4 transition hover:border-[#b2ccff] hover:bg-[#f8fbff]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-xs font-black text-[#175cd3]">
                            {initials(
                              disciple.display_name
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-sm font-extrabold text-[#15223a]">
                              {
                                disciple.display_name
                              }
                            </div>

                            <div className="mt-0.5 text-[11px] font-semibold text-[#667085]">
                              {formatRole(
                                disciple.role
                              )}
                              {disciple.area_name
                                ? ` • ${disciple.area_name}`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {disciple.direct_disciple_count >
                            0 && (
                            <div className="text-[10px] font-bold text-[#667085]">
                              {
                                disciple.direct_disciple_count
                              }{' '}
                              direct{' '}
                              {disciple.direct_disciple_count ===
                              1
                                ? 'disciple'
                                : 'disciples'}
                            </div>
                          )}

                          <div className="mt-1 text-xs font-extrabold text-[#175cd3]">
                            View →
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                )}
              </div>
            </Panel>
          )}

          <Panel title="Assigned Contacts">
            {canAssignToPerson && (
              <DiscipleContactAssignment
                targetId={person.id}
                targetName={person.display_name}
                areaName={assignmentAreaName}
                contacts={
                  eligibleUnassignedContacts
                }
              />
            )}

            {detail.assigned_contacts.length ===
            0 ? (
              <EmptyState>
                No primary contacts assigned
                directly to{' '}
                {firstName(
                  person.display_name
                )}.
              </EmptyState>
            ) : (
              <div className="divide-y divide-[#eef0f3]">
                {detail.assigned_contacts.map(
                  (contact) => (
                    <Link
                      key={contact.id}
                      href={`/contacts/${contact.id}`}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#15223a]">
                          {
                            contact.display_name
                          }
                        </div>

                        <div className="mt-0.5 text-[11px] text-[#667085]">
                          {locationLabel(
                            contact
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <StatusBadge
                          status={
                            contact.status
                          }
                        />

                        <div className="mt-1 text-[10px] font-semibold text-[#98a2b3]">
                          {contact.last_activity_at
                            ? `Last ${shortDate(
                                contact.last_activity_at
                              )}`
                            : 'No activity yet'}
                        </div>
                      </div>
                    </Link>
                  )
                )}
              </div>
            )}
          </Panel>

          <Panel title="Recent Activity">
            {detail.recent_activity.length ===
            0 ? (
              <EmptyState>
                No field activity recorded in
                this branch yet.
              </EmptyState>
            ) : (
              <div className="relative">
                <div className="absolute bottom-3 left-[9px] top-3 w-px bg-[#e4e7ec]" />

                <div className="grid gap-4">
                  {detail.recent_activity.map(
                    (activity) => (
                      <div
                        key={activity.id}
                        className="relative pl-8"
                      >
                        <div
                          className={[
                            'absolute left-[2px] top-1.5 h-4 w-4 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]',
                            activity.event_type ===
                            'knock'
                              ? 'bg-[#b42318]'
                              : 'bg-[#13795b]',
                          ].join(' ')}
                        />

                        <div className="rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-3.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-extrabold text-[#15223a]">
                                {activity.event_type ===
                                'knock'
                                  ? 'Knocked'
                                  : 'Interaction'}{' '}
                                with{' '}
                                <Link
                                  href={`/contacts/${activity.contact_id}`}
                                  className="text-[#175cd3] hover:underline"
                                >
                                  {
                                    activity.contact_name
                                  }
                                </Link>
                              </div>

                              <div className="mt-1 text-[11px] font-semibold text-[#98a2b3]">
                                {
                                  activity.performer_name
                                }
                              </div>
                            </div>

                            <span className="text-[11px] font-semibold text-[#98a2b3]">
                              {fullDate(
                                activity.occurred_at
                              )}
                            </span>
                          </div>

                          {activity.notes && (
                            <p className="mt-2 text-sm leading-6 text-[#475467]">
                              {
                                activity.notes
                              }
                            </p>
                          )}

                          {activity.event_type ===
                            'interaction' && (
                            <ActivityBadges
                              activity={
                                activity
                              }
                            />
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </section>
    </main>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[20px] border border-[#e4e7ec] bg-white p-4 md:p-5">
      <h2 className="text-base font-extrabold tracking-[-0.02em] text-[#15223a]">
        {title}
      </h2>

      <div className="mt-4">
        {children}
      </div>
    </section>
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

function AttentionQueue({
  title,
  count,
  contacts,
  emptyText,
}: {
  title: string
  count: number
  contacts: AttentionContact[]
  emptyText: string
}) {
  return (
    <div className="rounded-[16px] border border-[#fedf89] bg-[#fffdf7] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-extrabold text-[#8c5500]">
          {title}
        </div>

        <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[10px] font-black text-[#8c5500]">
          {count}
        </span>
      </div>

      {contacts.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-[#667085]">
          {emptyText}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-[#f4e8c1]">
          {contacts.map(
            (contact) => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="block py-2.5 first:pt-0 last:pb-0"
              >
                <div className="text-xs font-extrabold text-[#15223a]">
                  {
                    contact.display_name
                  }
                </div>

                <div className="mt-0.5 text-[10px] leading-4 text-[#667085]">
                  {
                    contact.owner_name
                  }{' '}
                  •{' '}
                  {locationLabel(
                    contact
                  )}
                  {contact.last_activity_at
                    ? ` • last ${shortDate(
                        contact.last_activity_at
                      )}`
                    : ''}
                </div>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold',
        statusClass(status),
      ].join(' ')}
    >
      {formatStatus(status)}
    </span>
  )
}

function ActivityBadges({
  activity,
}: {
  activity: RecentActivity
}) {
  const labels: string[] = []

  if (
    activity.had_spiritual_conversation
  ) {
    labels.push(
      'Spiritual conversation'
    )
  }

  if (
    activity.interview_completed
  ) {
    labels.push('Interview')
  }

  if (activity.kgp_shared) {
    labels.push('KGP shared')
  }

  if (
    activity.received_christ
  ) {
    labels.push('Received Christ')
  }

  if (labels.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-[#ecfdf3] px-2 py-1 text-[10px] font-bold text-[#027a48]"
        >
          ✓ {label}
        </span>
      ))}
    </div>
  )
}

function EmptyState({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d0d5dd] bg-[#f9fafb] p-5 text-center text-sm text-[#667085]">
      {children}
    </div>
  )
}

function locationLabel(
  contact: {
    location: string | null
    house_name: string | null
    room_or_address: string | null
  }
) {
  return [
    contact.location,
    contact.house_name,
    contact.room_or_address,
  ]
    .filter(Boolean)
    .join(' • ') || 'Location unavailable'
}

function statusClass(status: string) {
  switch (status) {
    case 'go_back':
      return 'bg-[#eef4ff] text-[#175cd3]'

    case 'involved':
      return 'bg-[#ecfdf3] text-[#027a48]'

    case 'not_interested':
      return 'bg-[#fef3f2] text-[#b42318]'

    case 'attempted_contact':
      return 'bg-[#fff8eb] text-[#b54708]'

    case 'uncontacted':
    default:
      return 'bg-[#f2f4f7] text-[#667085]'
  }
}

function formatStatus(status: string) {
  switch (status) {
    case 'go_back':
      return 'Go back'

    case 'involved':
      return 'Involved'

    case 'not_interested':
      return 'Not interested'

    case 'attempted_contact':
      return 'Attempted'

    case 'uncontacted':
      return 'Uncontacted'

    default:
      return status
  }
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

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function firstName(name: string) {
  return (
    name.trim().split(/\s+/)[0] ||
    name
  )
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

function fullDate(value: string) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(new Date(value))
}
