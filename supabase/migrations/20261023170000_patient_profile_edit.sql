-- Allow a patient to edit only their own contact and demographic fields through
-- a narrow RPC, without granting direct UPDATE access to public.profiles.
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

-- Supabase Auth owns email changes and confirmation. When a confirmed email is
-- committed to auth.users, keep the related profile row synchronized here.
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
