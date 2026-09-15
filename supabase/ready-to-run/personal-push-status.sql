-- Counts only: never reveal endpoint URLs, subscription keys, or Vault secrets.
select count(*) as opted_in_devices,
  count(*) filter(where next_check_at<=now() and (lease_until is null or lease_until<now())) as due_devices,
  count(*) filter(where failures>0) as retrying_devices,
  count(*) filter(where last_fingerprint is not null) as devices_with_accepted_delivery
from private.follow_up_push_devices;

select jobname,active from cron.job where jobname='follow-up-personal-push';

-- Cron success means the HTTP request was queued, not that delivery succeeded.
-- Other jobs may share pg_net. Deliberately omit their response/error bodies.
select r.id,r.status_code,r.timed_out,r.created
from net._http_response r
where r.created>now()-interval '15 minutes'
order by r.created desc limit 20;
