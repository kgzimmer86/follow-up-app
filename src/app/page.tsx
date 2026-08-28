import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GoogleLoginButton } from '@/components/google-login-button'

type PageProps = {
  searchParams: Promise<{
    authError?: string
  }>
}

type DashboardCounts = {
  my_contacts: number
  go_back: number
  share_gospel: number
  meet_new: number
  invite_cg: number
  no_address: number
}

type DashboardNote = {
  id: string
  occurred_at: string
  notes: string | null
}

type DashboardRecentContact = {
  id: string
  display_name: string
  gender_raw: string | null
  status: string
  jesus_interest: string | null
  community_interest: string | null
  interview_interest: string | null
  kgp_shared_at: string | null
  interview_completed_at: string | null
  received_christ_at: string | null
  area_name: string | null
  house_name: string | null
  room_or_address: string | null
  location_resolution: string | null
  owner_name: string | null
  affinity_names: string[]
  latest_event_type: string
  latest_event_at: string
  recent_notes: DashboardNote[]
}

type HomeDashboard = {
  has_active_campaign: boolean
  campaign_id?: string
  campaign_label?: string
  default_area_id?: string | null
  default_area_name?: string | null
  counts?: Partial<DashboardCounts>
  recent_contacts?: DashboardRecentContact[]
}

