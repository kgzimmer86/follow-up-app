'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function MobileResultsPaginator({ page, pages, previous, next, children }: {
  page: number; pages: number; previous: string | null; next: string | null; children: ReactNode
}) {
  const regular = useRef<HTMLDivElement>(null)
  const floating = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [bottom, setBottom] = useState(88)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const bottomNav = document.querySelector<HTMLElement>('[data-mobile-bottom-nav]')
    let previousY = Math.max(0, window.scrollY), travel = 0, direction = 0
    let frame = 0
    function update() {
      frame = 0
      const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight))
      const delta = y - previousY
      previousY = y
      const height = bottomNav?.getBoundingClientRect().height ?? 80
      setBottom(height + 8)
      const rect = regular.current?.getBoundingClientRect()
      const regularVisible = rect && rect.top < window.innerHeight - height && rect.bottom > 0
      const results = document.getElementById('results')?.getBoundingClientRect()
      const outsideResults = results && results.top > window.innerHeight / 2
      if (!media.matches || y < 100 || regularVisible || outsideResults) {
        travel = 0; direction = 0; setVisible(false); return
      }
      if (delta === 0) return
      const currentDirection = Math.sign(delta)
      travel = currentDirection === direction ? travel + Math.abs(delta) : Math.abs(delta)
      direction = currentDirection
      if (travel >= 16) {
        // Do not remove keyboard focus from a pagination link mid-interaction.
        if (!floating.current?.contains(document.activeElement)) setVisible(direction < 0)
        travel = 0
      }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    if (bottomNav) observer.observe(bottomNav)
    if (regular.current) observer.observe(regular.current)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    media.addEventListener('change', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      media.removeEventListener('change', schedule)
    }
  }, [])
  const linkClass = 'inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-extrabold text-[#00274c] focus-visible:outline-2 focus-visible:outline-[#175cd3]'
  return <>
    <div ref={regular}>{children}</div>
    <nav ref={floating} aria-label="Mobile contact results pages" aria-hidden={!visible} inert={!visible}
      style={{ bottom }}
      className={`fixed inset-x-3 z-20 mx-auto flex max-w-sm items-center justify-between gap-1 rounded-2xl border border-[#d0d5dd] bg-white px-1.5 shadow-lg transition-[transform,opacity,visibility] duration-200 motion-reduce:transition-none md:hidden ${visible ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-4 opacity-0 pointer-events-none'}`}>
      {previous ? <Link prefetch={false} href={previous} className={linkClass}>← Previous</Link> : <span aria-disabled="true" className={`${linkClass} opacity-40`}>← Previous</span>}
      <span className="text-center text-xs font-bold text-[#475467]">Page {page} of {pages}</span>
      {next ? <Link prefetch={false} href={next} className={linkClass}>Next →</Link> : <span aria-disabled="true" className={`${linkClass} opacity-40`}>Next →</span>}
    </nav>
  </>
}
