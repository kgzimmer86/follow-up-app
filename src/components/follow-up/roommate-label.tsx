import Link from 'next/link'
import { Fragment } from 'react'
import type { RoommateSource } from '@/lib/roommate-provenance'

export function RoommateLabel({ source, returnTo }: { source?: RoommateSource[]; returnTo: string }) {
  if (!source?.length) return null
  return <p className="mt-1 break-words text-[11px] text-[#667085]">Roommate of {source.map((person, index) => (
    <Fragment key={person.id}>
      {index > 0 ? ', ' : ''}
      <Link href={`/contacts/${person.id}?from=${encodeURIComponent(returnTo)}`} className="font-semibold text-[#175cd3] hover:underline">{person.name}</Link>
    </Fragment>
  ))}</p>
}
