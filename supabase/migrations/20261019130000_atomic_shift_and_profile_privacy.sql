-- Atomic staff-shift updates, minimal manager roster access, and email outcome tracking.
-- Safe, additive migration: it does not delete application records.

-- Existing migration versions may have granted managers direct SELECT on full profiles.
drop policy if exists "Privileged staff can read managed profiles" on public.profiles;
create policy "Privileged staff can read managed profiles"
  on public.profiles for select to authenticated
  using (public.current_ihms_role() in ('admin', 'receptionist'));

-- Managers get an intentionally limited roster through a security-definer RPC,
-- not unrestricted access to the JSONB profile details column.
create or replace function public.get_ihms_managed_staff_directory()
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  role text,
  created_at timestamptz,
  custom_role_title text,
  department text,
  specialty text,
  qualification text,
  shift text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role::text,
    p.created_at,
    nullif(btrim(p.details ->> 'customRoleTitle'), ''),
    nullif(btrim(p.details ->> 'department'), ''),
    nullif(btrim(p.details ->> 'specialty'), ''),
    nullif(btrim(p.details ->> 'qualification'), ''),
    nullif(btrim(p.details ->> 'shift'), ''),
    coalesce(nullif(p.details ->> 'status', ''), 'active')
  from public.profiles as p
  where public.current_ihms_role() = 'manager'
    and p.role not in ('admin', 'manager', 'patient')
  order by p.name;
$$;
revoke all on function public.get_ihms_managed_staff_directory() from public, anon;
grant execute on function public.get_ihms_managed_staff_directory() to authenticated;

-- This event table contains only a profile id and timestamp. It lets managers
-- learn that their sanitized roster changed without exposing raw profile rows.
create table if not exists public.ihms_staff_directory_events (
  event_id bigint generated always as identity primary key,
  staff_id uuid not null,
  changed_at timestamptz not null default now()
);
create index if not exists ihms_staff_directory_events_changed_idx
  on public.ihms_staff_directory_events (changed_at);
alter table public.ihms_staff_directory_events enable row level security;
revoke all on public.ihms_staff_directory_events from public, anon;
revoke all on public.ihms_staff_directory_events from authenticated;
grant select on public.ihms_staff_directory_events to authenticated;
drop policy if exists "Managers receive roster change signals" on public.ihms_staff_directory_events;
create policy "Managers receive roster change signals"
  on public.ihms_staff_directory_events for select to authenticated
  using (public.current_ihms_role() = 'manager');

create or replace function public.publish_ihms_staff_directory_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_relevant boolean := false;
begin
  if tg_op = 'DELETE' then
    v_staff_id := old.id;
    v_relevant := old.role not in ('admin', 'manager', 'patient');
  elsif tg_op = 'UPDATE' then
    v_staff_id := new.id;
    v_relevant := old.role not in ('admin', 'manager', 'patient') or new.role not in ('admin', 'manager', 'patient');
  else
    v_staff_id := new.id;
    v_relevant := new.role not in ('admin', 'manager', 'patient');
  end if;

  if v_relevant then
    insert into public.ihms_staff_directory_events (staff_id, changed_at)
    values (v_staff_id, now());
    delete from public.ihms_staff_directory_events
    where changed_at < now() - interval '7 days';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.publish_ihms_staff_directory_change() from public, anon, authenticated;
drop trigger if exists publish_ihms_staff_directory_change on public.profiles;
create trigger publish_ihms_staff_directory_change
  after insert or update or delete on public.profiles
  for each row execute procedure public.publish_ihms_staff_directory_change();

-- Patients and non-managerial staff need to find active doctors, not read private
-- profile columns. Expose only the fields required for the doctor picker.
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

-- Serialize appointment writes and doctor shift changes on the same doctor lock.
-- Trigger names are ordered alphabetically by PostgreSQL, so this runs before
-- prepare_ihms_record_insert on appointment INSERT and acquires the lock first.
create or replace function public.lock_ihms_appointment_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock_ids text[] := array[]::text[];
  v_lock_id text;
begin
  if tg_op = 'UPDATE'
    and old.record_type = 'appointments'
    and new.record_type = 'appointments'
    and old.doctor_id is distinct from new.doctor_id then
    v_lock_ids := array[old.doctor_id, new.doctor_id];
  elsif new.record_type = 'appointments' then
    v_lock_ids := array[new.doctor_id];
  elsif tg_op = 'UPDATE' and old.record_type = 'appointments' then
    v_lock_ids := array[old.doctor_id];
  else
    return new;
  end if;

  for v_lock_id in
    select distinct ids.requested_id
    from unnest(v_lock_ids) as ids(requested_id)
    where ids.requested_id is not null
    order by ids.requested_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('ihms-doctor-schedule:' || v_lock_id, 0));
  end loop;

  return new;
end;
$$;
revoke all on function public.lock_ihms_appointment_schedule() from public, anon, authenticated;
drop trigger if exists a_lock_ihms_appointment_schedule on public.ihms_records;
create trigger a_lock_ihms_appointment_schedule
  before insert or update on public.ihms_records
  for each row execute procedure public.lock_ihms_appointment_schedule();

