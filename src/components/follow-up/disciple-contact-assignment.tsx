'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type EligibleContact = {
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
}

export function DiscipleContactAssignment({
  targetId,
  targetName,
  areaName,
  contacts,
}: {
  targetId: string
  targetName: string
  areaName: string | null
  contacts: EligibleContact[]
}) {
  const router = useRouter()
  const [availableContacts, setAvailableContacts] =
    useState(contacts)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] =
    useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] =
    useState<string | null>(null)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
      return availableContacts
    }

    return availableContacts.filter((contact) =>
      [
        contact.display_name,
        contact.location_name,
        contact.house_name,
        contact.room_or_address,
        contact.status,
        contact.jesus_interest,
        contact.community_interest,
        contact.interview_interest,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
  }, [availableContacts, query])

  function toggleContact(
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

  async function assignSelected() {
    if (selectedIds.length === 0) {
      setErrorMessage(
        'Choose at least one contact to assign.'
      )
      return
    }

    setSaving(true)
    setMessage(null)
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.rpc(
      'assign_contacts_to_follow_up_user',
      {
        p_contact_ids: selectedIds,
        p_assignee_id: targetId,
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    const assignedCount = selectedIds.length

    setAvailableContacts((current) =>
      current.filter(
        (contact) =>
          !selectedIds.includes(contact.id)
      )
    )
    setSelectedIds([])
    setMessage(
      `${assignedCount} ${
        assignedCount === 1
          ? 'contact'
          : 'contacts'
      } assigned to ${targetName}.`
    )
    setSaving(false)
    router.refresh()
  }

  return (
    <details className="mb-5 overflow-hidden rounded-[16px] border border-[#b2ccff] bg-[#f8fbff]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-[#15223a]">
            Assign contacts to {targetName}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-[#667085]">
            {areaName
              ? `Only unassigned contacts from ${areaName}.`
              : `No default ministry area is set for ${firstName(
                  targetName
                )}.`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-extrabold text-[#3538cd]">
            {availableContacts.length}{' '}
            eligible
          </span>
          <span className="text-xs font-extrabold text-[#175cd3]">
            Expand ▾
          </span>
        </div>
      </summary>

      <div className="border-t border-[#dbe8f8] p-4">
        {!areaName ? (
          <p className="text-xs font-semibold leading-5 text-[#667085]">
            Set a default ministry area for{' '}
            {targetName} before assigning contacts
            from this coaching page.
          </p>
        ) : availableContacts.length === 0 ? (
          <p className="text-xs font-semibold leading-5 text-[#667085]">
            No unassigned contacts from{' '}
            <strong>{areaName}</strong> are currently
            eligible for you to assign to{' '}
            {targetName}.
          </p>
        ) : (
          <>
            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search name, dorm, house, room, status, or survey answer..."
              className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a] outline-none focus:border-[#175cd3]"
            />

            <div className="mt-3 max-h-[390px] overflow-y-auto rounded-[12px] border border-[#e4e7ec] bg-white">
              {visibleContacts.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#667085]">
                  No eligible contacts match this search.
                </div>
              ) : (
                <div className="divide-y divide-[#eef0f3]">
                  {visibleContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-[#f8fbff]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(
                          contact.id
                        )}
                        onChange={(event) =>
                          toggleContact(
                            contact.id,
                            event.target.checked
                          )
                        }
                        className="mt-1 h-4 w-4 shrink-0 rounded border-[#d0d5dd]"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-extrabold text-[#15223a]">
                              {contact.display_name}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-[#667085]">
                              {locationLabel(contact)}
                            </span>
                          </span>

                          <StatusBadge
                            status={contact.status}
                          />
                        </span>

                        <span className="mt-2 flex flex-wrap gap-1.5">
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
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-bold text-[#667085]">
                {selectedIds.length}{' '}
                selected
              </div>

              <button
                type="button"
                disabled={
                  saving || selectedIds.length === 0
                }
                onClick={assignSelected}
                className="rounded-[10px] bg-[#00274c] px-3.5 py-2 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
              >
                {saving
                  ? 'Assigning...'
                  : `Assign to ${firstName(
                      targetName
                    )}`}
              </button>
            </div>
          </>
        )}

        {message && (
          <div className="mt-3 rounded-[10px] bg-[#ecfdf3] px-3 py-2 text-xs font-bold text-[#027a48]">
            ✓ {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 rounded-[10px] bg-[#fef3f2] px-3 py-2 text-xs font-bold text-[#b42318]">
            {errorMessage}
          </div>
        )}
      </div>
    </details>
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

function locationLabel(contact: EligibleContact) {
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

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}
