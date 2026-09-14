# Invitation filter demo contacts

First run `sync-real-ministry-areas.sql` in testing to install the user-supplied
35-area reference list. It renames existing placeholder IDs to North Campus,
Central Campus and West Quad, preserving their existing references; adds the
missing real areas; and verifies names, types, hierarchy and ordering. Bursley's
ID is also retained. No existing contacts or assignments are rewritten.

Then run `seed-invitation-demo-contacts.sql` only in the test Supabase project. The
script requires the known TEST ONLY campaign, the existing TEST North Tuesday
group, and existing Bursley/Markley dorms. If any are missing or renamed, it stops
and rolls back. It never overwrites existing contacts and refuses repeat seeding.

All 12 names start **INVITE TEST**. Emails use the non-deliverable
`example.invalid` domain; phone numbers are reserved fictional 202-555-0101–0112.
No university uniqnames are invented, to avoid implying real university accounts.
Survey year, gender, three interest answers, dorm and room are filled in.
Starting statuses are synthetic fixtures, not claims of real interactions.
Ownership, progress milestones and invitation responses start unset so those can
be tested through the app. No actual meetings, attendance or interactions are added.

## Expected results before making changes

In Assign invitations, choose an upcoming open event, clear filters and search
**INVITE TEST**. This isolates these contacts from earlier test records.

| Filters | Expected names | Count |
|---|---|---:|
| None | 01–12 | 12 |
| Bursley | Alex, Ben, Caleb, Ethan, Finn, Grace, Julia | 7 |
| Bursley + Male | Alex, Ben, Caleb, Ethan, Finn | 5 |
| Bursley + Male + Community Yes and Maybe | Alex, Ben, Ethan, Finn | 4 |
| Above + TEST North Tuesday roster | Alex, Ben | 2 |
| Roster only | Alex, Ben, Caleb, Dylan | 4 |
| Markley + Male + Community Yes and Maybe | Dylan, Isaac | 2 |
| Female + Community Yes and Maybe | Grace, Hannah | 2 |
| Jesus Already have one | Ethan, Julia | 2 |
| Community No | Caleb, Julia, Liam | 3 |

Ethan is a former roster member; Finn has never been on this roster. Both should
appear in the four-person dorm/survey combination and disappear when the current
roster restriction is added. Clearing the roster restriction brings them back.

Use one student for invitation assignment/text tests and another for interaction
and reminder tests so changes are easy to follow. The baseline checklist remains
valid until you edit the survey, gender, dorm, or roster fields. Invitation status
does not change which contacts match the survey filters; already-invited students
remain visible but cannot receive a new initial invitation assignment.
