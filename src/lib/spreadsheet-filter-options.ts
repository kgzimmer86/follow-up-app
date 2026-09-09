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
