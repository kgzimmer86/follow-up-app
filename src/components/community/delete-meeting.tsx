'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { invitationsChanged } from './invite-attention'
import { createClient } from '@/lib/supabase/client'
import { secondaryButtonClass } from './group-controls'

export function DeleteMeeting({ groupId, meetingId, meetingDate, version, revision }: {
  groupId: string; meetingId: string; meetingDate: string; version: number; revision: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (busy || !window.confirm(`Delete the meeting on ${meetingDate}?\n\nThis permanently deletes its saved attendance. The roster, Involved statuses, and other meetings will stay unchanged. This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      const { error } = await createClient().rpc('community_delete_meeting', {
        p_group_id: groupId, p_meeting_id: meetingId, p_version: version, p_revision: revision,
      })
      if (error) throw new Error(error.message)
      invitationsChanged(); router.refresh()
    } catch (e) {
      setError(`Delete failed. ${e instanceof Error ? e.message : 'Please try again.'}`)
      setBusy(false)
    }
  }

  return <div className="border-t border-[#e4e7ec] px-4 py-3">
    <button type="button" disabled={busy} onClick={remove} aria-label={`Delete meeting on ${meetingDate}`} className={secondaryButtonClass}>
      {busy ? 'Deleting…' : 'Delete meeting'}
    </button>
    {error && <p role="alert" className="mt-2 rounded-2xl border border-[#fedf89] bg-[#fff8eb] px-4 py-3 text-sm font-semibold text-[#b54708]">{error}</p>}
  </div>
}
