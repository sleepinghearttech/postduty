-- Owner insights: first-party, cookieless traffic events and order attribution.
-- No IP address, user agent, name, email or phone is stored here. Location is the
-- coarse city/region/country Cloudflare derives per request; device is a 3-value class.
-- Applied to both production (unprefixed) and preview_ tables.

alter table public.checkout_intents add column if not exists attribution jsonb;
alter table public.preview_checkout_intents add column if not exists attribution jsonb;

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('page_view','product_view','add_to_cart','checkout_start')),
  session_id text not null check (session_id ~ '^[A-Za-z0-9_-]{8,40}$'),
  path text not null check (length(path) <= 200),
  storefront text check (storefront in ('general','christmas')),
  product_id uuid,
  source text check (length(source) <= 60),
  medium text check (length(medium) <= 60),
  campaign text check (length(campaign) <= 80),
  referrer_host text check (length(referrer_host) <= 120),
  landing_path text check (length(landing_path) <= 200),
  device text check (device in ('mobile','tablet','desktop')),
  country text check (length(country) <= 2),
  region text check (length(region) <= 80),
  city text check (length(city) <= 80)
);
create index if not exists site_events_created_at_idx on public.site_events (created_at);

create table if not exists public.preview_site_events (like public.site_events including all);

alter table public.site_events enable row level security;
alter table public.preview_site_events enable row level security;
revoke all on public.site_events, public.preview_site_events from anon, authenticated;
grant select, insert on public.site_events, public.preview_site_events to service_role;
