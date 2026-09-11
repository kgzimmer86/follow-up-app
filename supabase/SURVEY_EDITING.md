# Survey editing

Run the complete `migrations/20260911_edit_contact_survey.sql` in Supabase SQL Editor, then deploy. This adds two guarded edit functions; no table changes or existing-row updates occur during installation. Committing SQL to GitHub does not execute it.

In contact Survey:

- All approved active users may edit Christian community.
- Staff/Admin may also edit Jesus interest, Interview interest, Affinity interest, Gender, Year, and House.
- Existing name/phone/email/location editing is unchanged.
- Each field has Edit, Save, and Cancel; edits are not applied until saved. Failed saves retain the draft and show an error. Save disables while pending. Staff can add a previously blank House.

Survey answers use the existing canonical values (`yes`, `maybe`, `no`, plus `already_have_one` for Jesus only). No answer stores NULL. Year/House are trimmed text, up to 200 characters; Gender offers Male/Female/No answer and preserves an existing legacy value unless changed. Editing answers does not log an interaction or change completion flags, status, ownership, assignment attribution, or the CG text-only preference.

The database checks current approval and role on every call, independent of client controls. Field names and answer values are whitelisted, with no dynamic SQL. One-field saves preserve concurrent changes to other fields. The supplied contact RLS policy remains read-only; no direct-update policy is added.

Affinity editing offers active affinity areas only. The setter validates all selections before changing any links, locks the contact during the update, preserves retained association timestamps, and retains historical/inactive associations outside the editable choices. It cannot add a dorm or region as an affinity. Empty selection clears current active affinity interests.

Server Actions revalidate the contact, Home, contact lists, smart lists, and assignment list. The existing results functions already read these survey columns and affinity relationships, so saved changes naturally affect card answers and filter eligibility. A contact can leave a smart list if its edited answer no longer matches the list criteria. Personal filter selections are not rewritten.

Validation uses invented data only:

```sh
FOLLOW_UP_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test supabase/tests/edit-contact-survey.test.mjs
```

Field checks: as an ordinary approved user, verify only Community has a new Edit control; as Staff/Admin, verify all requested fields. Save and cancel edits, clear an answer, select multiple affinities, and return to a smart list to check the updated answer/filter behavior. Existing contact-information edits should behave as before.
