'use client'

import Link from 'next/link'
import {
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'

type Assignee = {
  id: string
  display_name: string
  role: string
  area_name: string | null
}

type AssignableContact = {
  id: string
  display_name: string
  status: string
  primary_owner_id: string | null
  primary_owner_name: string | null
  location_name: string | null
  house_name: string | null
  room_or_address: string | null
  location_resolution: string | null
  jesus_interest: string | null
  community_interest: string | null
  interview_interest: string | null
}

type AssignmentWorkspace = {
  role: string
  scope: string
  assignees: Assignee[]
  contacts: AssignableContact[]
}

type AssignmentFilter =
  | 'all'
  | 'unassigned'
  | 'assigned'

export function ContactAssignmentWorkspace({
  initialWorkspace,
  focused = false,
}: {
  initialWorkspace: AssignmentWorkspace
  focused?: boolean
}) {
  const [contacts, setContacts] = useState(
    initialWorkspace.contacts
  )
  const [query, setQuery] = useState('')
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all')
  const [selectedIds, setSelectedIds] =
    useState<string[]>([])
  const [bulkAssigneeId, setBulkAssigneeId] =
    useState('')
  const [rowAssignees, setRowAssignees] =
    useState<Record<string, string>>(() => {
      const validAssigneeIds = new Set(
        initialWorkspace.assignees.map(
          (assignee) => assignee.id
        )
      )

      return Object.fromEntries(
        initialWorkspace.contacts.map(
          (contact) => [
            contact.id,
            contact.primary_owner_id &&
            validAssigneeIds.has(
              contact.primary_owner_id
            )
              ? contact.primary_owner_id
              : '',
          ]
        )
      )
    })
  const [saving, setSaving] =
    useState<string | null>(null)
  const [message, setMessage] =
    useState<string | null>(null)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  const assigneeMap = useMemo(
    () =>
      new Map(
        initialWorkspace.assignees.map(
          (assignee) => [
            assignee.id,
            assignee,
          ]
        )
      ),
    [initialWorkspace.assignees]
  )

  const visibleContacts = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase()

    return contacts.filter((contact) => {
      if (
        assignmentFilter === 'unassigned' &&
        contact.primary_owner_id
      ) {
        return false
      }

      if (
        assignmentFilter === 'assigned' &&
        !contact.primary_owner_id
      ) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const searchable = [
        contact.display_name,
        contact.primary_owner_name,
        contact.location_name,
        contact.house_name,
        contact.room_or_address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(
        normalizedQuery
      )
    })
  }, [
    contacts,
    query,
    assignmentFilter,
  ])

  const unassignedCount = contacts.filter(
    (contact) => !contact.primary_owner_id
  ).length

  const assignedCount =
    contacts.length - unassignedCount

  const selectedVisibleIds =
    visibleContacts
      .map((contact) => contact.id)
      .filter((id) =>
        selectedIds.includes(id)
      )

  const allVisibleSelected =
    visibleContacts.length > 0 &&
    selectedVisibleIds.length ===
      visibleContacts.length

  async function assignContacts(
    contactIds: string[],
    assigneeId: string,
    savingKey: string
  ) {
    if (
      contactIds.length === 0 ||
      !assigneeId
    ) {
      setErrorMessage(
        'Choose a person to assign these contacts to.'
      )
      return
    }

    setSaving(savingKey)
    setMessage(null)
    setErrorMessage(null)

    const supabase = createClient()

    const { error } = await supabase.rpc(
      'assign_contacts_to_follow_up_user',
      {
        p_contact_ids: contactIds,
        p_assignee_id: assigneeId,
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(null)
      return
    }

    const assignee =
      assigneeMap.get(assigneeId)

    setContacts((current) =>
      current.map((contact) =>
        contactIds.includes(contact.id)
          ? {
              ...contact,
              primary_owner_id:
                assigneeId,
              primary_owner_name:
                assignee?.display_name ??
                'Follow Up user',
            }
          : contact
      )
    )

    setRowAssignees((current) => {
      const next = { ...current }

      for (const contactId of contactIds) {
        next[contactId] = assigneeId
      }

      return next
    })

    setSelectedIds((current) =>
      current.filter(
        (id) => !contactIds.includes(id)
      )
    )

    setMessage(
      `${contactIds.length} ${
        contactIds.length === 1
          ? 'contact'
          : 'contacts'
      } assigned to ${
        assignee?.display_name ??
        'Follow Up user'
      }.`
    )

    setSaving(null)
  }

  function toggleSelected(
    contactId: string,
    checked: boolean
  ) {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(contactId)
          ? current
          : [...current, contactId]
      }

      return current.filter(
        (id) => id !== contactId
      )
    })
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter(
          (id) =>
            !visibleContacts.some(
              (contact) =>
                contact.id === id
            )
        )
      }

      return Array.from(
        new Set([
          ...current,
          ...visibleContacts.map(
            (contact) => contact.id
          ),
        ])
      )
    })
  }

  function chooseFilter(
    filter: AssignmentFilter
  ) {
    setAssignmentFilter(filter)
    setSelectedIds([])
    setMessage(null)
    setErrorMessage(null)
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
      {focused ? (
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-3.5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
              Attention Queue
            </span>

            <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11px] font-extrabold text-[#3538cd]">
              {initialWorkspace.scope}
            </span>
          </div>
        </div>
      ) : (
        <div className="border-b border-[#e4e7ec] bg-white p-5 md:p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
            Follow Up Assignment
          </p>

          <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
            Assign Contacts
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
            Assign follow-up contacts to the
            leaders you are allowed to manage.
          </p>

          <div className="mt-4 inline-flex rounded-full bg-[#eef4ff] px-3 py-1.5 text-xs font-extrabold text-[#3538cd]">
            Scope: {initialWorkspace.scope}
          </div>
        </div>
      )}

      <div className="p-5 md:p-6">
        {!focused && (
          <div className="grid gap-3 sm:grid-cols-3">
            <FilterSummaryCard
              value={contacts.length}
              label="eligible contacts"
              active={
                assignmentFilter === 'all'
              }
              onClick={() =>
                chooseFilter('all')
              }
            />

            <FilterSummaryCard
              value={unassignedCount}
              label="currently unassigned"
              attention={
                unassignedCount > 0
              }
              active={
                assignmentFilter ===
                'unassigned'
              }
              onClick={() =>
                chooseFilter('unassigned')
              }
            />

            <FilterSummaryCard
              value={assignedCount}
              label="already assigned"
              active={
                assignmentFilter ===
                'assigned'
              }
              onClick={() =>
                chooseFilter('assigned')
              }
            />
          </div>
        )}

        <div
          id="assignment-search"
          className={[
            'grid gap-3 md:grid-cols-[1fr_auto]',
            focused ? 'mt-0' : 'mt-6',
          ].join(' ')}
        >
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search contacts, locations, or current owner..."
            className="w-full rounded-[12px] border border-[#d0d5dd] bg-white px-3.5 py-2.5 text-sm text-[#15223a] outline-none focus:border-[#175cd3]"
          />

          <select
            value={assignmentFilter}
            onChange={(event) =>
              chooseFilter(
                event.target
                  .value as AssignmentFilter
              )
            }
            className="rounded-[12px] border border-[#d0d5dd] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#475467]"
          >
            <option value="all">
              All contacts
            </option>
            <option value="unassigned">
              Unassigned
            </option>
            <option value="assigned">
              Assigned
            </option>
          </select>
        </div>

        {focused && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[#667085]">
            <span>
              <strong className="text-[#15223a]">
                {visibleContacts.length}
              </strong>{' '}
              shown
            </span>

            <span>
              {unassignedCount} unassigned
            </span>

            <span>
              {assignedCount} assigned
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-[12px] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-[12px] bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#027a48]">
            {message}
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="sticky top-[74px] z-10 mt-5 rounded-[16px] border border-[#b2ccff] bg-[#eef4ff] p-3.5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="text-sm font-extrabold text-[#15223a]">
                {selectedIds.length}{' '}
                {selectedIds.length === 1
                  ? 'contact'
                  : 'contacts'}{' '}
                selected
              </div>

              <select
                value={bulkAssigneeId}
                onChange={(event) =>
                  setBulkAssigneeId(
                    event.target.value
                  )
                }
                disabled={saving === 'bulk'}
                className="min-w-0 flex-1 rounded-[11px] border border-[#b2ccff] bg-white px-3 py-2.5 text-sm font-semibold text-[#15223a]"
              >
                <option value="">
                  Assign selected to...
                </option>

                {initialWorkspace.assignees.map(
                  (assignee) => (
                    <option
                      key={assignee.id}
                      value={assignee.id}
                    >
                      {assignee.display_name}
                      {' • '}
                      {formatRole(
                        assignee.role
                      )}
                      {assignee.area_name
                        ? ` • ${assignee.area_name}`
                        : ''}
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                disabled={
                  saving === 'bulk' ||
                  !bulkAssigneeId
                }
                onClick={() =>
                  assignContacts(
                    selectedIds,
                    bulkAssigneeId,
                    'bulk'
                  )
                }
                className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
              >
                {saving === 'bulk'
                  ? 'Assigning...'
                  : 'Assign'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-[#667085]">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="h-4 w-4 rounded border-[#98a2b3]"
            />
            Select visible
          </label>

          <span className="text-xs font-semibold text-[#98a2b3]">
            {visibleContacts.length}{' '}
            shown
          </span>
        </div>

        {visibleContacts.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-7 text-center text-sm text-[#667085]">
            No contacts match these filters.
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {visibleContacts.map(
              (contact) => (
                <ContactAssignmentRow
                  key={contact.id}
                  contact={contact}
                  assignees={
                    initialWorkspace.assignees
                  }
                  selected={selectedIds.includes(
                    contact.id
                  )}
                  selectedAssigneeId={
                    rowAssignees[
                      contact.id
                    ] ?? ''
                  }
                  saving={
                    saving === contact.id
                  }
                  onSelectedChange={(
                    checked
                  ) =>
                    toggleSelected(
                      contact.id,
                      checked
                    )
                  }
                  onAssigneeChange={(
                    assigneeId
                  ) =>
                    setRowAssignees(
                      (current) => ({
                        ...current,
                        [contact.id]:
                          assigneeId,
                      })
                    )
                  }
                  onSave={() =>
                    assignContacts(
                      [contact.id],
                      rowAssignees[
                        contact.id
                      ] ?? '',
                      contact.id
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function ContactAssignmentRow({
  contact,
  assignees,
  selected,
  selectedAssigneeId,
  saving,
  onSelectedChange,
  onAssigneeChange,
  onSave,
}: {
  contact: AssignableContact
  assignees: Assignee[]
  selected: boolean
  selectedAssigneeId: string
  saving: boolean
  onSelectedChange: (
    checked: boolean
  ) => void
  onAssigneeChange: (
    assigneeId: string
  ) => void
  onSave: () => void
}) {
  const isAssigned =
    Boolean(contact.primary_owner_id)

  return (
    <article
      className={[
        'relative overflow-hidden rounded-[18px] border bg-white p-4 transition',
        selected
          ? 'border-[#84adff] ring-2 ring-[#dbe8ff]'
          : isAssigned
            ? 'border-[#dbe3ec]'
            : 'border-[#fedf89] bg-[#fffdf7]',
      ].join(' ')}
    >
      <div
        className={[
          'absolute inset-y-0 left-0 w-[5px]',
          isAssigned
            ? 'bg-[#98a2b3]'
            : 'bg-[#f79009]',
        ].join(' ')}
      />

      <div className="flex items-start gap-3 pl-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) =>
            onSelectedChange(
              event.target.checked
            )
          }
          aria-label={`Select ${contact.display_name}`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[#98a2b3]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/contacts/${contact.id}`}
                className="truncate text-base font-extrabold text-[#15223a] hover:text-[#175cd3]"
              >
                {contact.display_name}
              </Link>

              <div className="mt-1 text-xs leading-5 text-[#667085]">
                {locationLabel(contact)}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span
                className={[
                  'rounded-full px-2.5 py-1.5 text-[10px] font-extrabold',
                  isAssigned
                    ? 'bg-[#f2f4f7] text-[#475467]'
                    : 'bg-[#fff1d6] text-[#b54708]',
                ].join(' ')}
              >
                {isAssigned
                  ? 'Assigned'
                  : 'Unassigned'}
              </span>

              <StatusBadge
                status={contact.status}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <InterestBadge
              label="Jesus"
              value={
                contact.jesus_interest
              }
            />

            <InterestBadge
              label="Community"
              value={
                contact.community_interest
              }
            />

            <InterestBadge
              label="Interview"
              value={
                contact.interview_interest
              }
            />
          </div>

          <div
            className={[
              'mt-3 rounded-[10px] px-3 py-2 text-[11px] font-semibold',
              isAssigned
                ? 'bg-[#f9fafb] text-[#667085]'
                : 'bg-[#fff4e5] text-[#9a4b00]',
            ].join(' ')}
          >
            {isAssigned ? (
              <>
                Current primary:{' '}
                <strong className="text-[#475467]">
                  {contact.primary_owner_name ??
                    'Follow Up user'}
                </strong>
              </>
            ) : (
              <strong>
                No primary follow-up person yet
              </strong>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <select
              value={selectedAssigneeId}
              disabled={saving}
              onChange={(event) =>
                onAssigneeChange(
                  event.target.value
                )
              }
              className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#15223a]"
            >
              <option value="">
                {isAssigned
                  ? 'Choose new assignee...'
                  : 'Choose assignee...'}
              </option>

              {assignees.map(
                (assignee) => (
                  <option
                    key={assignee.id}
                    value={assignee.id}
                  >
                    {assignee.display_name}
                    {' • '}
                    {formatRole(
                      assignee.role
                    )}
                    {assignee.area_name
                      ? ` • ${assignee.area_name}`
                      : ''}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              disabled={
                saving ||
                !selectedAssigneeId ||
                selectedAssigneeId ===
                  contact.primary_owner_id
              }
              onClick={onSave}
              className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {saving
                ? 'Saving...'
                : isAssigned
                  ? 'Reassign'
                  : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function FilterSummaryCard({
  value,
  label,
  active,
  attention = false,
  onClick,
}: {
  value: number
  label: string
  active: boolean
  attention?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-[18px] border p-4 text-left transition',
        active
          ? 'border-[#84adff] ring-2 ring-[#dbe8ff]'
          : attention
            ? 'border-[#fedf89] bg-[#fff8eb] hover:border-[#fdb022]'
            : 'border-[#e4e7ec] bg-white hover:border-[#b2ccff]',
      ].join(' ')}
    >
      <div
        className={[
          'text-[30px] font-black leading-none tracking-[-0.04em]',
          attention
            ? 'text-[#b54708]'
            : 'text-[#15223a]',
        ].join(' ')}
      >
        {value}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#667085]">
          {label}
        </span>

        <span
          className={[
            'text-sm font-black',
            active
              ? 'text-[#175cd3]'
              : 'text-[#98a2b3]',
          ].join(' ')}
          aria-hidden="true"
        >
          →
        </span>
      </div>
    </button>
  )
}

function InterestBadge({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <span
      className={[
        'rounded-lg border px-2 py-1 text-[10px] font-semibold',
        interestClass(value),
      ].join(' ')}
    >
      <strong>{label}</strong>{' '}
      {formatInterest(value)}
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
        'shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold',
        statusClass(status),
      ].join(' ')}
    >
      {formatStatus(status)}
    </span>
  )
}

function locationLabel(
  contact: AssignableContact
) {
  const label = [
    contact.location_name,
    contact.house_name,
    contact.room_or_address,
  ]
    .filter(Boolean)
    .join(' • ')

  if (label) {
    return label
  }

  if (
    contact.location_resolution ===
    'no_address'
  ) {
    return 'No Address'
  }

  return 'Location unavailable'
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

function interestClass(
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
      return 'border-[#edf0f3] bg-[#f9fafb] text-[#667085]'
  }
}

function formatInterest(
  value: string | null
) {
  switch (value) {
    case 'yes':
      return 'Yes'
    case 'maybe':
      return 'Maybe'
    case 'no':
      return 'No'
    case 'already_have_one':
      return 'Already have one'
    default:
      return '—'
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'go_back':
      return 'bg-[#eef4ff] text-[#3538cd]'
    case 'involved':
      return 'bg-[#ecfdf3] text-[#027a48]'
    case 'attempted_contact':
      return 'bg-[#fff4e5] text-[#9a4b00]'
    case 'not_interested':
      return 'bg-[#fef3f2] text-[#b42318]'
    default:
      return 'bg-[#f2f4f7] text-[#475467]'
  }
}

function formatStatus(status: string) {
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