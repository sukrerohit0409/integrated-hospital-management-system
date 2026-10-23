-- Safe to apply to a clean project or upgrade the earlier auth-only schema.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'ihms_role'
  ) then
    create type public.ihms_role as enum (
      'admin', 'manager', 'doctor', 'receptionist',
      'nurse', 'cleaner', 'ward_boy', 'other', 'patient'
    );
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text not null default '',
  role public.ihms_role not null default 'patient',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The current roster has one General Shift for every non-patient staff profile.
-- This migrates morning/evening/night/unassigned legacy profiles without touching attendance history.
-- Existing attendance rows retain their recorded shiftEndAt snapshot and will still auto-close at that end.
update public.profiles
set details = jsonb_set(coalesce(details, '{}'::jsonb), '{shift}', to_jsonb('general'::text), true)
where role <> 'patient'
  and coalesce(details ->> 'shift', '') is distinct from 'general';

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Hospital managers can read profiles" on public.profiles;
drop policy if exists "Staff can read the hospital directory" on public.profiles;
drop policy if exists "Privileged staff can read managed profiles" on public.profiles;
drop policy if exists "Users can update their own contact details" on public.profiles;

create or replace function public.current_ihms_role()
returns public.ihms_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and coalesce(details ->> 'status', 'active') <> 'inactive'
$$;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

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

