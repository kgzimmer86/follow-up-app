'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CommunityEvent } from '@/lib/community-events'
import { inputClass, buttonClass, secondaryButtonClass } from './group-controls'

export function EventEditor({ campaignId, starts, ends, event }: { campaignId: string; starts: string; ends: string; event?: CommunityEvent }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true); setError('')
    try {
      const { error } = await createClient().rpc('community_save_event', {
        p_campaign_id: campaignId, p_event_id: event?.id ?? null, p_name: form.get('name'),
        p_event_date: form.get('date'), p_location: form.get('location'), p_details: form.get('details'),
        p_is_open: form.get('is_open') === 'on', p_revision: event?.revision ?? 0,
      })
      if (error) throw new Error(error.message)
      setOpen(false); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this event.') }
    finally { setBusy(false) }
  }
  return <div className="mt-4">
    <button type="button" disabled={busy} className={event ? secondaryButtonClass : buttonClass} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Cancel' : event ? 'Edit event' : '+ Create campaign event'}</button>
    {open && <form onSubmit={save} className="mt-3 rounded-2xl border border-[#e4e7ec] bg-white p-4">
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm font-bold">Event name<input name="name" required maxLength={120} defaultValue={event?.name} className={inputClass}/></label>
        <label className="block text-sm font-bold">Date<input name="date" type="date" required min={starts} max={ends} defaultValue={event?.event_date} className={inputClass}/></label>
        <label className="block text-sm font-bold">Location (optional)<input name="location" maxLength={240} defaultValue={event?.location} className={inputClass}/></label>
        <label className="block text-sm font-bold">Details (optional)<textarea name="details" maxLength={2000} rows={3} defaultValue={event?.details} className={inputClass}/></label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" name="is_open" defaultChecked={event?.is_open ?? true} className="h-5 w-5"/>Open for invitation updates</label>
        <p className="text-xs text-[#667085]">Closing updates keeps all recorded responses. This event is shared across the whole campaign.</p>
        <button className={buttonClass}>{busy ? 'Saving…' : 'Save event'}</button>
      </fieldset>
      {error && <p role="alert" className="mt-3 rounded-2xl border border-[#fedf89] bg-[#fff8eb] p-3 text-sm text-[#b54708]">{error}</p>}
    </form>}
  </div>
}
