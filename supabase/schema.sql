-- =====================================================================
-- Karigari / KalaMitra: database schema for Supabase
-- Run this in Supabase -> SQL Editor -> New query -> Run. It is the ONLY SQL file you need.
-- Safe to run again at any time.
--
-- Reconstructed from the app's code (the original schema was not included).
-- Tables from src/lib/supabase.ts are exact; the rest are inferred from how the
-- code reads and writes them. Safe to re-run (uses IF NOT EXISTS).
-- =====================================================================

-- pgvector (type is referenced unqualified; Supabase's search_path already includes the extensions schema)
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null default 'buyer' check (role in ('buyer','seller')),
  bio text,
  profile_image text,
  store_description text,
  upi_id text,
  address text,
  wishlist text[] default '{}',
  preferred_theme text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Simple login (does NOT use Supabase Auth)
-- Accounts live in app_users; RLS is ON with no policies, so only the server key can read
-- password hashes (they are never reachable with the public anon key).
-- ---------------------------------------------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;

-- If profiles already existed with a link to Supabase Auth users, remove that link.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles alter column id set default gen_random_uuid();

-- Same safety net for profiles.
alter table public.profiles
  add column if not exists bio text,
  add column if not exists profile_image text,
  add column if not exists store_description text,
  add column if not exists upi_id text,
  add column if not exists address text,
  add column if not exists wishlist text[] default '{}',
  add column if not exists preferred_theme text;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null default 'Other',
  description text not null default '',
  price numeric not null default 0,
  image_url text not null default '',
  product_story text,
  product_type text check (product_type in ('vertical','horizontal')),
  is_virtual boolean not null default false,
  virtual_type text,
  virtual_file_url text,
  additional_images text[],
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending','approved','rejected')),
  image_avg_r double precision,
  image_avg_g double precision,
  image_avg_b double precision,
  image_ahash text,
  embedding vector(384),   -- Xenova/all-MiniLM-L6-v2 = 384 dimensions
  created_at timestamptz not null default now()
);
-- If a products table already existed (from an earlier setup), make sure it has every column the app uses.
alter table public.products
  add column if not exists product_story text,
  add column if not exists product_type text,
  add column if not exists is_virtual boolean not null default false,
  add column if not exists virtual_type text,
  add column if not exists virtual_file_url text,
  add column if not exists additional_images text[],
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists image_avg_r double precision,
  add column if not exists image_avg_g double precision,
  add column if not exists image_avg_b double precision,
  add column if not exists image_ahash text,
  add column if not exists embedding vector(384);
