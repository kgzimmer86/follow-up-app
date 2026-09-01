'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Assignee = {
  id: string
  display_name: string
  role: string
  area_name: string | null
}

export function ContactAssignmentCell({
  contactId,
  currentOwnerId,
  currentOwnerName,
  assignees,
}: {
  contactId: string
  currentOwnerId: string | null
  currentOwnerName: string | null
  assignees: Assignee[]
}) {
  const router = useRouter()
  const [ownerId, setOwnerId] =
    useState(currentOwnerId ?? '')
  const [ownerName, setOwnerName] =
    useState(currentOwnerName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  const currentOwnerIsOption = Boolean(
    ownerId &&
      assignees.some(
        (assignee) => assignee.id === ownerId
      )
  )

  async function changeOwner(
    nextOwnerId: string
  ) {
    if (!nextOwnerId || nextOwnerId === ownerId) {
      return
    }

    const previousOwnerId = ownerId
    const previousOwnerName = ownerName
    const nextOwner = assignees.find(
      (assignee) => assignee.id === nextOwnerId
    )

    setOwnerId(nextOwnerId)
    setOwnerName(
      nextOwner?.display_name ?? 'Follow Up user'
    )
    setSaving(true)
    setSaved(false)
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.rpc(
      'assign_contacts_to_follow_up_user',
      {
        p_contact_ids: [contactId],
        p_assignee_id: nextOwnerId,
      }
    )

    if (error) {
      setOwnerId(previousOwnerId)
      setOwnerName(previousOwnerName)
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
    router.refresh()
  }

  return (
    <div className="min-w-[170px]">
      <select
        value={ownerId}
        disabled={saving}
        onChange={(event) =>
          changeOwner(event.target.value)
        }
        className="w-full rounded-[8px] border border-[#d0d5dd] bg-white px-2 py-1.5 text-[11px] font-bold text-[#344054] outline-none focus:border-[#175cd3] disabled:bg-[#f2f4f7]"
      >
        {!ownerId && (
          <option value="">
            Unassigned — choose person
          </option>
        )}

        {ownerId && !currentOwnerIsOption && (
          <option value={ownerId} disabled>
            {ownerName || 'Current owner'}
          </option>
        )}

        {assignees.map((assignee) => (
          <option
            key={assignee.id}
            value={assignee.id}
          >
            {assignee.display_name}
            {assignee.area_name
              ? ` — ${assignee.area_name}`
              : ''}
          </option>
        ))}
      </select>

      {saving ? (
        <div className="mt-1 text-[9px] font-bold text-[#667085]">
          Saving...
        </div>
      ) : saved ? (
        <div className="mt-1 text-[9px] font-extrabold text-[#027a48]">
          ✓ Saved
        </div>
      ) : errorMessage ? (
        <div
          title={errorMessage}
          className="mt-1 max-w-[190px] truncate text-[9px] font-bold text-[#b42318]"
        >
          Not saved — {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
