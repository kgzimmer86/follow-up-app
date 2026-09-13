#!/bin/bash
set -euo pipefail
if [ "$#" -ne 0 ]; then
  echo 'This testing-only installer accepts no arguments.' >&2
  exit 1
fi
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGPASSFILE=/dev/null
export PGCONNECT_TIMEOUT=20
echo 'Target: Follow Up TESTING only — tcbwepqkvnquxkbtaxcl'
echo 'Enter the TEST database password at the prompt. It will not display or be saved.'
/Applications/Postgres.app/Contents/Versions/17/bin/psql \
  -X --quiet --set=ON_ERROR_STOP=1 --password \
  --dbname='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.tcbwepqkvnquxkbtaxcl sslmode=require' \
  --file=/Users/kylezimmerman/Documents/follow-up-app/supabase/migrations/20260912_community_contact_results.sql
# Switch the isolated app only after its database endpoint installs successfully.
rsync -a /Users/kylezimmerman/Documents/follow-up-app/src/components/follow-up/contact-results-page.tsx /private/tmp/follow-up-staging-app.7gxSub/src/components/follow-up/contact-results-page.tsx
rsync -a '/Users/kylezimmerman/Documents/follow-up-app/src/app/community/groups/[groupId]/contacts/[segment]/page.tsx' '/private/tmp/follow-up-staging-app.7gxSub/src/app/community/groups/[groupId]/contacts/[segment]/page.tsx'
echo 'SUCCESS: optimized contact shortcuts installed in TESTING only.'
