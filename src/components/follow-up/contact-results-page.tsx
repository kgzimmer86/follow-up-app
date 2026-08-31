import Link from 'next/link'
import type { ReactNode } from 'react'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InteractionButton } from '@/components/follow-up/interaction-button'

export type ContactView =
  | 'mine'
  | 'goback'
  | 'gospel'
  | 'new'
  | 'cg'
  | 'noaddress'
  | 'area'

export type ContactResultsSearchParams = {
  sort?: string
  dir?: string
  campus?: string
  location?: string
  gender?: string
  status?: string
  jesus?: string | string[]
  community?: string | string[]
  interview?: string | string[]
  kgp?: string
  interviewDone?: string
  affinity?: string
  floor?: string
  wing?: string
  page?: string
}

type Props = {
  view: ContactView
  basePath: string
  searchParams: ContactResultsSearchParams
}

type SortBy = 'name' | 'room'
type SortDir = 'asc' | 'desc'

type FilterValues = {
  campus: string
  location: string
  gender: string
  status: string
  jesus: string
  community: string
  interview: string
  kgp: string
  interviewDone: string
  affinity: string
  floor: string
  wing: string
}

type AreaRow = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

type ResultNote = {
  id: string
  occurred_at: string
  notes: string | null
  performed_by: string
  performer_name: string
}

type ContactResultRow = {
  id: string
  student_id: string
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
  display_name: string
  uniqname: string | null
  umich_email: string | null
  area_name: string | null
  owner_name: string | null
  affinity_names: string[]
  interaction_notes: ResultNote[]
}

type ContactResultsResponse = {
  campaign_id: string
  campaign_label: string
  default_area_id: string | null
  default_area_name: string | null
  total_count: number
  page: number
  page_size: number
  floor_options: string[]
  wing_options: string[]
  rows: ContactResultRow[]
}

const RESULTS_PAGE_SIZE = 50

function normalizeMultiFilter(
  value: string | string[] | undefined
) {
  const rawValues = Array.isArray(value)
    ? value
    : value
      ? [value]
      : []

  const normalized = rawValues
    .flatMap((item) =>
      item
        .split(',')
        .map((part) =>
          part.trim().toLowerCase()
        )
    )
    .filter(Boolean)

  return [...new Set(normalized)].join(',')
}

function parsePage(
  value: string | undefined
) {
  const parsed = Number(value)

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return 1
  }

  return parsed
}

