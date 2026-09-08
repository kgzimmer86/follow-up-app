'use client'

import { LoadRecovery } from '@/components/follow-up/load-recovery'

export default function PageError({ retry }: { retry: () => void }) {
  // Page failures recover inside the verified app shell, keeping navigation.
  return <LoadRecovery onRetry={retry} />
}
