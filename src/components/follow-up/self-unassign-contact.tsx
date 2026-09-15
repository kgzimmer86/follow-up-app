'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SelfUnassignContact({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function unassign() {
    setError('')
    startTransition(async () => {
      try {
        const result = await createClient().rpc('unassign_my_follow_up_contact', { p_contact_id: contactId })
        if (result.error) throw result.error
        setDone(true)
        router.refresh()
      } catch (failure) {
        setError(failure && typeof failure === 'object' && 'message' in failure
          ? String(failure.message) : 'Couldn’t unassign this contact. Please try again.')
      }
    })
  }

  if (done) return <p role="status" className="mt-3 text-sm text-[#027a48]">Removed from My Contacts. Their record and history are unchanged.</p>
  return (
    <div className="mt-3">
      {!confirming ? <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-sm font-bold text-[#b42318]">Unassign from me</button> : (
        <div className="rounded-[12px] border border-[#fedf89] bg-[#fffaeb] p-3">
          <p className="text-sm text-[#15223a]">Remove this contact from My Contacts? They will become unassigned and available for reassignment. Their status, notes, and history will stay unchanged.</p>
          <div className="mt-2 flex gap-3">
            <button type="button" disabled={pending} onClick={unassign} className="min-h-11 text-sm font-extrabold text-[#b42318] disabled:opacity-50">{pending ? 'Unassigning…' : 'Yes, unassign from me'}</button>
            <button type="button" disabled={pending} onClick={() => { setConfirming(false); setError('') }} className="min-h-11 text-sm font-bold text-[#667085] disabled:opacity-50">Cancel</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-[#b42318]">{error}</p>}
        </div>
      )}
    </div>
  )
}
