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

export function spreadsheetHeaderSelection(kind: SpreadsheetFilterKind, value: string, personalValue = '') {
  const options = spreadsheetFilterOptions[kind]
  if (!personalValue) return { value, label: options.find((option) => option.value === value)?.label ?? 'Any' }

  // Preserve multiple answers selected in card view, and show the actual
  // intersection when an older link already contains both kinds of filter.
  const personalAnswers = personalValue.split(',').map((answer) => personalAnswerValues[answer] ?? answer)
  const matches = options.filter((option) => personalAnswers.includes(option.value) && (!value || option.value === value))
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
