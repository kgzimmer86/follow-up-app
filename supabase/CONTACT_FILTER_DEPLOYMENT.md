# Contact filter area update

1. In Supabase, open SQL Editor and create a new query.
2. Copy the entire contents of `migrations/20260907_contact_filter_area_context.sql` into it and click Run. Expect “Success. No rows returned.”
3. Commit and push the app changes, then wait for Vercel to finish deploying.
4. Refresh the app and test the filters described below.

The SQL creates `get_follow_up_contact_results_v2`. It leaves the original function intact, so the existing deployed app continues working before the new deployment. Authentication, active-user checks, campaign selection, smart-card criteria, room rules, sorting and pagination remain the same. The new function removes the implicit default-area restriction from gospel, new, community-group and area lists. The app supplies the visible area selections instead. There are no table, data or permission-role changes; the new function is executable by authenticated users and keeps the existing active-user checks.

## Test

- Use “Use my assigned area”: a campus-region assignment selects that region; a dorm assignment selects its parent region and dorm; an affinity assignment selects its affinity. Other personal filters stay selected.
- Select another campus: only its dorms/locations appear, an incompatible dorm/floor/wing clears, and matching results can come from the newly selected campus.
- Change between smart cards: personal choices remain and card-specific criteria change.
- Clear Filters: all personal restrictions disappear, including geography, and stay cleared across cards and refreshes.
- Reach Out to No Address starts without geographic filters when entered from Home. Returning to another card preserves that card family's geographic context. Other personal filters still travel.
- Open a contact, return, change sort, and use pagination: the current filter snapshot remains intact.

Previously saved personal choices take precedence over the assigned-area starting point. Use “Use my assigned area” to reset geographic context on an existing browser. For a first-visit test, use a browser profile that has no saved Follow Up filter preferences.

If the app deployment must be rolled back, roll back Vercel to the previous deployment. The original function remains available; the unused v2 function can remain in place.
