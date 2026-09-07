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
const NAVIGATION_PROGRESS_DELAY_MS = 350

const MANAGE_TAB_PATHS = new Set([
  '/manage',
  '/manage/leaders',
  '/assign-contacts',
  '/manage/import-survey',
  '/admin/users',
])

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

  const progressStartRef =
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

    if (progressStartRef.current !== null) {
      window.clearTimeout(
        progressStartRef.current
      )
      progressStartRef.current = null
    }

    clearPendingVisuals()
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

          if (progressStartRef.current !== null) {
            window.clearTimeout(
              progressStartRef.current
            )
            progressStartRef.current = null
          }

          clearPendingVisuals()
          navigationTimeoutRef.current = null
        }, NAVIGATION_FALLBACK_MS)
    }

    function scheduleNavigationProgress() {
      if (progressStartRef.current !== null) {
        window.clearTimeout(
          progressStartRef.current
        )
      }

      progressStartRef.current =
        window.setTimeout(() => {
          setNavigationPending(true)
          progressStartRef.current = null
        }, NAVIGATION_PROGRESS_DELAY_MS)
    }

    function startConfirmedNavigation(
      interactive: HTMLAnchorElement,
      destination: URL
    ) {
      interactive.classList.add(
        'app-navigation-pending-control'
      )

      if (isStrongTabNavigation(interactive)) {
        interactive.classList.add(
          'app-navigation-pending-tab'
        )
      }

      if (
        destination.pathname.startsWith(
          '/contacts/'
        )
      ) {
        const contactCard =
          interactive.closest<HTMLElement>(
            'article[id^="contact-"]'
          )

        contactCard?.classList.add(
          'app-click-acknowledged-card'
        )
      }

      scheduleNavigationProgress()
      clearNavigationFallback()
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

      interactive.classList.remove(
        'app-click-acknowledged'
      )

      window.requestAnimationFrame(() => {
        interactive.classList.add(
          'app-click-acknowledged'
        )
      })

      if (interactive instanceof HTMLAnchorElement) {
        if (
          interactive.target === '_blank' ||
          interactive.hasAttribute('download')
        ) {
          removeClickAcknowledgementLater(
            interactive
          )
          return
        }

        let destination: URL

        try {
          destination = new URL(
            interactive.href,
            window.location.href
          )
        } catch {
          removeClickAcknowledgementLater(
            interactive
          )
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
            interactive,
            destination
          )
          return
        }

        removeClickAcknowledgementLater(
          interactive
        )
        return
      }

      removeClickAcknowledgementLater(
        interactive
      )
    }

    document.addEventListener(
      'click',
      handleClick,
      true
    )

    return () => {
      document.removeEventListener(
        'click',
        handleClick,
        true
      )

      if (navigationTimeoutRef.current !== null) {
        window.clearTimeout(
          navigationTimeoutRef.current
        )
      }

      if (progressStartRef.current !== null) {
        window.clearTimeout(
          progressStartRef.current
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

function removeClickAcknowledgementLater(
  interactive: HTMLElement
) {
  window.setTimeout(() => {
    interactive.classList.remove(
      'app-click-acknowledged'
    )
  }, CLICK_FEEDBACK_MS)
}

function clearPendingVisuals() {
  document
    .querySelectorAll(
      [
        '.app-navigation-pending-control',
        '.app-navigation-pending-tab',
        '.app-click-acknowledged',
        '.app-click-acknowledged-card',
      ].join(',')
    )
    .forEach((element) => {
      element.classList.remove(
        'app-navigation-pending-control',
        'app-navigation-pending-tab',
        'app-click-acknowledged',
        'app-click-acknowledged-card'
      )
    })
}

function isStrongTabNavigation(
  interactive: HTMLAnchorElement
) {
  const nav = interactive.closest('nav')

  if (!nav) return false

  const navLinks = Array.from(
    nav.querySelectorAll<HTMLAnchorElement>(
      'a[href]'
    )
  )

  const contactTabLinks =
    navLinks.filter((link) => {
      try {
        const url = new URL(
          link.href,
          window.location.href
        )

        return (
          url.pathname.startsWith(
            '/contacts/'
          ) &&
          url.searchParams.has('tab')
        )
      } catch {
        return false
      }
    })

  if (contactTabLinks.length >= 2) {
    return true
  }

  const manageTabLinks =
    navLinks.filter((link) => {
      try {
        const url = new URL(
          link.href,
          window.location.href
        )

        return MANAGE_TAB_PATHS.has(
          url.pathname
        )
      } catch {
        return false
      }
    })

  return manageTabLinks.length >= 2
}