export default async function HomePage({
  searchParams,
}: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[linear-gradient(145deg,#00274c_0%,#113a67_55%,#ffcb05_160%)] px-5 py-8">
        <div className="w-full max-w-[430px] rounded-[28px] bg-white p-7 shadow-[0_22px_80px_rgba(0,0,0,0.28)]">
          <FollowUpMark />

          <h1 className="mt-4 text-[34px] font-extrabold tracking-[-0.05em] text-[#15223a]">
            Follow Up
          </h1>

          <p className="mt-2 leading-6 text-[#667085]">
            A ministry follow-up tool for moving toward students
            with courage, care, and clarity.
          </p>

          {params.authError === 'true' && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              We couldn&apos;t complete your sign in. Please try again.
            </div>
          )}

          <div className="mt-6">
            <GoogleLoginButton />
          </div>
        </div>
      </main>
    )
  }

  const userId = user.id

  const { data: profile, error: profileError } =
    await supabase
      .from('profiles')
      .select('display_name, role, is_active')
      .eq('id', userId)
      .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (!profile || profile.role === 'pending') {
    return (
      <AccessScreen
        title="You’re logged in."
        message="Your Follow Up account is waiting for staff approval. Once you’re approved, your Follow Up tools will appear here."
      />
    )
  }

  if (!profile.is_active) {
    return (
      <AccessScreen
        title="Your Follow Up access is inactive."
        message="Contact a Michigan Cru staff member if you believe you should still have access."
      />
    )
  }

  const {
    data: dashboardData,
    error: dashboardError,
  } = await supabase.rpc(
    'get_follow_up_home_dashboard'
  )

  if (dashboardError) {
    throw new Error(
      dashboardError.message
    )
  }

  const dashboard =
    dashboardData as HomeDashboard | null

  if (
    !dashboard ||
    !dashboard.has_active_campaign
  ) {
    return (
      <AccessScreen
        title="Follow Up is ready."
        message="There is not currently an active Follow Up campaign."
      />
    )
  }

  const counts: DashboardCounts = {
    my_contacts:
      dashboard.counts
        ?.my_contacts ?? 0,
    go_back:
      dashboard.counts
        ?.go_back ?? 0,
    share_gospel:
      dashboard.counts
        ?.share_gospel ?? 0,
    meet_new:
      dashboard.counts
        ?.meet_new ?? 0,
    invite_cg:
      dashboard.counts
        ?.invite_cg ?? 0,
    no_address:
      dashboard.counts
        ?.no_address ?? 0,
  }

  const recentContacts =
    dashboard.recent_contacts ?? []

  const areaLabel =
    dashboard.default_area_name ||
    'All Campus'

  return (
    <main className="mx-auto max-w-[1000px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <div className="mb-3 rounded-[14px] bg-[#eef4ff] px-[13px] py-[11px] text-xs font-bold text-[#3538cd]">
        Default ministry area:{' '}
        <strong>{areaLabel}</strong>
      </div>

      <section className="mb-[18px] rounded-[28px] border border-[#f4e8a6] bg-[linear-gradient(135deg,#fff9d8,#ffffff_62%)] p-6 shadow-[0_8px_28px_rgba(19,33,68,0.08)]">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
          Today in {areaLabel}
        </div>

        <h2 className="mt-1.5 max-w-[680px] text-[30px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#15223a]">
          What step of faith will you take today?
        </h2>

        <p className="mt-2 max-w-[680px] leading-[1.45] text-[#667085]">
          Choose a next step and Follow Up will surface students
          who fit that ministry opportunity.
        </p>

        <div className="mt-[18px] font-serif text-[15px] italic text-[#6f5f1e]">
          “The harvest is plentiful…”
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <ActionCard
          icon="◎"
          title="My Contacts"
          description="Students where you are the primary follow-up person."
          count={counts.my_contacts}
          href="/contacts"
        />

        <ActionCard
          icon="↻"
          title="Go Back"
          description="Continue conversations you have already started."
          count={counts.go_back}
          href="/opportunities/go-back"
        />

        <ActionCard
          icon="✦"
          title="Share the Gospel"
          description="Spiritually open students who have not had KGP shared."
          count={counts.share_gospel}
          href="/opportunities/share-the-gospel"
        />

        <ActionCard
          icon="+"
          title="Meet Someone New"
          description="Interested students with no interaction yet."
          count={counts.meet_new}
          href="/opportunities/meet-someone-new"
        />

        <ActionCard
          icon="⌂"
          title="Invite to Community Group"
          description="Students open to Christian community."
          count={counts.invite_cg}
          href="/opportunities/community-group"
        />

        <ActionCard
          icon="↗"
          title="Reach Out to No Address"
          description="Text or call interested students we cannot geographically place."
          count={counts.no_address}
          href="/opportunities/no-address"
        />
      </section>

      <div className="mt-4">
        <Link
          href="/contacts/area"
          className="flex w-full items-center justify-between rounded-[16px] border border-[#d8dee8] bg-white px-4 py-3.5 text-sm font-extrabold text-[#00274c] shadow-[0_1px_4px_rgba(16,24,40,0.03)] transition hover:border-[#98a2b3] hover:shadow-[0_4px_14px_rgba(16,24,40,0.06)]"
        >
          <span>
            View all contacts in {areaLabel}
          </span>

          <span aria-hidden="true">
            →
          </span>
        </Link>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h3 className="text-xl font-extrabold text-[#15223a]">
            Recent Follow Up
          </h3>

          <Link
            href="/contacts"
            className="text-sm font-extrabold text-[#175cd3] hover:underline"
          >
            My Contacts
          </Link>
        </div>

        {recentContacts.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-7 text-center text-[#667085]">
            Your recent knocks and interactions will appear here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentContacts.map(
              (contact) => {
                const recentNotes =
                  contact.recent_notes ?? []

                return (
                  <article
                    key={contact.id}
                    className={[
                      'relative overflow-hidden rounded-[20px] border p-4 shadow-[0_1px_5px_rgba(16,24,40,0.03)]',
                      recentCardClass(
                        contact.gender_raw,
                        contact.status
                      ),
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'absolute inset-y-0 left-0 w-[6px]',
                        genderStripeClass(
                          contact.gender_raw,
                          contact.status
                        ),
                      ].join(' ')}
                    />

                    <div className="flex items-start justify-between gap-3 pl-1">
                      <div className="min-w-0">
                        <Link
                          href={`/contacts/${contact.id}?from=${encodeURIComponent(
                            '/'
                          )}`}
                          className="block truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#15223a] hover:text-[#175cd3]"
                        >
                          {
                            contact.display_name
                          }
                        </Link>

                        <div className="mt-1 truncate text-[13px] text-[#667085]">
                          {formatLocation(
                            contact.area_name,
                            contact.house_name,
                            contact.room_or_address,
                            contact.location_resolution
                          )}
                        </div>
                      </div>

                      <StatusBadge
                        status={contact.status}
                      />
                    </div>

                    <div className="my-3 flex flex-wrap gap-1.5">
                      <QuestionBadge
                        label="Jesus"
                        value={
                          contact.jesus_interest
                        }
                      />

                      <QuestionBadge
                        label="Community"
                        value={
                          contact.community_interest
                        }
                      />

                      <QuestionBadge
                        label="Interview"
                        value={
                          contact.interview_interest
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <ProgressPill
                        done={Boolean(
                          contact.kgp_shared_at
                        )}
                        label="KGP"
                      />

                      <ProgressPill
                        done={Boolean(
                          contact.interview_completed_at
                        )}
                        label="Interview"
                      />

                      {contact.received_christ_at && (
                        <span className="rounded-full bg-[#fff1d6] px-2 py-1.5 font-bold text-[#8c5500]">
                          New Believer
                        </span>
                      )}
                    </div>

                    {contact.affinity_names.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {contact.affinity_names.map(
                          (name) => (
                            <span
                              key={name}
                              className="rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] font-bold text-[#3538cd]"
                            >
                              {name}
                            </span>
                          )
                        )}
                      </div>
                    )}

                    <div className="mt-3 max-h-[108px] overflow-y-auto rounded-[11px] bg-[#f9fafb] p-2.5 text-[13px] leading-[1.4] text-[#475467]">
                      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                        Interaction notes
                      </div>

                      {recentNotes.length > 0 ? (
                        recentNotes.map(
                          (note) => (
                            <div
                              key={note.id}
                              className="border-t border-[#e4e7ec] py-2 first:border-t-0 first:pt-0 last:pb-0"
                            >
                              <small className="mb-0.5 block text-[#98a2b3]">
                                {shortDate(
                                  note.occurred_at
                                )}
                              </small>

                              {note.notes}
                            </div>
                          )
                        )
                      ) : (
                        <div>
                          No interaction notes yet.
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex justify-between gap-3 text-[11px] text-[#667085]">
                      <span>
                        {contact.latest_event_type ===
                        'knock'
                          ? 'Latest: Knocked'
                          : 'Latest: Interaction'}
                        {' • '}
                        {shortDate(
                          contact.latest_event_at
                        )}
                      </span>

                      <span>
                        {contact.owner_name
                          ? `Primary: ${contact.owner_name}`
                          : 'Unassigned'}
                      </span>
                    </div>
                  </article>
                )
              }
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function ActionCard({
  icon,
  title,
  description,
  count,
  href,
}: {
  icon: string
  title: string
  description: string
  count: number
  href: string
}) {
  return (
    <Link
      href={href}
      className="min-h-[140px] rounded-[20px] border border-[#e4e7ec] bg-white p-[18px] text-left shadow-[0_2px_10px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(19,33,68,0.08)] md:min-h-[175px]"
    >
      <div className="text-[23px] leading-none">
        {icon}
      </div>

      <div className="mt-3 text-[17px] font-extrabold text-[#15223a]">
        {title}
      </div>

      <p className="mt-1 text-[13px] leading-[1.35] text-[#667085]">
        {description}
      </p>

      <div className="mt-2.5 text-[21px] font-extrabold text-[#00274c]">
        {count}
      </div>
    </Link>
  )
}

function QuestionBadge({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <span
      className={[
        'rounded-lg border px-2 py-1.5 text-[11px]',
        questionClass(value),
      ].join(' ')}
    >
      <strong>{label}</strong>{' '}
      {formatSurveyAnswer(value)}
    </span>
  )
}

function ProgressPill({
  done,
  label,
}: {
  done: boolean
  label: string
}) {
  return (
    <span
      className={[
        'rounded-full px-2 py-1.5 font-bold',
        done
          ? 'bg-[#ecfdf3] text-[#027a48]'
          : 'bg-[#f2f4f7] text-[#475467]',
      ].join(' ')}
    >
      {done ? '✓' : '○'} {label}
    </span>
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
        'shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold',
        statusClass(status),
      ].join(' ')}
    >
      {formatStatus(status)}
    </span>
  )
}

function FollowUpMark() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#ffcb05] text-[#00274c]">
      <svg
        viewBox="0 0 24 24"
        className="h-[23px] w-[23px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4.5h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3h-5.7L7 22v-2.8H7a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3Z" />
        <path d="M12 7.2v9.8" />
        <path d="M9.4 10.2h5.2" />
      </svg>
    </div>
  )
}

function AccessScreen({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5">
      <div className="w-full max-w-md rounded-[22px] border border-[#e4e7ec] bg-white p-7 shadow-[0_8px_28px_rgba(19,33,68,0.08)]">
        <FollowUpMark />

        <h1 className="mt-4 text-2xl font-extrabold text-[#15223a]">
          {title}
        </h1>

        <p className="mt-3 leading-6 text-[#667085]">
          {message}
        </p>
      </div>
    </main>
  )
}

function genderCategory(
  gender: string | null
) {
  const normalized =
    gender?.trim().toLowerCase()

  if (
    normalized === 'male' ||
    normalized === 'm' ||
    normalized === 'man'
  ) {
    return 'male'
  }

  if (
    normalized === 'female' ||
    normalized === 'f' ||
    normalized === 'woman'
  ) {
    return 'female'
  }

  return 'other'
}

function genderStripeClass(
  gender: string | null,
  status: string
) {
  if (status === 'not_interested') {
    return 'bg-[#b42318]'
  }

  const category =
    genderCategory(gender)

  if (category === 'female') {
    return 'bg-[#d6339a]'
  }

  if (category === 'male') {
    return 'bg-[#2f80ed]'
  }

  return 'bg-[#98a2b3]'
}

function recentCardClass(
  gender: string | null,
  status: string
) {
  if (status === 'not_interested') {
    return 'border-[#f1a7a3] bg-[#fff0f0]'
  }

  const category =
    genderCategory(gender)

  if (category === 'female') {
    return 'border-[#eadbe5] bg-[#fffafd]'
  }

  if (category === 'male') {
    return 'border-[#dbe8f8] bg-[#fbfdff]'
  }

  return 'border-[#e4e7ec] bg-white'
}

function questionClass(
  value: string | null
) {
  switch (value) {
    case 'yes':
      return 'border-[#d1fadf] bg-[#edfdf6] text-[#15223a]'

    case 'maybe':
      return 'border-[#fedf89] bg-[#fff8eb] text-[#15223a]'

    case 'already_have_one':
      return 'border-[#e9d7fe] bg-[#f4f3ff] text-[#15223a]'

    default:
      return 'border-[#edf0f3] bg-[#f9fafb] text-[#15223a]'
  }
}

function statusClass(
  status: string
) {
  switch (status) {
    case 'attempted_contact':
      return 'bg-[#fff4e5] text-[#9a4b00]'

    case 'go_back':
      return 'bg-[#eef4ff] text-[#3538cd]'

    case 'involved':
      return 'bg-[#ecfdf3] text-[#027a48]'

    case 'not_interested':
      return 'bg-[#fef3f2] text-[#b42318]'

    default:
      return 'bg-[#f2f4f7] text-[#475467]'
  }
}

function formatStatus(
  status: string
) {
  switch (status) {
    case 'uncontacted':
      return 'Uncontacted'

    case 'attempted_contact':
      return 'Attempted contact'

    case 'go_back':
      return 'Go back'

    case 'involved':
      return 'Involved'

    case 'not_interested':
      return 'Not interested'

    default:
      return status
  }
}

function formatSurveyAnswer(
  value: string | null
) {
  switch (value) {
    case 'yes':
      return 'Yes'

    case 'no':
      return 'No'

    case 'maybe':
      return 'Maybe'

    case 'already_have_one':
      return 'Already have one'

    default:
      return '—'
  }
}

function formatLocation(
  area: string | null,
  house: string | null,
  room: string | null,
  resolution: string | null
) {
  if (area) {
    return [area, house, room]
      .filter(Boolean)
      .join(' • ')
  }

  if (
    resolution ===
    'needs_area_assignment'
  ) {
    return [
      'Needs Area Assignment',
      room,
    ]
      .filter(Boolean)
      .join(' • ')
  }

  return 'No Address'
}

function shortDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
    }
  ).format(new Date(value))
}
