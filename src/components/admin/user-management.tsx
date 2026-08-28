'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type UserRole =
  | 'pending'
  | 'student_leader'
  | 'discipler'
  | 'staff'
  | 'admin'

type FollowUpUser = {
  user_id: string
  display_name: string | null
  email: string | null
  role: UserRole
  is_active: boolean
  access_requested_at: string | null
  approved_at: string | null
  default_ministry_area_id: string | null
  discipler_id: string | null
}

type MinistryArea = {
  id: string
  name: string
  parent_id: string | null
  is_active: boolean
}

const roles: { value: UserRole; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'student_leader', label: 'Student Leader' },
  { value: 'discipler', label: 'Discipler' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
]

const geographicAreaOrder = [
  'Central Campus',
  'The Hill',
  'North Campus',
  'The Village',
]

const dormOrder: Record<string, string[]> = {
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

const affinityOrder = [
  'BIPOC',
  'International',
  'South Asian American',
  'Greek Life',
]

export function UserManagement({
  initialUsers,
  ministryAreas,
}: {
  initialUsers: FollowUpUser[]
  ministryAreas: MinistryArea[]
}) {
  const [users, setUsers] = useState(initialUsers)
  const [saving, setSaving] = useState<string | null>(null)

  const possibleDisciplers = users.filter(
    (user) =>
      user.is_active &&
      user.role !== 'pending' &&
      ['discipler', 'staff', 'admin'].includes(user.role)
  )

  async function changeRole(
    userId: string,
    role: UserRole
  ) {
    setSaving(userId)

    const supabase = createClient()

    const { error } = await supabase.rpc(
      'admin_set_user_role',
      {
        p_user_id: userId,
        p_role: role,
      }
    )

    if (error) {
      alert(error.message)
      setSaving(null)
      return
    }

    setUsers((current) =>
      current.map((user) =>
        user.user_id === userId
          ? {
              ...user,
              role,
            }
          : user
      )
    )

    setSaving(null)
  }

  async function changeMinistryArea(
    userId: string,
    ministryAreaId: string
  ) {
    setSaving(userId)

    const supabase = createClient()

    if (!ministryAreaId) {
      const { error } = await supabase.rpc(
        'admin_clear_default_ministry_area',
        {
          p_user_id: userId,
        }
      )

      if (error) {
        alert(error.message)
        setSaving(null)
        return
      }
    } else {
      const { error } = await supabase.rpc(
        'admin_set_default_ministry_area',
        {
          p_user_id: userId,
          p_ministry_area_id: ministryAreaId,
        }
      )

      if (error) {
        alert(error.message)
        setSaving(null)
        return
      }
    }

    setUsers((current) =>
      current.map((user) =>
        user.user_id === userId
          ? {
              ...user,
              default_ministry_area_id:
                ministryAreaId || null,
            }
          : user
      )
    )

    setSaving(null)
  }

  async function changeDiscipler(
    userId: string,
    disciplerId: string
  ) {
    setSaving(userId)

    const supabase = createClient()

    if (!disciplerId) {
      const { error } = await supabase.rpc(
        'admin_clear_discipler',
        {
          p_user_id: userId,
        }
      )

      if (error) {
        alert(error.message)
        setSaving(null)
        return
      }
    } else {
      const { error } = await supabase.rpc(
        'admin_set_discipler',
        {
          p_user_id: userId,
          p_discipler_id: disciplerId,
        }
      )

      if (error) {
        alert(error.message)
        setSaving(null)
        return
      }
    }

    setUsers((current) =>
      current.map((user) =>
        user.user_id === userId
          ? {
              ...user,
              discipler_id: disciplerId || null,
            }
          : user
      )
    )

    setSaving(null)
  }

  async function toggleActive(
    userId: string,
    isActive: boolean
  ) {
    setSaving(userId)

    const supabase = createClient()

    const { error } = await supabase.rpc(
      'admin_set_user_active',
      {
        p_user_id: userId,
        p_is_active: isActive,
      }
    )

    if (error) {
      alert(error.message)
      setSaving(null)
      return
    }

    setUsers((current) =>
      current.map((user) =>
        user.user_id === userId
          ? {
              ...user,
              is_active: isActive,
            }
          : user
      )
    )

    setSaving(null)
  }

  const pending = users.filter(
    (user) => user.role === 'pending'
  )

  const approved = users.filter(
    (user) => user.role !== 'pending'
  )

  return (
    <div className="mt-8 space-y-10">
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            Access Requests
          </h2>

          <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-900">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-500">
            No pending access requests.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((user) => (
              <UserCard
                key={user.user_id}
                user={user}
                ministryAreas={ministryAreas}
                possibleDisciplers={possibleDisciplers}
                saving={saving === user.user_id}
                onRoleChange={changeRole}
                onMinistryAreaChange={
                  changeMinistryArea
                }
                onDisciplerChange={changeDiscipler}
                onActiveChange={toggleActive}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-bold text-slate-900">
            Approved Users
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Manage roles, ministry areas, and discipleship
            relationships.
          </p>
        </div>

        {approved.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-500">
            No approved users yet.
          </div>
        ) : (
          <div className="space-y-4">
            {approved.map((user) => (
              <UserCard
                key={user.user_id}
                user={user}
                ministryAreas={ministryAreas}
                possibleDisciplers={possibleDisciplers}
                saving={saving === user.user_id}
                onRoleChange={changeRole}
                onMinistryAreaChange={
                  changeMinistryArea
                }
                onDisciplerChange={changeDiscipler}
                onActiveChange={toggleActive}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function UserCard({
  user,
  ministryAreas,
  possibleDisciplers,
  saving,
  onRoleChange,
  onMinistryAreaChange,
  onDisciplerChange,
  onActiveChange,
}: {
  user: FollowUpUser
  ministryAreas: MinistryArea[]
  possibleDisciplers: FollowUpUser[]
  saving: boolean
  onRoleChange: (
    userId: string,
    role: UserRole
  ) => void
  onMinistryAreaChange: (
    userId: string,
    ministryAreaId: string
  ) => void
  onDisciplerChange: (
    userId: string,
    disciplerId: string
  ) => void
  onActiveChange: (
    userId: string,
    active: boolean
  ) => void
}) {
  const isPending = user.role === 'pending'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">
              {user.display_name || 'Unnamed User'}
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {user.email}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {isPending && (
                <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800">
                  Waiting for approval
                </span>
              )}

              {!user.is_active && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                  Deactivated
                </span>
              )}
            </div>
          </div>

          {!isPending && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onActiveChange(
                  user.user_id,
                  !user.is_active
                )
              }
              className="self-start rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {user.is_active
                ? 'Deactivate'
                : 'Reactivate'}
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Role
            </label>

            <select
              value={user.role}
              disabled={saving}
              onChange={(event) =>
                onRoleChange(
                  user.user_id,
                  event.target.value as UserRole
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              {roles.map((role) => (
                <option
                  key={role.value}
                  value={role.value}
                >
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              {user.role === 'staff' ||
              user.role === 'admin'
                ? 'Default oversight'
                : 'Default ministry area'}
            </label>

            <MinistryAreaSelect
              value={
                user.default_ministry_area_id ?? ''
              }
              ministryAreas={ministryAreas}
              disabled={saving || isPending}
              onChange={(ministryAreaId) =>
                onMinistryAreaChange(
                  user.user_id,
                  ministryAreaId
                )
              }
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Discipler
            </label>

            <select
              value={user.discipler_id ?? ''}
              disabled={saving || isPending}
              onChange={(event) =>
                onDisciplerChange(
                  user.user_id,
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">
                No discipler assigned
              </option>

              {possibleDisciplers
                .filter(
                  (candidate) =>
                    candidate.user_id !== user.user_id
                )
                .map((candidate) => (
                  <option
                    key={candidate.user_id}
                    value={candidate.user_id}
                  >
                    {candidate.display_name ||
                      candidate.email ||
                      'Unnamed User'}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {saving && (
          <div className="text-sm font-semibold text-blue-700">
            Saving...
          </div>
        )}
      </div>
    </div>
  )
}

function MinistryAreaSelect({
  value,
  ministryAreas,
  disabled,
  onChange,
}: {
  value: string
  ministryAreas: MinistryArea[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const geographicParents = geographicAreaOrder
    .map((name) =>
      ministryAreas.find(
        (area) =>
          area.name === name && area.parent_id === null
      )
    )
    .filter(
      (area): area is MinistryArea => Boolean(area)
    )

  const geographicParentIds = new Set(
    geographicParents.map((area) => area.id)
  )

  const affinityAreas = ministryAreas
    .filter(
      (area) =>
        area.parent_id === null &&
        !geographicParentIds.has(area.id)
    )
    .sort(
      (a, b) =>
        getAffinitySortIndex(a.name) -
        getAffinitySortIndex(b.name)
    )

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange(event.target.value)
      }
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
    >
      <option value="">All Campus</option>

      {geographicParents.map((parent) => {
        const children = ministryAreas
          .filter(
            (area) => area.parent_id === parent.id
          )
          .sort((a, b) =>
            compareDorms(parent.name, a.name, b.name)
          )

        return (
          <optgroup
            key={parent.id}
            label={parent.name.toUpperCase()}
          >
            <option value={parent.id}>
              All {parent.name}
            </option>

            {children.map((child) => (
              <option
                key={child.id}
                value={child.id}
              >
                {child.name}
              </option>
            ))}
          </optgroup>
        )
      })}

      {affinityAreas.length > 0 && (
        <optgroup label="AFFINITY MINISTRIES">
          {affinityAreas.map((area) => (
            <option
              key={area.id}
              value={area.id}
            >
              {area.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

function compareDorms(
  parentName: string,
  firstName: string,
  secondName: string
) {
  const preferredOrder =
    dormOrder[parentName] ?? []

  const firstIndex =
    preferredOrder.indexOf(firstName)

  const secondIndex =
    preferredOrder.indexOf(secondName)

  if (firstIndex !== -1 && secondIndex !== -1) {
    return firstIndex - secondIndex
  }

  if (firstIndex !== -1) {
    return -1
  }

  if (secondIndex !== -1) {
    return 1
  }

  return firstName.localeCompare(secondName)
}

function getAffinitySortIndex(name: string) {
  const index = affinityOrder.indexOf(name)

  if (index === -1) {
    return affinityOrder.length
  }

  return index
}