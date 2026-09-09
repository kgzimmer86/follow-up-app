'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validateTextAttempt, type PendingTextAttempt } from '@/lib/text-attempts'
import { TextPurposeFields } from './text-purpose-fields'

export default function TextAttemptDialog({ pending, onConfirm, onClose }: {
  pending: PendingTextAttempt; onConfirm: () => void; onClose: () => void
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [purposes, setPurposes] = useState<string[]>([])
  const [eventName, setEventName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const validation = validateTextAttempt(purposes, eventName, notes)
    if (validation) { setError(validation); return }
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      const { error: saveError } = await createClient().rpc('log_text_attempt', {
        p_event_id: pending.eventId,
        p_contact_id: pending.contact.id,
        p_purposes: purposes,
        p_event_name: purposes.includes('invite_event') ? eventName.trim() : null,
        p_notes: notes.trim() || null,
      })
      if (saveError) throw saveError
      onClose()
      router.refresh()
    } catch {
      setError('The text attempt could not be saved. Your note is still here; please try again.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="text-attempt-title" onCancel={(event) => {
      event.preventDefault()
      if (!submitting.current) onClose()
    }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[#15223a] shadow-2xl backdrop:bg-slate-950/50">
      <div className="flex items-start justify-between gap-4 border-b border-[#e4e7ec] px-5 py-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#175cd3]">Follow Up</p>
          <h2 id="text-attempt-title" className="mt-1 text-2xl font-extrabold">
            {pending.stage === 'confirm' ? 'Did you send the text?' : 'Log Text Attempt'}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#667085]">{pending.contact.name}</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close text attempt"
          className="rounded-full px-3 py-1 text-2xl text-[#98a2b3] hover:bg-[#f9fafb] disabled:opacity-50">×</button>
      </div>
      {pending.stage === 'confirm' ? (
        <div className="zoom-stack grid grid-cols-2 gap-3 p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#d0d5dd] px-3 py-3 text-sm font-extrabold">No</button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-[#00274c] px-3 py-3 text-sm font-extrabold text-white">Yes, log text</button>
        </div>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={saving} className="grid gap-5 p-5 disabled:opacity-75">
            <TextPurposeFields purposes={purposes} eventName={eventName} onChange={(values, name) => {
              setPurposes(values); setEventName(name)
            }} />
            <label className="grid gap-2 text-sm font-extrabold">
              Note (optional)
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000}
                placeholder="Asked about meeting Thursday afternoon…"
                className="w-full rounded-[11px] border border-[#d0d5dd] px-3 py-2.5 text-sm font-normal" />
            </label>
            {error && <p role="alert" className="rounded-xl bg-[#fef3f2] px-3 py-3 text-sm font-semibold text-[#b42318]">{error}</p>}
          </fieldset>
          <div className="sticky bottom-0 flex gap-3 border-t border-[#e4e7ec] bg-white p-5">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-[#d0d5dd] px-3 py-3 text-sm font-extrabold disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-[#00274c] px-3 py-3 text-sm font-extrabold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Text Attempt'}</button>
          </div>
        </form>
      )}
    </dialog>
  )
}
