'use client'

import { createContext, Suspense, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { AppLoading } from './app-loading'

const StartupContext = createContext({ ready: false, complete: () => {} })

// Lives outside the runtime Suspense boundary: refreshes must not reset launch.
// A new document gets a new launch; navigation and background/resume do not.
export function AppStartup({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const complete = useCallback(() => setReady(true), [])
  return <StartupContext.Provider value={{ ready, complete }}>
    <Suspense fallback={<AppStartupFallback />}>{children}</Suspense>
  </StartupContext.Provider>
}

export function AppStartupFallback() {
  const { ready } = useContext(StartupContext)
  if (!ready) return <div className="fixed inset-0 z-[100] overflow-auto bg-[#f7f8fb]" data-app-startup>
    <AppLoading />
  </div>
  return <div role="status" aria-label="Loading page" className="min-h-[60vh]">
    <div aria-hidden="true" className="app-navigation-indicator app-navigation-indicator-visible" />
    <span className="sr-only">Loading page…</span>
  </div>
}

// Place inside the page boundary, not around the shell: a shell alone isn't ready.
export function AppStartupReady({ children }: { children: ReactNode }) {
  const { complete } = useContext(StartupContext)
  useLayoutEffect(() => { complete() }, [complete])
  return children
}
