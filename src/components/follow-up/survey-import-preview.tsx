// FOLLOW UP IMPORTER — existing campaign contact choice v4 (2026-08-30)
'use client'

import {
  ChangeEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { createClient } from '@/lib/supabase/client'

type CsvRow = Record<string, string>

export type ImportCampaign = {
  id: string
  academic_year: string
  label: string
  starts_on: string
  ends_on: string
  status: 'active' | 'draft'
}

type SurveyImportPreviewProps = {
  initialCampaigns: ImportCampaign[]
  role: string
}

type AppField = {
  key: string
  label: string
  required?: boolean
  aliases: string[]
}

type EditableRow = {
  name: string
  uniqname: string
  phone: string
  gender: string
  year: string
  location: string
  house: string
  room: string
  jesus: string
  community: string
  interview: string
  affinities: string[]
  rawAffinities: string
  autoFixes: string[]
}

type PreviewRow = EditableRow & {
  rowNumber: number
  email: string
  phoneNormalized: string
  submittedAt: string
  issues: string[]
}

type RowOverride = Partial<
  Pick<
    EditableRow,
    | 'name'
    | 'uniqname'
    | 'phone'
    | 'location'
    | 'house'
    | 'room'
  >
>

type MatchStatus =
  | 'matched_by_uniqname'
  | 'matched_by_phone'
  | 'matched_by_phone_add_uniqname'
  | 'new_student'
  | 'new_student_phone_only'
  | 'new_student_weak_identity'
  | 'needs_review_duplicate_uniqname'
  | 'needs_review_multiple_phone_matches'
  | 'needs_review_identity_conflict'

type MatchResult = {
  row_number: number
  name: string
  uniqname: string | null
  phone_normalized: string | null
  status: MatchStatus
  matched_student_id: string | null
  matched_student_name: string | null
  existing_uniqname: string | null
}

type CampaignContactSnapshot = {
  student_id: string
  contact_id: string
  display_name: string | null
  uniqname: string | null
  survey_submitted_at: string | null
  year_at_um: string | null
  gender_raw: string | null
  phone: string | null
  jesus_interest: string | null
  community_interest: string | null
  interview_interest: string | null
  location_name: string | null
  house_name: string | null
  room_or_address: string | null
  affinities: string[] | null
}

type ExistingContactChoice = 'keep' | 'update'

type ExistingContactChange = {
  label: string
  currentValue: string
  nextValue: string
}

type ReviewFilter =
  | 'all'
  | 'ready'
  | 'existing'
  | 'new'
  | 'needs_review'
  | 'csv_warnings'
  | 'duplicates'
  | 'suggested_exclusions'
  | 'excluded'

type ImportResult = {
  import_id: string
  campaign_id: string
  total_rows: number
  imported_rows: number
  skipped_rows: number
  issue_rows: number
  students_created: number
  students_reused: number
  contacts_created: number
  contacts_updated: number
}

type DuplicateMeta = {
  groupKey: string
  isDuplicateGroup: boolean
  isWinner: boolean
  isRecommended: boolean
  skip: boolean
  groupSize: number
  winnerRowNumber: number
  recommendedRowNumber: number
  previousNames: string[]
  qualityScore: number
  qualityReasons: string[]
  closeCall: boolean
  manuallyChosen: boolean
}

const APP_FIELDS: AppField[] = [
  {
    key: 'timestamp',
    label: 'Submitted at',
    aliases: [
      'timestamp',
      'submitted at',
      'submission time',
      'date submitted',
    ],
  },
  {
    key: 'name',
    label: 'Full name',
    required: true,
    aliases: [
      'name',
      'full name',
      'student name',
      'first and last name',
    ],
  },
  {
    key: 'uniqname',
    label: 'U-M uniqname',
    aliases: [
      'uniqname',
      'umich uniqname',
      'u-m uniqname',
      'unique name',
      'unique name (you will not be put on any email lists)',
    ],
  },
  {
    key: 'phone',
    label: 'Phone',
    aliases: [
      'phone',
      'phone number',
      'cell',
      'cell phone',
      'cell number',
    ],
  },
  {
    key: 'gender',
    label: 'Gender',
    aliases: ['gender', 'sex'],
  },
  {
    key: 'year',
    label: 'Year at U-M',
    aliases: [
      'year',
      'year at um',
      'year at u-m',
      'year at u of m',
      'class year',
      'student year',
    ],
  },
  {
    key: 'location',
    label: 'Dorm / location',
    aliases: [
      'dorm',
      'location',
      'dorm / location',
      'residence hall',
      'residence hall / off campus area',
      'please select your dorm or off-campus area',
      'where do you live',
    ],
  },
  {
    key: 'house',
    label: 'House / building',
    aliases: [
      'house',
      'house name',
      'house / building',
      'house/building',
      'house or building',
      'house / building name',
      'building',
      'building name',
      'dorm house',
      'residence house',
      'residence hall house',
    ],
  },
  {
    key: 'room',
    label: 'Room / address',
    aliases: [
      'room',
      'room number',
      'room / address',
      'address',
      'street address',
      'dorm room number or off campus address',
    ],
  },
  {
    key: 'jesus',
    label: 'Relationship with Jesus',
    aliases: [
      'jesus',
      'relationship with jesus',
      'interest in jesus',
      'learn more about jesus',
      'would you like to explore how you can have a relationship with jesus',
    ],
  },
  {
    key: 'community',
    label: 'Christian community',
    aliases: [
      'community',
      'christian community',
      'interest in christian community',
      'join a christian community',
      'are you interested in finding a small group bible study and/or christian community',
    ],
  },
  {
    key: 'interview',
    label: 'Life / values interview',
    aliases: [
      'interview',
      'life / values interview',
      'life values interview',
      'life, values & spiritual perspectives interview',
      'life values spiritual perspectives interview',
      'would you be willing to participate in a short questionnaire about u-m students',
      'would you be willing to participate in a short questionnaire',
    ],
  },
  {
    key: 'affinities',
    label: 'Contextualized ministry communities',
    aliases: [
      'cru offers contextualized ministries for the following communities below. i would like to find community with other',
      'cru offers contextulized ministries for the following communities below. i would like to find community with other',
      'contextualized ministries',
      'contextulized ministries',
      'find community with other',
    ],
  },
]

const CANONICAL_LOCATIONS = [
  'West Quad',
  'East Quad',
  'South Quad',
  'North Quad',
  'Fletcher',
  'Betsy Barbour',
  'Helen Newberry',
  'Martha Cook',
  'Munger',
  'Off Campus — Central',
  'Markley',
  'Mosher Jordan (MoJo)',
  'Oxford',
  'Alice Lloyd',
  'Couzens',
  'Stockwell',
  'Off Campus — Hill',
  'Bursley',
  'Baits',
  'Northwood Apartments',
  'Off Campus — North',
  'Building 1',
  'Building 2',
  'Building 3',
  'Building 4',
  'Harper Hall',
  'Off Campus — Village',
]

const LOCATION_ALIASES: Record<string, string> = {
  'west quad': 'West Quad',
  'west quadrangle': 'West Quad',
  'west quadrangle residence hall': 'West Quad',
  'east quad': 'East Quad',
  'east quadrangle': 'East Quad',
  'east quadrangle residence hall': 'East Quad',
  'south quad': 'South Quad',
  'south quadrangle': 'South Quad',
  'south quadrangle residence hall': 'South Quad',
  'north quad': 'North Quad',
  'north quadrangle': 'North Quad',
  'north quadrangle residence hall': 'North Quad',
  fletcher: 'Fletcher',
  'fletcher hall': 'Fletcher',
  barbour: 'Betsy Barbour',
  barbor: 'Betsy Barbour',
  'betsy barbour': 'Betsy Barbour',
  'betsy barbor': 'Betsy Barbour',
  'betsy barbour house': 'Betsy Barbour',
  'betsy barbor house': 'Betsy Barbour',
  newberry: 'Helen Newberry',
  'helen newberry': 'Helen Newberry',
  'helen newberry residence': 'Helen Newberry',
  'martha cook': 'Martha Cook',
  'martha cook building': 'Martha Cook',
  munger: 'Munger',
  'munger graduate residences': 'Munger',
  'munger graduate residence': 'Munger',
  markley: 'Markley',
  'mary markley': 'Markley',
  'mary markley hall': 'Markley',
  'mary markley residence hall': 'Markley',
  mojo: 'Mosher Jordan (MoJo)',
  'mo jo': 'Mosher Jordan (MoJo)',
  'mosher jordan': 'Mosher Jordan (MoJo)',
  'mosher-jordan': 'Mosher Jordan (MoJo)',
  'mosher jordan mojo': 'Mosher Jordan (MoJo)',
  'mosher jordan residence hall': 'Mosher Jordan (MoJo)',
  oxford: 'Oxford',
  'oxford housing': 'Oxford',
  'oxford houses': 'Oxford',
  'alice lloyd': 'Alice Lloyd',
  lloyd: 'Alice Lloyd',
  'alice lloyd hall': 'Alice Lloyd',
  couzens: 'Couzens',
  'couzens hall': 'Couzens',
  stockwell: 'Stockwell',
  'stockwell hall': 'Stockwell',
  bursley: 'Bursley',
  'bursley hall': 'Bursley',
  baits: 'Baits',
  'baits i': 'Baits',
  'baits ii': 'Baits',
  'baits 1': 'Baits',
  'baits 2': 'Baits',
  northwood: 'Northwood Apartments',
  'northwood apartments': 'Northwood Apartments',
  'northwood apartment': 'Northwood Apartments',
  'building 1': 'Building 1',
  'building one': 'Building 1',
  'building 2': 'Building 2',
  'building two': 'Building 2',
  'building 3': 'Building 3',
  'building three': 'Building 3',
  'building 4': 'Building 4',
  'building four': 'Building 4',
  'harper hall': 'Harper Hall',
  harper: 'Harper Hall',
  'off campus central': 'Off Campus — Central',
  'central off campus': 'Off Campus — Central',
  'off-campus central': 'Off Campus — Central',
  'off campus hill': 'Off Campus — Hill',
  'hill off campus': 'Off Campus — Hill',
  'off-campus hill': 'Off Campus — Hill',
  'off campus north': 'Off Campus — North',
  'north off campus': 'Off Campus — North',
  'off-campus north': 'Off Campus — North',
  'off campus village': 'Off Campus — Village',
  'village off campus': 'Off Campus — Village',
  'off-campus village': 'Off Campus — Village',
  'wolverine village': 'Wolverine Village',
  'wolverine village housing': 'Wolverine Village',
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 15000

export function SurveyImportPreview({
  initialCampaigns,
  role,
}: SurveyImportPreviewProps) {
  const [campaigns, setCampaigns] = useState<ImportCampaign[]>(initialCampaigns)
  const initialCampaign =
    initialCampaigns.find((campaign) => campaign.status === 'active') ??
    initialCampaigns[0] ??
    null
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    initialCampaign?.id ?? ''
  )
  const [campaignMemberStudentIds, setCampaignMemberStudentIds] =
    useState<Set<string>>(new Set())
  const [campaignContacts, setCampaignContacts] =
    useState<CampaignContactSnapshot[]>([])
  const [existingContactChoices, setExistingContactChoices] =
    useState<Record<number, ExistingContactChoice>>({})
  const [confirmedExistingMatches, setConfirmedExistingMatches] =
    useState<Record<number, string>>({})
  const [identityDirtyRows, setIdentityDirtyRows] =
    useState<Set<number>>(new Set())
  const [checkedCampaignId, setCheckedCampaignId] = useState<string | null>(null)
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)
  const [newAcademicYear, setNewAcademicYear] = useState('')
  const [newCampaignLabel, setNewCampaignLabel] = useState('')
  const [newStartsOn, setNewStartsOn] = useState('')
  const [newEndsOn, setNewEndsOn] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [campaignCreateError, setCampaignCreateError] = useState<string | null>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({})
  const [acceptedWarnings, setAcceptedWarnings] =
    useState<Record<number, string[]>>({})
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [issueFilter, setIssueFilter] = useState<string | null>(null)
  const [duplicateChoices, setDuplicateChoices] =
    useState<Record<string, number>>({})
  const [confirmedDuplicateChoices, setConfirmedDuplicateChoices] =
    useState<Record<string, number>>({})
  const [reviewPage, setReviewPage] =
    useState(0)
  const [excludedRows, setExcludedRows] =
    useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])
  const [checkingMatches, setCheckingMatches] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const baseRows = useMemo(
    () => rows.map((row, index) => mapCsvRow(row, mapping, index)),
    [rows, mapping]
  )

  const mappedRows = useMemo(
    () =>
      validatePreviewRows(
        baseRows.map((row) =>
          applyOverride(row, overrides[row.rowNumber])
        )
      ),
    [baseRows, overrides]
  )

  const reviewedRows = useMemo(
    () =>
      mappedRows.map((row) => {
        const accepted =
          acceptedWarnings[
            row.rowNumber
          ] ?? []

        const stillPresent =
          row.issues.filter(
            (issue) =>
              accepted.includes(issue)
          )

        if (
          stillPresent.length === 0
        ) {
          return row
        }

        return {
          ...row,
          issues:
            row.issues.filter(
              (issue) =>
                !accepted.includes(
                  issue
                )
            ),
          autoFixes: [
            ...row.autoFixes,
            ...stillPresent.map(
              (issue) =>
                `Approved as-is: ${issue}`
            ),
          ],
        }
      }),
    [
      mappedRows,
      acceptedWarnings,
    ]
  )

  const duplicateMap = useMemo(
    () =>
      buildDuplicateMap(
        reviewedRows,
        duplicateChoices
      ),
    [reviewedRows, duplicateChoices]
  )

  const selectedRows = useMemo(
    () =>
      reviewedRows.filter(
        (row) =>
          !duplicateMap.get(
            row.rowNumber
          )?.skip
      ),
    [reviewedRows, duplicateMap]
  )

  const importRows = useMemo(
    () =>
      selectedRows.filter(
        (row) =>
          !excludedRows.has(
            row.rowNumber
          )
      ),
    [selectedRows, excludedRows]
  )

  const excludedPreviewRows =
    useMemo(
      () =>
        selectedRows.filter(
          (row) =>
            excludedRows.has(
              row.rowNumber
            )
        ),
      [selectedRows, excludedRows]
    )

  const duplicateRows = useMemo(
    () =>
      reviewedRows.filter(
        (row) =>
          duplicateMap.get(
            row.rowNumber
          )?.isDuplicateGroup
      ),
    [reviewedRows, duplicateMap]
  )

  const duplicateGroups = useMemo(
    () =>
      reviewedRows.filter(
        (row) => {
          const meta =
            duplicateMap.get(
              row.rowNumber
            )

          return (
            meta?.isDuplicateGroup &&
            meta.isWinner
          )
        }
      ).length,
    [reviewedRows, duplicateMap]
  )

  const duplicatesSkipped =
    reviewedRows.length -
    selectedRows.length

  const duplicateWinnerByGroup =
    useMemo(() => {
      const winners =
        new Map<string, number>()

      for (
        const row of reviewedRows
      ) {
        const duplicate =
          duplicateMap.get(
            row.rowNumber
          )

        if (
          duplicate?.isDuplicateGroup &&
          duplicate.isWinner
        ) {
          winners.set(
            duplicate.groupKey,
            row.rowNumber
          )
        }
      }

      return winners
    }, [
      reviewedRows,
      duplicateMap,
    ])

  const unresolvedDuplicateGroupKeys =
    useMemo(() => {
      const keys =
        new Set<string>()

      for (
        const [
          groupKey,
          winnerRowNumber,
        ] of duplicateWinnerByGroup
      ) {
        if (
          confirmedDuplicateChoices[
            groupKey
          ] !== winnerRowNumber
        ) {
          keys.add(groupKey)
        }
      }

      return keys
    }, [
      duplicateWinnerByGroup,
      confirmedDuplicateChoices,
    ])

  const unresolvedDuplicateGroupCount =
    unresolvedDuplicateGroupKeys.size

  const requiredMapped = Boolean(mapping.name)

  const hasUnsavedImportWork =
    Boolean(fileName) &&
    !importResult

  const rowApprovedAsIs = (
    row: PreviewRow
  ) =>
    (
      acceptedWarnings[
        row.rowNumber
      ] ?? []
    ).length > 0

  const isSuggestedExclusionRow = (
    row: PreviewRow
  ) =>
    !rowApprovedAsIs(row) &&
    shouldSuggestExclusion(
      row
    )

  const matchMap = useMemo(
    () => new Map(matchResults.map((result) => [result.row_number, result])),
    [matchResults]
  )

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null

  const campaignContactMap = useMemo(
    () =>
      new Map(
        campaignContacts.map((contact) => [
          contact.student_id,
          contact,
        ])
      ),
    [campaignContacts]
  )

  const alreadyInCampaignRowNumbers = useMemo(() => {
    const rowNumbers = new Set<number>()

    for (const row of importRows) {
      const matchedStudentId =
        matchMap.get(row.rowNumber)?.matched_student_id ?? null

      if (
        matchedStudentId &&
        campaignMemberStudentIds.has(matchedStudentId)
      ) {
        rowNumbers.add(row.rowNumber)
      }
    }

    return rowNumbers
  }, [importRows, matchMap, campaignMemberStudentIds])

  const rowsToAdd = useMemo(
    () =>
      importRows.filter(
        (row) => !alreadyInCampaignRowNumbers.has(row.rowNumber)
      ),
    [importRows, alreadyInCampaignRowNumbers]
  )

  const rowsToUpdate = useMemo(
    () =>
      importRows.filter(
        (row) =>
          alreadyInCampaignRowNumbers.has(row.rowNumber) &&
          existingContactChoices[row.rowNumber] === 'update'
      ),
    [
      importRows,
      alreadyInCampaignRowNumbers,
      existingContactChoices,
    ]
  )

  const rowsToWrite = useMemo(
    () => [...rowsToAdd, ...rowsToUpdate],
    [rowsToAdd, rowsToUpdate]
  )

  const alreadyInCampaignCount =
    importRows.length - rowsToAdd.length

  const existingContactsKeptCount =
    alreadyInCampaignCount - rowsToUpdate.length

  const unresolvedExistingChoiceCount =
    Array.from(
      alreadyInCampaignRowNumbers
    ).filter(
      (rowNumber) => {
        const matchedStudentId =
          matchMap.get(
            rowNumber
          )?.matched_student_id ?? ''

        return (
          !matchedStudentId ||
          confirmedExistingMatches[
            rowNumber
          ] !== matchedStudentId
        )
      }
    ).length

  const isExistingChoiceConfirmed = (
    rowNumber: number
  ) => {
    const matchedStudentId =
      matchMap.get(
        rowNumber
      )?.matched_student_id

    return (
      Boolean(matchedStudentId) &&
      alreadyInCampaignRowNumbers.has(
        rowNumber
      ) &&
      confirmedExistingMatches[
        rowNumber
      ] === matchedStudentId
    )
  }

  const rowNeedsActiveDatabaseReview = (
    row: PreviewRow
  ) => {
    if (
      identityDirtyRows.has(
        row.rowNumber
      )
    ) {
      return false
    }

    const status =
      matchMap.get(
        row.rowNumber
      )?.status

    if (
      !rowNeedsDatabaseReview(
        status,
        row
      )
    ) {
      return false
    }

    if (
      isExistingChoiceConfirmed(
        row.rowNumber
      )
    ) {
      return false
    }

    return true
  }

  const counts = useMemo(() => {
    const existing =
      unresolvedExistingChoiceCount

    const newRows = importRows.filter((row) =>
      isNewStatus(
        matchMap.get(
          row.rowNumber
        )?.status,
        row
      )
    ).length

    const needsReview = importRows.filter(
      rowNeedsActiveDatabaseReview
    ).length

    const csvWarnings = importRows.filter(
      (row) => row.issues.length > 0
    ).length

    const ready = importRows.filter((row) => {
      const status =
        matchMap.get(
          row.rowNumber
        )?.status

      return (
        !identityDirtyRows.has(
          row.rowNumber
        ) &&
        !rowHasBlockingCsvIssue(
          row
        ) &&
        !rowNeedsActiveDatabaseReview(
          row
        )
      )
    }).length

    const suggestedExclusions =
      importRows.filter(
        isSuggestedExclusionRow
      ).length

    return {
      all: importRows.length,
      ready,
      existing,
      new: newRows,
      needsReview,
      csvWarnings,
      duplicates:
        unresolvedDuplicateGroupCount,
      suggestedExclusions,
      excluded:
        excludedPreviewRows.length,
    }
  }, [
    importRows,
    excludedPreviewRows,
    matchMap,
    duplicatesSkipped,
    unresolvedDuplicateGroupCount,
    acceptedWarnings,
    confirmedExistingMatches,
    alreadyInCampaignRowNumbers,
    identityDirtyRows,
  ])

  const blockingCsvCount =
    useMemo(
      () =>
        importRows.filter(
          rowHasBlockingCsvIssue
        ).length,
      [importRows]
    )

  const nonBlockingWarningCount =
    useMemo(
      () =>
        rowsToWrite.filter(
          (row) =>
            row.issues.length > 0 &&
            !rowHasBlockingCsvIssue(
              row
            )
        ).length,
      [rowsToWrite]
    )

  const actionableBlockingCsvCount = useMemo(
    () => rowsToWrite.filter(rowHasBlockingCsvIssue).length,
    [rowsToWrite]
  )

  const actionableNeedsReview = useMemo(
    () =>
      rowsToWrite.filter(
        rowNeedsActiveDatabaseReview
      ).length,
    [
      rowsToWrite,
      matchMap,
      confirmedExistingMatches,
      alreadyInCampaignRowNumbers,
      identityDirtyRows,
    ]
  )

  const actionableSuggestedExclusions = useMemo(
    () => rowsToWrite.filter(isSuggestedExclusionRow).length,
    [
      rowsToWrite,
      acceptedWarnings,
    ]
  )

  const databaseCheckCurrent =
    Boolean(selectedCampaignId) &&
    checkedCampaignId === selectedCampaignId &&
    importRows.length > 0 &&
    importRows.every(
      (row) =>
        matchMap.has(
          row.rowNumber
        ) &&
        !identityDirtyRows.has(
          row.rowNumber
        )
    )

  const canImport =
    Boolean(selectedCampaignId) &&
    requiredMapped &&
    databaseCheckCurrent &&
    rowsToWrite.length > 0 &&
    unresolvedExistingChoiceCount === 0 &&
    unresolvedDuplicateGroupCount === 0 &&
    actionableNeedsReview === 0 &&
    actionableBlockingCsvCount === 0 &&
    actionableSuggestedExclusions === 0 &&
    editingRow === null &&
    !importing &&
    !importResult

  const warningBreakdown = useMemo(() => {
    const counts = new Map<string, number>()

    for (const row of importRows) {
      for (const issue of row.issues) {
        counts.set(
          issue,
          (counts.get(issue) ?? 0) + 1
        )
      }
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count)
  }, [importRows])

  const reviewBreakdown = useMemo(() => {
    const counts = new Map<MatchStatus, number>()

    for (const result of matchResults) {
      const row =
        importRows.find(
          (candidate) =>
            candidate.rowNumber ===
            result.row_number
        )

      if (
        row &&
        rowNeedsActiveDatabaseReview(
          row
        )
      ) {
        counts.set(
          result.status,
          (counts.get(
            result.status
          ) ?? 0) + 1
        )
      }
    }

    return Array.from(counts.entries())
      .map(([status, count]) => ({
        status,
        count,
        label:
          matchStatusConfig(status)
            .label,
      }))
      .sort((a, b) => b.count - a.count)
  }, [
    matchResults,
    importRows,
    matchMap,
    confirmedExistingMatches,
    alreadyInCampaignRowNumbers,
    identityDirtyRows,
  ])

  const filteredRows = useMemo(
    () => {
      const baseSourceRows =
        reviewFilter ===
        'duplicates'
          ? [...duplicateRows].sort(
              (a, b) => {
                const aMeta =
                  duplicateMap.get(
                    a.rowNumber
                  )

                const bMeta =
                  duplicateMap.get(
                    b.rowNumber
                  )

                const groupCompare =
                  (
                    aMeta?.groupKey ??
                    ''
                  ).localeCompare(
                    bMeta?.groupKey ??
                    ''
                  )

                if (groupCompare !== 0) {
                  return groupCompare
                }

                if (
                  aMeta?.isWinner !==
                  bMeta?.isWinner
                ) {
                  return aMeta?.isWinner
                    ? -1
                    : 1
                }

                return (
                  a.rowNumber -
                  b.rowNumber
                )
              }
            )
          : reviewFilter ===
              'excluded'
            ? excludedPreviewRows
            : importRows

      const editingPreviewRow =
        editingRow === null
          ? undefined
          : reviewedRows.find(
              (row) =>
                row.rowNumber ===
                editingRow
            )

      const sourceRows =
        editingPreviewRow &&
        !baseSourceRows.some(
          (row) =>
            row.rowNumber ===
            editingPreviewRow.rowNumber
        )
          ? [
              ...baseSourceRows,
              editingPreviewRow,
            ]
          : baseSourceRows

      return sourceRows.filter((row) => {
        const status = matchMap.get(row.rowNumber)?.status

        if (
          editingRow ===
          row.rowNumber
        ) {
          return true
        }

        switch (reviewFilter) {
          case 'ready':
            return (
              !identityDirtyRows.has(
                row.rowNumber
              ) &&
              !rowHasBlockingCsvIssue(
                row
              ) &&
              !rowNeedsActiveDatabaseReview(
                row
              )
            )
          case 'existing':
            return (
              alreadyInCampaignRowNumbers.has(
                row.rowNumber
              ) &&
              !isExistingChoiceConfirmed(
                row.rowNumber
              )
            )
          case 'new':
            return isNewStatus(
              status,
              row
            )
          case 'needs_review':
            return rowNeedsActiveDatabaseReview(
              row
            )
          case 'csv_warnings':
            return issueFilter
              ? row.issues.includes(issueFilter)
              : row.issues.length > 0
          case 'duplicates': {
            const duplicate =
              duplicateMap.get(
                row.rowNumber
              )

            return Boolean(
              duplicate?.groupKey &&
              unresolvedDuplicateGroupKeys.has(
                duplicate.groupKey
              )
            )
          }
          case 'suggested_exclusions':
            return isSuggestedExclusionRow(
              row
            )
          case 'excluded':
            return true
          default:
            return true
        }
      })
    },
    [
      reviewedRows,
      importRows,
      duplicateRows,
      duplicateMap,
      excludedPreviewRows,
      matchMap,
      reviewFilter,
      issueFilter,
      editingRow,
      confirmedExistingMatches,
      alreadyInCampaignRowNumbers,
      identityDirtyRows,
      unresolvedDuplicateGroupKeys,
    ]
  )

  useEffect(() => {
    setReviewPage(0)
  }, [
    reviewFilter,
    issueFilter,
  ])

  useEffect(() => {
    if (!hasUnsavedImportWork) {
      return
    }

    const warningMessage =
      'Are you sure you want to leave import? Work not saved.'

    const guardKey =
      `follow-up-import-${Date.now()}`

    let allowingLeave = false

    const handleBeforeUnload = (
      event: BeforeUnloadEvent
    ) => {
      if (allowingLeave) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    const handlePopState = () => {
      if (allowingLeave) {
        return
      }

      const shouldLeave =
        window.confirm(
          warningMessage
        )

      if (shouldLeave) {
        allowingLeave = true

        window.removeEventListener(
          'beforeunload',
          handleBeforeUnload
        )

        window.removeEventListener(
          'popstate',
          handlePopState
        )

        window.history.back()
        return
      }

      window.history.pushState(
        {
          ...(window.history.state ??
            {}),
          __followUpImportGuard:
            guardKey,
        },
        '',
        window.location.href
      )
    }

    window.history.pushState(
      {
        ...(window.history.state ??
          {}),
        __followUpImportGuard:
          guardKey,
      },
      '',
      window.location.href
    )

    window.addEventListener(
      'beforeunload',
      handleBeforeUnload
    )

    window.addEventListener(
      'popstate',
      handlePopState
    )

    return () => {
      window.removeEventListener(
        'beforeunload',
        handleBeforeUnload
      )

      window.removeEventListener(
        'popstate',
        handlePopState
      )
    }
  }, [
    hasUnsavedImportWork,
  ])

  const duplicateGroupKeysInFilter =
    useMemo(() => {
      if (
        reviewFilter !==
        'duplicates'
      ) {
        return []
      }

      const seen =
        new Set<string>()
      const keys: string[] = []

      for (
        const row of filteredRows
      ) {
        const groupKey =
          duplicateMap.get(
            row.rowNumber
          )?.groupKey

        if (
          groupKey &&
          !seen.has(groupKey)
        ) {
          seen.add(groupKey)
          keys.push(groupKey)
        }
      }

      return keys
    }, [
      reviewFilter,
      filteredRows,
      duplicateMap,
    ])

  const regularRowsPerPage = 12
  const duplicateGroupsPerPage = 6

  const reviewPageCount =
    reviewFilter === 'duplicates'
      ? Math.max(
          1,
          Math.ceil(
            duplicateGroupKeysInFilter
              .length /
              duplicateGroupsPerPage
          )
        )
      : Math.max(
          1,
          Math.ceil(
            filteredRows.length /
              regularRowsPerPage
          )
        )

  const safeReviewPage =
    Math.min(
      reviewPage,
      reviewPageCount - 1
    )

  const visibleFilteredRows =
    useMemo(() => {
      if (
        reviewFilter ===
        'duplicates'
      ) {
        const visibleKeys =
          new Set(
            duplicateGroupKeysInFilter
              .slice(
                safeReviewPage *
                  duplicateGroupsPerPage,
                (
                  safeReviewPage +
                  1
                ) *
                  duplicateGroupsPerPage
              )
          )

        return filteredRows.filter(
          (row) => {
            const groupKey =
              duplicateMap.get(
                row.rowNumber
              )?.groupKey

            return Boolean(
              groupKey &&
              visibleKeys.has(
                groupKey
              )
            )
          }
        )
      }

      return filteredRows.slice(
        safeReviewPage *
          regularRowsPerPage,
        (
          safeReviewPage +
          1
        ) *
          regularRowsPerPage
      )
    }, [
      filteredRows,
      reviewFilter,
      duplicateGroupKeysInFilter,
      duplicateMap,
      safeReviewPage,
    ])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    setError(null)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      resetPreview()
      setError(
        'Please choose a .csv file. In Google Sheets, use File → Download → Comma Separated Values (.csv).'
      )
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      resetPreview()
      setError(
        'That CSV is larger than 10 MB. Please use a smaller export for this importer.'
      )
      return
    }

    try {
      const text = await file.text()
      const parsed = parseCsv(text)

      if (parsed.length < 2) {
        resetPreview()
        setError(
          'The CSV needs a header row and at least one survey response.'
        )
        return
      }

      const nextHeaders = parsed[0].map(
        (header, index) => header.trim() || `Column ${index + 1}`
      )

      const dataRows = parsed
        .slice(1)
        .filter((row) => row.some((cell) => cell.trim().length > 0))

      if (dataRows.length > MAX_ROWS) {
        resetPreview()
        setError(
          `This preview supports up to ${MAX_ROWS.toLocaleString()} survey rows at a time.`
        )
        return
      }

      const nextRows = dataRows.map((values) => {
        const row: CsvRow = {}

        nextHeaders.forEach((header, index) => {
          row[header] = values[index]?.trim() ?? ''
        })

        return row
      })

      setFileName(file.name)
      setHeaders(nextHeaders)
      setRows(nextRows)
      setMapping(autoMapColumns(nextHeaders))
      setOverrides({})
      setAcceptedWarnings({})
      setEditingRow(null)
      setReviewFilter('all')
      setIssueFilter(null)
      setDuplicateChoices({})
      setConfirmedDuplicateChoices({})
      setReviewPage(0)
      setExcludedRows(new Set())
      setImportResult(null)
      setImporting(false)
      clearMatchResults(true)
    } catch {
      resetPreview()
      setError(
        'I could not read that CSV. Please export it again from Google Sheets and try once more.'
      )
    }
  }

  function resetPreview() {
    setFileName(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setOverrides({})
    setAcceptedWarnings({})
    setEditingRow(null)
    setReviewFilter('all')
    setIssueFilter(null)
    setDuplicateChoices({})
    setConfirmedDuplicateChoices({})
    setReviewPage(0)
    setExcludedRows(new Set())
    setImportResult(null)
    setImporting(false)
    clearMatchResults(true)
  }

  function clearMatchResults(
    resetExistingReview = false
  ) {
    setMatchResults([])
    setMatchError(null)
    setCheckingMatches(false)
    setShowConfirm(false)
    setImportError(null)
    setCampaignMemberStudentIds(new Set())
    setCampaignContacts([])
    setCheckedCampaignId(null)

    if (resetExistingReview) {
      setExistingContactChoices({})
      setConfirmedExistingMatches({})
      setIdentityDirtyRows(new Set())
    }
  }

  function changeCampaign(campaignId: string) {
    setSelectedCampaignId(campaignId)
    clearMatchResults(true)
  }

  async function createDraftCampaign() {
    if (role !== 'admin') return

    if (
      !newAcademicYear.trim() ||
      !newCampaignLabel.trim() ||
      !newStartsOn ||
      !newEndsOn
    ) {
      setCampaignCreateError(
        'Academic year, campaign name, start date, and end date are required.'
      )
      return
    }

    setCreatingCampaign(true)
    setCampaignCreateError(null)

    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc(
      'admin_create_follow_up_campaign',
      {
        p_academic_year: newAcademicYear.trim(),
        p_label: newCampaignLabel.trim(),
        p_starts_on: newStartsOn,
        p_ends_on: newEndsOn,
      }
    )

    if (rpcError) {
      setCampaignCreateError(rpcError.message)
      setCreatingCampaign(false)
      return
    }

    const campaign = data as ImportCampaign
    setCampaigns((current) => [
      campaign,
      ...current.filter((item) => item.id !== campaign.id),
    ])
    setSelectedCampaignId(campaign.id)
    setShowCreateCampaign(false)
    setNewAcademicYear('')
    setNewCampaignLabel('')
    setNewStartsOn('')
    setNewEndsOn('')
    setCreatingCampaign(false)
    clearMatchResults(true)
  }

  function changeMapping(appField: string, csvColumn: string) {
    setOverrides({})
    setAcceptedWarnings({})
    setEditingRow(null)
    setDuplicateChoices({})
    setConfirmedDuplicateChoices({})
    setReviewPage(0)
    setExcludedRows(new Set())
    clearMatchResults(true)

    setMapping((current) => {
      const next = { ...current, [appField]: csvColumn }

      if (!csvColumn) delete next[appField]

      return next
    })
  }

  function updateRow(
    rowNumber: number,
    field: keyof RowOverride,
    value: string
  ) {
    const changesIdentity =
      field === 'uniqname' ||
      field === 'phone'

    if (changesIdentity) {
      setExistingContactChoices(
        (current) => {
          const next = {
            ...current,
          }
          delete next[rowNumber]
          return next
        }
      )

      setConfirmedExistingMatches(
        (current) => {
          const next = {
            ...current,
          }
          delete next[rowNumber]
          return next
        }
      )

      setIdentityDirtyRows(
        (current) => {
          const next =
            new Set(current)
          next.add(rowNumber)
          return next
        }
      )
    }

    setAcceptedWarnings(
      (current) => {
        const next = {
          ...current,
        }
        delete next[rowNumber]
        return next
      }
    )

    setOverrides((current) => ({
      ...current,
      [rowNumber]: {
        ...current[rowNumber],
        [field]: value,
      },
    }))
  }

  function resetRow(rowNumber: number) {
    setExistingContactChoices(
      (current) => {
        const next = {
          ...current,
        }
        delete next[rowNumber]
        return next
      }
    )

    setConfirmedExistingMatches(
      (current) => {
        const next = {
          ...current,
        }
        delete next[rowNumber]
        return next
      }
    )

    setIdentityDirtyRows(
      (current) => {
        const next =
          new Set(current)
        next.delete(rowNumber)
        return next
      }
    )

    setAcceptedWarnings(
      (current) => {
        const next = {
          ...current,
        }
        delete next[rowNumber]
        return next
      }
    )

    setOverrides((current) => {
      const next = { ...current }
      delete next[rowNumber]
      return next
    })
  }

  function approveRowAsIs(
    row: PreviewRow
  ) {
    if (
      row.issues.length === 0 ||
      !hasUsableFollowUpRoute(
        row
      )
    ) {
      return
    }

    setAcceptedWarnings(
      (current) => ({
        ...current,
        [row.rowNumber]:
          row.issues,
      })
    )

    setEditingRow(null)
  }

  function excludeAllSuggested() {
    const suggestedRowNumbers =
      importRows
        .filter(
          isSuggestedExclusionRow
        )
        .map(
          (row) =>
            row.rowNumber
        )

    setExcludedRows(
      (current) => {
        const next =
          new Set(current)

        for (
          const rowNumber of
          suggestedRowNumbers
        ) {
          next.add(rowNumber)
        }

        return next
      }
    )

  }

  function excludeRow(
    rowNumber: number
  ) {
    setExcludedRows(
      (current) => {
        const next =
          new Set(current)

        next.add(rowNumber)
        return next
      }
    )

  }

  function restoreRow(
    rowNumber: number
  ) {
    setExcludedRows(
      (current) => {
        const next =
          new Set(current)

        next.delete(rowNumber)
        return next
      }
    )

  }

  function chooseDuplicateSubmission(
    groupKey: string,
    rowNumber: number
  ) {
    setDuplicateChoices(
      (current) => ({
        ...current,
        [groupKey]: rowNumber,
      })
    )

    setConfirmedDuplicateChoices(
      (current) => ({
        ...current,
        [groupKey]: rowNumber,
      })
    )
  }

  function confirmDuplicateChoice(
    groupKey: string,
    rowNumber: number
  ) {
    setConfirmedDuplicateChoices(
      (current) => ({
        ...current,
        [groupKey]: rowNumber,
      })
    )
  }

  function confirmAllDuplicateChoices() {
    setConfirmedDuplicateChoices(
      (current) => {
        const next = {
          ...current,
        }

        for (
          const [
            groupKey,
            winnerRowNumber,
          ] of duplicateWinnerByGroup
        ) {
          next[groupKey] =
            winnerRowNumber
        }

        return next
      }
    )
  }

  function chooseExistingContactVersion(
    rowNumber: number,
    choice: ExistingContactChoice
  ) {
    setExistingContactChoices((current) => ({
      ...current,
      [rowNumber]: choice,
    }))

    setConfirmedExistingMatches(
      (current) => {
        const next = {
          ...current,
        }

        delete next[
          rowNumber
        ]

        return next
      }
    )

    setShowConfirm(false)
    setImportError(null)
  }

  function confirmExistingContactVersion(
    rowNumber: number
  ) {
    const matchedStudentId =
      matchMap.get(
        rowNumber
      )?.matched_student_id

    if (!matchedStudentId) {
      return
    }

    setConfirmedExistingMatches(
      (current) => ({
        ...current,
        [rowNumber]:
          matchedStudentId,
      })
    )

    setShowConfirm(false)
    setImportError(null)
  }

  function confirmAllRemainingExistingChoices() {
    setConfirmedExistingMatches(
      (current) => {
        const next = {
          ...current,
        }

        for (
          const rowNumber of
          alreadyInCampaignRowNumbers
        ) {
          const matchedStudentId =
            matchMap.get(
              rowNumber
            )?.matched_student_id

          if (matchedStudentId) {
            next[
              rowNumber
            ] =
              matchedStudentId
          }
        }

        return next
      }
    )

    setShowConfirm(false)
    setImportError(null)
  }

  function reopenExistingContactVersion(
    rowNumber: number
  ) {
    setConfirmedExistingMatches(
      (current) => {
        const next = {
          ...current,
        }

        delete next[
          rowNumber
        ]

        return next
      }
    )

    setShowConfirm(false)
    setImportError(null)
  }

  async function checkExistingStudents() {
    if (!requiredMapped || !selectedCampaignId) return

    setCheckingMatches(true)
    setMatchError(null)
    setCampaignMemberStudentIds(new Set())
    setCampaignContacts([])
    setCheckedCampaignId(null)

    const supabase = createClient()

    const payload = importRows.map((row) => ({
      row_number: row.rowNumber,
      name: row.name,
      uniqname: row.uniqname || null,
      phone: row.phoneNormalized || null,
    }))

    const { data, error: rpcError } = await supabase.rpc(
      'preview_survey_import_matches',
      {
        p_rows: payload,
      }
    )

    if (rpcError) {
      setMatchError(rpcError.message)
      setMatchResults([])
      setCheckingMatches(false)
      return
    }

    const nextMatches = (data ?? []) as MatchResult[]
    const matchedStudentIds = Array.from(
      new Set(
        nextMatches
          .map((result) => result.matched_student_id)
          .filter((id): id is string => Boolean(id))
      )
    )

    let nextCampaignMembers = new Set<string>()
    let nextCampaignContacts: CampaignContactSnapshot[] = []

    if (matchedStudentIds.length > 0) {
      const { data: campaignContactData, error: campaignContactError } =
        await supabase.rpc(
          'preview_survey_import_campaign_contacts',
          {
            p_campaign_id: selectedCampaignId,
            p_student_ids: matchedStudentIds,
          }
        )

      if (campaignContactError) {
        setMatchError(campaignContactError.message)
        setMatchResults([])
        setCheckingMatches(false)
        return
      }

      nextCampaignContacts =
        (campaignContactData ?? []) as CampaignContactSnapshot[]

      nextCampaignMembers = new Set(
        nextCampaignContacts.map((row) => row.student_id)
      )
    }

    const nextMatchMap =
      new Map(
        nextMatches.map(
          (result) => [
            result.row_number,
            result,
          ]
        )
      )

    const nextExistingRows =
      new Set<number>()

    for (const row of importRows) {
      const matchedStudentId =
        nextMatchMap.get(
          row.rowNumber
        )?.matched_student_id

      if (
        matchedStudentId &&
        nextCampaignMembers.has(
          matchedStudentId
        )
      ) {
        nextExistingRows.add(
          row.rowNumber
        )
      }
    }

    setExistingContactChoices(
      (current) => {
        const next:
          Record<
            number,
            ExistingContactChoice
          > = {}

        for (const [
          rowNumberRaw,
          choice,
        ] of Object.entries(
          current
        )) {
          const rowNumber =
            Number(
              rowNumberRaw
            )

          if (
            nextExistingRows.has(
              rowNumber
            )
          ) {
            next[
              rowNumber
            ] = choice
          }
        }

        return next
      }
    )

    setConfirmedExistingMatches(
      (current) => {
        const next:
          Record<
            number,
            string
          > = {}

        for (const [
          rowNumberRaw,
          confirmedStudentId,
        ] of Object.entries(
          current
        )) {
          const rowNumber =
            Number(
              rowNumberRaw
            )

          const currentStudentId =
            nextMatchMap.get(
              rowNumber
            )?.matched_student_id

          if (
            nextExistingRows.has(
              rowNumber
            ) &&
            currentStudentId ===
              confirmedStudentId
          ) {
            next[
              rowNumber
            ] =
              confirmedStudentId
          }
        }

        return next
      }
    )

    setMatchResults(nextMatches)
    setCampaignMemberStudentIds(nextCampaignMembers)
    setCampaignContacts(nextCampaignContacts)
    setIdentityDirtyRows(new Set())
    setCheckedCampaignId(selectedCampaignId)
    setCheckingMatches(false)
  }

  async function confirmImport() {
    if (!canImport || !fileName || !selectedCampaignId) {
      return
    }

    setImporting(true)
    setImportError(null)

    const supabase =
      createClient()

    const payload =
      reviewedRows.map(
        (row) => {
          const duplicate =
            duplicateMap.get(
              row.rowNumber
            )

          const isExcluded =
            excludedRows.has(
              row.rowNumber
            )

          const alreadyInCampaign =
            alreadyInCampaignRowNumbers.has(row.rowNumber)

          const useNewerSurvey =
            alreadyInCampaign &&
            existingContactChoices[row.rowNumber] === 'update'

          const action =
            duplicate?.skip ||
            isExcluded ||
            (alreadyInCampaign && !useNewerSurvey)
              ? 'skip'
              : useNewerSurvey
                ? 'update_existing'
                : 'import'

          const skipReason =
            duplicate?.skip
              ? `Repeat submission; kept row ${duplicate.winnerRowNumber}`
              : isExcluded
                ? 'Excluded during import review'
                : alreadyInCampaign && !useNewerSurvey
                  ? 'Already in selected campaign; existing contact kept unchanged'
                  : null

          return {
            row_number:
              row.rowNumber,
            action,
            skip_reason:
              skipReason,
            raw_data:
              rows[
                row.rowNumber -
                  2
              ] ?? {},
            issues:
              row.issues,
            accepted_issues:
              acceptedWarnings[
                row.rowNumber
              ] ?? [],
            name:
              row.name.trim(),
            uniqname:
              row.uniqname ||
              null,
            phone:
              row.phoneNormalized ||
              null,
            gender:
              row.gender ||
              null,
            year_at_um:
              row.year ||
              null,
            location:
              row.location ===
              'Wolverine Village'
                ? 'The Village'
                : CANONICAL_LOCATIONS.includes(
                      row.location
                    )
                  ? row.location
                  : null,
            house_name:
              row.house.trim() ||
              null,
            room_or_address:
              row.room.trim() ||
              null,
            jesus_interest:
              normalizeInterestForImport(
                row.jesus,
                'jesus'
              ),
            community_interest:
              normalizeInterestForImport(
                row.community,
                'standard'
              ),
            interview_interest:
              normalizeInterestForImport(
                row.interview,
                'standard'
              ),
            survey_submitted_at:
              normalizeTimestampForImport(
                row.submittedAt
              ),
            affinities_supplied:
              Boolean(mapping.affinities),
            affinities:
              row.affinities,
          }
        }
      )

    const {
      data,
      error: rpcError,
    } = await supabase.rpc(
      'import_survey_rows',
      {
        p_campaign_id:
          selectedCampaignId,
        p_filename:
          fileName,
        p_source_headers:
          headers,
        p_rows:
          payload,
      }
    )

    if (rpcError) {
      setImportError(
        rpcError.message
      )
      setImporting(false)
      setShowConfirm(false)
      return
    }

    setImportResult(
      data as ImportResult
    )
    setImporting(false)
    setShowConfirm(false)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
            Import Survey
          </p>

          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
            Preview Google Form responses
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">
            Follow Up automatically cleans common formatting and location aliases.
            Review anything ambiguous here before importing.
          </p>
        </div>

        <span className="rounded-full bg-[#ecfdf3] px-3 py-1.5 text-[10px] font-extrabold text-[#027a48]">
          {importResult
            ? 'Imported • database updated'
            : 'Preview only • no database changes'}
        </span>
      </div>

      <section className="mt-5 rounded-[18px] border border-[#dbe8f8] bg-[#f8fbff] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
              Destination campaign
            </p>
            <h3 className="mt-1 text-base font-extrabold text-[#15223a]">
              Choose where these contacts belong
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
              Imports add new contacts without replacing a campaign. When a student is already in the selected campaign, you can keep the current survey version or deliberately use the newer CSV response. Archived campaigns cannot receive imports.
            </p>
          </div>

          {selectedCampaign && (
            <span
              className={[
                'rounded-full px-3 py-1.5 text-[10px] font-extrabold',
                selectedCampaign.status === 'active'
                  ? 'bg-[#ecfdf3] text-[#027a48]'
                  : 'bg-[#fff8eb] text-[#b54708]',
              ].join(' ')}
            >
              {selectedCampaign.status === 'active' ? 'Active' : 'Draft'}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
              Campaign
            </span>
            <select
              value={selectedCampaignId}
              onChange={(event) => changeCampaign(event.target.value)}
              className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#344054]"
            >
              {campaigns.length === 0 && (
                <option value="">No active or draft campaigns</option>
              )}
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.label} — {campaign.academic_year}
                  {campaign.status === 'active' ? ' (Active)' : ' (Draft)'}
                </option>
              ))}
            </select>
          </label>

          {role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setShowCreateCampaign((current) => !current)
                setCampaignCreateError(null)
              }}
              className="rounded-[11px] border border-[#98a2b3] bg-white px-4 py-2.5 text-xs font-extrabold text-[#475467] hover:border-[#667085]"
            >
              {showCreateCampaign ? 'Cancel new campaign' : 'Create new campaign'}
            </button>
          )}
        </div>

        {campaigns.length === 0 && role !== 'admin' && (
          <div className="mt-3 rounded-[12px] border border-[#fedf89] bg-[#fff8eb] px-3 py-3 text-xs font-semibold text-[#b54708]">
            There is no active or draft campaign available. Ask an Admin to create one before importing.
          </div>
        )}

        {showCreateCampaign && role === 'admin' && (
          <div className="mt-4 rounded-[14px] border border-[#e4e7ec] bg-white p-4">
            <div className="text-sm font-extrabold text-[#15223a]">
              Create a draft campaign
            </div>
            <p className="mt-1 text-xs leading-5 text-[#667085]">
              Creating it does not make it live. You can import into the draft now and activate it later from Campaigns.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">Academic year</span>
                <input
                  value={newAcademicYear}
                  onChange={(event) => setNewAcademicYear(event.target.value)}
                  placeholder="2027–28"
                  className="w-full rounded-[10px] border border-[#d0d5dd] px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">Campaign name</span>
                <input
                  value={newCampaignLabel}
                  onChange={(event) => setNewCampaignLabel(event.target.value)}
                  placeholder="2027–28 Follow Up"
                  className="w-full rounded-[10px] border border-[#d0d5dd] px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">Starts</span>
                <input
                  type="date"
                  value={newStartsOn}
                  onChange={(event) => setNewStartsOn(event.target.value)}
                  className="w-full rounded-[10px] border border-[#d0d5dd] px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">Ends</span>
                <input
                  type="date"
                  value={newEndsOn}
                  onChange={(event) => setNewEndsOn(event.target.value)}
                  className="w-full rounded-[10px] border border-[#d0d5dd] px-3 py-2.5 text-sm"
                />
              </label>
            </div>

            {campaignCreateError && (
              <div className="mt-3 rounded-[11px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2.5 text-xs font-semibold text-[#b42318]">
                {campaignCreateError}
              </div>
            )}

            <button
              type="button"
              disabled={creatingCampaign}
              onClick={createDraftCampaign}
              className="mt-4 rounded-[11px] bg-[#00274c] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#113a67] disabled:cursor-wait disabled:bg-[#667085]"
            >
              {creatingCampaign ? 'Creating…' : 'Create draft campaign'}
            </button>
          </div>
        )}
      </section>

      {!fileName && (
        <section className="mt-5 rounded-[20px] border border-dashed border-[#98a2b3] bg-white p-6 text-center md:p-9">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-[#eef4ff] text-2xl font-black text-[#175cd3]">
            ↑
          </div>

          <h3 className="mt-4 text-lg font-extrabold text-[#15223a]">
            Choose your survey CSV
          </h3>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#667085]">
            Export the Google Form response sheet as a comma-separated CSV.
            Nothing will be saved from this screen.
          </p>

          <label
            className={[
              'mt-5 inline-flex rounded-[12px] px-4 py-3 text-sm font-extrabold text-white transition',
              selectedCampaignId
                ? 'cursor-pointer bg-[#00274c] hover:bg-[#113a67]'
                : 'cursor-not-allowed bg-[#98a2b3]',
            ].join(' ')}
          >
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={!selectedCampaignId}
              onChange={handleFile}
            />
          </label>
        </section>
      )}

      {error && (
        <div className="mt-4 rounded-[16px] border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm font-semibold leading-5 text-[#b42318]">
          {error}
        </div>
      )}

      {fileName && (
        <>
          <section className="mt-5 rounded-[18px] border border-[#e4e7ec] bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-[#15223a]">
                  {fileName}
                </div>

                <div className="mt-1 text-xs font-semibold text-[#667085]">
                  {rows.length.toLocaleString()} source {rows.length === 1 ? 'response' : 'responses'}
                  {' • '}
                  {importRows.length.toLocaleString()} import candidates
                  {' • '}
                  {headers.length} {headers.length === 1 ? 'column' : 'columns'}
                </div>
              </div>

              <label className="cursor-pointer rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-extrabold text-[#475467] transition hover:border-[#98a2b3]">
                Choose different CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={handleFile}
                />
              </label>
            </div>
          </section>

          {duplicatesSkipped > 0 && (
            <div className="mt-4 rounded-[16px] border border-[#dbe8f8] bg-[#f8fbff] px-4 py-3">
              <div className="text-sm font-extrabold text-[#15223a]">
                {duplicatesSkipped} repeat {duplicatesSkipped === 1 ? 'submission' : 'submissions'} will be skipped
              </div>

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {duplicateGroups} {duplicateGroups === 1 ? 'student appears' : 'students appear'} more than once by uniqname or, when no uniqname was provided, by the same plausible phone number.
                Follow Up recommends the strongest response using data quality — especially a plausible phone number, known dorm/location, room or address, and overall completeness.
                Timestamp is shown for context but is not used to choose the response. You can override any recommendation under Duplicate Submissions.
              </p>
            </div>
          )}

          <section className="mt-5">
            {hasUnsavedImportWork && (
              <div className="mb-3 rounded-[12px] border border-[#fedf89] bg-[#fffaf0] px-3 py-2.5 text-xs font-semibold leading-5 text-[#667085]">
                Import review is not saved until you complete the import. If you use the browser Back button, reload, or close this page, Follow Up will warn you before leaving.
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                  Step 1
                </p>

                <h3 className="mt-1 text-lg font-extrabold text-[#15223a]">
                  Confirm column mapping
                </h3>
              </div>

              {!requiredMapped && (
                <span className="rounded-full bg-[#fff8eb] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708]">
                  Full name must be mapped
                </span>
              )}
            </div>

            <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e4e7ec] bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] border-b border-[#e4e7ec] bg-[#f9fafb] px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                <span>Follow Up field</span>
                <span>CSV column</span>
              </div>

              {APP_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 border-b border-[#eef0f3] px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#15223a]">
                      {field.label}

                      {field.required && (
                        <span className="ml-1 text-[#b42318]">*</span>
                      )}
                    </div>

                    {field.key === 'uniqname' && (
                      <div className="mt-1 text-[10px] font-semibold text-[#98a2b3]">
                        Removes @umich.edu, extra @umich.edu, spaces, and capitalization automatically.
                      </div>
                    )}

                    {field.key === 'phone' && (
                      <div className="mt-1 text-[10px] font-semibold text-[#98a2b3]">
                        Phone formatting is normalized automatically.
                      </div>
                    )}

                    {field.key === 'location' && (
                      <div className="mt-1 text-[10px] font-semibold text-[#98a2b3]">
                        Common aliases like MoJo, Mary Markley, Barbour, and Newberry are normalized.
                      </div>
                    )}

                    {field.key === 'affinities' && (
                      <div className="mt-1 text-[10px] font-semibold text-[#98a2b3]">
                        One check-all-that-apply column can create multiple ministry affinities.
                      </div>
                    )}
                  </div>

                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) =>
                      changeMapping(field.key, event.target.value)
                    }
                    className="min-w-0 rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#475467]"
                  >
                    <option value="">Don&apos;t import</option>

                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-[18px] border border-[#dbe8f8] bg-[#f8fbff] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-[#15223a]">
                  Check against existing students
                </div>

                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                  Follow Up identifies the student by U-M uniqname first, then by phone when needed, and checks whether that student is already in {selectedCampaign?.label ?? 'the selected campaign'}.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  !selectedCampaignId ||
                  !requiredMapped ||
                  checkingMatches ||
                  importRows.length === 0
                }
                onClick={checkExistingStudents}
                className="rounded-[11px] bg-[#00274c] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#113a67] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
              >
                {checkingMatches
                  ? 'Checking...'
                  : matchResults.length > 0
                    ? 'Check again'
                    : 'Check existing students'}
              </button>
            </div>

            {matchError && (
              <div className="mt-3 rounded-[12px] border border-[#fecdca] bg-[#fef3f2] px-3 py-2.5 text-xs font-semibold text-[#b42318]">
                {matchError}
              </div>
            )}

            {matchResults.length > 0 && (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MatchSummary
                    value={counts.existing}
                    label="Existing"
                    tone="blue"
                  />

                  <MatchSummary
                    value={counts.new}
                    label="New"
                    tone="green"
                  />

                  <MatchSummary
                    value={counts.needsReview}
                    label="Needs review"
                    tone="warn"
                  />
                </div>

                {alreadyInCampaignCount > 0 && (
                  <div className="mt-3 rounded-[12px] border border-[#b2ccff] bg-[#eef4ff] px-3 py-3 text-xs font-semibold leading-5 text-[#3538cd]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="max-w-3xl">
                        {alreadyInCampaignCount.toLocaleString()} {alreadyInCampaignCount === 1 ? 'student is' : 'students are'} already in {selectedCampaign?.label ?? 'this campaign'}. Choose <strong>Keep current</strong> or <strong>Use newer survey</strong> where you want to review them individually. {unresolvedExistingChoiceCount.toLocaleString()} {unresolvedExistingChoiceCount === 1 ? 'choice still needs' : 'choices still need'} confirmation.
                      </div>

                      {unresolvedExistingChoiceCount > 0 && (
                        <button
                          type="button"
                          onClick={confirmAllRemainingExistingChoices}
                          className="rounded-[9px] border border-[#6172f3] bg-white px-3 py-2 text-[10px] font-extrabold text-[#3538cd] hover:bg-[#f5f8ff]"
                        >
                          Confirm all remaining choices
                        </button>
                      )}
                    </div>

                    {unresolvedExistingChoiceCount > 0 && (
                      <div className="mt-2 text-[10px] leading-4 text-[#475467]">
                        Any row where you already selected <strong>Use newer survey</strong> keeps that selection. Rows you have not changed keep the default <strong>Keep current</strong>.
                      </div>
                    )}
                  </div>
                )}

                {reviewBreakdown.length > 0 && (
                  <div className="mt-3 rounded-[12px] border border-[#fedf89] bg-white px-3 py-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                      Needs Review breakdown
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {reviewBreakdown.map(
                        (item) => (
                          <span
                            key={
                              item.status
                            }
                            className="rounded-full bg-[#fff8eb] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708]"
                          >
                            {item.count}{' '}
                            {item.label.replace(
                              'Needs review • ',
                              ''
                            )}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="mt-6">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                Step 2
              </p>

              <h3 className="mt-1 text-lg font-extrabold text-[#15223a]">
                Review & fix responses
              </h3>

              <p className="mt-1 text-xs leading-5 text-[#667085]">
                Auto-fixes are already applied. Use the filters to isolate anything
                that still needs a person to review.
              </p>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <FilterButton
                active={reviewFilter === 'all'}
                label="All"
                count={counts.all}
                onClick={() => { setIssueFilter(null); setReviewFilter('all') }}
              />

              <FilterButton
                active={reviewFilter === 'ready'}
                label="Ready"
                count={counts.ready}
                onClick={() => { setIssueFilter(null); setReviewFilter('ready') }}
              />

              <FilterButton
                active={reviewFilter === 'existing'}
                label="Existing"
                count={counts.existing}
                onClick={() => { setIssueFilter(null); setReviewFilter('existing') }}
                attention
              />

              <FilterButton
                active={reviewFilter === 'new'}
                label="New"
                count={counts.new}
                onClick={() => { setIssueFilter(null); setReviewFilter('new') }}
              />

              <FilterButton
                active={reviewFilter === 'needs_review'}
                label="Needs Review"
                count={counts.needsReview}
                onClick={() => { setIssueFilter(null); setReviewFilter('needs_review') }}
                attention
              />

              <FilterButton
                active={reviewFilter === 'csv_warnings'}
                label="CSV Warnings"
                count={counts.csvWarnings}
                onClick={() => { setIssueFilter(null); setReviewFilter('csv_warnings') }}
                attention
              />

              <FilterButton
                active={reviewFilter === 'duplicates'}
                label="Duplicate Submissions"
                count={counts.duplicates}
                onClick={() => { setIssueFilter(null); setReviewFilter('duplicates') }}
                attention
              />

              <FilterButton
                active={reviewFilter === 'suggested_exclusions'}
                label="Suggested Exclusions"
                count={counts.suggestedExclusions}
                onClick={() => { setIssueFilter(null); setReviewFilter('suggested_exclusions') }}
                attention
              />

              <FilterButton
                active={reviewFilter === 'excluded'}
                label="Excluded"
                count={counts.excluded}
                onClick={() => { setIssueFilter(null); setReviewFilter('excluded') }}
              />
            </div>

            {warningBreakdown.length > 0 && (
              <div className="mt-3 rounded-[14px] border border-[#fedf89] bg-[#fffaf0] p-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                  CSV warning breakdown
                </div>

                <div className="mt-1 text-[10px] font-semibold text-[#667085]">
                  Click a warning type to isolate those rows. Unrecognized affinity/location values and ambiguous House / Room entries show the source values for review.
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {warningBreakdown.map(
                    (item) => (
                      <button
                        type="button"
                        key={item.label}
                        onClick={() => {
                          setIssueFilter(item.label)
                          setReviewFilter('csv_warnings')
                        }}
                        className={[
                          'rounded-full bg-white px-2.5 py-1.5 text-[10px] font-extrabold text-[#b54708] shadow-[inset_0_0_0_1px_#fedf89] transition hover:bg-[#fff4dc]',
                          issueFilter === item.label
                            ? 'ring-2 ring-[#fdb022]'
                            : '',
                        ].join(' ')}
                      >
                        {item.count}{' '}
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {reviewFilter === 'csv_warnings' && (
              <div className="mt-3 rounded-[12px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2.5 text-xs leading-5 text-[#475467]">
                If a row is imperfect but still has a usable phone, U-M identity, or valid dorm route, use <strong>Approve as-is</strong>. This clears the CSV warning without inventing data. Editing the row automatically removes that approval so the corrected values are reviewed again.
              </div>
            )}

            {reviewFilter === 'existing' && (
              <div className="mt-3 rounded-[12px] border border-[#b2ccff] bg-[#eef4ff] px-3 py-2.5 text-xs leading-5 text-[#475467]">
                This view shows only existing campaign contacts whose <strong>Keep current</strong> or <strong>Use newer survey</strong> choice still needs confirmation. Each confirmed row disappears immediately and the Existing count decreases by one.
              </div>
            )}

            {reviewFilter === 'duplicates' && (
              <div className="mt-3 rounded-[12px] border border-[#dbe8f8] bg-[#f8fbff] px-3 py-2.5 text-xs leading-5 text-[#475467]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-3xl">
                    Duplicate submissions are grouped by uniqname first, or by the same plausible phone number when neither row has a uniqname. The recommended response appears first in each group. Click <strong>Accept recommendation</strong> to approve it, or <strong>Keep this one</strong> on another response to override and approve that choice.
                  </div>

                  {unresolvedDuplicateGroupCount > 0 && (
                    <button
                      type="button"
                      onClick={confirmAllDuplicateChoices}
                      className="rounded-[9px] border border-[#6172f3] bg-white px-3 py-2 text-[10px] font-extrabold text-[#3538cd] hover:bg-[#f5f8ff]"
                    >
                      Accept all {unresolvedDuplicateGroupCount} recommendations
                    </button>
                  )}
                </div>
              </div>
            )}

            {reviewFilter === 'csv_warnings' &&
              issueFilter ===
                'Missing name' && (
                <div className="mt-3 rounded-[12px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-2.5 text-xs leading-5 text-[#475467]">
                  A missing name does not block import when the row still has a usable follow-up route. You do not need to invent a placeholder name. Staff can recover the name later by email/uniqname lookup, text, or a dorm visit.
                </div>
              )}

            {reviewFilter === 'suggested_exclusions' && (
              <div className="mt-3 rounded-[12px] border border-[#fedf89] bg-[#fffaf0] px-3 py-3 text-xs leading-5 text-[#475467]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-3xl">
                    These rows are not useful enough for follow-up as entered. For a named student with no usable phone or complete dorm + room, search the name in{' '}
                    <a
                      href="https://mcommunity.umich.edu/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-extrabold text-[#175cd3] hover:underline"
                    >
                      MCommunity
                    </a>
                    {' '}for a uniqname before excluding. A nameless response with a plausible phone number is still a valid contact and can be imported without inventing a uniqname or name.
                  </div>

                  {counts.suggestedExclusions > 0 && (
                    <button
                      type="button"
                      onClick={excludeAllSuggested}
                      className="rounded-[10px] border border-[#fda29b] bg-white px-3 py-2 text-[10px] font-extrabold text-[#b42318] hover:border-[#f97066]"
                    >
                      Exclude all {counts.suggestedExclusions}
                    </button>
                  )}
                </div>
              </div>
            )}

            {reviewFilter === 'excluded' && (
              <div className="mt-3 rounded-[12px] border border-[#d0d5dd] bg-[#f9fafb] px-3 py-2.5 text-xs leading-5 text-[#475467]">
                Excluded rows will not be imported. Exclusion is reversible here and does not change the original CSV.
              </div>
            )}

            {issueFilter && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#fedf89] bg-white px-3 py-2.5">
                <div className="text-xs font-extrabold text-[#b54708]">
                  Showing only: {issueFilter}
                </div>

                <button
                  type="button"
                  onClick={() => setIssueFilter(null)}
                  className="text-[10px] font-extrabold text-[#475467] hover:underline"
                >
                  Show all CSV warnings
                </button>
              </div>
            )}

            {!requiredMapped ? (
              <div className="mt-3 rounded-[16px] border border-[#fedf89] bg-[#fff8eb] p-4 text-sm font-semibold text-[#b54708]">
                Map the Full name field above before reviewing the rows.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="mt-3 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-6 text-center text-sm text-[#667085]">
                No rows match this review filter.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-[18px] border border-[#e4e7ec] bg-white">
                <table className="min-w-[1280px] w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#e4e7ec] bg-[#f9fafb] text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#667085]">
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">U-M identity</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Affinities</th>
                      <th className="px-4 py-3">Database match</th>
                      <th className="px-4 py-3">Review</th>
                      <th className="px-4 py-3">Fix</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleFilteredRows.map((row) => {
                      const isEditing = editingRow === row.rowNumber

                      return (
                        <Fragment key={row.rowNumber}>
                          <tr className="border-b border-[#eef0f3] align-top">
                            <td className="px-4 py-3 text-xs font-bold text-[#98a2b3]">
                              {row.rowNumber}
                            </td>

                            <td className="px-4 py-3 text-sm font-extrabold text-[#15223a]">
                              {row.name || 'Missing name'}
                            </td>

                            <td className="px-4 py-3 text-xs leading-5 text-[#667085]">
                              {row.uniqname ? (
                                <>
                                  <div className="font-bold text-[#475467]">
                                    {row.uniqname}
                                  </div>
                                  <div>{row.email}</div>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>

                            <td className="px-4 py-3 text-xs font-semibold text-[#475467]">
                              {row.phoneNormalized
                                ? formatPhone(row.phoneNormalized)
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-xs leading-5 text-[#667085]">
                              {[row.location, row.house, row.room]
                                .filter(Boolean)
                                .join(' • ') || '—'}
                            </td>

                            <td className="px-4 py-3 text-xs font-semibold text-[#475467]">
                              {row.affinities.length > 0 ? (
                                <div className="flex max-w-[220px] flex-wrap gap-1">
                                  {row.affinities.map((affinity) => (
                                    <span
                                      key={affinity}
                                      className="rounded-full bg-[#f4f3ff] px-2 py-1 text-[9px] font-extrabold text-[#5925dc]"
                                    >
                                      {affinity}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {duplicateMap.get(row.rowNumber)?.skip ? (
                                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[9px] font-extrabold text-[#475467]">
                                  Skipped repeat
                                </span>
                              ) : (
                                <DatabaseMatchBadge
                                  row={row}
                                  result={matchMap.get(row.rowNumber)}
                                  alreadyInCampaign={alreadyInCampaignRowNumbers.has(row.rowNumber)}
                                  campaignContact={
                                    matchMap.get(row.rowNumber)?.matched_student_id
                                      ? campaignContactMap.get(
                                          matchMap.get(row.rowNumber)!.matched_student_id!
                                        )
                                      : undefined
                                  }
                                  choice={existingContactChoices[row.rowNumber] ?? 'keep'}
                                  confirmed={
                                    Boolean(
                                      matchMap.get(
                                        row.rowNumber
                                      )?.matched_student_id
                                    ) &&
                                    confirmedExistingMatches[
                                      row.rowNumber
                                    ] ===
                                      matchMap.get(
                                        row.rowNumber
                                      )?.matched_student_id
                                  }
                                  affinitiesMapped={Boolean(mapping.affinities)}
                                  onChoice={(choice) =>
                                    chooseExistingContactVersion(
                                      row.rowNumber,
                                      choice
                                    )
                                  }
                                  onConfirm={() =>
                                    confirmExistingContactVersion(
                                      row.rowNumber
                                    )
                                  }
                                  onReopen={() =>
                                    reopenExistingContactVersion(
                                      row.rowNumber
                                    )
                                  }
                                />
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <RowReview
                                row={row}
                                duplicate={duplicateMap.get(
                                  row.rowNumber
                                )}
                                onChooseDuplicate={
                                  chooseDuplicateSubmission
                                }
                                onConfirmDuplicate={
                                  confirmDuplicateChoice
                                }
                              />
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex flex-col items-start gap-2">
                                {excludedRows.has(
                                  row.rowNumber
                                ) ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      restoreRow(
                                        row.rowNumber
                                      )
                                    }
                                    className="rounded-[9px] border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-[10px] font-extrabold text-[#475467] hover:border-[#98a2b3]"
                                  >
                                    Restore
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingRow(
                                          isEditing
                                            ? null
                                            : row.rowNumber
                                        )
                                      }
                                      className="rounded-[9px] border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-[10px] font-extrabold text-[#475467] hover:border-[#98a2b3]"
                                    >
                                      {isEditing
                                        ? 'Close'
                                        : 'Edit'}
                                    </button>

                                    {row.issues.length > 0 &&
                                      hasUsableFollowUpRoute(
                                        row
                                      ) && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            approveRowAsIs(
                                              row
                                            )
                                          }
                                          className="rounded-[9px] border border-[#6ce9a6] bg-[#ecfdf3] px-2.5 py-1.5 text-[10px] font-extrabold text-[#027a48] hover:border-[#32d583]"
                                        >
                                          Approve as-is
                                        </button>
                                      )}

                                    {isSuggestedExclusionRow(
                                      row
                                    ) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          excludeRow(
                                            row.rowNumber
                                          )
                                        }
                                        className="rounded-[9px] border border-[#fda29b] bg-[#fff6f5] px-2.5 py-1.5 text-[10px] font-extrabold text-[#b42318] hover:border-[#f97066]"
                                      >
                                        Exclude from import
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isEditing && (
                            <tr className="border-b border-[#e4e7ec] bg-[#f8fbff]">
                              <td colSpan={9} className="px-4 py-4">
                                <RowEditor
                                  row={row}
                                  hasOverride={Boolean(overrides[row.rowNumber])}
                                  onChange={(field, value) =>
                                    updateRow(row.rowNumber, field, value)
                                  }
                                  onReset={() => resetRow(row.rowNumber)}
                                  onDone={() => setEditingRow(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>

                {reviewPageCount > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e7ec] bg-[#f9fafb] px-4 py-3 text-xs font-semibold text-[#667085]">
                    <div>
                      {reviewFilter === 'duplicates'
                        ? `Showing duplicate groups ${
                            safeReviewPage *
                              duplicateGroupsPerPage +
                            1
                          }–${Math.min(
                            (
                              safeReviewPage +
                              1
                            ) *
                              duplicateGroupsPerPage,
                            duplicateGroupKeysInFilter.length
                          )} of ${duplicateGroupKeysInFilter.length}`
                        : `Page ${
                            safeReviewPage +
                            1
                          } of ${reviewPageCount}`}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={safeReviewPage === 0}
                        onClick={() =>
                          setReviewPage(
                            Math.max(
                              0,
                              safeReviewPage - 1
                            )
                          )
                        }
                        className="rounded-[8px] border border-[#d0d5dd] bg-white px-3 py-1.5 text-[10px] font-extrabold text-[#475467] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                      >
                        Previous
                      </button>

                      <button
                        type="button"
                        disabled={
                          safeReviewPage >=
                          reviewPageCount - 1
                        }
                        onClick={() =>
                          setReviewPage(
                            Math.min(
                              reviewPageCount - 1,
                              safeReviewPage + 1
                            )
                          )
                        }
                        className="rounded-[8px] border border-[#d0d5dd] bg-white px-3 py-1.5 text-[10px] font-extrabold text-[#475467] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {importResult ? (
            <section className="mt-6 rounded-[20px] border border-[#abefc6] bg-[#ecfdf3] p-5">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#027a48]">
                Import complete
              </div>

              <h3 className="mt-1 text-lg font-extrabold text-[#15223a]">
                Survey responses are now in Follow Up.
              </h3>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <FinalStat
                  value={importResult.imported_rows}
                  label="Rows imported"
                />
                <FinalStat
                  value={importResult.skipped_rows}
                  label="Rows skipped"
                />
                <FinalStat
                  value={importResult.contacts_created}
                  label="Contacts created"
                />
                <FinalStat
                  value={importResult.contacts_updated}
                  label="Existing refreshed"
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-[#475467]">
                {importResult.students_created.toLocaleString()} new student records were created and{' '}
                {importResult.students_reused.toLocaleString()} existing student records were reused.
                Import ID: <span className="font-mono">{importResult.import_id}</span>
              </p>

              <button
                type="button"
                onClick={resetPreview}
                className="mt-4 rounded-[11px] border border-[#98a2b3] bg-white px-4 py-2.5 text-xs font-extrabold text-[#475467] hover:border-[#667085]"
              >
                Import another CSV
              </button>
            </section>
          ) : (
            <section className="mt-6 rounded-[20px] border border-[#dbe8f8] bg-[#f8fbff] p-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                Step 3
              </p>

              <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-extrabold text-[#15223a]">
                    Confirm import
                  </h3>

                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                    Nothing has been written to the database yet. Confirming will add new contacts to {selectedCampaign?.label ?? 'the selected campaign'} and refresh only the existing contacts where you explicitly chose <strong>Use newer survey</strong>. Follow Up status, assignment, knocks, interactions, and history are preserved.
                  </p>
                </div>

                <div
                  className={[
                    'rounded-full px-3 py-1.5 text-[10px] font-extrabold',
                    databaseCheckCurrent
                      ? 'bg-[#ecfdf3] text-[#027a48]'
                      : 'bg-[#fff8eb] text-[#b54708]',
                  ].join(' ')}
                >
                  {databaseCheckCurrent
                    ? 'Database check current'
                    : 'Run database check first'}
                </div>
              </div>

              {identityDirtyRows.size > 0 && (
                <div className="mt-3 rounded-[12px] border border-[#fedf89] bg-[#fffaf0] px-3 py-2.5 text-xs leading-5 text-[#667085]">
                  You changed a phone number or uniqname on {identityDirtyRows.size} {identityDirtyRows.size === 1 ? 'row' : 'rows'}. Those rows are no longer counted under <strong>Needs Review</strong>. Keep fixing the rest, then run <strong>Check existing students</strong> once when you are finished to refresh those identity matches before import.
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <FinalStat
                  value={rowsToAdd.length}
                  label="New contacts to add"
                />
                <FinalStat
                  value={rowsToUpdate.length}
                  label="Existing to refresh"
                />
                <FinalStat
                  value={existingContactsKeptCount}
                  label="Existing kept"
                />
                <FinalStat
                  value={duplicatesSkipped}
                  label="Repeat submissions skipped"
                />
                <FinalStat
                  value={excludedPreviewRows.length}
                  label="Excluded"
                />
              </div>

              {actionableBlockingCsvCount > 0 ||
              actionableNeedsReview > 0 ||
              actionableSuggestedExclusions > 0 ||
              unresolvedExistingChoiceCount > 0 ||
              unresolvedDuplicateGroupCount > 0 ? (
                <div className="mt-4 rounded-[12px] border border-[#fedf89] bg-[#fff8eb] px-3 py-3 text-xs font-semibold leading-5 text-[#b54708]">
                  Import is still blocked for contacts that will be added or refreshed: {unresolvedExistingChoiceCount} existing-contact {unresolvedExistingChoiceCount === 1 ? 'choice needs' : 'choices need'} confirmation, {unresolvedDuplicateGroupCount} duplicate {unresolvedDuplicateGroupCount === 1 ? 'group needs' : 'groups need'} confirmation, {actionableBlockingCsvCount} blocking CSV {actionableBlockingCsvCount === 1 ? 'issue' : 'issues'}, {actionableNeedsReview} database {actionableNeedsReview === 1 ? 'review' : 'reviews'}, and {actionableSuggestedExclusions} suggested {actionableSuggestedExclusions === 1 ? 'exclusion' : 'exclusions'} remain.
                </div>
              ) : !databaseCheckCurrent ? (
                <div className="mt-4 rounded-[12px] border border-[#fedf89] bg-[#fff8eb] px-3 py-3 text-xs font-semibold leading-5 text-[#b54708]">
                  The rows have changed since the last database identity check. Click <strong>Check again</strong> above before confirming the import.
                </div>
              ) : (
                <div className="mt-4 rounded-[12px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-3 text-xs font-semibold leading-5 text-[#027a48]">
                  Ready to import. The {nonBlockingWarningCount} non-blocking {nonBlockingWarningCount === 1 ? 'warning does' : 'warnings do'} not prevent import; these include usable contacts whose names can be recovered during follow-up.
                </div>
              )}

              {importError && (
                <div className="mt-4 rounded-[12px] border border-[#fecdca] bg-[#fef3f2] px-3 py-3 text-xs font-semibold leading-5 text-[#b42318]">
                  Import failed and no partial import was committed: {importError}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canImport}
                  onClick={() =>
                    setShowConfirm(
                      true
                    )
                  }
                  className={[
                    'rounded-[12px] px-4 py-3 text-sm font-extrabold transition',
                    canImport
                      ? 'bg-[#00274c] text-white hover:bg-[#113a67]'
                      : 'cursor-not-allowed bg-[#e4e7ec] text-[#98a2b3]',
                  ].join(' ')}
                >
                  Confirm Import
                </button>

                <span className="text-[10px] font-semibold text-[#667085]">
                  This is the first action on this page that writes survey data to Supabase.
                </span>
              </div>
            </section>
          )}

          {showConfirm && !importResult && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-import-title"
                className="w-full max-w-lg rounded-[20px] bg-white p-5 shadow-2xl"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
                  Final confirmation
                </div>

                <h3
                  id="confirm-import-title"
                  className="mt-1 text-xl font-extrabold text-[#15223a]"
                >
                  Import into {selectedCampaign?.label ?? 'this campaign'}?
                </h3>

                <p className="mt-2 text-sm leading-6 text-[#667085]">
                  Follow Up will add {rowsToAdd.length.toLocaleString()} new {rowsToAdd.length === 1 ? 'contact' : 'contacts'} and refresh {rowsToUpdate.length.toLocaleString()} existing {rowsToUpdate.length === 1 ? 'contact' : 'contacts'} from the newer survey response. {existingContactsKeptCount.toLocaleString()} existing {existingContactsKeptCount === 1 ? 'contact will' : 'contacts will'} keep the current survey version. {excludedPreviewRows.length.toLocaleString()} excluded rows and {duplicatesSkipped.toLocaleString()} repeat submissions will be recorded as skipped in import history.
                </p>

                {nonBlockingWarningCount > 0 && (
                  <div className="mt-4 rounded-[12px] border border-[#abefc6] bg-[#ecfdf3] px-3 py-3 text-xs leading-5 text-[#475467]">
                    {nonBlockingWarningCount} imported {nonBlockingWarningCount === 1 ? 'row has' : 'rows have'} a non-blocking warning. These are intentionally allowed by the review rules.
                  </div>
                )}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() =>
                      setShowConfirm(
                        false
                      )
                    }
                    className="rounded-[11px] border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm font-extrabold text-[#475467]"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={confirmImport}
                    className={[
                      'rounded-[11px] px-4 py-2.5 text-sm font-extrabold text-white',
                      importing
                        ? 'cursor-wait bg-[#667085]'
                        : 'bg-[#00274c] hover:bg-[#113a67]',
                    ].join(' ')}
                  >
                    {importing
                      ? 'Importing…'
                      : `Import ${rowsToWrite.length.toLocaleString()} changes`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FinalStat({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="rounded-[12px] border border-[#e4e7ec] bg-white px-3 py-3 text-center">
      <div className="text-xl font-black leading-none text-[#15223a]">
        {value.toLocaleString()}
      </div>
      <div className="mt-1.5 text-[10px] font-extrabold text-[#667085]">
        {label}
      </div>
    </div>
  )
}

function FilterButton({
  active,
  label,
  count,
  onClick,
  attention = false,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
  attention?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold transition',
        active
          ? 'border-[#00274c] bg-[#00274c] text-white'
          : attention && count > 0
            ? 'border-[#fda29b] bg-[#fef3f2] text-[#b42318]'
            : 'border-[#d0d5dd] bg-white text-[#475467] hover:border-[#98a2b3]',
      ].join(' ')}
    >
      {label} <span className="opacity-75">{count}</span>
    </button>
  )
}

function RowEditor({
  row,
  hasOverride,
  onChange,
  onReset,
  onDone,
}: {
  row: PreviewRow
  hasOverride: boolean
  onChange: (field: keyof RowOverride, value: string) => void
  onReset: () => void
  onDone: () => void
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-[#15223a]">
            Fix row {row.rowNumber}
          </div>

          <div className="mt-1 text-[10px] font-semibold text-[#667085]">
            These corrections apply only to this import preview.
          </div>
        </div>

        <div className="flex gap-2">
          {hasOverride && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-[9px] border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-extrabold text-[#475467]"
            >
              Reset row
            </button>
          )}

          <button
            type="button"
            onClick={onDone}
            className="rounded-[9px] bg-[#00274c] px-3 py-2 text-xs font-extrabold text-white"
          >
            Done
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <EditField
          label="Full name"
          value={row.name}
          onChange={(value) => onChange('name', value)}
        />

        <EditField
          label="U-M uniqname"
          value={row.uniqname}
          placeholder="uniqname or @uniqname"
          onChange={(value) => onChange('uniqname', value)}
        />

        <EditField
          label="Phone"
          value={row.phone}
          placeholder="734-555-1234"
          onChange={(value) => onChange('phone', value)}
        />

        <label>
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
            Dorm / location
          </span>

          <select
            value={row.location}
            onChange={(event) => onChange('location', event.target.value)}
            className="w-full rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a]"
          >
            <option value="">No location</option>

            {CANONICAL_LOCATIONS.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <EditField
          label="House / building"
          value={row.house}
          onChange={(value) => onChange('house', value)}
        />

        <EditField
          label="Room / address"
          value={row.room}
          onChange={(value) => onChange('room', value)}
        />
      </div>
    </div>
  )
}

function EditField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
        {label}
      </span>

      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[10px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a]"
      />
    </label>
  )
}

function RowReview({
  row,
  duplicate,
  onChooseDuplicate,
  onConfirmDuplicate,
}: {
  row: PreviewRow
  duplicate:
    | DuplicateMeta
    | undefined
  onChooseDuplicate: (
    groupKey: string,
    rowNumber: number
  ) => void
  onConfirmDuplicate: (
    groupKey: string,
    rowNumber: number
  ) => void
}) {
  if (
    row.issues.length === 0 &&
    row.autoFixes.length === 0 &&
    !duplicate?.isDuplicateGroup
  ) {
    return (
      <span className="text-[10px] font-extrabold text-[#027a48]">
        Looks good
      </span>
    )
  }

  return (
    <div className="max-w-[250px] space-y-1.5">
      {duplicate?.isDuplicateGroup && (
        <div className="space-y-1.5">
          <div
            className={[
              'text-[10px] font-extrabold',
              duplicate.isWinner
                ? 'text-[#175cd3]'
                : 'text-[#667085]',
            ].join(' ')}
          >
            {duplicate.isWinner
              ? duplicate.manuallyChosen
                ? `KEEPING THIS ONE • manually selected`
                : `KEEPING THIS ONE • recommended`
              : duplicate.isRecommended
                ? `Recommended response • not currently selected`
                : `Not kept • row ${duplicate.winnerRowNumber} is selected`}
          </div>

          <div className="text-[9px] font-semibold leading-4 text-[#667085]">
            Grouped by{' '}
            {duplicate.groupKey.startsWith(
              'phone:'
            )
              ? 'matching phone'
              : 'matching uniqname'}
            {' • '}
            Quality score: {duplicate.qualityScore}
            {duplicate.qualityReasons.length > 0
              ? ` • ${duplicate.qualityReasons.join(' • ')}`
              : ''}
          </div>

          {duplicate.closeCall &&
            !duplicate.manuallyChosen && (
              <div className="text-[9px] font-extrabold leading-4 text-[#b54708]">
                Close call — review both submissions before import.
              </div>
            )}

          {duplicate.isWinner &&
            !duplicate.manuallyChosen && (
              <button
                type="button"
                onClick={() =>
                  onConfirmDuplicate(
                    duplicate.groupKey,
                    row.rowNumber
                  )
                }
                className="rounded-[8px] border border-[#6ce9a6] bg-[#ecfdf3] px-2.5 py-1.5 text-[9px] font-extrabold text-[#027a48] hover:border-[#32d583]"
              >
                Accept recommendation
              </button>
            )}

          {!duplicate.isWinner && (
            <button
              type="button"
              onClick={() =>
                onChooseDuplicate(
                  duplicate.groupKey,
                  row.rowNumber
                )
              }
              className="rounded-[8px] border border-[#98a2b3] bg-white px-2.5 py-1.5 text-[9px] font-extrabold text-[#475467] hover:border-[#475467]"
            >
              Keep this one
            </button>
          )}
        </div>
      )}

      {duplicate?.isWinner &&
        duplicate.previousNames.length > 0 && (
          <div className="text-[9px] font-semibold leading-4 text-[#667085]">
            Other submitted name:{' '}
            {duplicate.previousNames.join(', ')}
          </div>
        )}

      {row.submittedAt && (
        <div className="text-[9px] font-semibold text-[#98a2b3]">
          Entered {row.submittedAt}
        </div>
      )}

      {row.issues.map((issue) => (
        <div key={issue}>
          <div className="text-[10px] font-extrabold text-[#b54708]">
            {issue}
          </div>

          {issue === 'Affinity answer needs review' &&
            row.rawAffinities && (
              <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[#667085]">
                Raw: {row.rawAffinities}
              </div>
            )}

          {issue === 'Location needs review' &&
            row.location && (
              <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[#667085]">
                Raw: {row.location}
                {row.location === 'Wolverine Village'
                  ? hasUsableFollowUpRoute(row)
                    ? ' • Building is missing or unrecognized. Choose Building 1–4 / Harper Hall, or use Approve as-is if the phone or U-M identity is enough for follow-up.'
                    : ' • Building is missing or unrecognized. Choose Building 1–4 or Harper Hall.'
                  : ''}
              </div>
            )}

          {issue === 'House / room needs review' && (
            <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[#667085]">
              House / building: {row.house || 'blank'}
              {' • '}
              Room / address: {row.room || 'blank'}.
              {' '}
              A 3–4 digit House / building value probably belongs in Room / address; a text-only Room / address value probably belongs in House / building. Edit this row to confirm.
            </div>
          )}

          {issue === 'Missing name' && (
            <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[#667085]">
              {hasUsableFollowUpRoute(
                row
              ) ? (
                <>
                  <span className="font-extrabold text-[#027a48]">
                    This contact can be preserved without inventing a name.
                  </span>
                  {' '}
                  {row.uniqname ? (
                    <>
                      You can optionally search{' '}
                      <span className="font-extrabold">
                        {row.uniqname}
                      </span>
                      {' '}in{' '}
                      <a
                        href="https://mcommunity.umich.edu/"
                        target="_blank"
                        rel="noreferrer"
                        className="font-extrabold text-[#175cd3] hover:underline"
                      >
                        MCommunity
                      </a>
                      {' '}now, or recover the name during follow-up later.
                    </>
                  ) : hasLocationFollowUpRoute(
                      row
                    ) ? (
                    <>
                      The dorm/location + room/address gives the team a usable follow-up route. Recover the name when someone visits.
                    </>
                  ) : (
                    <>
                      The usable phone number gives the team a way to follow up. Use <strong>Approve as-is</strong> if you want to keep the row without a name; the first text can ask for the student&apos;s name.
                    </>
                  )}
                </>
              ) : (
                <>
                  This row has no usable phone, U-M identity, or complete dorm route. Add a follow-up route or exclude it.
                </>
              )}
            </div>
          )}

          {issue ===
            'No usable contact route' && (
            <div className="mt-0.5 text-[9px] font-semibold leading-4 text-[#667085]">
              {row.phone.trim() &&
              !hasPlausiblePhone(
                row
              ) ? (
                <>
                  The submitted phone number is not a plausible 10-digit U.S. number, so it is not safe to use as the contact&apos;s unique identity. Correct the phone, add a U-M uniqname, add a complete dorm route, or exclude the row.
                </>
              ) : row.name ? (
                <>
                  Check this name in{' '}
                  <a
                    href="https://mcommunity.umich.edu/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-extrabold text-[#175cd3] hover:underline"
                  >
                    MCommunity
                  </a>
                  {' '}for a uniqname. If none is found, exclude this row from the import.
                </>
              ) : (
                <>
                  This row has no plausible phone, U-M identity, or complete dorm route. Add a usable follow-up route or exclude it.
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {row.autoFixes.map((fix) => (
        <div
          key={fix}
          className="text-[10px] font-extrabold text-[#027a48]"
        >
          ✓ {fix}
        </div>
      ))}
    </div>
  )
}

function MatchSummary({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'blue' | 'green' | 'warn'
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[#ecfdf3] text-[#027a48]'
      : tone === 'warn'
        ? 'bg-[#fff8eb] text-[#b54708]'
        : 'bg-[#eef4ff] text-[#3538cd]'

  return (
    <div className={['rounded-[12px] px-3 py-3 text-center', toneClass].join(' ')}>
      <div className="text-xl font-black leading-none">{value}</div>
      <div className="mt-1.5 text-[10px] font-extrabold">{label}</div>
    </div>
  )
}

function DatabaseMatchBadge({
  row,
  result,
  alreadyInCampaign,
  campaignContact,
  choice,
  confirmed,
  affinitiesMapped,
  onChoice,
  onConfirm,
  onReopen,
}: {
  row: PreviewRow
  result: MatchResult | undefined
  alreadyInCampaign: boolean
  campaignContact: CampaignContactSnapshot | undefined
  choice: ExistingContactChoice
  confirmed: boolean
  affinitiesMapped: boolean
  onChoice: (choice: ExistingContactChoice) => void
  onConfirm: () => void
  onReopen: () => void
}) {
  if (!result) {
    return (
      <span className="text-[10px] font-bold text-[#98a2b3]">
        Not checked
      </span>
    )
  }

  if (alreadyInCampaign) {
    const changes = campaignContact
      ? buildExistingContactChanges(row, campaignContact, affinitiesMapped)
      : []

    if (confirmed) {
      return (
        <div className="min-w-[250px] max-w-[320px]">
          <span className="inline-flex rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[9px] font-extrabold text-[#027a48]">
            ✓ Choice confirmed • {choice === 'update'
              ? 'use newer survey'
              : 'keep current'}
          </span>

          {result.matched_student_name && (
            <div className="mt-1.5 text-[10px] font-semibold leading-4 text-[#667085]">
              Existing: {result.matched_student_name}
              {result.existing_uniqname ? ` • ${result.existing_uniqname}` : ''}
            </div>
          )}

          <button
            type="button"
            onClick={onReopen}
            className="mt-2 rounded-[8px] border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-[9px] font-extrabold text-[#475467] hover:border-[#98a2b3]"
          >
            Change choice
          </button>
        </div>
      )
    }

    return (
      <div className="min-w-[250px] max-w-[320px]">
        <span
          className={[
            'inline-flex rounded-full px-2.5 py-1 text-[9px] font-extrabold',
            choice === 'update'
              ? 'bg-[#ecfdf3] text-[#027a48]'
              : 'bg-[#eef4ff] text-[#3538cd]',
          ].join(' ')}
        >
          {choice === 'update'
            ? 'Already in campaign • use newer survey selected'
            : 'Already in campaign • keep current selected'}
        </span>

        {result.matched_student_name && (
          <div className="mt-1.5 text-[10px] font-semibold leading-4 text-[#667085]">
            Existing: {result.matched_student_name}
            {result.existing_uniqname ? ` • ${result.existing_uniqname}` : ''}
          </div>
        )}

        <div className="mt-2 rounded-[10px] border border-[#dbe8f8] bg-white p-2.5">
          <div className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
            Survey differences
          </div>

          {changes.length > 0 ? (
            <div className="mt-1.5 space-y-1.5">
              {changes.slice(0, 6).map((change) => (
                <div
                  key={`${change.label}-${change.currentValue}-${change.nextValue}`}
                  className="text-[10px] leading-4 text-[#475467]"
                >
                  <span className="font-extrabold text-[#344054]">
                    {change.label}:
                  </span>{' '}
                  {change.currentValue} → {change.nextValue}
                </div>
              ))}

              {changes.length > 6 && (
                <div className="text-[9px] font-bold text-[#667085]">
                  +{changes.length - 6} more change{changes.length - 6 === 1 ? '' : 's'}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-1.5 text-[10px] leading-4 text-[#667085]">
              No changed survey fields detected. Keeping the current version is recommended.
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onChoice('keep')}
              className={[
                'rounded-[8px] border px-2 py-1.5 text-[9px] font-extrabold transition',
                choice === 'keep'
                  ? 'border-[#6172f3] bg-[#eef4ff] text-[#3538cd]'
                  : 'border-[#d0d5dd] bg-white text-[#475467] hover:border-[#98a2b3]',
              ].join(' ')}
            >
              Keep current
            </button>

            <button
              type="button"
              onClick={() => onChoice('update')}
              disabled={changes.length === 0}
              className={[
                'rounded-[8px] border px-2 py-1.5 text-[9px] font-extrabold transition',
                changes.length === 0
                  ? 'cursor-not-allowed border-[#e4e7ec] bg-[#f9fafb] text-[#98a2b3]'
                  : choice === 'update'
                    ? 'border-[#12b76a] bg-[#ecfdf3] text-[#027a48]'
                    : 'border-[#abefc6] bg-white text-[#027a48] hover:bg-[#ecfdf3]',
              ].join(' ')}
            >
              Use newer survey
            </button>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            className="mt-2 w-full rounded-[8px] border border-[#6ce9a6] bg-[#ecfdf3] px-2.5 py-2 text-[9px] font-extrabold text-[#027a48] hover:border-[#32d583]"
          >
            Confirm choice
          </button>

          {choice === 'update' && changes.length > 0 && (
            <div className="mt-2 text-[9px] font-semibold leading-4 text-[#027a48]">
              Only survey/contact fields refresh. Status, assignment, knocks, interactions, and history stay unchanged. Affinities mirror the newer survey, so selections no longer present there are removed.
            </div>
          )}
        </div>
      </div>
    )
  }

  const config =
    result.status ===
      'new_student_weak_identity'
      ? hasLocationFollowUpRoute(
          row
        )
        ? {
            label:
              'New • dorm + room',
            className:
              'bg-[#ecfdf3] text-[#027a48]',
          }
        : {
            label:
              'Review • no usable route',
            className:
              'bg-[#fff8eb] text-[#b54708]',
          }
      : result.status ===
          'new_student_phone_only'
        ? hasPlausiblePhone(
            row
          )
          ? {
              label:
                'New • phone identity accepted',
              className:
                'bg-[#ecfdf3] text-[#027a48]',
            }
          : {
              label:
                'Review • phone number invalid',
              className:
                'bg-[#fff8eb] text-[#b54708]',
            }
        : matchStatusConfig(
            result.status
          )

  return (
    <div className="max-w-[220px]">
      <span
        className={[
          'inline-flex rounded-full px-2.5 py-1 text-[9px] font-extrabold',
          config.className,
        ].join(' ')}
      >
        {config.label}
      </span>

      {result.matched_student_name && (
        <div className="mt-1.5 text-[10px] font-semibold leading-4 text-[#667085]">
          Existing: {result.matched_student_name}
          {result.existing_uniqname ? ` • ${result.existing_uniqname}` : ''}
        </div>
      )}
    </div>
  )
}

function buildExistingContactChanges(
  row: PreviewRow,
  current: CampaignContactSnapshot,
  affinitiesMapped: boolean
): ExistingContactChange[] {
  const changes: ExistingContactChange[] = []

  const push = (
    label: string,
    currentValue: string | null | undefined,
    nextValue: string | null | undefined
  ) => {
    const currentText = displaySurveyValue(currentValue)
    const nextText = displaySurveyValue(nextValue)

    if (
      nextText !== '—' &&
      normalizeComparison(currentText) !== normalizeComparison(nextText)
    ) {
      changes.push({
        label,
        currentValue: currentText,
        nextValue: nextText,
      })
    }
  }

  push('Year', current.year_at_um, row.year)
  push('Gender', current.gender_raw, row.gender)
  push(
    'Phone',
    current.phone ? formatPhone(normalizePhone(current.phone)) : null,
    row.phoneNormalized ? formatPhone(row.phoneNormalized) : null
  )
  push('Location', current.location_name, row.location)
  push('House / building', current.house_name, row.house)
  push('Room / address', current.room_or_address, row.room)
  push(
    'Jesus interest',
    current.jesus_interest,
    normalizeInterestForImport(row.jesus, 'jesus')
  )
  push(
    'Community interest',
    current.community_interest,
    normalizeInterestForImport(row.community, 'standard')
  )
  push(
    'Interview interest',
    current.interview_interest,
    normalizeInterestForImport(row.interview, 'standard')
  )

  if (affinitiesMapped) {
    const currentAffinities = [...(current.affinities ?? [])]
      .map((value) => value.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    const nextAffinities = [...row.affinities]
      .map((value) => value.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))

    const currentKey = currentAffinities
      .map(normalizeComparison)
      .join('|')
    const nextKey = nextAffinities
      .map(normalizeComparison)
      .join('|')

    if (currentKey !== nextKey) {
      changes.push({
        label: 'Affinities',
        currentValue:
          currentAffinities.length > 0
            ? currentAffinities.join(', ')
            : '—',
        nextValue:
          nextAffinities.length > 0
            ? nextAffinities.join(', ')
            : '—',
      })
    }
  }

  return changes
}

function displaySurveyValue(value: string | null | undefined) {
  const text = value?.trim() ?? ''
  return text || '—'
}

function normalizeComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function matchStatusConfig(status: MatchStatus) {
  switch (status) {
    case 'matched_by_uniqname':
      return {
        label: 'Existing • uniqname',
        className: 'bg-[#eef4ff] text-[#3538cd]',
      }
    case 'matched_by_phone':
      return {
        label: 'Existing • phone',
        className: 'bg-[#eef4ff] text-[#3538cd]',
      }
    case 'matched_by_phone_add_uniqname':
      return {
        label: 'Existing • phone • add uniqname',
        className: 'bg-[#eef4ff] text-[#3538cd]',
      }
    case 'new_student':
      return {
        label: 'New student',
        className: 'bg-[#ecfdf3] text-[#027a48]',
      }
    case 'new_student_phone_only':
      return {
        label: 'New • phone supplied',
        className: 'bg-[#eef4ff] text-[#3538cd]',
      }
    case 'new_student_weak_identity':
      return {
        label: 'Needs review • weak identity',
        className: 'bg-[#fff8eb] text-[#b54708]',
      }
    case 'needs_review_duplicate_uniqname':
      return {
        label: 'Needs review • duplicate uniqname',
        className: 'bg-[#fef3f2] text-[#b42318]',
      }
    case 'needs_review_multiple_phone_matches':
      return {
        label: 'Needs review • multiple phone matches',
        className: 'bg-[#fef3f2] text-[#b42318]',
      }
    case 'needs_review_identity_conflict':
      return {
        label: 'Needs review • identity conflict',
        className: 'bg-[#fef3f2] text-[#b42318]',
      }
  }
}

function isExistingStatus(status: MatchStatus | undefined) {
  return [
    'matched_by_uniqname',
    'matched_by_phone',
    'matched_by_phone_add_uniqname',
  ].includes(status ?? '')
}

function isNewStatus(
  status: MatchStatus | undefined,
  row: PreviewRow
) {
  if (
    ['new_student', 'new_student_phone_only'].includes(
      status ?? ''
    )
  ) {
    return true
  }

  return (
    status ===
      'new_student_weak_identity' &&
    hasLocationFollowUpRoute(
      row
    )
  )
}

function rowNeedsDatabaseReview(
  status: MatchStatus | undefined,
  row: PreviewRow
) {
  if (!status) return false

  if (
    status.startsWith(
      'needs_review'
    )
  ) {
    return true
  }

  return (
    status ===
      'new_student_weak_identity' &&
    !hasLocationFollowUpRoute(
      row
    )
  )
}

function wolverineVillageBuilding(
  value: string
) {
  const normalized =
    normalizeHeader(
      value.trim()
    )

  const map: Record<string, string> = {
    '1': 'Building 1',
    'building 1': 'Building 1',
    'building one': 'Building 1',
    '2': 'Building 2',
    'building 2': 'Building 2',
    'building two': 'Building 2',
    '3': 'Building 3',
    'building 3': 'Building 3',
    'building three': 'Building 3',
    '4': 'Building 4',
    'building 4': 'Building 4',
    'building four': 'Building 4',
    'harper': 'Harper Hall',
    'harper hall': 'Harper Hall',
  }

  return map[normalized] ?? ''
}

function normalizeWolverineVillageHousing(
  location: string,
  rawHouse: string,
  rawRoom: string
) {
  const house =
    rawHouse.trim()
  const room =
    rawRoom.trim()
  const autoFixes: string[] = []

  if (
    location !==
    'Wolverine Village'
  ) {
    return {
      location,
      house,
      room,
      autoFixes,
    }
  }

  const houseBuilding =
    wolverineVillageBuilding(
      house
    )

  const roomBuilding =
    wolverineVillageBuilding(
      room
    )

  if (houseBuilding) {
    autoFixes.push(
      `Wolverine Village ${house || 'building'} mapped to ${houseBuilding}`
    )

    return {
      location: houseBuilding,
      house: '',
      room,
      autoFixes,
    }
  }

  if (
    roomBuilding &&
    isLikelyRoomNumber(
      house
    )
  ) {
    autoFixes.push(
      `Wolverine Village building and room were swapped; mapped to ${roomBuilding}`
    )

    return {
      location: roomBuilding,
      house: '',
      room: house,
      autoFixes,
    }
  }

  return {
    location,
    house,
    room,
    autoFixes,
  }
}

function isDormHousingLocation(
  location: string
) {
  const normalized =
    location.trim()

  return (
    Boolean(normalized) &&
    CANONICAL_LOCATIONS.includes(
      normalized
    ) &&
    !normalized
      .toLowerCase()
      .startsWith('off campus')
  )
}

function isHouseLikeText(
  value: string
) {
  const trimmed =
    value.trim()

  return (
    Boolean(trimmed) &&
    /[a-z]/i.test(trimmed) &&
    !/\d/.test(trimmed)
  )
}

function isLikelyRoomNumber(
  value: string
) {
  return /^\d{3,4}$/.test(
    value.trim()
  )
}

function normalizeHousingFields(
  location: string,
  rawHouse: string,
  rawRoom: string
) {
  const house =
    rawHouse.trim()
  const room =
    rawRoom.trim()
  const autoFixes: string[] = []

  if (
    !isDormHousingLocation(
      location
    )
  ) {
    return {
      house,
      room,
      autoFixes,
    }
  }

  const roomLooksLikeHouse =
    isHouseLikeText(room)

  const houseLooksLikeRoom =
    isLikelyRoomNumber(house)

  if (
    roomLooksLikeHouse &&
    houseLooksLikeRoom
  ) {
    autoFixes.push(
      'House / building and Room / address were swapped'
    )

    return {
      house: room,
      room: house,
      autoFixes,
    }
  }

  if (
    roomLooksLikeHouse &&
    !house
  ) {
    autoFixes.push(
      'Text-only Room / address moved to House / building'
    )

    return {
      house: room,
      room: '',
      autoFixes,
    }
  }

  if (
    houseLooksLikeRoom &&
    !room
  ) {
    autoFixes.push(
      '3–4 digit House / building value moved to Room / address'
    )

    return {
      house: '',
      room: house,
      autoFixes,
    }
  }

  return {
    house,
    room,
    autoFixes,
  }
}

function mapCsvRow(
  row: CsvRow,
  mapping: Record<string, string>,
  index: number
): PreviewRow {
  const value = (field: string) => {
    const header = mapping[field]
    return header ? row[header]?.trim() ?? '' : ''
  }

  const rawName = value('name')
  const rawUniqname = value('uniqname')
  const rawPhone = value('phone')
  const rawLocation = value('location')
  const rawHouse = value('house')
  const rawRoom = value('room')

  const uniqname = normalizeUniqname(rawUniqname)
  const phoneNormalized = normalizePhone(rawPhone)
  const normalizedLocation =
    normalizeLocation(rawLocation)
  const rawAffinities = value('affinities')

  const wolverineVillage =
    normalizeWolverineVillageHousing(
      normalizedLocation,
      rawHouse,
      rawRoom
    )

  const location =
    wolverineVillage.location

  const housing =
    normalizeHousingFields(
      location,
      wolverineVillage.house,
      wolverineVillage.room
    )

  const autoFixes: string[] = [
    ...wolverineVillage.autoFixes,
    ...housing.autoFixes,
  ]

  if (
    rawUniqname &&
    uniqname &&
    normalizeLoose(rawUniqname) !== uniqname
  ) {
    autoFixes.push('Uniqname normalized')
  }

  if (
    rawPhone &&
    phoneNormalized &&
    normalizeLoose(rawPhone) !== phoneNormalized
  ) {
    autoFixes.push(
      `Phone normalized to ${formatPhone(phoneNormalized)}`
    )
  }

  if (
    rawLocation &&
    location &&
    normalizeLoose(rawLocation) !== normalizeLoose(location)
  ) {
    autoFixes.push(`Location normalized to ${location}`)
  }

  return {
    rowNumber: index + 2,
    name: rawName.trim(),
    uniqname,
    email: uniqname ? `${uniqname}@umich.edu` : '',
    submittedAt: value('timestamp'),
    phone: rawPhone,
    phoneNormalized,
    gender: value('gender'),
    year: value('year'),
    location,
    house: housing.house,
    room: housing.room,
    jesus: value('jesus'),
    community: value('community'),
    interview: value('interview'),
    rawAffinities,
    affinities: parseAffinities(rawAffinities),
    autoFixes,
    issues: [],
  }
}

function applyOverride(
  row: PreviewRow,
  override: RowOverride | undefined
): PreviewRow {
  if (!override) return row

  const name =
    override.name !== undefined
      ? override.name
      : row.name

  const uniqname =
    override.uniqname !== undefined
      ? normalizeUniqname(override.uniqname)
      : row.uniqname

  const phoneRaw =
    override.phone !== undefined ? override.phone : row.phone

  const phoneNormalized = normalizePhone(phoneRaw)

  const location =
    override.location !== undefined
      ? normalizeLocation(override.location)
      : row.location

  const house =
    override.house !== undefined
      ? override.house
      : row.house

  const room =
    override.room !== undefined
      ? override.room
      : row.room

  return {
    ...row,
    name,
    uniqname,
    email: uniqname ? `${uniqname}@umich.edu` : '',
    phone: phoneRaw,
    phoneNormalized,
    location,
    house,
    room,
    autoFixes: [...row.autoFixes, 'Manual review applied'],
    issues: [],
  }
}

function validatePreviewRows(rows: PreviewRow[]) {
  return rows.map((row) => {
    const issues: string[] = []

    if (!row.name.trim()) {
      issues.push('Missing name')
    }

    if (
      shouldSuggestExclusion(
        row
      )
    ) {
      issues.push(
        'No usable contact route'
      )
    }

    if (row.rawAffinities && row.affinities.length === 0) {
      issues.push('Affinity answer needs review')
    }

    if (
      row.location &&
      !CANONICAL_LOCATIONS.includes(row.location)
    ) {
      issues.push('Location needs review')
    }

    if (
      isDormHousingLocation(
        row.location
      ) &&
      (
        isHouseLikeText(
          row.room
        ) ||
        isLikelyRoomNumber(
          row.house
        )
      )
    ) {
      issues.push(
        'House / room needs review'
      )
    }

    return {
      ...row,
      issues,
    }
  })
}

function normalizeInterestForImport(
  value: string,
  kind: 'jesus' | 'standard'
) {
  const normalized =
    normalizeLoose(value)

  if (!normalized) {
    return null
  }

  if (
    kind === 'jesus' &&
    (
      normalized.includes(
        'already'
      ) ||
      normalized.includes(
        'have a relationship'
      ) ||
      normalized.includes(
        'already have'
      )
    )
  ) {
    return 'already_have_one'
  }

  if (
    normalized.startsWith(
      'yes'
    )
  ) {
    return 'yes'
  }

  if (
    normalized.startsWith(
      'maybe'
    ) ||
    normalized.includes(
      'maybe'
    )
  ) {
    return 'maybe'
  }

  if (
    normalized.startsWith(
      'no'
    )
  ) {
    return 'no'
  }

  return null
}

function normalizeTimestampForImport(
  value: string
) {
  if (!value.trim()) {
    return null
  }

  const parsed =
    new Date(value)

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null
  }

  return parsed.toISOString()
}

function hasPlausiblePhone(
  row: PreviewRow
) {
  return (
    classifyPhone(
      row.phoneNormalized
    ) === 'plausible'
  )
}

function hasLocationFollowUpRoute(
  row: PreviewRow
) {
  return (
    Boolean(row.room.trim()) &&
    CANONICAL_LOCATIONS.includes(
      row.location
    )
  )
}

function hasUsableFollowUpRoute(
  row: PreviewRow
) {
  return (
    Boolean(row.uniqname) ||
    hasPlausiblePhone(row) ||
    hasLocationFollowUpRoute(
      row
    )
  )
}

function canImportWithoutName(
  row: PreviewRow
) {
  if (row.name.trim()) {
    return false
  }

  if (row.uniqname) {
    return true
  }

  if (
    hasLocationFollowUpRoute(
      row
    )
  ) {
    return true
  }

  return hasPlausiblePhone(
    row
  )
}

function shouldSuggestExclusion(
  row: PreviewRow
) {
  if (!row.name.trim()) {
    return !canImportWithoutName(
      row
    )
  }

  return !hasUsableFollowUpRoute(
    row
  )
}

function rowHasBlockingCsvIssue(
  row: PreviewRow
) {
  return row.issues.some(
    (issue) =>
      !(
        issue ===
          'Missing name' &&
        canImportWithoutName(
          row
        )
      )
  )
}

function buildDuplicateMap(
  rows: PreviewRow[],
  manualChoices: Record<string, number>
) {
  const groups =
    new Map<string, PreviewRow[]>()

  for (const row of rows) {
    const groupKey =
      row.uniqname
        ? `uniqname:${row.uniqname}`
        : classifyPhone(
              row.phoneNormalized
            ) === 'plausible'
          ? `phone:${row.phoneNormalized}`
          : ''

    if (!groupKey) {
      continue
    }

    const group =
      groups.get(groupKey) ??
      []

    group.push(row)
    groups.set(
      groupKey,
      group
    )
  }

  const result =
    new Map<number, DuplicateMeta>()

  for (const [
    groupKey,
    group,
  ] of groups.entries()) {
    if (group.length < 2) {
      continue
    }

    const scored =
      group
        .map((row) => ({
          row,
          quality:
            duplicateQuality(row),
        }))
        .sort((a, b) =>
          b.quality.score -
            a.quality.score ||
          b.quality.completeness -
            a.quality.completeness ||
          a.row.rowNumber -
            b.row.rowNumber
        )

    const recommended =
      scored[0]

    const second =
      scored[1]

    const manualRowNumber =
      manualChoices[groupKey]

    const manualCandidate =
      manualRowNumber
        ? scored.find(
            (item) =>
              item.row.rowNumber ===
              manualRowNumber
          )
        : undefined

    const selected =
      manualCandidate ??
      recommended

    const closeCall =
      Boolean(second) &&
      recommended.quality.score -
        second.quality.score <= 1

    const previousNames =
      Array.from(
        new Set(
          group
            .filter(
              (row) =>
                row.rowNumber !==
                selected.row.rowNumber
            )
            .map(
              (row) =>
                row.name.trim()
            )
            .filter(
              (name) =>
                name &&
                name.toLowerCase() !==
                  selected.row.name
                    .trim()
                    .toLowerCase()
            )
        )
      )

    for (const item of scored) {
      const isWinner =
        item.row.rowNumber ===
        selected.row.rowNumber

      result.set(
        item.row.rowNumber,
        {
          groupKey,
          isDuplicateGroup: true,
          isWinner,
          isRecommended:
            item.row.rowNumber ===
            recommended.row.rowNumber,
          skip: !isWinner,
          groupSize:
            group.length,
          winnerRowNumber:
            selected.row.rowNumber,
          recommendedRowNumber:
            recommended.row.rowNumber,
          previousNames:
            isWinner
              ? previousNames
              : [],
          qualityScore:
            item.quality.score,
          qualityReasons:
            item.quality.reasons,
          closeCall,
          manuallyChosen:
            Boolean(
              manualCandidate
            ),
        }
      )
    }
  }

  return result
}

function duplicateQuality(
  row: PreviewRow
) {
  let score = 0
  let completeness = 0

  const reasons: string[] = []

  if (row.name.trim()) {
    score += 1
    completeness += 1
  }

  const phoneQuality =
    classifyPhone(
      row.phoneNormalized
    )

  if (phoneQuality === 'plausible') {
    score += 7
    completeness += 1
    reasons.push('plausible phone')
  } else if (
    phoneQuality === 'suspicious'
  ) {
    score -= 3
    reasons.push('suspicious phone')
  } else if (
    row.phoneNormalized
  ) {
    score -= 2
    reasons.push('invalid phone')
  }

  if (
    row.location &&
    CANONICAL_LOCATIONS.includes(
      row.location
    )
  ) {
    score += 4
    completeness += 1
    reasons.push('known location')
  }

  if (row.house.trim()) {
    score += 1
    completeness += 1
    reasons.push('house')
  }

  if (row.room.trim()) {
    score += 4
    completeness += 1
    reasons.push('room/address')
  }

  if (row.jesus.trim()) {
    score += 1
    completeness += 1
  }

  if (row.community.trim()) {
    score += 1
    completeness += 1
  }

  if (row.interview.trim()) {
    score += 1
    completeness += 1
  }

  if (row.affinities.length > 0) {
    score += 1
    completeness += 1
  }

  return {
    score,
    completeness,
    reasons,
  }
}

function classifyPhone(
  digits: string
):
  | 'plausible'
  | 'suspicious'
  | 'invalid'
  | 'missing' {
  if (!digits) {
    return 'missing'
  }

  if (digits.length !== 10) {
    return 'invalid'
  }

  if (
    /^(\d)\1{9}$/.test(digits) ||
    digits === '1234567890' ||
    digits === '0123456789' ||
    digits === '9876543210'
  ) {
    return 'suspicious'
  }

  const areaFirst =
    Number(digits[0])

  const exchangeFirst =
    Number(digits[3])

  if (
    areaFirst < 2 ||
    exchangeFirst < 2
  ) {
    return 'suspicious'
  }

  return 'plausible'
}

function autoMapColumns(headers: string[]) {
  const result: Record<string, string> = {}

  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }))

  APP_FIELDS.forEach((field) => {
    const exact = normalizedHeaders.find(({ normalized }) =>
      field.aliases.some(
        (alias) => normalized === normalizeHeader(alias)
      )
    )

    if (exact) {
      result[field.key] = exact.original
      return
    }

    const scored = normalizedHeaders
      .map((header) => ({
        ...header,
        score: bestAliasScore(header.normalized, field.aliases),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)[0]

    if (scored) result[field.key] = scored.original
  })

  return result
}

function bestAliasScore(header: string, aliases: string[]) {
  let best = 0

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias)

    if (header === normalizedAlias) {
      best = Math.max(best, 100)
      continue
    }

    if (
      normalizedAlias.length >= 8 &&
      header.includes(normalizedAlias)
    ) {
      best = Math.max(
        best,
        70 + Math.min(normalizedAlias.length, 25)
      )
      continue
    }

    if (
      header.length >= 8 &&
      normalizedAlias.includes(header)
    ) {
      best = Math.max(
        best,
        50 + Math.min(header.length, 20)
      )
    }
  }

  return best
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeLoose(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeLocation(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return ''

  if (CANONICAL_LOCATIONS.includes(trimmed)) return trimmed

  const normalized = normalizeHeader(trimmed)

  return LOCATION_ALIASES[normalized] ?? trimmed
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }

  if (digits.length >= 10) {
    return digits.slice(-10)
  }

  return digits
}

function formatPhone(digits: string) {
  if (digits.length !== 10) return digits

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function normalizeUniqname(value: string) {
  let cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

  if (!cleaned) return ''

  while (
    cleaned.startsWith(
      '@'
    )
  ) {
    cleaned =
      cleaned.slice(1)
  }

  if (!cleaned) return ''

  const atIndex =
    cleaned.indexOf('@')

  if (atIndex > 0) {
    cleaned =
      cleaned.slice(
        0,
        atIndex
      )
  }

  return cleaned
    .replace(/[^a-z0-9._-]/g, '')
}

function parseAffinities(value: string) {
  if (!value.trim()) return []

  const normalized = value.toLowerCase()
  const results: string[] = []

  if (normalized.includes('bipoc')) results.push('BIPOC')

  if (normalized.includes('international')) {
    results.push('International')
  }

  if (
    normalized.includes('south asian') ||
    normalized.includes('s. asian') ||
    normalized.includes('s asian') ||
    normalized.includes('asian-american students') ||
    normalized.includes('asian american students')
  ) {
    results.push('South Asian American')
  }

  if (
    normalized.includes('greek') ||
    normalized.includes('fraternity') ||
    normalized.includes('sorority')
  ) {
    results.push('Greek Life')
  }

  return results
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const normalized = text.replace(/^\uFEFF/, '')

  for (
    let index = 0;
    index < normalized.length;
    index += 1
  ) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1
      }

      row.push(field)
      field = ''

      if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
      }

      row = []
      continue
    }

    field += char
  }

  row.push(field)

  if (row.some((cell) => cell.length > 0)) {
    rows.push(row)
  }

  if (inQuotes) {
    throw new Error('Unclosed quoted field')
  }

  return rows
}
