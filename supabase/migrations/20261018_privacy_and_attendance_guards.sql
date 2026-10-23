-- PulseCare IHMS incremental migration for existing deployments.
-- Apply this migration before deploying code that calls get_ihms_doctor_directory().
-- It can be applied repeatedly and does not delete application records.

-- Stop exposing complete active-doctor profile rows to every authenticated account.
drop policy if exists "Staff can read the hospital directory" on public.profiles;
drop policy if exists "Privileged staff can read managed profiles" on public.profiles;
create policy "Privileged staff can read managed profiles"
  on public.profiles for select to authenticated
  using (public.current_ihms_role() in ('admin', 'receptionist'));

-- Return only the fields required for doctor selection to authenticated users.
create or replace function public.get_ihms_doctor_directory()
returns table (
  id uuid,
  name text,
  department text,
  specialty text,
  qualification text,
  shift text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    nullif(btrim(p.details ->> 'department'), ''),
    nullif(btrim(p.details ->> 'specialty'), ''),
    nullif(btrim(p.details ->> 'qualification'), ''),
    nullif(btrim(p.details ->> 'shift'), '')
  from public.profiles as p
  where (select auth.uid()) is not null
    and public.current_ihms_role() is not null
    and p.role = 'doctor'
    and coalesce(p.details ->> 'status', 'active') = 'active'
  order by p.name;
$$;
revoke all on function public.get_ihms_doctor_directory() from public, anon;
grant execute on function public.get_ihms_doctor_directory() to authenticated;

create index if not exists ihms_active_doctor_directory_idx
  on public.profiles (name)
  where role = 'doctor' and coalesce(details ->> 'status', 'active') = 'active';

-- Enforce account status at the database boundary; UI checks are not authorization.
create or replace function public.guard_ihms_attendance_account_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.record_type <> 'attendance' or (select auth.uid()) is null then
    return new;
  end if;

  select coalesce(p.details ->> 'status', 'active')
    into v_status
  from public.profiles as p
  where p.id = (select auth.uid());

  if not found or v_status is distinct from 'active' then
    raise exception 'Only active staff members can clock in. Ask a manager to update your account status.';
  end if;

  return new;
end;
$$;
revoke all on function public.guard_ihms_attendance_account_status() from public, anon, authenticated;
drop trigger if exists guard_ihms_attendance_account_status on public.ihms_records;
create trigger guard_ihms_attendance_account_status
  before insert on public.ihms_records
  for each row execute procedure public.guard_ihms_attendance_account_status();
