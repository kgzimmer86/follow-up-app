'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { contactDisplayName } from '@/lib/contact-name'
import { localDateTime, nextStepInputError, nextStepsChanged, nextStepsChangedEvent, plannedInstant, type NextStep } from '@/lib/next-steps'
import { InteractionButton } from './interaction-button'
import type { NextStepIdea } from '@/lib/next-step-ideas'

const button = 'min-h-11 rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-bold text-[#344054] disabled:opacity-50'
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit', timeZoneName: 'short',
}).format(new Date(value))

export function NextStepWorkspace({ contact }: { contact?: { id: string; name: string } }) {
  const [rows, setRows] = useState<NextStep[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [ideas, setIdeas] = useState<NextStepIdea[]>([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasError, setIdeasError] = useState('')
  const [selectedIdea, setSelectedIdea] = useState<NextStepIdea | null>(null)
  const [now, setNow] = useState(0)
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const contactId = contact?.id
  async function getIdeas() {
    if (!contactId || ideasLoading) return
    setIdeasLoading(true); setIdeasError('')
    try {
      const response = await fetch('/api/next-step-ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId }), signal: AbortSignal.timeout(50000) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Couldn’t generate ideas.')
      setIdeas(result.ideas)
    } catch (error) { setIdeasError(error instanceof Error ? error.message : 'Couldn’t generate ideas. You can write your own step.') }
    finally { setIdeasLoading(false) }
  }
  const load = useCallback(async (after?: NextStep) => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const { data, error } = await createClient().rpc('follow_up_next_steps_list', {
        p_contact: contactId ?? null, p_after_due: after?.due_at ?? null, p_after_id: after?.id ?? null,
      })
      if (error) throw new Error('Couldn’t load your next steps. Please try again.')
      if (request !== generation.current) return
      const page = (data ?? []) as NextStep[]
      setRows(previous => after ? [...previous, ...page.slice(0, 50)] : page.slice(0, 50))
      setMore(page.length > 50)
    } catch (error) {
      if (request === generation.current) setError(error instanceof Error ? error.message : 'Couldn’t load your next steps.')
    } finally { if (request === generation.current) setLoading(false) }
  }, [contactId])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') { setNow(Date.now()); void load() } }
    refresh()
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    window.addEventListener(nextStepsChangedEvent, refresh)
    window.addEventListener('focus', refresh)
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener(nextStepsChangedEvent, refresh); window.removeEventListener('focus', refresh) }
  }, [load, invalidate])

  return <section aria-label="Your next steps" aria-busy={loading} className="mt-4 space-y-3">
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={() => void load()} className="min-h-11 font-bold underline">Refresh list</button></div>}
    {loading && <p role="status" className="text-sm text-[#667085]">Loading next steps…</p>}
    {rows.map(step => <NextStepCard key={`${step.id}-${step.version}`} step={step} due={now > 0 && Date.parse(step.due_at) <= now} />)}
    {!loading && !error && rows.length === 0 && !creating && <p className="rounded-xl border border-dashed border-[#d0d5dd] p-4 text-sm text-[#667085]">
      {contact ? `What’s your next step of faith with ${contactDisplayName(contact.name)}?` : 'No pending steps. Open a contact to write your next step and choose when to take it.'}
    </p>}
    {more && <button type="button" disabled={loading} onClick={() => void load(rows.at(-1))} className={button}>Load more steps</button>}
    {contact && !loading && !error && rows.length === 0 && (creating
      ? <NextStepEditor contactId={contact.id} initialIdea={selectedIdea ?? undefined} onClose={() => { setCreating(false); setSelectedIdea(null) }} />
      : <div className="space-y-2">
        {ideas.map((idea, index) => <button key={index} type="button" onClick={() => { setSelectedIdea(idea); setCreating(true) }} className={`${button} block w-full text-left`}>
          <span className="block">{idea.action}</span><span className="mt-1 block text-xs font-normal text-[#667085]">{idea.timing}</span>
        </button>)}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={ideasLoading} onClick={() => void getIdeas()} className={button}>{ideasLoading ? 'Considering the history…' : ideas.length ? 'Refresh AI ideas' : 'Suggest three next steps'}</button>
          <button type="button" onClick={() => { setSelectedIdea(null); setCreating(true) }} className={button}>Write my own</button></div>
        {ideas.length > 0 && <p className="text-xs text-[#667085]">AI ideas to consider. Choose one to edit and set a time.</p>}
        {ideasError && <p role="alert" className="text-sm text-red-800">{ideasError}</p>}
      </div>)}
    {contact && <Link href="/contacts/next-steps" className="inline-flex min-h-11 items-center text-sm font-bold text-[#175cd3]">View all my next steps →</Link>}
  </section>
}