create index if not exists products_seller_idx on public.products(seller_id);
create index if not exists products_category_idx on public.products(category);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  street text not null,
  city text not null,
  state text not null,
  zip text not null,
  phone text not null,
  type text not null default 'Home' check (type in ('Home','Work','Other')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cart (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists cart_buyer_idx on public.cart(buyer_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  order_reference text not null unique,
  total_amount numeric not null default 0,
  status text not null default 'pending',
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  quantity integer not null default 1,
  price numeric not null
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Auctions
-- ---------------------------------------------------------------------
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  starting_price numeric not null,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','running','completed','cancelled')),
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists bids_auction_idx on public.bids(auction_id, amount desc);

-- ---------------------------------------------------------------------
-- Personalisation, AI agents and activity
-- ---------------------------------------------------------------------
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  favorite_categories jsonb not null default '[]'::jsonb,
  top_viewed_products jsonb not null default '[]'::jsonb,
  common_search_terms jsonb not null default '[]'::jsonb,
  total_views integer not null default 0,
  total_searches integer not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  session_id text not null,
  role text not null check (role in ('user','assistant')),
  message text not null,
  query_context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists conversation_history_session_idx
  on public.conversation_history(user_id, session_id, created_at);

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null
    check (activity_type in ('view','search','add_to_cart','purchase','stall_view')),
  product_id uuid references public.products(id) on delete set null,
  query text,
  stall_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists user_activity_user_idx on public.user_activity(user_id, created_at desc);
create index if not exists user_activity_stall_idx on public.user_activity(stall_id);

-- ---------------------------------------------------------------------
-- Collaborations
-- ---------------------------------------------------------------------
create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','ended','cancelled')),
  message text,
  collaboration_name text,
  collaboration_description text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.collaboration_revenue_split (
  collaboration_id uuid primary key references public.collaborations(id) on delete cascade,
  initiator_percentage numeric not null default 50,
  partner_percentage numeric not null default 50,
  split_method text not null default 'equal' check (split_method in ('equal','custom','product_based')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborative_products (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary_seller_id uuid not null references public.profiles(id) on delete cascade,
  revenue_split_override jsonb,
  contribution_details text,
  created_at timestamptz not null default now()
);

create table if not exists public.collaboration_invitations (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.collaboration_activity (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in
    ('created','accepted','rejected','ended','cancelled','product_added','product_removed','split_updated','message_sent')),
  activity_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.revenue_split_proposals (
  id uuid primary key default gen_random_uuid(),
  collaborative_product_id uuid not null references public.collaborative_products(id) on delete cascade,
  collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  proposed_split jsonb not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- ---------------------------------------------------------------------
-- Social: followers, reels, chat
-- ---------------------------------------------------------------------
create table if not exists public.followers (
  user_id uuid not null references public.profiles(id) on delete cascade,      -- being followed
  follower_id uuid not null references public.profiles(id) on delete cascade,  -- the follower
  created_at timestamptz not null default now(),
  primary key (user_id, follower_id)
);

create table if not exists public.reel (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  video_url text not null,
  caption text not null default '',
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reel_comment (
  id bigint generated by default as identity primary key,
  reel_id bigint not null references public.reel(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reel_likes (
  reel_id bigint not null references public.reel(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm' check (type in ('dm','group')),
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  message_type text not null default 'text' check (message_type in ('text','image','audio')),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages(thread_id, created_at);

create table if not exists public.chat_message_status (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------
-- Gifts, donations, custom requests, stalls, schemes
-- ---------------------------------------------------------------------
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  status text not null default 'sent',
  viewed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.group_gifts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  target_amount numeric not null default 0,
  current_amount numeric not null default 0,
  message text not null default '',
  member_ids text[] not null default '{}',
  status text not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.group_gift_contributions (
  id uuid primary key default gen_random_uuid(),
  group_gift_id uuid not null references public.group_gifts(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null default 0,
  message text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  donor_email text not null,
  donor_phone text not null default '',
  item_description text not null,
  item_category text not null default '',
  image_urls text[] not null default '{}',
  pickup_address text not null default '',
  preferred_contact text not null default '',
  status text not null default 'new',
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null default '',
  ai_draft_url text,
  status text not null default 'Requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stall_customizations (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  stall_theme text not null default 'classic',
  welcome_message text not null default '',
  decor jsonb not null default '{}'::jsonb,
  featured_product_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.schemes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  link text,
  eligibility text,
  deadline text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.removebg_keys (
  id uuid primary key default gen_random_uuid(),
  api_key text not null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);
-- Holds third-party API keys: lock it down. Only the server (service role) can touch it.
alter table public.removebg_keys enable row level security;

-- ---------------------------------------------------------------------
-- Functions the app calls via supabase.rpc(...)
-- ---------------------------------------------------------------------
-- These accept the reel id as text and compare as text, so they work whether
-- reel.id is a number or a uuid in your database. (The app calls them with { reel_id: ... }.)
drop function if exists public.increment_reel_likes(bigint);
drop function if exists public.increment_reel_likes(uuid);
drop function if exists public.decrement_reel_likes(bigint);
drop function if exists public.decrement_reel_likes(uuid);

create or replace function public.increment_reel_likes(reel_id text)
returns void language sql as $$
  update public.reel r set likes = r.likes + 1 where r.id::text = increment_reel_likes.reel_id;
$$;

create or replace function public.decrement_reel_likes(reel_id text)
returns void language sql as $$
  update public.reel r set likes = greatest(r.likes - 1, 0) where r.id::text = decrement_reel_likes.reel_id;
$$;

-- Drop first so re-running never fails with "cannot change return type of existing function"
drop function if exists public.match_products(vector, double precision, integer);

-- Semantic product search (pgvector cosine similarity)
create or replace function public.match_products(
  query_embedding vector(384),
  match_threshold double precision,
  match_count integer
)
returns table (
  id uuid, seller_id uuid, title text, category text, description text, price numeric,
  image_url text, product_story text, product_type text, is_virtual boolean,
  virtual_type text, virtual_file_url text, additional_images text[],
  created_at timestamptz, similarity double precision
)
language sql stable
set search_path = public, extensions
as $$
  select p.id, p.seller_id, p.title, p.category, p.description, p.price,
         p.image_url, p.product_story, p.product_type, p.is_virtual,
         p.virtual_type, p.virtual_file_url, p.additional_images,
         p.created_at,
         1 - (p.embedding <=> query_embedding) as similarity
  from public.products p
  where p.embedding is not null
    and p.moderation_status <> 'rejected'
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

drop function if exists public.maintain_user_activity();

-- Nightly cleanup: fold activity older than 30 days into user_preferences totals, then delete it
create or replace function public.maintain_user_activity()
returns json language plpgsql as $$
declare
  deleted_count integer;
begin
  insert into public.user_preferences (user_id, total_views, total_searches)
  select user_id,
         count(*) filter (where activity_type in ('view','stall_view')),
         count(*) filter (where activity_type = 'search')
  from public.user_activity
  where created_at < now() - interval '30 days'
  group by user_id
  on conflict (user_id) do update
    set total_views = public.user_preferences.total_views + excluded.total_views,
        total_searches = public.user_preferences.total_searches + excluded.total_searches,
        last_updated = now();

  delete from public.user_activity where created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return json_build_object('deleted', deleted_count);
end; $$;

-- ---------------------------------------------------------------------
-- Storage buckets (public read; signed-in users upload)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('images','images',true), ('videos','videos',true)
on conflict (id) do update set public = true;

drop policy if exists "karigari_public_read" on storage.objects;
create policy "karigari_public_read" on storage.objects
  for select using (bucket_id in ('images','videos'));

drop policy if exists "karigari_images_upload" on storage.objects;
create policy "karigari_images_upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'images');   -- donors may upload without an account

drop policy if exists "karigari_videos_upload" on storage.objects;
create policy "karigari_videos_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos');

drop policy if exists "karigari_owner_update" on storage.objects;
create policy "karigari_owner_update" on storage.objects
  for update to authenticated using (bucket_id in ('images','videos') and owner = auth.uid());

-- ---------------------------------------------------------------------
-- NOTE ON ROW LEVEL SECURITY
-- Almost every API route in this app talks to Supabase with the public (anon) key
-- and no user session, so strict per-user RLS would break the app. Row Level Security
-- is therefore left OFF on the app tables (except removebg_keys above), which means
-- anyone holding your public anon key can read and write them. Fine for a demo;
-- before real users, move the API routes to the service-role key and enable RLS.
-- ---------------------------------------------------------------------
