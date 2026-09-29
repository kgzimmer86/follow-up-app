'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buttonClass, inputClass } from './group-controls'

type Leader = { id: string; name: string; area: string; selected: boolean }

export function GroupLeaderManagement({ groupId, revision, leaders }: { groupId: string; revision: number; leaders: Leader[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set(leaders.filter((leader) => leader.selected).map((leader) => leader.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shown = leaders.filter((leader) => selected.has(leader.id) || leader.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: saveError } = await createClient().rpc('community_manage_group_leaders', {
      p_group_id: groupId,
      p_leader_ids: [...selected],
      p_revision: revision,
    })
    setBusy(false)
    if (saveError) setError(saveError.message)
    else router.refresh()
  }

  return <form onSubmit={save} className="rounded-2xl border border-[#e4e7ec] bg-white p-5">
    <h3 className="text-lg font-extrabold">Group leaders</h3>
    <p className="mt-1 text-sm text-[#667085]">Choose leaders from any campus area. Your current campus area appears first.</p>
    <label className="mt-4 block text-sm font-bold">Search by name
      <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} type="search" />
    </label>
    <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
      {shown.map((leader) => <label key={leader.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-[#f9fafb]">
        <input type="checkbox" checked={selected.has(leader.id)} disabled={busy} onChange={(event) => {
          const next = new Set(selected)
          if (event.target.checked) next.add(leader.id)
          else next.delete(leader.id)
          setSelected(next)
        }} className="h-5 w-5" />
        <span>{leader.name} <span className="text-xs text-[#667085]">{leader.area}</span></span>
      </label>)}
      {!shown.length && <p className="text-sm text-[#667085]">No leaders match that name.</p>}
    </div>
    <button disabled={busy || selected.size === 0} className={`${buttonClass} mt-4`}>{busy ? 'Saving…' : 'Save leaders'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{error}</p>}
  </form>
}
