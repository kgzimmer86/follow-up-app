// One observer for the whole assignment list, not one observer per contact.
const listeners = new Map<Element, (near: boolean) => void>()
let observer: IntersectionObserver | undefined

export function observeAssignmentSelect(element: Element, listener: (near: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    listener(true)
    return () => {}
  }
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting)
  }, { rootMargin: '800px 0px' })
  listeners.set(element, listener)
  observer.observe(element)
  return () => {
    listeners.delete(element)
    observer?.unobserve(element)
    if (!listeners.size) { observer?.disconnect(); observer = undefined }
  }
}
