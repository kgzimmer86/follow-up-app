'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { invitationStatuses } from '@/lib/community-events'
import { invitationsChanged } from './invite-attention'
import { buttonClass, inputClass } from './group-controls'

export function InvitationResponse({ groupId, eventId, studentId, name, status, version }: {
  groupId: string; eventId: string; studentId: string; name: string; status: string; version: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(status)
  const [saved, setSaved] = useState(status)
  const [currentVersion, setCurrentVersion] = useState(version)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  async function save() {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      const { data, error } = await createClient().rpc('community_set_invitation', {
        p_group_id: groupId, p_event_id: eventId, p_student_id: studentId, p_status: value, p_version: currentVersion,
      })
      if (error) throw new Error(error.message)
      invitationsChanged()
      setCurrentVersion(data); setSaved(value); setMessage('Response saved.'); router.refresh()
    } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Unable to save this response.') }
    finally { setBusy(false) }
  }
  return <div className="mt-3">
    <label className="block text-xs font-bold text-[#475467]">Invitation response
      <select aria-label={`Invitation response for ${name}`} disabled={busy} value={value} onChange={(e) => { setValue(e.target.value); setMessage(''); setFailed(false) }} className={inputClass}>
        {invitationStatuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy || value === saved} onClick={save} className={`${buttonClass} mt-2`}>{busy ? 'Saving…' : 'Save response'}</button>
    {value !== saved && !failed && <p className="mt-1 text-xs text-[#667085]">Unsaved response</p>}
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'mt-2 rounded-2xl border border-[#fedf89] bg-[#fff8eb] p-3 text-sm text-[#b54708]' : 'mt-2 text-sm text-[#027a48]'}>{failed && <strong className="block font-bold">Response not saved.</strong>}{message}</p>}
  </div>
}
