create table if not exists public.ihms_demo_records (
  collection text not null,
  record_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, record_id)
);

create index if not exists ihms_demo_records_updated_at_idx
  on public.ihms_demo_records (updated_at desc);
