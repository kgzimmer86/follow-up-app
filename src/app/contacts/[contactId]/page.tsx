import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  notFound,
  redirect,
} from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { InteractionButton } from '@/components/follow-up/interaction-button'
import { EditableContactInfo } from '@/components/follow-up/editable-contact-info'

type PageProps = {
  params: Promise<{
    contactId: string
  }>

  searchParams: Promise<{
    tab?: string
    from?: string
  }>
}

type DetailTab =
  | 'overview'
  | 'survey'
  | 'history'
  | 'schedule'

type ContactRow = {
  id: string
  student_id: string
  campaign_id: string
  ministry_location_id: string | null
  primary_owner_id: string | null

  year_at_um: string | null
  gender_raw: string | null
  phone: string | null

  jesus_interest: string | null
  community_interest: string | null
  interview_interest: string | null

  house_name: string | null
  room_or_address: string | null
  location_resolution: string | null

  status: string

  knock_count: number
  last_knock_at: string | null

  interview_completed_at: string | null
  kgp_shared_at: string | null
  received_christ_at: string | null
}

type StudentRow = {
  id: string
  uniqname: string | null
  display_name: string
  umich_email: string | null
}

type AreaRow = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

type AffinityRow = {
  contact_id: string
  ministry_area_id: string
}

