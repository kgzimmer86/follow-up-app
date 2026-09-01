'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type MinistryArea = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

type LocationSelection = {
  campusAreaId: string
  locationId: string
}

type Stage =
  | 'view'
  | 'edit'
  | 'review'

export function EditableContactLocation({
  contactId,
  ministryLocationId,
  ministryAreas,
}: {
  contactId: string
  ministryLocationId: string | null
  ministryAreas: MinistryArea[]
}) {
  const router = useRouter()

  const areaMap = useMemo(
    () =>
      new Map(
        ministryAreas.map((area) => [
          area.id,
          area,
        ])
      ),
    [ministryAreas]
  )

  const campusAreas = useMemo(
    () =>
      ministryAreas
        .filter(
          (area) =>
            area.area_type ===
            'campus_region'
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
    [ministryAreas]
  )

  const locationAreas = useMemo(
    () =>
      ministryAreas
        .filter(
          (area) =>
            area.area_type !==
              'campus_region' &&
            area.area_type !==
              'affinity' &&
            Boolean(area.parent_id)
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
    [ministryAreas]
  )

  const initialSelection =
    useMemo<LocationSelection>(() => {
      const currentArea =
        ministryLocationId
          ? areaMap.get(
              ministryLocationId
            ) ?? null
          : null

      if (!currentArea) {
        return {
          campusAreaId: '',
          locationId: '',
        }
      }

      if (
        currentArea.area_type ===
        'campus_region'
      ) {
        return {
          campusAreaId:
            currentArea.id,
          locationId: '',
        }
      }

      return {
        campusAreaId:
          currentArea.parent_id ?? '',
        locationId:
          currentArea.parent_id
            ? currentArea.id
            : '',
      }
    }, [
      areaMap,
      ministryLocationId,
    ])

  const [saved, setSaved] =
    useState<LocationSelection>(
      initialSelection
    )

  const [draft, setDraft] =
    useState<LocationSelection>(
      initialSelection
    )

  const [stage, setStage] =
    useState<Stage>('view')

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [success, setSuccess] =
    useState<string | null>(null)

  const availableLocations =
    useMemo(
      () =>
        locationAreas.filter(
          (area) =>
            area.parent_id ===
            draft.campusAreaId
        ),
      [
        draft.campusAreaId,
        locationAreas,
      ]
    )

  const changes =
    locationChangeRows(
      saved,
      draft,
      areaMap
    )

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

    if (!draft.campusAreaId) {
      setError(
        'Choose a campus area.'
      )
      return
    }

    if (
      draft.locationId &&
      areaMap.get(
        draft.locationId
      )?.parent_id !==
        draft.campusAreaId
    ) {
      setError(
        'Choose a dorm/location from the selected campus area.'
      )
      return
    }

    if (
      locationChangeRows(
        saved,
        draft,
        areaMap
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
      'update_follow_up_contact_location',
      {
        p_contact_id: contactId,
        p_campus_area_id:
          draft.campusAreaId,
        p_ministry_location_id:
          draft.locationId || null,
      }
    )

    if (rpcError) {
      setSaving(false)
      setError(rpcError.message)
      return
    }

    const result =
      (data ?? {}) as {
        campus_area_id?: string | null
        selected_location_id?:
          | string
          | null
      }

    const nextSaved = {
      campusAreaId:
        result.campus_area_id ??
        draft.campusAreaId,
      locationId:
        result.selected_location_id ??
        '',
    }

    setSaved(nextSaved)
    setDraft(nextSaved)
    setStage('view')
    setSaving(false)
    setSuccess(
      'Campus area and dorm updated.'
    )

    router.refresh()
  }

  const savedCampus =
    saved.campusAreaId
      ? areaMap.get(
          saved.campusAreaId
        ) ?? null
      : null

  const savedLocation =
    saved.locationId
      ? areaMap.get(
          saved.locationId
        ) ?? null
      : null

  return (
    <div>
      {stage === 'view' && (
        <>
          <div className="divide-y divide-[#eef0f3]">
            <InfoRow
              label="Campus area"
              value={
                savedCampus?.name ||
                'Unplaced'
              }
            />

            <InfoRow
              label="Dorm / location"
              value={
                savedLocation?.name ||
                (
                  savedCampus
                    ? 'Area only / building unknown'
                    : 'Needs area assignment'
                )
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
            className="mt-3 w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#15223a] transition hover:bg-[#f9fafb]"
          >
            Edit campus &amp; dorm
          </button>
        </>
      )}

      {stage === 'edit' && (
        <div>
          <p className="mb-3 text-xs leading-5 text-[#667085]">
            Correct the student&apos;s ministry
            area and dorm/location. If you know
            the campus area but not the exact
            dorm or building, choose the area
            and leave Dorm / location as
            <strong>
              {' '}
              Area only / building unknown
            </strong>
            .
          </p>

          <div className="grid gap-4">
            <SelectField
              label="Campus area"
              value={
                draft.campusAreaId
              }
              onChange={(value) =>
                setDraft((current) => ({
                  campusAreaId: value,
                  locationId:
                    current.locationId &&
                    areaMap.get(
                      current.locationId
                    )?.parent_id ===
                      value
                      ? current.locationId
                      : '',
                }))
              }
            >
              <option value="">
                Choose campus area...
              </option>

              {campusAreas.map(
                (area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.name}
                  </option>
                )
              )}
            </SelectField>

            <SelectField
              label="Dorm / location"
              value={
                draft.locationId
              }
              disabled={
                !draft.campusAreaId
              }
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  locationId: value,
                }))
              }
            >
              <option value="">
                {draft.campusAreaId
                  ? 'Area only / building unknown'
                  : 'Choose campus area first'}
              </option>

              {availableLocations.map(
                (area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.name}
                  </option>
                )
              )}
            </SelectField>
          </div>

          {error && (
            <ErrorBox
              message={error}
            />
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={reviewChanges}
              className="rounded-[11px] bg-[#00274c] px-3 py-2.5 text-xs font-extrabold text-white"
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
              Confirm location change
            </div>

            <p className="mt-1 text-xs leading-5 text-[#667085]">
              This changes where the contact
              appears in campus-area and
              dorm/location views. It does not
              change their current primary
              assignment or Follow Up history.
            </p>
          </div>

          <div className="mt-4 divide-y divide-[#eef0f3] rounded-[14px] border border-[#e4e7ec] bg-white px-3.5">
            {changes.map(
              (change) => (
                <div
                  key={change.key}
                  className="py-3"
                >
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
                    {change.label}
                  </div>

                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <ReviewValue
                      label="Current"
                      value={
                        change.before
                      }
                    />

                    <ReviewValue
                      label="New"
                      value={
                        change.after
                      }
                      highlighted
                    />
                  </div>
                </div>
              )
            )}
          </div>

          {error && (
            <ErrorBox
              message={error}
            />
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setError(null)
                setStage('edit')
              }}
              className="rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-xs font-extrabold text-[#475467] disabled:opacity-50"
            >
              Back to Edit
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={confirmChanges}
              className="rounded-[11px] bg-[#00274c] px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
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

function locationChangeRows(
  before: LocationSelection,
  after: LocationSelection,
  areaMap: Map<string, MinistryArea>
) {
  const campusName = (
    id: string
  ) =>
    id
      ? areaMap.get(id)?.name ||
        'Unknown area'
      : 'Unplaced'

  const locationName = (
    selection: LocationSelection
  ) =>
    selection.locationId
      ? areaMap.get(
          selection.locationId
        )?.name ||
        'Unknown location'
      : selection.campusAreaId
        ? 'Area only / building unknown'
        : 'Needs area assignment'

  const rows = [
    {
      key: 'campus',
      label: 'Campus area',
      before:
        campusName(
          before.campusAreaId
        ),
      after:
        campusName(
          after.campusAreaId
        ),
      changed:
        before.campusAreaId !==
        after.campusAreaId,
    },
    {
      key: 'location',
      label: 'Dorm / location',
      before:
        locationName(before),
      after:
        locationName(after),
      changed:
        before.locationId !==
          after.locationId ||
        before.campusAreaId !==
          after.campusAreaId,
    },
  ]

  return rows.filter(
    (row) => row.changed
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

function SelectField({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (
    value: string
  ) => void
  children: React.ReactNode
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-extrabold text-[#475467]">
        {label}
      </span>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-3 text-[16px] font-semibold text-[#15223a] outline-none transition focus:border-[#175cd3] focus:ring-2 focus:ring-[#dbe8f8] disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
      >
        {children}
      </select>
    </label>
  )
}

function ReviewValue({
  label,
  value,
  highlighted = false,
}: {
  label: string
  value: string
  highlighted?: boolean
}) {
  return (
    <div
      className={[
        'rounded-[10px] px-3 py-2.5',
        highlighted
          ? 'bg-[#eef4ff]'
          : 'bg-[#f9fafb]',
      ].join(' ')}
    >
      <div
        className={[
          'mb-1 text-[10px] font-extrabold uppercase',
          highlighted
            ? 'text-[#175cd3]'
            : 'text-[#98a2b3]',
        ].join(' ')}
      >
        {label}
      </div>

      <div
        className={[
          'break-words font-bold',
          highlighted
            ? 'text-[#15223a]'
            : 'text-[#475467]',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
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
