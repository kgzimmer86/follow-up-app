'use client'

import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(',')

const CLICK_FEEDBACK_MS = 900
const NAVIGATION_FALLBACK_MS = 8000

export function InteractionFeedback() {
  const pathname = usePathname()
  const [navigationPending, setNavigationPending] =
    useState(false)
  const navigationTimeoutRef =
    useRef<number | null>(null)

  useEffect(() => {
    setNavigationPending(false)

    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(
        navigationTimeoutRef.current
      )
      navigationTimeoutRef.current = null
    }
  }, [pathname])

  useEffect(() => {
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
       * Keep a visible "I received your tap" state
       * briefly after the pointer is released.
       */
      interactive.classList.remove(
        'app-click-acknowledged'
      )

      window.requestAnimationFrame(() => {
        interactive.classList.add(
          'app-click-acknowledged'
        )
      })

      window.setTimeout(() => {
        interactive.classList.remove(
          'app-click-acknowledged'
        )
      }, CLICK_FEEDBACK_MS)

      if (!(interactive instanceof HTMLAnchorElement)) {
        return
      }

      if (
        interactive.target === '_blank' ||
        interactive.hasAttribute('download')
      ) {
        return
      }

      let destination: URL

      try {
        destination = new URL(
          interactive.href,
          window.location.href
        )
      } catch {
        return
      }

      if (
        destination.origin !==
        window.location.origin
      ) {
        return
      }

      const current =
        new URL(window.location.href)

      if (
        destination.pathname ===
          current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash
      ) {
        return
      }

      setNavigationPending(true)

      if (
        navigationTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          navigationTimeoutRef.current
        )
      }

      navigationTimeoutRef.current =
        window.setTimeout(() => {
          setNavigationPending(false)
          navigationTimeoutRef.current = null
        }, NAVIGATION_FALLBACK_MS)
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

      if (
        navigationTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          navigationTimeoutRef.current
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
