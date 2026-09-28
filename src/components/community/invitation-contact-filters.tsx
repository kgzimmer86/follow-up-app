'use client'

import type { ReactNode } from 'react'
import { assignedAreaFilters, resetChangedCampusFilters, resetChangedDormFilters } from '@/lib/contact-filters'
import type { CommunityArea } from '@/lib/community'
import { CheckboxFilterDropdown } from '@/components/follow-up/checkbox-filter-dropdown'
import { selectedStatuses, statusFilterValue, affinityFilterValue, statusOptions } from '@/lib/smart-card-filter-options'

export type InvitationFilters = {
  campus: string; location: string; gender: string; status: string; jesus: string; community: string;
  interview: string; kgp: string; interviewDone: string; invitedCg: string; affinity: string;
  floor: string; wing: string; roomOnly: string; group: string
}
export const emptyInvitationFilters: InvitationFilters = {
  campus: '', location: '', gender: '', status: '', jesus: '', community: '', interview: '', kgp: '',
  interviewDone: '', invitedCg: '', affinity: '', floor: '', wing: '', roomOnly: '', group: '',
}
export type InvitationArea = CommunityArea & { area_type: string }
export function defaultInvitationFilters(area: InvitationArea | null): InvitationFilters {
  return { ...emptyInvitationFilters, ...assignedAreaFilters(area) }
}
export function invitationFilterArgs(f: InvitationFilters) {
  return { p_campus: f.campus || null, p_location: f.location || null, p_gender: f.gender || null,
    p_status: f.status || null, p_jesus: f.jesus || null, p_community: f.community || null,
    p_interview: f.interview || null, p_kgp: f.kgp || null, p_interview_done: f.interviewDone || null,
    p_invited_to_cg: f.invitedCg || null, p_affinity: f.affinity || null, p_floor: f.floor || null,
    p_wing: f.wing || null, p_room_only: f.roomOnly === '1' }
}

