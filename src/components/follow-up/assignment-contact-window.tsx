'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Keep ordinary document scrolling and variable-height cards. Empty sections
// retain their last measured height, but contain no native form controls.
export function AssignmentContactWindow({ children, count, first }: {
  children: ReactNode
  count: number
  first: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const near = useRef(first)
  const [height, setHeight] = useState(count * 360)
  const [visible, setVisible] = useState(first)

  useEffect(() => {
    const element = root.current
    if (!element) return
    const update = () => setVisible(
      near.current || element.contains(document.activeElement)
    )
    const observer = new IntersectionObserver(([entry]) => {
      near.current = entry.isIntersecting
      update()
    }, { rootMargin: '1000px 0px' })
    observer.observe(element)
    // Never unmount a focused checkbox, link, or open native picker.
    const blur = () => queueMicrotask(update)
    element.addEventListener('focusout', blur)
    return () => {
      observer.disconnect()
      element.removeEventListener('focusout', blur)
    }
  }, [])

  useEffect(() => {
    const element = root.current
    if (!element || !visible) return
    const measure = () => {
      setHeight(element.getBoundingClientRect().height)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div
      ref={root}
      className="grid gap-3"
      style={visible ? undefined : { height }}
      // A keyboard user can enter a not-yet-mounted section without skipping it.
      tabIndex={visible ? undefined : 0}
      aria-label={visible ? undefined : 'More contacts'}
      onFocus={(event) => {
        if (event.target !== event.currentTarget || visible) return
        const previous = event.relatedTarget
        const backwards = previous instanceof Node && Boolean(
          event.currentTarget.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING
        )
        setVisible(true)
        requestAnimationFrame(() => {
          const controls = root.current?.querySelectorAll<HTMLElement>(
            'input:not(:disabled), a[href], select:not(:disabled), button:not(:disabled)'
          )
          if (controls?.length) controls[backwards ? controls.length - 1 : 0].focus()
        })
      }}
    >
      {visible ? children : null}
    </div>
  )
}
