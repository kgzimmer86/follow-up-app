# Assign Contacts responsiveness

## Finding and scope

The user reported a 3–5 second first-focus delay on iPhone, still present after disabling phone notifications. Inspection found that Assign Contacts rendered every eligible assignee option inside every contact row. This produces contacts × assignees option elements even when almost all rows are offscreen. This is a concrete rendering cost, not proof that it alone caused the reported iPhone delay. The global click-feedback handler does not target text inputs or selects. No notification code or database permissions were changed in this fix.

## Changes

- Keep every contact card, full-dataset search, original order, filters, and Select visible behavior. No pagination or contact truncation.
- For lists of more than 20 assignees, offscreen dropdowns retain their placeholder and currently selected option. One shared IntersectionObserver prepares the full choice list 800px before the dropdown reaches the viewport. Offscreen choices collapse again unless the dropdown is focused.
- Pointer/focus/keyboard fallback synchronously prepares choices before the native picker acts, including rapid scrolling and assistive-technology focus. Older browsers without IntersectionObserver retain full choice lists.
- Memoized rows and stable callbacks prevent changing one row from rerendering every other card. Search text is indexed once per contact-data change; selected/bulk membership lookups use sets rather than nested scans.
- Existing assignment RPC, eligible recipients, owner labels, field names, and save semantics are unchanged.

## Local browser comparison

Production build, 1,000 invented contacts, 100 invented assignees, 390×844 touch viewport, headless installed Chrome with 4× CPU throttling. Separate clean contexts for the committed baseline and optimized component. External browser requests blocked; assignment RPC responses mocked. Temporary fixture routes, baseline copy, and test runner were removed after testing and are not shipped.

| Measurement | Before | After |
| --- | ---: | ---: |
| Dropdown option elements after settling | 101,003 | 1,802 |
| Total DOM elements | 125,120 | 25,919 |
| Navigation to network-idle | 2,875 ms | 848 ms |
| First search tap to verified focus | 295 ms | 95 ms |
| Search to one matching contact | 554 ms | 90 ms |
| Largest observed main-thread long task across the entire test | 5,751 ms | 509 ms |

These are single-run synthetic desktop-browser measurements, not phone latency guarantees. The test did not reproduce a five-second focus delay specifically; it demonstrated materially reduced DOM/rendering work. WebKit automation was unavailable because its test browser binary was not installed. Actual iPhone native-picker behavior still needs a phone check.

Browser assertions passed before and after: search finds contact 0999; all 100 recipients appear on first dropdown focus; selecting recipient 99 sends exactly the intended contact/recipient to the mocked RPC; searching the newly assigned owner's name finds that contact; unassigned filtering yields all 500 expected contacts; Select visible checks and unchecks all 500, including offscreen rows. No browser JavaScript errors occurred.

Four permanent local regression tests cover large-list option counts, preserving all contact rows, first focus/pointer/keyboard preparation, selected-option retention, focused-picker safety, observer reuse/cleanup, and the no-observer fallback.

Verification after removing the temporary fixtures: all 205 self-contained tests passed; production build/TypeScript passed. The separate full-schema integration test still needs the unavailable `FOLLOW_UP_EXPORTED_SCHEMA` input and was excluded, as in the prior security/notification checks.

## Phone acceptance check after deployment

Open Assign Contacts afresh, let it settle, then tap the search field once. Search a name near the end of the full list. Check the first opening of a row dropdown, scrolling to another row, recipient labels/choices, and selected-row state when searching. Confirm the first-tap delay is improved before calling the original phone issue resolved. No SQL or notification setup changes are required.
