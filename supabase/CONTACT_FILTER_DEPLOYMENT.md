# Contact filters: maintenance and verification

These notes describe current behavior, including the September 2026 filter updates. Updating this document does not require SQL or an app change.

## Current behavior

- Smart-card criteria belong to their card. They appear as fixed criteria and are not saved as personal selections. Preserve the card's actual logic, including OR conditions between survey questions; do not turn those conditions into separate AND restrictions.
- Within the same smart list, all personal filters survive switching between Cards and Spreadsheet, opening a contact and returning, sorting, and pagination.
- Between different smart cards, only campus/ministry area, dorm/location, floor, wing/house, gender, and affinity travel. Other personal choices reset; the new card's fixed criteria apply.
- The assigned ministry area is a starting filter, not an access restriction. Users can select other areas. A dorm assignment selects its campus and dorm; a campus-region assignment selects that region; an affinity assignment restores that affinity. All Campus has no geographic restriction.
- Campus selection limits the dorm/location choices. Changing to an incompatible campus or dorm clears dependent floor and wing selections.
- **Use my assigned area** restores the assigned-area context while preserving other personal filters.
- **Clear Filters** clears personal choices and restores only the default ministry assignment, including a default affinity when applicable. Gender, floor/wing, survey, progress, and spreadsheet-only restrictions clear. The smart card's fixed rules remain.
- A fresh app launch resets personal filters like Clear Filters. Refreshes, screen locks, and switching to another app should not reset them. The implementation distinguishes a fresh document from a reload; browser/PWA session restoration can vary, so verify full close/reopen on the installed phone app.
- **Reach Out to No Address** uses no geographic restriction for its results. It retains the other lists' geographic context separately; switching smart cards still follows the limited carry-over rules above.
- Home's area wording reflects the filtered area. When it differs from the default, the return-to-default control uses the app's attention color. Home smart cards do not display counts; do not reintroduce queries used only for those removed counts.

## Automatic updates and spreadsheet warnings

Survey checkboxes in the expandable menu wait for a 750 ms pause before saving. They remain usable during an update; newer selections are queued and restored when earlier results arrive. Other menu changes retain the 250 ms delay, and Clear Filters/assigned-area actions start immediately. Campus/dorm changes still update dependent choices.

Shared survey, status, KGP, interview-completion, and Invited to CG filters are regular personal filters, even when selected from spreadsheet column menus. Survey answers support multiple selections. Switching views must not discard them.

Only these spreadsheet-only choices contribute to the red warning:

- Email availability
- Texted CG, ACG, appointment, another event, or follow-up
- Latest text availability
- New believer

In Cards, the red labels and red spreadsheet-filter count identify those restrictions. **Clear these** clears only the listed spreadsheet-only restrictions. It does not clear regular personal filters or reset the ministry area. The card menu keeps these extra choices as hidden inputs so changing another filter preserves them.

Desktop Spreadsheet uses column menus for shared survey/progress/status choices; the expandable menu focuses on geography, gender, and affinity. The warning classification is based on availability in the Cards menu, not where a choice was made.

## Deployment history

The original area migration is [`20260907_contact_filter_area_context.sql`](./migrations/20260907_contact_filter_area_context.sql). Later spreadsheet migrations extend/replace the results function; the survey/status version is [`20260909_spreadsheet_survey_status_filters.sql`](./migrations/20260909_spreadsheet_survey_status_filters.sql). These files are deployment history, not instructions to rerun older definitions on the current production database.

For a future database change, inspect the current function and its dependencies, provide a complete plain SQL file, and run it manually in Supabase SQL Editor as directed for that change. Committing a SQL file to GitHub does not execute it in Supabase. An app rollback may require a matching database compatibility review; retaining an older function alone does not guarantee compatibility with every app version.

## Focused field checks after filter changes

1. Select Male and a dorm in one smart card, plus a survey answer. Switch cards: geography/gender persist, the survey choice resets, and fixed criteria change.
2. Select multiple survey answers, switch Cards ↔ Spreadsheet, and confirm selections and results agree without a spreadsheet warning for those shared choices.
3. Add Texted ACG in Spreadsheet and return to Cards. Confirm the red label/count; use Clear these and confirm other filters remain.
4. Change campus and dorm; confirm floor/wing options and cleared incompatible choices.
5. Use Clear Filters, then separately test a full close/reopen. Both restore only the default assignment. A refresh should preserve the current choices.
6. Check a default affinity and All Campus as well as a dorm/region assignment. Check No Address separately.

## Three-digit dorm floors

Run the complete [three-digit floor update](./migrations/20260909_three_digit_dorm_floors.sql) in Supabase SQL Editor to install this rule. It replaces the current results function without changing contact records or permissions.

Any location typed as a dorm with an exactly three-digit numeric room uses the first digit for floor and derives no wing/house number. MoJo is removed from the four-digit list. Other existing four-digit dorm rules remain unchanged. Blank, nonnumeric, two-digit rooms and off-campus addresses do not gain derived floors through this rule. Floor choices reflect valid rooms present in the filtered results; a dorm with no qualifying rooms still has no floor options.

Test MoJo room 312 as floor 3 with Wing / house # unavailable, another three-digit dorm, and West Quad room 4215 as floor 4/wing 2. When testing previously saved filters, clear any old wing choice first; saved restrictions remain visible until cleared.
