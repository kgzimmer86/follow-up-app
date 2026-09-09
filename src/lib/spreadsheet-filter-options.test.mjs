import assert from 'node:assert/strict'
import test from 'node:test'
import { clearSpreadsheetColumnFilter, spreadsheetHeaderSelection } from './spreadsheet-filter-options.ts'

test('column menus show survey choices carried from card view, including multiple answers', () => {
  assert.deepEqual(spreadsheetHeaderSelection('jesus', '', 'already_have_one'), { value: 'already_have_one', label: 'Already have one' })
  assert.deepEqual(spreadsheetHeaderSelection('survey', '', 'yes,maybe'), { value: '__current', label: 'Yes or Maybe' })
  assert.deepEqual(spreadsheetHeaderSelection('status', '', 'go_back'), { value: 'go_back', label: 'Go back' })
})

test('progress choices carried from card view display as the matching Yes or No', () => {
  for (const value of ['shared', 'completed', 'invited']) {
    assert.deepEqual(spreadsheetHeaderSelection('yesNo', '', value), { value: 'yes', label: 'Yes' })
  }
  for (const value of ['not_shared', 'not_completed', 'not_invited']) {
    assert.deepEqual(spreadsheetHeaderSelection('yesNo', '', value), { value: 'no', label: 'No' })
  }
})

test('older URLs with both filters show their actual intersection, including no matches', () => {
  assert.deepEqual(spreadsheetHeaderSelection('jesus', 'maybe', 'yes,maybe'), { value: 'maybe', label: 'Maybe' })
  assert.deepEqual(spreadsheetHeaderSelection('survey', 'no', 'yes,maybe'), { value: '__current', label: 'No matching answers' })
  assert.deepEqual(spreadsheetHeaderSelection('yesNo', 'no', 'shared'), { value: '__current', label: 'No matching answers' })
  assert.deepEqual(spreadsheetHeaderSelection('jesus', 'unanswered'), { value: 'unanswered', label: 'No answer' })
})

test('clearing a column removes both restrictions and preserves unrelated filters and navigation', () => {
  for (const [column, personal] of [
    ['sheetJesus', 'jesus'], ['sheetCommunity', 'community'], ['sheetInterview', 'interview'],
    ['sheetStatus', 'status'], ['sheetKgpShared', 'kgp'], ['sheetInterviewComplete', 'interviewDone'],
    ['sheetInvitedCg', 'invitedCg'],
  ]) {
    const params = new URLSearchParams('context=1&display=sheet&campus=north&location=bursley&gender=male&floor=3&wing=2&affinity=group&sheetTextCg=yes')
    const expected = params.toString()
    params.set(column, 'yes')
    params.append(personal, 'yes')
    params.append(personal, 'maybe')
    clearSpreadsheetColumnFilter(params, column)
    assert.equal(params.toString(), expected)
  }
})

test('optional columns without a matching card filter still clear only their own filter', () => {
  const params = new URLSearchParams('sheetTextCg=yes&invitedCg=invited&sheetInvitedCg=yes')
  clearSpreadsheetColumnFilter(params, 'sheetTextCg')
  assert.equal(params.toString(), 'invitedCg=invited&sheetInvitedCg=yes')
  // Hiding the Invited to CG column clears both sources so it stays hidden.
  clearSpreadsheetColumnFilter(params, 'sheetInvitedCg')
  assert.equal(params.toString(), '')
})
