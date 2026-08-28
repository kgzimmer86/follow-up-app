'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type Props = {
  displayName: string
  email: string
  role: string
  areaLabel: string
  disciplerName: string
}

export function ProfileSettings({
  displayName,
  email,
  role,
  areaLabel,
  disciplerName,
}: Props) {
  const router = useRouter()

  const [editing, setEditing] =
    useState(false)

  const [name, setName] =
    useState(displayName)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [success, setSuccess] =
    useState<string | null>(null)

  async function saveName() {
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('Name cannot be blank.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    const supabase =
      createClient()

    const { error: rpcError } =
      await supabase.rpc(
        'update_own_follow_up_display_name',
        {
          p_display_name: trimmedName,
        }
      )

    if (rpcError) {
      setSaving(false)
      setError(rpcError.message)
      return
    }

    setName(trimmedName)
    setEditing(false)
    setSaving(false)
    setSuccess('Name updated.')

    router.refresh()
  }

  async function signOut() {
    const supabase =
      createClient()

    await supabase.auth.signOut()

    router.push('/')
    router.refresh()
  }

  return (
    <>
      <section className="overflow-hidden rounded-[20px] border border-[#e4e7ec] bg-white shadow-[0_1px_6px_rgba(16,24,40,0.04)]">
        <div className="border-b border-[#eef0f3] px-5 py-4">
          <div className="text-sm font-extrabold text-[#15223a]">
            Account
          </div>

          <p className="mt-1 text-xs leading-5 text-[#667085]">
            You can update your display name. Other account
            settings are managed by Follow Up staff.
          </p>
        </div>

        <div className="divide-y divide-[#eef0f3] px-5">
          <div className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                  Name
                </div>

                {!editing ? (
                  <div className="mt-1 break-words text-sm font-bold text-[#15223a]">
                    {name}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target.value
                      )
                    }
                    autoFocus
                    className="mt-2 w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-[16px] font-semibold text-[#15223a] outline-none focus:border-[#175cd3] focus:ring-2 focus:ring-[#dbe8f8]"
                  />
                )}
              </div>

              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true)
                    setError(null)
                    setSuccess(null)
                  }}
                  className="shrink-0 rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-extrabold text-[#475467]"
                >
                  Edit
                </button>
              )}
            </div>

            {editing && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setName(displayName)
                    setEditing(false)
                    setError(null)
                  }}
                  className="rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveName}
                  className="rounded-[10px] bg-[#00274c] px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : 'Save name'}
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-[10px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-xs font-bold text-[#b42318]"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mt-3 rounded-[10px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2 text-xs font-bold text-[#027a48]"
              >
                {success}
              </div>
            )}
          </div>

          <InfoRow
            label="U-M email"
            value={email || 'Not available'}
          />

          <InfoRow
            label="Role"
            value={formatRole(role)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[#e4e7ec] bg-white shadow-[0_1px_6px_rgba(16,24,40,0.04)]">
        <div className="border-b border-[#eef0f3] px-5 py-4">
          <div className="text-sm font-extrabold text-[#15223a]">
            Ministry setup
          </div>

          <p className="mt-1 text-xs leading-5 text-[#667085]">
            These settings are managed in Follow Up and cannot
            be changed from your profile.
          </p>
        </div>

        <div className="divide-y divide-[#eef0f3] px-5">
          <InfoRow
            label="Default ministry area"
            value={areaLabel}
          />

          <InfoRow
            label="Discipler"
            value={disciplerName}
          />
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e7ec] bg-white p-5 shadow-[0_1px_6px_rgba(16,24,40,0.04)]">
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-[11px] border border-[#fecdca] bg-white px-4 py-3 text-sm font-extrabold text-[#b42318] transition hover:bg-[#fef3f2]"
        >
          Log out of Follow Up
        </button>
      </section>
    </>
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
    <div className="py-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-bold text-[#15223a]">
        {value}
      </div>
    </div>
  )
}

function formatRole(role: string) {
  switch (role) {
    case 'student_leader':
      return 'Student Leader'

    case 'discipler':
      return 'Discipler'

    case 'staff':
      return 'Staff'

    case 'admin':
      return 'Admin'

    default:
      return role
  }
}