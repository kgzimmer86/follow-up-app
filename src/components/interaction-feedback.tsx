'use client'

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  usePathname,
  useSearchParams,
} from 'next/navigation'

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(',')

const CLICK_FEEDBACK_MS = 1400
const NAVIGATION_FALLBACK_MS = 8000
const SPECULATIVE_PROGRESS_DELAY_MS = 140
const SPECULATIVE_PROGRESS_MS = 900

export function InteractionFeedback() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="app-navigation-indicator"
        />
      }
    >
      <InteractionFeedbackInner />
    </Suspense>
  )
}

function InteractionFeedbackInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const routeKey =
    `${pathname}?${searchParams.toString()}`

  const [navigationPending, setNavigationPending] =
    useState(false)

  const navigationTimeoutRef =
    useRef<number | null>(null)

  const speculativeStartRef =
    useRef<number | null>(null)

  const speculativeStopRef =
    useRef<number | null>(null)

  const lastRouteKeyRef =
    useRef(routeKey)

  useEffect(() => {
    if (lastRouteKeyRef.current === routeKey) {
      return
    }

    lastRouteKeyRef.current = routeKey

    setNavigationPending(false)

    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(
        navigationTimeoutRef.current
      )
      navigationTimeoutRef.current = null
    }

    if (speculativeStartRef.current !== null) {
      window.clearTimeout(
        speculativeStartRef.current
      )
      speculativeStartRef.current = null
    }

    if (speculativeStopRef.current !== null) {
      window.clearTimeout(
        speculativeStopRef.current
      )
      speculativeStopRef.current = null
    }

    document
      .querySelectorAll(
        '.app-navigation-pending-control'
      )
      .forEach((element) => {
        element.classList.remove(
          'app-navigation-pending-control',
          'app-click-acknowledged'
        )
      })
  }, [routeKey])

  useEffect(() => {
    function clearNavigationFallback() {
      if (navigationTimeoutRef.current !== null) {
        window.clearTimeout(
          navigationTimeoutRef.current
        )
      }

      navigationTimeoutRef.current =
        window.setTimeout(() => {
          setNavigationPending(false)

          document
            .querySelectorAll(
              '.app-navigation-pending-control'
            )
            .forEach((element) => {
              element.classList.remove(
                'app-navigation-pending-control',
                'app-click-acknowledged'
              )
            })

          navigationTimeoutRef.current = null
        }, NAVIGATION_FALLBACK_MS)
    }

    function startConfirmedNavigation(
      interactive: HTMLElement
    ) {
      if (speculativeStartRef.current !== null) {
        window.clearTimeout(
          speculativeStartRef.current
        )
        speculativeStartRef.current = null
      }

      if (speculativeStopRef.current !== null) {
        window.clearTimeout(
          speculativeStopRef.current
        )
        speculativeStopRef.current = null
      }

      interactive.classList.add(
        'app-navigation-pending-control'
      )

      setNavigationPending(true)
      clearNavigationFallback()
    }

    function startSpeculativeProgress() {
      if (speculativeStartRef.current !== null) {
        window.clearTimeout(
          speculativeStartRef.current
        )
      }

      if (speculativeStopRef.current !== null) {
        window.clearTimeout(
          speculativeStopRef.current
        )
      }

      speculativeStartRef.current =
        window.setTimeout(() => {
          setNavigationPending(true)
          speculativeStartRef.current = null

          speculativeStopRef.current =
            window.setTimeout(() => {
              setNavigationPending(false)
              speculativeStopRef.current = null
            }, SPECULATIVE_PROGRESS_MS)
        }, SPECULATIVE_PROGRESS_DELAY_MS)
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0) return

      const eventTarget = event.target

      if (!(eventTarget instanceof Element)) {
        return
      }

      const interactive =
        eventTarget.closest<HTMLElement>(
          INTERACTIVE_SELECTOR
        )

      if (!interactive) return

      if (
        interactive.hasAttribute('disabled') ||
        interactive.getAttribute(
          'aria-disabled'
        ) === 'true'
      ) {
        return
      }

      /*
       * Immediate acknowledgement for every button/link.
       */
      interactive.classList.remove(
        'app-click-acknowledged'
      )

      window.requestAnimationFrame(() => {
        interactive.classList.add(
          'app-click-acknowledged'
        )
      })

      /*
       * Same-origin links are confirmed navigation immediately.
       * Query-string changes count too, which is important for
       * contact detail tabs.
       */
      if (interactive instanceof HTMLAnchorElement) {
        if (
          interactive.target === '_blank' ||
          interactive.hasAttribute('download')
        ) {
          window.setTimeout(() => {
            interactive.classList.remove(
              'app-click-acknowledged'
            )
          }, CLICK_FEEDBACK_MS)
          return
        }

        let destination: URL

        try {
          destination = new URL(
            interactive.href,
            window.location.href
          )
        } catch {
          window.setTimeout(() => {
            interactive.classList.remove(
              'app-click-acknowledged'
            )
          }, CLICK_FEEDBACK_MS)
          return
        }

        const current =
          new URL(window.location.href)

        if (
          destination.origin ===
            window.location.origin &&
          !(
            destination.pathname ===
              current.pathname &&
            destination.search ===
              current.search
          )
        ) {
          startConfirmedNavigation(
            interactive
          )
          return
        }

        window.setTimeout(() => {
          interactive.classList.remove(
            'app-click-acknowledged'
          )
        }, CLICK_FEEDBACK_MS)
        return
      }

      /*
       * Buttons can navigate through router.push(), submit a form,
       * open a modal, or perform an in-place action. There is no
       * browser-level way to know which one before its click handler
       * runs, so briefly start a global working indicator after a
       * small delay. If a route actually changes, the routeKey effect
       * above ends it as soon as the new route/query renders.
       */
      startSpeculativeProgress()

      window.setTimeout(() => {
        interactive.classList.remove(
          'app-click-acknowledged'
        )
      }, CLICK_FEEDBACK_MS)
    }

    document.addEventListener(
      'click',
      handleClick
    )

    return () => {
      document.removeEventListener(
        'click',
        handleClick
      )

      if (navigationTimeoutRef.current !== null) {
        window.clearTimeout(
          navigationTimeoutRef.current
        )
      }

      if (speculativeStartRef.current !== null) {
        window.clearTimeout(
          speculativeStartRef.current
        )
      }

      if (speculativeStopRef.current !== null) {
        window.clearTimeout(
          speculativeStopRef.current
        )
      }
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={[
        'app-navigation-indicator',
        navigationPending
          ? 'app-navigation-indicator-visible'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}
