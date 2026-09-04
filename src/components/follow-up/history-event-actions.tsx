'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type HistoryEvent = {
  id: string
  performed_by: string | null
  performerName?: string
  event_type: string
  occurred_at: string
  notes: string | null
  had_spiritual_conversation: boolean
  interview_completed: boolean
  kgp_shared: boolean
  received_christ: boolean
  invited_to_community_group: boolean
}

type Stage = 'idle' | 'edit' | 'review' | 'delete'

type Draft = {
  occurredAt: string
  notes: string
  hadSpiritualConversation: boolean
  interviewCompleted: boolean
  kgpShared: boolean
  receivedChrist: boolean
  invitedToCommunityGroup: boolean
}

function HistoryEventActions({
  event,
  canEdit,
  currentUserId,
  primaryOwnerId,
  primaryOwnerName,
}: {
  event: HistoryEvent
  canEdit: boolean
  currentUserId: string
  primaryOwnerId: string | null
  primaryOwnerName: string | null
}) {
  const router = useRouter()
  const isKnock = event.event_type === 'knock'

  const deletingPrimaryInteraction =
    !isKnock &&
    Boolean(event.performed_by) &&
    event.performed_by === primaryOwnerId

  const primaryIsCurrentUser =
    primaryOwnerId === currentUserId

  const primaryLabel =
    primaryOwnerName ||
    event.performerName ||
    'the current primary person'

  const original = useMemo(
    () => draftFromEvent(event),
    [event]
  )

  const [stage, setStage] = useState<Stage>('idle')
  const [draft, setDraft] = useState<Draft>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignmentChoice, setAssignmentChoice] = useState<
    'keep' | 'unassign' | null
  >(null)

  const changes = useMemo(
    () => buildChanges(original, draft, isKnock),
    [original, draft, isKnock]
  )

  if (!canEdit) {
    return null
  }

  function beginEdit() {
    setDraft(original)
    setError(null)
    setStage('edit')
  }

  function cancel() {
    setDraft(original)
    setError(null)
    setAssignmentChoice(null)
    setStage('idle')
  }

  function reviewEdit() {
    setError(null)

    if (!draft.occurredAt) {
      setError('Choose a date and time.')
      return
    }

    if (changes.length === 0) {
      setError('Nothing has changed yet.')
      return
    }

    setStage('review')
  }

  async function confirmEdit() {
    setSaving(true)
    setError(null)

    const parsedDate = new Date(draft.occurredAt)

    if (Number.isNaN(parsedDate.getTime())) {
      setError('Choose a valid date and time.')
      setSaving(false)
      return
    }

    const supabase = createClient()

    const { error: updateError } = await supabase.rpc(
      'update_follow_up_event',
      {
        p_event_id: event.id,
        p_occurred_at: parsedDate.toISOString(),
        p_notes: draft.notes.trim() || null,
        p_had_spiritual_conversation:
          isKnock ? false : draft.hadSpiritualConversation,
        p_interview_completed:
          isKnock ? false : draft.interviewCompleted,
        p_kgp_shared:
          isKnock ? false : draft.kgpShared,
        p_received_christ:
          isKnock ? false : draft.receivedChrist,
        p_invited_to_community_group:
          isKnock ? false : draft.invitedToCommunityGroup,
      }
    )

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setStage('idle')
    router.refresh()
  }

  async function confirmDelete() {
    if (
      deletingPrimaryInteraction &&
      assignmentChoice === null
    ) {
      setError(
        'Choose whether the primary assignment should stay or move to Unassigned.'
      )
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()

    const { error: deleteError } = await supabase.rpc(
      'delete_follow_up_event',
      {
        p_event_id: event.id,
        p_unassign_primary:
          deletingPrimaryInteraction &&
          assignmentChoice === 'unassign',
      }
    )

    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setAssignmentChoice(null)
    setStage('idle')
    router.refresh()
  }

  return (
    <div className="mt-3 border-t border-[#e4e7ec] pt-3">
      {stage === 'idle' && (
        <div className="flex gap-3 text-xs font-extrabold">
          <button
            type="button"
            onClick={beginEdit}
            className="text-[#175cd3] hover:underline"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null)
              setAssignmentChoice(null)
              setStage('delete')
            }}
            className="text-[#b42318] hover:underline"
          >
            Delete
          </button>
        </div>
      )}

      {stage === 'edit' && (
        <div className="rounded-[12px] bg-white p-3 shadow-sm ring-1 ring-[#e4e7ec]">
          <div className="text-xs font-extrabold text-[#15223a]">
            Edit {isKnock ? 'knock' : 'interaction'}
          </div>

          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                Date & time
              </span>

              <input
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(changeEvent) =>
                  setDraft((current) => ({
                    ...current,
                    occurredAt: changeEvent.target.value,
                  }))
                }
                className="rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#15223a] outline-none focus:border-[#175cd3]"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                Notes
              </span>

              <textarea
                value={draft.notes}
                onChange={(changeEvent) =>
                  setDraft((current) => ({
                    ...current,
                    notes: changeEvent.target.value,
                  }))
                }
                rows={4}
                placeholder={
                  isKnock
                    ? 'Optional note about the knock...'
                    : 'Add or correct interaction notes...'
                }
                className="resize-y rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2 text-sm leading-6 text-[#15223a] outline-none focus:border-[#175cd3]"
              />
            </label>

            {!isKnock && (
              <div className="grid gap-2 rounded-[11px] bg-[#f9fafb] p-3">
                <CheckRow
                  label="Spiritual conversation"
                  checked={draft.hadSpiritualConversation}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      hadSpiritualConversation: checked,
                    }))
                  }
                />

                <CheckRow
                  label="Interview completed"
                  checked={draft.interviewCompleted}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      interviewCompleted: checked,
                    }))
                  }
                />

                <CheckRow
                  label="KGP shared"
                  checked={draft.kgpShared}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      kgpShared: checked,
                    }))
                  }
                />

                <CheckRow
                  label="Invited to Community Group"
                  checked={draft.invitedToCommunityGroup}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      invitedToCommunityGroup: checked,
                    }))
                  }
                />

                <CheckRow
                  label="Received Christ"
                  checked={draft.receivedChrist}
                  onChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      receivedChrist: checked,
                    }))
                  }
                />
              </div>
            )}
          </div>

          {error && <ErrorBox message={error} />}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={reviewEdit}
              className="rounded-[10px] bg-[#00274c] px-3 py-2.5 text-xs font-extrabold text-white"
            >
              Review Changes
            </button>
          </div>
        </div>
      )}

      {stage === 'review' && (
        <div className="rounded-[12px] border border-[#fedf89] bg-[#fff8eb] p-3">
          <div className="text-sm font-extrabold text-[#15223a]">
            Confirm {isKnock ? 'knock' : 'interaction'} changes
          </div>

          <p className="mt-1 text-xs leading-5 text-[#667085]">
            These changes update this history entry and every statistic or coaching view that is calculated from it.
          </p>

          <div className="mt-3 divide-y divide-[#f2d9a1] rounded-[10px] bg-white px-3 ring-1 ring-[#f2d9a1]">
            {changes.map((change) => (
              <div key={change.label} className="py-2.5">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                  {change.label}
                </div>
                <div className="mt-1 text-xs text-[#475467]">
                  <span className="line-through opacity-70">
                    {change.before}
                  </span>
                  <span className="mx-1.5">→</span>
                  <strong className="text-[#15223a]">{change.after}</strong>
                </div>
              </div>
            ))}
          </div>

          {error && <ErrorBox message={error} />}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setError(null)
                setStage('edit')
              }}
              className="rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467] disabled:opacity-50"
            >
              Back to Edit
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={confirmEdit}
              className="rounded-[10px] bg-[#00274c] px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm Changes'}
            </button>
          </div>
        </div>
      )}

      {stage === 'delete' && (
        <div className="rounded-[12px] border border-[#fecdca] bg-[#fef3f2] p-3">
          <div className="text-sm font-extrabold text-[#b42318]">
            Delete this {isKnock ? 'knock' : 'interaction'}?
          </div>

          <p className="mt-1 text-xs leading-5 text-[#667085]">
            This permanently removes the history entry and updates related stats,
            coaching views, and progress markers. If only knocks remain, status
            becomes Attempted Contact. If no knocks or interactions remain, status
            becomes Uncontacted.
          </p>

          {deletingPrimaryInteraction && (
            <div className="mt-3 rounded-[10px] border border-[#f2c7c3] bg-white p-3">
              <div className="text-xs font-extrabold text-[#15223a]">
                What should happen to the primary assignment?
              </div>

              <p className="mt-1 text-[11px] leading-5 text-[#667085]">
                {primaryIsCurrentUser
                  ? 'You are currently the primary follow-up person for this contact.'
                  : `${primaryLabel} is currently the primary follow-up person and recorded this interaction.`}
              </p>

              <div className="mt-2 grid gap-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-[9px] border border-[#e4e7ec] p-2.5">
                  <input
                    type="radio"
                    name={`delete-assignment-${event.id}`}
                    checked={assignmentChoice === 'keep'}
                    onChange={() => setAssignmentChoice('keep')}
                    className="mt-0.5 h-4 w-4"
                  />

                  <span>
                    <span className="block text-xs font-extrabold text-[#344054]">
                      {primaryIsCurrentUser
                        ? 'Keep me as primary'
                        : `Keep ${primaryLabel} assigned`}
                    </span>

                    <span className="mt-0.5 block text-[11px] leading-4 text-[#667085]">
                      The contact stays assigned and remains in the current primary
                      person&apos;s My Contacts.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-2 rounded-[9px] border border-[#e4e7ec] p-2.5">
                  <input
                    type="radio"
                    name={`delete-assignment-${event.id}`}
                    checked={assignmentChoice === 'unassign'}
                    onChange={() => setAssignmentChoice('unassign')}
                    className="mt-0.5 h-4 w-4"
                  />

                  <span>
                    <span className="block text-xs font-extrabold text-[#344054]">
                      Move contact to Unassigned
                    </span>

                    <span className="mt-0.5 block text-[11px] leading-4 text-[#667085]">
                      Primary ownership is cleared so the contact can be assigned
                      again.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {error && <ErrorBox message={error} />}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={cancel}
              className="rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467] disabled:opacity-50"
            >
              Keep It
            </button>

            <button
              type="button"
              disabled={
                saving ||
                (deletingPrimaryInteraction &&
                  assignmentChoice === null)
              }
              onClick={confirmDelete}
              className="rounded-[10px] bg-[#b42318] px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
            >
              {saving ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-[#344054]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-[#d0d5dd]"
      />
      <span>{label}</span>
    </label>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-[10px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2.5 text-xs font-bold text-[#b42318]"
    >
      {message}
    </div>
  )
}

function draftFromEvent(event: HistoryEvent): Draft {
  return {
    occurredAt: toLocalDateTimeValue(event.occurred_at),
    notes: event.notes ?? '',
    hadSpiritualConversation: Boolean(event.had_spiritual_conversation),
    interviewCompleted: Boolean(event.interview_completed),
    kgpShared: Boolean(event.kgp_shared),
    receivedChrist: Boolean(event.received_christ),
    invitedToCommunityGroup: Boolean(event.invited_to_community_group),
  }
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (number: number) => String(number).padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

function buildChanges(
  original: Draft,
  draft: Draft,
  isKnock: boolean
) {
  const changes: Array<{
    label: string
    before: string
    after: string
  }> = []

  const push = (
    label: string,
    before: string | boolean,
    after: string | boolean
  ) => {
    if (before === after) {
      return
    }

    changes.push({
      label,
      before: displayChangeValue(before),
      after: displayChangeValue(after),
    })
  }

  push(
    'Date & time',
    displayLocalDateTime(original.occurredAt),
    displayLocalDateTime(draft.occurredAt)
  )
  push('Notes', original.notes.trim(), draft.notes.trim())

  if (!isKnock) {
    push(
      'Spiritual conversation',
      original.hadSpiritualConversation,
      draft.hadSpiritualConversation
    )
    push(
      'Interview completed',
      original.interviewCompleted,
      draft.interviewCompleted
    )
    push('KGP shared', original.kgpShared, draft.kgpShared)
    push(
      'Invited to Community Group',
      original.invitedToCommunityGroup,
      draft.invitedToCommunityGroup
    )
    push(
      'Received Christ',
      original.receivedChrist,
      draft.receivedChrist
    )
  }

  return changes
}

function displayChangeValue(value: string | boolean) {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return value || 'None'
}

function displayLocalDateTime(value: string) {
  if (!value) {
    return 'None'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}


export { HistoryEventActions }
