'use client'

import { useState, type ReactNode } from 'react'
import type { CommunityMember, CommunityMeeting, CommunityAttendance } from '@/lib/community'

export function PeopleView({ children, people, members, meetings, attendance }: {
  children: ReactNode; people: CommunityMember[]; members: CommunityMember[];
  meetings: CommunityMeeting[]; attendance: CommunityAttendance[]
}) {
  const [view, setView] = useState<'list' | 'chart'>('list')
  const dates = [...meetings].sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const records = new Map(attendance.map(a => [`${a.student_id}:${a.meeting_id}`, a.is_present]))
  return <>
    <div role="group" aria-label="People view" className="mb-4 inline-flex gap-1 rounded-full border border-[#e4e7ec] bg-[#f9fafb] p-1">
      {(['list', 'chart'] as const).map(value => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`min-h-11 rounded-full px-5 text-sm font-extrabold capitalize transition ${view === value ? 'bg-[#00274c] text-white' : 'text-[#475467] hover:bg-white'}`}>{value}</button>)}
    </div>
    {view === 'list' ? children : !dates.length ? <p className="rounded-xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No saved meeting dates yet.</p> : <>
      <p className="mb-3 text-xs text-[#667085]">✓ Present · × Absent · — Outside membership dates · ? Not recorded</p>
      <div tabIndex={0} role="region" aria-label="Attendance chart, scroll to see more students and dates" className="max-h-[65vh] overflow-auto rounded-2xl border border-[#d0d5dd] bg-white focus-visible:outline-2 focus-visible:outline-[#175cd3]">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Saved group attendance by student and meeting date</caption>
          <thead><tr>
            <th scope="col" className="sticky left-0 top-0 z-30 w-32 min-w-32 max-w-32 border-b border-r border-[#d0d5dd] bg-[#f2f4f7] p-3 text-left text-[#15223a]">Student</th>
            {dates.map(date => <th key={date.id} scope="col" className="sticky top-0 z-20 min-w-20 border-b border-[#d0d5dd] bg-[#f2f4f7] p-3 text-center text-xs text-[#475467]"><time dateTime={date.meeting_date}>{date.meeting_date.slice(5).replace('-', '/')}<span className="block font-normal">{date.meeting_date.slice(0, 4)}</span></time></th>)}
          </tr></thead>
          <tbody>{people.map(person => <tr key={person.student_id}>
            <th scope="row" className="sticky left-0 z-10 w-32 min-w-32 max-w-32 border-b border-r border-[#e4e7ec] bg-white p-3 text-left font-bold text-[#15223a] break-words">{person.students.display_name}</th>
            {dates.map(date => {
              const recorded = records.get(`${person.student_id}:${date.id}`)
              const eligible = members.some(m => m.student_id === person.student_id && m.started_on <= date.meeting_date && (!m.ended_on || m.ended_on >= date.meeting_date))
              const label = recorded === true ? 'Present' : recorded === false ? 'Absent' : eligible ? 'Not recorded' : 'Outside membership dates'
              return <td key={date.id} className="border-b border-[#e4e7ec] p-3 text-center">
                <span title={`${person.students.display_name} · ${date.meeting_date}: ${label}`} aria-label={label} className={`inline-flex h-8 w-8 items-center justify-center text-lg font-extrabold ${recorded === true ? 'rounded-lg bg-[#079455] text-white' : recorded === false ? 'rounded-full bg-[#d92d20] text-white' : 'text-[#667085]'}`}>
                  <span aria-hidden="true">{recorded === true ? '✓' : recorded === false ? '×' : eligible ? '?' : '—'}</span>
                </span>
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </>
}
