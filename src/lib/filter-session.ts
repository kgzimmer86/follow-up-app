const contactLists = new Set([
  '/contacts', '/contacts/area', '/opportunities/go-back',
  '/opportunities/share-the-gospel', '/opportunities/meet-someone-new',
  '/opportunities/community-group', '/opportunities/no-address',
])

export function filterSessionUrl(href: string, defaults: Record<string, string>) {
  const url = new URL(href)
  if (!contactLists.has(url.pathname)) return null
  for (const key of ['campus', 'location', 'floor', 'wing', 'affinity']) {
    url.searchParams.delete(key)
    if (defaults[key] && (url.pathname !== '/opportunities/no-address' || key === 'affinity')) {
      url.searchParams.set(key, defaults[key])
    }
  }
  url.searchParams.delete('page')
  url.searchParams.set('context', '1')
  return `${url.pathname}?${url.searchParams.toString()}`
}
