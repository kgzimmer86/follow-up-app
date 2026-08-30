import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

type PageProps = {
  searchParams: Promise<{
    q?: string
    role?: string
    area?: string
    sort?: string
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

type AreaRow = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

type LeadersWorkspace = {
  leaders: LeaderRow[]
  areas: AreaRow[]
}

export default async function ManageLeadersPage({
  searchParams,
}: PageProps) {
  const params = await searchParams
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
    'get_manage_leaders'
  )

  if (error) {
    throw new Error(error.message)
  }

  const {
    data: allAreasData,
    error: allAreasError,
  } = await supabase
    .from('ministry_areas')
    .select('id, name, area_type, parent_id')
    .eq('is_active', true)

  if (allAreasError) {
    throw new Error(allAreasError.message)
  }

  const workspace = data as LeadersWorkspace

  const allAreas =
    (allAreasData ?? []) as AreaRow[]

  const selectedArea =
    params.area
      ? allAreas.find(
          (area) =>
            area.id === params.area
        ) ?? null
      : null

  const areaMap = new Map(
    allAreas.map((area) => [
      area.id,
      area,
    ])
  )

  const campusRegions =
    allAreas
      .filter(
        (area) =>
          area.area_type ===
          'campus_region'
      )
      .sort((a, b) =>
        campusAreaOrder(a.name) -
          campusAreaOrder(b.name) ||
        a.name.localeCompare(b.name)
      )

  const affinityAreas =
    allAreas
      .filter(
        (area) =>
          area.area_type ===
          'affinity'
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      )

  const query =
    params.q?.trim().toLowerCase() ?? ''

  const roleFilter =
    params.role === 'student_leader' ||
    params.role === 'discipler'
      ? params.role
      : ''

  const areaFilter =
    params.area?.trim() ?? ''

  const sort =
    params.sort === 'assigned' ||
    params.sort === 'engagement' ||
    params.sort === 'attention'
      ? params.sort
      : 'name'

  const filtered = workspace.leaders
    .filter((leader) => {
      if (
        query &&
        !(
          leader.display_name ??
          'Unnamed leader'
        )
          .toLowerCase()
          .includes(query)
      ) {
        return false
      }

      if (
        roleFilter &&
        leader.role !== roleFilter
      ) {
        return false
      }

      if (
        areaFilter &&
        !leaderMatchesArea(
          leader,
          selectedArea,
          areaMap
        )
      ) {
        return false
      }

      return true
    })
    .sort((a, b) => {
      if (sort === 'assigned') {
        return (
          toNumber(b.assigned_contacts) -
            toNumber(a.assigned_contacts) ||
          leaderName(a).localeCompare(
            leaderName(b)
          )
        )
      }

      if (sort === 'engagement') {
        const aAssigned =
          toNumber(a.assigned_contacts)
        const bAssigned =
          toNumber(b.assigned_contacts)

        if (
          aAssigned === 0 &&
          bAssigned > 0
        ) {
          return 1
        }

        if (
          bAssigned === 0 &&
          aAssigned > 0
        ) {
          return -1
        }

        return (
          toNumber(
            a.engagement_percent
          ) -
            toNumber(
              b.engagement_percent
            ) ||
          leaderName(a).localeCompare(
            leaderName(b)
          )
        )
      }

      if (sort === 'attention') {
        return (
          toNumber(b.needs_attention) -
            toNumber(a.needs_attention) ||
          leaderName(a).localeCompare(
            leaderName(b)
          )
        )
      }

      return leaderName(a).localeCompare(
        leaderName(b)
      )
    })

  const studentLeaderCount =
    workspace.leaders.filter(
      (leader) =>
        leader.role === 'student_leader'
    ).length

  const disciplerCount =
    workspace.leaders.filter(
      (leader) =>
        leader.role === 'discipler'
    ).length

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
            See each leader&apos;s personal
            follow-up load, engagement, and
            attention needs across the movement.
          </p>

          <ManageTabs role={profile.role} active="leaders" />
        </div>

        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                Movement Leaders
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                Leaders & Disciplers
              </h2>

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {studentLeaderCount}{' '}
                {studentLeaderCount === 1
                  ? 'Student Leader'
                  : 'Student Leaders'}
                {' • '}
                {disciplerCount}{' '}
                {disciplerCount === 1
                  ? 'Discipler'
                  : 'Disciplers'}
              </p>
            </div>

            <div className="text-xs font-bold text-[#667085]">
              {filtered.length}{' '}
              {filtered.length === 1
                ? 'person shown'
                : 'people shown'}
            </div>
          </div>

          <form
            method="get"
            className="mt-4 grid gap-3 rounded-[18px] border border-[#e4e7ec] bg-white p-4 md:grid-cols-[minmax(0,1fr)_170px_210px_190px_auto]"
          >
            <label className="min-w-0">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                Search
              </span>

              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Search leaders by name..."
                className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a] outline-none transition focus:border-[#175cd3]"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                Role
              </span>

              <select
                name="role"
                defaultValue={roleFilter}
                className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#475467]"
              >
                <option value="">
                  All roles
                </option>

                <option value="student_leader">
                  Student Leaders
                </option>

                <option value="discipler">
                  Disciplers
                </option>
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                Ministry area / location
              </span>

              <select
                name="area"
                defaultValue={areaFilter}
                className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#475467]"
              >
                <option value="">
                  All areas & locations
                </option>

                {campusRegions.map(
                  (region) => {
                    const locations =
                      allAreas
                        .filter(
                          (area) =>
                            area.parent_id ===
                            region.id
                        )
                        .sort((a, b) =>
                          dormOrder(
                            region.name,
                            a.name
                          ) -
                            dormOrder(
                              region.name,
                              b.name
                            ) ||
                          a.name.localeCompare(
                            b.name
                          )
                        )

                    return (
                      <optgroup
                        key={region.id}
                        label={region.name}
                      >
                        <option
                          value={region.id}
                        >
                          {region.name} — all
                        </option>

                        {locations.map(
                          (location) => (
                            <option
                              key={
                                location.id
                              }
                              value={
                                location.id
                              }
                            >
                              {location.name}
                            </option>
                          )
                        )}
                      </optgroup>
                    )
                  }
                )}

                {affinityAreas.length >
                  0 && (
                  <optgroup label="Affinity ministries">
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
                  </optgroup>
                )}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                Sort
              </span>

              <select
                name="sort"
                defaultValue={sort}
                className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#475467]"
              >
                <option value="name">
                  Name
                </option>

                <option value="assigned">
                  Most assigned
                </option>

                <option value="engagement">
                  Lowest engagement
                </option>

                <option value="attention">
                  Most attention
                </option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#113a67]"
              >
                Apply
              </button>

              {(query ||
                roleFilter ||
                areaFilter ||
                sort !== 'name') && (
                <Link
                  href="/manage/leaders"
                  className="rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-extrabold text-[#475467]"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>

          {filtered.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-7 text-center text-sm text-[#667085]">
              No leaders match those filters.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {filtered.map((leader) => (
                <LeaderCard
                  key={leader.id}
                  leader={leader}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}


function LeaderCard({
  leader,
}: {
  leader: LeaderRow
}) {
  const assigned =
    toNumber(leader.assigned_contacts)

  const engaged =
    toNumber(leader.engaged_contacts)

  const engagement =
    Math.min(
      100,
      Math.max(
        0,
        toNumber(
          leader.engagement_percent
        )
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

  const disciples =
    toNumber(
      leader.direct_disciple_count
    )

  return (
    <Link
      href={`/manage/leaders/${leader.id}`}
      className="block rounded-[20px] border border-[#e4e7ec] bg-white p-4 shadow-[0_1px_5px_rgba(16,24,40,0.03)] transition hover:border-[#98a2b3] hover:shadow-[0_4px_14px_rgba(16,24,40,0.06)] md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-extrabold tracking-[-0.025em] text-[#15223a]">
              {leaderName(leader)}
            </h3>

            <RoleBadge
              role={leader.role}
            />
          </div>

          <p className="mt-1 text-xs font-semibold text-[#667085]">
            {leader.default_area_name ??
              'No default ministry area'}
          </p>
        </div>

        {attention > 0 && (
          <span className="shrink-0 rounded-full bg-[#fff8eb] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708]">
            {attention} need
            {attention === 1
              ? 's'
              : ''}{' '}
            attention
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
              Contact engagement
            </div>

            <div className="mt-1 text-sm font-extrabold text-[#15223a]">
              {engaged} of {assigned}{' '}
              assigned contacts engaged
            </div>
          </div>

          <div className="text-lg font-black text-[#15223a]">
            {engagement}%
          </div>
        </div>

        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-[#eef0f3]">
          <div
            className="h-full rounded-full bg-[#175cd3]"
            style={{
              width: `${engagement}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <SmallMetric
          value={assigned}
          label="Assigned"
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
          value={interactionsThisWeek}
          label="This week"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0f3] pt-4 text-[11px] font-semibold text-[#667085]">
        <span>
          {leader.last_activity_at
            ? `Last activity ${shortDate(
                leader.last_activity_at
              )}`
            : 'No activity recorded'}
        </span>

        {leader.role ===
          'discipler' && (
          <span className="rounded-full bg-[#eef4ff] px-2.5 py-1.5 font-extrabold text-[#3538cd]">
            {disciples}{' '}
            {disciples === 1
              ? 'disciple'
              : 'disciples'}
          </span>
        )}
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

function SmallMetric({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[12px] bg-[#f9fafb] px-2 py-3 text-center">
      <div className="text-lg font-black leading-none text-[#15223a]">
        {value}
      </div>

      <div className="mt-1.5 text-[9px] font-bold text-[#667085]">
        {label}
      </div>
    </div>
  )
}

const geographicAreaOrder = [
  'Central Campus',
  'The Hill',
  'North Campus',
  'The Village',
]

const dormsByArea: Record<
  string,
  string[]
> = {
  'Central Campus': [
    'West Quad',
    'East Quad',
    'South Quad',
    'North Quad',
    'Fletcher',
    'Betsy Barbour',
    'Helen Newberry',
    'Martha Cook',
    'Munger',
    'Off Campus — Central',
  ],

  'The Hill': [
    'Markley',
    'Mosher Jordan (MoJo)',
    'Oxford',
    'Alice Lloyd',
    'Couzens',
    'Stockwell',
    'Off Campus — Hill',
  ],

  'North Campus': [
    'Bursley',
    'Baits',
    'Northwood Apartments',
    'Off Campus — North',
  ],

  'The Village': [
    'Building 1',
    'Building 2',
    'Building 3',
    'Building 4',
    'Harper Hall',
    'Off Campus — Village',
  ],
}

function leaderMatchesArea(
  leader: LeaderRow,
  selectedArea: AreaRow | null,
  areaMap: Map<string, AreaRow>
) {
  if (!selectedArea) {
    return true
  }

  if (!leader.default_area_id) {
    return false
  }

  if (
    leader.default_area_id ===
    selectedArea.id
  ) {
    return true
  }

  if (
    selectedArea.area_type !==
    'campus_region'
  ) {
    return false
  }

  const leaderArea =
    areaMap.get(
      leader.default_area_id
    ) ?? null

  return (
    leaderArea?.parent_id ===
    selectedArea.id
  )
}

function campusAreaOrder(
  name: string
) {
  const index =
    geographicAreaOrder.indexOf(name)

  return index === -1
    ? 999
    : index
}

function dormOrder(
  regionName: string,
  locationName: string
) {
  const list =
    dormsByArea[regionName] ?? []

  const index =
    list.indexOf(locationName)

  return index === -1
    ? 999
    : index
}

function leaderName(
  leader: LeaderRow
) {
  return (
    leader.display_name?.trim() ||
    'Unnamed leader'
  )
}

function shortDate(
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
      timeZone: 'America/Detroit',
    }
  ).format(date)
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