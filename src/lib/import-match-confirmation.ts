// Stable fingerprints preserve decisions only while the reviewed evidence agrees.
export function remainingImportCandidates<T extends { student_id: string; identity_conflict: boolean; phone_differs: boolean }>(candidates: T[], matchedStudentId: string | null | undefined): T[] {
  return candidates.filter(candidate => !matchedStudentId || candidate.student_id !== matchedStudentId || candidate.identity_conflict || candidate.phone_differs)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function weakConfirmationToken(campaign: string, row: unknown, choice: string | undefined, result: { candidate_count: number; status: string; candidates: { contact_id: string; identity_conflict: boolean; phone_differs: boolean }[] } | undefined) {
  if (!result || !result.candidate_count || !choice) return null
  const candidate = result.candidates[0]
  if (choice !== 'keep_separate' && (choice !== 'merge' || result.candidate_count !== 1 || !candidate?.contact_id || candidate.identity_conflict || candidate.phone_differs)) return null
  const prefix = choice === 'merge' ? `merge:${candidate.contact_id}` : 'keep_separate'
  return `${prefix}:${stable({ campaign, row, count: result.candidate_count, status: result.status, candidates: [...result.candidates].sort((a,b) => a.contact_id.localeCompare(b.contact_id)) })}`
}