-- Date validator avoids relying on PostgreSQL-version-specific input helpers.
create or replace function public.ihms_is_valid_date(p_date text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  perform p_date::date;
  return true;
exception when others then
  return false;
end;
$$;

-- Atomically check pending/future appointment conflicts and apply a staff shift.
-- The API must call this with the server-only service_role credential.
create or replace function public.update_ihms_staff_shift(
  p_staff_id uuid,
  p_shift text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_details jsonb;
  v_conflicts integer := 0;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_staff_id is null or p_shift is distinct from 'general' then
    raise exception 'A staff id and the General Shift are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ihms-doctor-schedule:' || p_staff_id::text, 0));

  select p.role::text, p.details
    into v_role, v_details
  from public.profiles p
  where p.id = p_staff_id
  for update;

  if not found or v_role = 'patient' then
    raise exception 'Staff account not found';
  end if;

  if v_role = 'doctor' and coalesce(v_details ->> 'shift', 'unassigned') is distinct from p_shift then
    select count(*)::integer
      into v_conflicts
    from public.ihms_records r
    cross join lateral (
      select
        case
          when coalesce(r.payload ->> 'timeSlot', '') ~ '^(0[1-9]|1[0-2]):(00|15|30|45) (AM|PM)$'
          then (
            ((split_part(split_part(r.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer % 12)
              + case when split_part(r.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end) * 60
            + split_part(split_part(r.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer
          )
          else -1
        end as slot_minutes,
        case
          when not public.ihms_is_valid_date(r.payload ->> 'date') then true
          when (r.payload ->> 'date')::date > v_today then true
          when (r.payload ->> 'date')::date < v_today then false
          when coalesce(r.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):(00|15|30|45) (AM|PM)$' then true
          else (
            ((r.payload ->> 'date')::date + make_time(
              (split_part(split_part(r.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer % 12)
                + case when split_part(r.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end,
              split_part(split_part(r.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer,
              0
            )) at time zone 'Asia/Kolkata'
          ) > now()
        end as starts_in_future
    ) as slot
    where r.record_type = 'appointments'
      and r.doctor_id = p_staff_id::text
      and r.payload ->> 'date' >= v_today::text
      and r.payload ->> 'status' in ('scheduled', 'waiting', 'in_consultation')
      and r.payload ->> 'type' in ('online_booking', 'follow_up')
      and slot.starts_in_future
      and (
        slot.slot_minutes < 540
        or slot.slot_minutes >= 1320
        or (slot.slot_minutes >= 780 and slot.slot_minutes < 840)
      );

    if v_conflicts > 0 then
      return jsonb_build_object('updated', false, 'conflicts', v_conflicts);
    end if;
  end if;

  update public.profiles
  set details = jsonb_set(coalesce(details, '{}'::jsonb), '{shift}', to_jsonb(p_shift), true)
  where id = p_staff_id;

  return jsonb_build_object('updated', true, 'conflicts', 0);
end;
$$;
revoke all on function public.update_ihms_staff_shift(uuid, text) from public, anon, authenticated;
grant execute on function public.update_ihms_staff_shift(uuid, text) to service_role;

-- Preserve the distinction between a failed send and a provider-accepted message
-- whose database delivery tracking could not be confirmed. Unknown outcomes are
-- deliberately not eligible for automatic retry.
alter table public.ihms_email_notifications
  drop constraint if exists ihms_email_notifications_status_check;
alter table public.ihms_email_notifications
  add constraint ihms_email_notifications_status_check
  check (status in ('sending', 'sent', 'failed', 'unknown'));

-- A stale in-flight email is ambiguous and must not be automatically retried:
-- SMTP may have accepted it before the previous request/process failed.
create or replace function public.claim_ihms_appointment_confirmation(
  p_appointment_id text,
  p_recipient_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  insert into public.ihms_email_notifications (
    appointment_id,
    notification_type,
    recipient_email,
    status
  )
  values (
    p_appointment_id,
    'appointment_confirmation',
    p_recipient_email,
    'sending'
  )
  on conflict (appointment_id) do nothing;

  if found then return true; end if;

  update public.ihms_email_notifications
  set recipient_email = p_recipient_email,
      status = 'sending',
      updated_at = now(),
      sent_at = null,
      provider_message_id = null
  where appointment_id = p_appointment_id
    and notification_type = 'appointment_confirmation'
    and status = 'failed'
  returning true into claimed;

  if coalesce(claimed, false) then return true; end if;

  update public.ihms_email_notifications
  set status = 'unknown', updated_at = now()
  where appointment_id = p_appointment_id
    and notification_type = 'appointment_confirmation'
    and status = 'sending'
    and updated_at < now() - interval '10 minutes';

  return false;
end;
$$;
revoke all on function public.claim_ihms_appointment_confirmation(text, text) from public, anon, authenticated;
grant execute on function public.claim_ihms_appointment_confirmation(text, text) to service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ihms_staff_directory_events'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ihms_staff_directory_events;
  END IF;
END;
$$;
