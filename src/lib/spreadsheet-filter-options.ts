const surveyAnswers = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
]
const noAnswer = { value: 'unanswered', label: 'No answer' }

export const spreadsheetFilterOptions = {
  yesNo: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  email: [{ value: 'has', label: 'Has email' }, { value: 'missing', label: 'No email' }],
  text: [{ value: 'has', label: 'Has text' }, { value: 'missing', label: 'No text' }],
  survey: [...surveyAnswers, noAnswer],
  jesus: [...surveyAnswers, { value: 'already_have_one', label: 'Already have one' }, noAnswer],
  status: [
    { value: 'uncontacted', label: 'Uncontacted' },
    { value: 'attempted_contact', label: 'Attempted contact' },
    { value: 'go_back', label: 'Go back' },
    { value: 'involved', label: 'Involved' },
    { value: 'not_interested', label: 'Not interested' },
  ],
}

export type SpreadsheetFilterKind = keyof typeof spreadsheetFilterOptions

export function readSpreadsheetChoice(kind: SpreadsheetFilterKind, value: string | undefined) {
  if (kind === 'jesus' || kind === 'survey') {
    const values = (value ?? '').split(',').map((item) => item.trim().toLowerCase())
    return spreadsheetFilterOptions[kind].filter((option) => values.includes(option.value)).map((option) => option.value).join(',')
  }
  return spreadsheetFilterOptions[kind].find((option) => option.value === value)?.value ?? ''
}

// In spreadsheet view, each column also controls its matching card-view filter.
export const spreadsheetPersonalFilters: Record<string, string> = {
  sheetJesus: 'jesus',
  sheetCommunity: 'community',
  sheetInterview: 'interview',
  sheetStatus: 'status',
  sheetKgpShared: 'kgp',
  sheetInterviewComplete: 'interviewDone',
  sheetInvitedCg: 'invitedCg',
}

const personalAnswerValues: Record<string, string> = {
  shared: 'yes', not_shared: 'no',
  completed: 'yes', not_completed: 'no',
  invited: 'yes', not_invited: 'no',
}

export const additionalContactFilters = [
  { param: 'sheetEmail', label: 'Email', kind: 'email' },
  { param: 'sheetTextCg', label: 'Texted CG', kind: 'yesNo' },
  { param: 'sheetTextAcg', label: 'Texted ACG', kind: 'yesNo' },
  { param: 'sheetTextAppointment', label: 'Texted appointment', kind: 'yesNo' },
  { param: 'sheetTextEvent', label: 'Texted another event', kind: 'yesNo' },
  { param: 'sheetTextFollowUp', label: 'Texted follow-up', kind: 'yesNo' },
  { param: 'sheetLatestText', label: 'Latest text', kind: 'text' },
  { param: 'sheetNewBeliever', label: 'New believer', kind: 'yesNo' },
] as const

export function spreadsheetSelectedAnswers(kind: SpreadsheetFilterKind, value: string, personalValue = '') {
  const answers = value.split(',')
  const personalAnswers = personalValue.split(',').map((answer) => personalAnswerValues[answer] ?? answer)
  if (!value && !personalValue) return []
  return spreadsheetFilterOptions[kind]
    .filter((option) => (!value || answers.includes(option.value)) && (!personalValue || personalAnswers.includes(option.value)))
    .map((option) => option.value)
}

export function spreadsheetHeaderSelection(kind: SpreadsheetFilterKind, value: string, personalValue = '') {
  const options = spreadsheetFilterOptions[kind]
  if (!value && !personalValue) return { value: '', label: 'Any' }
  const answers = spreadsheetSelectedAnswers(kind, value, personalValue)
  const matches = options.filter((option) => answers.includes(option.value))
  return {
    value: matches.length === 1 ? matches[0].value : '__current',
    label: matches.length ? matches.map((option) => option.label).join(' or ') : 'No matching answers',
  }
}

export function clearSpreadsheetColumnFilter(params: URLSearchParams, param: string) {
  params.delete(param)
  const personalParam = spreadsheetPersonalFilters[param]
  if (personalParam) params.delete(personalParam)
}

function personalAnswer(param: string, value: string) {
  if (value !== 'yes' && value !== 'no') return value
  if (param === 'kgp') return value === 'yes' ? 'shared' : 'not_shared'
  if (param === 'interviewDone') return value === 'yes' ? 'completed' : 'not_completed'
  if (param === 'invitedCg') return value === 'yes' ? 'invited' : 'not_invited'
  return value
}

export function updateSpreadsheetColumnFilter(params: URLSearchParams, param: string, value: string) {
  clearSpreadsheetColumnFilter(params, param)
  const destination = spreadsheetPersonalFilters[param] ?? param
  if (value) params.set(destination, personalAnswer(destination, value))
  params.delete('page')
  params.set('context', '1')
}

// Convert older column URLs to the same personal fields used by Cards. Keep
// the intersection if an older URL contains both filters, including no matches.
export function normalizeSharedContactFilters<T extends Record<string, string>>(filters: T): T {
  const next: Record<string, string> = { ...filters }
  for (const [column, personal] of Object.entries(spreadsheetPersonalFilters)) {
    if (!next[column]) continue
    const kind = personal === 'jesus' ? 'jesus'
      : personal === 'community' || personal === 'interview' ? 'survey'
      : personal === 'status' ? 'status' : 'yesNo'
    const answers = spreadsheetSelectedAnswers(kind, next[column], next[personal] ?? '')
    next[personal] = personalAnswer(personal, answers.join(',') || '__no_matches')
    next[column] = ''
  }
  return next as T
}

export function contactFiltersForDisplay<T extends { display: string }>(filters: T, display: 'cards' | 'sheet'): T {
  return { ...filters, display: display === 'sheet' ? 'sheet' : '' }
}
