-- Ensure deployments using incremental migrations have the server-only rate limiter
-- required by the mobile-number sign-in route. Safe to apply when schema.sql already
-- created the table/function; no profile or attendance records are modified.

create table if not exists public.ihms_api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ihms_api_rate_limits enable row level security;
create index if not exists ihms_api_rate_limits_updated_idx
  on public.ihms_api_rate_limits (updated_at);
revoke all on public.ihms_api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.ihms_api_rate_limits to service_role;

create or replace function public.consume_ihms_api_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) > 160
    or p_max_requests < 1 or p_max_requests > 10000
    or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.ihms_api_rate_limits as saved (
    bucket_key, window_started_at, request_count, updated_at
  ) values (
    p_bucket_key, v_now, 1, v_now
  )
  on conflict (bucket_key) do update set
    window_started_at = case
      when saved.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
      else saved.window_started_at
    end,
    request_count = case
      when saved.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
      else saved.request_count + 1
    end,
    updated_at = v_now
  returning request_count into v_count;

  delete from public.ihms_api_rate_limits
  where updated_at < v_now - interval '1 day';

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_ihms_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ihms_api_rate_limit(text, integer, integer) to service_role;