export async function ContactResultsPage({
  view,
  basePath,
  searchParams,
}: Props) {
  const sortBy: SortBy =
    searchParams.sort === 'room'
      ? 'room'
      : 'name'

  const sortDir: SortDir =
    searchParams.dir === 'desc'
      ? 'desc'
      : 'asc'

  const requestedPage =
    parsePage(
      searchParams.page
    )

  const filters: FilterValues = {
    campus: searchParams.campus ?? '',
    location: searchParams.location ?? '',
    gender: searchParams.gender ?? '',
    status: searchParams.status ?? '',
    jesus: normalizeMultiFilter(
      searchParams.jesus
    ),
    community: normalizeMultiFilter(
      searchParams.community
    ),
    interview: normalizeMultiFilter(
      searchParams.interview
    ),
    kgp: searchParams.kgp ?? '',
    interviewDone:
      searchParams.interviewDone ?? '',
    affinity:
      searchParams.affinity ?? '',
    floor:
      searchParams.floor ?? '',
    wing:
      searchParams.wing ?? '',
  }

  const activeFilterCount =
    Object.values(filters).filter(
      Boolean
    ).length

  const filterStateKey = [
    filters.campus,
    filters.location,
    filters.gender,
    filters.status,
    filters.jesus,
    filters.community,
    filters.interview,
    filters.kgp,
    filters.interviewDone,
    filters.affinity,
    filters.floor,
    filters.wing,
  ].join('|')

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const userId = user.id

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', userId)
      .maybeSingle()

  if (
    !profile ||
    profile.role === 'pending' ||
    !profile.is_active
  ) {
    redirect('/')
  }

  const {
    data: areaData,
    error: areaError,
  } = await supabase
    .from('ministry_areas')
    .select(
      'id, name, area_type, parent_id'
    )
    .eq('is_active', true)

  if (areaError) {
    throw new Error(areaError.message)
  }

  const areas =
    (areaData ?? []) as AreaRow[]

  const campusAreas = areas
    .filter(
      (area) =>
        area.parent_id === null &&
        area.area_type !== 'affinity'
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    )

  const locationAreas = areas
    .filter(
      (area) =>
        area.parent_id !== null &&
        area.area_type !== 'affinity'
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    )

  const affinityAreas = areas
    .filter(
      (area) =>
        area.area_type === 'affinity'
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    )

  const {
    data: resultsData,
    error: resultsError,
  } = await supabase.rpc(
    'get_follow_up_contact_results',
    {
      p_view: view,
      p_sort: sortBy,
      p_dir: sortDir,
      p_page: requestedPage,
      p_page_size:
        RESULTS_PAGE_SIZE,
      p_campus:
        filters.campus || null,
      p_location:
        filters.location || null,
      p_gender:
        filters.gender || null,
      p_status:
        filters.status || null,
      p_jesus:
        filters.jesus || null,
      p_community:
        filters.community || null,
      p_interview:
        filters.interview || null,
      p_kgp:
        filters.kgp || null,
      p_interview_done:
        filters.interviewDone || null,
      p_affinity:
        filters.affinity || null,
      p_floor:
        filters.floor || null,
      p_wing:
        filters.wing || null,
    }
  )

  if (resultsError) {
    throw new Error(
      resultsError.message
    )
  }

  const results =
    resultsData as ContactResultsResponse | null

  if (!results) {
    throw new Error(
      'Follow Up contact results could not be loaded.'
    )
  }

  const totalVisibleContacts =
    Number(results.total_count) || 0

  const floorOptions =
    results.floor_options ?? []

  const wingOptions =
    results.wing_options ?? []

  const hasSpecificLocation =
    Boolean(filters.location) &&
    ![
      'no_address',
      'needs_area_assignment',
    ].includes(filters.location)

  const floorFilterAvailable =
    hasSpecificLocation &&
    floorOptions.length > 0

  const wingFilterAvailable =
    hasSpecificLocation &&
    wingOptions.length > 0

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalVisibleContacts /
        RESULTS_PAGE_SIZE
    )
  )

  const currentPage = Math.min(
    requestedPage,
    totalPages
  )

  if (
    requestedPage !== currentPage
  ) {
    redirect(
      resultsHref({
        basePath,
        sort: sortBy,
        dir: sortDir,
        filters,
        page: currentPage,
      })
    )
  }

  const pageStart =
    (currentPage - 1) *
    RESULTS_PAGE_SIZE

  const paginatedContacts =
    (results.rows ?? []) as ContactResultRow[]

  const returnToResults =
    resultsHref({
      basePath,
      sort: sortBy,
      dir: sortDir,
      filters,
      page: currentPage,
    })

  async function logKnock(
    formData: FormData
  ) {
    'use server'

    const contactId =
      formData.get('contactId')

    if (
      typeof contactId !== 'string'
    ) {
      throw new Error(
        'Contact ID is missing.'
      )
    }

    const supabase =
      await createClient()

    const { error } =
      await supabase.rpc(
        'log_knock',
        {
          p_contact_id: contactId,
        }
      )

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath(basePath)
    revalidatePath('/contacts')
    revalidatePath('/')
  }

  const viewInfo = getViewInfo(
    view,
    results.default_area_name ||
      'All Campus'
  )

  const clearFiltersHref =
    `${resultsHref({
      basePath,
      sort: sortBy,
      dir: sortDir,
    })}#results`

  return (
    <main className="mx-auto max-w-[1000px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
          {viewInfo.eyebrow}
        </div>

        <h2 className="mt-1 text-[30px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#15223a]">
          {viewInfo.title}
        </h2>

        <p className="mt-2 max-w-[650px] text-sm leading-6 text-[#667085]">
          {viewInfo.description}
        </p>

        {view === 'area' ? (
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#175cd3] hover:underline"
          >
            ← Back to Home
          </Link>
        ) : view !== 'mine' ? (
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[#175cd3] hover:underline"
          >
            ← Choose a different step of faith
          </Link>
        ) : null}
      </section>

      <details
        key={`filters-${filterStateKey || 'none'}`}
        className="mt-5 overflow-hidden rounded-[18px] border border-[#e4e7ec] bg-white"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
          <div>
            <div className="text-sm font-extrabold text-[#15223a]">
              Filters
            </div>

            <div className="mt-0.5 text-xs text-[#667085]">
              Narrow this list by location,
              floor or wing, survey answers,
              progress, status or affinity.
            </div>
          </div>

          <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11px] font-extrabold text-[#3538cd]">
            {activeFilterCount > 0
              ? `${activeFilterCount} active`
              : 'Open'}
          </span>
        </summary>

        <form
          method="get"
          action={`${basePath}#results`}
          className="border-t border-[#e4e7ec] p-4"
        >
          <input
            type="hidden"
            name="sort"
            value={sortBy}
          />

          <input
            type="hidden"
            name="dir"
            value={sortDir}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FilterSelect
              label="Campus area"
              name="campus"
              value={
                filters.campus
              }
            >
              <option value="">
                Any
              </option>

              {campusAreas.map(
                (area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.name}
                  </option>
                )
              )}
            </FilterSelect>

            <FilterSelect
              label="Dorm / location"
              name="location"
              value={
                filters.location
              }
            >
              <option value="">
                Any
              </option>

              {campusAreas.map(
                (campus) => {
                  const children =
                    locationAreas.filter(
                      (area) =>
                        area.parent_id ===
                        campus.id
                    )

                  if (
                    children.length ===
                    0
                  ) {
                    return null
                  }

                  return (
                    <optgroup
                      key={campus.id}
                      label={
                        campus.name
                      }
                    >
                      {children.map(
                        (area) => (
                          <option
                            key={area.id}
                            value={area.id}
                          >
                            {area.name}
                          </option>
                        )
                      )}
                    </optgroup>
                  )
                }
              )}

              <optgroup label="Other">
                <option value="no_address">
                  No Address
                </option>

                <option value="needs_area_assignment">
                  Needs Area Assignment
                </option>
              </optgroup>
            </FilterSelect>

            <FilterSelect
              label="Floor"
              name="floor"
              value={filters.floor}
              disabled={!floorFilterAvailable}
            >
              <option value="">
                {!hasSpecificLocation
                  ? 'Choose dorm first'
                  : floorOptions.length === 0
                    ? 'Not available'
                    : 'Any'}
              </option>

              {floorOptions.map(
                (floor) => (
                  <option
                    key={floor}
                    value={floor}
                  >
                    {floor}
                  </option>
                )
              )}
            </FilterSelect>

            <FilterSelect
              label="Wing / house #"
              name="wing"
              value={filters.wing}
              disabled={!wingFilterAvailable}
            >
              <option value="">
                {!hasSpecificLocation
                  ? 'Choose dorm first'
                  : wingOptions.length === 0
                    ? 'Not available'
                    : 'Any'}
              </option>

              {wingOptions.map(
                (wing) => (
                  <option
                    key={wing}
                    value={wing}
                  >
                    {wing}
                  </option>
                )
              )}
            </FilterSelect>

            <FilterSelect
              label="Gender"
              name="gender"
              value={
                filters.gender
              }
            >
              <option value="">
                Any
              </option>
              <option value="male">
                Male
              </option>
              <option value="female">
                Female
              </option>
              <option value="other">
                Other / unspecified
              </option>
            </FilterSelect>

            <FilterSelect
              label="Status"
              name="status"
              value={
                filters.status
              }
            >
              <option value="">
                Any
              </option>
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
            </FilterSelect>

            <MultiFilterGroup
              label="Jesus"
              name="jesus"
              value={filters.jesus}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'maybe', label: 'Maybe' },
                { value: 'no', label: 'No' },
                {
                  value: 'already_have_one',
                  label: 'Already have one',
                },
              ]}
            />

            <MultiFilterGroup
              label="Community"
              name="community"
              value={filters.community}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'maybe', label: 'Maybe' },
                { value: 'no', label: 'No' },
              ]}
            />

            <MultiFilterGroup
              label="Interview"
              name="interview"
              value={filters.interview}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'maybe', label: 'Maybe' },
                { value: 'no', label: 'No' },
              ]}
            />

            <FilterSelect
              label="KGP shared"
              name="kgp"
              value={filters.kgp}
            >
              <option value="">
                Any
              </option>
              <option value="shared">
                Yes
              </option>
              <option value="not_shared">
                No
              </option>
            </FilterSelect>

            <FilterSelect
              label="Interview done"
              name="interviewDone"
              value={
                filters.interviewDone
              }
            >
              <option value="">
                Any
              </option>
              <option value="completed">
                Yes
              </option>
              <option value="not_completed">
                No
              </option>
            </FilterSelect>

            <FilterSelect
              label="Affinity"
              name="affinity"
              value={
                filters.affinity
              }
            >
              <option value="">
                Any
              </option>

              {affinityAreas.map(
                (area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.name}
                  </option>
                )
              )}
            </FilterSelect>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef0f3] pt-4">
            <button
              type="submit"
              className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white"
            >
              Apply Filters
            </button>

            <a
              href={clearFiltersHref}
              className="rounded-[11px] border border-[#e4e7ec] bg-white px-4 py-2.5 text-sm font-extrabold text-[#15223a]"
            >
              Clear Filters
            </a>
          </div>
        </form>
      </details>

      <section className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="text-xs font-bold text-[#98a2b3]">
            {totalVisibleContacts}{' '}
            {totalVisibleContacts === 1
              ? 'contact'
              : 'contacts'}
            {totalVisibleContacts >
            RESULTS_PAGE_SIZE
              ? ` • page ${currentPage} of ${totalPages}`
              : ''}
            {activeFilterCount > 0
              ? ` • ${activeFilterCount} filters active`
              : ''}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <SortLink
              label="Name ↑"
              active={
                sortBy === 'name' &&
                sortDir === 'asc'
              }
              href={resultsHref({
                basePath,
                sort: 'name',
                dir: 'asc',
                filters,
              })}
            />

            <SortLink
              label="Name ↓"
              active={
                sortBy === 'name' &&
                sortDir === 'desc'
              }
              href={resultsHref({
                basePath,
                sort: 'name',
                dir: 'desc',
                filters,
              })}
            />

            <SortLink
              label="Room ↑"
              active={
                sortBy === 'room' &&
                sortDir === 'asc'
              }
              href={resultsHref({
                basePath,
                sort: 'room',
                dir: 'asc',
                filters,
              })}
            />

            <SortLink
              label="Room ↓"
              active={
                sortBy === 'room' &&
                sortDir === 'desc'
              }
              href={resultsHref({
                basePath,
                sort: 'room',
                dir: 'desc',
                filters,
              })}
            />
          </div>
        </div>
      </section>

      <div
        id="results"
        className="mt-4 grid scroll-mt-24 gap-3 md:grid-cols-2"
      >
        {totalVisibleContacts ===
          0 && (
          <div className="rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-7 text-center text-[#667085] md:col-span-2">
            No contacts match this
            opportunity and your current
            filters.
          </div>
        )}

        {paginatedContacts.map(
          (contact) => {
            const hasLocation =
              contact.location_resolution !==
                'no_address' &&
              Boolean(
                contact.area_name ||
                  contact.room_or_address
              )

            const email =
              contact.umich_email ||
              (contact.uniqname
                ? `${contact.uniqname}@umich.edu`
                : null)

            const recentNotes =
              contact.interaction_notes ?? []

            return (
              <article
                key={contact.id}
                id={`contact-${contact.id}`}
                className={[
                  cardClass(
                    contact.gender_raw,
                    contact.status
                  ),
                  'scroll-mt-24',
                ].join(' ')}
              >
                <div
                  className={[
                    'absolute inset-y-0 left-0 w-[6px]',
                    stripeClass(
                      contact.gender_raw,
                      contact.status
                    ),
                  ].join(' ')}
                />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/contacts/${contact.id}?from=${encodeURIComponent(
                            `${returnToResults}#contact-${contact.id}`
                          )}`}
                          className="block truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#15223a] hover:text-[#175cd3]"
                        >
                          {
                            contact.display_name
                          }
                        </Link>

                        {contact.primary_owner_id && (
                          <AssignedBadge />
                        )}
                      </div>

                      <div className="mt-1 truncate text-[13px] text-[#667085]">
                        {formatLocation(
                          contact.area_name,
                          contact.house_name,
                          contact.room_or_address,
                          contact.location_resolution
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[#98a2b3]">
                        <span>
                          {contact.year_at_um ||
                            'Year unknown'}
                        </span>

                        {email && (
                          <a
                            href={`mailto:${email}`}
                            className="text-[#175cd3] hover:underline"
                          >
                            {email}
                          </a>
                        )}
                      </div>
                    </div>

                    <StatusBadge
                      status={
                        contact.status
                      }
                    />
                  </div>

                  <div className="my-3 flex flex-wrap gap-1.5">
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
                      <NewBelieverBadge />
                    )}
                  </div>

                  {contact.affinity_names.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {contact.affinity_names.map(
                        (affinity) => (
                          <AffinityTag
                            key={affinity}
                            label={affinity}
                          />
                        )
                      )}
                    </div>
                  )}

                  <div
                    className={[
                      'mt-3 max-h-[108px] overflow-y-auto rounded-[11px] border p-2.5 text-[13px] leading-[1.4]',
                      contact.status ===
                      'not_interested'
                        ? 'border-[#f3c4c1] bg-[#fff7f7] text-[#7a3d38]'
                        : 'border-transparent bg-[#f9fafb] text-[#475467]',
                    ].join(' ')}
                  >
                    <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                      Interaction notes
                    </div>

                    {recentNotes.length >
                    0 ? (
                      recentNotes.map(
                        (
                          interaction,
                          index
                        ) => (
                          <div
                            key={
                              interaction.id
                            }
                            className={
                              index === 0
                                ? ''
                                : 'mt-2 border-t border-[#e4e7ec] pt-2'
                            }
                          >
                            <small className="mb-0.5 block text-[#98a2b3]">
                              {shortDate(
                                interaction.occurred_at
                              )}
                              {' • '}
                              {
                                interaction.performer_name ||
                                'Follow Up leader'
                              }
                            </small>

                            {
                              interaction.notes
                            }
                          </div>
                        )
                      )
                    ) : (
                      <div>
                        No interaction
                        notes yet.
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex justify-between gap-3 text-[11px] text-[#667085]">
                    <span>
                      {
                        contact.knock_count
                      }{' '}
                      {contact.knock_count ===
                      1
                        ? 'knock'
                        : 'knocks'}
                      {contact.last_knock_at
                        ? ` • last ${shortDate(
                            contact.last_knock_at
                          )}`
                        : ''}
                    </span>

                    <span className="truncate text-right">
                      {contact.owner_name
                        ? `Primary: ${contact.owner_name}`
                        : 'Unassigned'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {contact.phone ? (
                      <a
                        href={`sms:${phoneHref(
                          contact.phone
                        )}`}
                        className="block rounded-[11px] border border-[#e4e7ec] bg-white px-2 py-2.5 text-center text-sm font-extrabold text-[#15223a]"
                      >
                        Text
                      </a>
                    ) : (
                      <DisabledButton
                        label="Text"
                      />
                    )}

                    {hasLocation ? (
                      <form
                        action={logKnock}
                      >
                        <input
                          type="hidden"
                          name="contactId"
                          value={
                            contact.id
                          }
                        />

                        <button
                          type="submit"
                          className="w-full rounded-[11px] border border-[#ffcb05] bg-[#ffcb05] px-2 py-2.5 text-sm font-extrabold text-[#00274c]"
                        >
                          Knocked
                        </button>
                      </form>
                    ) : contact.phone ? (
                      <a
                        href={`tel:${phoneHref(
                          contact.phone
                        )}`}
                        className="block rounded-[11px] border border-[#e4e7ec] bg-white px-2 py-2.5 text-center text-sm font-extrabold text-[#15223a]"
                      >
                        Call
                      </a>
                    ) : (
                      <DisabledButton
                        label="Call"
                      />
                    )}

                    <InteractionButton
                      contactId={
                        contact.id
                      }
                      contactName={
                        contact.display_name
                      }
                      currentStatus={
                        contact.status
                      }
                      isPrimary={
                        contact.primary_owner_id ===
                        userId
                      }
                    />
                  </div>
                </div>
              </article>
            )
          }
        )}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Contact results pages"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#e4e7ec] bg-white px-4 py-3"
        >
          <div className="text-xs font-bold text-[#667085]">
            Showing{' '}
            {pageStart + 1}–
            {Math.min(
              pageStart +
                RESULTS_PAGE_SIZE,
              totalVisibleContacts
            )}{' '}
            of{' '}
            {totalVisibleContacts}
          </div>

          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={`${resultsHref({
                  basePath,
                  sort: sortBy,
                  dir: sortDir,
                  filters,
                  page:
                    currentPage - 1,
                })}#results`}
                className="rounded-[10px] border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-extrabold text-[#475467] hover:border-[#98a2b3]"
              >
                ← Previous
              </Link>
            ) : (
              <span className="rounded-[10px] border border-[#e4e7ec] bg-[#f9fafb] px-3 py-2 text-xs font-extrabold text-[#98a2b3]">
                ← Previous
              </span>
            )}

            <span className="px-1 text-xs font-extrabold text-[#475467]">
              {currentPage} /{' '}
              {totalPages}
            </span>

            {currentPage <
            totalPages ? (
              <Link
                href={`${resultsHref({
                  basePath,
                  sort: sortBy,
                  dir: sortDir,
                  filters,
                  page:
                    currentPage + 1,
                })}#results`}
                className="rounded-[10px] border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-extrabold text-[#475467] hover:border-[#98a2b3]"
              >
                Next →
              </Link>
            ) : (
              <span className="rounded-[10px] border border-[#e4e7ec] bg-[#f9fafb] px-3 py-2 text-xs font-extrabold text-[#98a2b3]">
                Next →
              </span>
            )}
          </div>
        </nav>
      )}
    </main>
  )
}

