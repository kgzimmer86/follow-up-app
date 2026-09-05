'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type ContactInfo = {
  displayName: string
  phone: string
  umichEmail: string
  roomOrAddress: string
}

type Stage =
  | 'view'
  | 'edit'
  | 'review'

type EditableContactInfoProps = {
  contactId: string
  displayName: string | null
  phone: string | null
  umichEmail: string | null
  roomOrAddress: string | null
}

export function EditableContactInfo({
  contactId,
  displayName,
  phone,
  umichEmail,
  roomOrAddress,
}: EditableContactInfoProps) {
  const router = useRouter()

  const initialInfo = useMemo<ContactInfo>(
    () => ({
      displayName:
        displayName?.trim() ?? '',
      phone: formatPhone(
        phone?.trim() ?? ''
      ),
      umichEmail:
        normalizedUmichForDisplay(
          umichEmail?.trim() ?? ''
        ),
      roomOrAddress:
        roomOrAddress?.trim() ?? '',
    }),
    [
      displayName,
      phone,
      roomOrAddress,
      umichEmail,
    ]
  )

  const [saved, setSaved] =
    useState<ContactInfo>(initialInfo)

  const [draft, setDraft] =
    useState<ContactInfo>(initialInfo)

  const [stage, setStage] =
    useState<Stage>('view')

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [success, setSuccess] =
    useState<string | null>(null)

  const reviewedDraft =
    normalizeForReview(draft, saved)

  const changes =
    changeRows(saved, reviewedDraft)

  function beginEdit() {
    setDraft(saved)
    setError(null)
    setSuccess(null)
    setStage('edit')
  }

  function cancelEdit() {
    setDraft(saved)
    setError(null)
    setStage('view')
  }

  function reviewChanges() {
    setError(null)

    const phoneResult =
      normalizedPhoneForSave(draft.phone)

    if (phoneResult.error) {
      setError(phoneResult.error)
      return
    }

    const identityResult =
      normalizeUmichIdentity(
        draft.umichEmail
      )

    if (identityResult.error) {
      setError(identityResult.error)
      return
    }

    const nextDraft =
      normalizeForReview(
        draft,
        saved,
        phoneResult.value,
        identityResult.email
      )

    setDraft(nextDraft)

    if (
      changeRows(
        saved,
        nextDraft
      ).length === 0
    ) {
      setError(
        'Nothing has changed yet.'
      )
      return
    }

    setStage('review')
  }

  async function confirmChanges() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const supabase =
      createClient()

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      'update_follow_up_contact_info',
      {
        p_contact_id: contactId,
        p_display_name:
          reviewedDraft.displayName,
        p_phone:
          reviewedDraft.phone,
        p_umich_email:
          reviewedDraft.umichEmail,
        p_room_or_address:
          reviewedDraft.roomOrAddress,
      }
    )

    if (rpcError) {
      setSaving(false)
      setError(rpcError.message)
      return
    }

    const result =
      (data ?? {}) as {
        display_name?: string | null
        phone?: string | null
        umich_email?: string | null
        room_or_address?: string | null
      }

    const nextSaved: ContactInfo = {
      displayName:
        result.display_name ??
        reviewedDraft.displayName,

      phone:
        formatPhone(
          result.phone ?? ''
        ),

      umichEmail:
        normalizedUmichForDisplay(
          result.umich_email ?? ''
        ),

      roomOrAddress:
        result.room_or_address ?? '',
    }

    setSaved(nextSaved)
    setDraft(nextSaved)
    setStage('view')
    setSaving(false)
    setSuccess(
      'Contact information updated.'
    )

    router.refresh()
  }

  return (
    <div>
      {stage === 'view' && (
        <>
          <div className="divide-y divide-[#eef0f3]">
            <InfoRow
              label="Name"
              value={
                saved.displayName ||
                'Not provided'
              }
            />

            <InfoRow
              label="Phone"
              value={
                saved.phone ||
                'Not provided'
              }
            />

            <InfoRow
              label="U-M email / uniqname"
              value={
                saved.umichEmail ||
                'Not provided'
              }
            />

            <InfoRow
              label="Room / off-campus address"
              value={
                saved.roomOrAddress ||
                'Not provided'
              }
            />
          </div>

          {success && (
            <div
              role="status"
              className="mt-3 rounded-[12px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2.5 text-xs font-bold text-[#027a48]"
            >
              {success}
            </div>
          )}

          <button
            type="button"
            onClick={beginEdit}
            className="mt-4 w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-sm font-extrabold text-[#15223a] transition hover:bg-[#f9fafb]"
          >
            Edit contact info
          </button>
        </>
      )}

      {stage === 'edit' && (
        <div>
          <p className="mb-4 text-xs leading-5 text-[#667085]">
            Correct information you learn
            in the field. Changes are not
            saved until you review and
            confirm them.
          </p>

          <div className="grid gap-4">
            <EditField
              label="Name"
              value={draft.displayName}
              placeholder="Student name"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  displayName: value,
                }))
              }
            />

            <EditField
              label="Phone"
              value={draft.phone}
              placeholder="734-555-1234"
              inputMode="tel"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  phone: formatPhone(value),
                }))
              }
            />

            <EditField
              label="U-M email / uniqname"
              value={draft.umichEmail}
              placeholder="uniqname or uniqname@umich.edu"
              autoCapitalize="none"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  umichEmail:
                    value.toLowerCase(),
                }))
              }
            />

            <EditField
              label="Room / off-campus address"
              value={
                draft.roomOrAddress
              }
              placeholder="Room number or address"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  roomOrAddress: value,
                }))
              }
            />
          </div>

          {error && (
            <ErrorBox message={error} />
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-sm font-extrabold text-[#475467]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={reviewChanges}
              className="rounded-[11px] bg-[#00274c] px-3 py-3 text-sm font-extrabold text-white"
            >
              Review Changes
            </button>
          </div>
        </div>
      )}

      {stage === 'review' && (
        <div>
          <div className="rounded-[14px] border border-[#fedf89] bg-[#fff8eb] p-3.5">
            <div className="text-sm font-extrabold text-[#15223a]">
              Confirm these changes
            </div>

            <p className="mt-1 text-xs leading-5 text-[#667085]">
              Name, phone, and U-M
              identity information may
              affect this student&apos;s
              record beyond this screen.
            </p>
          </div>

          <div className="mt-4 divide-y divide-[#eef0f3] rounded-[14px] border border-[#e4e7ec] bg-white px-3.5">
            {changes.map((change) => (
              <div
                key={change.key}
                className="py-3"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                  {change.label}
                </div>

                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-[10px] bg-[#f9fafb] px-3 py-2.5">
                    <div className="mb-1 text-[10px] font-extrabold uppercase text-[#98a2b3]">
                      Current
                    </div>

                    <div className="break-words font-bold text-[#475467]">
                      {displayValue(
                        change.before
                      )}
                    </div>
                  </div>

                  <div className="rounded-[10px] bg-[#eef4ff] px-3 py-2.5">
                    <div className="mb-1 text-[10px] font-extrabold uppercase text-[#175cd3]">
                      New
                    </div>

                    <div className="break-words font-extrabold text-[#15223a]">
                      {displayValue(
                        change.after
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <ErrorBox message={error} />
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setError(null)
                setStage('edit')
              }}
              className="rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-sm font-extrabold text-[#475467] disabled:opacity-50"
            >
              Back to Edit
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={confirmChanges}
              className="rounded-[11px] bg-[#00274c] px-3 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : 'Confirm Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="py-3 first:pt-0">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-bold leading-5 text-[#15223a]">
        {value}
      </div>
    </div>
  )
}

function EditField({
  label,
  value,
  placeholder,
  inputMode,
  autoCapitalize,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  inputMode?: 'text' | 'tel' | 'email'
  autoCapitalize?: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-extrabold text-[#475467]">
        {label}
      </span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-[16px] font-semibold text-[#15223a] outline-none transition focus:border-[#175cd3] focus:ring-2 focus:ring-[#dbe8f8]"
      />
    </label>
  )
}

function ErrorBox({
  message,
}: {
  message: string
}) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-[12px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2.5 text-xs font-bold leading-5 text-[#b42318]"
    >
      {message}
    </div>
  )
}

function normalizeForReview(
  draft: ContactInfo,
  saved: ContactInfo,
  normalizedPhone?: string,
  normalizedEmail?: string
): ContactInfo {
  const phoneValue =
    normalizedPhone !== undefined
      ? normalizedPhone
      : normalizedPhoneForSave(
          draft.phone
        ).value

  const identityValue =
    normalizedEmail !== undefined
      ? normalizedEmail
      : normalizeUmichIdentity(
          draft.umichEmail
        ).email

  return {
    displayName:
      draft.displayName.trim() ||
      saved.displayName,

    phone: formatPhone(phoneValue),

    umichEmail: identityValue,

    roomOrAddress:
      draft.roomOrAddress.trim(),
  }
}

function changeRows(
  before: ContactInfo,
  after: ContactInfo
) {
  const rows = [
    {
      key: 'displayName',
      label: 'Name',
      before: before.displayName,
      after: after.displayName,
    },
    {
      key: 'phone',
      label: 'Phone',
      before: before.phone,
      after: after.phone,
    },
    {
      key: 'umichEmail',
      label: 'U-M email / uniqname',
      before: before.umichEmail,
      after: after.umichEmail,
    },
    {
      key: 'roomOrAddress',
      label:
        'Room / off-campus address',
      before: before.roomOrAddress,
      after: after.roomOrAddress,
    },
  ]

  return rows.filter(
    (row) =>
      row.before.trim() !==
      row.after.trim()
  )
}

function displayValue(
  value: string
) {
  return value || 'Not provided'
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

function normalizedUmichForDisplay(
  value: string
) {
  if (!value.trim()) return ''

  const result =
    normalizeUmichIdentity(value)

  return result.error
    ? value.trim().toLowerCase()
    : result.email
}

