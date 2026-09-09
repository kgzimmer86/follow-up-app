'use client'

import { createContext, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPhotoCleanupQueue, removeUnusedInteractionPhoto, type PhotoCleanupResult } from '@/lib/interaction-photo'

const PhotoCleanupContext = createContext<((path: string, checkOnly?: boolean) => Promise<PhotoCleanupResult>) | null>(null)
const emptyPaths: string[] = []
const serverSnapshot = () => emptyPaths

export function PhotoCleanupProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [queue] = useState(() => {
    let storage: Storage | null = null
    try { if (typeof window !== 'undefined') storage = window.localStorage } catch { /* Optional storage. */ }
    return createPhotoCleanupQueue(userId, storage)
  })
  const pending = useSyncExternalStore(queue.subscribe, queue.getSnapshot, serverSnapshot)
  const [busy, setBusy] = useState(false)
  const [later, setLater] = useState(false)
  const retrying = useRef(false)

  async function cleanupPhoto(path: string, checkOnly = false): Promise<PhotoCleanupResult> {
    let result: PhotoCleanupResult = 'pending'
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const client = createClient()
      const { data: { user }, error } = await client.auth.getUser()
      if (!error && user?.id === userId) result = await removeUnusedInteractionPhoto(client, path, checkOnly)
    } catch { /* Keep the file available for retry after a network failure. */ }
    if (result === 'pending') {
      queue.add(path)
      setLater(false)
    } else queue.remove(path)
    return result
  }

  async function retry() {
    if (retrying.current) return
    retrying.current = true
    setBusy(true)
    try {
      for (const path of queue.getSnapshot()) await cleanupPhoto(path)
    } finally {
      retrying.current = false
      setBusy(false)
    }
  }

  return (
    <PhotoCleanupContext.Provider value={cleanupPhoto}>
      {children}
      {pending.length > 0 && !later && (
        <aside role="alert" className="fixed bottom-24 left-4 right-4 z-[60] mx-auto max-w-lg rounded-[12px] border border-[#fecdca] bg-[#fef3f2] p-3 text-xs text-[#b42318] shadow-lg">
          <p className="font-extrabold">Photo removal needs another attempt.</p>
          <p className="mt-1">{pending.length === 1 ? 'One photo' : `${pending.length} photos`} could not be checked or removed. You can retry now or continue your other work.</p>
          <div className="mt-2 flex gap-4 font-extrabold">
            <button type="button" disabled={busy} onClick={retry} className="underline underline-offset-2 disabled:opacity-50">
              {busy ? 'Retrying…' : 'Retry photo removal'}
            </button>
            <button type="button" disabled={busy} onClick={() => setLater(true)} className="disabled:opacity-50">Later</button>
          </div>
        </aside>
      )}
    </PhotoCleanupContext.Provider>
  )
}

export function usePhotoCleanup() {
  const cleanup = useContext(PhotoCleanupContext)
  if (!cleanup) throw new Error('Photo cleanup requires an active app session.')
  return cleanup
}
