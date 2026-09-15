-- Emergency off switch. Keeps devices/data intact; no destructive rollback.
-- Run if the schedule has already been installed.
update cron.job set active=false where jobname='follow-up-personal-push';
select jobname,active from cron.job where jobname='follow-up-personal-push';