type EventRow = {
  id: string
  contact_id: string
  performed_by: string | null
  performed_by_name: string | null
  event_type: string
  occurred_at: string
  notes: string | null
  found_home: boolean
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type DisplayEvent = EventRow & {
  performerName: string
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { contactId } =
    await params

  const query = await searchParams

  const activeTab =
    validTab(query.tab)

  const returnTo =
    safeReturnTo(query.from)

  const supabase =
    await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const userId = user.id

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(
      'role, is_active, display_name'
    )
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(
      profileError.message
    )
  }

  if (
    !profile ||
    profile.role === 'pending' ||
    !profile.is_active
  ) {
    redirect('/')
  }

  const {
    data: contactData,
    error: contactError,
  } = await supabase
    .from('follow_up_contacts')
    .select(`
      id,
      student_id,
      campaign_id,
      ministry_location_id,
      primary_owner_id,
      year_at_um,
      gender_raw,
      phone,
      jesus_interest,
      community_interest,
      interview_interest,
      house_name,
      room_or_address,
      location_resolution,
      status,
      knock_count,
      last_knock_at,
      interview_completed_at,
      kgp_shared_at,
      received_christ_at
    `)
    .eq('id', contactId)
    .maybeSingle()

  if (contactError) {
    throw new Error(
      contactError.message
    )
  }

  if (!contactData) {
    notFound()
  }

  const contact =
    contactData as ContactRow

  const {
    data: studentData,
    error: studentError,
  } = await supabase
    .from('students')
    .select(
      'id, uniqname, display_name, umich_email'
    )
    .eq('id', contact.student_id)
    .maybeSingle()

  if (studentError) {
    throw new Error(
      studentError.message
    )
  }

  if (!studentData) {
    notFound()
  }

  const student =
    studentData as StudentRow

  const {
    data: areasData,
    error: areasError,
  } = await supabase
    .from('ministry_areas')
    .select(
      'id, name, area_type, parent_id'
    )
    .eq('is_active', true)

  if (areasError) {
    throw new Error(
      areasError.message
    )
  }

  const areas =
    (areasData ?? []) as AreaRow[]

  const areaMap = new Map(
    areas.map((area) => [
      area.id,
      area,
    ])
  )

  const contactArea =
    contact.ministry_location_id
      ? areaMap.get(
          contact.ministry_location_id
        ) ?? null
      : null

  const parentArea =
    contactArea?.parent_id
      ? areaMap.get(
          contactArea.parent_id
        ) ?? null
      : null

  const {
    data: affinityData,
    error: affinityError,
  } = await supabase
    .from(
      'follow_up_contact_affinities'
    )
    .select(
      'contact_id, ministry_area_id'
    )
    .eq('contact_id', contactId)

  if (affinityError) {
    throw new Error(
      affinityError.message
    )
  }

  const affinities =
    (affinityData ??
      []) as AffinityRow[]

  const affinityNames =
    affinities
      .map(
        (membership) =>
          areaMap.get(
            membership.ministry_area_id
          )?.name
      )
      .filter(
        (name): name is string =>
          Boolean(name)
      )
      .sort((a, b) =>
        a.localeCompare(b)
      )

  const {
    data: eventsData,
    error: eventsError,
  } = await supabase
    .from('follow_up_events')
    .select(`
      id,
      contact_id,
      performed_by,
      performed_by_name,
      event_type,
      occurred_at,
      notes,
      found_home
    `)
    .eq('contact_id', contactId)
    .order('occurred_at', {
      ascending: false,
    })

  if (eventsError) {
    throw new Error(
      eventsError.message
    )
  }

  const events =
    (eventsData ?? []) as EventRow[]

  const profileIds = unique([
    ...events
      .map(
        (event) =>
          event.performed_by
      )
      .filter(
        (id): id is string =>
          Boolean(id)
      ),

    ...(contact.primary_owner_id
      ? [
          contact.primary_owner_id,
        ]
      : []),
  ])

  let people: ProfileRow[] = []

  if (profileIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from('profiles')
      .select(
        'id, display_name'
      )
      .in('id', profileIds)

    if (error) {
      throw new Error(
        error.message
      )
    }

    people =
      (data ?? []) as ProfileRow[]
  }

  const profileMap = new Map(
    people.map((person) => [
      person.id,
      person.display_name ||
        'Follow Up leader',
    ])
  )

  const displayEvents:
    DisplayEvent[] =
    events.map((event) => ({
      ...event,

      performerName:
        (event.performed_by
          ? profileMap.get(
              event.performed_by
            )
          : null) ||
        event.performed_by_name ||
        'Former user',
    }))

  const interactions =
    displayEvents.filter(
      (event) =>
        event.event_type ===
        'interaction'
    )

  const knocks =
    displayEvents.filter(
      (event) =>
        event.event_type ===
        'knock'
    )

  const latestInteraction =
    interactions[0] ?? null

  const ownerName =
    contact.primary_owner_id
      ? profileMap.get(
          contact.primary_owner_id
        ) ||
        'Follow Up leader'
      : null

  const isPrimary =
    contact.primary_owner_id ===
    userId

  const hasLocation =
    contact.location_resolution !==
      'no_address' &&
    Boolean(
      contactArea?.name ||
        contact.room_or_address
    )

  const email =
    student.umich_email ||
    (student.uniqname
      ? `${student.uniqname}@umich.edu`
      : null)

  async function updateStatus(
    formData: FormData
  ) {
    'use server'

    const submittedContactId =
      formData.get('contactId')

    const status =
      formData.get('status')

    if (
      typeof submittedContactId !==
        'string' ||
      typeof status !== 'string'
    ) {
      throw new Error(
        'Missing contact status information.'
      )
    }

    const allowedStatuses = [
      'uncontacted',
      'attempted_contact',
      'go_back',
      'involved',
      'not_interested',
    ]

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      throw new Error(
        'Invalid Follow Up status.'
      )
    }

    const supabase =
      await createClient()

    const { error } =
      await supabase.rpc(
        'set_follow_up_contact_status',
        {
          p_contact_id:
            submittedContactId,

          p_status: status,
        }
      )

    if (error) {
      throw new Error(
        error.message
      )
    }

    revalidatePath(
      `/contacts/${submittedContactId}`
    )

    revalidatePath('/contacts')
    revalidatePath('/')

    const redirectParams =
      new URLSearchParams({
        tab: 'overview',
        from: returnTo,
      })

    redirect(
      `/contacts/${submittedContactId}?${redirectParams.toString()}`
    )
  }


  async function claimContact(
    formData: FormData
  ) {
    'use server'

    const submittedContactId =
      formData.get('contactId')

    if (
      typeof submittedContactId !==
      'string'
    ) {
      throw new Error(
        'Missing contact ID.'
      )
    }

    const supabase =
      await createClient()

    const { error } =
      await supabase.rpc(
        'claim_follow_up_contact',
        {
          p_contact_id:
            submittedContactId,
        }
      )

    if (error) {
      throw new Error(
        error.message
      )
    }

    revalidatePath(
      `/contacts/${submittedContactId}`
    )

    revalidatePath('/contacts')
    revalidatePath('/')
  }

  async function logKnock(
    formData: FormData
  ) {
    'use server'

    const submittedContactId =
      formData.get('contactId')

    if (
      typeof submittedContactId !==
      'string'
    ) {
      throw new Error(
        'Missing contact ID.'
      )
    }

    const supabase =
      await createClient()

    const { error } =
      await supabase.rpc(
        'log_knock',
        {
          p_contact_id:
            submittedContactId,
        }
      )

    if (error) {
      throw new Error(
        error.message
      )
    }

    revalidatePath(
      `/contacts/${submittedContactId}`
    )

    revalidatePath('/contacts')
    revalidatePath('/')
  }

  return (
    <main className="mx-auto max-w-[900px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <div className="mb-3">
        <Link
          href={returnTo}
          className="inline-flex min-h-11 items-center rounded-[11px] border border-[#d0d5dd] bg-white px-3.5 text-sm font-extrabold text-[#475467] transition hover:bg-[#f9fafb] hover:text-[#15223a]"
        >
          <span aria-hidden="true">
            ←
          </span>
          <span className="ml-2">
            Back to results
          </span>
        </Link>
      </div>

      <section
        className={[
          'relative overflow-hidden rounded-[24px] border shadow-[0_2px_12px_rgba(16,24,40,0.05)]',
          detailCardClass(
            contact.gender_raw,
            contact.status
          ),
        ].join(' ')}
      >
        <div
          className={[
            'absolute inset-y-0 left-0 w-[7px]',
            stripeClass(
              contact.gender_raw,
              contact.status
            ),
          ].join(' ')}
        />

        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <Avatar
              name={student.display_name}
              gender={
                contact.gender_raw
              }
              status={
                contact.status
              }
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-[#15223a] md:text-[32px]">
                  {student.display_name}
                </h2>

                {contact.primary_owner_id && (
                  <AssignedBadge />
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#667085]">
                <span>
                  {formatLocation(
                    contactArea?.name ??
                      null,
                    contact.house_name,
                    contact.room_or_address,
                    contact.location_resolution
                  )}
                </span>

                {contact.year_at_um && (
                  <>
                    <span className="text-[#d0d5dd]">
                      •
                    </span>

                    <span>
                      {contact.year_at_um}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2">
                <StatusBadge
                  status={
                    contact.status
                  }
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            <SurveyChip
              label="Jesus"
              value={
                contact.jesus_interest
              }
            />

            <SurveyChip
              label="Community"
              value={
                contact.community_interest
              }
            />

            <SurveyChip
              label="Interview"
              value={
                contact.interview_interest
              }
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
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
              <NewBelieverBadge />
            )}
          </div>

          {affinityNames.length >
            0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {affinityNames.map(
                (name) => (
                  <AffinityTag
                    key={name}
                    label={name}
                  />
                )
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-black/[0.05] pt-4">
            {contact.phone ? (
              <a
                href={`sms:${phoneHref(
                  contact.phone
                )}`}
                className="block rounded-[11px] border border-[#e4e7ec] bg-white px-2 py-3 text-center text-sm font-extrabold text-[#15223a]"
              >
                Text
              </a>
            ) : (
              <DisabledButton
                label="Text"
              />
            )}

            {hasLocation ? (
              <form action={logKnock}>
                <input
                  type="hidden"
                  name="contactId"
                  value={contact.id}
                />

                <button
                  type="submit"
                  className="w-full rounded-[11px] border border-[#ffcb05] bg-[#ffcb05] px-2 py-3 text-sm font-extrabold text-[#00274c]"
                >
                  Knocked
                </button>
              </form>
            ) : contact.phone ? (
              <a
                href={`tel:${phoneHref(
                  contact.phone
                )}`}
                className="block rounded-[11px] border border-[#e4e7ec] bg-white px-2 py-3 text-center text-sm font-extrabold text-[#15223a]"
              >
                Call
              </a>
            ) : (
              <DisabledButton
                label="Call"
              />
            )}

            <InteractionButton
              contactId={contact.id}
              contactName={
                student.display_name
              }
              currentStatus={
                contact.status
              }
              isPrimary={isPrimary}
            />
          </div>
        </div>
      </section>

      <nav className="mt-4 flex gap-1 overflow-x-auto rounded-[15px] border border-[#e4e7ec] bg-white p-1.5">
        <DetailTabLink
          contactId={contact.id}
          tab="overview"
          label="Overview"
          activeTab={activeTab}
          returnTo={returnTo}
        />

        <DetailTabLink
          contactId={contact.id}
          tab="survey"
          label="Survey"
          activeTab={activeTab}
          returnTo={returnTo}
        />

        <DetailTabLink
          contactId={contact.id}
          tab="history"
          label="History"
          activeTab={activeTab}
          returnTo={returnTo}
        />

        <DetailTabLink
          contactId={contact.id}
          tab="schedule"
          label="Schedule"
          activeTab={activeTab}
          returnTo={returnTo}
        />
      </nav>

      <div className="mt-4">
        {activeTab ===
          'overview' && (
          <OverviewTab
            contact={contact}
            ownerName={ownerName}
            isPrimary={isPrimary}
            affinityNames={
              affinityNames
            }
            latestInteraction={
              latestInteraction
            }
            knocks={knocks}
            updateStatus={
              updateStatus
            }
            claimContact={
              claimContact
            }
          />
        )}

        {activeTab ===
          'survey' && (
          <SurveyTab
            contact={contact}
            student={student}
            email={email}
            contactArea={
              contactArea
            }
            parentArea={parentArea}
            affinityNames={
              affinityNames
            }
          />
        )}

        {activeTab ===
          'history' && (
          <HistoryTab
            events={displayEvents}
          />
        )}

        {activeTab ===
          'schedule' && (
          <ScheduleTab
            events={displayEvents}
          />
        )}
      </div>
    </main>
  )
}

function OverviewTab({
  contact,
  ownerName,
  isPrimary,
  affinityNames,
  latestInteraction,
  knocks,
  updateStatus,
  claimContact,
}: {
  contact: ContactRow
  ownerName: string | null
  isPrimary: boolean
  affinityNames: string[]
  latestInteraction:
    | DisplayEvent
    | null
  knocks: DisplayEvent[]

  updateStatus: (
    formData: FormData
  ) => Promise<void>

  claimContact: (
    formData: FormData
  ) => Promise<void>
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Follow-up">
        <div className="grid gap-4">
          <div>
            <FieldLabel>
              Status
            </FieldLabel>

            <form
              action={updateStatus}
              className="mt-1.5 flex gap-2"
            >
              <input
                type="hidden"
                name="contactId"
                value={contact.id}
              />

              <select
                name="status"
                defaultValue={
                  contact.status
                }
                className="min-w-0 flex-1 rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-bold text-[#15223a]"
              >
                <option value="uncontacted">
                  Uncontacted
                </option>

                <option value="attempted_contact">
                  Attempted contact
                </option>

                <option value="go_back">
                  Go back
                </option>

                <option value="involved">
                  Involved
                </option>

                <option value="not_interested">
                  Not interested
                </option>
              </select>

              <button
                type="submit"
                className="rounded-[11px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white"
              >
                Save
              </button>
            </form>
          </div>

          <div className="border-t border-[#eef0f3] pt-4">
            <FieldLabel>
              Primary
            </FieldLabel>

            {isPrimary ? (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ecfdf3] text-sm font-black text-[#027a48]">
                  ✓
                </span>

                <strong className="text-sm text-[#15223a]">
                  You are primary
                </strong>
              </div>
            ) : (
              <div className="mt-1.5">
                <div className="text-sm font-bold text-[#15223a]">
                  {ownerName ||
                    'Unassigned'}
                </div>

                <form
                  action={claimContact}
                  className="mt-2"
                >
                  <input
                    type="hidden"
                    name="contactId"
                    value={contact.id}
                  />

                  <button
                    type="submit"
                    className="text-xs font-extrabold text-[#175cd3] hover:underline"
                  >
                    Make me primary
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-[#eef0f3] pt-4">
            <ProgressBox
              label="KGP"
              value={
                contact.kgp_shared_at
                  ? 'Shared'
                  : 'Not shared'
              }
              done={Boolean(
                contact.kgp_shared_at
              )}
            />

            <ProgressBox
              label="Interview"
              value={
                contact.interview_completed_at
                  ? 'Completed'
                  : 'Not completed'
              }
              done={Boolean(
                contact.interview_completed_at
              )}
            />
          </div>

          {contact.received_christ_at && (
            <div className="rounded-[13px] border border-[#fedf89] bg-[#fff8eb] p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#b54708]">
                New Believer
              </div>

              <div className="mt-1 text-sm font-bold text-[#15223a]">
                Received Christ{' '}
                {fullDate(
                  contact.received_christ_at
                )}
              </div>
            </div>
          )}

          {affinityNames.length >
            0 && (
            <div className="border-t border-[#eef0f3] pt-4">
              <FieldLabel>
                Ministry memberships
              </FieldLabel>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {affinityNames.map(
                  (name) => (
                    <AffinityTag
                      key={name}
                      label={name}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Recent Follow Up">
        {latestInteraction ? (
          <div className="rounded-[14px] bg-[#f9fafb] p-3.5">
            <div className="text-xs font-extrabold text-[#15223a]">
              Interaction •{' '}
              {fullDate(
                latestInteraction.occurred_at
              )}
            </div>

            <div className="mt-1 text-[11px] font-semibold text-[#98a2b3]">
              {
                latestInteraction.performerName
              }
            </div>

            <p className="mt-2 text-sm leading-6 text-[#475467]">
              {latestInteraction.notes ||
                'Interaction recorded.'}
            </p>
          </div>
        ) : (
          <EmptyState>
            No interactions yet.
          </EmptyState>
        )}

        <div className="mt-4 border-t border-[#eef0f3] pt-4 text-sm text-[#667085]">
          {knocks.length > 0 ? (
            <>
              <strong className="text-[#15223a]">
                {knocks.length}{' '}
                {knocks.length === 1
                  ? 'knock attempt'
                  : 'knock attempts'}
              </strong>

              <div className="mt-1 text-xs">
                Most recent{' '}
                {fullDate(
                  knocks[0].occurred_at
                )}
              </div>
            </>
          ) : (
            'No knock attempts recorded yet.'
          )}
        </div>
      </Panel>
    </div>
  )
}

function SurveyTab({
  contact,
  student,
  email,
  contactArea,
  parentArea,
  affinityNames,
}: {
  contact: ContactRow
  student: StudentRow
  email: string | null
  contactArea: AreaRow | null
  parentArea: AreaRow | null
  affinityNames: string[]
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Initial spiritual interest survey">
        <DefinitionList>
          <DefinitionRow
            label="Relationship with Jesus"
            value={formatSurveyAnswer(
              contact.jesus_interest
            )}
          />

          <DefinitionRow
            label="Christian community"
            value={formatSurveyAnswer(
              contact.community_interest
            )}
          />

          <DefinitionRow
            label="Life, values & spiritual perspectives interview"
            value={formatSurveyAnswer(
              contact.interview_interest
            )}
          />

          <DefinitionRow
            label="Affinity interest"
            value={
              affinityNames.length
                ? affinityNames.join(
                    ', '
                  )
                : 'None marked'
            }
          />
        </DefinitionList>
      </Panel>

      <Panel title="Contact & housing information">
        <EditableContactInfo
          contactId={contact.id}
          displayName={student.display_name}
          phone={contact.phone}
          umichEmail={email}
          roomOrAddress={contact.room_or_address}
        />

        <div className="mt-4 border-t border-[#eef0f3] pt-1">
          <DefinitionList>
            <DefinitionRow
              label="Gender"
              value={genderLabel(
                contact.gender_raw
              )}
            />

            <DefinitionRow
              label="Year"
              value={
                contact.year_at_um ||
                'Not provided'
              }
            />

            <DefinitionRow
              label="Campus area"
              value={
                parentArea?.name ||
                (
                  contactArea?.area_type ===
                  'campus_region'
                    ? contactArea.name
                    : null
                ) ||
                'Unplaced'
              }
            />

            <DefinitionRow
              label="Dorm / location"
              value={
                contactArea?.name ||
                (
                  contact.location_resolution ===
                  'no_address'
                    ? 'No address provided'
                    : 'Needs area assignment'
                )
              }
            />

            {contact.house_name && (
              <DefinitionRow
                label="House"
                value={contact.house_name}
              />
            )}
          </DefinitionList>
        </div>
      </Panel>
    </div>
  )
}

function HistoryTab({
  events,
}: {
  events: DisplayEvent[]
}) {
  return (
    <Panel title="Follow-up history">
      {events.length === 0 ? (
        <EmptyState>
          No follow-up activity yet.
        </EmptyState>
      ) : (
        <div className="relative">
          <div className="absolute bottom-3 left-[10px] top-3 w-px bg-[#e4e7ec]" />

          <div className="grid gap-4">
            {events.map((event) => {
              const isKnock =
                event.event_type ===
                'knock'

              return (
                <div
                  key={event.id}
                  className="relative pl-8"
                >
                  <div
                    className={[
                      'absolute left-[3px] top-1.5 h-4 w-4 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]',
                      isKnock
                        ? 'bg-[#ffcb05]'
                        : 'bg-[#13795b]',
                    ].join(' ')}
                  />

                  <div
                    className={[
                      'rounded-[14px] border p-3.5',
                      isKnock
                        ? 'border-[#f4e8a6] bg-[#fffdf1]'
                        : 'border-[#e4e7ec] bg-[#f9fafb]',
                    ].join(' ')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong className="text-sm text-[#15223a]">
                        {isKnock
                          ? 'Knocked — no answer'
                          : 'Interaction'}
                      </strong>

                      <span className="text-[11px] font-semibold text-[#98a2b3]">
                        {fullDate(
                          event.occurred_at
                        )}
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] font-semibold text-[#98a2b3]">
                      {
                        event.performerName
                      }
                    </div>

                    {event.notes && (
                      <p className="mt-2 text-sm leading-6 text-[#475467]">
                        {event.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}

function ScheduleTab({
  events,
}: {
  events: DisplayEvent[]
}) {
  const days = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ]

  const periods = [
    {
      label: '12–2 PM',
      start: 12,
      end: 14,
    },
    {
      label: '2–4 PM',
      start: 14,
      end: 16,
    },
    {
      label: '4–6 PM',
      start: 16,
      end: 18,
    },
    {
      label: '6–8 PM',
      start: 18,
      end: 20,
    },
    {
      label: '8–10 PM',
      start: 20,
      end: 22,
    },
  ]

  const scheduleEvents =
    events.filter(
      (event) =>
        event.event_type === 'knock' ||
        (
          event.event_type ===
            'interaction' &&
          event.found_home
        )
    )

  return (
    <div className="grid gap-4">
      <Panel title="Observed schedule">
        <p className="mb-4 text-xs leading-5 text-[#667085]">
          Green means someone was found
          home. Red means someone knocked
          and they were not home. The
          number shows how many
          observations were recorded in
          that time block. A split dot
          means the observations were
          mixed; hover over it or tap it
          for the breakdown.
        </p>

        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[90px_repeat(7,1fr)] gap-1.5">
            <div />

            {days.map((day) => (
              <div
                key={day}
                className="pb-1 text-center text-[11px] font-extrabold text-[#667085]"
              >
                {day}
              </div>
            ))}

            {periods.map(
              (period) => (
                <ScheduleRow
                  key={
                    period.label
                  }
                  label={
                    period.label
                  }
                  start={
                    period.start
                  }
                  end={period.end}
                  days={days}
                  events={
                    scheduleEvents
                  }
                />
              )
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-[11px] font-semibold text-[#667085]">
          <span className="flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-full bg-[#13795b]" />
            Found home
          </span>

          <span className="flex items-center gap-1.5">
            <i className="h-3 w-3 rounded-full bg-[#b42318]" />
            Not home
          </span>

          <span className="flex items-center gap-1.5">
            <i
              className="h-3 w-3 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #b42318 0 50%, #13795b 50% 100%)',
              }}
            />
            Mixed observations
          </span>
        </div>
      </Panel>

    </div>
  )
}

function ScheduleRow({
  label,
  start,
  end,
  days,
  events,
}: {
  label: string
  start: number
  end: number
  days: string[]
  events: DisplayEvent[]
}) {
  return (
    <>
      <div className="flex items-center text-[11px] font-extrabold text-[#667085]">
        {label}
      </div>

      {days.map((day) => {
        const matching =
          events.filter(
            (event) => {
              const slot =
                scheduleSlot(
                  event.occurred_at
                )

              return (
                slot.day === day &&
                slot.hour >= start &&
                slot.hour < end
              )
            }
          )

        const foundHomeCount =
          matching.filter(
            (event) =>
              event.event_type ===
                'interaction' &&
              event.found_home
          ).length

        const notHomeCount =
          matching.filter(
            (event) =>
              event.event_type ===
              'knock'
          ).length

        const total =
          foundHomeCount +
          notHomeCount

        const isMixed =
          foundHomeCount > 0 &&
          notHomeCount > 0

        const observationLabel =
          total === 0
            ? 'No observations'
            : isMixed
              ? `Found home ${foundHomeCount} of ${total} times`
              : foundHomeCount > 0
                ? `Found home ${foundHomeCount} ${foundHomeCount === 1 ? 'time' : 'times'}`
                : `Not home ${notHomeCount} ${notHomeCount === 1 ? 'time' : 'times'}`

        return (
          <div
            key={`${label}-${day}`}
            className="relative grid h-12 place-items-center rounded-[10px] border border-[#eef0f3] bg-[#f9fafb]"
          >
            {total === 0 ? (
              <span className="text-sm font-black text-[#d0d5dd]">
                —
              </span>
            ) : isMixed ? (
              <details className="group relative">
                <summary
                  title={observationLabel}
                  aria-label={`${day} ${label}: ${observationLabel}. Tap for details.`}
                  className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-xs font-black text-white shadow-sm [&::-webkit-details-marker]:hidden"
                  style={{
                    background:
                      'linear-gradient(90deg, #b42318 0 50%, #13795b 50% 100%)',
                  }}
                >
                  {total}
                </summary>

                <div className="absolute left-1/2 top-10 z-20 w-max max-w-[190px] -translate-x-1/2 rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2 text-center text-[11px] font-bold leading-4 text-[#475467] shadow-[0_4px_14px_rgba(16,24,40,0.12)]">
                  Found home {foundHomeCount} of {total} times
                </div>
              </details>
            ) : (
              <div
                title={observationLabel}
                aria-label={`${day} ${label}: ${observationLabel}`}
                className={[
                  'grid h-8 w-8 place-items-center rounded-full text-xs font-black text-white shadow-sm',
                  foundHomeCount > 0
                    ? 'bg-[#13795b]'
                    : 'bg-[#b42318]',
                ].join(' ')}
              >
                {total}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function DetailTabLink({
  contactId,
  tab,
  label,
  activeTab,
  returnTo,
}: {
  contactId: string
  tab: DetailTab
  label: string
  activeTab: DetailTab
  returnTo: string
}) {
  const active =
    tab === activeTab

  const params =
    new URLSearchParams({
      tab,
      from: returnTo,
    })

  return (
    <Link
      href={`/contacts/${contactId}?${params.toString()}`}
      scroll={false}
      aria-current={
        active ? 'page' : undefined
      }
      className={[
        'shrink-0 rounded-[10px] px-3.5 py-2 text-xs font-extrabold transition',
        active
          ? 'bg-[#00274c] text-white'
          : 'text-[#667085] hover:bg-[#f2f4f7] hover:text-[#15223a]',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[20px] border border-[#e4e7ec] bg-white p-4 shadow-[0_1px_5px_rgba(16,24,40,0.03)] md:p-5">
      <h3 className="mb-4 text-[17px] font-extrabold tracking-[-0.02em] text-[#15223a]">
        {title}
      </h3>

      {children}
    </section>
  )
}

function DefinitionList({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="divide-y divide-[#eef0f3]">
      {children}
    </div>
  )
}

function DefinitionRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <FieldLabel>
        {label}
      </FieldLabel>

      <div className="mt-1 text-sm font-bold leading-5 text-[#15223a]">
        {value}
      </div>
    </div>
  )
}

function FieldLabel({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
      {children}
    </div>
  )
}

function ProgressBox({
  label,
  value,
  done,
}: {
  label: string
  value: string
  done: boolean
}) {
  return (
    <div
      className={[
        'rounded-[13px] border p-3',
        done
          ? 'border-[#d1fadf] bg-[#f0fdf7]'
          : 'border-[#e4e7ec] bg-[#f9fafb]',
      ].join(' ')}
    >
      <FieldLabel>
        {label}
      </FieldLabel>

      <div
        className={[
          'mt-1 text-sm font-extrabold',
          done
            ? 'text-[#027a48]'
            : 'text-[#475467]',
        ].join(' ')}
      >
        {done ? '✓ ' : ''}
        {value}
      </div>
    </div>
  )
}

function SurveyChip({
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
        surveyClass(value),
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
      {done ? '✓' : '○'}{' '}
      {label}
    </span>
  )
}

function AssignedBadge() {
  return (
    <span className="rounded-full border border-[#d0d5dd] bg-[#f8fafc] px-2 py-1 text-[10px] font-extrabold text-[#667085]">
      Assigned
    </span>
  )
}

function NewBelieverBadge() {
  return (
    <span className="rounded-full bg-[#fff1d6] px-2 py-1.5 text-[11px] font-bold text-[#8c5500]">
      New Believer
    </span>
  )
}

function AffinityTag({
  label,
}: {
  label: string
}) {
  return (
    <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] font-bold text-[#3538cd]">
      {label}
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
        'inline-flex rounded-full px-2.5 py-1.5 text-[11px] font-extrabold',
        statusClass(status),
      ].join(' ')}
    >
      {formatStatus(status)}
    </span>
  )
}

function Avatar({
  name,
  gender,
  status,
}: {
  name: string
  gender: string | null
  status: string
}) {
  return (
    <div
      className={[
        'grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-black text-white shadow-sm md:h-14 md:w-14 md:text-base',
        avatarClass(
          gender,
          status
        ),
      ].join(' ')}
    >
      {initials(name)}
    </div>
  )
}

function EmptyState({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d0d5dd] bg-[#f9fafb] p-5 text-center text-sm text-[#667085]">
      {children}
    </div>
  )
}

function DisabledButton({
  label,
}: {
  label: string
}) {
  return (
    <button
      type="button"
      disabled
      className="w-full rounded-[11px] border border-[#e4e7ec] bg-[#f2f4f7] px-2 py-3 text-sm font-bold text-[#98a2b3]"
    >
      {label}
    </button>
  )
}

function safeReturnTo(
  value: string | undefined
) {
  if (
    value &&
    value.startsWith('/') &&
    !value.startsWith('//')
  ) {
    return value
  }

  return '/contacts'
}

function validTab(
  value: string | undefined
): DetailTab {
  switch (value) {
    case 'survey':
    case 'history':
    case 'schedule':
      return value

    case 'overview':
    default:
      return 'overview'
  }
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

function genderLabel(
  gender: string | null
) {
  const category =
    genderCategory(gender)

  if (category === 'male') {
    return 'Male'
  }

  if (category === 'female') {
    return 'Female'
  }

  return (
    gender?.trim() ||
    'Other / unspecified'
  )
}

function stripeClass(
  gender: string | null,
  status: string
) {
  if (
    status === 'not_interested'
  ) {
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

function avatarClass(
  gender: string | null,
  status: string
) {
  if (
    status === 'not_interested'
  ) {
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

function detailCardClass(
  gender: string | null,
  status: string
) {
  if (
    status === 'not_interested'
  ) {
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

function surveyClass(
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
    return [
      area,
      house,
      room,
    ]
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

function initials(
  name: string
) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function phoneHref(
  phone: string
) {
  const trimmed =
    phone.trim()

  const hasPlus =
    trimmed.startsWith('+')

  const digits =
    trimmed.replace(
      /\D/g,
      ''
    )

  return hasPlus
    ? `+${digits}`
    : digits
}

function fullDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone:
        'America/Detroit',
    }
  ).format(new Date(value))
}

function scheduleSlot(
  value: string
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        weekday: 'short',
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone:
          'America/Detroit',
      }
    ).formatToParts(
      new Date(value)
    )

  const day =
    parts.find(
      (part) =>
        part.type ===
        'weekday'
    )?.value ?? ''

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type === 'hour'
      )?.value ?? -1
    )

  return {
    day,
    hour,
  }
}

function unique(
  values: string[]
) {
  return Array.from(
    new Set(values)
  )
}