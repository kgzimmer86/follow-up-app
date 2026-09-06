'use client'

import {
  useEffect,
  useRef,
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

type DuplicateCandidate = {
  contact_id: string
  student_id: string
  display_name: string
  uniqname: string | null
  umich_email: string | null
  phone: string | null
  contact_origin: string | null
  survey_submitted_at: string | null
  ministry_location_id: string | null
  location_name: string | null
  room_or_address: string | null
  primary_owner_id: string | null
  match_strength: 'strong' | 'weak'
  match_reasons: string[]
}

type PendingRoommate = {
  name: string
  gender: string
  phone: string
  uniqname: string
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
  const [duplicateCandidates, setDuplicateCandidates] =
    useState<DuplicateCandidate[] | null>(null)
  const [pendingRoommate, setPendingRoommate] =
    useState<PendingRoommate | null>(null)
  const duplicateReviewRef =
    useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!duplicateCandidates || !open) return

    const frame = window.requestAnimationFrame(() => {
      duplicateReviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [duplicateCandidates, open])

  function contactUrl(contactId: string) {
    const params =
      new URLSearchParams({
        tab: 'overview',
        interaction: '1',
      })

    if (returnTo) {
      params.set('from', returnTo)
    }

    return `/contacts/${contactId}?${params.toString()}`
  }

  function openExistingContact(contactId: string) {
    setErrorMessage(null)
    setDuplicateCandidates(null)
    setPendingRoommate(null)
    setOpen(false)
    router.push(contactUrl(contactId))
  }

  function backToEdit() {
    if (saving) return

    setErrorMessage(null)
    setDuplicateCandidates(null)
    setPendingRoommate(null)
  }

  async function createRoommate(
    roommate: PendingRoommate
  ) {
    setSaving(true)
    setErrorMessage(null)

    const supabase = createClient()

    const {
      data,
      error,
    } = await supabase.rpc(
      'create_roommate_contact_v2',
      {
        p_source_contact_id:
          sourceContactId,
        p_display_name: roommate.name,
        p_gender:
          roommate.gender || null,
        p_phone:
          roommate.phone || null,
        p_uniqname:
          roommate.uniqname || null,
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

    setSaving(false)
    setDuplicateCandidates(null)
    setPendingRoommate(null)
    setOpen(false)

    router.push(
      contactUrl(result.contact_id)
    )
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)

    const name = String(
      formData.get('name') ?? ''
    ).trim()

    const gender = String(
      formData.get('gender') ?? ''
    ).trim()

    const rawPhone = String(
      formData.get('phone') ?? ''
    ).trim()

    const rawIdentity = String(
      formData.get('uniqname') ?? ''
    ).trim()

    const phoneResult =
      normalizedPhoneForSave(rawPhone)

    if (phoneResult.error) {
      setErrorMessage(phoneResult.error)
      return
    }

    const identityResult =
      normalizeUmichIdentity(rawIdentity)

    if (identityResult.error) {
      setErrorMessage(identityResult.error)
      return
    }

    const phone = phoneResult.value
    const uniqname =
      identityResult.uniqname

    if (!name) {
      setErrorMessage(
        'Enter the roommate’s name.'
      )
      return
    }

    const roommate: PendingRoommate = {
      name,
      gender,
      phone,
      uniqname,
    }

    setSaving(true)
    setErrorMessage(null)

    const supabase = createClient()

    const {
      data: previewData,
      error: previewError,
    } = await supabase.rpc(
      'preview_follow_up_field_added_duplicate_candidates',
      {
        p_display_name: name,
        p_phone: phone || null,
        p_umich_identity:
          uniqname || null,
        p_ministry_location_id: null,
        p_room_or_address: null,
        p_exclude_contact_id: null,
        p_source_contact_id:
          sourceContactId,
      }
    )

    if (previewError) {
      setErrorMessage(
        `Could not check for existing contacts: ${previewError.message}`
      )
      setSaving(false)
      return
    }

    const candidates =
      Array.isArray(previewData)
        ? previewData as DuplicateCandidate[]
        : []

    if (candidates.length > 0) {
      setPendingRoommate(roommate)
      setDuplicateCandidates(candidates)
      setSaving(false)
      return
    }

    await createRoommate(roommate)
  }

  function closeForm() {
    if (saving) return

    setErrorMessage(null)
    setDuplicateCandidates(null)
    setPendingRoommate(null)
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
          setDuplicateCandidates(null)
          setPendingRoommate(null)
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
              <fieldset
                disabled={
                  saving ||
                  Boolean(duplicateCandidates)
                }
                className="space-y-5 border-0 p-5 disabled:opacity-75"
              >
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
                    htmlFor={`roommate-gender-${sourceContactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    Gender
                    <span className="ml-1 font-semibold text-slate-400">
                      optional
                    </span>
                  </label>

                  <select
                    id={`roommate-gender-${sourceContactId}`}
                    name="gender"
                    defaultValue=""
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600"
                  >
                    <option value="">Not entered</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
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
                    placeholder="(734) 555-1234"
                    onInput={(event) => {
                      event.currentTarget.value =
                        formatPhone(
                          event.currentTarget.value
                        )
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`roommate-uniqname-${sourceContactId}`}
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    U-M uniqname / email
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
                    placeholder="csmith or csmith@umich.edu"
                    onBlur={(event) => {
                      const result =
                        normalizeUmichIdentity(
                          event.currentTarget.value
                        )

                      if (!result.error) {
                        event.currentTarget.value =
                          result.uniqname
                      }
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />

                  <p className="mt-1 text-xs text-slate-500">
                    Either a uniqname or full @umich.edu email works. We normalize it automatically. It is fine to leave both identity fields blank for now.
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">
                    {errorMessage}
                  </div>
                )}
              </fieldset>

              {duplicateCandidates && pendingRoommate && (
                <div
                  ref={duplicateReviewRef}
                  className="mx-5 mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4"
                >
                  <div className="text-sm font-extrabold text-slate-950">
                    {duplicateCandidates.some(
                      (candidate) =>
                        candidate.match_strength ===
                        'strong'
                    )
                      ? 'Existing contact found'
                      : 'Possible existing contact'}
                  </div>

                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {duplicateCandidates.some(
                      (candidate) =>
                        candidate.match_strength ===
                        'strong'
                    )
                      ? 'The phone number or U-M identity exactly matches an existing Follow Up contact. Review that contact instead of creating a duplicate.'
                      : 'The name is compatible, and the inherited dorm/location and room/address match an existing Follow Up contact. This may be the same person, so review it before creating another record.'}
                  </p>

                  <div className="mt-3 grid gap-2">
                    {duplicateCandidates.map(
                      (candidate) => (
                        <div
                          key={candidate.contact_id}
                          className="rounded-xl border border-amber-200 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-extrabold text-slate-950">
                                {candidate.display_name}
                              </div>

                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {[
                                  candidate.location_name,
                                  candidate.room_or_address,
                                ]
                                  .filter(Boolean)
                                  .join(' • ') ||
                                  'No location entered'}
                              </div>

                              {(candidate.umich_email ||
                                candidate.uniqname ||
                                candidate.phone) && (
                                <div className="mt-1 text-xs text-slate-500">
                                  {candidate.umich_email ||
                                    candidate.uniqname ||
                                    formatStoredPhone(
                                      candidate.phone || ''
                                    )}
                                </div>
                              )}
                            </div>

                            <span
                              className={[
                                'shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide',
                                candidate.match_strength ===
                                'strong'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-amber-100 text-amber-800',
                              ].join(' ')}
                            >
                              {candidate.match_strength ===
                              'strong'
                                ? 'Exact match'
                                : 'Possible match'}
                            </span>
                          </div>

                          <div className="mt-2 text-[11px] font-semibold text-slate-500">
                            Match: {formatMatchReasons(
                              candidate.match_reasons
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              openExistingContact(
                                candidate.contact_id
                              )
                            }
                            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Open existing contact
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  {duplicateCandidates.filter(
                    (candidate) =>
                      candidate.match_strength ===
                      'strong'
                  ).length > 1 && (
                    <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold leading-5 text-red-700">
                      More than one exact match was found. Do not create another contact. Open the matching contacts to review the conflicting data.
                    </div>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white p-5">
                {duplicateCandidates && pendingRoommate ? (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={backToEdit}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Back to edit
                    </button>

                    {duplicateCandidates.filter(
                      (candidate) =>
                        candidate.match_strength ===
                        'strong'
                    ).length === 1 ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          void createRoommate(
                            pendingRoommate
                          )
                        }}
                        className="flex-1 rounded-xl bg-blue-950 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-900 disabled:opacity-50"
                      >
                        {saving
                          ? 'Opening...'
                          : 'Use existing contact'}
                      </button>
                    ) : duplicateCandidates.some(
                        (candidate) =>
                          candidate.match_strength ===
                          'strong'
                      ) ? null : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          void createRoommate(
                            pendingRoommate
                          )
                        }}
                        className="flex-1 rounded-xl bg-blue-950 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-900 disabled:opacity-50"
                      >
                        {saving
                          ? 'Adding...'
                          : 'Create new anyway'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
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
                        ? 'Checking...'
                        : 'Add roommate'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function formatStoredPhone(value: string) {
  const digits = phoneDigits(value)

  if (digits.length !== 10) {
    return value
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatMatchReasons(
  reasons: string[]
) {
  const labels = reasons.map((reason) => {
    switch (reason) {
      case 'uniqname':
        return 'same U-M identity'
      case 'phone':
        return 'same phone'
      case 'name_location_room':
        return 'compatible name + location + room'
      default:
        return reason
    }
  })

  return labels.join(' + ')
}

function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, '')

  if (
    digits.length === 11 &&
    digits.startsWith('1')
  ) {
    digits = digits.slice(1)
  }

  if (digits.length > 10) {
    digits = digits.slice(-10)
  }

  return digits
}

function formatPhone(value: string) {
  const digits = phoneDigits(value)

  if (!digits) return ''

  if (digits.length <= 3) {
    return digits
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

function normalizedPhoneForSave(
  value: string
) {
  const rawDigits = value.replace(/\D/g, '')
  let digits = rawDigits

  if (
    digits.length === 11 &&
    digits.startsWith('1')
  ) {
    digits = digits.slice(1)
  } else if (digits.length > 10) {
    digits = digits.slice(-10)
  }

  if (!digits) {
    return {
      value: '',
      error: null as string | null,
    }
  }

  if (digits.length !== 10) {
    return {
      value: '',
      error:
        'Enter a 10-digit phone number, or leave it blank.',
    }
  }

  return {
    value: digits,
    error: null as string | null,
  }
}

function normalizeUmichIdentity(
  value: string
) {
  let normalized = value
    .trim()
    .toLowerCase()

  if (!normalized) {
    return {
      uniqname: '',
      email: '',
      error: null as string | null,
    }
  }

  while (
    normalized.endsWith(
      '@umich.edu@umich.edu'
    )
  ) {
    normalized = normalized.replace(
      /@umich\.edu@umich\.edu$/,
      '@umich.edu'
    )
  }

  let uniqname = normalized

  if (normalized.includes('@')) {
    if (
      !/^[a-z0-9._-]+@umich\.edu$/.test(
        normalized
      )
    ) {
      return {
        uniqname: '',
        email: '',
        error:
          'Enter a U-M uniqname or an @umich.edu email address.',
      }
    }

    uniqname = normalized.split('@')[0]
  }

  if (
    !uniqname ||
    !/^[a-z0-9._-]+$/.test(uniqname)
  ) {
    return {
      uniqname: '',
      email: '',
      error:
        'Enter a valid U-M uniqname or @umich.edu email address.',
    }
  }

  return {
    uniqname,
    email: `${uniqname}@umich.edu`,
    error: null as string | null,
  }
}
