# Personal group notification badges

Prepared locally; SQL has not been run against a hosted database.

Run the complete `migrations/20260919_leader_group_badges.sql` manually in the
same Supabase project. It replaces only `community_workspace_counts()`.

The Groups navigation badge and the Groups portion of the combined Community
workspace badge now require an explicit `community_group_leaders` entry for the
signed-in user. Staff/Admin oversight access alone contributes nothing. Existing
area/access checks still apply. Co-leaders each see their group's count; a person
flagged in two led groups still counts twice, once for each group.

My Contacts, personal Invitations, reminder rules, and per-group Needs Attention
details/counts stay unchanged. Users may inspect other accessible groups without
those groups contributing to their notification total. No app deployment is
needed to activate the rule: existing clients get it on their next badge refresh
(normally within a minute while visible or when returning to the app).

Verification: local invented-data tests cover admin/staff oversight without
leadership, explicit leaders of every approved role, multiple groups, removed
leadership, area restriction, inactive groups, check-in clearing, archives,
inactive/pending/anonymous accounts, unchanged invitations, and unchanged group
detail access. Run `node --test supabase/tests/invitation-assignments.test.mjs`.

After installation, verify a Staff/Admin account with access to multiple groups:
only explicitly led groups contribute to the navigation badge. Open an overseen
group to confirm its details remain available. Someone leading no groups should
have no Groups badge (their invitation badge can still appear).

Rollback is SQL, not a Vercel rollback, because this updates a database function.
`ready-to-run/restore-accessible-group-badges.sql` restores the preceding
access-based notification rule without changing student/group records.
