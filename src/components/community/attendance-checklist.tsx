'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AddAttender, buttonClass } from './group-controls'
import { cardClass, stripeClass } from './student-card-style'

type Person = { student_id: string; display_name: string; present: boolean; gender?: string | null; status?: string }
export function AttendanceChecklist({ groupId, meetingDate, people, version, revision, editable }: { groupId: string; meetingDate: string; people: Person[]; version: number; revision: number; editable: boolean }) {
  const router = useRouter()
  const [present, setPresent] = useState(() => new Set(people.filter((p) => p.present).map((p) => p.student_id)))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a')
      if (link && !window.confirm('Leave without saving attendance?')) { event.preventDefault(); event.stopPropagation() }
    }
    const submit = (event: Event) => { if (!window.confirm('Leave without saving attendance?')) { event.preventDefault(); event.stopPropagation() } }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', click, true)
    document.addEventListener('submit', submit, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true); document.removeEventListener('submit', submit, true) }
  }, [dirty])
  async function save() {
    setSaving(true); setMessage(''); setFailed(false)
    try {
      const { error } = await createClient().rpc('save_community_group_attendance', { p_group_id: groupId, p_meeting_date: meetingDate, p_present_student_ids: [...present], p_roster_student_ids: people.map((p) => p.student_id), p_version: version, p_revision: revision })
      if (error) throw new Error(error.message)
      setDirty(false); setMessage('Attendance saved.'); router.refresh()
    } catch (e) { setFailed(true); setMessage(`Save failed. ${e instanceof Error ? e.message : 'Your selections are still here. Please retry.'}`) }
    finally { setSaving(false) }
  }
  return <div>
    <p className="mb-3 text-sm text-[#667085]">{version ? 'Saved attendance — open to review or correct.' : 'Attendance has not been recorded for this date.'}</p>
    <div className="space-y-3">{people.map((p) => <label key={p.student_id} className={`${cardClass(p.gender ?? null, p.status ?? '')} flex min-h-20 items-center gap-3 p-4 pl-5 ${editable ? 'cursor-pointer' : ''}`}><span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[6px] ${stripeClass(p.gender ?? null, p.status ?? '')}`} /><input type="checkbox" disabled={!editable || saving} checked={present.has(p.student_id)} onChange={() => { setDirty(true); setPresent((old) => { const next = new Set(old); if (next.has(p.student_id)) next.delete(p.student_id); else next.add(p.student_id); return next }) }} className="h-6 w-6 shrink-0 accent-[#175cd3]"/><span className="min-w-0 break-words text-[19px] font-extrabold tracking-[-0.02em] text-[#15223a]">{p.display_name}</span></label>)}</div>
    {!people.length && <p className="rounded-xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No roster members for this date.</p>}
    {editable && !dirty && <AddAttender groupId={groupId} date={meetingDate}/>}
    {dirty && <p className="my-3 text-xs text-[#667085]">Save your checklist before adding another attender or changing dates.</p>}
    <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] z-10 mt-4 rounded-[20px] border border-[#dbe8f8] bg-white p-4 shadow-[0_2px_12px_rgba(16,24,40,0.08)] md:bottom-4"><p className="mb-3 text-center text-sm font-extrabold text-[#15223a]">{present.size} of {people.length} here{dirty ? ' · Unsaved' : ''}</p>
      {editable && <button disabled={saving || !people.length} onClick={save} className={`${buttonClass} w-full`}>{saving ? 'Saving…' : 'Save Attendance'}</button>}
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'mt-2 rounded-full border border-[#fedf89] bg-[#fff8eb] px-4 py-2 text-sm font-bold text-[#b54708]' : 'mt-2 text-sm'}>{message}</p>}
    </div>
  </div>
}
