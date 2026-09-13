export function communityContext(pathname: string, from: string | null): boolean {
  if (pathname === '/community' || pathname.startsWith('/community/')) return true
  if (!pathname.startsWith('/contacts/') || !from?.startsWith('/') || from.startsWith('//')) return false
  const returnPath = from.split('?')[0]
  return returnPath === '/community' || returnPath.startsWith('/community/')
}
