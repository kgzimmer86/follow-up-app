'use client'

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type AreaOption = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

type CreateFieldAddedResult = {
  contact_id: string
  student_id?: string
  created?: boolean
  matched_existing?: boolean
  display_name?: string
}

type AddPersonModalProps = {
  open: boolean
  onClose: () => void
}

export function AddPersonModal({
  open,
  onClose,
}: AddPersonModalProps) {
  const router = useRouter()
  const pathname = usePathname()

  const [areas, setAreas] = useState<AreaOption[]>([])
  const [loadingAreas, setLoadingAreas] =
    useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  useEffect(() => {
    if (!open || areas.length > 0) return

    let cancelled = false

    async function loadAreas() {
      setLoadingAreas(true)
      setErrorMessage(null)

      const supabase = createClient()

      const {
        data,
        error,
      } = await supabase
        .from('ministry_areas')
        .select(
          'id, name, area_type, parent_id'
        )
        .eq('is_active', true)

      if (cancelled) return

      if (error) {
        setErrorMessage(
          `Could not load locations: ${error.message}`
        )
        setLoadingAreas(false)
        return
      }

      const nextAreas = (
        (data ?? []) as AreaOption[]
      )
        .filter(
          (area) =>
            area.area_type !== 'affinity'
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        )

      setAreas(nextAreas)
      setLoadingAreas(false)
    }

    void loadAreas()

    return () => {
      cancelled = true
    }
  }, [open, areas.length])

  const areaMap = useMemo(
    () =>
      new Map(
        areas.map((area) => [
          area.id,
          area,
        ])
      ),
    [areas]
  )

  function areaLabel(area: AreaOption) {
    const parent = area.parent_id
      ? areaMap.get(area.parent_id)
      : null

    return parent
      ? `${area.name} • ${parent.name}`
      : area.name
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

    const areaId = String(
      formData.get('areaId') ?? ''
    ).trim()

    const room = String(
      formData.get('room') ?? ''
    ).trim()

    if (!name) {
      setErrorMessage(
        'Enter the person’s name.'
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
      'create_field_added_contact_v2',
      {
        p_display_name: name,
        p_gender: gender || null,
        p_phone: phone || null,
        p_uniqname: uniqname || null,
        p_source_contact_id: null,
        p_ministry_location_id:
          areaId || null,
        p_room_or_address:
          room || null,
        p_relationship: null,
      }
    )

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    const result =
      data as CreateFieldAddedResult | null

    if (!result?.contact_id) {
      setErrorMessage(
        'The person was not added. Please try again.'
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
        from: pathname || '/',
      })

    setSaving(false)
    onClose()

    router.push(
      `/contacts/${result.contact_id}?${params.toString()}`
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">
                Field tool
              </p>

              <h2 className="mt-1 text-2xl font-extrabold text-slate-950">
                Add person
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500">
                For someone you met in the field who is not being added as a roommate.
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setErrorMessage(null)
                onClose()
              }}
              className="rounded-full px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label="Close add person form"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-900">
              If this person is someone’s roommate, use <strong>Add roommate</strong> from that student’s contact instead so the room and relationship are preserved automatically.
            </div>

            <div>
              <label
                htmlFor="field-person-name"
                className="block text-sm font-extrabold text-slate-800"
              >
                Name
              </label>

              <input
                id="field-person-name"
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
                htmlFor="field-person-gender"
                className="block text-sm font-extrabold text-slate-800"
              >
                Gender
                <span className="ml-1 font-semibold text-slate-400">
                  optional
                </span>
              </label>

              <select
                id="field-person-gender"
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
                htmlFor="field-person-area"
                className="block text-sm font-extrabold text-slate-800"
              >
                Dorm / location
                <span className="ml-1 font-semibold text-slate-400">
                  optional
                </span>
              </label>

              <select
                id="field-person-area"
                name="areaId"
                defaultValue=""
                disabled={loadingAreas}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 disabled:opacity-60"
              >
                <option value="">
                  {loadingAreas
                    ? 'Loading locations...'
                    : 'No location yet'}
                </option>

                {areas.map((area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {areaLabel(area)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="field-person-room"
                className="block text-sm font-extrabold text-slate-800"
              >
                Room / address
                <span className="ml-1 font-semibold text-slate-400">
                  optional
                </span>
              </label>

              <input
                id="field-person-room"
                name="room"
                type="text"
                autoComplete="off"
                placeholder="340"
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="field-person-phone"
                className="block text-sm font-extrabold text-slate-800"
              >
                Phone
                <span className="ml-1 font-semibold text-slate-400">
                  optional
                </span>
              </label>

              <input
                id="field-person-phone"
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
                htmlFor="field-person-uniqname"
                className="block text-sm font-extrabold text-slate-800"
              >
                U-M uniqname / email
                <span className="ml-1 font-semibold text-slate-400">
                  optional
                </span>
              </label>

              <input
                id="field-person-uniqname"
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
            </div>

            <p className="text-xs text-slate-500">
              Only a name is required. Phone formatting and U-M identity are normalized automatically; you can fill in the rest later.
            </p>

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
              onClick={() => {
                setErrorMessage(null)
                onClose()
              }}
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
                : 'Add person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
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
