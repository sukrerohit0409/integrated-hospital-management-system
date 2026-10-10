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

create or replace function public.ihms_is_valid_consultation_slot(p_time_slot text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  slot_hour integer;
  slot_minute integer;
  slot_minutes integer;
begin
  if coalesce(p_time_slot, '') !~ '^(0[1-9]|1[0-2]):[0-5]\d [AP]M$' then
    return false;
  end if;

  slot_hour := split_part(split_part(p_time_slot, ' ', 1), ':', 1)::integer % 12;
  slot_minute := split_part(split_part(p_time_slot, ' ', 1), ':', 2)::integer;
  if split_part(p_time_slot, ' ', 2) = 'PM' then
    slot_hour := slot_hour + 12;
  end if;
  slot_minutes := slot_hour * 60 + slot_minute;

  -- The existing 30-minute slot interval and midday break remain unchanged.
  return slot_minutes >= 9 * 60
    and slot_minutes + 30 <= 22 * 60
    and mod(slot_minutes - 9 * 60, 30) = 0
    and not (slot_minutes > 12 * 60 and slot_minutes < 14 * 60);
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

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Hospital managers can read profiles" on public.profiles;
drop policy if exists "Staff can read the hospital directory" on public.profiles;
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

create policy "Staff can read the hospital directory"
  on public.profiles for select to authenticated
  using (
    (role = 'doctor' and coalesce(details ->> 'status', 'active') <> 'inactive')
    or public.current_ihms_role() in ('admin', 'receptionist')
    or (
      public.current_ihms_role() = 'manager'
      and role not in ('admin', 'patient')
    )
  );

create or replace function public.create_patient_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, phone, role, details)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'patient',
    jsonb_build_object(
      'age', case
        when new.raw_user_meta_data ->> 'age' ~ '^[0-9]{1,3}$'
        then (new.raw_user_meta_data ->> 'age')::integer
        else null
      end,
      'gender', new.raw_user_meta_data ->> 'gender'
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
  status text not null check (status in ('sending', 'sent', 'failed')),
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

  update public.ihms_email_notifications
  set recipient_email = p_recipient_email,
      status = 'sending',
      updated_at = now(),
      sent_at = null,
      provider_message_id = null
  where appointment_id = p_appointment_id
    and notification_type = 'appointment_confirmation'
    and (
      status = 'failed'
      or (status = 'sending' and updated_at < now() - interval '10 minutes')
    )
  returning true into claimed;

  return coalesce(claimed, false);
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
  actor_name text;
begin
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
          or not public.ihms_is_valid_consultation_slot(old.payload ->> 'timeSlot')
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
    clock_out_time := now();
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
      to_jsonb(round(greatest(extract(epoch from (clock_out_time - clock_in_time)), 0)::numeric / 3600, 2)),
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
        or not public.ihms_is_valid_consultation_slot(new.payload ->> 'timeSlot')
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
        if not exists (
          select 1 from public.profiles
          where id::text = new.owner_id and role = 'patient'
        ) and coalesce(new.owner_id, '') !~ '^walkin-.+' then
          raise exception 'Walk-in appointments must belong to a patient or an identified walk-in';
        end if;
      else
        if not public.ihms_is_valid_consultation_slot(new.payload ->> 'timeSlot')
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
      perform pg_advisory_xact_lock(hashtextextended(
        'attendance:' || new.owner_id || ':' || (now() at time zone 'Asia/Kolkata')::date::text,
        0
      ));
      if exists (
        select 1
        from public.ihms_records existing
        where existing.record_type = 'attendance'
          and existing.owner_id = new.owner_id
          and existing.payload ->> 'date' =
            ((now() at time zone 'Asia/Kolkata')::date)::text
      ) then
        raise exception 'Attendance has already been recorded for today';
      end if;
      new.payload := jsonb_set(
        new.payload,
        '{date}',
        to_jsonb(((now() at time zone 'Asia/Kolkata')::date)::text),
        true
      );
      new.payload := jsonb_set(
        new.payload,
        '{clockIn}',
        to_jsonb(to_char(now() at time zone 'Asia/Kolkata', 'HH12:MI AM')),
        true
      );
      new.payload := jsonb_set(new.payload, '{clockInAt}', to_jsonb(now()), true);
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
end;
$$;

-- Distributed atomic rate limiting table & RPC function
create table if not exists public.ihms_rate_limits (
  limiter_key text primary key,
  request_count integer not null default 1,
  first_request_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.ihms_rate_limits enable row level security;
revoke all on public.ihms_rate_limits from anon, authenticated, public;

create or replace function public.check_ihms_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_record public.ihms_rate_limits%rowtype;
begin
  if p_key is null or length(p_key) = 0 or p_max_requests <= 0 or p_window_seconds <= 0 then
    return true;
  end if;

  select * into v_record
  from public.ihms_rate_limits
  where limiter_key = p_key
  for update;

  if not found or v_record.expires_at <= v_now then
    insert into public.ihms_rate_limits (limiter_key, request_count, first_request_at, expires_at)
    values (p_key, 1, v_now, v_now + (p_window_seconds || ' seconds')::interval)
    on conflict (limiter_key) do update
      set request_count = 1,
          first_request_at = v_now,
          expires_at = v_now + (p_window_seconds || ' seconds')::interval;
    return true;
  end if;

  if v_record.request_count >= p_max_requests then
    return false;
  end if;

  update public.ihms_rate_limits
  set request_count = request_count + 1
  where limiter_key = p_key;

  return true;
end;
$$;

revoke all on function public.check_ihms_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_ihms_rate_limit(text, integer, integer) to authenticated, service_role;

