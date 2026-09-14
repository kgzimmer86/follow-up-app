'use client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const Celebration = dynamic(() => import('./celebration-preview').then(m => m.Celebration), { ssr: false })
export function celebrationSaved() { window.dispatchEvent(new Event('received-christ-saved')) }

export function CelebrationListener() {
  const [item, setItem] = useState<{ id: string; firstName: string } | null>(null)
  const showing = useRef(false)
  const close = useCallback(() => { showing.current = false; setItem(null) }, [])
  useEffect(() => {
    let disposed = false, running = false, last = 0
    async function check(force = false) {
      if (disposed || running || showing.current || document.hidden || (!force && Date.now() - last < 30000)) return
      if (document.querySelector('[role="dialog"], dialog[open]')) return
      running = true; last = Date.now()
      try {
        const { data, error } = await createClient().rpc('take_received_christ_celebration')
        if (!disposed && !error && data && !document.hidden) { showing.current = true; setItem(data) }
      } catch { /* Celebrations never interrupt normal app use. */ }
      finally { running = false }
    }
    const normal = () => { void check() }
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    const saved = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => void check(true), 400) }
    const initial = setTimeout(normal, 2000)
    const interval = setInterval(normal, 60000)
    window.addEventListener('focus', normal)
    document.addEventListener('visibilitychange', normal)
    window.addEventListener('received-christ-saved', saved)
    return () => { disposed = true; clearTimeout(initial); clearTimeout(saveTimer); clearInterval(interval); window.removeEventListener('focus', normal); document.removeEventListener('visibilitychange', normal); window.removeEventListener('received-christ-saved', saved) }
  }, [])
  return item ? <Celebration key={item.id} firstName={item.firstName} onClose={close}/> : null
}