create or replace function public.create_patient_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Patient self-signups and patient invitations must use Gmail because their
  -- confirmation/invitation email is part of the registration workflow. Staff
  -- accounts are created by the trusted server API, which marks them in app
  -- metadata (not user-editable metadata) and performs general email validation.
  if coalesce(new.raw_app_meta_data ->> 'ihmsAccountType', '') <> 'staff'
    and (
      length(coalesce(new.email, '')) > 254
      or lower(coalesce(new.email, '')) !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@gmail\.com$'
    ) then
    raise exception 'Patient registration requires a valid Gmail address ending in @gmail.com';
  end if;
  if length(btrim(coalesce(new.raw_user_meta_data ->> 'name', ''))) < 2
    or length(btrim(coalesce(new.raw_user_meta_data ->> 'name', ''))) > 80
    or btrim(coalesce(new.raw_user_meta_data ->> 'name', '')) !~ '[[:alpha:]]'
    or coalesce(new.raw_user_meta_data ->> 'phone', '') !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a name of 2–80 characters and a valid 10-digit Indian mobile number';
  end if;

  insert into public.profiles (id, name, email, phone, role, details)
  values (
    new.id,
    btrim(coalesce(new.raw_user_meta_data ->> 'name', '')),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'patient',
    jsonb_build_object(
      'age', case
        when new.raw_user_meta_data ->> 'age' ~ '^[0-9]{1,3}$'
          and (new.raw_user_meta_data ->> 'age')::integer between 1 and 120
        then (new.raw_user_meta_data ->> 'age')::integer
        else null
      end,
      'gender', new.raw_user_meta_data ->> 'gender',
      'bloodGroup', case
        when new.raw_user_meta_data ->> 'bloodGroup' in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
        then new.raw_user_meta_data ->> 'bloodGroup'
        else null
      end
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_patient_profile();

grant select on public.profiles to authenticated;
revoke update, insert, delete on public.profiles from authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

create table if not exists public.ihms_records (
  record_type text not null check (
    record_type in ('appointments', 'attendance', 'revenue', 'expenses', 'leaves')
  ),
  record_id text not null,
  owner_id text,
  doctor_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (record_type, record_id)
);

create index if not exists ihms_records_owner_idx on public.ihms_records (owner_id);
create index if not exists ihms_records_doctor_idx on public.ihms_records (doctor_id);
-- Keep the minute-level checkout worker focused on open attendance rows.
create index if not exists ihms_attendance_open_idx
  on public.ihms_records (record_id)
  where record_type = 'attendance'
    and payload ->> 'clockOutAt' is null
    and payload ->> 'clockOut' is null;
create unique index if not exists ihms_appointment_token_unique
  on public.ihms_records ((payload ->> 'tokenNumber'))
  where record_type = 'appointments';
create unique index if not exists ihms_follow_up_source_unique
  on public.ihms_records ((payload ->> 'followUpForAppointmentId'))
  where record_type = 'appointments'
    and payload ->> 'type' = 'follow_up'
    and payload ->> 'followUpForAppointmentId' is not null;
drop index if exists public.ihms_appointment_slot_unique;
create unique index ihms_appointment_slot_unique
  on public.ihms_records (
    doctor_id,
    (payload ->> 'date'),
    (payload ->> 'timeSlot')
  )
  where record_type = 'appointments'
    and payload ->> 'type' in ('online_booking', 'follow_up')
    and payload ->> 'status' <> 'cancelled';
alter table public.ihms_records enable row level security;

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

create table if not exists public.ihms_prescriptions (
  appointment_id text primary key,
  patient_id text not null,
  doctor_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ihms_prescriptions_patient_idx on public.ihms_prescriptions (patient_id);
create index if not exists ihms_prescriptions_doctor_idx on public.ihms_prescriptions (doctor_id);

create table if not exists public.ihms_email_notifications (
  appointment_id text primary key,
  notification_type text not null check (notification_type = 'appointment_confirmation'),
  recipient_email text not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'unknown')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.ihms_email_notifications enable row level security;
revoke all on public.ihms_email_notifications from anon, authenticated;
revoke all on public.ihms_email_notifications from public;

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

  -- Retry only a send that was explicitly marked failed before provider acceptance.
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

  if coalesce(claimed, false) then
    return true;
  end if;

  -- A stale 'sending' row is ambiguous: the process may have crashed after SMTP
  -- accepted the message but before persisting 'sent'. Mark it unknown, never auto-resend.
  update public.ihms_email_notifications
  set status = 'unknown',
      updated_at = now()
  where appointment_id = p_appointment_id
    and notification_type = 'appointment_confirmation'
    and status = 'sending'
    and updated_at < now() - interval '10 minutes';

  return false;
end;
$$;

revoke all on function public.claim_ihms_appointment_confirmation(text, text) from public, anon, authenticated;
grant execute on function public.claim_ihms_appointment_confirmation(text, text) to service_role;

create unique index if not exists ihms_revenue_appointment_unique
  on public.ihms_records ((payload ->> 'appointmentId'))
  where record_type = 'revenue' and payload ->> 'appointmentId' is not null;
alter table public.ihms_prescriptions enable row level security;

drop policy if exists "Read prescriptions for the patient and care team" on public.ihms_prescriptions;
drop policy if exists "Assigned doctors manage prescriptions" on public.ihms_prescriptions;
drop policy if exists "Assigned doctors update prescriptions" on public.ihms_prescriptions;
drop policy if exists "Assigned doctors delete prescriptions" on public.ihms_prescriptions;

create policy "Read prescriptions for the patient and care team"
  on public.ihms_prescriptions for select to authenticated
  using (
    public.current_ihms_role() is not null
    and (
      patient_id = (select auth.uid())::text
      or doctor_id = (select auth.uid())::text
      or public.current_ihms_role() = 'admin'
    )
  );

create policy "Assigned doctors manage prescriptions"
  on public.ihms_prescriptions for insert to authenticated
  with check (
    public.current_ihms_role() = 'doctor'
    and doctor_id = (select auth.uid())::text
    and exists (
      select 1 from public.ihms_records a
      where a.record_type = 'appointments'
        and a.record_id = (select ihms_prescriptions.appointment_id)
        and a.owner_id = (select ihms_prescriptions.patient_id)
        and a.doctor_id = (select ihms_prescriptions.doctor_id)
    )
  );

create policy "Assigned doctors update prescriptions"
  on public.ihms_prescriptions for update to authenticated
  using (
    public.current_ihms_role() = 'doctor'
    and doctor_id = (select auth.uid())::text
  )
  with check (
    public.current_ihms_role() = 'doctor'
    and doctor_id = (select auth.uid())::text
  );

create policy "Assigned doctors delete prescriptions"
  on public.ihms_prescriptions for delete to authenticated
  using (
    public.current_ihms_role() = 'doctor'
    and doctor_id = (select auth.uid())::text
  );

create or replace function public.guard_ihms_prescription_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_id <> old.appointment_id
    or new.patient_id <> old.patient_id
    or new.doctor_id <> old.doctor_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Prescription ownership and identity cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.prepare_ihms_prescription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician public.profiles%rowtype;
  appointment_payload jsonb;
begin
  select * into clinician
  from public.profiles
  where id::text = new.doctor_id and role = 'doctor';
  if not found or new.doctor_id <> (select auth.uid())::text then
    raise exception 'Only the assigned doctor can create a prescription';
  end if;

  select a.payload into appointment_payload
  from public.ihms_records a
  where a.record_type = 'appointments'
    and a.record_id = new.appointment_id
    and a.doctor_id = new.doctor_id
    and a.owner_id = new.patient_id;
  if not found then raise exception 'Prescription must belong to the assigned patient visit'; end if;
  if coalesce(new.payload ->> 'followUpDate', '') <> '' then
    if new.payload ->> 'followUpDate' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Follow-up date is invalid';
    end if;
    if (new.payload ->> 'followUpDate')::date < (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'Follow-up date cannot be earlier than today';
    end if;
  end if;

  new.payload := jsonb_set(new.payload, '{appointmentId}', to_jsonb(new.appointment_id), true);
  new.payload := jsonb_set(new.payload, '{doctorId}', to_jsonb(clinician.id::text), true);
  new.payload := jsonb_set(new.payload, '{doctorName}', to_jsonb(clinician.name), true);
  new.payload := jsonb_set(
    new.payload,
    '{doctorSpecialty}',
    coalesce(clinician.details -> 'specialty', 'null'::jsonb),
    true
  );
  new.payload := jsonb_set(new.payload, '{patientId}', to_jsonb(new.patient_id), true);
  new.payload := jsonb_set(
    new.payload,
    '{patientName}',
    coalesce(appointment_payload -> 'patientName', '""'::jsonb),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{patientAge}',
    coalesce(appointment_payload -> 'patientAge', 'null'::jsonb),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{patientGender}',
    coalesce(appointment_payload -> 'patientGender', 'null'::jsonb),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{patientPhone}',
    coalesce(appointment_payload -> 'patientPhone', 'null'::jsonb),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{patientEmail}',
    coalesce(appointment_payload -> 'patientEmail', 'null'::jsonb),
    true
  );
  new.payload := jsonb_set(
    new.payload,
    '{date}',
    to_jsonb(((now() at time zone 'Asia/Kolkata')::date)::text),
    true
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_ihms_prescription_update on public.ihms_prescriptions;
drop trigger if exists prepare_ihms_prescription on public.ihms_prescriptions;
create trigger guard_ihms_prescription_update
  before update on public.ihms_prescriptions
  for each row execute procedure public.guard_ihms_prescription_update();
create trigger prepare_ihms_prescription
  before insert or update on public.ihms_prescriptions
  for each row execute procedure public.prepare_ihms_prescription();

drop policy if exists "Read records permitted for the signed-in role" on public.ihms_records;
drop policy if exists "Create permitted hospital records" on public.ihms_records;
drop policy if exists "Update permitted hospital records" on public.ihms_records;
drop policy if exists "Delete permitted hospital records" on public.ihms_records;

create policy "Read records permitted for the signed-in role"
  on public.ihms_records for select to authenticated
  using (
    public.current_ihms_role() is not null
    and case record_type
      when 'appointments' then
        owner_id = (select auth.uid())::text
        or doctor_id = (select auth.uid())::text
        or public.current_ihms_role() in ('admin', 'receptionist')
      when 'attendance' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() = 'admin'
        or (
          public.current_ihms_role() = 'manager'
          and coalesce(payload ->> 'role', '') <> 'admin'
        )
      when 'leaves' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() in ('admin', 'manager')
      when 'revenue' then
        public.current_ihms_role() in ('admin', 'receptionist')
      when 'expenses' then
        public.current_ihms_role() = 'admin'
      else false
    end
  );

create or replace function public.get_booked_slots(p_doctor_id text, p_date date)
returns table(time_slot text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.payload ->> 'timeSlot'
  from public.ihms_records r
  where public.current_ihms_role() = 'patient'
    and p_date >= (now() at time zone 'Asia/Kolkata')::date
    and r.record_type = 'appointments'
    and r.payload ->> 'type' in ('online_booking', 'follow_up')
    and r.doctor_id = p_doctor_id
    and r.payload ->> 'date' = p_date::text
    and r.payload ->> 'status' <> 'cancelled'
$$;

revoke all on function public.get_booked_slots(text, date) from public, anon;
grant execute on function public.get_booked_slots(text, date) to authenticated;

create policy "Create permitted hospital records"
  on public.ihms_records for insert to authenticated
  with check (
    case record_type
      when 'appointments' then
        (public.current_ihms_role() = 'patient' and owner_id = (select auth.uid())::text)
        or public.current_ihms_role() in ('admin', 'receptionist')
      when 'attendance' then
        owner_id = (select auth.uid())::text
        and public.current_ihms_role() in ('doctor', 'manager', 'receptionist', 'nurse', 'cleaner', 'ward_boy', 'other')
      when 'leaves' then
        owner_id = (select auth.uid())::text
        and public.current_ihms_role() in ('doctor', 'receptionist', 'nurse', 'cleaner', 'ward_boy', 'other')
      when 'revenue' then
        public.current_ihms_role() = 'receptionist'
      when 'expenses' then
        public.current_ihms_role() = 'admin'
      else false
    end
  );

create policy "Update permitted hospital records"
  on public.ihms_records for update to authenticated
  using (
    case record_type
      when 'appointments' then
        public.current_ihms_role() in ('admin', 'receptionist')
        or (public.current_ihms_role() = 'doctor' and doctor_id = (select auth.uid())::text)
        or (public.current_ihms_role() = 'patient' and owner_id = (select auth.uid())::text)
      when 'attendance' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() = 'admin'
      when 'leaves' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() in ('admin', 'manager')
      when 'expenses' then public.current_ihms_role() = 'admin'
      else false
    end
  )
  with check (
    case record_type
      when 'appointments' then
        public.current_ihms_role() in ('admin', 'receptionist')
        or (public.current_ihms_role() = 'doctor' and doctor_id = (select auth.uid())::text)
        or (public.current_ihms_role() = 'patient' and owner_id = (select auth.uid())::text)
      when 'attendance' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() = 'admin'
      when 'leaves' then
        owner_id = (select auth.uid())::text
        or public.current_ihms_role() in ('admin', 'manager')
      when 'expenses' then public.current_ihms_role() = 'admin'
      else false
    end
  );

create policy "Delete permitted hospital records"
  on public.ihms_records for delete to authenticated
  using (
    case record_type
      when 'appointments' then public.current_ihms_role() = 'admin'
      when 'attendance' then public.current_ihms_role() = 'admin'
      when 'leaves' then public.current_ihms_role() = 'admin'
      when 'expenses' then public.current_ihms_role() = 'admin'
      else false
    end
  );

create or replace function public.ihms_attendance_shift_end(
  p_clock_in_at timestamptz,
  p_shift text default null
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_start_time time without time zone;
  v_shift text := p_shift;
begin
  if p_clock_in_at is null then return null; end if;
  v_local_start := p_clock_in_at at time zone 'Asia/Kolkata';
  v_start_time := v_local_start::time;

  -- Current roster: one General Shift, 09:00–22:00 Asia/Kolkata, with lunch 13:00–14:00.
  -- Clock-in can open from 08:30, but scheduled checkout is always fixed at 22:00.
  if v_shift = 'general' and v_start_time >= time '08:30' and v_start_time < time '22:00' then
    v_local_end := v_local_start::date + time '22:00';
  -- Preserve saved legacy shift end behavior when closing records opened before the one-shift migration.
  elsif v_shift = 'morning' and v_start_time >= time '08:30' and v_start_time < time '17:00' then
    v_local_end := v_local_start::date + time '17:00';
  elsif v_shift = 'evening' and v_start_time >= time '13:30' and v_start_time < time '22:00' then
    v_local_end := v_local_start::date + time '22:00';
  elsif v_shift = 'night' and (v_start_time >= time '21:30' or v_start_time < time '06:00') then
    v_local_end := case
      when v_start_time < time '06:00' then v_local_start::date + time '06:00'
      else (v_local_start::date + 1) + time '06:00'
    end;
  -- Legacy records with no valid snapshot get a bounded conservative fallback; don't create a
  -- 16-hour record merely because a historic shift label no longer matches the current roster.
  elsif v_start_time >= time '08:30' and v_start_time < time '13:30' then
    v_local_end := v_local_start::date + time '17:00';
  elsif v_start_time >= time '13:30' and v_start_time < time '22:00' then
    v_local_end := v_local_start::date + time '22:00';
  elsif v_start_time >= time '05:30' and v_start_time < time '08:30' then
    v_local_end := v_local_start::date + time '14:00';
  elsif v_start_time < time '06:00' then
    v_local_end := v_local_start::date + time '06:00';
  else
    v_local_end := (v_local_start::date + 1) + time '06:00';
  end if;

  if v_local_end <= v_local_start then
    return null;
  end if;
  return v_local_end at time zone 'Asia/Kolkata';
end;
$$;

create or replace function public.ihms_attendance_expected_end(p_payload jsonb)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clock_in timestamptz;
  v_saved_end timestamptz;
begin
  -- Treat malformed historical payload values as missing rather than allowing one record to
  -- abort the entire scheduled checkout batch.
  begin
    if coalesce(p_payload ->> 'clockInAt', '') !~ '^\d{4}-\d{2}-\d{2}T' then return null; end if;
    v_clock_in := (p_payload ->> 'clockInAt')::timestamptz;
  exception when others then
    return null;
  end;

  begin
    if coalesce(p_payload ->> 'shiftEndAt', '') ~ '^\d{4}-\d{2}-\d{2}T' then
      v_saved_end := (p_payload ->> 'shiftEndAt')::timestamptz;
    else
      v_saved_end := null;
    end if;
  exception when others then
    v_saved_end := null;
  end;

  -- Accept saved ends up to the General Shift's 13.5-hour maximum (08:30 early arrival to 22:00).
  -- Historical shorter shifts remain valid and retain their saved end timestamp.
  if v_saved_end is not null
    and v_saved_end > v_clock_in
    and v_saved_end <= v_clock_in + interval '13 hours 30 minutes'
  then
    return v_saved_end;
  end if;

  return public.ihms_attendance_shift_end(v_clock_in, p_payload ->> 'shift');
exception when others then
  -- A single corrupt legacy attendance row must never prevent other rows from closing.
  return null;
end;
$$;

create or replace function public.ihms_attendance_working_hours(
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_deduct_lunch_break boolean default true
)
returns numeric
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_last_day date;
  v_lunch_start timestamptz;
  v_lunch_end timestamptz;
  v_overlap_seconds numeric := 0;
  v_elapsed_seconds numeric;
begin
  if p_clock_in_at is null or p_clock_out_at is null or p_clock_out_at <= p_clock_in_at then
    return 0;
  end if;

  v_elapsed_seconds := extract(epoch from (p_clock_out_at - p_clock_in_at));
  -- Do not retroactively change hours for attendance rows created under an earlier shift policy.
  if not coalesce(p_deduct_lunch_break, true) then
    return round(greatest(v_elapsed_seconds, 0)::numeric / 3600, 2);
  end if;

  v_day := (p_clock_in_at at time zone 'Asia/Kolkata')::date;
  v_last_day := (p_clock_out_at at time zone 'Asia/Kolkata')::date;
  while v_day <= v_last_day loop
    v_lunch_start := ((v_day + time '13:00') at time zone 'Asia/Kolkata');
    v_lunch_end := ((v_day + time '14:00') at time zone 'Asia/Kolkata');
    v_overlap_seconds := v_overlap_seconds + greatest(
      extract(epoch from (least(p_clock_out_at, v_lunch_end) - greatest(p_clock_in_at, v_lunch_start))),
      0
    );
    v_day := v_day + 1;
  end loop;

  return round(greatest(v_elapsed_seconds - v_overlap_seconds, 0)::numeric / 3600, 2);
end;
$$;

revoke all on function public.ihms_attendance_shift_end(timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.ihms_attendance_expected_end(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ihms_attendance_working_hours(timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;

create or replace function public.guard_ihms_record_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.ihms_role := public.current_ihms_role();
  old_charge_total numeric := 0;
  new_charge_total numeric := 0;
  base_fee numeric := 0;
  clock_in_time timestamptz;
  clock_out_time timestamptz;
  v_auto_checkout boolean := coalesce(current_setting('ihms.auto_checkout', true) = 'on', false)
    and (
      coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin')
    );
  v_local_start timestamp without time zone;
  v_shift text;
  actor_name text;
begin
  if old.record_type = 'attendance' and v_auto_checkout then
    if new.record_type <> old.record_type
      or new.record_id <> old.record_id
      or new.owner_id is distinct from old.owner_id
      or new.doctor_id is distinct from old.doctor_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Automatic checkout cannot change attendance identity';
    end if;
    if old.payload ->> 'clockOutAt' is not null or old.payload ->> 'clockOut' is not null then
      raise exception 'Attendance is already checked out';
    end if;
    if (new.payload - 'clockOut' - 'clockOutAt' - 'hoursWorked' - 'notes')
        <> (old.payload - 'clockOut' - 'clockOutAt' - 'hoursWorked' - 'notes') then
      raise exception 'Automatic checkout cannot change attendance ownership or shift fields';
    end if;
    clock_in_time := nullif(old.payload ->> 'clockInAt', '')::timestamptz;
    clock_out_time := public.ihms_attendance_expected_end(old.payload);
    if clock_in_time is null or clock_in_time > now() or clock_out_time is null
      or clock_out_time > now() or clock_out_time < clock_in_time then
      raise exception 'Attendance is not due for a valid automatic checkout';
    end if;
    v_local_start := clock_in_time at time zone 'Asia/Kolkata';
    v_shift := case
      when old.payload ->> 'shift' = 'general'
        and v_local_start::time >= time '08:30' and v_local_start::time < time '22:00' then 'general'
      when v_local_start::time < time '05:30' or v_local_start::time >= time '22:00' then 'night'
      when v_local_start::time < time '13:30' then 'morning'
      else 'evening'
    end;
    -- Preserve the shift captured when attendance was opened, including historical records.
    if (old.payload ->> 'shift' = 'general'
        and v_local_start::time >= time '08:30' and v_local_start::time < time '22:00')
      or (old.payload ->> 'shift' = 'morning'
        and v_local_start::time >= time '05:30' and v_local_start::time < time '17:00')
      or (old.payload ->> 'shift' = 'evening'
        and v_local_start::time >= time '13:30' and v_local_start::time < time '22:00')
      or (old.payload ->> 'shift' = 'night'
        and (v_local_start::time >= time '21:30' or v_local_start::time < time '06:00')) then
      v_shift := old.payload ->> 'shift';
    end if;
    new.payload := jsonb_set(old.payload, '{shift}', to_jsonb(v_shift), true);
    new.payload := jsonb_set(new.payload, '{shiftEndAt}', to_jsonb(clock_out_time), true);
    new.payload := jsonb_set(new.payload, '{clockOut}', to_jsonb(to_char(clock_out_time at time zone 'Asia/Kolkata', 'HH12:MI AM')), true);
    new.payload := jsonb_set(new.payload, '{clockOutAt}', to_jsonb(clock_out_time), true);
    new.payload := jsonb_set(
      new.payload,
      '{hoursWorked}',
      to_jsonb(public.ihms_attendance_working_hours(
        clock_in_time,
        clock_out_time,
        coalesce(old.payload ->> 'shift' = 'general', false)
      )),
      true
    );
    new.payload := jsonb_set(new.payload, '{notes}', to_jsonb(concat_ws(' | ', nullif(old.payload ->> 'notes', ''), 'Automatically checked out at assigned shift end')), true);
    new.updated_at := now();
    return new;
  end if;

  if actor_role = 'admin' then
    new.updated_at := now();
    return new;
  end if;

  if new.record_type <> old.record_type
    or new.record_id <> old.record_id
    or new.owner_id is distinct from old.owner_id
    or new.doctor_id is distinct from old.doctor_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Record ownership and identity cannot be changed';
  end if;


  if old.record_type = 'appointments' then
    if actor_role = 'patient' then
      if old.owner_id is distinct from (select auth.uid())::text
        or (to_jsonb(new) - 'payload' - 'updated_at')
          <> (to_jsonb(old) - 'payload' - 'updated_at')
        or (new.payload - 'followUpStatus') <> (old.payload - 'followUpStatus')
        or coalesce(old.payload ->> 'followUpStatus', 'pending') is distinct from 'pending'
        or new.payload ->> 'followUpStatus' is null
        or new.payload ->> 'followUpStatus' not in ('booked', 'skipped')
      then
        raise exception 'Patients may only update their own follow-up choice';
      end if;
    elsif actor_role = 'doctor' then
      if not (
        (coalesce(old.payload ->> 'status', 'scheduled'), coalesce(new.payload ->> 'status', '')) in
          (('scheduled', 'in_consultation'), ('waiting', 'in_consultation'), ('in_consultation', 'completed'), ('in_consultation', 'in_consultation'), ('completed', 'completed'))
      ) then
        raise exception 'Invalid doctor appointment status transition';
      end if;
      if coalesce(old.payload ->> 'status', 'scheduled') in ('scheduled', 'waiting')
        and new.payload ->> 'status' = 'in_consultation'
        and coalesce(old.payload ->> 'type', '') <> 'walk_in'
      then
        if coalesce(old.payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
          or coalesce(old.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):(00|15|30|45) [AP]M$'
        then
          raise exception 'Appointment date or slot is invalid';
        end if;
        if (
          old.payload ->> 'date'
        )::date > (now() at time zone 'Asia/Kolkata')::date
          or (
            (
              (old.payload ->> 'date')::date
              + make_time(
                split_part(split_part(old.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer % 12
                  + case when split_part(old.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end,
                split_part(split_part(old.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer,
                0
              )
            ) at time zone 'Asia/Kolkata'
          ) > now()
        then
          raise exception 'Consultations cannot start before the appointment time';
        end if;
      end if;
      if old.doctor_id <> (select auth.uid())::text
        or (to_jsonb(new) - 'payload' - 'updated_at')
          <> (to_jsonb(old) - 'payload' - 'updated_at')
        or (new.payload - 'status' - 'medicalCharges' - 'feeAmount' - 'billingApproved')
          <> (old.payload - 'status' - 'medicalCharges' - 'feeAmount' - 'billingApproved')
        or (
          coalesce(new.payload -> 'billingApproved', 'true'::jsonb)
            is distinct from coalesce(old.payload -> 'billingApproved', 'true'::jsonb)
          and coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)
            is not distinct from coalesce(old.payload -> 'medicalCharges', '[]'::jsonb)
          and new.payload -> 'feeAmount' is not distinct from old.payload -> 'feeAmount'
        )
        or coalesce(new.payload ->> 'status', '') not in ('in_consultation', 'completed')
      then
        raise exception 'Doctors may only update their assigned consultations';
      end if;
      if coalesce(old.payload ->> 'feeCollected', 'false') = 'true'
        and (
          coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)
            is distinct from coalesce(old.payload -> 'medicalCharges', '[]'::jsonb)
          or new.payload -> 'feeAmount' is distinct from old.payload -> 'feeAmount'
        )
      then
        raise exception 'Medical charges cannot be changed after fee collection';
      end if;
      if jsonb_typeof(coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)) is distinct from 'array'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)) as charges(charge)
          where jsonb_typeof(charge) is distinct from 'object'
            or btrim(coalesce(charge ->> 'name', '')) = ''
            or length(btrim(coalesce(charge ->> 'name', ''))) > 120
            or coalesce(charge ->> 'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
            or (charge ->> 'amount')::numeric <= 0
        )
      then
        raise exception 'Medical charges must have a name and a positive amount';
      end if;
      if coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)
          is distinct from coalesce(old.payload -> 'medicalCharges', '[]'::jsonb)
        or new.payload -> 'feeAmount' is distinct from old.payload -> 'feeAmount'
      then
        new.payload := jsonb_set(new.payload, '{billingApproved}', 'false'::jsonb, true);
        select coalesce(sum((charge ->> 'amount')::numeric), 0)
        into old_charge_total
        from jsonb_array_elements(coalesce(old.payload -> 'medicalCharges', '[]'::jsonb)) as charges(charge);
        select coalesce(sum((charge ->> 'amount')::numeric), 0)
        into new_charge_total
        from jsonb_array_elements(coalesce(new.payload -> 'medicalCharges', '[]'::jsonb)) as charges(charge);
        base_fee := coalesce((old.payload ->> 'feeAmount')::numeric, 650) - old_charge_total;
        if base_fee <= 0
          or coalesce(new.payload ->> 'feeAmount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
          or (new.payload ->> 'feeAmount')::numeric <> base_fee + new_charge_total
        then
          raise exception 'Appointment total must equal the base fee plus the listed medical charges';
        end if;
      end if;
    elsif actor_role = 'receptionist' then
      if coalesce(new.payload ->> 'feeCollected', 'false') = 'true'
        and coalesce(old.payload ->> 'status', '') <> 'completed'
      then
        raise exception 'Fees can only be collected after the consultation is completed';
      end if;
      if not (
        (coalesce(old.payload ->> 'status', 'scheduled'), coalesce(new.payload ->> 'status', '')) in
          (('scheduled', 'waiting'), ('waiting', 'in_consultation'), ('cancelled', 'cancelled'), ('completed', 'completed'), ('scheduled', 'scheduled'), ('waiting', 'waiting'), ('in_consultation', 'in_consultation'), ('cancelled', 'cancelled'))
      ) then
        raise exception 'Invalid receptionist appointment status transition';
      end if;
      if (to_jsonb(new) - 'payload' - 'updated_at')
          <> (to_jsonb(old) - 'payload' - 'updated_at')
        or (new.payload - 'status' - 'feeCollected' - 'paymentMethod' - 'paidAt' - 'billingApproved')
          <> (old.payload - 'status' - 'feeCollected' - 'paymentMethod' - 'paidAt' - 'billingApproved')
        or coalesce(new.payload ->> 'status', '') not in (
          'scheduled', 'waiting', 'in_consultation', 'completed', 'cancelled'
        )
        or coalesce(new.payload ->> 'feeCollected', '') not in ('true', 'false')
        or (
          old.payload ->> 'feeCollected' = 'true'
          and (
            new.payload ->> 'feeCollected' is distinct from old.payload ->> 'feeCollected'
            or new.payload ->> 'paymentMethod' is distinct from old.payload ->> 'paymentMethod'
            or new.payload ->> 'paidAt' is distinct from old.payload ->> 'paidAt'
          )
        )
        or (
          new.payload ->> 'feeCollected' = 'true'
          and (
            coalesce(new.payload ->> 'paymentMethod', '') not in ('Cash', 'Card', 'UPI')
            or new.payload ->> 'paidAt' is null
            or coalesce(new.payload ->> 'billingApproved', 'true') <> 'true'
          )
        )
        or (
          coalesce(new.payload ->> 'billingApproved', 'true')
            is distinct from coalesce(old.payload ->> 'billingApproved', 'true')
          and (
            coalesce(old.payload ->> 'feeCollected', 'false') <> 'false'
            or new.payload ->> 'feeCollected' <> 'true'
            or new.payload ->> 'billingApproved' <> 'true'
          )
        )
      then
        raise exception 'Reception may only update queue and payment fields';
      end if;
    else
      raise exception 'Role cannot update appointments';
    end if;
  elsif old.record_type = 'attendance' then
    if actor_role not in ('doctor', 'manager', 'receptionist', 'nurse', 'cleaner', 'ward_boy', 'other')
      or old.owner_id <> (select auth.uid())::text
      or (new.payload - 'clockOut' - 'clockOutAt' - 'hoursWorked' - 'notes')
        <> (old.payload - 'clockOut' - 'clockOutAt' - 'hoursWorked' - 'notes')
      or old.payload ->> 'clockOutAt' is not null
    then
      raise exception 'Staff may only update their own clock-out details';
    end if;
    clock_in_time := nullif(old.payload ->> 'clockInAt', '')::timestamptz;
    if clock_in_time is null or clock_in_time > now() then
      raise exception 'The shift has no valid clock-in timestamp';
    end if;
    clock_out_time := least(
      now(),
      coalesce(nullif(old.payload ->> 'shiftEndAt', '')::timestamptz, now())
    );
    new.payload := jsonb_set(
      new.payload,
      '{clockOut}',
      to_jsonb(to_char(clock_out_time at time zone 'Asia/Kolkata', 'HH12:MI AM')),
      true
    );
    new.payload := jsonb_set(new.payload, '{clockOutAt}', to_jsonb(clock_out_time), true);
    new.payload := jsonb_set(
      new.payload,
      '{hoursWorked}',
      to_jsonb(public.ihms_attendance_working_hours(clock_in_time, clock_out_time, coalesce(old.payload ->> 'shift' = 'general', false))),
      true
    );
  elsif old.record_type = 'leaves' then
    if actor_role <> 'manager'
      or old.owner_id = (select auth.uid())::text
      or old.payload ->> 'status' is distinct from 'pending'
      or coalesce(new.payload ->> 'status', '') not in ('approved', 'rejected')
      or (new.payload - 'status' - 'reviewedBy')
        <> (old.payload - 'status' - 'reviewedBy')
    then
      raise exception 'Managers may only approve or reject pending leave requests';
    end if;
    select name into actor_name
    from public.profiles
    where id = (select auth.uid());
    new.payload := jsonb_set(new.payload, '{reviewedBy}', to_jsonb(actor_name), true);
  else
    raise exception 'Role cannot update this record type';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_ihms_record_update on public.ihms_records;
create trigger guard_ihms_record_update
  before update on public.ihms_records
  for each row execute procedure public.guard_ihms_record_update();

create or replace function public.save_ihms_consultation(
  p_record_id text,
  p_payload jsonb,
  p_prescription_payload jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  appointment_owner_id text;
  appointment_doctor_id text;
begin
  if public.current_ihms_role() is distinct from 'doctor'
    or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload ->> 'id' is distinct from p_record_id
    or (
      p_prescription_payload is not null
      and jsonb_typeof(p_prescription_payload) is distinct from 'object'
    )
  then
    raise exception 'Invalid consultation update';
  end if;

  update public.ihms_records
  set payload = p_payload
  where record_type = 'appointments'
    and record_id = p_record_id
    and doctor_id = (select auth.uid())::text
  returning owner_id, doctor_id
  into appointment_owner_id, appointment_doctor_id;

  if not found then
    raise exception 'Assigned appointment was not found or cannot be updated';
  end if;

  if p_prescription_payload is null then
    delete from public.ihms_prescriptions
    where appointment_id = p_record_id
      and doctor_id = appointment_doctor_id;
  else
    insert into public.ihms_prescriptions (
      appointment_id,
      patient_id,
      doctor_id,
      payload
    )
    values (
      p_record_id,
      appointment_owner_id,
      appointment_doctor_id,
      p_prescription_payload
    )
    on conflict (appointment_id) do update
    set payload = excluded.payload,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.save_ihms_consultation(text, jsonb, jsonb) from public, anon;
grant execute on function public.save_ihms_consultation(text, jsonb, jsonb) to authenticated;

create or replace function public.prepare_ihms_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.ihms_role := public.current_ihms_role();
  actor_profile public.profiles%rowtype;
  clinician public.profiles%rowtype;
  appointment_payload jsonb;
  source_prescription_payload jsonb;
  v_slot_hour integer;
  v_slot_minute integer;
  v_slot_minutes integer;
  v_doctor_shift text;
  v_attendance_shift text;
  v_local_now timestamp without time zone;
begin
  select * into actor_profile
  from public.profiles
  where id = (select auth.uid());

  if new.record_id is distinct from (new.payload ->> 'id') then
    raise exception 'Record id must match the payload id';
  end if;

  if new.record_type = 'appointments' then
    if new.owner_id is null
      or new.owner_id is distinct from new.payload ->> 'patientId'
      or new.doctor_id is distinct from new.payload ->> 'doctorId'
    then
      raise exception 'Appointment ownership and doctor assignment must match the record';
    end if;

    select * into clinician
    from public.profiles
    where id::text = new.doctor_id
      and role = 'doctor'
      and coalesce(details ->> 'status', 'active') = 'active';
    if not found then raise exception 'The selected doctor is not active'; end if;

    if coalesce(new.payload ->> 'type', '') in ('online_booking', 'follow_up') then
      if coalesce(new.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):(00|15|30|45) [AP]M$' then
        raise exception 'Appointment time must use a valid 15-minute slot';
      end if;
      v_slot_hour := split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer;
      v_slot_minute := split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer;
      v_slot_minutes := ((v_slot_hour % 12) + case when split_part(new.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end) * 60 + v_slot_minute;
      v_doctor_shift := coalesce(clinician.details ->> 'shift', 'unassigned');
      if v_doctor_shift <> 'general'
        or v_slot_minutes < 540 or v_slot_minutes >= 1320
        or (v_slot_minutes >= 780 and v_slot_minutes < 840) then
        raise exception 'Selected appointment slot is outside General Shift hours or during the lunch break';
      end if;
    end if;

    new.payload := jsonb_set(new.payload, '{doctorName}', to_jsonb(clinician.name), true);
    new.payload := jsonb_set(
      new.payload,
      '{department}',
      coalesce(clinician.details -> 'department', to_jsonb('Outpatient Clinic'::text)),
      true
    );

    if actor_role = 'patient' then
      if new.owner_id is distinct from (select auth.uid())::text then
        raise exception 'Patients may only book appointments for themselves';
      end if;
      if coalesce(new.payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Appointment date is invalid';
      end if;
      if (new.payload ->> 'date')::date < (now() at time zone 'Asia/Kolkata')::date
        or new.payload ->> 'timeSlot' is null
        or coalesce(new.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):(00|15|30|45) [AP]M$'
        or new.payload ->> 'type' is null
        or new.payload ->> 'type' not in ('online_booking', 'follow_up')
      then
        raise exception 'Appointment date, slot, or type is invalid';
      end if;
      if (new.payload ->> 'date')::date = (now() at time zone 'Asia/Kolkata')::date
        and (
          (
            (new.payload ->> 'date')::date
            + make_time(
              split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer % 12
                + case when split_part(new.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end,
              split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer,
              0
            )
          ) at time zone 'Asia/Kolkata'
        ) <= now()
      then
        raise exception 'Appointment time slot has already passed';
      end if;
      new.payload := jsonb_set(new.payload, '{patientName}', to_jsonb(actor_profile.name), true);
      new.payload := jsonb_set(new.payload, '{patientEmail}', to_jsonb(actor_profile.email), true);
      new.payload := jsonb_set(new.payload, '{patientPhone}', to_jsonb(actor_profile.phone), true);
      new.payload := jsonb_set(
        new.payload,
        '{patientAge}',
        coalesce(actor_profile.details -> 'age', 'null'::jsonb),
        true
      );
      new.payload := jsonb_set(
        new.payload,
        '{patientGender}',
        coalesce(actor_profile.details -> 'gender', 'null'::jsonb),
        true
      );
      new.payload := jsonb_set(
        new.payload,
        '{patientBloodGroup}',
        coalesce(actor_profile.details -> 'bloodGroup', 'null'::jsonb),
        true
      );
      new.payload := jsonb_set(
        new.payload,
        '{feeAmount}',
        to_jsonb(case when new.payload ->> 'type' = 'follow_up' then 500 else 650 end),
        true
      );
      new.payload := jsonb_set(new.payload, '{feeCollected}', 'false'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{billingApproved}', 'true'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{status}', '"scheduled"'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{followUpStatus}', '"pending"'::jsonb, true);
      new.payload := new.payload - 'paymentMethod' - 'paidAt';
      if new.payload ->> 'type' = 'follow_up' then
        select a.payload into appointment_payload
        from public.ihms_records a
        where a.record_type = 'appointments'
          and a.record_id = new.payload ->> 'followUpForAppointmentId'
          and a.owner_id = (select auth.uid())::text
          and a.doctor_id = new.doctor_id;
        if not found then
          raise exception 'Follow-up must refer to the patient appointment with the same doctor';
        end if;
        select p.payload into source_prescription_payload
        from public.ihms_prescriptions p
        where p.appointment_id = new.payload ->> 'followUpForAppointmentId'
          and p.patient_id = (select auth.uid())::text
          and p.doctor_id = new.doctor_id;
        if not found
          or source_prescription_payload ->> 'followUpDate' is distinct from new.payload ->> 'date'
        then
          raise exception 'Follow-up must use the date recommended by the doctor';
        end if;
      end if;
    elsif actor_role in ('admin', 'receptionist') then
      if coalesce(new.payload ->> 'type', '') not in ('walk_in', 'online_booking')
        or btrim(coalesce(new.payload ->> 'patientName', '')) = ''
        or coalesce(new.payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      then
        raise exception 'Staff appointment details are invalid';
      end if;
      if (new.payload ->> 'date')::date < (now() at time zone 'Asia/Kolkata')::date then
        raise exception 'Appointments cannot be created for a past date';
      end if;
      if new.payload ->> 'type' = 'walk_in' then
        if (new.payload ->> 'date')::date <> (now() at time zone 'Asia/Kolkata')::date
          or coalesce(new.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):[0-5]\d [AP]M$'
          or coalesce(new.payload ->> 'status', '') <> 'waiting'
        then
          raise exception 'Walk-in appointment details are invalid';
        end if;
        if coalesce(new.payload ->> 'patientPhone', '') !~ '^[6-9][0-9]{9}$' then
          raise exception 'Walk-in patient phone must be a valid 10-digit Indian mobile number';
        end if;
        if not exists (
          select 1 from public.profiles
          where id::text = new.owner_id and role = 'patient'
        ) and coalesce(new.owner_id, '') !~ '^walkin-.+' then
          raise exception 'Walk-in appointments must belong to a patient or an identified walk-in';
        end if;
      else
        if coalesce(new.payload ->> 'timeSlot', '') !~ '^(0[1-9]|1[0-2]):(00|15|30|45) [AP]M$'
          or coalesce(new.payload ->> 'status', '') <> 'scheduled'
        then
          raise exception 'Booked appointment details are invalid';
        end if;
        if (new.payload ->> 'date')::date = (now() at time zone 'Asia/Kolkata')::date
          and (
            (
              (new.payload ->> 'date')::date
              + make_time(
                split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 1)::integer % 12
                  + case when split_part(new.payload ->> 'timeSlot', ' ', 2) = 'PM' then 12 else 0 end,
                split_part(split_part(new.payload ->> 'timeSlot', ' ', 1), ':', 2)::integer,
                0
              )
            ) at time zone 'Asia/Kolkata'
          ) <= now()
        then
          raise exception 'Appointment time slot has already passed';
        end if;
        if not exists (
          select 1 from public.profiles
          where id::text = new.owner_id and role = 'patient'
        ) and coalesce(new.owner_id, '') !~ '^walkin-.+' then
          raise exception 'Booked appointments must belong to an existing patient';
        end if;
      end if;
      new.payload := jsonb_set(new.payload, '{patientName}', to_jsonb(btrim(new.payload ->> 'patientName')), true);
      if new.payload ->> 'type' = 'online_booking' then
        select * into clinician
        from public.profiles
        where id::text = new.owner_id and role = 'patient';
        if found then
          new.payload := jsonb_set(new.payload, '{patientName}', to_jsonb(clinician.name), true);
          new.payload := jsonb_set(new.payload, '{patientEmail}', to_jsonb(clinician.email), true);
          new.payload := jsonb_set(new.payload, '{patientPhone}', to_jsonb(clinician.phone), true);
        end if;
      end if;
      new.payload := jsonb_set(new.payload, '{feeAmount}', to_jsonb(650), true);
      new.payload := jsonb_set(new.payload, '{feeCollected}', 'false'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{billingApproved}', 'true'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{followUpStatus}', '"pending"'::jsonb, true);
      new.payload := new.payload - 'paymentMethod' - 'paidAt';
    elsif new.owner_id = actor_profile.id::text then
      new.payload := jsonb_set(new.payload, '{patientName}', to_jsonb(actor_profile.name), true);
    else
      select * into clinician
      from public.profiles
      where id::text = new.owner_id and role = 'patient';
      if found then
        new.payload := jsonb_set(new.payload, '{patientName}', to_jsonb(clinician.name), true);
        new.payload := jsonb_set(new.payload, '{patientEmail}', to_jsonb(clinician.email), true);
        new.payload := jsonb_set(new.payload, '{patientPhone}', to_jsonb(clinician.phone), true);
      end if;
    end if;

    if length(btrim(coalesce(new.payload ->> 'patientName', ''))) < 2
      or length(btrim(coalesce(new.payload ->> 'patientName', ''))) > 80
      or btrim(coalesce(new.payload ->> 'patientName', '')) !~ '[[:alpha:]]' then
      raise exception 'Patient name must contain 2–80 characters and at least one letter';
    end if;
    if length(coalesce(new.payload ->> 'reasonForVisit', '')) > 500 then
      raise exception 'Visit reason must be 500 characters or fewer';
    end if;
    if nullif(new.payload ->> 'patientBloodGroup', '') is not null
      and new.payload ->> 'patientBloodGroup' not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
      raise exception 'Patient blood group is not a supported value';
    end if;
    if nullif(new.payload ->> 'patientAge', '') is not null then
      if new.payload ->> 'patientAge' !~ '^[0-9]{1,3}$' then
        raise exception 'Patient age must be a whole number from 1 to 120';
      end if;
      if (new.payload ->> 'patientAge')::integer < 1 or (new.payload ->> 'patientAge')::integer > 120 then
        raise exception 'Patient age must be a whole number from 1 to 120';
      end if;
    end if;
  elsif new.record_type in ('attendance', 'leaves') then
    if new.owner_id is distinct from (select auth.uid())::text
      or new.payload ->> 'staffId' is distinct from new.owner_id
    then
      raise exception 'Staff records must belong to the signed-in staff member';
    end if;
    if new.record_type = 'leaves' then
      if coalesce(new.payload ->> 'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(new.payload ->> 'endDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or btrim(coalesce(new.payload ->> 'reason', '')) = ''
      then
        raise exception 'Leave dates and reason are required';
      end if;
      if (new.payload ->> 'startDate')::date < (now() at time zone 'Asia/Kolkata')::date
        or (new.payload ->> 'endDate')::date < (new.payload ->> 'startDate')::date
      then
        raise exception 'Leave dates must be current or future and end on or after the start date';
      end if;
      new.payload := jsonb_set(new.payload, '{reason}', to_jsonb(btrim(new.payload ->> 'reason')), true);
    end if;
    new.payload := jsonb_set(new.payload, '{staffName}', to_jsonb(actor_profile.name), true);
    new.payload := jsonb_set(new.payload, '{role}', to_jsonb(actor_profile.role::text), true);
    if new.record_type = 'attendance' then
      v_local_now := now() at time zone 'Asia/Kolkata';
      v_attendance_shift := coalesce(actor_profile.details ->> 'shift', 'unassigned');
      if v_attendance_shift <> 'general' then
        raise exception 'The staff profile must use the General Shift schedule';
      end if;
      if not (v_local_now::time >= time '08:30' and v_local_now::time < time '22:00')
        or (v_local_now::time >= time '13:00' and v_local_now::time < time '14:00') then
        raise exception 'Clock-in is available from 08:30 AM to 10:00 PM, excluding the 01:00–02:00 PM lunch break';
      end if;
      perform pg_advisory_xact_lock(hashtextextended('attendance:' || new.owner_id, 0));
      if exists (
        select 1
        from public.ihms_records existing
        where existing.record_type = 'attendance'
          and existing.owner_id = new.owner_id
          and (
            existing.payload ->> 'date' = v_local_now::date::text
            or (existing.payload ->> 'clockOutAt' is null and existing.payload ->> 'clockOut' is null)
          )
      ) then
        raise exception 'Attendance has already been recorded today or a previous shift is still open';
      end if;
      new.payload := jsonb_set(new.payload, '{date}', to_jsonb(v_local_now::date::text), true);
      new.payload := jsonb_set(new.payload, '{clockIn}', to_jsonb(to_char(v_local_now, 'HH12:MI AM')), true);
      new.payload := jsonb_set(new.payload, '{clockInAt}', to_jsonb(now()), true);
      new.payload := jsonb_set(new.payload, '{shift}', to_jsonb(v_attendance_shift), true);
      new.payload := jsonb_set(new.payload, '{shiftEndAt}', to_jsonb(public.ihms_attendance_shift_end(now(), v_attendance_shift)), true);
      new.payload := jsonb_set(new.payload, '{hoursWorked}', '0'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{status}', '"present"'::jsonb, true);
      new.payload := new.payload - 'clockOut' - 'clockOutAt';
    else
      new.payload := jsonb_set(new.payload, '{status}', '"pending"'::jsonb, true);
      new.payload := jsonb_set(new.payload, '{appliedAt}', to_jsonb(now()::text), true);
    end if;
  elsif new.record_type = 'revenue' then
    select a.payload into appointment_payload
    from public.ihms_records a
    where a.record_type = 'appointments'
      and a.record_id = (new.payload ->> 'appointmentId');
    if not found
      or appointment_payload ->> 'feeCollected' is distinct from 'true'
      or coalesce((new.payload ->> 'amount')::numeric, 0)
        <> coalesce((appointment_payload ->> 'feeAmount')::numeric, 650)
      or (new.payload ->> 'paymentMethod')
        is distinct from (appointment_payload ->> 'paymentMethod')
    then
      raise exception 'Revenue must match a collected appointment fee';
    end if;
    new.payload := jsonb_set(new.payload, '{patientName}', appointment_payload -> 'patientName', true);
    new.payload := jsonb_set(new.payload, '{patientId}', appointment_payload -> 'patientId', true);
    new.payload := jsonb_set(
      new.payload,
      '{amount}',
      coalesce(appointment_payload -> 'feeAmount', '650'::jsonb),
      true
    );
    new.payload := jsonb_set(new.payload, '{collectedBy}', to_jsonb(actor_profile.name), true);
    new.payload := jsonb_set(
      new.payload,
      '{date}',
      to_jsonb(((now() at time zone 'Asia/Kolkata')::date)::text),
      true
    );
    new.payload := jsonb_set(
      new.payload,
      '{time}',
      to_jsonb(to_char(now() at time zone 'Asia/Kolkata', 'HH12:MI AM')),
      true
    );
  elsif new.record_type = 'expenses' then
    if coalesce((new.payload ->> 'amount')::numeric, 0) <= 0 then
      raise exception 'Expense amount must be greater than zero';
    end if;
    new.payload := jsonb_set(new.payload, '{approvedBy}', to_jsonb(actor_profile.name), true);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prepare_ihms_record_insert on public.ihms_records;
create trigger prepare_ihms_record_insert
  before insert on public.ihms_records
  for each row execute procedure public.prepare_ihms_record_insert();

-- Account status is an authoritative attendance rule, not just a disabled button.
-- Keep staff marked on leave from clocking in through direct API/database requests.
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

create or replace function public.record_ihms_appointment_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revenue_id text := 'rev-' || replace(gen_random_uuid()::text, '-', '');
begin
  if coalesce(old.payload ->> 'feeCollected', 'false') = 'false'
    and new.payload ->> 'feeCollected' = 'true'
  then
    insert into public.ihms_records (
      record_type,
      record_id,
      owner_id,
      doctor_id,
      payload
    )
    values (
      'revenue',
      revenue_id,
      null,
      null,
      jsonb_build_object(
        'id', revenue_id,
        'date', '',
        'time', '',
        'amount', coalesce(new.payload -> 'feeAmount', '650'::jsonb),
        'category', case
          when new.payload ->> 'type' = 'walk_in' then 'Walk-in Registration'
          else 'Consultation Fee'
        end,
        'patientName', new.payload -> 'patientName',
        'patientId', new.payload -> 'patientId',
        'paymentMethod', new.payload -> 'paymentMethod',
        'appointmentId', new.record_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_ihms_appointment_payment on public.ihms_records;
create trigger record_ihms_appointment_payment
  after update of payload on public.ihms_records
  for each row
  when (
    old.record_type = 'appointments'
    and new.record_type = 'appointments'
  )
  execute procedure public.record_ihms_appointment_payment();

grant select, insert, update, delete on public.ihms_records to authenticated;
grant select, insert, update, delete on public.ihms_prescriptions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ihms_records'
  ) then
    alter publication supabase_realtime add table public.ihms_records;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ihms_prescriptions'
  ) then
    alter publication supabase_realtime add table public.ihms_prescriptions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ihms_staff_directory_events'
  ) then
    alter publication supabase_realtime add table public.ihms_staff_directory_events;
  end if;
end;
$$;


-- Let a patient update only their own blood group without granting broad profile UPDATE rights.
create or replace function public.update_my_patient_blood_group(p_blood_group text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or public.current_ihms_role() is distinct from 'patient' then
    raise exception 'Only a signed-in patient can update this field';
  end if;
  if p_blood_group is not null
    and p_blood_group not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'Blood group is not a supported value';
  end if;

  update public.profiles
  set details = jsonb_set(
    coalesce(details, '{}'::jsonb),
    '{bloodGroup}',
    coalesce(to_jsonb(p_blood_group), 'null'::jsonb),
    true
  )
  where id = (select auth.uid()) and role = 'patient';
  if not found then
    raise exception 'Patient profile was not found';
  end if;
end;
$$;

revoke all on function public.update_my_patient_blood_group(text) from public, anon;
grant execute on function public.update_my_patient_blood_group(text) to authenticated;

-- Server-only shared rate limiting for sensitive account-provisioning endpoints.
-- The caller hashes IP/user identifiers before passing them; raw addresses are never stored.
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
revoke all on public.ihms_api_rate_limits from public;
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

  -- Keep the table bounded as old, inactive limiter buckets expire.
  delete from public.ihms_api_rate_limits
  where updated_at < v_now - interval '1 day';

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_ihms_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ihms_api_rate_limit(text, integer, integer) to service_role;

-- Called only by Supabase Cron (database role postgres) or a trusted service-role worker.
-- The trigger verifies the system context, recomputes the end timestamp, and writes the audit values.
create or replace function public.auto_checkout_due_ihms_attendance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_count integer := 0;
begin
  perform set_config('ihms.auto_checkout', 'on', true);
  for v_record in
    select r.record_id
    from public.ihms_records r
    where r.record_type = 'attendance'
      and r.payload ->> 'clockOutAt' is null
      and r.payload ->> 'clockOut' is null
      and public.ihms_attendance_expected_end(r.payload) <= now()
    order by public.ihms_attendance_expected_end(r.payload)
    for update skip locked
  loop
    update public.ihms_records
    set payload = payload
    where record_type = 'attendance' and record_id = v_record.record_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.auto_checkout_due_ihms_attendance() from public, anon, authenticated;
grant execute on function public.auto_checkout_due_ihms_attendance() to service_role;


-- Patient profile editing: controlled access to their own phone and demographic details.
create or replace function public.update_my_patient_profile(
  p_phone text,
  p_age integer,
  p_gender text,
  p_blood_group text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if (select auth.uid()) is null
    or public.current_ihms_role() is distinct from 'patient' then
    raise exception 'Only a signed-in patient can update this profile';
  end if;

  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number';
  end if;
  if p_age is not null and (p_age < 1 or p_age > 120) then
    raise exception 'Age must be between 1 and 120';
  end if;
  if p_gender is not null and p_gender not in ('Male', 'Female', 'Other') then
    raise exception 'Gender is not supported';
  end if;
  if p_blood_group is not null
    and p_blood_group not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'Blood group is not supported';
  end if;

  update public.profiles
  set phone = v_phone,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'age', p_age,
        'gender', p_gender,
        'bloodGroup', p_blood_group
      )
  where id = (select auth.uid())
    and role = 'patient';

  if not found then
    raise exception 'Patient profile was not found';
  end if;
end;
$$;

revoke all on function public.update_my_patient_profile(text, integer, text, text) from public, anon;
grant execute on function public.update_my_patient_profile(text, integer, text, text) to authenticated;

-- Synchronize a confirmed Supabase Auth email change into the application profile.
create or replace function public.sync_ihms_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    if new.email is null or btrim(new.email) = '' then
      raise exception 'A profile email address is required';
    end if;

    if exists (
      select 1 from public.profiles p
      where p.id = new.id and p.role = 'patient'
    ) and (
      length(new.email) > 254
      or lower(new.email) !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@gmail\.com$'
    ) then
      raise exception 'Patient email must be a valid Gmail address ending in @gmail.com';
    end if;

    update public.profiles
    set email = lower(new.email)
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute procedure public.sync_ihms_profile_email();
