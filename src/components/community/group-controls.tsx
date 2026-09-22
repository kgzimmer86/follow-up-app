'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AddPersonModal } from '@/components/follow-up/add-person-modal'
import { withinArea, type CommunityArea, type CommunityGroup } from '@/lib/community'

export const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d0d5dd] bg-white px-3 py-2.5 text-base text-[#15223a] outline-none focus:border-[#175cd3] focus:ring-2 focus:ring-[#dbe8f8] md:text-sm'
export const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#113a67] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3] disabled:cursor-not-allowed disabled:opacity-50'
export const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm font-extrabold text-[#475467] transition hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3] disabled:cursor-not-allowed disabled:opacity-50'

export function GroupEditor({ group, areas, leaders, assignedArea }: { group?: CommunityGroup; areas: (CommunityArea & { area_type: string })[]; leaders: { id: string; display_name: string; area: string | null; selected: boolean }[]; assignedArea: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState(group?.ministry_area_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allowedAreas = areas.filter((a) => withinArea(a.id, assignedArea, areas))
    .sort((a, b) => a.name.localeCompare(b.name))
  const campusGroups = areas.filter((a) => a.parent_id === null && a.area_type !== 'affinity')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((campus) => ({ campus, options: allowedAreas.filter((a) => a.area_type !== 'affinity' && withinArea(a.id, campus.id, areas)) }))
    .filter(({ options }) => options.length > 0)
  const groupedIds = new Set(campusGroups.flatMap(({ options }) => options.map((a) => a.id)))
  const affinityAreas = allowedAreas.filter((a) => a.area_type === 'affinity')
  const otherAreas = allowedAreas.filter((a) => a.area_type !== 'affinity' && !groupedIds.has(a.id))
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const { data, error } = await createClient().rpc('community_save_group', { p_group_id: group?.id ?? null, p_name: form.get('name'), p_area_id: area, p_meeting_day: form.get('day'), p_leader_ids: form.getAll('leader'), p_revision: group?.revision ?? 0 })
      if (error) throw error
      setOpen(false)
      if (group) router.refresh()
      else router.push(`/community/groups/${data}`)
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? 'Unable to save the group.') }
    finally { setBusy(false) }
  }
  return <div className="my-4">
    <button className={buttonClass} onClick={() => setOpen(!open)}>{open ? 'Close settings' : group ? 'Edit group & leaders' : '+ Create group'}</button>
    {open && <form onSubmit={save} className="mt-3 space-y-4 rounded-2xl border border-[#dbe8f8] bg-white p-5">
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm font-bold">Group name<input name="name" required maxLength={120} defaultValue={group?.name} className={inputClass}/></label>
        <label className="block text-sm font-bold">Ministry area
          <select required value={area} onChange={(e) => setArea(e.target.value)} className={inputClass}>
            <option value="">Choose an area</option>
            {campusGroups.map(({ campus, options }) => <optgroup key={campus.id} label={campus.name.toUpperCase()}>
              {options.some((a) => a.id === campus.id) && <option value={campus.id}>All {campus.name}</option>}
              {options.filter((a) => a.id !== campus.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>)}
            {affinityAreas.length > 0 && <optgroup label="AFFINITY MINISTRIES">
              {affinityAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>}
            {otherAreas.length > 0 && <optgroup label="OTHER AREAS">
              {otherAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>}
          </select>
        </label>
        <label className="block text-sm font-bold">Usual meeting day<select name="day" defaultValue={group?.meeting_day ?? ''} className={inputClass}><option value="">Not set</option>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d) => <option key={d}>{d}</option>)}</select></label>
        <fieldset><legend className="text-sm font-bold">Group leaders</legend><p className="my-2 text-xs text-[#667085]">Choose at least one leader assigned to this area or a parent area.</p>
          {area && leaders.filter((p) => withinArea(area, p.area, areas)).map((p) => <label key={`${area}-${p.id}`} className="flex min-h-11 items-center gap-3"><input type="checkbox" name="leader" value={p.id} defaultChecked={p.selected} className="h-5 w-5"/>{p.display_name}</label>)}
        </fieldset>
        <button className={buttonClass}>{busy ? 'Saving…' : 'Save group'}</button>
      </fieldset>
      {error && <p role="alert" className="rounded-2xl border border-[#fedf89] bg-[#fff8eb] px-4 py-3 text-sm font-semibold text-[#b54708]">{error}</p>}
    </form>}
  </div>
}

type SearchPerson = { id: string; display_name: string; uniqname: string | null; umich_email: string | null; dorm: string | null }
export function AddAttender({ groupId, date, onAdded }: { groupId: string; date: string; onAdded?: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPerson[]>([])
  const [searched, setSearched] = useState(false)
  const [newPerson, setNewPerson] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(date)
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSearched(false)
    try {
      const q = query.trim()
      if (q.length < 2) throw new Error('Enter at least two characters.')
      const { data, error } = await createClient().rpc('community_search_students', { p_group_id: groupId, p_search: q })
      if (error) throw new Error(error.message)
      setResults(data ?? []); setSearched(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed. Try again.') }
    finally { setBusy(false) }
  }
  async function add(studentId: string) {
    const { error } = await createClient().rpc('community_add_member', { p_group_id: groupId, p_student_id: studentId, p_started_on: started })
    if (error) throw new Error(error.message)
    setOpen(false); setSearched(false); setQuery(''); onAdded?.(); router.refresh()
  }
  async function selectStudent(id: string) {
    setBusy(true); setError('')
    try { await add(id) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add attender.') } finally { setBusy(false) }
  }
  return <div className="my-4">
    <button type="button" aria-expanded={open} className={secondaryButtonClass} onClick={() => setOpen(!open)}>{open ? 'Close add attender' : '+ Add Attender'}</button>
    {open && <section className="mt-3 space-y-3 rounded-2xl border border-[#dbe8f8] bg-white p-4">
      <label className="block text-sm font-bold">On roster starting<input type="date" required value={started} onChange={(e) => setStarted(e.target.value)} className={inputClass}/></label>
      <form onSubmit={search}><label className="block text-sm font-bold">Find an existing student<input value={query} onChange={(e) => { setQuery(e.target.value); setSearched(false) }} placeholder="Name, uniqname, or U-M email" minLength={2} className={inputClass}/></label><button disabled={busy} className={`${buttonClass} mt-2`}>{busy ? 'Working…' : 'Search people'}</button></form>
      {searched && <><p className="text-xs text-[#667085]">{results.length ? 'Select the existing person. If there are many matches, narrow your search.' : 'No matches found.'}</p>
        {results.map((p) => <button key={p.id} disabled={busy} onClick={() => selectStudent(p.id)} className="block w-full rounded-xl border border-[#e4e7ec] bg-white p-3 text-left transition hover:bg-[#f9fafb]"><span className="block font-bold">{p.display_name}</span><span className="block break-words text-xs text-[#667085]">{p.uniqname || p.umich_email || 'No U-M identity recorded'} · {p.dorm || 'Dorm/location not recorded'}</span></button>)}
        <button disabled={busy} onClick={() => setNewPerson(true)} className="text-sm font-bold text-[#175cd3]">Person not listed? Create a new contact</button></>}
      {error && <p role="alert" className="rounded-2xl border border-[#fedf89] bg-[#fff8eb] px-4 py-3 text-sm font-semibold text-[#b54708]">{error}</p>}
    </section>}
    <AddPersonModal open={newPerson} onClose={() => setNewPerson(false)} onContactSelected={async (contactId) => {
      const { data, error } = await createClient().from('follow_up_contacts').select('student_id').eq('id', contactId).single()
      if (error) throw new Error(error.message)
      await add(data.student_id)
    }}/>
  </div>
}

export function MemberActions({ groupId, studentId, involved, active, date }: { groupId: string; studentId: string; involved: boolean; active: boolean; date: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false)
  const [message, setMessage] = useState('')
  const [choice, setChoice] = useState('involved')
  async function act(action: string, status: string | null = null) {
    setBusy(true); setMessage('')
    try {
      const { data, error } = action === 'restore'
        ? await createClient().rpc('community_add_member', { p_group_id: groupId, p_student_id: studentId, p_started_on: date })
        : await createClient().rpc('community_member_action', { p_group_id: groupId, p_student_id: studentId, p_action: action, p_status: status })
      if (error) throw new Error(error.message)
      if (data?.needs_review) { setReview(true); return }
      setReview(false); router.refresh()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save. Try again.') }
    finally { setBusy(false) }
  }
  return <div className="mt-3">
    <div className="flex flex-wrap gap-2">
      {active && !involved && <button className={secondaryButtonClass} disabled={busy} onClick={() => act('involved')}>Mark as Involved</button>}
      <button className={secondaryButtonClass} disabled={busy} onClick={() => act(active ? 'end' : 'restore')}>{busy ? 'Saving…' : active ? 'No longer attending' : 'Restore to roster'}</button>
    </div>
    {review && <div role="region" aria-label="Review ministry status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm">This is their last active Community Group. Should their ministry status change?</p>
      <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Ministry status" className={inputClass}><option value="involved">Keep Involved — connected elsewhere</option><option value="go_back">Go back — reconnect with them</option><option value="not_interested">Not interested — they told us so</option></select>
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => act('end', choice)} className={buttonClass}>Confirm</button><button disabled={busy} onClick={() => setReview(false)} className={secondaryButtonClass}>Cancel</button></div>
    </div>}
    {message && <p role="alert" className="mt-2 rounded-2xl border border-[#fedf89] bg-[#fff8eb] px-4 py-3 text-sm font-semibold text-[#b54708]">{message}</p>}
  </div>
}
