'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export function AssignedContactUnassignButton({
  contactId,
  contactName,
}: {
  contactId: string
  contactName: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function unassign() {
    setSaving(true)
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.rpc(
      'assign_contacts_to_follow_up_user',
      {
        p_contact_ids: [contactId],
        p_assignee_id: null,
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setConfirming(false)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="shrink-0 text-right">
        <div className="text-[10px] font-bold text-[#b42318]">
          Unassign {firstName(contactName)}?
        </div>

        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setConfirming(false)
              setErrorMessage(null)
            }}
            className="text-[10px] font-extrabold text-[#667085] hover:underline disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={unassign}
            className="text-[10px] font-extrabold text-[#b42318] hover:underline disabled:opacity-50"
          >
            {saving ? 'Unassigning...' : 'Yes, unassign'}
          </button>
        </div>

        {errorMessage && (
          <div className="mt-1 max-w-[220px] text-[9px] font-bold leading-4 text-[#b42318]">
            {errorMessage}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setErrorMessage(null)
        setConfirming(true)
      }}
      className="shrink-0 text-[10px] font-extrabold text-[#b42318] hover:underline"
    >
      Unassign
    </button>
  )
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'contact'
}