export function InvitationContactFilters({ value, onChange, areas, groups, floors, wings, defaultArea, updating }: {
  value: InvitationFilters; onChange: (value: InvitationFilters) => void; areas: InvitationArea[];
  groups: { id: string; name: string }[]; floors: string[]; wings: string[]; defaultArea: string | null
  updating: boolean
}) {
  const campuses = areas.filter(a => !a.parent_id && a.area_type !== 'affinity')
  const count = Object.values(value).filter(Boolean).length
  const specificDorm = Boolean(value.location && !['no_address', 'needs_area_assignment'].includes(value.location))
  function update(key: keyof InvitationFilters, next: string) {
    onChange(resetChangedDormFilters(resetChangedCampusFilters({ ...value, [key]: next }, value.campus, areas), value.location))
  }
  function select(label: string, key: keyof InvitationFilters, children: ReactNode, disabled = false) {
    return <label className="block text-xs font-extrabold text-[#475467]">{label}<select disabled={disabled || updating} value={value[key]} onChange={e => update(key, e.target.value)} className="mt-1.5 min-h-11 w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-normal text-[#15223a] disabled:bg-[#f9fafb]">{children}</select></label>
  }
  function survey(label: string, key: 'jesus' | 'community' | 'interview') {
    const selected = value[key].split(',').filter(Boolean)
    return <fieldset className="rounded-[11px] border border-[#e4e7ec] p-3"><legend className="px-1 text-xs font-extrabold text-[#475467]">{label}</legend>
      {[['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No'], ...(key === 'jesus' ? [['already_have_one', 'Already have one']] : []), ['unanswered', 'No answer']].map(([option, label]) => <label key={option} className="flex min-h-9 items-center gap-2 text-xs text-[#475467]"><input type="checkbox" checked={selected.includes(option)} onChange={e => update(key, (e.target.checked ? [...selected, option] : selected.filter(s => s !== option)).join(','))} className="h-4 w-4 accent-[#175cd3]"/>{label}</label>)}
    </fieldset>
  }
  return <details className="overflow-hidden rounded-[18px] border border-[#e4e7ec] bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5"><div className="text-sm font-extrabold text-[#15223a]">Filters</div><span className="shrink-0 rounded-full bg-[#eef4ff] px-2.5 py-1 text-[11px] font-extrabold text-[#3538cd]">{count ? `${count} active` : 'Open'}</span></summary>
    <div aria-busy={updating} className="border-t border-[#e4e7ec] p-4">
      <div className="zoom-stack grid grid-cols-2 gap-3 md:grid-cols-4">
        {select('Campus area', 'campus', <><option value="">All areas</option>{campuses.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</>)}
        {select('Dorm / location', 'location', <><option value="">Any</option>{campuses.filter(a => !value.campus || a.id === value.campus).map(a => <optgroup key={a.id} label={a.name}>{areas.filter(l => l.parent_id === a.id && l.area_type !== 'affinity').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}{!value.campus && <optgroup label="Other"><option value="no_address">No Address</option><option value="needs_area_assignment">Needs Area Assignment</option></optgroup>}</>)}
        {select('Floor', 'floor', <><option value="">{!specificDorm ? 'Choose dorm first' : 'Any'}</option>{[...new Set([...floors, ...(value.floor ? [value.floor] : [])])].map(f => <option key={f}>{f}</option>)}</>, !specificDorm || (!floors.length && !value.floor))}
        {select('Wing / house #', 'wing', <><option value="">{!specificDorm ? 'Choose dorm first' : 'Any'}</option>{[...new Set([...wings, ...(value.wing ? [value.wing] : [])])].map(w => <option key={w}>{w}</option>)}</>, !specificDorm || (!wings.length && !value.wing))}
        {select('Gender', 'gender', <><option value="">Any</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other / unspecified</option></>)}
        <CheckboxFilterDropdown label="Status" name="status" selected={selectedStatuses(value.status, false)}
          options={statusOptions} emptyLabel="No statuses selected" onSelectionChange={values => update('status', statusFilterValue(values, false))} />
        {survey('Jesus', 'jesus')}{survey('Community', 'community')}{survey('Interview', 'interview')}
        {select('KGP shared', 'kgp', <><option value="">Any</option><option value="shared">Yes</option><option value="not_shared">No</option></>)}
        {select('Interview done', 'interviewDone', <><option value="">Any</option><option value="completed">Yes</option><option value="not_completed">No</option></>)}
        {select('Invited to CG', 'invitedCg', <><option value="">Any</option><option value="invited">Yes</option><option value="not_invited">No</option></>)}
        <CheckboxFilterDropdown label="Affinity" name="affinity" selected={value.affinity.split(',').filter(Boolean)}
          options={areas.filter(a => a.area_type === 'affinity').map(a => ({ value: a.id, label: a.name }))}
          onSelectionChange={values => update('affinity', affinityFilterValue(values))} />
        <div className="col-span-2">{select('Community group roster', 'group', <><option value="">All contacts — no roster restriction</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</>)}<p className="mt-1 text-xs text-[#667085]">Current roster members only; other filters still apply.</p></div>
      </div>
      <label className="mt-3 flex min-h-9 items-center gap-2 text-xs font-bold text-[#475467]"><input type="checkbox" disabled={updating} checked={value.roomOnly === '1'} onChange={e => update('roomOnly', e.target.checked ? '1' : '')} className="h-4 w-4"/>Hide missing rooms (room or address contains a number)</label>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef0f3] pt-4">
        <button type="button" disabled={updating} className="rounded-[11px] border border-[#e4e7ec] bg-white px-4 py-2.5 text-sm font-extrabold text-[#15223a] disabled:opacity-60" onClick={() => onChange(defaultInvitationFilters(areas.find(a => a.id === defaultArea) ?? null))}>Clear Filters</button>
        <button type="button" disabled={updating} className="rounded-[11px] border border-[#e4e7ec] bg-white px-4 py-2.5 text-sm font-extrabold text-[#15223a] disabled:opacity-60" onClick={() => onChange({ ...value, ...assignedAreaFilters(areas.find(a => a.id === defaultArea) ?? null) })}>Use my assigned area</button>
        <span role="status" aria-live="polite" className="self-center text-xs text-[#667085]">{updating ? 'Updating…' : ''}</span>
      </div>
    </div>
  </details>
}
