create table if not exists public.ihms_demo_records (
  collection text not null,
  record_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, record_id)
);

create index if not exists ihms_demo_records_updated_at_idx
  on public.ihms_demo_records (updated_at desc);

create or replace function public.set_ihms_demo_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ihms_demo_records_updated_at
  on public.ihms_demo_records;

create trigger ihms_demo_records_updated_at
before update on public.ihms_demo_records
for each row execute function public.set_ihms_demo_record_updated_at();

alter table public.ihms_demo_records enable row level security;

revoke all on public.ihms_demo_records from anon, authenticated;
grant all on public.ihms_demo_records to service_role;
