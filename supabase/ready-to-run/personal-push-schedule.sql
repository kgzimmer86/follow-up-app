-- Run ONLY after app deployment, Vercel variables, and Supabase Vault setup.
-- Vault secret name: follow_up_push_cron_secret
-- Secret value: the SAME random PUSH_CRON_SECRET set in Vercel (not a VAPID key).
-- Enable pg_cron and pg_net from Supabase Database > Extensions first.
begin;
do $$ begin
  if to_regprocedure('public.follow_up_push_claim()') is null then
    raise exception 'Install the personal push migration first.';
  end if;
  if not exists(select 1 from vault.decrypted_secrets
    where name='follow_up_push_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'Create follow_up_push_cron_secret in Supabase Vault first.';
  end if;
end $$;

-- One dispatcher per minute, each device checked about every FIVE minutes.
-- Reusing the job name updates the schedule rather than creating a duplicate.
select cron.schedule('follow-up-personal-push','* * * * *',$job$
  select net.http_post(
    url := 'https://follow-up-app-red.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='follow_up_push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
commit;
