'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function ContactNameSearch({ href, query }: { href: string; query: string }) {
  const router = useRouter()
  const [value, setValue] = useState(query)
  const [pending, startTransition] = useTransition()

  function search(name: string) {
    const url = new URL(href, window.location.origin)
    url.searchParams.delete('page')
    const trimmed = name.trim().slice(0, 200)
    if (trimmed) url.searchParams.set('q', trimmed)
    else url.searchParams.delete('q')
    startTransition(() => router.replace(`${url.pathname}?${url.searchParams}`, { scroll: false }))
  }

  return (
    <form className="mt-5 rounded-[18px] border border-[#e4e7ec] bg-white p-4"
      onSubmit={(event) => { event.preventDefault(); search(value) }} aria-busy={pending}>
      <label htmlFor="contact-name-search" className="mb-2 block text-sm font-extrabold text-[#15223a]">Search contacts by name</label>
      <div className="flex flex-wrap gap-2">
        <input id="contact-name-search" type="search" value={value} maxLength={200} disabled={pending}
          onChange={(event) => setValue(event.target.value)} placeholder="Enter a name…"
          className="min-w-0 flex-1 rounded-[12px] border border-[#d0d5dd] px-3.5 py-2.5 text-base text-[#15223a] outline-none focus:border-[#175cd3]" />
        <button type="submit" disabled={pending} className="rounded-[12px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{pending ? 'Searching…' : 'Search'}</button>
        {(query || value) && <button type="button" disabled={pending} onClick={() => { setValue(''); search('') }} className="px-2 text-sm font-bold text-[#175cd3] disabled:opacity-50">Clear</button>}
      </div>
      <p role="status" className="mt-2 text-xs text-[#667085]">{pending ? 'Searching all matching contacts…' : 'Searches all pages within your current area and filters.'}</p>
    </form>
  )
}
