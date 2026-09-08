'use client'

import { textPurposes } from '@/lib/text-attempts'

export function TextPurposeFields({ purposes, eventName, onChange }: {
  purposes: string[]
  eventName: string
  onChange: (purposes: string[], eventName: string) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-extrabold text-[#15223a]">Text purpose</legend>
      <p className="mb-1 text-xs text-[#667085]">Choose all that apply.</p>
      {textPurposes.map((purpose) => (
        <label key={purpose.value} className="flex cursor-pointer items-center gap-3 rounded-[11px] border border-[#e4e7ec] bg-[#f9fafb] px-3 py-3 text-sm font-semibold text-[#344054]">
          <input type="checkbox" checked={purposes.includes(purpose.value)}
            onChange={(event) => onChange(event.target.checked
              ? [...purposes, purpose.value]
              : purposes.filter((value) => value !== purpose.value), eventName)}
            className="h-5 w-5 rounded border-[#d0d5dd]" />
          {purpose.label}
        </label>
      ))}
      {purposes.includes('invite_event') && (
        <label className="mt-1 grid gap-1.5 text-sm font-bold text-[#344054]">
          Event name
          <input value={eventName} onChange={(event) => onChange(purposes, event.target.value)}
            required maxLength={100} placeholder="Fall Getaway, Barn Bash…"
            className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-normal" />
        </label>
      )}
    </fieldset>
  )
}