function NextStepCard({ step, due }: { step: NextStep; due: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState<'edit' | 'reschedule' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = contactDisplayName(step.display_name)
  async function clear() {
    setBusy(true); setError('')
    try {
      const { error } = await createClient().rpc('follow_up_next_step_clear', { p_id: step.id, p_version: step.version })
      if (error) throw new Error(error.message)
      nextStepsChanged(); router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not confirm the change. Refresh the list before trying again.') }
    finally { setBusy(false) }
  }
  return <article className={`rounded-[18px] border p-4 ${due ? 'border-[#fedf89] bg-[#fff8eb]' : 'border-[#e4e7ec] bg-white'}`}>
    <Link className="text-base font-extrabold text-[#00274c] underline" href={`/contacts/${step.contact_id}?from=${encodeURIComponent('/contacts/next-steps')}`}>{name}</Link>
    <p className="mt-1 text-xs font-semibold text-[#667085]">Planned for {dateLabel(step.due_at)}</p>
    {due && <h3 className="mt-3 font-extrabold text-[#92400e]">How did it go with {name}?</h3>}
    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#344054]">{step.action}</p>
    {editing ? <NextStepEditor contactId={step.contact_id} step={step} rescheduleOnly={editing === 'reschedule'} onClose={() => setEditing(null)} /> : <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <InteractionButton contactId={step.contact_id} contactName={name} currentStatus={step.contact_status} isPrimary={step.is_primary}
        nextStep={{ id: step.id, version: step.version, action: step.action }} label="Record an interaction" />
      <button type="button" disabled={busy} onClick={() => setEditing('reschedule')} className={button}>Reschedule</button>
      <button type="button" disabled={busy} onClick={() => setEditing('edit')} className={button}>Edit</button>
      <button type="button" disabled={busy} onClick={() => setConfirmClear(true)} className={button}>Clear the step</button>
    </div>}
    {confirmClear && <div className="mt-3 rounded-xl bg-white p-3 text-sm">
      <p>Clear this plan? Your contact and interaction history will stay unchanged.</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy} className={button} onClick={() => void clear()}>{busy ? 'Clearing…' : 'Clear step'}</button><button type="button" disabled={busy} className={button} onClick={() => setConfirmClear(false)}>Keep step</button></div>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error} <button type="button" onClick={nextStepsChanged} className="min-h-11 font-bold underline">Refresh list</button></p>}
  </article>
}

function NextStepEditor({ contactId, step, initialIdea, rescheduleOnly = false, onClose }: {
  contactId: string; step?: NextStep; initialIdea?: NextStepIdea; rescheduleOnly?: boolean; onClose: () => void
}) {
  const router = useRouter()
  const id = useRef<string | null>(step?.id ?? null)
  const [action, setAction] = useState(step?.action ?? initialIdea?.action ?? '')
  const [due, setDue] = useState(step ? localDateTime(step.due_at) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const suffix = step?.id ?? contactId
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const invalid = nextStepInputError(action, due)
    if (invalid) { setError(invalid); return }
    setBusy(true); setError('')
    try {
      id.current ??= crypto.randomUUID()
      const { error } = await createClient().rpc('follow_up_next_step_save', {
        p_id: id.current, p_contact: contactId, p_action: action.trim(), p_due: plannedInstant(due), p_version: step?.version ?? 0,
      })
      if (error) throw new Error(error.message)
      nextStepsChanged(); router.refresh(); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not confirm the save. Refresh the list before trying again.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="mt-3 space-y-3 rounded-xl border border-[#d0d5dd] bg-white p-4">
    {initialIdea && <p className="text-sm text-[#667085]">Suggested timing: {initialIdea.timing}. Choose the time that fits below.</p>}
    {!rescheduleOnly && <div><label htmlFor={`step-action-${suffix}`} className="text-sm font-bold text-[#344054]">My next step</label>
      <textarea autoFocus id={`step-action-${suffix}`} value={action} onChange={e => setAction(e.target.value)} required maxLength={500} rows={3} disabled={busy}
        className="mt-1 w-full rounded-xl border border-[#d0d5dd] p-3 text-sm" /></div>}
    <div><label htmlFor={`step-time-${suffix}`} className="text-sm font-bold text-[#344054]">When do you plan to take this step?</label>
      <input autoFocus={rescheduleOnly} id={`step-time-${suffix}`} type="datetime-local" required value={due} disabled={busy} onChange={e => setDue(e.target.value)}
        className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d0d5dd] p-3 text-sm" />
      <p className="mt-1 text-xs text-[#667085]">Choose a time using your device’s timezone. Afterward, we’ll ask how it went.</p></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex gap-2"><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[#00274c] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">{busy ? 'Saving…' : rescheduleOnly ? 'Reschedule' : 'Save next step'}</button>
      <button type="button" disabled={busy} className={button} onClick={onClose}>Cancel</button></div>
  </form>
}
