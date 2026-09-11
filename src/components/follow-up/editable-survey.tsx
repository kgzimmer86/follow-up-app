'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { saveContactSurveyAffinities, saveContactSurveyField } from '@/app/survey-edit-actions'

type Option = { value: string; label: string }
const inputClass = 'w-full min-w-0 rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a]'

function SurveyEditRow({ label, displayValue, canEdit, children, save, reset, changed }: {
  label: string; displayValue: string; canEdit: boolean; children: ReactNode
  save: () => Promise<void>; reset: () => void; changed: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  return <div className="py-3 first:pt-0 last:pb-0">
    <div className="flex items-start justify-between gap-3">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">{label}</div>
      {canEdit && !editing && <button type="button" aria-label={`Edit ${label}`} className="shrink-0 text-xs font-bold text-[#175cd3]" onClick={() => { reset(); setError(''); setEditing(true) }}>Edit</button>}
    </div>
    {editing && canEdit ? <form className="mt-2" onSubmit={(event) => {
      event.preventDefault(); setError('')
      startTransition(async () => {
        try { await save(); setEditing(false) }
        catch { setError('Couldn’t save. Please try again.') }
      })
    }}>
      <fieldset disabled={pending} className="min-w-0">{children}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="submit" disabled={!changed} className="rounded-[11px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
          <button type="button" className="rounded-[11px] border border-[#d0d5dd] px-3.5 py-2.5 text-xs font-bold text-[#475467]" onClick={() => { reset(); setError(''); setEditing(false) }}>Cancel</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-2 text-xs text-[#b42318]">{error}</p>}
    </form> : <div className="mt-1 text-sm font-bold leading-5 text-[#15223a]">{displayValue}</div>}
  </div>
}

export function EditableSurveyField({ contactId, field, label, value, displayValue, canEdit, options }: {
  contactId: string; field: string; label: string; value: string | null; displayValue: string; canEdit: boolean; options?: Option[]
}) {
  const [draft, setDraft] = useState(value ?? '')
  return <SurveyEditRow label={label} displayValue={displayValue} canEdit={canEdit}
    changed={draft !== (value ?? '')} reset={() => setDraft(value ?? '')} save={() => saveContactSurveyField(contactId, field, draft)}>
    {options ? <select aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass}>
      <option value="">No answer</option>
      {value && !options.some((o) => o.value === value) && <option value={value}>{value} (current)</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select> : <input aria-label={label} value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} className={inputClass} />}
  </SurveyEditRow>
}

export function EditableSurveyAffinities({ contactId, selected, choices, displayValue, canEdit }: {
  contactId: string; selected: string[]; choices: { id: string; name: string }[]; displayValue: string; canEdit: boolean
}) {
  const activeSelected = selected.filter((id) => choices.some((choice) => choice.id === id))
  const [draft, setDraft] = useState(activeSelected)
  const changed = draft.length !== activeSelected.length || draft.some((id) => !activeSelected.includes(id))
  return <SurveyEditRow label="Affinity interest" displayValue={displayValue} canEdit={canEdit}
    changed={changed} reset={() => setDraft(activeSelected)} save={() => saveContactSurveyAffinities(contactId, draft)}>
    <div className="grid gap-3">
      {choices.map((choice) => <label key={choice.id} className="flex items-start gap-3 text-sm text-[#15223a]">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#00274c]" checked={draft.includes(choice.id)} onChange={(e) => setDraft(e.target.checked ? [...draft, choice.id] : draft.filter((id) => id !== choice.id))} />
        <span>{choice.name}</span>
      </label>)}
      {!choices.length && <p className="text-sm text-[#667085]">No active affinity groups.</p>}
    </div>
  </SurveyEditRow>
}
