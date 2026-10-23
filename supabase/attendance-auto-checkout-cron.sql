-- Enable Supabase Cron / pg_cron in Dashboard > Integrations > Cron first.
-- Then run this script once in the SQL Editor. The database worker checks due shifts each minute.
-- The function is idempotent: concurrent/repeated runs cannot write a second checkout.

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('ihms-attendance-auto-checkout', 'ihms-cron-history-cleanup') loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ihms-attendance-auto-checkout',
  '* * * * *',
  'select public.auto_checkout_due_ihms_attendance();'
);


-- Supabase Cron records every execution in cron.job_run_details and does not prune it automatically.
-- Keep a two-week history while preventing unbounded growth from the minute-level worker.
select cron.schedule(
  'ihms-cron-history-cleanup',
  '10 0 * * *',
  'delete from cron.job_run_details where end_time < now() - interval ''14 days'';'
);
