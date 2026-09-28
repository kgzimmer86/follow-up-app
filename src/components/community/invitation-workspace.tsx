'use client'

import Link from 'next/link'
import { readInvitationFilters, rememberInvitationFilters } from '@/lib/invitation-filter-memory'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { invitationStatuses, type CommunityEvent } from '@/lib/community-events'
import { ministryToday, withinArea, type CommunityArea } from '@/lib/community'
import { InteractionButton } from '@/components/follow-up/interaction-button'
import { AddTextAttemptButton, ContactTextLink } from '@/components/follow-up/text-attempt-session'
import { buttonClass, inputClass, secondaryButtonClass } from './group-controls'
import { invitationsChanged } from './invite-attention'
import { InvitationContactFilters, defaultInvitationFilters, invitationFilterArgs } from './invitation-contact-filters'

type Row = {
  group_names?: string[];
  dorm?: string | null; room_or_address?: string | null;
  contact_id: string; student_id: string; display_name: string; phone: string | null; contact_status: string;
  primary_owner_id: string | null; event_id: string; event_name: string; event_date: string; is_open: boolean;
  campaign_status: string; response: string; version: number; assigned_to: string | null; assignee_name: string | null;
  first_invited_at: string | null; last_outreach_at: string | null; cue: string
}
type Area = CommunityArea & { area_type: string }
const statusPillColors: Record<string, string> = {
  coming: 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]',
  not_asked: 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]',
  maybe: 'border-[#fedf89] bg-[#fffaeb] text-[#101828]',
  invited: 'border-[#d0d5dd] bg-white text-[#344054]',
  cant_come: 'border-[#475467] bg-[#475467] text-white',
}
export function InvitationWorkspace({ mine, events, userId, role, people, areas, defaultArea, groups }: {
  mine: boolean; events: CommunityEvent[]; userId: string; role: string;
  people: { id: string; display_name: string | null }[]; areas: Area[]; defaultArea: string | null
  groups: { id: string; name: string }[]
}) {
  const memoryKey = `${userId}:${role}:${events[0]?.campaign_id ?? 'none'}:${defaultArea ?? 'all'}`
  const [remembered] = useState(() => mine ? undefined : readInvitationFilters(memoryKey))
  const [eventId, setEventId] = useState(mine ? '' : events.some(e => e.id === remembered?.eventId) ? remembered!.eventId : events.find(e => e.is_open && e.event_date >= ministryToday())?.id ?? events[0]?.id ?? '')
  const [query, setQuery] = useState(remembered?.query ?? ''), [area, setArea] = useState(mine ? '' : defaultArea ?? '')
  const [filters, setFilters] = useState(() => remembered?.filters ?? defaultInvitationFilters(areas.find(a => a.id === defaultArea) ?? null))
  useEffect(() => {
    if (!mine) rememberInvitationFilters(memoryKey, { eventId, query, filters })
  }, [mine, memoryKey, eventId, query, filters])
  const [spatialOptions, setSpatialOptions] = useState<{ floors: string[]; wings: string[] }>({ floors: [], wings: [] })
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ rows: Row[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [selected, setSelected] = useState<Row[]>([]), [recipient, setRecipient] = useState(role === 'student_leader' ? userId : '')
  const [review, setReview] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const [rowFeedback, setRowFeedback] = useState<{ id: string; text: string; error?: boolean } | null>(null)
  const [desktop, setDesktop] = useState<boolean | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => { setDesktop(media.matches); setPage(1); setSelected([]); setLoading(true) }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const reviewPanel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (review) reviewPanel.current?.scrollIntoView({ block: 'center' })
  }, [review])
  useEffect(() => {
    if (!mine && desktop === null) return
    let cancelled = false
    const timer = setTimeout(async () => {
      // Filter/page changes set loading in their handlers. Background refreshes
      // keep the current rows mounted so saving does not collapse the page.
      try {
        const client = createClient()
        if (!mine) {
          if (!eventId) { if (!cancelled) setResult({ rows: [], total: 0 }); return }
          const { data, error } = await client.rpc('get_invitation_assignment_results', {
            p_assignable_only: !(desktop && ['staff', 'admin'].includes(role)),
            p_event_id: eventId, p_group_id: filters.group || null, p_search: query.trim(),
            p_view: 'area', p_page: page, p_page_size: 50, p_sort: 'name', p_dir: 'asc', ...invitationFilterArgs(filters),
          })
          if (error) throw new Error(error.message)
          type Contact = { id: string; student_id: string; display_name: string; phone: string | null; status: string; primary_owner_id: string | null; ministry_location_id?: string | null; room_or_address?: string | null }
          const contacts: Contact[] = data.rows ?? []
          const groupNames = new Map<string, Set<string>>()
          if (contacts.length && ['staff', 'admin'].includes(role)) {
            for (let offset = 0; ; offset += 500) {
              const memberships = await client.from('community_group_memberships')
                .select('id,student_id,community_groups!inner(name,campaign_id,is_active)')
                .in('student_id', contacts.map(c => c.student_id)).is('ended_on', null)
                .eq('community_groups.campaign_id', events.find(e => e.id === eventId)!.campaign_id)
                .eq('community_groups.is_active', true).order('id').range(offset, offset + 499)
              if (memberships.error) throw new Error(memberships.error.message)
              for (const membership of memberships.data) {
                const linkedGroups = Array.isArray(membership.community_groups) ? membership.community_groups : [membership.community_groups]
                const names = groupNames.get(membership.student_id) ?? new Set<string>()
                for (const group of linkedGroups) if (group) names.add(group.name)
                groupNames.set(membership.student_id, names)
              }
              if (memberships.data.length < 500) break
            }
          }
          const invitations = contacts.length ? await client.from('community_event_invitations')
            .select('student_id,status,version,assigned_to,first_invited_at,last_outreach_at').eq('event_id', eventId)
            .in('student_id', contacts.map(c => c.student_id)) : { data: [], error: null }
          if (invitations.error) throw new Error(invitations.error.message)
          const assignedIds = [...new Set((invitations.data ?? []).map(i => i.assigned_to).filter((id): id is string => Boolean(id)))]
          const assignees = assignedIds.length ? await client.from('profiles').select('id,display_name').in('id', assignedIds) : { data: [], error: null }
          if (assignees.error) throw new Error(assignees.error.message)
          const selectedEvent = events.find(e => e.id === eventId)!
          const rows: Row[] = contacts.map(c => {
            const i = invitations.data?.find(i => i.student_id === c.student_id)
            return { contact_id: c.id, student_id: c.student_id, display_name: c.display_name, phone: c.phone,
              group_names: [...(groupNames.get(c.student_id) ?? [])].sort((a, b) => a.localeCompare(b)),
              dorm: areas.find(a => a.id === c.ministry_location_id)?.name ?? null, room_or_address: c.room_or_address,
              contact_status: c.status, primary_owner_id: c.primary_owner_id, event_id: eventId, event_name: selectedEvent.name,
              event_date: selectedEvent.event_date, is_open: selectedEvent.is_open, campaign_status: 'active',
              response: i?.status ?? 'not_asked', version: i?.version ?? 0, assigned_to: i?.assigned_to ?? null,
              assignee_name: assignees.data?.find(p => p.id === i?.assigned_to)?.display_name ?? null,
              first_invited_at: i?.first_invited_at ?? null, last_outreach_at: i?.last_outreach_at ?? null,
              cue: !selectedEvent.is_open || selectedEvent.event_date < ministryToday() ? 'history'
                : !i?.first_invited_at && (!i || i.status === 'not_asked') ? 'initial' : 'handled' }
          })
          if (!cancelled) { setResult({ rows, total: data.total_count }); setSpatialOptions({ floors: data.floor_options ?? [], wings: data.wing_options ?? [] }); setError('') }
          return
        }
        const { data, error } = await client.rpc('community_invitation_workspace', {
          p_event: eventId || null, p_mine: mine, p_query: query.trim(), p_area: area || null, p_page: page,
        })
        if (error) throw new Error(error.message)
        if (!cancelled) { setResult(data); setError('') }
      } catch (e) { if (!cancelled) { setResult(null); setError(e instanceof Error ? e.message : 'Unable to load invitations.') } }
      finally { if (!cancelled) setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [mine, eventId, query, area, page, refresh, filters, events, people, areas, role, desktop])
  useEffect(() => {
    const refresh = () => setRefresh(x => x + 1)
    window.addEventListener('community-invitations-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('community-invitations-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  const event = events.find(e => e.id === eventId)
  const staff = ['staff', 'admin'].includes(role)
  const selectable = (r: Row) => r.cue === 'initial' && (staff || !r.assigned_to)
  const campusGroups = areas.filter(a => !a.parent_id && a.area_type !== 'affinity').map(campus => ({
    campus, options: areas.filter(a => a.area_type !== 'affinity' && withinArea(a.id, campus.id, areas)),
  }))
  const grouped = new Set(campusGroups.flatMap(g => g.options.map(a => a.id)))
  async function assign() {
    if (saving) return
    setSaving(true); setError('')
    try {
      const { error } = await createClient().rpc('community_assign_invitations', {
        p_event: eventId, p_contacts: selected.map(r => r.contact_id), p_assignee: recipient,
        p_versions: Object.fromEntries(selected.map(r => [r.contact_id, r.version])),
      })
      if (error) throw new Error(error.message)
      setMessage(`${selected.length} invitations assigned.`); setReview(false); setSelected([]); invitationsChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Assignment not saved.'); setReview(false); setSelected([]); setRefresh(x => x + 1) }
    finally { setSaving(false) }
  }
  async function assignRow(row: Row, assignee: string) {
    if (saving || assignee === row.assigned_to) return
    setSaving(true); setError(''); setMessage('')
    setRowFeedback({ id: row.contact_id, text: 'Saving…' })
    try {
      const { error } = await createClient().rpc('community_assign_invitations', {
        p_event: row.event_id, p_contacts: [row.contact_id], p_assignee: assignee,
        p_versions: { [row.contact_id]: row.version },
      })
      if (error) throw new Error(error.message)
      setSelected(current => current.filter(r => r.contact_id !== row.contact_id))
      setResult(current => current && ({ ...current, rows: current.rows.map(r => r.contact_id === row.contact_id && r.event_id === row.event_id
        ? { ...r, assigned_to: assignee, assignee_name: people.find(p => p.id === assignee)?.display_name ?? null, version: row.version + 1 }
        : r) }))
      setRowFeedback({ id: row.contact_id, text: 'Saved' })
      invitationsChanged()
    } catch (e) {
      setRowFeedback({ id: row.contact_id, text: `Not saved. ${e instanceof Error ? e.message : 'Try again.'}`, error: true })
      setRefresh(x => x + 1)
    } finally { setSaving(false) }
  }
  return <div className="mt-4 space-y-4">
    <fieldset disabled={saving || review} className="space-y-3">
      <label className="block text-sm font-bold">Event<select className={inputClass} value={eventId} onChange={e => { setEventId(e.target.value); setSelected([]); setPage(1); setResult(null); setLoading(true) }}>
        {mine && <option value="">All events</option>}
        {!mine && !events.length && <option value="">No events available</option>}{events.map(e => <option key={e.id} value={e.id}>{e.name} · {e.event_date}{!e.is_open ? ' · Closed' : ''}</option>)}
      </select></label>
        {mine ? <label className="block text-sm font-bold">Ministry area<select className={inputClass} value={area} onChange={e => { setArea(e.target.value); setPage(1); setLoading(true) }}><option value="">All Campus</option>
          {campusGroups.map(g => <optgroup key={g.campus.id} label={g.campus.name.toUpperCase()}><option value={g.campus.id}>All {g.campus.name}</option>{g.options.filter(a => a.id !== g.campus.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
          <optgroup label="OTHER / AFFINITY MINISTRIES">{areas.filter(a => !grouped.has(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
        </select></label> : <InvitationContactFilters updating={loading} value={filters} onChange={next => { setFilters(next); setSelected([]); setPage(1); setLoading(true) }} areas={areas} groups={groups} floors={spatialOptions.floors} wings={spatialOptions.wings} defaultArea={defaultArea}/>}
        <label className="block text-sm font-bold">Search students<input className={inputClass} value={query} onChange={e => { setQuery(e.target.value); setPage(1); setLoading(true) }} placeholder="Name or uniqname"/></label>
    </fieldset>
    {!mine && <div className="rounded-2xl border border-[#dbe8f8] bg-white p-4 space-y-3">
      {role !== 'student_leader' && <label className="block text-sm font-bold">Assign to<select disabled={saving || review} className={inputClass} value={recipient} onChange={e => setRecipient(e.target.value)}><option value="">Choose a person</option>{people.map(p => <option key={p.id} value={p.id}>{p.display_name ?? 'Unnamed account'}</option>)}</select></label>}
      <button type="button" className={buttonClass} disabled={!selected.length || !recipient || saving || review || loading} onClick={() => setReview(true)}>Review {selected.length} {role === 'student_leader' ? 'claims' : 'assignments'}</button>
      {!!selected.length && !review && <button type="button" className={`${secondaryButtonClass} ml-2`} onClick={() => setSelected([])}>Clear selection</button>}
    </div>}
    {review && <section ref={reviewPanel} role="region" aria-label="Review invitation assignments" className="rounded-2xl border border-[#fedf89] bg-[#fff8eb] p-4 space-y-3">
      <h3 className="font-extrabold">Confirm {selected.length} invitations</h3>
      <p className="text-sm text-[#667085]">This leaves follow-up contact ownership unchanged.</p>
      <p className="text-sm">{event?.name} → {people.find(p => p.id === recipient)?.display_name ?? 'You'}</p>
      <ul className="max-h-48 overflow-auto text-sm list-disc pl-5">{selected.map(r => <li key={r.contact_id}>{r.display_name}{r.assigned_to ? ` (reassign from ${r.assignee_name ?? 'current assignee'})` : ''}</li>)}</ul>
      <div className="flex gap-2"><button type="button" disabled={saving} className={buttonClass} onClick={assign}>{saving ? 'Saving…' : 'Confirm assignment'}</button><button type="button" disabled={saving} className={secondaryButtonClass} onClick={() => setReview(false)}>Cancel</button></div>
    </section>}
    {message && <p role="status" className="text-sm text-[#027a48]">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-[#fedf89] bg-[#fff8eb] p-3 text-sm text-[#b54708]">{error} <button type="button" className="underline" onClick={() => setRefresh(x => x + 1)}>Reload</button></p>}
    {loading ? <p role="status" className="text-sm text-[#667085]">Loading invitations…</p> : result && <>
      <p className="text-xs text-[#667085]">{result.total} {mine ? 'invitations · Needs action first' : 'matching contacts · Alphabetical'}</p>
      {!result.rows.length && <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">{mine ? 'No invitations assigned to you match these filters.' : 'No students match these filters.'}</p>}
      {!mine && staff && !!result.rows.length && <div className="hidden overflow-x-auto rounded-2xl border border-[#dbe8f8] bg-white lg:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Assign event invitations to matching contacts</caption>
          <thead className="bg-[#f9fafb] text-[#475467]"><tr>
            <th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Student</th><th className="p-3">Dorm / room</th><th className="p-3">Groups</th><th className="p-3">Response</th><th className="p-3">Assigned to</th>
          </tr></thead>
          <tbody className="divide-y divide-[#e4e7ec]">{result.rows.map(r => <tr key={r.contact_id} className={!selectable(r) ? 'bg-[#d0d5dd] hover:bg-[#c4cad4]' : r.assigned_to && r.response === 'not_asked' ? 'bg-[#fff1f0] hover:bg-[#fee4e2]' : 'hover:bg-[#f9fafb]'}>
            <td className="p-3"><input type="checkbox" aria-label={`Select ${r.display_name}`} className="h-4 w-4" disabled={saving || review || !selectable(r) || (selected.length >= 100 && !selected.some(s => s.contact_id === r.contact_id))} checked={selected.some(s => s.contact_id === r.contact_id)} onChange={e => setSelected(e.target.checked ? [...selected, r] : selected.filter(s => s.contact_id !== r.contact_id))}/></td>
            <td className="p-3 font-bold"><Link href={`/contacts/${r.contact_id}?from=${encodeURIComponent('/community/invites/assign')}`}>{r.display_name}</Link></td>
            <td className="p-3 text-[#667085]">{[r.dorm, r.room_or_address].filter(Boolean).join(' · ') || '—'}</td>
            <td className="p-3 text-[#667085]">{r.group_names?.length ? r.group_names.map(name => <div key={name}>{name}</div>) : '—'}</td>
            <td className="p-3"><span className={`inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusPillColors[r.response] ?? statusPillColors.invited}`}>{invitationStatuses.find(s => s.value === r.response)?.label}</span>{r.cue === 'history' && <span className="block text-xs text-[#667085]">Closed</span>}</td>
            <td className="min-w-56 p-3"><select aria-label={`Assigned to for ${r.display_name}`} className={inputClass} value={r.assigned_to ?? ''} disabled={saving || review || !selectable(r)} onChange={e => void assignRow(r, e.target.value)}>
              <option value="" disabled>Unassigned</option>
              {r.assigned_to && !people.some(p => p.id === r.assigned_to) && <option value={r.assigned_to} disabled>{r.assignee_name ?? 'Assigned user'}</option>}
              {people.map(p => <option key={p.id} value={p.id}>{p.display_name ?? 'Unnamed account'}</option>)}
            </select>{rowFeedback?.id === r.contact_id && <p role={rowFeedback.error ? 'alert' : 'status'} className={`mt-1 text-xs ${rowFeedback.error ? 'text-[#b42318]' : 'text-[#475467]'}`}>{rowFeedback.text}</p>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {result.rows.filter(r => mine || selectable(r)).map(r => <article key={`${r.event_id}:${r.contact_id}`} className={`rounded-2xl border border-[#dbe8f8] bg-white p-4 space-y-3 ${!mine && staff ? 'lg:hidden' : ''}`}>
        <div className="flex items-center gap-3">
          {!mine && <input type="checkbox" aria-label={`Assign invitation for ${r.display_name}`} className="h-5 w-5" disabled={saving || review || !selectable(r) || (selected.length >= 100 && !selected.some(s => s.contact_id === r.contact_id))} checked={selected.some(s => s.contact_id === r.contact_id)} onChange={e => setSelected(e.target.checked ? [...selected, r] : selected.filter(s => s.contact_id !== r.contact_id))}/>}
          {r.campaign_status === 'active' ? <Link className="font-extrabold text-[#15223a]" href={`/contacts/${r.contact_id}?from=${encodeURIComponent(mine ? '/community/invites' : '/community/invites/assign')}`}>{r.display_name}</Link> : <p className="font-extrabold">{r.display_name}</p>}
        </div>
        <p className="text-sm text-[#667085]">{r.event_name} · {r.event_date} · {invitationStatuses.find(s => s.value === r.response)?.label}</p>
        <p className="text-xs text-[#667085]">{r.assigned_to ? `Responsible: ${r.assignee_name ?? 'Assigned user'}` : 'Unassigned'}</p>
        {r.cue === 'initial' && r.assigned_to && <p className="text-xs font-bold text-[#b42318]">Invitation needed</p>}
        {r.cue === 'no_response' && <p className="inline-block rounded-full bg-[#fff8eb] px-3 py-1 text-xs font-bold text-[#b54708]">No response logged · Check in again</p>}
        {r.cue === 'history' ? <p className="text-xs text-[#667085]">Closed — history only</p> : mine && <>
          <ResponseEditor key={r.version} row={r}/>
          {r.phone && <ContactTextLink contactId={r.contact_id} contactName={r.display_name} href={`sms:${r.phone.replace(/[^+\d]/g, '')}`} invitationEvent={{ id: r.event_id, name: r.event_name }} className="block w-full rounded-[11px] border border-[#ffcb05] bg-[#ffcb05] px-2 py-2.5 text-center text-sm font-extrabold text-[#00274c]">Text</ContactTextLink>}
          <div className="grid grid-cols-2 gap-2">
            <InteractionButton contactId={r.contact_id} contactName={r.display_name} currentStatus={r.contact_status} isPrimary={r.primary_owner_id === userId} invitationEvent={{ id: r.event_id, name: r.event_name }}/>
            <AddTextAttemptButton className="w-full rounded-[11px] border border-[#e4e7ec] bg-white px-2 py-2.5 text-center text-sm font-extrabold text-[#15223a]" contactId={r.contact_id} contactName={r.display_name} invitationEvent={{ id: r.event_id, name: r.event_name }}/>
          </div>
        </>}
      </article>)}
      <div className="flex items-center justify-between"><button disabled={page === 1} className={secondaryButtonClass} onClick={() => { setPage(page - 1); setLoading(true) }}>Previous</button><span className="text-sm">Page {page}</span><button disabled={page * 50 >= result.total} className={secondaryButtonClass} onClick={() => { setPage(page + 1); setLoading(true) }}>Next</button></div>
    </>}
  </div>
}

function ResponseEditor({ row }: { row: Row }) {
  const [response, setResponse] = useState(row.response), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try {
      const { error } = await createClient().rpc('community_invitation_response', { p_event: row.event_id, p_contact: row.contact_id, p_status: response, p_version: row.version })
      if (error) throw new Error(error.message)
      invitationsChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save response.') }
    finally { setBusy(false) }
  }
  return <div><label className="text-sm font-bold">Update response<select disabled={busy} className={inputClass} value={response} onChange={e => setResponse(e.target.value)}>{invitationStatuses.map(s => <option key={s.value} value={s.value} disabled={s.value === 'not_asked'}>{s.label}</option>)}</select></label><button type="button" className={`${secondaryButtonClass} mt-2`} disabled={busy || response === row.response || response === 'not_asked'} onClick={save}>{busy ? 'Saving…' : 'Save response'}</button>{error && <p role="alert" className="mt-2 rounded-xl border border-[#fedf89] bg-[#fff8eb] p-3 text-sm text-[#b54708]"><strong>Response not saved. </strong>{error}</p>}</div>
}
