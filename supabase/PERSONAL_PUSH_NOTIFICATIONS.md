# Personal phone notifications

Prepared locally; not deployed or enabled by creating these files.

Local verification after the security patch: production build/TypeScript pass on Next.js 16.3.5; all 201 self-contained tests pass (including 17 notification tests); lint has no errors and one existing `app-loading.tsx` image warning. One separate schema-export integration test remains excluded because `FOLLOW_UP_EXPORTED_SCHEMA` is unavailable. Real iPhone/Android delivery and hosted scheduling remain untested until rollout.

## Behavior

- Optional per-device switch in Profile. No automatic permission prompts.
- Combines own contact attention, own initial invitations, and group/member attention only in groups explicitly led. Overseen groups and invitation no-response reminders are excluded.
- A batch of five new contacts produces one summary per subscribed device when the next check sees that batch. A change spanning two checks can produce two summaries.
- First delivery confirms setup, even if the total is zero. Subsequent deliveries happen only when the set of attention items changes. Replacing one item with another still notifies even if the total stays the same. Changes entirely between checks are coalesced.
- About five-minute per-device checking, including time-only thresholds and closed-app use. Network, device settings, operating-system delivery, retries, or backlog can delay delivery. This is not an immediate or guaranteed-delivery service.
- iPhone/iPad: installed Home Screen web app, notification permission required. Each push displays a visible notification, including decreases/zero. The same notification tag replaces the prior summary where supported. Android launcher badges generally reflect notifications, not the exact task total; a resolved-items notification may still leave an Android notification dot until dismissed.
- Payloads contain counts, no student names/details. Notification opens `/notifications`, showing current totals with links to existing workspaces. No offline caching/fetch interception.
- Signing out clears the worker binding and unsubscribes this browser. Other devices are independent. Inactive/pending/deleted accounts lose scheduled delivery. A push already queued before opting out may still show a generic notice.
- Foreground badge sync reuses existing in-app count queries. No extra server-render-blocking queries; subscription ownership is checked once after mounting an approved session.

## Rollout — do this together, in order

1. Save a restore point: record the current production Vercel deployment URL and commit SHA in GitHub Desktop. Keep the existing database backup policy. No existing contact/group data or attention rules are changed by this migration.
   Security patches have now been applied locally with Kyle's approval (see below). They do not protect the live deployment until committed, pushed, and deployed. The supplied rollback deployment is `https://follow-up-i7u7i20hg-michigan-cru.vercel.app`; it predates these patches, so treat it only as an emergency rollback, not a patched long-term deployment.
2. Run `ready-to-run/personal-push-preflight.sql` in Supabase SQL Editor. First five columns should be true; `push_already_installed` should be false for a first install. Stop on unexpected results.
3. Run the complete `migrations/20260920_personal_push_notifications.sql`. It is rerunnable and does NOT start notifications or scheduling.
4. In a trusted local terminal, from this project, run `npx --no-install web-push generate-vapid-keys`. This uses the installed library, not a third-party key-generation website. Keep the private key private. Generate a separate random 32-byte secret (e.g. `openssl rand -hex 32`) for the scheduler. Do not paste secrets into chat, commit them, or place them in public/browser-prefixed variables.
5. Add these Vercel environment variables for **Production only**:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generated public key |
   | `VAPID_PRIVATE_KEY` | Matching generated private key |
   | `VAPID_SUBJECT` | `https://follow-up-app-red.vercel.app` |
   | `PUSH_CRON_SECRET` | Separate random scheduler secret (at least 32 characters) |
   | `SUPABASE_SERVICE_ROLE_KEY` | This project's Supabase service-role server key; never the publishable key |

   Existing Supabase URL/publishable-key variables stay unchanged. Do not copy the service-role key into any `NEXT_PUBLIC_` variable. Preserve the VAPID key pair; rotating it requires devices to subscribe again.