function getViewInfo(
  view: ContactView,
  areaName: string
) {
  switch (view) {
    case 'mine':
      return {
        eyebrow: 'Your Follow Up',
        title: 'My Contacts',
        description:
          'Students where you are the primary follow-up person.',
      }

    case 'goback':
      return {
        eyebrow: `Today in ${areaName}`,
        title: 'Go Back',
        description:
          'Continue conversations with students you have already connected with who are still worth pursuing.',
      }

    case 'gospel':
      return {
        eyebrow: `Today in ${areaName}`,
        title: 'Share the Gospel',
        description: `Spiritually open students in ${areaName} who have not had KGP shared.`,
      }

    case 'new':
      return {
        eyebrow: `Today in ${areaName}`,
        title: 'Meet Someone New',
        description: `Interested students in ${areaName} who have not yet had an actual interaction with anyone.`,
      }

    case 'cg':
      return {
        eyebrow: `Today in ${areaName}`,
        title:
          'Invite to Community Group',
        description: `Students in ${areaName} who indicated they are open to Christian community.`,
      }

    case 'noaddress':
      return {
        eyebrow: 'Campus-wide',
        title:
          'Reach Out to No Address',
        description:
          'Interested students we cannot geographically place yet. Reach out by text or phone instead of knocking.',
      }

    case 'area':
      return {
        eyebrow: 'Browse Your Area',
        title: `Contacts in ${areaName}`,
        description:
          'Browse all Follow Up contacts in your default ministry area.',
      }
  }
}

