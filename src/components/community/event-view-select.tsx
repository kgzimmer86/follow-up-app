'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function EventViewSelect({ label, value, options, placeholder }: {
  label: string
  value: string
  options: { value: string; label: string; href: string }[]
  placeholder?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <div aria-busy={pending}>
    <label className="block text-sm font-bold">{label}
      <select value={value} disabled={pending} onChange={(event) => {
        const option = options.find(option => option.value === event.target.value)
        if (option) startTransition(() => router.push(option.href, { scroll: false }))
      }} className="mt-1 min-h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-base disabled:opacity-60">
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    {pending && <p role="status" className="mt-1 text-xs text-[#667085]">Loading…</p>}
  </div>
}