6. Commit/push the app changes in GitHub Desktop and verify production deployment. Confirm `/sw.js` returns JavaScript, not a login/HTML page, and `/profile` displays Phone notifications. An unauthenticated POST to `/api/push/dispatch` must return 401. Nothing sends until the schedule is installed.
7. In Supabase Database Extensions, enable `pg_cron` and `pg_net` if not already enabled. In Supabase Vault, create secret `follow_up_push_cron_secret` containing the same value as Vercel's `PUSH_CRON_SECRET`. Do not use the VAPID private key here.
8. Run `ready-to-run/personal-push-schedule.sql`. This starts delivery ONLY to devices that explicitly opted in. It uses the permanent address supplied by Kyle, not a preview URL. Ensure Vercel deployment protection permits the scheduler to reach this production route; do not disable protection globally as a workaround.
9. On Kyle's iPhone, add/open Follow Up from Home Screen, go to Profile, enable notifications, allow the prompt, then close the app and wait for the first summary. Use the checklist below before asking others to opt in.

## Phone acceptance checklist (requires real devices)

- First summary appears with app closed, and iPhone Home Screen count matches My Contacts + My Invitations + led-group attention.
- Assign five test contacts together; one combined update arrives at the next check.
- Leave counts unchanged for two checks; no repeated notification.
- Resolve some/all items; count decreases/clears after the next check, accompanied by a summary notification.
- An invitation reminder alone or a group only overseen does not increase the total. A led-group attention item does.
- Tap notification: current account opens attention links. No student details appear on the lock screen.
- Disable on this device: no new scheduled notifications; in-app red badges remain unchanged.
- Sign out, sign in as a different test account: no old-account count appears; the new account must opt in separately.
- Test Android separately; do not promise an exact numeric badge across launchers.

## Operations and recovery

`ready-to-run/personal-push-status.sql` shows counts and recent HTTP responses. Other pg_net jobs may also appear in its HTTP response list. Expected dispatch response is 200; 401 indicates secret mismatch, 503 indicates configuration/query/delivery/retry issues. Database job success alone does not prove an HTTP 200. Accepted delivery also does not prove the phone displayed it.

Default capacity: at most 50 due devices examined per minute (roughly 250 devices per five-minute cycle). Snapshot calculation is reused for multiple devices belonging to the same user within a batch. Leases prevent overlapping dispatchers from sending concurrently; interruptions retry after two minutes. Failed providers retry with bounded backoff. 404/410 subscriptions are removed. Delivery is at-least-once: a crash after provider acceptance but before DB acknowledgement can repeat a summary, with the same notification tag. Unexpected database errors fail the batch rather than send guessed counts.

To pause: run `ready-to-run/personal-push-pause.sql`. To resume: rerun the schedule file. Neither operation deletes student or device data. For an immediate server off switch, remove `PUSH_CRON_SECRET` and redeploy (requests then return 401). Do not rotate the VAPID key pair for a temporary pause. Existing already-queued notifications may still arrive.

To roll back the app, pause the schedule first, then restore the recorded Vercel deployment. The additive push table/functions may remain dormant. Do not remove the shared Supabase cron/net extensions because other jobs may use them.

## References

- [Apple Home Screen badging and visible-push requirement](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
- [Supabase scheduled HTTP calls with Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Web Push library](https://github.com/web-push-libs/web-push)

## Security patch follow-up (approved by Kyle)

Updated Next.js and eslint-config-next from 16.3.2 to 16.3.5, sharp to 0.35.4, and js-yaml to 4.3.2. The post-update `npm audit` reports zero known vulnerabilities. This is a dependency audit, not proof of absence of all security issues or a production incident investigation. No database or app workflow changes were needed for these patches.

The [maintainer's AVIF image-processing advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) lists 16.3.3 as patched; the installed 16.3.5 is beyond that fix. Keep the lockfile in the deployment commit. If deploying the security fix separately first, select only `package.json` and `package-lock.json` in GitHub Desktop; they also include the newly installed but otherwise inert Web Push dependency. Leave notification code/SQL changes unselected until its rollout. Adding that unused dependency does not activate notifications or require notification SQL.