function resultsHref({
  basePath,
  sort,
  dir,
  filters,
  page,
}: {
  basePath: string
  sort: SortBy
  dir: SortDir
  filters?: FilterValues
  page?: number
}) {
  const params =
    new URLSearchParams()

  params.set('sort', sort)
  params.set('dir', dir)

  if (
    page &&
    page > 1
  ) {
    params.set(
      'page',
      String(page)
    )
  }

  if (filters) {
    for (
      const [key, value] of
      Object.entries(filters)
    ) {
      if (value) {
        params.set(key, value)
      }
    }
  }

  return `${basePath}?${params.toString()}`
}

function FilterSelect({
  label,
  name,
  value,
  children,
  disabled = false,
}: {
  label: string
  name: string
  value: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-extrabold text-[#667085]">
        {label}
      </span>

      <select
        name={name}
        defaultValue={value}
        disabled={disabled}
        className={[
          'w-full rounded-[11px] border border-[#e4e7ec] px-2.5 py-2.5 text-sm',
          disabled
            ? 'cursor-not-allowed bg-[#f9fafb] text-[#98a2b3]'
            : 'bg-white text-[#15223a]',
        ].join(' ')}
      >
        {children}
      </select>
    </label>
  )
}

function MultiFilterGroup({
  label,
  name,
  value,
  options,
}: {
  label: string
  name: string
  value: string
  options: {
    value: string
    label: string
  }[]
}) {
  const selected = new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )

  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-extrabold text-[#667085]">
        {label}
      </legend>

      <div className="rounded-[11px] border border-[#e4e7ec] bg-white px-2.5 py-2">
        <div className="mb-1.5 text-[10px] font-bold text-[#98a2b3]">
          Any if none selected
        </div>

        <div className="grid gap-1.5">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-xs font-bold text-[#475467]"
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={selected.has(
                  option.value
                )}
                className="h-4 w-4 rounded border-[#d0d5dd]"
              />

              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  )
}

function SortLink({
  label,
  active,
  href,
}: {
  label: string
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className={[
        'rounded-[10px] border px-2.5 py-2 text-xs font-extrabold',
        active
          ? 'border-[#00274c] bg-[#00274c] text-white'
          : 'border-[#e4e7ec] bg-white text-[#667085]',
      ].join(' ')}
    >
      {label}
    </Link>
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
      {done ? '✓' : '○'} {label}
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
        'shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold',
        statusClass(status),
      ].join(' ')}
    >
      {formatStatus(status)}
    </span>
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
      className="w-full rounded-[11px] border border-[#e4e7ec] bg-[#f2f4f7] px-2 py-2.5 text-sm font-bold text-[#98a2b3]"
    >
      {label}
    </button>
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

function stripeClass(
  gender: string | null,
  status: string
) {
  if (
    status ===
    'not_interested'
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

function cardClass(
  gender: string | null,
  status: string
) {
  if (
    status ===
    'not_interested'
  ) {
    return 'relative overflow-hidden rounded-[20px] border border-[#f1a7a3] bg-[#fff0f0] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  const category =
    genderCategory(gender)

  if (category === 'female') {
    return 'relative overflow-hidden rounded-[20px] border border-[#eadbe5] bg-[#fffafd] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  if (category === 'male') {
    return 'relative overflow-hidden rounded-[20px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  return 'relative overflow-hidden rounded-[20px] border border-[#e4e7ec] bg-white shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
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

function phoneHref(
  phone: string
) {
  const trimmed = phone.trim()

  const hasPlus =
    trimmed.startsWith('+')

  const digits =
    trimmed.replace(/\D/g, '')

  return hasPlus
    ? `+${digits}`
    : digits
}

