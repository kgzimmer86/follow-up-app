# CG text-only invitation preference

Run the complete `migrations/20260911_cg_text_invite_only.sql` in Supabase SQL Editor before deploying. It adds `follow_up_contacts.cg_text_invite_only` (default false), an approved-user setter, and a CG-specific knock entry point. It does not replace existing knock logging or results functions, change statuses, or remove contacts from smart lists.

Overview displays “No knock (text invite only)” below Status, with an explanation that it applies only to Invite to Community Group. Changes save immediately; failed saves retain the saved checkbox state and display a retry message. A Server Action revalidates the contact and CG list so Back to results reflects the saved preference.

Only `view="cg"` loads the preference, in one batch for the currently displayed contacts. A failed/incomplete read stops the list from rendering rather than enabling unknown knock permissions. Cards with the preference enabled receive an 80%-opaque gray overlay above their action row and a white, gray-outlined TEXT ONLY badge. The overlay leaves contact links accessible. Knocked is a disabled native button in this view; Text and + Interaction retain existing behavior. Contact cards in other views, spreadsheet columns, status, smart-list eligibility, and counts are unchanged.

The CG list uses `log_cg_invitation_knock`, which verifies approval and the active campaign, locks the contact, checks the current preference, then delegates to the existing `log_knock`. This also rejects stale enabled CG forms. Other views continue calling `log_knock` directly. Unchecking restores normal CG behavior. The preference is a CG invitation workflow choice, not a global restriction on logging a knock.

Test with invented data:

```sh
FOLLOW_UP_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test supabase/tests/cg-text-invite-only.test.mjs
```

Field checks: enable the checkbox, return to Invite to Community Group, confirm overlay and disabled Knocked while Text and + Interaction work; open the same contact in another smart list and confirm its normal appearance/buttons; uncheck and verify the CG card returns to normal. Also check a missing-phone contact (Text remains unavailable as before).
