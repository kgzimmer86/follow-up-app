'use client'

import { useState, type FormEvent } from 'react'
import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type InteractionButtonProps = {
  contactId: string
  contactName: string
  currentStatus: string
  isPrimary: boolean
  autoOpen?: boolean
}

export function InteractionButton({
  contactId,
  contactName,
  currentStatus,
  isPrimary,
  autoOpen = false,
}: InteractionButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(autoOpen)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  )
  const [statusError, setStatusError] = useState(false)

  const needsStatusChange = currentStatus === 'uncontacted'

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)

    const statusAfter = String(
      formData.get('statusAfter') ?? ''
    )

    if (needsStatusChange && !statusAfter) {
      setStatusError(true)
      setErrorMessage(
        'Choose a new status before saving this first interaction.'
      )
      return
    }

    setSaving(true)
    setStatusError(false)
    setErrorMessage(null)

    const notes = String(formData.get('notes') ?? '').trim()

    const supabase = createClient()

    const { error } = await supabase.rpc(
      'log_interaction',
      {
        p_contact_id: contactId,
        p_notes: notes || null,
        p_had_spiritual_conversation:
          formData.get('hadSpiritual') === 'on',
        p_interview_completed:
          formData.get('interviewCompleted') === 'on',
        p_kgp_shared:
          formData.get('kgpShared') === 'on',
        p_received_christ:
          formData.get('receivedChrist') === 'on',
        p_invited_to_community_group:
          formData.get('invitedToCg') === 'on',
        p_status_after: statusAfter || null,
        p_make_primary:
          formData.get('makePrimary') === 'on',
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    form.reset()
    setSaving(false)
    setStatusError(false)
    setOpen(false)

    if (searchParams.has('interaction')) {
      const nextParams =
        new URLSearchParams(
          searchParams.toString()
        )

      nextParams.delete('interaction')

      const query =
        nextParams.toString()

      router.replace(
        query
          ? `${pathname}?${query}`
          : pathname,
        {
          scroll: false,
        }
      )
    } else {
      router.refresh()
    }
  }

  function closeForm() {
    setErrorMessage(null)
    setStatusError(false)
    setOpen(false)

    if (searchParams.has('interaction')) {
      const nextParams =
        new URLSearchParams(
          searchParams.toString()
        )

      nextParams.delete('interaction')

      const query =
        nextParams.toString()

      router.replace(
        query
          ? `${pathname}?${query}`
          : pathname,
        {
          scroll: false,
        }
      )
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMessage(null)
          setStatusError(false)
          setOpen(true)
        }}
        className="w-full rounded-xl bg-blue-950 px-3 py-2.5 text-sm font-extrabold text-white hover:bg-blue-900"
      >
        + Interaction
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">
                    Follow Up
                  </p>

                  <h2 className="mt-1 text-2xl font-extrabold text-slate-950">
                    Add Interaction
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {contactName}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={closeForm}
                  className="rounded-full px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close interaction form"
                >
                  ×
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-6 p-5">
                <div>
                  <label
                    htmlFor={`notes-${contactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    Notes
                  </label>

                  <p className="mt-1 text-xs text-slate-500">
                    What happened in the conversation?
                  </p>

                  <textarea
                    id={`notes-${contactId}`}
                    name="notes"
                    rows={4}
                    placeholder="Add helpful notes for future follow up..."
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <div className="text-sm font-extrabold text-slate-800">
                    What happened?
                  </div>

                  <div className="mt-3 space-y-2">
                    <CheckOption
                      name="hadSpiritual"
                      label="Had a spiritual conversation"
                    />

                    <CheckOption
                      name="interviewCompleted"
                      label="Did interview / survey"
                    />

                    <CheckOption
                      name="kgpShared"
                      label="Shared KGP"
                    />

                    <CheckOption
                      name="invitedToCg"
                      label="Invited to Bible study / Community Group"
                    />

                    <CheckOption
                      name="receivedChrist"
                      label="Received Christ"
                      emphasize
                    />
                  </div>
                </div>

                <div
                  className={[
                    'rounded-2xl border p-3 transition-colors',
                    statusError
                      ? 'border-red-400 bg-red-50'
                      : 'border-transparent',
                  ].join(' ')}
                >
                  <label
                    htmlFor={`status-${contactId}`}
                    className={[
                      'block text-sm font-extrabold',
                      statusError
                        ? 'text-red-800'
                        : 'text-slate-800',
                    ].join(' ')}
                  >
                    Status
                  </label>

                  <p
                    className={[
                      'mt-1 text-xs',
                      statusError
                        ? 'font-semibold text-red-700'
                        : 'text-slate-500',
                    ].join(' ')}
                  >
                    Current status:{' '}
                    <strong>
                      {formatStatus(currentStatus)}
                    </strong>
                  </p>

                  {needsStatusChange && (
                    <div
                      className={[
                        'mt-2 rounded-lg px-3 py-2 text-xs font-semibold',
                        statusError
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-50 text-yellow-900',
                      ].join(' ')}
                    >
                      This is their first actual interaction, so
                      choose the appropriate next status before
                      saving.
                    </div>
                  )}

                  <select
                    id={`status-${contactId}`}
                    name="statusAfter"
                    defaultValue=""
                    aria-invalid={statusError}
                    onChange={() => {
                      setStatusError(false)
                      setErrorMessage(null)
                    }}
                    className={[
                      'mt-2 w-full rounded-xl bg-white px-3 py-3 text-sm font-semibold outline-none',
                      statusError
                        ? 'border-2 border-red-500 text-red-900 focus:border-red-600'
                        : 'border border-slate-300 text-slate-800 focus:border-blue-600',
                    ].join(' ')}
                  >
                    <option value="">
                      {needsStatusChange
                        ? 'Choose a new status...'
                        : 'Keep current status'}
                    </option>

                    <option value="attempted_contact">
                      Attempted contact
                    </option>

                    <option value="go_back">
                      Go back
                    </option>

                    <option value="involved">
                      Involved
                    </option>

                    <option value="not_interested">
                      Not interested
                    </option>
                  </select>
                </div>

                <div>
                  {isPrimary ? (
                    <div className="rounded-xl bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-900">
                      You are already the primary follow-up person.
                    </div>
                  ) : (
                    <CheckOption
                      name="makePrimary"
                      label="Make me primary"
                    />
                  )}
                </div>

                {errorMessage && (
                  <div className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">
                    {errorMessage}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white p-5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeForm}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-blue-950 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Interaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function CheckOption({
  name,
  label,
  emphasize = false,
}: {
  name: string
  label: string
  emphasize?: boolean
}) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3',
        emphasize
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-slate-50',
      ].join(' ')}
    >
      <input
        type="checkbox"
        name={name}
        className="h-5 w-5 rounded border-slate-300"
      />

      <span
        className={[
          'text-sm font-semibold',
          emphasize
            ? 'text-emerald-900'
            : 'text-slate-800',
        ].join(' ')}
      >
        {label}
      </span>
    </label>
  )
}

function formatStatus(status: string) {
  switch (status) {
    case 'uncontacted':
      return 'Uncontacted'
    case 'attempted_contact':
      return 'Attempted contact'
    case 'go_back':
      return 'Go back'
    case 'involved':
      return 'Involved'
    case 'not_interested':
      return 'Not interested'
    default:
      return status
  }
}