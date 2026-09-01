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
}

export function DiscipleContactAssignment({
  targetId,
  targetName,
  contacts,
}: {
  targetId: string
  targetName: string
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
    <div className="mb-5 rounded-[16px] border border-[#b2ccff] bg-[#f8fbff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-[#15223a]">
            Assign contacts to {targetName}
          </div>
          <p className="mt-1 text-xs leading-5 text-[#667085]">
            Choose from unassigned contacts that are
            inside your current assignment scope.
          </p>
        </div>

        <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-extrabold text-[#3538cd]">
          {availableContacts.length}{' '}
          eligible
        </span>
      </div>

      {availableContacts.length === 0 ? (
        <p className="mt-3 text-xs font-semibold leading-5 text-[#667085]">
          No unassigned eligible contacts are
          available in your assignment scope.
        </p>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search name, dorm, house, or room..."
            className="mt-3 w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a] outline-none focus:border-[#175cd3]"
          />

          <div className="mt-3 max-h-[260px] overflow-y-auto rounded-[12px] border border-[#e4e7ec] bg-white">
            {visibleContacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#667085]">
                No eligible contacts match this search.
              </div>
            ) : (
              <div className="divide-y divide-[#eef0f3]">
                {visibleContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-[#f8fbff]"
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
                      className="mt-0.5 h-4 w-4 rounded border-[#d0d5dd]"
                    />

                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold text-[#15223a]">
                        {contact.display_name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#667085]">
                        {locationLabel(contact)}
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
  )
}

function locationLabel(contact: EligibleContact) {
  return [
    contact.location_name,
    contact.house_name,
    contact.room_or_address,
  ]
    .filter(Boolean)
    .join(' • ') || 'Location unavailable'
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}
