'use client'

import { useState, useTransition } from 'react'
import { saveCgTextInvitePreference } from '@/app/cg-invitation-actions'

export function CgTextInvitePreference({ contactId, enabled }: { contactId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  return (
    <div>
      <label className="flex items-start gap-3 text-sm font-bold text-[#15223a]">
        <input type="checkbox" checked={enabled} disabled={pending} aria-describedby={`cg-preference-${contactId}`}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#00274c]"
          onChange={(event) => {
            const next = event.target.checked
            setError('')
            startTransition(async () => {
              try {
                await saveCgTextInvitePreference(contactId, next)
              } catch {
                setError('Couldn’t save this preference. Please try again.')
              }
            })
          }} />
        <span>No knock (text invite only)</span>
      </label>
      <p id={`cg-preference-${contactId}`} className="mt-1 pl-7 text-xs leading-5 text-[#667085]">Applies only to Invite to Community Group.</p>
      {pending && <p role="status" className="mt-1 pl-7 text-xs text-[#667085]">Saving…</p>}
      {error && <p role="alert" className="mt-1 text-xs text-[#b42318]">{error}</p>}
    </div>
  )
}
