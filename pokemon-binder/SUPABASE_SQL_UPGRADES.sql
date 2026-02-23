-- Run this in Supabase SQL Editor

-- Layout slots (3x3 page)
create table if not exists binder_slots (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null references binders(id) on delete cascade,
  page int not null,
  row int not null,
  col int not null,
  owned_card_id uuid references owned_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(binder_id, page, row, col)
);

create index if not exists binder_slots_binder_page_idx
  on binder_slots(binder_id, page);

-- Optional: store page size on binder (defaults to 3x3)
alter table binders
  add column if not exists page_rows int default 3,
  add column if not exists page_cols int default 3;

-- TCGplayer pricing cache (cents)
alter table owned_cards
  add column if not exists tcgplayer_market_cents int,
  add column if not exists tcgplayer_low_cents int,
  add column if not exists tcgplayer_mid_cents int,
  add column if not exists tcgplayer_high_cents int,
  add column if not exists tcgplayer_updated_at timestamptz;
