'use client'

import dynamic from 'next/dynamic'
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createTextAttemptSession } from '@/lib/text-attempts'

const TextAttemptDialog = dynamic(() => import('./text-attempt-dialog'))


const TextSessionContext = createContext<ReturnType<typeof createTextAttemptSession> | null>(null)
const serverSnapshot = () => null

export function TextAttemptSession({ userId, children }: { userId: string; children: ReactNode }) {
  const [session] = useState(() => {
    let storage: Storage | null = null
    try { if (typeof window !== 'undefined') storage = window.sessionStorage } catch { /* Optional storage. */ }
    return createTextAttemptSession(userId, storage)
  })
  const pending = useSyncExternalStore(session.subscribe, session.getSnapshot, serverSnapshot)

  useEffect(() => {
    function visibilityChanged() {
      if (document.visibilityState === 'hidden') session.leave()
      else session.resume()
    }
    function returned() { if (document.visibilityState === 'visible') session.resume() }
    document.addEventListener('visibilitychange', visibilityChanged)
    window.addEventListener('blur', session.leave)
    window.addEventListener('focus', returned)
    window.addEventListener('pagehide', session.leave)
    window.addEventListener('pageshow', returned)
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('blur', session.leave)
      window.removeEventListener('focus', returned)
      window.removeEventListener('pagehide', session.leave)
      window.removeEventListener('pageshow', returned)
    }
  }, [session])

  return (
    <TextSessionContext.Provider value={session}>
      {children}
      {pending && pending.stage !== 'waiting' && (
        <TextAttemptDialog key={pending.eventId} pending={pending}
          onConfirm={session.confirm} onClose={session.dismiss} />
      )}
    </TextSessionContext.Provider>
  )
}

export function ContactTextLink({ contactId, contactName, href, className, children }: {
  contactId: string; contactName: string; href: string; className: string; children: ReactNode
}) {
  const session = useContext(TextSessionContext)
  return <a href={href} className={className} onClick={(event) => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      session?.begin({ id: contactId, name: contactName }, 'waiting')
    }
  }}>{children}</a>
}

export function AddTextAttemptButton({ contactId, contactName }: { contactId: string; contactName: string }) {
  const session = useContext(TextSessionContext)
  return (
    <button type="button" onClick={() => session?.begin({ id: contactId, name: contactName }, 'form')}
      className="w-full rounded-[11px] border border-[#b2ddff] bg-[#eff8ff] px-3 py-2.5 text-sm font-extrabold text-[#175cd3] transition hover:bg-[#dff1ff]">
      + Text Attempt
    </button>
  )
}
