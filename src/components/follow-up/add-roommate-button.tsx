'use client'

import {
  useState,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type AddRoommateButtonProps = {
  sourceContactId: string
  locationName?: string | null
  roomOrAddress?: string | null
  returnTo?: string
}

type CreateRoommateResult = {
  contact_id: string
  student_id?: string
  created?: boolean
  matched_existing?: boolean
  display_name?: string
}

export function AddRoommateButton({
  sourceContactId,
  locationName,
  roomOrAddress,
  returnTo,
}: AddRoommateButtonProps) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)

    const name = String(
      formData.get('name') ?? ''
    ).trim()

    const phone = String(
      formData.get('phone') ?? ''
    ).trim()

    const uniqname = String(
      formData.get('uniqname') ?? ''
    ).trim()

    if (!name) {
      setErrorMessage(
        'Enter the roommate’s name.'
      )
      return
    }

    setSaving(true)
    setErrorMessage(null)

    const supabase = createClient()

    const {
      data,
      error,
    } = await supabase.rpc(
      'create_roommate_contact',
      {
        p_source_contact_id:
          sourceContactId,
        p_display_name: name,
        p_phone: phone || null,
        p_uniqname:
          uniqname || null,
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    const result =
      data as CreateRoommateResult | null

    if (!result?.contact_id) {
      setErrorMessage(
        'The roommate was not created. Please try again.'
      )
      setSaving(false)
      return
    }

    if (
      result.matched_existing &&
      !window.confirm(
        'A Follow Up contact with that phone or uniqname already exists. Open that contact and log this interaction there?'
      )
    ) {
      setSaving(false)
      return
    }

    const params =
      new URLSearchParams({
        tab: 'overview',
        interaction: '1',
      })

    if (returnTo) {
      params.set('from', returnTo)
    }

    router.push(
      `/contacts/${result.contact_id}?${params.toString()}`
    )
  }

  function closeForm() {
    if (saving) return

    setErrorMessage(null)
    setOpen(false)
  }

  const inheritedLocation = [
    locationName,
    roomOrAddress,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMessage(null)
          setOpen(true)
        }}
        className="w-full rounded-[11px] border border-[#b2ddff] bg-[#eff8ff] px-3 py-2.5 text-sm font-extrabold text-[#175cd3] transition hover:bg-[#dff1ff]"
      >
        + Add roommate
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
                    Add roommate
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Add them now, then log the conversation you just had.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={closeForm}
                  className="rounded-full px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  aria-label="Close roommate form"
                >
                  ×
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-5 p-5">
                {inheritedLocation ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      Same room
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {inheritedLocation}
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      The roommate will inherit this location automatically.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                    This contact does not have a dorm/room recorded. You can still add the roommate and update the location later.
                  </div>
                )}

                <div>
                  <label
                    htmlFor={`roommate-name-${sourceContactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    Name
                  </label>

                  <input
                    id={`roommate-name-${sourceContactId}`}
                    name="name"
                    type="text"
                    autoComplete="off"
                    autoFocus
                    required
                    placeholder="Chris"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`roommate-phone-${sourceContactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    Phone
                    <span className="ml-1 font-semibold text-slate-400">
                      optional
                    </span>
                  </label>

                  <input
                    id={`roommate-phone-${sourceContactId}`}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="734-555-1234"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`roommate-uniqname-${sourceContactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    Uniqname
                    <span className="ml-1 font-semibold text-slate-400">
                      optional
                    </span>
                  </label>

                  <input
                    id={`roommate-uniqname-${sourceContactId}`}
                    name="uniqname"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    placeholder="csmith"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />

                  <p className="mt-1 text-xs text-slate-500">
                    It is fine to leave phone and uniqname blank for now.
                  </p>
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
                  {saving
                    ? 'Adding...'
                    : 'Add roommate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
